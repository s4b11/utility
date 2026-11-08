use spin_sdk::http::{Params, Request, Response};

use super::authorize;
use crate::models::{TotpDisableInput, TotpEnableInput};
use crate::{auth, db, security, totp};

/// POST /api/2fa/setup — generate a new (pending) secret and return enrollment data.
pub fn setup(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let (username, _) = db::get_user_basic(&conn)?;
    let secret = totp::generate_secret();
    let secret_hex = hex::encode(secret);
    let enc = match crate::crypto::encrypt_field("totp", &secret_hex) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(500, "totp_setup_failed")),
    };
    db::set_totp_pending(&conn, &enc)?;

    let b32 = totp::base32_encode(&secret);
    let uri = totp::otpauth_uri(&username, &b32);
    let qr = totp::qr_svg(&uri).unwrap_or_default();
    let body = serde_json::json!({
        "secret_b32": b32,
        "otpauth_uri": uri,
        "qr_svg": qr,
    })
    .to_string();
    Ok(security::json(200, body))
}

/// POST /api/2fa/enable {code} — confirm the pending secret and turn 2FA on.
pub fn enable(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: TotpEnableInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    let (secret_hex, _enabled) = db::get_user_totp(&conn)?;
    let Ok(secret) = hex::decode(&secret_hex) else {
        return Ok(security::error(400, "totp_setup_failed"));
    };
    if secret.is_empty() {
        return Ok(security::error(400, "totp_setup_failed"));
    }
    if !totp::verify(&secret, input.code.trim(), db::now_secs(), 1) {
        return Ok(security::error(422, "bad_totp_code"));
    }
    db::enable_totp(&conn)?;
    let codes = totp::gen_recovery_codes(8);
    let hashes: Vec<String> = codes.iter().map(|c| totp::sha256_hex(c)).collect();
    db::replace_recovery_codes(&conn, &hashes)?;
    Ok(security::json(
        200,
        serde_json::json!({ "recovery_codes": codes }).to_string(),
    ))
}

/// POST /api/2fa/disable {password, code} — turn 2FA off after re-auth.
pub fn disable(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: TotpDisableInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    let (_username, password_hash) = db::get_user_basic(&conn)?;
    if !auth::verify_password(&input.password, &password_hash) {
        return Ok(security::error(401, "invalid_credentials"));
    }
    let (secret_hex, enabled) = db::get_user_totp(&conn)?;
    if enabled {
        let code = input.code.trim();
        let totp_ok = hex::decode(&secret_hex)
            .map(|s| !s.is_empty() && totp::verify(&s, code, db::now_secs(), 1))
            .unwrap_or(false);
        let recovery_ok = !totp_ok && db::consume_recovery_code(&conn, &totp::sha256_hex(code))?;
        if !totp_ok && !recovery_ok {
            return Ok(security::error(422, "bad_totp_code"));
        }
    }
    db::disable_totp(&conn)?;
    Ok(security::json(200, serde_json::json!({ "ok": true }).to_string()))
}
