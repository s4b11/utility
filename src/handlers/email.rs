//! Email templates: sender settings, template catalog, preview, sending and history.
//!
//! The server cannot speak SMTP (Fermyon Cloud only allows outbound HTTPS), so mail goes
//! out through a Google Apps Script web app the owner deploys on their own Google account.
//! The script runs `GmailApp.sendEmail` as the owner and checks a shared secret, which is
//! stored here encrypted with the wallet key. Templates are rendered server-side by
//! `crate::email_render`, so the HTML that is previewed is exactly the HTML that is sent.

use super::authorize;
use crate::email_render::{self, Sender};
use crate::{crypto, db, security};
use anyhow::Result;
use serde::Deserialize;
use serde_json::{json, Value as Json};
use spin_sdk::http::{Params, Request, Response};
use spin_sdk::sqlite::{Connection, Value};
use std::collections::HashMap;

const SECRET_FIELD: &str = "email_relay_secret";
const MAX_RECIPIENTS: usize = 20;
const MAX_FIELD_LEN: usize = 6000;
const MAX_BODY: usize = 64 * 1024;
const SEND_GAP_SECS: i64 = 3;

// ---------------------------------------------------------------- settings storage

fn get_setting(conn: &Connection, key: &str) -> Result<String> {
    Ok(conn
        .execute("SELECT value FROM app_settings WHERE key = ?", &[Value::Text(key.into())])?
        .rows()
        .next()
        .and_then(|r| r.get::<&str>("value").map(str::to_string))
        .unwrap_or_default())
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
        &[Value::Text(key.into()), Value::Text(value.into()), Value::Integer(db::now_secs())],
    )?;
    Ok(())
}

struct Settings {
    relay_url: String,
    secret: String,
    from_name: String,
    address: String,
    reply_to: String,
    signature: String,
}

fn load(conn: &Connection) -> Result<Settings> {
    Ok(Settings {
        relay_url: get_setting(conn, "email_relay_url")?,
        secret: {
            let stored = get_setting(conn, SECRET_FIELD)?;
            let plain = crypto::decrypt_field(SECRET_FIELD, &stored);
            if plain == "(unreadable)" { String::new() } else { plain }
        },
        from_name: get_setting(conn, "email_from_name")?,
        address: get_setting(conn, "email_address")?,
        reply_to: get_setting(conn, "email_reply_to")?,
        signature: get_setting(conn, "email_signature")?,
    })
}

fn new_secret() -> Result<String> {
    let mut bytes = [0u8; 24];
    getrandom::getrandom(&mut bytes).map_err(|e| anyhow::anyhow!("rng: {e}"))?;
    Ok(format!("mail_{}", hex::encode(bytes)))
}

/// Make sure a relay secret exists so the setup script can be shown on first visit.
fn ensure_secret(conn: &Connection, s: &mut Settings) -> Result<()> {
    if s.secret.is_empty() {
        let secret = new_secret()?;
        set_setting(conn, SECRET_FIELD, &crypto::encrypt_field(SECRET_FIELD, &secret)?)?;
        s.secret = secret;
    }
    Ok(())
}

fn relay_origin() -> String {
    spin_sdk::variables::get("email_relay_origin")
        .unwrap_or_else(|_| "https://script.google.com".to_string())
        .trim()
        .trim_end_matches('/')
        .to_string()
}

/// The relay must be an Apps Script web app URL (`.../macros/s/<id>/exec`).
fn valid_relay_url(url: &str) -> bool {
    let prefix = format!("{}/macros/s/", relay_origin());
    let Some(rest) = url.strip_prefix(&prefix) else { return false };
    let Some(id) = rest.strip_suffix("/exec") else { return false };
    !id.is_empty() && id.len() < 200 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn valid_email(addr: &str) -> bool {
    let a = addr.trim();
    if a.len() > 254 || a.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '<' | '>' | '"' | ',' | ';' | '(' | ')')) {
        return false;
    }
    let Some((local, domain)) = a.rsplit_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.') && !domain.contains("..")
}

/// Split "a@x.com, b@y.com; c@z.com" into a clean, de-duplicated list.
fn parse_recipients(raw: &str) -> std::result::Result<Vec<String>, ()> {
    let mut out: Vec<String> = Vec::new();
    for part in raw.split([',', ';', '\n']).map(str::trim).filter(|p| !p.is_empty()) {
        if !valid_email(part) {
            return Err(());
        }
        if !out.iter().any(|e| e.eq_ignore_ascii_case(part)) {
            out.push(part.to_string());
        }
    }
    Ok(out)
}

