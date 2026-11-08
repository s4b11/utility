use anyhow::{anyhow, Result};
use spin_sdk::http::{Params, Request, Response};
use spin_sdk::sqlite::{Connection, Row, Value};
use subtle::ConstantTimeEq;

use super::{authorize, parse_id};
use crate::db::{self, now_secs};
use crate::models::{IncomingJob, Job, JobInput, UpdateWebhookConfigInput, WebhookConfigResponse};
use crate::security;

// -----------------------------------------------------------------------------
// Webhook Security & Parsing Helpers
// -----------------------------------------------------------------------------

pub fn extract_bearer_token(req: &Request) -> Option<String> {
    // 1. Direct Authorization header lookup
    if let Some(auth) = req.header("authorization").and_then(|v| v.as_str()) {
        let trimmed = auth.trim().trim_matches('"').trim_matches('\'').trim();
        if let Some(token) = trimmed.strip_prefix("Bearer ") {
            let t = token.trim().trim_matches('"').trim_matches('\'');
            if !t.is_empty() {
                return Some(t.to_string());
            }
        } else if let Some(token) = trimmed.strip_prefix("bearer ") {
            let t = token.trim().trim_matches('"').trim_matches('\'');
            if !t.is_empty() {
                return Some(t.to_string());
            }
        } else if !trimmed.is_empty() && !trimmed.contains(' ') {
            return Some(trimmed.to_string());
        }
    }

    // 2. Iterate all headers case-insensitively
    for (k, v) in req.headers() {
        let name = k.to_string().to_ascii_lowercase();
        if let Ok(val_str) = std::str::from_utf8(v.as_bytes()) {
            let trimmed = val_str.trim().trim_matches('"').trim_matches('\'').trim();
            if name == "authorization" {
                if let Some(token) = trimmed.strip_prefix("Bearer ").or_else(|| trimmed.strip_prefix("bearer ")) {
                    let t = token.trim().trim_matches('"').trim_matches('\'');
                    if !t.is_empty() {
                        return Some(t.to_string());
                    }
                } else if !trimmed.is_empty() && !trimmed.contains(' ') {
                    return Some(trimmed.to_string());
                }
            } else if name == "x-webhook-secret" || name == "x-api-key" || name == "x-token" || name == "webhook-secret" {
                let token = trimmed.strip_prefix("Bearer ")
                    .or_else(|| trimmed.strip_prefix("bearer "))
                    .unwrap_or(trimmed)
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }
    }

    // 3. Fallback: Query parameter in URL (?secret=... or ?token=... or ?key=...)
    let full_url = req.header("spin-full-url").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(query) = full_url.split('?').nth(1) {
        for (k, v) in form_urlencoded::parse(query.as_bytes()) {
            let k_lower = k.to_ascii_lowercase();
            if k_lower == "secret" || k_lower == "token" || k_lower == "key" || k_lower == "webhook_secret" {
                let t = v.trim().trim_matches('"').trim_matches('\'').to_string();
                if !t.is_empty() {
                    return Some(t);
                }
            }
        }
    }

    None
}

pub fn get_or_init_webhook_secret(conn: &Connection) -> Result<String> {
    // 1. Check spin runtime variable if provided
    if let Ok(val) = spin_sdk::variables::get("webhook_secret") {
        let trimmed = val.trim().trim_matches('"').trim_matches('\'');
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    // 2. Check app_settings in database
    let row = conn.execute(
        "SELECT value FROM app_settings WHERE key = 'webhook_secret'",
        &[],
    )?;
    if let Some(r) = row.rows().next() {
        if let Some(val) = r.get::<&str>("value") {
            let trimmed = val.trim().trim_matches('"').trim_matches('\'');
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    // 3. Generate a secure random secret if not set
    let mut bytes = [0u8; 24];
    getrandom::getrandom(&mut bytes).map_err(|e| anyhow!("getrandom failed: {e}"))?;
    let new_secret = format!("whsec_{}", hex::encode(bytes));
    let now = now_secs();
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('webhook_secret', ?, ?)",
        &[Value::Text(new_secret.clone()), Value::Integer(now)],
    )?;

    Ok(new_secret)
}

fn verify_webhook_token(conn: &Connection, req: &Request) -> Result<bool> {
    let Some(provided_token) = extract_bearer_token(req) else {
        return Ok(false);
    };
    let expected_secret = get_or_init_webhook_secret(conn)?;

    let clean_provided = provided_token.trim().trim_matches('"').trim_matches('\'');
    let clean_expected = expected_secret.trim().trim_matches('"').trim_matches('\'');

    let p_bytes = clean_provided.as_bytes();
    let e_bytes = clean_expected.as_bytes();
    if p_bytes.len() != e_bytes.len() {
        return Ok(false);
    }
    let ok: bool = p_bytes.ct_eq(e_bytes).into();
    Ok(ok)
}

fn value_to_string(v: Option<&serde_json::Value>) -> String {
    match v {
        None => String::new(),
        Some(serde_json::Value::Null) => String::new(),
        Some(serde_json::Value::String(s)) => s.trim().to_string(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        Some(serde_json::Value::Bool(b)) => b.to_string(),
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|it| match it {
                serde_json::Value::String(s) => Some(s.trim().to_string()),
                serde_json::Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(", "),
        Some(other) => other.to_string(),
    }
}

fn value_to_vec_strings(v: Option<&serde_json::Value>) -> Vec<String> {
    match v {
        None => Vec::new(),
        Some(serde_json::Value::Null) => Vec::new(),
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|it| match it {
                serde_json::Value::String(s) => {
                    let t = s.trim();
                    if !t.is_empty() {
                        Some(t.to_string())
                    } else {
                        None
                    }
                }
                serde_json::Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .collect(),
        Some(serde_json::Value::String(s)) => s
            .split(',')
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(ToString::to_string)
            .collect(),
        Some(other) => {
            let s = other.to_string();
            if !s.is_empty() {
                vec![s]
            } else {
                Vec::new()
            }
        }
    }
}

fn parse_incoming_jobs(body: &[u8]) -> Result<Vec<IncomingJob>> {
    // 1. Array of objects
    if let Ok(jobs) = serde_json::from_slice::<Vec<IncomingJob>>(body) {
        return Ok(jobs);
    }

    // 2. Generic object wrapping array or single job
    if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body) {
        if let Some(arr) = val.as_array() {
            if let Ok(jobs) = serde_json::from_value::<Vec<IncomingJob>>(serde_json::Value::Array(arr.clone())) {
                return Ok(jobs);
            }
        }
        if let Some(obj) = val.as_object() {
            for key in ["jobs", "data", "rows", "items", "records"] {
                if let Some(arr_val) = obj.get(key) {
                    if let Ok(jobs) = serde_json::from_value::<Vec<IncomingJob>>(arr_val.clone()) {
                        return Ok(jobs);
                    }
                }
            }
            if let Ok(job) = serde_json::from_value::<IncomingJob>(val) {
                if job.job_title.is_some() || job.company.is_some() {
                    return Ok(vec![job]);
                }
            }
        }
    }

    anyhow::bail!("Invalid JSON format for jobs")
}

fn row_to_job(r: Row) -> Job {
    let skills_raw = r.get::<&str>("skills_required").unwrap_or("");
    let matched_raw = r.get::<&str>("matched_skills").unwrap_or("");

    let skills_required = skills_raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect();

    let matched_skills = matched_raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect();

    Job {
        id: r.get::<i64>("id").unwrap_or(0),
        sl_no: r.get::<&str>("sl_no").map(ToString::to_string),
        job_title: r.get::<&str>("job_title").unwrap_or("").to_string(),
        company: r.get::<&str>("company").unwrap_or("").to_string(),
        salary_package: r.get::<&str>("salary_package").unwrap_or("").to_string(),
        location: r.get::<&str>("location").unwrap_or("").to_string(),
        skills_required,
        matched_skills,
        job_type: r.get::<&str>("job_type").unwrap_or("").to_string(),
        experience: r.get::<&str>("experience").unwrap_or("").to_string(),
        link_to_apply: r.get::<&str>("link_to_apply").unwrap_or("").to_string(),
        status: r.get::<&str>("status").unwrap_or("new").to_string(),
        notes: r.get::<&str>("notes").unwrap_or("").to_string(),
        source: r.get::<&str>("source").unwrap_or("webhook").to_string(),
        created_at: r.get::<i64>("created_at").unwrap_or(0),
        updated_at: r.get::<i64>("updated_at").unwrap_or(0),
    }
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

/// POST /api/webhook — Ingest jobs from Google Apps Script with Bearer token authentication.
pub fn webhook(req: Request, _p: Params) -> Result<Response> {
    let conn = db::connect()?;

    // 1. Verify Security: Check Bearer token
    match verify_webhook_token(&conn, &req) {
        Ok(true) => {}
        Ok(false) => {
            return Ok(security::json(
                401,
                serde_json::json!({
                    "error": "unauthorized",
                    "message": "Invalid or missing Bearer token in Authorization header"
                })
                .to_string(),
            ));
        }
        Err(e) => {
            return Ok(security::json(
                500,
                serde_json::json!({ "error": "server_error", "message": e.to_string() }).to_string(),
            ));
        }
    }

    // 2. Parse incoming JSON
    let body = req.body();
    if body.is_empty() {
        return Ok(security::json(
            400,
            serde_json::json!({ "error": "bad_request", "message": "Empty body" }).to_string(),
        ));
    }

    let incoming_list = match parse_incoming_jobs(body) {
        Ok(jobs) => jobs,
        Err(e) => {
            return Ok(security::json(
                400,
                serde_json::json!({
                    "error": "bad_json",
                    "message": format!("Could not parse jobs: {e}")
                })
                .to_string(),
            ));
        }
    };

    let now = now_secs();
    let mut inserted = 0;
    let mut updated = 0;

    // 3. Upsert into SQLite
    for item in &incoming_list {
        let sl_no = value_to_string(item.sl_no.as_ref());
        let job_title = item.job_title.clone().unwrap_or_default().trim().to_string();
        let company = item.company.clone().unwrap_or_default().trim().to_string();
        let salary_package = value_to_string(item.salary_package.as_ref());
        let location = value_to_string(item.location.as_ref());
        let skills_required = value_to_vec_strings(item.skills_required.as_ref()).join(", ");
        let matched_skills = value_to_vec_strings(item.matched_skills.as_ref()).join(", ");
        let job_type = value_to_string(item.job_type.as_ref());
        let experience = value_to_string(item.experience.as_ref());
        let link_to_apply = value_to_string(item.link_to_apply.as_ref());

        // Skip completely blank rows
        if job_title.is_empty() && company.is_empty() && link_to_apply.is_empty() {
            continue;
        }

        // Try to find existing entry
        let existing_id: Option<i64> = if !sl_no.is_empty() {
            conn.execute("SELECT id FROM jobs WHERE sl_no = ? LIMIT 1", &[Value::Text(sl_no.clone())])?
                .rows()
                .next()
                .and_then(|r| r.get::<i64>("id"))
        } else if !link_to_apply.is_empty() {
            conn.execute("SELECT id FROM jobs WHERE link_to_apply = ? LIMIT 1", &[Value::Text(link_to_apply.clone())])?
                .rows()
                .next()
                .and_then(|r| r.get::<i64>("id"))
        } else {
            conn.execute(
                "SELECT id FROM jobs WHERE job_title = ? AND company = ? LIMIT 1",
                &[Value::Text(job_title.clone()), Value::Text(company.clone())],
            )?
            .rows()
            .next()
            .and_then(|r| r.get::<i64>("id"))
        };

        if let Some(id) = existing_id {
            conn.execute(
                "UPDATE jobs SET sl_no = ?, job_title = ?, company = ?, salary_package = ?, \
                 location = ?, skills_required = ?, matched_skills = ?, job_type = ?, \
                 experience = ?, link_to_apply = ?, updated_at = ? WHERE id = ?",
                &[
                    Value::Text(sl_no),
                    Value::Text(job_title),
                    Value::Text(company),
                    Value::Text(salary_package),
                    Value::Text(location),
                    Value::Text(skills_required),
                    Value::Text(matched_skills),
                    Value::Text(job_type),
                    Value::Text(experience),
                    Value::Text(link_to_apply),
                    Value::Integer(now),
                    Value::Integer(id),
                ],
            )?;
            updated += 1;
        } else {
            conn.execute(
                "INSERT INTO jobs (sl_no, job_title, company, salary_package, location, \
                 skills_required, matched_skills, job_type, experience, link_to_apply, \
                 status, notes, source, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', '', 'webhook', ?, ?)",
                &[
                    Value::Text(sl_no),
                    Value::Text(job_title),
                    Value::Text(company),
                    Value::Text(salary_package),
                    Value::Text(location),
                    Value::Text(skills_required),
                    Value::Text(matched_skills),
                    Value::Text(job_type),
                    Value::Text(experience),
                    Value::Text(link_to_apply),
                    Value::Integer(now),
                    Value::Integer(now),
                ],
            )?;
            inserted += 1;
        }
    }

    // 4. Respond to Google Apps Script
    Ok(security::json(
        200,
        serde_json::json!({
            "status": "received",
            "count": incoming_list.len(),
            "inserted": inserted,
            "updated": updated,
            "message": "Jobs processed successfully"
        })
        .to_string(),
    ))
}

/// GET /api/jobs — List jobs with search, status, and type filtering.
pub fn list(req: Request, _p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }

    let url_str = req.header("spin-full-url").and_then(|v| v.as_str()).unwrap_or("");
    let query_pairs: Vec<(String, String)> = form_urlencoded::parse(url_str.split('?').nth(1).unwrap_or("").as_bytes())
        .into_owned()
        .collect();

    let search = query_pairs.iter().find(|(k, _)| k == "search").map(|(_, v)| v.trim().to_string()).unwrap_or_default();
    let status = query_pairs.iter().find(|(k, _)| k == "status").map(|(_, v)| v.trim().to_string()).unwrap_or_default();
    let job_type = query_pairs.iter().find(|(k, _)| k == "type").map(|(_, v)| v.trim().to_string()).unwrap_or_default();

    let mut sql = "SELECT id, sl_no, job_title, company, salary_package, location, \
                   skills_required, matched_skills, job_type, experience, link_to_apply, \
                   status, notes, source, created_at, updated_at \
                   FROM jobs WHERE 1=1".to_string();
    let mut params: Vec<Value> = Vec::new();

    if !search.is_empty() {
        sql.push_str(" AND (job_title LIKE ? OR company LIKE ? OR skills_required LIKE ? OR location LIKE ? OR matched_skills LIKE ?)");
        let pattern = format!("%{search}%");
        params.push(Value::Text(pattern.clone()));
        params.push(Value::Text(pattern.clone()));
        params.push(Value::Text(pattern.clone()));
        params.push(Value::Text(pattern.clone()));
        params.push(Value::Text(pattern));
    }

    if !status.is_empty() && status != "all" {
        sql.push_str(" AND status = ?");
        params.push(Value::Text(status));
    }

    if !job_type.is_empty() && job_type != "all" {
        sql.push_str(" AND job_type LIKE ?");
        params.push(Value::Text(format!("%{job_type}%")));
    }

    sql.push_str(" ORDER BY id DESC LIMIT 500");

    let rows = conn.execute(&sql, &params)?;
    let jobs: Vec<Job> = rows.rows().map(row_to_job).collect();

    Ok(security::json(200, serde_json::to_string(&jobs)?))
}

/// GET /api/jobs/:id — Retrieve single job.
pub fn get(req: Request, p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }
    let id = parse_id(&p);

    let rows = conn.execute(
        "SELECT id, sl_no, job_title, company, salary_package, location, \
         skills_required, matched_skills, job_type, experience, link_to_apply, \
         status, notes, source, created_at, updated_at \
         FROM jobs WHERE id = ?",
        &[Value::Integer(id)],
    )?;

    let job = if let Some(r) = rows.rows().next() {
        Some(row_to_job(r))
    } else {
        None
    };

    if let Some(job) = job {
        Ok(security::json(200, serde_json::to_string(&job)?))
    } else {
        Ok(security::error(404, "not_found"))
    }
}

/// POST /api/jobs — Manual job creation from dashboard.
pub fn create(req: Request, _p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }

    let input: JobInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };

    if input.job_title.trim().is_empty() || input.company.trim().is_empty() {
        return Ok(security::error(400, "title_and_company_required"));
    }

    let now = now_secs();
    let sl_no = input.sl_no.unwrap_or_default();
    let skills_required = input.skills_required.join(", ");
    let matched_skills = input.matched_skills.join(", ");

    conn.execute(
        "INSERT INTO jobs (sl_no, job_title, company, salary_package, location, \
         skills_required, matched_skills, job_type, experience, link_to_apply, \
         status, notes, source, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)",
        &[
            Value::Text(sl_no),
            Value::Text(input.job_title.trim().to_string()),
            Value::Text(input.company.trim().to_string()),
            Value::Text(input.salary_package.trim().to_string()),
            Value::Text(input.location.trim().to_string()),
            Value::Text(skills_required),
            Value::Text(matched_skills),
            Value::Text(input.job_type.trim().to_string()),
            Value::Text(input.experience.trim().to_string()),
            Value::Text(input.link_to_apply.trim().to_string()),
            Value::Text(if input.status.trim().is_empty() { "new".to_string() } else { input.status }),
            Value::Text(input.notes.trim().to_string()),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;

    let id = conn
        .execute("SELECT last_insert_rowid() AS id", &[])?
        .rows()
        .next()
        .and_then(|r| r.get::<i64>("id"))
        .unwrap_or(0);

    Ok(security::json(201, serde_json::json!({ "id": id }).to_string()))
}

/// PUT /api/jobs/:id — Update job fields, status, or notes.
pub fn update(req: Request, p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&p);

    let input: JobInput = match serde_json::from_slice(req.body()) {
        Ok(v) => v,
        Err(_) => return Ok(security::error(400, "bad_json")),
    };

    let now = now_secs();
    let sl_no = input.sl_no.unwrap_or_default();
    let skills_required = input.skills_required.join(", ");
    let matched_skills = input.matched_skills.join(", ");

    conn.execute(
        "UPDATE jobs SET sl_no = ?, job_title = ?, company = ?, salary_package = ?, \
         location = ?, skills_required = ?, matched_skills = ?, job_type = ?, \
         experience = ?, link_to_apply = ?, status = ?, notes = ?, updated_at = ? \
         WHERE id = ?",
        &[
            Value::Text(sl_no),
            Value::Text(input.job_title.trim().to_string()),
            Value::Text(input.company.trim().to_string()),
            Value::Text(input.salary_package.trim().to_string()),
            Value::Text(input.location.trim().to_string()),
            Value::Text(skills_required),
            Value::Text(matched_skills),
            Value::Text(input.job_type.trim().to_string()),
            Value::Text(input.experience.trim().to_string()),
            Value::Text(input.link_to_apply.trim().to_string()),
            Value::Text(input.status),
            Value::Text(input.notes.trim().to_string()),
            Value::Integer(now),
            Value::Integer(id),
        ],
    )?;

    Ok(security::json(200, "{\"status\":\"ok\"}".to_string()))
}

/// DELETE /api/jobs/:id — Delete single job.
pub fn delete(req: Request, p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }
    let id = parse_id(&p);

    conn.execute("DELETE FROM jobs WHERE id = ?", &[Value::Integer(id)])?;
    Ok(security::json(200, "{\"status\":\"ok\"}".to_string()))
}

/// DELETE /api/jobs — Clear all jobs.
pub fn clear_all(req: Request, _p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }

    conn.execute("DELETE FROM jobs", &[])?;
    Ok(security::json(200, "{\"status\":\"ok\"}".to_string()))
}

/// GET /api/jobs/webhook-config — Get current webhook URL, secret, and GAS code template.
pub fn get_webhook_config(req: Request, _p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, false)? {
        return Ok(resp);
    }

    let secret = get_or_init_webhook_secret(&conn)?;

    let base_url = req
        .header("spin-full-url")
        .and_then(|v| v.as_str())
        .map(|u| {
            if let Some(pos) = u.find("/api/") {
                u[..pos].to_string()
            } else {
                "https://utility.fermyon.app".to_string()
            }
        })
        .unwrap_or_else(|| "https://utility.fermyon.app".to_string());

    let webhook_url = format!("{base_url}/api/webhook");

    let curl_sample = format!(
        "curl -X POST {webhook_url} \\\n  -H \"Content-Type: application/json\" \\\n  -H \"Authorization: Bearer {secret}\" \\\n  -d '[{{\"slNo\": 1, \"jobTitle\": \"Rust Engineer\", \"company\": \"Acme Corp\", \"salaryPackage\": \"$140k\", \"location\": \"Remote\", \"skillsRequired\": \"Rust, SQLite\", \"matchedSkills\": \"Rust\", \"type\": \"Full-Time\", \"experience\": \"2+ yrs\", \"linkToApply\": \"https://example.com/apply\"}}]'"
    );

    let gas_code_sample = format!(
r#"/**
 * Google Apps Script Webhook Trigger for Toolbox Jobs
 * Paste this in your Google Apps Script editor (Extensions > Apps Script in Google Sheets).
 */
function sendJobsToToolbox() {{
  var WEBHOOK_URL = "{webhook_url}";
  var WEBHOOK_SECRET = "{secret}";

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var jobs = [];
  // Assumes row 0 has headers, rows 1..N have data
  for (var i = 1; i < data.length; i++) {{
    var row = data[i];
    if (!row[1] && !row[2]) continue; // Skip blank rows

    jobs.push({{
      slNo: row[0],
      jobTitle: row[1],
      company: row[2],
      salaryPackage: row[3],
      location: row[4],
      skillsRequired: row[5],
      matchedSkills: row[6],
      type: row[7],
      experience: row[8],
      linkToApply: row[9]
    }});
  }}

  var options = {{
    method: "post",
    contentType: "application/json",
    headers: {{
      "Authorization": "Bearer " + WEBHOOK_SECRET
    }},
    payload: JSON.stringify(jobs),
    muteHttpExceptions: true
  }};

  var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log("Toolbox Webhook Response: " + response.getContentText());
}}"#
    );

    let resp = WebhookConfigResponse {
        webhook_url,
        webhook_secret: secret,
        curl_sample,
        gas_code_sample,
    };

    Ok(security::json(200, serde_json::to_string(&resp)?))
}

/// POST /api/jobs/webhook-config — Update or regenerate webhook secret.
pub fn update_webhook_config(req: Request, _p: Params) -> Result<Response> {
    let conn = db::connect()?;
    if let Err(resp) = authorize(&conn, &req, true)? {
        return Ok(resp);
    }

    let input: UpdateWebhookConfigInput = serde_json::from_slice(req.body()).unwrap_or(UpdateWebhookConfigInput {
        webhook_secret: None,
    });

    let new_secret = if let Some(custom) = input.webhook_secret {
        let trimmed = custom.trim();
        if trimmed.len() < 8 {
            return Ok(security::error(400, "secret_too_short"));
        }
        trimmed.to_string()
    } else {
        let mut bytes = [0u8; 24];
        getrandom::getrandom(&mut bytes).map_err(|e| anyhow!("getrandom: {e}"))?;
        format!("whsec_{}", hex::encode(bytes))
    };

    let now = now_secs();
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('webhook_secret', ?, ?)",
        &[Value::Text(new_secret.clone()), Value::Integer(now)],
    )?;

    Ok(security::json(
        200,
        serde_json::json!({ "status": "ok", "webhook_secret": new_secret }).to_string(),
    ))
}
