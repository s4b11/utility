pub mod calendar;
pub mod agent;
pub mod commands;
pub mod email;
pub mod twofa;
pub mod wallet;
pub mod events;
pub mod links;
pub mod markdown;
pub mod notes;
pub mod notifications;
pub mod reminders;
pub mod session;
pub mod setup;
pub mod tasks;
pub mod jobs;

use spin_sdk::http::{Params, Request, Response};
use spin_sdk::sqlite::Connection;

use crate::auth::{self, Session};
use crate::security;

/// Validate the session, and for mutating requests also the CSRF token.
/// Returns `Ok(session)` when allowed, or `Err(response)` to return immediately.
pub fn authorize(
    conn: &Connection,
    req: &Request,
    mutating: bool,
) -> anyhow::Result<Result<Session, Response>> {
    let Some(session) = auth::require_session(conn, req)? else {
        return Ok(Err(security::error(401, "unauthorized")));
    };
    if mutating && !auth::csrf_ok(req, &session) {
        return Ok(Err(security::error(403, "csrf")));
    }
    Ok(Ok(session))
}

/// Parse the `:id` path parameter (0 if missing/invalid).
pub fn parse_id(params: &Params) -> i64 {
    params
        .get("id")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0)
}
