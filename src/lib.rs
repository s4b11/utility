mod auth;
mod crypto;
mod db;
mod email_render;
mod handlers;
mod markdown;
mod migrations;
mod models;
mod notifications;
mod recurrence;
mod router;
mod security;
mod static_files;
mod totp;

use spin_sdk::http::{IntoResponse, Request};
use spin_sdk::http_component;

/// Single HTTP component entry point. All routing happens in `router`.
#[http_component]
fn handle(req: Request) -> impl IntoResponse {
    if *req.method() == spin_sdk::http::Method::Options {
        return security::cors_preflight(&req);
    }
    let origin = req.header("origin").and_then(|v| v.as_str()).map(ToString::to_string);
    let resp = router::build().handle(req);
    security::with_cors(resp, origin.as_deref())
}
