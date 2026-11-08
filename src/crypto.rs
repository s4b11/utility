//! At-rest encryption for wallet secrets (AES-256-GCM).
//!
//! The key never touches the database: it comes from the Spin variable
//! `wallet_key` (a Fermyon Cloud secret / SPIN_VARIABLE_WALLET_KEY locally) and
//! is stretched to 32 bytes with SHA-256. Each value is encrypted with a fresh
//! random 96-bit nonce and the field name as AAD, stored as
//! `v1:<hex nonce>:<hex ciphertext>`. Values without the `v1:` prefix are
//! treated as legacy plaintext and pass through on read (they are re-encrypted
//! lazily by the wallet list healers in `db.rs`).

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{anyhow, Result};
use sha2::{Digest, Sha256};

const PREFIX: &str = "v1:";
const UNREADABLE: &str = "(unreadable)";

fn cipher() -> Result<Aes256Gcm> {
    let raw = spin_sdk::variables::get("wallet_key")
        .map_err(|e| anyhow!("wallet_key variable unavailable: {e}"))?;
    let raw = raw.trim().to_string();
    if raw.is_empty() {
        return Err(anyhow!("wallet_key variable is empty"));
    }
    let mut h = Sha256::new();
    h.update(raw.as_bytes());
    let key = h.finalize();
    Aes256Gcm::new_from_slice(&key).map_err(|e| anyhow!("bad key: {e}"))
}

/// True when an encryption key is configured (used by the lazy healers).
pub fn key_available() -> bool {
    spin_sdk::variables::get("wallet_key")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

/// True when a stored value is already in encrypted form.
pub fn is_encrypted(stored: &str) -> bool {
    stored.starts_with(PREFIX)
}

/// Encrypt a sensitive field for storage. Empty input stays empty.
pub fn encrypt_field(field: &str, plain: &str) -> Result<String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    let c = cipher()?;
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| anyhow!("rng: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = c
        .encrypt(
            nonce,
            Payload {
                msg: plain.as_bytes(),
                aad: field.as_bytes(),
            },
        )
        .map_err(|_| anyhow!("encrypt failed"))?;
    Ok(format!(
        "{PREFIX}{}:{}",
        hex::encode(nonce_bytes),
        hex::encode(ct)
    ))
}

/// Decrypt a stored field for an authenticated response. Legacy plaintext
/// (no `v1:` prefix) passes through; undecryptable values degrade gracefully.
pub fn decrypt_field(field: &str, stored: &str) -> String {
    if !is_encrypted(stored) {
        return stored.to_string();
    }
    let body = &stored[PREFIX.len()..];
    let Some((nhex, chex)) = body.split_once(':') else {
        return UNREADABLE.to_string();
    };
    let (Ok(nb), Ok(cb)) = (hex::decode(nhex), hex::decode(chex)) else {
        return UNREADABLE.to_string();
    };
    if nb.len() != 12 {
        return UNREADABLE.to_string();
    }
    let Ok(c) = cipher() else {
        return UNREADABLE.to_string();
    };
    match c.decrypt(
        Nonce::from_slice(&nb),
        Payload {
            msg: &cb,
            aad: field.as_bytes(),
        },
    ) {
        Ok(pt) => String::from_utf8(pt).unwrap_or_else(|_| UNREADABLE.to_string()),
        Err(_) => UNREADABLE.to_string(),
    }
}
