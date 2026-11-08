use spin_sdk::http::{Params, Request, Response};

use super::authorize;
use crate::{db, security};

const DAY: i64 = 60 * 60 * 24;

/// GET /api/calendar/items?from=<secs>&to=<secs>
pub fn items(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let now = db::now_secs();
    let (mut from, mut to): (Option<i64>, Option<i64>) = (None, None);
    for (k, v) in form_urlencoded::parse(req.query().as_bytes()) {
        match k.as_ref() {
            "from" => from = v.parse::<i64>().ok(),
            "to" => to = v.parse::<i64>().ok(),
            _ => {}
        }
    }
    let from = from.unwrap_or(now - 30 * DAY);
    let to = to.unwrap_or(now + 60 * DAY);
    if to < from {
        return Ok(security::error(400, "bad_range"));
    }
    if to - from > 420 * DAY {
        return Ok(security::error(400, "window_too_large"));
    }
    let items = db::calendar_items(&conn, from, to)?;
    Ok(security::json(200, serde_json::to_string(&items)?))
}
