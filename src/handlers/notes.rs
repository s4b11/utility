use spin_sdk::http::{Params, Request, Response};

use super::{authorize, parse_id};
use crate::{db, models::NoteInput, security};

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

/// GET /api/notes
pub fn list(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let (q, tag) = query_params(&req);
    let items = db::list_notes(&conn, q.as_deref(), tag.as_deref())?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}

/// GET /api/notes/:id
pub fn get(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    match db::get_note(&conn, parse_id(&params))? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// POST /api/notes
pub fn create(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: NoteInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if input.title.trim().is_empty() {
        return Ok(security::error(422, "title_required"));
    }
    let id = db::insert_note(&conn, &input)?;
    match db::get_note(&conn, id)? {
        Some(item) => Ok(security::json(201, serde_json::to_string(&item)?)),
        None => Ok(security::error(500, "insert_failed")),
    }
}

/// PUT /api/notes/:id
pub fn update(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    let input: NoteInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if input.title.trim().is_empty() {
        return Ok(security::error(422, "title_required"));
    }
    if db::get_note(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::update_note(&conn, id, &input)?;
    match db::get_note(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(security::error(404, "not_found")),
    }
}

/// DELETE /api/notes/:id
pub fn delete(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_note(&conn, id)?.is_none() {
        return Ok(security::error(404, "not_found"));
    }
    db::delete_note(&conn, id)?;
    Ok(security::json(200, serde_json::json!({ "ok": true }).to_string()))
}
