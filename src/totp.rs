//! TOTP (RFC 6238, HMAC-SHA1, 6 digits, 30s) for Google Authenticator, plus
//! base32, the `otpauth://` URI, an SVG QR code, and one-time recovery codes.

use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha1 = Hmac<Sha1>;

const B32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// A fresh 160-bit secret (the Authenticator standard).
pub fn generate_secret() -> [u8; 20] {
    let mut s = [0u8; 20];
    getrandom::getrandom(&mut s).expect("getrandom failed");
    s
}

/// RFC 4648 base32 (uppercase, no padding) — what Authenticator apps expect.
pub fn base32_encode(data: &[u8]) -> String {
    let mut out = String::new();
    let mut buffer: u32 = 0;
    let mut bits = 0u32;
    for &b in data {
        buffer = (buffer << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(B32[((buffer >> bits) & 0x1f) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(B32[((buffer << (5 - bits)) & 0x1f) as usize] as char);
    }
    out
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Build the `otpauth://totp/...` provisioning URI for QR / manual entry.
pub fn otpauth_uri(account: &str, secret_b32: &str) -> String {
    let issuer = "Toolbox";
    let label = url_encode(&format!("{issuer}:{account}"));
    format!("otpauth://totp/{label}?secret={secret_b32}&issuer={issuer}&algorithm=SHA1&digits=6&period=30")
}

fn hotp(secret: &[u8], counter: u64) -> u32 {
    let mut mac = HmacSha1::new_from_slice(secret).expect("hmac key");
    mac.update(&counter.to_be_bytes());
    let d = mac.finalize().into_bytes();
    let off = (d[19] & 0x0f) as usize;
    let bin = ((d[off] as u32 & 0x7f) << 24)
        | ((d[off + 1] as u32) << 16)
        | ((d[off + 2] as u32) << 8)
        | (d[off + 3] as u32);
    bin % 1_000_000
}

/// The current 6-digit code (mainly for tests).
#[allow(dead_code)]
pub fn current_code(secret: &[u8], now: i64) -> String {
    format!("{:06}", hotp(secret, (now / 30) as u64))
}

/// Verify a 6-digit code within `±skew` 30-second windows (constant-time compare).
pub fn verify(secret: &[u8], code: &str, now: i64, skew: i64) -> bool {
    let code = code.trim();
    if code.len() != 6 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let counter = now / 30;
    for c in (counter - skew)..=(counter + skew) {
        if c < 0 {
            continue;
        }
        let expected = format!("{:06}", hotp(secret, c as u64));
        if bool::from(expected.as_bytes().ct_eq(code.as_bytes())) {
            return true;
        }
    }
    false
}

/// Render the provisioning URI as a self-contained SVG string. `None` on failure.
pub fn qr_svg(uri: &str) -> Option<String> {
    use qrcode::render::svg;
    use qrcode::{EcLevel, QrCode};
    let code = QrCode::with_error_correction_level(uri.as_bytes(), EcLevel::M).ok()?;
    let image = code
        .render::<svg::Color>()
        .min_dimensions(220, 220)
        .dark_color(svg::Color("#18181b"))
        .light_color(svg::Color("#ffffff"))
        .quiet_zone(true)
        .build();
    Some(image)
}

/// `n` one-time recovery codes formatted `xxxx-xxxx`.
pub fn gen_recovery_codes(n: usize) -> Vec<String> {
    let mut codes = Vec::with_capacity(n);
    for _ in 0..n {
        let mut buf = [0u8; 4];
        getrandom::getrandom(&mut buf).expect("getrandom failed");
        let s = format!("{:08x}", u32::from_be_bytes(buf));
        codes.push(format!("{}-{}", &s[0..4], &s[4..8]));
    }
    codes
}

/// SHA-256 hex (used to store recovery codes without keeping them in the clear).
pub fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.trim().as_bytes());
    hex::encode(h.finalize())
}