fn script_code(secret: &str) -> String {
    format!(
        r#"/**
 * utility · Gmail relay for email templates
 *
 * 1. Open https://script.new while signed in to the Gmail account you send from.
 * 2. Replace everything in Code.gs with this file and press Save.
 * 3. Deploy > New deployment > type "Web app".
 *    Execute as: Me    Who has access: Anyone
 * 4. Authorise when asked, then copy the Web app URL (ends in /exec)
 *    into utility > Settings > Email.
 * Keep this script private: the secret below is what lets utility send as you.
 */
var UTILITY_SECRET = "{secret}";

function doPost(e) {{
  var out = function (obj) {{
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  }};
  try {{
    var data = JSON.parse(e.postData.contents);
    if (!data || data.secret !== UTILITY_SECRET) return out({{ ok: false, error: "bad_secret" }});
    if (data.ping) {{
      return out({{ ok: true, email: Session.getEffectiveUser().getEmail(), remaining: MailApp.getRemainingDailyQuota() }});
    }}
    var options = {{ htmlBody: data.htmlBody }};
    if (data.name) options.name = data.name;
    if (data.replyTo) options.replyTo = data.replyTo;
    if (data.cc) options.cc = data.cc;
    if (data.bcc) options.bcc = data.bcc;
    GmailApp.sendEmail(data.to, data.subject, data.body || "", options);
    return out({{ ok: true, remaining: MailApp.getRemainingDailyQuota() }});
  }} catch (err) {{
    return out({{ ok: false, error: String((err && err.message) || err) }});
  }}
}}

function doGet() {{
  return ContentService.createTextOutput("utility email relay is running.");
}}
"#
    )
}

fn settings_json(s: &Settings) -> Json {
    json!({
        "relay_url": s.relay_url,
        "relay_secret": s.secret,
        "from_name": s.from_name,
        "address": s.address,
        "reply_to": s.reply_to,
        "signature": s.signature,
        "configured": valid_relay_url(&s.relay_url) && !s.secret.is_empty(),
        "script_code": script_code(&s.secret),
        "relay_origin": relay_origin(),
    })
}

/// GET /api/email/settings
pub fn get_settings(req: Request, _: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, false)? {
        return Ok(r);
    }
    let mut s = load(&conn)?;
    ensure_secret(&conn, &mut s)?;
    Ok(security::json(200, settings_json(&s).to_string()))
}

#[derive(Deserialize)]
struct SettingsInput {
    relay_url: Option<String>,
    from_name: Option<String>,
    address: Option<String>,
    reply_to: Option<String>,
    signature: Option<String>,
    #[serde(default)]
    regenerate_secret: bool,
}

/// PUT /api/email/settings
pub fn update_settings(req: Request, _: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, true)? {
        return Ok(r);
    }
    let input: SettingsInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    if let Some(url) = &input.relay_url {
        let url = url.trim();
        if !url.is_empty() && !valid_relay_url(url) {
            return Ok(security::error(422, "bad_relay_url"));
        }
        set_setting(&conn, "email_relay_url", url)?;
    }
    if let Some(name) = &input.from_name {
        let name = name.trim();
        if name.len() > 120 || name.contains(['\r', '\n']) {
            return Ok(security::error(422, "bad_from_name"));
        }
        set_setting(&conn, "email_from_name", name)?;
    }
    for (key, value) in [("email_address", &input.address), ("email_reply_to", &input.reply_to)] {
        if let Some(v) = value {
            let v = v.trim();
            if !v.is_empty() && !valid_email(v) {
                return Ok(security::error(422, "bad_email"));
            }
            set_setting(&conn, key, v)?;
        }
    }
    if let Some(sig) = &input.signature {
        if sig.len() > 1000 {
            return Ok(security::error(422, "signature_too_long"));
        }
        set_setting(&conn, "email_signature", sig.trim())?;
    }
    if input.regenerate_secret {
        let secret = new_secret()?;
        set_setting(&conn, SECRET_FIELD, &crypto::encrypt_field(SECRET_FIELD, &secret)?)?;
    }
    let mut s = load(&conn)?;
    ensure_secret(&conn, &mut s)?;
    Ok(security::json(200, settings_json(&s).to_string()))
}

