//! In-app notifications: computed on request from the data already stored (tasks, events,
//! reminders, jobs, cards, the email log), with read / dismissed state per notification key.
//! No push service: the app polls `GET /api/notifications` while it is open.
//!
//! A key names one fact at one time (`task-overdue:12:1730000000`), so a task moved to a new
//! due date, or a new job arriving, produces a new key and shows up as unread again.

use anyhow::Result;
use serde::Serialize;
use spin_sdk::sqlite::{Connection, Value};
use std::collections::{HashMap, HashSet};

use crate::db;
use crate::recurrence::occurrences;

const HOUR: i64 = 60 * 60;
const DAY: i64 = 24 * HOUR;
/// How far ahead "coming up" looks for tasks and events.
const SOON: i64 = DAY;
/// Read / dismissed state older than this is forgotten.
const STATE_TTL: i64 = 90 * DAY;
const MAX_OVERDUE: i64 = 30;

#[derive(Serialize, Clone, Debug)]
pub struct Notification {
    pub key: String,
    /// task_overdue | task_due | event_soon | reminder | jobs_new | card_expiring | card_expired | email_failed
    pub kind: String,
    pub title: String,
    pub body: String,
    /// The moment the notification is about (due, start, fire or created time), epoch seconds.
    pub at: i64,
    /// App tab that shows the item.
    pub tab: String,
    pub item_id: Option<i64>,
    pub reminder_id: Option<i64>,
    pub read: bool,
}

#[derive(Serialize)]
pub struct NotificationList {
    pub items: Vec<Notification>,
    pub unread: usize,
}

fn note(kind: &str, key: String, title: String, body: String, at: i64, tab: &str, item_id: Option<i64>) -> Notification {
    Notification {
        key,
        kind: kind.to_string(),
        title,
        body,
        at,
        tab: tab.to_string(),
        item_id,
        reminder_id: None,
        read: false,
    }
}

/// Everything that currently deserves the owner's attention, newest state applied.
pub fn list(conn: &Connection, now: i64) -> Result<NotificationList> {
    let mut items: Vec<Notification> = Vec::new();

    // Due reminders (snooze / dismiss act on these); remember their parents to avoid repeats.
    let mut reminded: HashSet<(String, i64)> = HashSet::new();
    for r in db::due_reminders(conn, now)? {
        reminded.insert((r.parent_type.clone(), r.parent_id));
        let tab = match r.parent_type.as_str() {
            "task" => "tasks",
            "event" => "calendar",
            _ => "notes",
        };
        let mut n = note(
            "reminder",
            format!("reminder:{}:{}", r.reminder_id, r.fire_at),
            r.parent_title.clone(),
            format!("Reminder for this {}", r.parent_type),
            r.fire_at,
            tab,
            Some(r.parent_id),
        );
        n.reminder_id = Some(r.reminder_id);
        items.push(n);
    }

    // Tasks: one-off tasks past due are overdue; any open task due within a day is coming up.
    let tasks = db::open_tasks_with_due(conn)?;
    let mut overdue = 0;
    for (id, title, due, rule) in &tasks {
        if !rule.is_recurring() && *due < now {
            if overdue < MAX_OVERDUE {
                overdue += 1;
                items.push(note(
                    "task_overdue",
                    format!("task-overdue:{id}:{due}"),
                    title.clone(),
                    "Overdue".to_string(),
                    *due,
                    "tasks",
                    Some(*id),
                ));
            }
            continue;
        }
        if reminded.contains(&("task".to_string(), *id)) {
            continue;
        }
        if let Some(occ) = occurrences(*due, rule, now, now + SOON).into_iter().next() {
            items.push(note(
                "task_due",
                format!("task-due:{id}:{occ}"),
                title.clone(),
                "Due soon".to_string(),
                occ,
                "tasks",
                Some(*id),
            ));
        }
    }

    // Events starting within a day (all-day events: today's too).
    for (id, title, start, all_day, rule) in db::events_for_notifications(conn)? {
        if reminded.contains(&("event".to_string(), id)) {
            continue;
        }
        let from = if all_day { now - 12 * HOUR } else { now };
        if let Some(occ) = occurrences(start, &rule, from, now + SOON).into_iter().next() {
            items.push(note(
                "event_soon",
                format!("event:{id}:{occ}"),
                title,
                if all_day { "All-day event".to_string() } else { "Starts soon".to_string() },
                occ,
                "calendar",
                Some(id),
            ));
        }
    }

    // New jobs from the last week, as one summary that changes key with each new arrival.
    if let Some((count, latest_id, latest_at, latest)) = db::recent_new_jobs(conn, now - 7 * DAY)? {
        items.push(note(
            "jobs_new",
            format!("jobs-new:{latest_id}"),
            if count == 1 { "1 new job".to_string() } else { format!("{count} new jobs") },
            format!("Latest: {latest}"),
            latest_at,
            "jobs",
            None,
        ));
    }

    // Cards expiring this month or next, or expired within the last two months.
    let (year, month) = year_month(now);
    for (id, name, expiry) in db::card_expiries(conn)? {
        let Some((ey, em)) = parse_expiry(&expiry) else { continue };
        let diff = months_between(year, month, ey, em);
        let (kind, body) = match diff {
            0 => ("card_expiring", "Expires this month".to_string()),
            1 => ("card_expiring", "Expires next month".to_string()),
            -2..=-1 => ("card_expired", format!("Expired {expiry}")),
            _ => continue,
        };
        items.push(note(kind, format!("card:{id}:{expiry}"), name, body, now, "wallet", Some(id)));
    }

    // Emails that failed to send in the last week.
    for (id, to, subject, at) in db::recent_failed_emails(conn, now - 7 * DAY)? {
        items.push(note(
            "email_failed",
            format!("email-failed:{id}"),
            format!("Email to {to} failed"),
            subject,
            at,
            "email",
            Some(id),
        ));
    }

    // Apply read / dismissed state.
    let state = load_state(conn, now)?;
    items.retain(|n| !matches!(state.get(&n.key), Some((_, true))));
    for n in &mut items {
        n.read = matches!(state.get(&n.key), Some((true, _)));
    }
    let unread = items.iter().filter(|n| !n.read).count();
    Ok(NotificationList { items, unread })
}

