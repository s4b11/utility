use spin_sdk::http::{Params, Request, Response};

use super::{authorize, parse_id};
use crate::{db, models::EventInput, security};

fn query_params(req: &Request) -> (Option<String>, Option<String>) {
    let (mut q, mut tag) = (None, None);
    for (k, v) in form_urlencoded::parse(req.query().as_bytes()) {
        match k.as_ref() {
            "q" => q = Some(v.into_owned()),
            "tag" => tag = Some(v.into_owned()),
            _ => {}
        }
    }
    (q, tag)
}

fn validate(input: &EventInput) -> Option<&'static str> {
    if input.title.trim().is_empty() {
        return Some("title_required");
    }
    if input.end_at < input.start_at {
        return Some("bad_time_range");
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

/// GET /api/events
pub fn list(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let (q, tag) = query_params(&req);
    let items = db::list_events(&conn, q.as_deref(), tag.as_deref())?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}

/// GET /api/events/:id
pub fn get(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    match db::get_event(&conn, parse_id(&params))? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// POST /api/events
pub fn create(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: EventInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if let Some(e) = validate(&input) {
        return Ok(security::error(422, e));
    }
    let id = db::insert_event(&conn, &input)?;
    match db::get_event(&conn, id)? {
        Some(item) => Ok(security::json(201, serde_json::to_string(&item)?)),
        None => Ok(security::error(500, "insert_failed")),
    }
}

/// PUT /api/events/:id
pub fn update(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    let input: EventInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if let Some(e) = validate(&input) {
        return Ok(security::error(422, e));
    }
    if db::get_event(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::update_event(&conn, id, &input)?;
    match db::get_event(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// DELETE /api/events/:id
pub fn delete(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_event(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::delete_event(&conn, id)?;
    Ok(security::json(200, serde_json::json!({ "ok": true }).to_string()))
}
