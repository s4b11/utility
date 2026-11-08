use serde::Deserialize;
use spin_sdk::http::{Params, Request, Response};

use super::authorize;
use crate::{db, notifications, security};

#[derive(Deserialize)]
struct KeysInput {
    #[serde(default)]
    keys: Vec<String>,
}

/// GET /api/notifications
pub fn list(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let out = notifications::list(&conn, db::now_secs())?;
    Ok(security::json(200, serde_json::to_string(&out)?))
}

/// POST /api/notifications/read   { "keys": [...] }
pub fn read(req: Request, _p: Params) -> anyhow::Result<Response> {
    mark(req, false)
}

/// POST /api/notifications/dismiss   { "keys": [...] }
pub fn dismiss(req: Request, _p: Params) -> anyhow::Result<Response> {
    mark(req, true)
}

fn mark(req: Request, dismiss: bool) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: KeysInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if input.keys.len() > 200 || !input.keys.iter().all(|k| notifications::valid_key(k)) {
        return Ok(security::error(422, "bad_keys"));
    }
    notifications::mark(&conn, &input.keys, dismiss, db::now_secs())?;
    Ok(security::json(200, r#"{"ok":true}"#.to_string()))
}