/// key -> (read, dismissed). Also forgets stale state.
fn load_state(conn: &Connection, now: i64) -> Result<HashMap<String, (bool, bool)>> {
    conn.execute(
        "DELETE FROM notification_state WHERE COALESCE(dismissed_at, read_at, 0) < ?",
        &[Value::Integer(now - STATE_TTL)],
    )?;
    let res = conn.execute("SELECT key, read_at, dismissed_at FROM notification_state", &[])?;
    Ok(res
        .rows()
        .map(|r| {
            (
                r.get::<&str>("key").unwrap_or_default().to_string(),
                (r.get::<i64>("read_at").is_some(), r.get::<i64>("dismissed_at").is_some()),
            )
        })
        .collect())
}

/// Mark keys read (`dismiss = false`) or dismissed.
pub fn mark(conn: &Connection, keys: &[String], dismiss: bool, now: i64) -> Result<()> {
    let sql = if dismiss {
        "INSERT INTO notification_state (key, read_at, dismissed_at) VALUES (?, ?, ?) \
         ON CONFLICT(key) DO UPDATE SET dismissed_at = excluded.dismissed_at, read_at = COALESCE(read_at, excluded.read_at)"
    } else {
        "INSERT INTO notification_state (key, read_at, dismissed_at) VALUES (?, ?, NULL) \
         ON CONFLICT(key) DO UPDATE SET read_at = COALESCE(read_at, excluded.read_at)"
    };
    for key in keys {
        let mut params = vec![Value::Text(key.clone()), Value::Integer(now)];
        if dismiss {
            params.push(Value::Integer(now));
        }
        conn.execute(sql, &params)?;
    }
    Ok(())
}

/// A key the API accepts: short, printable, of the shapes `list` produces.
pub fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 80
        && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b':' || b == b'-' || b == b'/')
}

/// "MM/YY", "MM/YYYY", "MM-YY" -> (year, month).
pub fn parse_expiry(s: &str) -> Option<(i64, i64)> {
    let s = s.trim();
    let (m, y) = s.split_once(['/', '-'])?;
    let month: i64 = m.trim().parse().ok()?;
    let y = y.trim();
    let year: i64 = match y.len() {
        2 => 2000 + y.parse::<i64>().ok()?,
        4 => y.parse().ok()?,
        _ => return None,
    };
    (1..=12).contains(&month).then_some((year, month))
}

/// Whole months from (y1, m1) to (y2, m2).
pub fn months_between(y1: i64, m1: i64, y2: i64, m2: i64) -> i64 {
    (y2 * 12 + m2) - (y1 * 12 + m1)
}

/// UTC (year, month) of an epoch-seconds time (civil-from-days).
pub fn year_month(secs: i64) -> (i64, i64) {
    let z = secs.div_euclid(DAY) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    (year, month)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_card_expiry_formats() {
        assert_eq!(parse_expiry("08/27"), Some((2027, 8)));
        assert_eq!(parse_expiry(" 12/2026 "), Some((2026, 12)));
        assert_eq!(parse_expiry("1-30"), Some((2030, 1)));
        assert_eq!(parse_expiry("13/27"), None);
        assert_eq!(parse_expiry("0827"), None);
        assert_eq!(parse_expiry(""), None);
    }

    #[test]
    fn computes_year_month_and_month_gaps() {
        assert_eq!(year_month(0), (1970, 1));
        assert_eq!(year_month(1_794_960_000), (2026, 11)); // 2026-11-17
        assert_eq!(year_month(1_798_675_200), (2026, 12)); // 2026-12-31
        assert_eq!(year_month(1_798_761_600), (2027, 1)); // 2027-01-01
        assert_eq!(months_between(2026, 11, 2026, 12), 1);
        assert_eq!(months_between(2026, 12, 2027, 1), 1);
        assert_eq!(months_between(2026, 11, 2026, 9), -2);
    }

    #[test]
    fn validates_keys() {
        assert!(valid_key("task-overdue:12:1730000000"));
        assert!(valid_key("card:3:08/27"));
        assert!(!valid_key(""));
        assert!(!valid_key("x'; DROP TABLE"));
        assert!(!valid_key(&"a".repeat(81)));
    }
}
