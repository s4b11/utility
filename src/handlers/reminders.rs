use spin_sdk::http::{Params, Request, Response};

use super::{authorize, parse_id};
use crate::{
    db,
    models::{ReminderInput, SnoozeInput},
    security,
};

/// GET /api/reminders
pub fn list(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let items = db::list_reminders(&conn)?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}

/// GET /api/reminders/due
pub fn due(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let items = db::due_reminders(&conn, db::now_secs())?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}

/// POST /api/reminders
pub fn create(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: ReminderInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if !matches!(input.parent_type.as_str(), "note" | "task" | "event") {
        return Ok(security::error(422, "bad_parent_type"));
    }
    if input.parent_type == "note" && input.remind_at.is_none() {
        return Ok(security::error(422, "remind_at_required"));
    }
    if !db::parent_exists(&conn, &input.parent_type, input.parent_id)? {
        return Ok(security::error(404, "parent_not_found"));
    }
    let id = db::insert_reminder(&conn, &input)?;
    match db::get_reminder(&conn, id)? {
        Some(item) => Ok(security::json(201, serde_json::to_string(&item)?)),
        None => Ok(security::error(500, "insert_failed")),
    }
}

/// PUT /api/reminders/:id/snooze
pub fn snooze(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    let input: SnoozeInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if db::get_reminder(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::snooze_reminder(&conn, id, input.minutes)?;
    match db::get_reminder(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// PUT /api/reminders/:id/dismiss
pub fn dismiss(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    let Some(rem) = db::get_reminder(&conn, id)? else {
        return Ok(security::error(404, "not_found"));
    };
    let now = db::now_secs();
    let through = match db::reminder_due_fire(&conn, &rem, now)? {
        Some((_, occ, _)) => occ,
        None => now,
    };
    db::dismiss_reminder(&conn, id, through)?;
    Ok(security::json(200, serde_json::json!({ "ok": true }).to_string()))
}

/// DELETE /api/reminders/:id  (cancel — keeps the row as status='cancelled')
pub fn cancel(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_reminder(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::cancel_reminder(&conn, id)?;
    Ok(security::json(200, serde_json::json!({ "ok": true }).to_string()))
}
