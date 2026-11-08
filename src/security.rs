use spin_sdk::http::{Response, ResponseBuilder};

// Inline styles are allowed so email template previews (sandboxed srcdoc iframes, which
// inherit this policy) render with the inline CSS that email clients require. Scripts stay
// locked to 'self'.
const CSP: &str = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; \
script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; \
form-action 'self'; frame-ancestors 'none'";

fn apply_security_headers(b: &mut ResponseBuilder) {
    b.header("x-content-type-options", "nosniff");
    b.header("x-frame-options", "DENY");
    b.header("referrer-policy", "no-referrer");
    b.header("permissions-policy", "geolocation=(), microphone=(), camera=(), payment=()");
    b.header("content-security-policy", CSP);
    b.header("strict-transport-security", "max-age=31536000");
    b.header("cross-origin-opener-policy", "same-origin");
    b.header("cross-origin-resource-policy", "cross-origin");
    b.header("x-permitted-cross-domain-policies", "none");
}

pub fn cors_preflight(req: &spin_sdk::http::Request) -> Response {
    let mut b = Response::builder();
    b.status(204);
    let origin = req.header("origin").and_then(|v| v.as_str()).unwrap_or("*");
    b.header("access-control-allow-origin", origin);
    b.header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
    b.header(
        "access-control-allow-headers",
        "content-type, authorization, x-csrf-token, x-session-token, cookie, accept, x-webhook-source, x-webhook-secret",
    );
    b.header("access-control-expose-headers", "set-cookie, x-csrf-token, authorization");
    b.header("access-control-allow-credentials", "true");
    b.header("access-control-max-age", "86400");
    b.header("content-length", "0");
    b.body(Vec::<u8>::new());
    b.build()
}

pub fn with_cors(resp: Response, origin: Option<&str>) -> Response {
    let mut builder = Response::builder();
    builder.status(*resp.status());
    for (k, v) in resp.headers() {
        if let Some(val) = v.as_str() {
            builder.header(k.to_string(), val);
        }
    }
    let allow_origin = origin.unwrap_or("*");
    builder.header("access-control-allow-origin", allow_origin);
    if origin.is_some() {
        builder.header("access-control-allow-credentials", "true");
    }
    builder.header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
    builder.header(
        "access-control-allow-headers",
        "content-type, authorization, x-csrf-token, x-session-token, cookie, accept, x-webhook-source, x-webhook-secret",
    );
    builder.header("access-control-expose-headers", "set-cookie, x-csrf-token, authorization");
    builder.body(resp.body().to_vec());
    builder.build()
}

/// A JSON response with no-store caching and security headers.
pub fn json(status: u16, body: String) -> Response {
    let mut b = Response::builder();
    b.status(status);
    b.header("content-type", "application/json");
    b.header("cache-control", "no-store");
    apply_security_headers(&mut b);
    b.body(body);
    b.build()
}

/// A JSON response that also sets a single Set-Cookie header.
pub fn json_with_cookie(status: u16, body: String, set_cookie: &str) -> Response {
    let mut b = Response::builder();
    b.status(status);
    b.header("content-type", "application/json");
    b.header("cache-control", "no-store");
    b.header("set-cookie", set_cookie);
    apply_security_headers(&mut b);
    b.body(body);
    b.build()
}

/// An HTML response with a caller-chosen cache policy.
pub fn html(status: u16, body: Vec<u8>, cache_control: &str) -> Response {
    let mut b = Response::builder();
    b.status(status);
    b.header("content-type", "text/html; charset=utf-8");
    b.header("cache-control", cache_control);
    apply_security_headers(&mut b);
    b.body(body);
    b.build()
}

/// A static asset response.
pub fn asset(content_type: &str, body: Vec<u8>, cache_control: &str) -> Response {
    let mut b = Response::builder();
    b.status(200);
    b.header("content-type", content_type);
    b.header("cache-control", cache_control);
    apply_security_headers(&mut b);
    b.body(body);
    b.build()
}

/// A small JSON error body: {"error":"<code>"}.
pub fn error(status: u16, code: &str) -> Response {
    json(status, format!("{{\"error\":\"{code}\"}}"))
}
