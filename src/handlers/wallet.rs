use spin_sdk::http::{Params, Request, Response};

use crate::handlers::{authorize, parse_id};
use crate::models::{BankAccountInput, CardInput};
use crate::security;
use crate::{db, security as sec};

// ================================ Cards ================================

pub fn cards_list(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let items = db::list_cards(&conn)?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}

pub fn cards_get(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    match db::get_card(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(sec::error(404, "not_found")),
    }
}

pub fn cards_create(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: CardInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(sec::error(400, "bad_json")),
    };
    if input.card_number.trim().is_empty() {
        return Ok(sec::error(422, "card_number_required"));
    }
    let id = db::insert_card(&conn, &input)?;
    match db::get_card(&conn, id)? {
        Some(item) => Ok(security::json(201, serde_json::to_string(&item)?)),
        None => Ok(sec::error(500, "insert_failed")),
    }
}

pub fn cards_update(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_card(&conn, id)?.is_none() {
        return Ok(sec::error(404, "not_found"));
    }
    let input: CardInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(sec::error(400, "bad_json")),
    };
    if input.card_number.trim().is_empty() {
        return Ok(sec::error(422, "card_number_required"));
    }
    db::update_card(&conn, id, &input)?;
    match db::get_card(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(sec::error(404, "not_found")),
    }
}

pub fn cards_delete(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_card(&conn, id)?.is_none() {
        return Ok(sec::error(404, "not_found"));
    }
    db::delete_card(&conn, id)?;
    Ok(security::json(200, r#"{"ok":true}"#.to_string()))
}

// ================================ Bank Accounts ================================

pub fn banks_list(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let items = db::list_banks(&conn)?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}

pub fn banks_get(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    match db::get_bank(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(sec::error(404, "not_found")),
    }
}

pub fn banks_create(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: BankAccountInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(sec::error(400, "bad_json")),
    };
    if input.account_number.trim().is_empty() {
        return Ok(sec::error(422, "account_number_required"));
    }
    let id = db::insert_bank(&conn, &input)?;
    match db::get_bank(&conn, id)? {
        Some(item) => Ok(security::json(201, serde_json::to_string(&item)?)),
        None => Ok(sec::error(500, "insert_failed")),
    }
}

pub fn banks_update(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_bank(&conn, id)?.is_none() {
        return Ok(sec::error(404, "not_found"));
    }
    let input: BankAccountInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(sec::error(400, "bad_json")),
    };
    if input.account_number.trim().is_empty() {
        return Ok(sec::error(422, "account_number_required"));
    }
    db::update_bank(&conn, id, &input)?;
    match db::get_bank(&conn, id)? {
        Some(item) => Ok(security::json(200, serde_json::to_string(&item)?)),
        None => Ok(sec::error(404, "not_found")),
    }
}

pub fn banks_delete(req: Request, params: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&params);
    if db::get_bank(&conn, id)?.is_none() {
        return Ok(sec::error(404, "not_found"));
    }
    db::delete_bank(&conn, id)?;
    Ok(security::json(200, r#"{"ok":true}"#.to_string()))
}
