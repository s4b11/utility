use spin_sdk::http::{Params, Request, Response};
use spin_sdk::sqlite::Value;

use super::authorize;
use crate::{auth, db, models::LoginInput, security, totp};

/// POST /api/login
pub fn login(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    let input: LoginInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    let username = input.username.trim();
    if username.is_empty() {
        return Ok(security::error(401, "invalid_credentials"));
    }
    if auth::is_locked(&conn, username)? {
        return Ok(security::error(429, "too_many_attempts"));
    }

    let res = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?",
        &[Value::Text(username.to_string())],
    )?;
    let (user_id, ok) = match res.rows().next() {
        Some(r) => {
            let id = r.get::<i64>("id").unwrap_or(1);
            let hash = r.get::<&str>("password_hash").unwrap_or_default();
            (id, auth::verify_password(&input.password, hash))
        }
        None => (0, false),
    };

    if !ok {
        auth::record_failure(&conn, username)?;
        return Ok(security::error(401, "invalid_credentials"));
    }

    // Second factor (TOTP), if the owner has it enabled.
    let (secret_hex, totp_enabled) = db::get_user_totp(&conn)?;
    if totp_enabled {
        let code = input.totp.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let recovery = input.recovery.as_deref().map(str::trim).filter(|s| !s.is_empty());
        if code.is_none() && recovery.is_none() {
            return Ok(security::error(401, "totp_required"));
        }
        let mut second_ok = false;
        if let Some(code) = code {
            if let Ok(secret) = hex::decode(&secret_hex) {
                if !secret.is_empty() && totp::verify(&secret, code, db::now_secs(), 1) {
                    second_ok = true;
                }
            }
        }
        if !second_ok {
            if let Some(rc) = recovery {
                if db::consume_recovery_code(&conn, &totp::sha256_hex(rc))? {
                    second_ok = true;
                }
            }
        }
        if !second_ok {
            auth::record_failure(&conn, username)?;
            return Ok(security::error(401, "invalid_totp"));
        }
    }

    auth::record_success(&conn, username)?;
    let secure = auth::request_is_secure(&req);
    let (token, csrf) = auth::create_session(&conn, user_id, input.remember)?;
    let body = serde_json::json!({ "username": username, "csrf_token": csrf, "token": token }).to_string();
    Ok(security::json_with_cookie(
        200,
        body,
        &auth::session_cookie(&token, input.remember, secure),
    ))
}

/// POST /api/logout
pub fn logout(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    if let Some(raw) = auth::extract_session_token(&req) {
        auth::destroy_session(&conn, &raw)?;
    }
    let secure = auth::request_is_secure(&req);
    Ok(security::json_with_cookie(
        200,
        serde_json::json!({ "ok": true }).to_string(),
        &auth::clear_cookie(secure),
    ))
}

/// GET /api/me
pub fn me(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    let Some(session) = auth::require_session(&conn, &req)? else {
        return Ok(security::error(401, "unauthorized"));
    };
    let res = conn.execute(
        "SELECT username FROM users WHERE id = ?",
        &[Value::Integer(session.user_id)],
    )?;
    let username = res
        .rows()
        .next()
        .and_then(|r| r.get::<&str>("username"))
        .unwrap_or_default()
        .to_string();
    let totp_enabled = db::totp_is_enabled(&conn)?;
    Ok(security::json(
        200,
        serde_json::json!({
            "username": username,
            "csrf_token": session.csrf_secret,
            "totp_enabled": totp_enabled,
        })
        .to_string(),
    ))
}
