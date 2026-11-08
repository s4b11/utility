use anyhow::{anyhow, Result};
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use sha2::{Digest, Sha256};
use spin_sdk::http::Request;
use spin_sdk::sqlite::{Connection, Value};
use subtle::ConstantTimeEq;

use crate::db::now_secs;

pub const SESSION_COOKIE: &str = "session";
const REMEMBER_MAX_AGE: i64 = 60 * 60 * 24 * 30; // 30 days
const SESSION_TTL: i64 = 60 * 60 * 8; // 8 hours
const MAX_FAILS: i64 = 5;
const LOCK_BASE_SECS: i64 = 60;

pub struct Session {
    pub user_id: i64,
    pub csrf_secret: String,
}

// --------------------------- passwords ---------------------------

pub fn hash_password(password: &str) -> Result<String> {
    let mut salt_bytes = [0u8; 16];
    getrandom::getrandom(&mut salt_bytes).map_err(|e| anyhow!("rng: {e}"))?;
    let salt = SaltString::encode_b64(&salt_bytes).map_err(|e| anyhow!("salt: {e}"))?;
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow!("hash: {e}"))?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, phc: &str) -> bool {
    match PasswordHash::new(phc) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

// ------------------------- random / hashing -------------------------

fn random_hex(n: usize) -> String {
    let mut buf = vec![0u8; n];
    getrandom::getrandom(&mut buf).expect("getrandom failed");
    hex::encode(buf)
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

// ---------------------------- sessions ----------------------------

/// Create a session row and return (raw_token, csrf_secret). Only the token hash is stored.
pub fn create_session(conn: &Connection, user_id: i64, remember: bool) -> Result<(String, String)> {
    let raw_token = random_hex(32);
    let csrf_secret = random_hex(16);
    let now = now_secs();
    let ttl = if remember { REMEMBER_MAX_AGE } else { SESSION_TTL };
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, csrf_secret, created_at, expires_at, remember, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        &[
            Value::Text(sha256_hex(&raw_token)),
            Value::Integer(user_id),
            Value::Text(csrf_secret.clone()),
            Value::Integer(now),
            Value::Integer(now + ttl),
            Value::Integer(if remember { 1 } else { 0 }),
            Value::Integer(now),
        ],
    )?;
    // Opportunistic cleanup of expired sessions.
    let _ = conn.execute(
        "DELETE FROM sessions WHERE expires_at < ?",
        &[Value::Integer(now)],
    );
    Ok((raw_token, csrf_secret))
}

pub fn destroy_session(conn: &Connection, raw_token: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM sessions WHERE token_hash = ?",
        &[Value::Text(sha256_hex(raw_token))],
    )?;
    Ok(())
}

/// Extracts the session token from Authorization header, X-Session-Token header, or cookie.
pub fn extract_session_token(req: &Request) -> Option<String> {
    // 1. Authorization: Bearer <token>
    if let Some(auth_val) = req.header("authorization").and_then(|v| v.as_str()) {
        let trimmed = auth_val.trim();
        if let Some(token) = trimmed.strip_prefix("Bearer ").or_else(|| trimmed.strip_prefix("bearer ")) {
            let t = token.trim().trim_matches('"').trim_matches('\'');
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    // 2. X-Session-Token: <token>
    if let Some(tok) = req.header("x-session-token").and_then(|v| v.as_str()) {
        let t = tok.trim().trim_matches('"').trim_matches('\'');
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    // 3. Fallback: session_id cookie
    cookie_value(req, SESSION_COOKIE)
}

/// Returns the active session for the request, if valid and unexpired.
pub fn require_session(conn: &Connection, req: &Request) -> Result<Option<Session>> {
    let Some(raw) = extract_session_token(req) else {
        return Ok(None);
    };
    let res = conn.execute(
        "SELECT user_id, csrf_secret, expires_at FROM sessions WHERE token_hash = ?",
        &[Value::Text(sha256_hex(&raw))],
    )?;
    let Some(row) = res.rows().next() else {
        return Ok(None);
    };
    if row.get::<i64>("expires_at").unwrap_or(0) <= now_secs() {
        return Ok(None);
    }
    Ok(Some(Session {
        user_id: row.get::<i64>("user_id").unwrap_or(0),
        csrf_secret: row.get::<&str>("csrf_secret").unwrap_or_default().to_string(),
    }))
}

/// Constant-time check of the X-CSRF-Token header against the session secret.
/// If request is authenticated via Bearer token or X-Session-Token, CSRF is inherently mitigated.
pub fn csrf_ok(req: &Request, session: &Session) -> bool {
    if req.header("authorization").is_some() || req.header("x-session-token").is_some() {
        return true;
    }
    match req.header("x-csrf-token").and_then(|v| v.as_str()) {
        Some(token) => bool::from(token.as_bytes().ct_eq(session.csrf_secret.as_bytes())),
        None => false,
    }
}

// ----------------------------- cookies -----------------------------

pub fn cookie_value(req: &Request, name: &str) -> Option<String> {
    let header = req.header("cookie")?.as_str()?;
    for part in header.split(';') {
        if let Some((k, v)) = part.trim().split_once('=') {
            if k.trim() == name {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

/// HTTPS is assumed unless the request URL is plain http (e.g. local dev).
pub fn request_is_secure(req: &Request) -> bool {
    req.header("spin-full-url")
        .and_then(|v| v.as_str())
        .map(|u| u.starts_with("https://"))
        .unwrap_or(true)
}

pub fn session_cookie(raw_token: &str, remember: bool, secure: bool) -> String {
    let mut c = format!("{SESSION_COOKIE}={raw_token}; HttpOnly; SameSite=Strict; Path=/");
    if secure {
        c.push_str("; Secure");
    }
    if remember {
        c.push_str(&format!("; Max-Age={REMEMBER_MAX_AGE}"));
    }
    c
}

pub fn clear_cookie(secure: bool) -> String {
    let mut c = format!("{SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    if secure {
        c.push_str("; Secure");
    }
    c
}

// -------------------------- login throttle --------------------------

pub fn is_locked(conn: &Connection, username: &str) -> Result<bool> {
    let res = conn.execute(
        "SELECT locked_until FROM login_attempts WHERE username = ?",
        &[Value::Text(username.to_string())],
    )?;
    let locked = res
        .rows()
        .next()
        .and_then(|r| r.get::<i64>("locked_until"))
        .unwrap_or(0);
    Ok(locked > now_secs())
}

pub fn record_failure(conn: &Connection, username: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO login_attempts (username, failed_count, locked_until) VALUES (?, 1, 0)
         ON CONFLICT(username) DO UPDATE SET failed_count = failed_count + 1",
        &[Value::Text(username.to_string())],
    )?;
    let count = conn
        .execute(
            "SELECT failed_count FROM login_attempts WHERE username = ?",
            &[Value::Text(username.to_string())],
        )?
        .rows()
        .next()
        .and_then(|r| r.get::<i64>("failed_count"))
        .unwrap_or(0);
    if count >= MAX_FAILS {
        let over = (count - MAX_FAILS).min(5) as u32;
        let lock = LOCK_BASE_SECS * (1_i64 << over);
        conn.execute(
            "UPDATE login_attempts SET locked_until = ? WHERE username = ?",
            &[
                Value::Integer(now_secs() + lock),
                Value::Text(username.to_string()),
            ],
        )?;
    }
    Ok(())
}

pub fn record_success(conn: &Connection, username: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM login_attempts WHERE username = ?",
        &[Value::Text(username.to_string())],
    )?;
    Ok(())
}
