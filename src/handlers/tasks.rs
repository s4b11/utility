use spin_sdk::http::{Params, Request, Response};

use super::{authorize, parse_id};
use crate::{
    db,
    models::{DoneInput, TaskInput},
    security,
};

fn query_params(req: &Request) -> (Option<String>, Option<String>, Option<bool>) {
    let (mut q, mut tag, mut done) = (None, None, None);
    for (k, v) in form_urlencoded::parse(req.query().as_bytes()) {
        match k.as_ref() {
            "q" => q = Some(v.into_owned()),
            "tag" => tag = Some(v.into_owned()),
            "done" => {
                done = match v.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }
            }
            _ => {}
        }
    }
    (q, tag, done)
}

fn validate(input: &TaskInput) -> Option<&'static str> {
    if input.title.trim().is_empty() {
        return Some("title_required");
    }
    if !matches!(input.priority.as_str(), "low" | "med" | "high") {
        return Some("bad_priority");
    }
    if let Some(rec) = &input.recurrence {
        if !matches!(
            rec.freq.as_str(),
            "none" | "daily" | "weekly" | "monthly" | "yearly"
        ) {
            return Some("bad_freq");
        }
        if rec.interval < 1 {
            return Some("bad_interval");
        }
    }
    None
}

/// GET /api/tasks
pub fn list(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let (q, tag, done) = query_params(&req);
    let items = db::list_tasks(&conn, q.as_deref(), tag.as_deref(), done)?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}

/// GET /api/tasks/:id
pub fn get(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    match db::get_task(&conn, parse_id(&params))? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// POST /api/tasks
pub fn create(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: TaskInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if let Some(e) = validate(&input) {
        return Ok(security::error(422, e));
    }
    let id = db::insert_task(&conn, &input)?;
    match db::get_task(&conn, id)? {
        Some(item) => Ok(security::json(201, serde_json::to_string(&item)?)),
        None => Ok(security::error(500, "insert_failed")),
    }
}

/// PUT /api/tasks/:id
pub fn update(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    let input: TaskInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if let Some(e) = validate(&input) {
        return Ok(security::error(422, e));
    }
    if db::get_task(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::update_task(&conn, id, &input)?;
    match db::get_task(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// PUT /api/tasks/:id/done
pub fn toggle_done(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    let input: DoneInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if db::get_task(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::set_task_done(&conn, id, input.done)?;
    match db::get_task(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// DELETE /api/tasks/:id
pub fn delete(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_task(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::delete_task(&conn, id)?;
    Ok(security::json(200, serde_json::json!({ "ok": true }).to_string()))
}
