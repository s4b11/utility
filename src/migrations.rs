use anyhow::Result;
use spin_sdk::sqlite::{Connection, Value};
use std::sync::OnceLock;

/// Runs at most once per warm wasm instance.
static INIT: OnceLock<()> = OnceLock::new();

/// Ordered, embedded migrations. Add new tuples to extend; never edit applied ones.
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/0001_init.sql")),
    (2, include_str!("../migrations/0002_productivity.sql")),
    (3, include_str!("../migrations/0003_wallet.sql")),
    (4, include_str!("../migrations/0004_2fa.sql")),
    (5, include_str!("../migrations/0005_jobs.sql")),
    (6, include_str!("../migrations/0006_agent.sql")),
    (7, include_str!("../migrations/0007_email.sql")),
    (8, include_str!("../migrations/0008_notifications.sql")),
];

/// Idempotently create the schema. Safe to call on every request and across cold instances.
pub fn ensure_schema(conn: &Connection) -> Result<()> {
    if INIT.get().is_some() {
        return Ok(());
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
        &[],
    )?;

    let current: i64 = conn
        .execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations", &[])?
        .rows()
        .next()
        .and_then(|r| r.get::<i64>("v"))
        .unwrap_or(0);

    for (version, sql) in MIGRATIONS {
        if *version > current {
            // `execute` runs a single statement, so split the file on ';'.
            for stmt in sql.split(';').map(str::trim).filter(|s| !s.is_empty()) {
                conn.execute(stmt, &[])?;
            }
            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                &[Value::Integer(*version), Value::Integer(crate::db::now_secs())],
            )?;
        }
    }

    let _ = INIT.set(());
    Ok(())
}