// ---------------------------------------------------------------- templates

/// GET /api/email/templates
pub fn templates(req: Request, _: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, false)? {
        return Ok(r);
    }
    let list: Vec<Json> = email_render::TEMPLATES
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "name": t.name,
                "tone": t.tone,
                "description": t.description,
                "subject": t.subject,
                "accent": t.accent,
                "fields": t.fields.iter().map(|f| json!({
                    "key": f.key, "label": f.label, "kind": f.kind.as_str(),
                    "required": f.required, "placeholder": f.placeholder,
                })).collect::<Vec<_>>(),
            })
        })
        .collect();
    Ok(security::json(200, Json::Array(list).to_string()))
}

#[derive(Deserialize)]
struct RenderInput {
    template_id: String,
    #[serde(default)]
    fields: HashMap<String, String>,
    /// Fill empty fields with their example values (used for gallery thumbnails).
    #[serde(default)]
    sample: bool,
}

fn fields_ok(fields: &HashMap<String, String>) -> bool {
    fields.len() <= 40 && fields.iter().all(|(k, v)| k.len() <= 40 && v.len() <= MAX_FIELD_LEN)
}

fn sender(s: &Settings) -> Sender<'_> {
    Sender { name: &s.from_name, email: &s.address, signature: &s.signature }
}

/// POST /api/email/render: the exact HTML that would be sent (preview mode).
pub fn render(req: Request, _: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, true)? {
        return Ok(r);
    }
    if req.body().len() > MAX_BODY {
        return Ok(security::error(413, "too_large"));
    }
    let input: RenderInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    let Some(t) = email_render::find(&input.template_id) else {
        return Ok(security::error(404, "not_found"));
    };
    if !fields_ok(&input.fields) {
        return Ok(security::error(413, "too_large"));
    }
    let mut fields = input.fields;
    if input.sample {
        for f in t.fields {
            fields.entry(f.key.to_string()).or_insert_with(|| f.placeholder.to_string());
        }
    }
    let s = load(&conn)?;
    let html = email_render::render(t, &fields, &sender(&s), true).unwrap_or_default();
    let subject = email_render::subject(t, &fields, &sender(&s));
    Ok(security::json(200, json!({ "html": html, "subject": subject }).to_string()))
}

// ---------------------------------------------------------------- relay

/// Hosts the relay may redirect to (Apps Script answers POSTs with a 302 to its echo host).
fn redirect_allowed(location: &str) -> bool {
    location.starts_with("https://script.googleusercontent.com/")
        || location.starts_with(&format!("{}/", relay_origin()))
}

enum RelayError {
    Unreachable,
    NotDeployedForAnyone,
    BadSecret,
    Script(String),
}

impl RelayError {
    fn code(&self) -> &'static str {
        match self {
            RelayError::Unreachable => "relay_unreachable",
            RelayError::NotDeployedForAnyone => "relay_access",
            RelayError::BadSecret => "relay_bad_secret",
            RelayError::Script(_) => "relay_failed",
        }
    }
    fn detail(&self) -> String {
        match self {
            RelayError::Script(m) => m.chars().take(300).collect(),
            other => other.code().to_string(),
        }
    }
}

/// POST the payload to the Apps Script relay, follow its redirect, and read `{ok, ...}`.
async fn call_relay(url: &str, payload: &Json) -> std::result::Result<Json, RelayError> {
    let req = Request::post(url, payload.to_string())
        .header("content-type", "application/json")
        .build();
    let mut resp: Response = spin_sdk::http::send(req).await.map_err(|_| RelayError::Unreachable)?;
    for _ in 0..3 {
        let status = *resp.status();
        if !(300..400).contains(&status) {
            break;
        }
        let location = resp.header("location").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if location.contains("accounts.google.com") || location.contains("ServiceLogin") {
            return Err(RelayError::NotDeployedForAnyone);
        }
        if !redirect_allowed(&location) {
            return Err(RelayError::Unreachable);
        }
        resp = spin_sdk::http::send(Request::get(location).build())
            .await
            .map_err(|_| RelayError::Unreachable)?;
    }
    let status = *resp.status();
    let body: Json = match serde_json::from_slice(resp.body()) {
        Ok(v) => v,
        // Apps Script serves an HTML sign-in / error page when the web app is not public.
        Err(_) if status == 200 || status == 401 || status == 403 => return Err(RelayError::NotDeployedForAnyone),
        Err(_) => return Err(RelayError::Unreachable),
    };
    if body["ok"].as_bool() == Some(true) {
        return Ok(body);
    }
    match body["error"].as_str().unwrap_or("relay_failed") {
        "bad_secret" => Err(RelayError::BadSecret),
        other => Err(RelayError::Script(other.to_string())),
    }
}

