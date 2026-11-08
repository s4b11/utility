use include_dir::{include_dir, Dir, File};
use spin_sdk::http::{Params, Request, Response};

use crate::security;

/// The entire `dist/` tree produced by Vite, embedded into the wasm binary at compile time.
static SITE: Dir = include_dir!("$CARGO_MANIFEST_DIR/dist");

/// Cache policy by file type. Code and generated assets with hashes can be cached,
/// fonts are immutable, html/sw/manifest revalidate.
fn cache_policy(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "woff2" | "woff" => "public, max-age=31536000, immutable",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" => "public, max-age=86400",
        "js" | "css" if path.contains('-') => "public, max-age=31536000, immutable",
        _ => "no-cache",
    }
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "webmanifest" => "application/manifest+json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Look up an embedded file. Robust to include_dir's path convention by trying both
/// the bare path and a "dist/"-prefixed path.
fn get_embedded(path: &str) -> Option<&'static File<'static>> {
    let clean = path.trim_start_matches('/');
    if let Some(f) = SITE.get_file(clean) {
        return Some(f);
    }
    SITE.get_file(format!("dist/{clean}"))
}

fn index_response() -> Response {
    let html = match get_embedded("index.html") {
        Some(f) => match std::str::from_utf8(f.contents()) {
            Ok(s) => s,
            Err(_) => return security::error(500, "bad_index"),
        },
        None => return security::error(500, "missing_index"),
    };
    security::html(200, html.as_bytes().to_vec(), "no-cache")
}

/// GET /assets/* — serve bundled Vite JS & CSS chunks.
pub fn serve_asset(_req: Request, params: Params) -> Response {
    let rel = params.wildcard().unwrap_or("").trim_start_matches('/');
    let asset_path = format!("assets/{rel}");
    match get_embedded(&asset_path) {
        Some(f) => security::asset(content_type(&asset_path), f.contents().to_vec(), cache_policy(&asset_path)),
        None => security::error(404, "not_found"),
    }
}

/// GET /fonts/* — serve fonts.
pub fn serve_font(_req: Request, params: Params) -> Response {
    let rel = params.wildcard().unwrap_or("").trim_start_matches('/');
    let font_path = format!("fonts/{rel}");
    match get_embedded(&font_path) {
        Some(f) => security::asset(content_type(&font_path), f.contents().to_vec(), cache_policy(&font_path)),
        None => security::error(404, "not_found"),
    }
}

/// GET /icons/* — serve icons.
pub fn serve_icon(_req: Request, params: Params) -> Response {
    let rel = params.wildcard().unwrap_or("").trim_start_matches('/');
    let icon_path = format!("icons/{rel}");
    match get_embedded(&icon_path) {
        Some(f) => security::asset(content_type(&icon_path), f.contents().to_vec(), cache_policy(&icon_path)),
        None => security::error(404, "not_found"),
    }
}

/// GET / — serve the React SPA shell.
pub fn serve_index(_req: Request, _params: Params) -> Response {
    index_response()
}

/// GET /sw.js — the service worker.
pub fn serve_sw(_req: Request, _params: Params) -> Response {
    match get_embedded("sw.js") {
        Some(f) => security::asset(
            "text/javascript; charset=utf-8",
            f.contents().to_vec(),
            "no-cache",
        ),
        None => security::error(404, "not_found"),
    }
}

/// GET /manifest.webmanifest — the PWA web app manifest.
pub fn serve_manifest(_req: Request, _params: Params) -> Response {
    match get_embedded("manifest.webmanifest").or_else(|| get_embedded("site.webmanifest")) {
        Some(f) => security::asset(
            "application/manifest+json",
            f.contents().to_vec(),
            "no-cache",
        ),
        None => security::error(404, "not_found"),
    }
}

/// Catch-all — serve the SPA shell for client routes; JSON 404 for unknown /api/* paths.
pub fn spa_fallback(req: Request, _params: Params) -> Response {
    if req.path().starts_with("/api/") {
        return security::error(404, "not_found");
    }
    index_response()
}
