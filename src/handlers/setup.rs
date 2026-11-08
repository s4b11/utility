use spin_sdk::http::{Params, Request, Response};
use spin_sdk::sqlite::{Connection, Value};

use crate::{auth, db, models::SetupInput, security};

fn owner_exists(conn: &Connection) -> anyhow::Result<bool> {
    let res = conn.execute("SELECT COUNT(*) AS c FROM users", &[])?;
    let count = res
        .rows()
        .next()
        .and_then(|r| r.get::<i64>("c"))
        .unwrap_or(0);
    Ok(count > 0)
}

/// GET /api/setup-status
pub fn status(_req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    let needs = !owner_exists(&conn)?;
    Ok(security::json(
        200,
        serde_json::json!({ "needs_setup": needs }).to_string(),
    ))
}

/// POST /api/setup — create the single owner account (only when none exists).
pub fn create_owner(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if owner_exists(&conn)? {
        return Ok(security::error(409, "already_setup"));
    }
    let input: SetupInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    let username = input.username.trim();
    if username.len() < 3 || input.password.len() < 8 {
        return Ok(security::error(422, "weak_credentials"));
    }
    let hash = auth::hash_password(&input.password)?;
    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)",
        &[
            Value::Text(username.to_string()),
            Value::Text(hash),
            Value::Integer(db::now_secs()),
        ],
    )?;
    // Auto-login the new owner.
    let secure = auth::request_is_secure(&req);
    let (token, csrf) = auth::create_session(&conn, 1, false)?;
    let body = serde_json::json!({ "username": username, "csrf_token": csrf, "token": token }).to_string();
    Ok(security::json_with_cookie(
        200,
        body,
        &auth::session_cookie(&token, false, secure),
    ))
}