fn relay_ready(s: &Settings) -> Option<Response> {
    if !valid_relay_url(&s.relay_url) || s.secret.is_empty() {
        return Some(security::error(409, "email_not_configured"));
    }
    None
}

/// Throttle sends so a stuck button or loop can't burn through the Gmail quota.
fn throttle(conn: &Connection) -> Result<bool> {
    let now = db::now_secs();
    let last: i64 = get_setting(conn, "email_last_send_at")?.parse().unwrap_or(0);
    if now - last < SEND_GAP_SECS {
        return Ok(false);
    }
    set_setting(conn, "email_last_send_at", &now.to_string())?;
    Ok(true)
}

/// POST /api/email/test: `{ "mode": "ping" }` checks the relay without sending;
/// `{ "to": "..." }` (or nothing) sends a short test email to that address / your own.
pub async fn test(req: Request, _: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, true)? {
        return Ok(r);
    }
    let input: Json = serde_json::from_slice(req.body()).unwrap_or(Json::Null);
    let s = load(&conn)?;
    if let Some(r) = relay_ready(&s) {
        return Ok(r);
    }
    if input["mode"].as_str() == Some("ping") {
        return Ok(match call_relay(&s.relay_url, &json!({ "secret": s.secret, "ping": true })).await {
            Ok(v) => security::json(200, json!({ "status": "ok", "email": v["email"], "remaining": v["remaining"] }).to_string()),
            Err(e) => security::json(502, json!({ "error": e.code(), "detail": e.detail() }).to_string()),
        });
    }
    let to = input["to"].as_str().map(str::trim).filter(|v| !v.is_empty()).unwrap_or(&s.address).to_string();
    if !valid_email(&to) {
        return Ok(security::error(422, "bad_recipients"));
    }
    if !throttle(&conn)? {
        return Ok(security::error(429, "email_rate_limited"));
    }
    let t = email_render::find("casual-catchup").expect("built-in template");
    let mut fields = HashMap::new();
    fields.insert("friend_name".to_string(), "there".to_string());
    fields.insert("greeting".to_string(), "It works!".to_string());
    fields.insert(
        "message".to_string(),
        "This is a test email from utility. Your Gmail relay is set up correctly, so your templates are ready to send.".to_string(),
    );
    let html = email_render::render(t, &fields, &sender(&s), false).unwrap_or_default();
    let payload = json!({
        "secret": s.secret, "to": to, "subject": "utility · test email",
        "htmlBody": html, "body": email_render::to_plain_text(&html),
        "name": s.from_name, "replyTo": s.reply_to,
    });
    Ok(match call_relay(&s.relay_url, &payload).await {
        Ok(v) => security::json(200, json!({ "status": "sent", "to": to, "remaining": v["remaining"] }).to_string()),
        Err(e) => security::json(502, json!({ "error": e.code(), "detail": e.detail() }).to_string()),
    })
}

#[derive(Deserialize)]
struct SendInput {
    template_id: String,
    #[serde(default)]
    fields: HashMap<String, String>,
    to: String,
    #[serde(default)]
    cc: String,
    #[serde(default)]
    bcc: String,
    subject: String,
}

fn log(conn: &Connection, input: &SendInput, status: &str, error: &str) -> Result<i64> {
    let fields = serde_json::to_string(&input.fields).unwrap_or_else(|_| "{}".into());
    let row = conn.execute(
        "INSERT INTO email_log (template_id, to_addr, cc, bcc, subject, fields_json, status, error, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        &[
            Value::Text(input.template_id.clone()),
            Value::Text(input.to.trim().into()),
            Value::Text(input.cc.trim().into()),
            Value::Text(input.bcc.trim().into()),
            Value::Text(input.subject.trim().into()),
            Value::Text(fields),
            Value::Text(status.into()),
            Value::Text(error.into()),
            Value::Integer(db::now_secs()),
        ],
    )?;
    let id = row.rows().next().and_then(|r| r.get::<i64>("id")).unwrap_or(0);
    Ok(id)
}

