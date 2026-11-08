use spin_sdk::http::{Params, Request, Response};

use super::authorize;
use crate::{db, markdown, models::MarkdownInput, security};

/// POST /api/tools/markdown — render Markdown to sanitized HTML.
pub fn render(req: Request, _p: Params) -> anyhow::Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let input: MarkdownInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    let html = markdown::to_safe_html(&input.markdown);
    Ok(security::json(
        200,
        serde_json::json!({ "html": html }).to_string(),
    ))
}