/// POST /api/email/send
pub async fn send(req: Request, _: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, true)? {
        return Ok(r);
    }
    if req.body().len() > MAX_BODY {
        return Ok(security::error(413, "too_large"));
    }
    let input: SendInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };
    let Some(t) = email_render::find(&input.template_id) else {
        return Ok(security::error(404, "not_found"));
    };
    if !fields_ok(&input.fields) {
        return Ok(security::error(413, "too_large"));
    }
    let subject = input.subject.trim();
    if subject.is_empty() || subject.len() > 250 || subject.contains(['\r', '\n']) {
        return Ok(security::error(422, "bad_subject"));
    }
    let (Ok(to), Ok(cc), Ok(bcc)) = (parse_recipients(&input.to), parse_recipients(&input.cc), parse_recipients(&input.bcc)) else {
        return Ok(security::error(422, "bad_recipients"));
    };
    if to.is_empty() {
        return Ok(security::error(422, "recipient_required"));
    }
    if to.len() + cc.len() + bcc.len() > MAX_RECIPIENTS {
        return Ok(security::error(422, "too_many_recipients"));
    }
    let s = load(&conn)?;
    if let Some(r) = relay_ready(&s) {
        return Ok(r);
    }
    let html = match email_render::render(t, &input.fields, &sender(&s), false) {
        Ok(h) => h,
        Err(field) => {
            return Ok(security::json(422, json!({ "error": "missing_field", "field": field }).to_string()));
        }
    };
    if !throttle(&conn)? {
        return Ok(security::error(429, "email_rate_limited"));
    }
    let payload = json!({
        "secret": s.secret,
        "to": to.join(","), "cc": cc.join(","), "bcc": bcc.join(","),
        "subject": subject,
        "htmlBody": html,
        "body": email_render::to_plain_text(&html),
        "name": s.from_name, "replyTo": s.reply_to,
    });
    match call_relay(&s.relay_url, &payload).await {
        Ok(v) => {
            let id = log(&conn, &input, "sent", "")?;
            Ok(security::json(200, json!({ "status": "sent", "id": id, "remaining": v["remaining"] }).to_string()))
        }
        Err(e) => {
            let id = log(&conn, &input, "failed", &e.detail())?;
            Ok(security::json(502, json!({ "error": e.code(), "detail": e.detail(), "id": id }).to_string()))
        }
    }
}

// ---------------------------------------------------------------- history

/// GET /api/email/history: the 50 most recent sends (fields kept so they can be reused).
pub fn history(req: Request, _: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, false)? {
        return Ok(r);
    }
    let rows = conn.execute(
        "SELECT id, template_id, to_addr, cc, bcc, subject, fields_json, status, error, created_at \
         FROM email_log ORDER BY created_at DESC, id DESC LIMIT 50",
        &[],
    )?;
    let list: Vec<Json> = rows
        .rows()
        .map(|r| {
            json!({
                "id": r.get::<i64>("id").unwrap_or(0),
                "template_id": r.get::<&str>("template_id").unwrap_or(""),
                "to": r.get::<&str>("to_addr").unwrap_or(""),
                "cc": r.get::<&str>("cc").unwrap_or(""),
                "bcc": r.get::<&str>("bcc").unwrap_or(""),
                "subject": r.get::<&str>("subject").unwrap_or(""),
                "fields": serde_json::from_str::<Json>(r.get::<&str>("fields_json").unwrap_or("{}")).unwrap_or(json!({})),
                "status": r.get::<&str>("status").unwrap_or(""),
                "error": r.get::<&str>("error").unwrap_or(""),
                "created_at": r.get::<i64>("created_at").unwrap_or(0),
            })
        })
        .collect();
    Ok(security::json(200, Json::Array(list).to_string()))
}

/// DELETE /api/email/history/:id
pub fn delete_history(req: Request, p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(r) = authorize(&conn, &req, true)? {
        return Ok(r);
    }
    let id = super::parse_id(&p);
    conn.execute("DELETE FROM email_log WHERE id = ?", &[Value::Integer(id)])?;
    Ok(security::json(200, json!({ "ok": true }).to_string()))
}
