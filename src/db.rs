use anyhow::Result;
use spin_sdk::sqlite::{Connection, Row, Value};
use std::time::{SystemTime, UNIX_EPOCH};

use std::collections::HashMap;

use crate::models::{
    BankAccount, BankAccountInput, CalendarItem, Card, CardInput, Command, CommandInput,
    DueReminder, Event, EventInput, Link, LinkInput, Note, NoteInput, Recurrence, Reminder,
    ReminderInput, Task, TaskInput,
};
use crate::recurrence::{occurrences, Rule};

/// Open the default database and ensure the schema exists (guarded, runs once per instance).
pub fn connect() -> Result<Connection> {
    let conn = Connection::open_default()?;
    crate::migrations::ensure_schema(&conn)?;
    Ok(conn)
}

/// Current unix time in seconds.
pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Normalize a list of tags into a comma-wrapped, lowercased, de-duplicated string: ",a,b,".
pub fn normalize_tags(tags: &[String]) -> String {
    let mut cleaned: Vec<String> = Vec::new();
    for t in tags {
        let t = t.trim().to_lowercase();
        if !t.is_empty() && !cleaned.iter().any(|e| e == &t) {
            cleaned.push(t);
        }
    }
    if cleaned.is_empty() {
        String::new()
    } else {
        format!(",{},", cleaned.join(","))
    }
}

/// Split a stored comma-wrapped tag string back into a list.
pub fn split_tags(stored: &str) -> Vec<String> {
    stored
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn last_insert_id(conn: &Connection) -> Result<i64> {
    let res = conn.execute("SELECT last_insert_rowid() AS id", &[])?;
    let id = res.rows().next().and_then(|r| r.get::<i64>("id")).unwrap_or(0);
    Ok(id)
}

fn like_filter(term: &str) -> String {
    format!("%{}%", term)
}

// ----------------------------- Commands -----------------------------

fn row_to_command(r: &Row<'_>) -> Command {
    Command {
        id: r.get::<i64>("id").unwrap_or_default(),
        title: r.get::<&str>("title").unwrap_or_default().to_string(),
        command: r.get::<&str>("command_text").unwrap_or_default().to_string(),
        description: r.get::<&str>("description").unwrap_or_default().to_string(),
        category: r.get::<&str>("category").unwrap_or_default().to_string(),
        tags: split_tags(r.get::<&str>("tags").unwrap_or_default()),
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}

pub fn list_commands(
    conn: &Connection,
    q: Option<&str>,
    category: Option<&str>,
    tag: Option<&str>,
) -> Result<Vec<Command>> {
    let mut sql = String::from(
        "SELECT id,title,command_text,description,category,tags,created_at,updated_at FROM commands WHERE 1=1",
    );
    let mut args: Vec<Value> = Vec::new();
    if let Some(q) = q.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND (title LIKE ? OR description LIKE ? OR command_text LIKE ?)");
        let like = like_filter(q);
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like));
    }
    if let Some(c) = category.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND category = ?");
        args.push(Value::Text(c.to_string()));
    }
    if let Some(t) = tag.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND tags LIKE ?");
        args.push(Value::Text(format!("%,{},%", t.to_lowercase())));
    }
    sql.push_str(" ORDER BY updated_at DESC");
    let res = conn.execute(&sql, &args)?;
    let items: Vec<Command> = res.rows().map(|r| row_to_command(&r)).collect();
    Ok(items)
}

pub fn get_command(conn: &Connection, id: i64) -> Result<Option<Command>> {
    let res = conn.execute(
        "SELECT id,title,command_text,description,category,tags,created_at,updated_at FROM commands WHERE id = ?",
        &[Value::Integer(id)],
    )?;
    let item = res.rows().next().map(|r| row_to_command(&r));
    Ok(item)
}

pub fn insert_command(conn: &Connection, input: &CommandInput) -> Result<i64> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO commands (title, command_text, description, category, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.command.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Text(input.category.trim().to_string()),
            Value::Text(normalize_tags(&input.tags)),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}

pub fn update_command(conn: &Connection, id: i64, input: &CommandInput) -> Result<()> {
    conn.execute(
        "UPDATE commands SET title=?, command_text=?, description=?, category=?, tags=?, updated_at=? WHERE id=?",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.command.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Text(input.category.trim().to_string()),
            Value::Text(normalize_tags(&input.tags)),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}

pub fn delete_command(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM commands WHERE id = ?", &[Value::Integer(id)])?;
    Ok(())
}

// ------------------------------- Links -------------------------------

fn row_to_link(r: &Row<'_>) -> Link {
    Link {
        id: r.get::<i64>("id").unwrap_or_default(),
        title: r.get::<&str>("title").unwrap_or_default().to_string(),
        url: r.get::<&str>("url").unwrap_or_default().to_string(),
        description: r.get::<&str>("description").unwrap_or_default().to_string(),
        category: r.get::<&str>("category").unwrap_or_default().to_string(),
        tags: split_tags(r.get::<&str>("tags").unwrap_or_default()),
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}

pub fn list_links(
    conn: &Connection,
    q: Option<&str>,
    category: Option<&str>,
    tag: Option<&str>,
) -> Result<Vec<Link>> {
    let mut sql = String::from(
        "SELECT id,title,url,description,category,tags,created_at,updated_at FROM links WHERE 1=1",
    );
    let mut args: Vec<Value> = Vec::new();
    if let Some(q) = q.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND (title LIKE ? OR description LIKE ? OR url LIKE ?)");
        let like = like_filter(q);
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like));
    }
    if let Some(c) = category.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND category = ?");
        args.push(Value::Text(c.to_string()));
    }
    if let Some(t) = tag.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND tags LIKE ?");
        args.push(Value::Text(format!("%,{},%", t.to_lowercase())));
    }
    sql.push_str(" ORDER BY updated_at DESC");
    let res = conn.execute(&sql, &args)?;
    let items: Vec<Link> = res.rows().map(|r| row_to_link(&r)).collect();
    Ok(items)
}

pub fn get_link(conn: &Connection, id: i64) -> Result<Option<Link>> {
    let res = conn.execute(
        "SELECT id,title,url,description,category,tags,created_at,updated_at FROM links WHERE id = ?",
        &[Value::Integer(id)],
    )?;
    let item = res.rows().next().map(|r| row_to_link(&r));
    Ok(item)
}

pub fn insert_link(conn: &Connection, input: &LinkInput) -> Result<i64> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO links (title, url, description, category, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.url.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Text(input.category.trim().to_string()),
            Value::Text(normalize_tags(&input.tags)),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}

pub fn update_link(conn: &Connection, id: i64, input: &LinkInput) -> Result<()> {
    conn.execute(
        "UPDATE links SET title=?, url=?, description=?, category=?, tags=?, updated_at=? WHERE id=?",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.url.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Text(input.category.trim().to_string()),
            Value::Text(normalize_tags(&input.tags)),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}

pub fn delete_link(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM links WHERE id = ?", &[Value::Integer(id)])?;
    Ok(())
}

// =========================== Productivity ===========================

fn opt_int(v: Option<i64>) -> Value {
    v.map(Value::Integer).unwrap_or(Value::Null)
}
fn byday_to_csv(byday: &[i64]) -> String {
    let nums: Vec<String> = byday
        .iter()
        .filter(|n| (0..=6).contains(*n))
        .map(|n| n.to_string())
        .collect();
    if nums.is_empty() {
        String::new()
    } else {
        format!(",{},", nums.join(","))
    }
}
fn byday_from_csv(s: &str) -> Vec<i64> {
    s.split(',')
        .filter_map(|x| x.trim().parse::<i64>().ok())
        .filter(|n| (0..=6).contains(n))
        .collect()
}
fn rec_from_row(r: &Row<'_>) -> Recurrence {
    Recurrence {
        freq: r.get::<&str>("rec_freq").unwrap_or("none").to_string(),
        interval: r.get::<i64>("rec_interval").unwrap_or(1),
        until: r.get::<i64>("rec_until"),
        count: r.get::<i64>("rec_count"),
        byday: byday_from_csv(r.get::<&str>("rec_byday").unwrap_or_default()),
    }
}
fn rule_from_row(r: &Row<'_>) -> Rule {
    Rule::from_cols(
        r.get::<&str>("rec_freq").unwrap_or("none"),
        r.get::<i64>("rec_interval").unwrap_or(1),
        r.get::<i64>("rec_until"),
        r.get::<i64>("rec_count"),
        r.get::<&str>("rec_byday").unwrap_or_default(),
    )
}

// ----------------------------- Reminders -----------------------------

fn row_to_reminder(r: &Row<'_>) -> Reminder {
    Reminder {
        id: r.get::<i64>("id").unwrap_or_default(),
        parent_type: r.get::<&str>("parent_type").unwrap_or_default().to_string(),
        parent_id: r.get::<i64>("parent_id").unwrap_or_default(),
        lead_minutes: r.get::<i64>("lead_minutes").unwrap_or(0),
        remind_at: r.get::<i64>("remind_at"),
        status: r.get::<&str>("status").unwrap_or("active").to_string(),
        snooze_until: r.get::<i64>("snooze_until"),
        dismissed_through: r.get::<i64>("dismissed_through"),
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}

const REMINDER_COLS: &str = "id,parent_type,parent_id,lead_minutes,remind_at,status,snooze_until,dismissed_through,created_at,updated_at";

fn reminders_map(conn: &Connection, parent_type: &str) -> Result<HashMap<i64, Reminder>> {
    let sql = format!(
        "SELECT {REMINDER_COLS} FROM reminders WHERE parent_type=? AND status='active'"
    );
    let res = conn.execute(&sql, &[Value::Text(parent_type.to_string())])?;
    let list: Vec<Reminder> = res.rows().map(|r| row_to_reminder(&r)).collect();
    let mut map = HashMap::new();
    for rem in list {
        map.insert(rem.parent_id, rem);
    }
    Ok(map)
}
fn reminder_for(conn: &Connection, parent_type: &str, parent_id: i64) -> Result<Option<Reminder>> {
    let sql = format!(
        "SELECT {REMINDER_COLS} FROM reminders WHERE parent_type=? AND parent_id=? AND status='active' ORDER BY id DESC LIMIT 1"
    );
    let res = conn.execute(
        &sql,
        &[Value::Text(parent_type.to_string()), Value::Integer(parent_id)],
    )?;
    let rem = res.rows().next().map(|r| row_to_reminder(&r));
    Ok(rem)
}

pub fn insert_reminder(conn: &Connection, input: &ReminderInput) -> Result<i64> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO reminders (parent_type, parent_id, lead_minutes, remind_at, status, snooze_until, dismissed_through, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', NULL, NULL, ?, ?)",
        &[
            Value::Text(input.parent_type.clone()),
            Value::Integer(input.parent_id),
            Value::Integer(input.lead_minutes.max(0)),
            opt_int(input.remind_at),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}
pub fn list_reminders(conn: &Connection) -> Result<Vec<Reminder>> {
    let sql = format!("SELECT {REMINDER_COLS} FROM reminders ORDER BY id DESC");
    let res = conn.execute(&sql, &[])?;
    let items: Vec<Reminder> = res.rows().map(|r| row_to_reminder(&r)).collect();
    Ok(items)
}
pub fn get_reminder(conn: &Connection, id: i64) -> Result<Option<Reminder>> {
    let sql = format!("SELECT {REMINDER_COLS} FROM reminders WHERE id=?");
    let res = conn.execute(&sql, &[Value::Integer(id)])?;
    let rem = res.rows().next().map(|r| row_to_reminder(&r));
    Ok(rem)
}
pub fn cancel_reminder(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE reminders SET status='cancelled', updated_at=? WHERE id=?",
        &[Value::Integer(now_secs()), Value::Integer(id)],
    )?;
    Ok(())
}
#[allow(dead_code)]
pub fn delete_reminder(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM reminders WHERE id=?", &[Value::Integer(id)])?;
    Ok(())
}
pub fn snooze_reminder(conn: &Connection, id: i64, minutes: i64) -> Result<()> {
    let until = now_secs() + minutes.max(1) * 60;
    conn.execute(
        "UPDATE reminders SET snooze_until=?, updated_at=? WHERE id=?",
        &[Value::Integer(until), Value::Integer(now_secs()), Value::Integer(id)],
    )?;
    Ok(())
}
pub fn dismiss_reminder(conn: &Connection, id: i64, through: i64) -> Result<()> {
    conn.execute(
        "UPDATE reminders SET dismissed_through=?, snooze_until=NULL, updated_at=? WHERE id=?",
        &[Value::Integer(through), Value::Integer(now_secs()), Value::Integer(id)],
    )?;
    Ok(())
}
pub fn delete_reminders_for(conn: &Connection, parent_type: &str, parent_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM reminders WHERE parent_type=? AND parent_id=?",
        &[Value::Text(parent_type.to_string()), Value::Integer(parent_id)],
    )?;
    Ok(())
}
pub fn parent_exists(conn: &Connection, parent_type: &str, parent_id: i64) -> Result<bool> {
    let table = match parent_type {
        "note" => "notes",
        "task" => "tasks",
        "event" => "events",
        _ => return Ok(false),
    };
    let sql = format!("SELECT 1 AS x FROM {table} WHERE id=?");
    let res = conn.execute(&sql, &[Value::Integer(parent_id)])?;
    let found = res.rows().next().is_some();
    Ok(found)
}

// ------------------------------- Notes -------------------------------

fn row_to_note(r: &Row<'_>) -> Note {
    Note {
        id: r.get::<i64>("id").unwrap_or_default(),
        title: r.get::<&str>("title").unwrap_or_default().to_string(),
        body: r.get::<&str>("body").unwrap_or_default().to_string(),
        tags: split_tags(r.get::<&str>("tags").unwrap_or_default()),
        reminder: None,
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}
pub fn list_notes(conn: &Connection, q: Option<&str>, tag: Option<&str>) -> Result<Vec<Note>> {
    let mut sql =
        String::from("SELECT id,title,body,tags,created_at,updated_at FROM notes WHERE 1=1");
    let mut args: Vec<Value> = Vec::new();
    if let Some(q) = q.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND (title LIKE ? OR body LIKE ?)");
        let like = like_filter(q);
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like));
    }
    if let Some(t) = tag.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND tags LIKE ?");
        args.push(Value::Text(format!("%,{},%", t.to_lowercase())));
    }
    sql.push_str(" ORDER BY updated_at DESC");
    let res = conn.execute(&sql, &args)?;
    let mut items: Vec<Note> = res.rows().map(|r| row_to_note(&r)).collect();
    let map = reminders_map(conn, "note")?;
    for it in &mut items {
        it.reminder = map.get(&it.id).cloned();
    }
    Ok(items)
}
pub fn get_note(conn: &Connection, id: i64) -> Result<Option<Note>> {
    let res = conn.execute(
        "SELECT id,title,body,tags,created_at,updated_at FROM notes WHERE id=?",
        &[Value::Integer(id)],
    )?;
    let mut note = res.rows().next().map(|r| row_to_note(&r));
    if let Some(n) = note.as_mut() {
        n.reminder = reminder_for(conn, "note", id)?;
    }
    Ok(note)
}
pub fn insert_note(conn: &Connection, input: &NoteInput) -> Result<i64> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO notes (title, body, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.body.clone()),
            Value::Text(normalize_tags(&input.tags)),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}
pub fn update_note(conn: &Connection, id: i64, input: &NoteInput) -> Result<()> {
    conn.execute(
        "UPDATE notes SET title=?, body=?, tags=?, updated_at=? WHERE id=?",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.body.clone()),
            Value::Text(normalize_tags(&input.tags)),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}
pub fn delete_note(conn: &Connection, id: i64) -> Result<()> {
    delete_reminders_for(conn, "note", id)?;
    conn.execute("DELETE FROM notes WHERE id=?", &[Value::Integer(id)])?;
    Ok(())
}
fn note_title(conn: &Connection, id: i64) -> Result<Option<String>> {
    let res = conn.execute("SELECT title FROM notes WHERE id=?", &[Value::Integer(id)])?;
    let t = res
        .rows()
        .next()
        .map(|r| r.get::<&str>("title").unwrap_or_default().to_string());
    Ok(t)
}

// ------------------------------- Tasks -------------------------------

const TASK_COLS: &str = "id,title,description,done,priority,tags,due_at,scheduled_at,rec_freq,rec_interval,rec_until,rec_count,rec_byday,created_at,updated_at";

fn row_to_task(r: &Row<'_>) -> Task {
    Task {
        id: r.get::<i64>("id").unwrap_or_default(),
        title: r.get::<&str>("title").unwrap_or_default().to_string(),
        description: r.get::<&str>("description").unwrap_or_default().to_string(),
        done: r.get::<i64>("done").unwrap_or(0) != 0,
        priority: r.get::<&str>("priority").unwrap_or("med").to_string(),
        tags: split_tags(r.get::<&str>("tags").unwrap_or_default()),
        due_at: r.get::<i64>("due_at"),
        scheduled_at: r.get::<i64>("scheduled_at"),
        recurrence: rec_from_row(r),
        reminder: None,
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}
pub fn list_tasks(
    conn: &Connection,
    q: Option<&str>,
    tag: Option<&str>,
    done: Option<bool>,
) -> Result<Vec<Task>> {
    let mut sql = format!("SELECT {TASK_COLS} FROM tasks WHERE 1=1");
    let mut args: Vec<Value> = Vec::new();
    if let Some(q) = q.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND (title LIKE ? OR description LIKE ?)");
        let like = like_filter(q);
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like));
    }
    if let Some(t) = tag.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND tags LIKE ?");
        args.push(Value::Text(format!("%,{},%", t.to_lowercase())));
    }
    if let Some(d) = done {
        sql.push_str(" AND done = ?");
        args.push(Value::Integer(if d { 1 } else { 0 }));
    }
    sql.push_str(" ORDER BY (due_at IS NULL) ASC, due_at ASC, updated_at DESC");
    let res = conn.execute(&sql, &args)?;
    let mut items: Vec<Task> = res.rows().map(|r| row_to_task(&r)).collect();
    let map = reminders_map(conn, "task")?;
    for it in &mut items {
        it.reminder = map.get(&it.id).cloned();
    }
    Ok(items)
}
pub fn get_task(conn: &Connection, id: i64) -> Result<Option<Task>> {
    let sql = format!("SELECT {TASK_COLS} FROM tasks WHERE id=?");
    let res = conn.execute(&sql, &[Value::Integer(id)])?;
    let mut task = res.rows().next().map(|r| row_to_task(&r));
    if let Some(t) = task.as_mut() {
        t.reminder = reminder_for(conn, "task", id)?;
    }
    Ok(task)
}
pub fn insert_task(conn: &Connection, input: &TaskInput) -> Result<i64> {
    let now = now_secs();
    let rec = input.recurrence.clone().unwrap_or_default();
    conn.execute(
        "INSERT INTO tasks (title, description, done, priority, tags, due_at, scheduled_at, rec_freq, rec_interval, rec_until, rec_count, rec_byday, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Integer(if input.done { 1 } else { 0 }),
            Value::Text(input.priority.clone()),
            Value::Text(normalize_tags(&input.tags)),
            opt_int(input.due_at),
            opt_int(input.scheduled_at),
            Value::Text(rec.freq.clone()),
            Value::Integer(rec.interval.max(1)),
            opt_int(rec.until),
            opt_int(rec.count),
            Value::Text(byday_to_csv(&rec.byday)),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}
pub fn update_task(conn: &Connection, id: i64, input: &TaskInput) -> Result<()> {
    let rec = input.recurrence.clone().unwrap_or_default();
    conn.execute(
        "UPDATE tasks SET title=?, description=?, done=?, priority=?, tags=?, due_at=?, scheduled_at=?, rec_freq=?, rec_interval=?, rec_until=?, rec_count=?, rec_byday=?, updated_at=? WHERE id=?",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Integer(if input.done { 1 } else { 0 }),
            Value::Text(input.priority.clone()),
            Value::Text(normalize_tags(&input.tags)),
            opt_int(input.due_at),
            opt_int(input.scheduled_at),
            Value::Text(rec.freq.clone()),
            Value::Integer(rec.interval.max(1)),
            opt_int(rec.until),
            opt_int(rec.count),
            Value::Text(byday_to_csv(&rec.byday)),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}
pub fn set_task_done(conn: &Connection, id: i64, done: bool) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET done=?, updated_at=? WHERE id=?",
        &[
            Value::Integer(if done { 1 } else { 0 }),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}
pub fn delete_task(conn: &Connection, id: i64) -> Result<()> {
    delete_reminders_for(conn, "task", id)?;
    conn.execute("DELETE FROM tasks WHERE id=?", &[Value::Integer(id)])?;
    Ok(())
}
fn task_anchor(conn: &Connection, id: i64) -> Result<Option<(i64, Rule, String)>> {
    let res = conn.execute(
        "SELECT title,due_at,rec_freq,rec_interval,rec_until,rec_count,rec_byday FROM tasks WHERE id=?",
        &[Value::Integer(id)],
    )?;
    let out = res.rows().next().and_then(|r| {
        r.get::<i64>("due_at").map(|due| {
            (
                due,
                rule_from_row(&r),
                r.get::<&str>("title").unwrap_or_default().to_string(),
            )
        })
    });
    Ok(out)
}

// ------------------------------ Events -------------------------------

const EVENT_COLS: &str = "id,title,description,location,start_at,end_at,all_day,tags,rec_freq,rec_interval,rec_until,rec_count,rec_byday,created_at,updated_at";

fn row_to_event(r: &Row<'_>) -> Event {
    Event {
        id: r.get::<i64>("id").unwrap_or_default(),
        title: r.get::<&str>("title").unwrap_or_default().to_string(),
        description: r.get::<&str>("description").unwrap_or_default().to_string(),
        location: r.get::<&str>("location").unwrap_or_default().to_string(),
        start_at: r.get::<i64>("start_at").unwrap_or_default(),
        end_at: r.get::<i64>("end_at").unwrap_or_default(),
        all_day: r.get::<i64>("all_day").unwrap_or(0) != 0,
        tags: split_tags(r.get::<&str>("tags").unwrap_or_default()),
        recurrence: rec_from_row(r),
        reminder: None,
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}
pub fn list_events(conn: &Connection, q: Option<&str>, tag: Option<&str>) -> Result<Vec<Event>> {
    let mut sql = format!("SELECT {EVENT_COLS} FROM events WHERE 1=1");
    let mut args: Vec<Value> = Vec::new();
    if let Some(q) = q.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND (title LIKE ? OR description LIKE ? OR location LIKE ?)");
        let like = like_filter(q);
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like.clone()));
        args.push(Value::Text(like));
    }
    if let Some(t) = tag.map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND tags LIKE ?");
        args.push(Value::Text(format!("%,{},%", t.to_lowercase())));
    }
    sql.push_str(" ORDER BY start_at ASC");
    let res = conn.execute(&sql, &args)?;
    let mut items: Vec<Event> = res.rows().map(|r| row_to_event(&r)).collect();
    let map = reminders_map(conn, "event")?;
    for it in &mut items {
        it.reminder = map.get(&it.id).cloned();
    }
    Ok(items)
}
pub fn get_event(conn: &Connection, id: i64) -> Result<Option<Event>> {
    let sql = format!("SELECT {EVENT_COLS} FROM events WHERE id=?");
    let res = conn.execute(&sql, &[Value::Integer(id)])?;
    let mut ev = res.rows().next().map(|r| row_to_event(&r));
    if let Some(e) = ev.as_mut() {
        e.reminder = reminder_for(conn, "event", id)?;
    }
    Ok(ev)
}
pub fn insert_event(conn: &Connection, input: &EventInput) -> Result<i64> {
    let now = now_secs();
    let rec = input.recurrence.clone().unwrap_or_default();
    conn.execute(
        "INSERT INTO events (title, description, location, start_at, end_at, all_day, tags, rec_freq, rec_interval, rec_until, rec_count, rec_byday, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Text(input.location.trim().to_string()),
            Value::Integer(input.start_at),
            Value::Integer(input.end_at),
            Value::Integer(if input.all_day { 1 } else { 0 }),
            Value::Text(normalize_tags(&input.tags)),
            Value::Text(rec.freq.clone()),
            Value::Integer(rec.interval.max(1)),
            opt_int(rec.until),
            opt_int(rec.count),
            Value::Text(byday_to_csv(&rec.byday)),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}
pub fn update_event(conn: &Connection, id: i64, input: &EventInput) -> Result<()> {
    let rec = input.recurrence.clone().unwrap_or_default();
    conn.execute(
        "UPDATE events SET title=?, description=?, location=?, start_at=?, end_at=?, all_day=?, tags=?, rec_freq=?, rec_interval=?, rec_until=?, rec_count=?, rec_byday=?, updated_at=? WHERE id=?",
        &[
            Value::Text(input.title.trim().to_string()),
            Value::Text(input.description.trim().to_string()),
            Value::Text(input.location.trim().to_string()),
            Value::Integer(input.start_at),
            Value::Integer(input.end_at),
            Value::Integer(if input.all_day { 1 } else { 0 }),
            Value::Text(normalize_tags(&input.tags)),
            Value::Text(rec.freq.clone()),
            Value::Integer(rec.interval.max(1)),
            opt_int(rec.until),
            opt_int(rec.count),
            Value::Text(byday_to_csv(&rec.byday)),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}
pub fn delete_event(conn: &Connection, id: i64) -> Result<()> {
    delete_reminders_for(conn, "event", id)?;
    conn.execute("DELETE FROM events WHERE id=?", &[Value::Integer(id)])?;
    Ok(())
}
fn event_anchor(conn: &Connection, id: i64) -> Result<Option<(i64, Rule, String)>> {
    let res = conn.execute(
        "SELECT title,start_at,rec_freq,rec_interval,rec_until,rec_count,rec_byday FROM events WHERE id=?",
        &[Value::Integer(id)],
    )?;
    let out = res.rows().next().map(|r| {
        (
            r.get::<i64>("start_at").unwrap_or_default(),
            rule_from_row(&r),
            r.get::<&str>("title").unwrap_or_default().to_string(),
        )
    });
    Ok(out)
}

// ------------------------- Reminder due engine -----------------------

fn parent_anchor(conn: &Connection, ptype: &str, pid: i64) -> Result<Option<(i64, Rule, String)>> {
    match ptype {
        "task" => task_anchor(conn, pid),
        "event" => event_anchor(conn, pid),
        _ => Ok(None),
    }
}

/// Effective fire-time to surface now for one reminder, or None if nothing is due.
pub fn reminder_due_fire(
    conn: &Connection,
    rem: &Reminder,
    now: i64,
) -> Result<Option<(i64, i64, String)>> {
    if rem.status != "active" {
        return Ok(None);
    }
    if let Some(s) = rem.snooze_until {
        if s > now {
            return Ok(None);
        }
    }
    if rem.parent_type == "note" {
        let Some(fire) = rem.remind_at else {
            return Ok(None);
        };
        if rem.dismissed_through.map(|d| d >= fire).unwrap_or(false) {
            return Ok(None);
        }
        if fire <= now {
            let title = note_title(conn, rem.parent_id)?.unwrap_or_else(|| "Note".to_string());
            return Ok(Some((fire, fire, title)));
        }
        return Ok(None);
    }
    let Some((anchor, rule, title)) = parent_anchor(conn, &rem.parent_type, rem.parent_id)? else {
        return Ok(None);
    };
    let lead = rem.lead_minutes * 60;
    if !rule.is_recurring() {
        if rem.dismissed_through.map(|d| d >= anchor).unwrap_or(false) {
            return Ok(None);
        }
        let fire = anchor - lead;
        if fire <= now {
            return Ok(Some((fire, anchor, title)));
        }
        return Ok(None);
    }
    // Recurring: earliest occurrence with fire<=now and occurrence > dismissed_through.
    let from = anchor.max(rem.dismissed_through.unwrap_or(0));
    for occ in occurrences(anchor, &rule, from, now + lead) {
        if rem.dismissed_through.map(|d| occ <= d).unwrap_or(false) {
            continue;
        }
        let fire = occ - lead;
        if fire <= now {
            return Ok(Some((fire, occ, title)));
        }
    }
    Ok(None)
}

pub fn due_reminders(conn: &Connection, now: i64) -> Result<Vec<DueReminder>> {
    let active = {
        let sql = format!("SELECT {REMINDER_COLS} FROM reminders WHERE status='active'");
        let res = conn.execute(&sql, &[])?;
        let list: Vec<Reminder> = res.rows().map(|r| row_to_reminder(&r)).collect();
        list
    };
    let mut out: Vec<DueReminder> = Vec::new();
    for rem in &active {
        if let Some((fire, occ, title)) = reminder_due_fire(conn, rem, now)? {
            out.push(DueReminder {
                reminder_id: rem.id,
                parent_type: rem.parent_type.clone(),
                parent_id: rem.parent_id,
                parent_title: title,
                fire_at: fire,
                occurrence_at: occ,
            });
        }
    }
    out.sort_by_key(|d| d.fire_at);
    Ok(out)
}

// --------------------------- Calendar items --------------------------

pub fn calendar_items(conn: &Connection, from: i64, to: i64) -> Result<Vec<CalendarItem>> {
    let mut items: Vec<CalendarItem> = Vec::new();

    // Events (expand occurrences).
    let events = {
        let res = conn.execute(
            "SELECT id,title,start_at,end_at,all_day,rec_freq,rec_interval,rec_until,rec_count,rec_byday FROM events",
            &[],
        )?;
        let list: Vec<(i64, String, i64, i64, bool, Rule)> = res
            .rows()
            .map(|r| {
                (
                    r.get::<i64>("id").unwrap_or_default(),
                    r.get::<&str>("title").unwrap_or_default().to_string(),
                    r.get::<i64>("start_at").unwrap_or_default(),
                    r.get::<i64>("end_at").unwrap_or_default(),
                    r.get::<i64>("all_day").unwrap_or(0) != 0,
                    rule_from_row(&r),
                )
            })
            .collect();
        list
    };
    for (id, title, start, end, all_day, rule) in &events {
        let dur = (end - start).max(0);
        for occ in occurrences(*start, rule, from, to) {
            items.push(CalendarItem {
                kind: "event".to_string(),
                id: *id,
                title: title.clone(),
                when: occ,
                end: Some(occ + dur),
                all_day: *all_day,
                done: None,
                recurring: rule.is_recurring(),
            });
        }
    }

    // Tasks with a due date (expand occurrences).
    let tasks = {
        let res = conn.execute(
            "SELECT id,title,done,due_at,rec_freq,rec_interval,rec_until,rec_count,rec_byday FROM tasks WHERE due_at IS NOT NULL",
            &[],
        )?;
        let list: Vec<(i64, String, bool, i64, Rule)> = res
            .rows()
            .map(|r| {
                (
                    r.get::<i64>("id").unwrap_or_default(),
                    r.get::<&str>("title").unwrap_or_default().to_string(),
                    r.get::<i64>("done").unwrap_or(0) != 0,
                    r.get::<i64>("due_at").unwrap_or_default(),
                    rule_from_row(&r),
                )
            })
            .collect();
        list
    };
    for (id, title, done, due, rule) in &tasks {
        for occ in occurrences(*due, rule, from, to) {
            items.push(CalendarItem {
                kind: "task".to_string(),
                id: *id,
                title: title.clone(),
                when: occ,
                end: None,
                all_day: false,
                done: Some(*done),
                recurring: rule.is_recurring(),
            });
        }
    }

    // Active reminders → fire-times inside the window.
    let rems = {
        let sql = format!("SELECT {REMINDER_COLS} FROM reminders WHERE status='active'");
        let res = conn.execute(&sql, &[])?;
        let list: Vec<Reminder> = res.rows().map(|r| row_to_reminder(&r)).collect();
        list
    };
    for rem in &rems {
        if rem.parent_type == "note" {
            if let Some(fire) = rem.remind_at {
                if fire >= from && fire <= to {
                    let title =
                        note_title(conn, rem.parent_id)?.unwrap_or_else(|| "Reminder".to_string());
                    items.push(CalendarItem {
                        kind: "reminder".to_string(),
                        id: rem.parent_id,
                        title,
                        when: fire,
                        end: None,
                        all_day: false,
                        done: None,
                        recurring: false,
                    });
                }
            }
        } else if let Some((anchor, rule, title)) =
            parent_anchor(conn, &rem.parent_type, rem.parent_id)?
        {
            let lead = rem.lead_minutes * 60;
            for occ in occurrences(anchor, &rule, from + lead, to + lead) {
                let fire = occ - lead;
                if fire >= from && fire <= to {
                    items.push(CalendarItem {
                        kind: "reminder".to_string(),
                        id: rem.parent_id,
                        title: title.clone(),
                        when: fire,
                        end: None,
                        all_day: false,
                        done: None,
                        recurring: rule.is_recurring(),
                    });
                }
            }
        }
    }

    items.sort_by_key(|c| c.when);
    if items.len() > 3000 {
        items.truncate(3000);
    }
    Ok(items)
}

// ------------------------------- Cards -------------------------------

fn row_to_card(r: &Row<'_>) -> Card {
    Card {
        id: r.get::<i64>("id").unwrap_or_default(),
        card_name: r.get::<&str>("card_name").unwrap_or_default().to_string(),
        holder_name: r.get::<&str>("holder_name").unwrap_or_default().to_string(),
        card_number: crate::crypto::decrypt_field(
            "card_number",
            r.get::<&str>("card_number").unwrap_or_default(),
        ),
        expiry: r.get::<&str>("expiry").unwrap_or_default().to_string(),
        cvv: crate::crypto::decrypt_field("cvv", r.get::<&str>("cvv").unwrap_or_default()),
        card_type: r.get::<&str>("card_type").unwrap_or_default().to_string(),
        bank_name: r.get::<&str>("bank_name").unwrap_or_default().to_string(),
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}

/// One-time, best-effort re-encryption of rows saved before at-rest encryption.
fn heal_legacy_cards(conn: &Connection) -> Result<()> {
    if !crate::crypto::key_available() {
        return Ok(());
    }
    let res = conn.execute(
        "SELECT id,card_number,cvv FROM cards WHERE (card_number != '' AND card_number NOT LIKE 'v1:%') OR (cvv != '' AND cvv NOT LIKE 'v1:%')",
        &[],
    )?;
    let rows: Vec<(i64, String, String)> = res
        .rows()
        .map(|r| {
            (
                r.get::<i64>("id").unwrap_or_default(),
                r.get::<&str>("card_number").unwrap_or_default().to_string(),
                r.get::<&str>("cvv").unwrap_or_default().to_string(),
            )
        })
        .collect();
    for (id, num, cvv) in rows {
        let enc_num = if num.is_empty() || crate::crypto::is_encrypted(&num) {
            num
        } else {
            crate::crypto::encrypt_field("card_number", &num)?
        };
        let enc_cvv = if cvv.is_empty() || crate::crypto::is_encrypted(&cvv) {
            cvv
        } else {
            crate::crypto::encrypt_field("cvv", &cvv)?
        };
        conn.execute(
            "UPDATE cards SET card_number=?, cvv=? WHERE id=?",
            &[Value::Text(enc_num), Value::Text(enc_cvv), Value::Integer(id)],
        )?;
    }
    Ok(())
}

pub fn list_cards(conn: &Connection) -> Result<Vec<Card>> {
    let _ = heal_legacy_cards(conn);
    let res = conn.execute(
        "SELECT id,card_name,holder_name,card_number,expiry,cvv,card_type,bank_name,created_at,updated_at FROM cards ORDER BY updated_at DESC",
        &[],
    )?;
    let items: Vec<Card> = res.rows().map(|r| row_to_card(&r)).collect();
    Ok(items)
}

pub fn get_card(conn: &Connection, id: i64) -> Result<Option<Card>> {
    let res = conn.execute(
        "SELECT id,card_name,holder_name,card_number,expiry,cvv,card_type,bank_name,created_at,updated_at FROM cards WHERE id = ?",
        &[Value::Integer(id)],
    )?;
    let item = res.rows().next().map(|r| row_to_card(&r));
    Ok(item)
}

pub fn insert_card(conn: &Connection, input: &CardInput) -> Result<i64> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO cards (card_name,holder_name,card_number,expiry,cvv,card_type,bank_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        &[
            Value::Text(input.card_name.trim().to_string()),
            Value::Text(input.holder_name.trim().to_string()),
            Value::Text(crate::crypto::encrypt_field("card_number", input.card_number.trim())?),
            Value::Text(input.expiry.trim().to_string()),
            Value::Text(crate::crypto::encrypt_field("cvv", input.cvv.trim())?),
            Value::Text(input.card_type.trim().to_string()),
            Value::Text(input.bank_name.trim().to_string()),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}

pub fn update_card(conn: &Connection, id: i64, input: &CardInput) -> Result<()> {
    conn.execute(
        "UPDATE cards SET card_name=?,holder_name=?,card_number=?,expiry=?,cvv=?,card_type=?,bank_name=?,updated_at=? WHERE id=?",
        &[
            Value::Text(input.card_name.trim().to_string()),
            Value::Text(input.holder_name.trim().to_string()),
            Value::Text(crate::crypto::encrypt_field("card_number", input.card_number.trim())?),
            Value::Text(input.expiry.trim().to_string()),
            Value::Text(crate::crypto::encrypt_field("cvv", input.cvv.trim())?),
            Value::Text(input.card_type.trim().to_string()),
            Value::Text(input.bank_name.trim().to_string()),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}

pub fn delete_card(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM cards WHERE id = ?", &[Value::Integer(id)])?;
    Ok(())
}

// ------------------------------- Bank Accounts -------------------------------

fn row_to_bank(r: &Row<'_>) -> BankAccount {
    BankAccount {
        id: r.get::<i64>("id").unwrap_or_default(),
        holder_name: r.get::<&str>("holder_name").unwrap_or_default().to_string(),
        account_number: crate::crypto::decrypt_field(
            "account_number",
            r.get::<&str>("account_number").unwrap_or_default(),
        ),
        ifsc: r.get::<&str>("ifsc").unwrap_or_default().to_string(),
        branch_name: r.get::<&str>("branch_name").unwrap_or_default().to_string(),
        bank_name: r.get::<&str>("bank_name").unwrap_or_default().to_string(),
        created_at: r.get::<i64>("created_at").unwrap_or_default(),
        updated_at: r.get::<i64>("updated_at").unwrap_or_default(),
    }
}

/// One-time, best-effort re-encryption of rows saved before at-rest encryption.
fn heal_legacy_banks(conn: &Connection) -> Result<()> {
    if !crate::crypto::key_available() {
        return Ok(());
    }
    let res = conn.execute(
        "SELECT id,account_number FROM bank_accounts WHERE account_number != '' AND account_number NOT LIKE 'v1:%'",
        &[],
    )?;
    let rows: Vec<(i64, String)> = res
        .rows()
        .map(|r| {
            (
                r.get::<i64>("id").unwrap_or_default(),
                r.get::<&str>("account_number").unwrap_or_default().to_string(),
            )
        })
        .collect();
    for (id, num) in rows {
        let enc = crate::crypto::encrypt_field("account_number", &num)?;
        conn.execute(
            "UPDATE bank_accounts SET account_number=? WHERE id=?",
            &[Value::Text(enc), Value::Integer(id)],
        )?;
    }
    Ok(())
}

pub fn list_banks(conn: &Connection) -> Result<Vec<BankAccount>> {
    let _ = heal_legacy_banks(conn);
    let res = conn.execute(
        "SELECT id,holder_name,account_number,ifsc,branch_name,bank_name,created_at,updated_at FROM bank_accounts ORDER BY updated_at DESC",
        &[],
    )?;
    let items: Vec<BankAccount> = res.rows().map(|r| row_to_bank(&r)).collect();
    Ok(items)
}

pub fn get_bank(conn: &Connection, id: i64) -> Result<Option<BankAccount>> {
    let res = conn.execute(
        "SELECT id,holder_name,account_number,ifsc,branch_name,bank_name,created_at,updated_at FROM bank_accounts WHERE id = ?",
        &[Value::Integer(id)],
    )?;
    let item = res.rows().next().map(|r| row_to_bank(&r));
    Ok(item)
}

pub fn insert_bank(conn: &Connection, input: &BankAccountInput) -> Result<i64> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO bank_accounts (holder_name,account_number,ifsc,branch_name,bank_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        &[
            Value::Text(input.holder_name.trim().to_string()),
            Value::Text(crate::crypto::encrypt_field("account_number", input.account_number.trim())?),
            Value::Text(input.ifsc.trim().to_uppercase()),
            Value::Text(input.branch_name.trim().to_string()),
            Value::Text(input.bank_name.trim().to_string()),
            Value::Integer(now),
            Value::Integer(now),
        ],
    )?;
    last_insert_id(conn)
}

pub fn update_bank(conn: &Connection, id: i64, input: &BankAccountInput) -> Result<()> {
    conn.execute(
        "UPDATE bank_accounts SET holder_name=?,account_number=?,ifsc=?,branch_name=?,bank_name=?,updated_at=? WHERE id=?",
        &[
            Value::Text(input.holder_name.trim().to_string()),
            Value::Text(crate::crypto::encrypt_field("account_number", input.account_number.trim())?),
            Value::Text(input.ifsc.trim().to_uppercase()),
            Value::Text(input.branch_name.trim().to_string()),
            Value::Text(input.bank_name.trim().to_string()),
            Value::Integer(now_secs()),
            Value::Integer(id),
        ],
    )?;
    Ok(())
}

pub fn delete_bank(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM bank_accounts WHERE id = ?", &[Value::Integer(id)])?;
    Ok(())
}

// ------------------------------- User / 2FA -------------------------------

/// (username, password_hash) for the single owner.
pub fn get_user_basic(conn: &Connection) -> Result<(String, String)> {
    let res = conn.execute("SELECT username, password_hash FROM users WHERE id = 1", &[])?;
    let mut out = (String::new(), String::new());
    if let Some(r) = res.rows().next() {
        out.0 = r.get::<&str>("username").unwrap_or_default().to_string();
        out.1 = r.get::<&str>("password_hash").unwrap_or_default().to_string();
    }
    Ok(out)
}

/// (totp_secret_hex_plaintext, enabled). Secret is decrypted from at-rest storage.
pub fn get_user_totp(conn: &Connection) -> Result<(String, bool)> {
    let res = conn.execute("SELECT totp_secret, totp_enabled FROM users WHERE id = 1", &[])?;
    let mut enc = String::new();
    let mut enabled = false;
    if let Some(r) = res.rows().next() {
        enc = r.get::<&str>("totp_secret").unwrap_or_default().to_string();
        enabled = r.get::<i64>("totp_enabled").unwrap_or(0) != 0;
    }
    let secret = if enc.is_empty() {
        String::new()
    } else {
        crate::crypto::decrypt_field("totp", &enc)
    };
    Ok((secret, enabled))
}

pub fn totp_is_enabled(conn: &Connection) -> Result<bool> {
    let res = conn.execute("SELECT totp_enabled FROM users WHERE id = 1", &[])?;
    let enabled = res.rows().next().and_then(|r| r.get::<i64>("totp_enabled")).unwrap_or(0) != 0;
    Ok(enabled)
}

/// Store an encrypted secret as pending (not yet enabled).
pub fn set_totp_pending(conn: &Connection, enc_secret: &str) -> Result<()> {
    conn.execute(
        "UPDATE users SET totp_secret=?, totp_enabled=0 WHERE id=1",
        &[Value::Text(enc_secret.to_string())],
    )?;
    Ok(())
}

pub fn enable_totp(conn: &Connection) -> Result<()> {
    conn.execute("UPDATE users SET totp_enabled=1 WHERE id=1", &[])?;
    Ok(())
}

pub fn disable_totp(conn: &Connection) -> Result<()> {
    conn.execute("UPDATE users SET totp_secret='', totp_enabled=0 WHERE id=1", &[])?;
    conn.execute("DELETE FROM totp_recovery_codes", &[])?;
    Ok(())
}

pub fn replace_recovery_codes(conn: &Connection, hashes: &[String]) -> Result<()> {
    conn.execute("DELETE FROM totp_recovery_codes", &[])?;
    let now = now_secs();
    for h in hashes {
        conn.execute(
            "INSERT INTO totp_recovery_codes (code_hash, used, created_at) VALUES (?, 0, ?)",
            &[Value::Text(h.clone()), Value::Integer(now)],
        )?;
    }
    Ok(())
}

/// Consume an unused recovery code by hash. Returns true if one was found+used.
pub fn consume_recovery_code(conn: &Connection, hash: &str) -> Result<bool> {
    let res = conn.execute(
        "SELECT id FROM totp_recovery_codes WHERE code_hash=? AND used=0 LIMIT 1",
        &[Value::Text(hash.to_string())],
    )?;
    let id = res.rows().next().and_then(|r| r.get::<i64>("id"));
    if let Some(id) = id {
        conn.execute(
            "UPDATE totp_recovery_codes SET used=1 WHERE id=?",
            &[Value::Integer(id)],
        )?;
        Ok(true)
    } else {
        Ok(false)
    }
}

// --------------------------- Notifications ---------------------------

/// Open tasks with a due date: (id, title, due_at, recurrence).
pub fn open_tasks_with_due(conn: &Connection) -> Result<Vec<(i64, String, i64, Rule)>> {
    let res = conn.execute(
        "SELECT id,title,due_at,rec_freq,rec_interval,rec_until,rec_count,rec_byday FROM tasks \
         WHERE done = 0 AND due_at IS NOT NULL ORDER BY due_at DESC",
        &[],
    )?;
    Ok(res
        .rows()
        .map(|r| {
            (
                r.get::<i64>("id").unwrap_or_default(),
                r.get::<&str>("title").unwrap_or_default().to_string(),
                r.get::<i64>("due_at").unwrap_or_default(),
                rule_from_row(&r),
            )
        })
        .collect())
}

/// Events: (id, title, start_at, all_day, recurrence).
pub fn events_for_notifications(conn: &Connection) -> Result<Vec<(i64, String, i64, bool, Rule)>> {
    let res = conn.execute(
        "SELECT id,title,start_at,all_day,rec_freq,rec_interval,rec_until,rec_count,rec_byday FROM events",
        &[],
    )?;
    Ok(res
        .rows()
        .map(|r| {
            (
                r.get::<i64>("id").unwrap_or_default(),
                r.get::<&str>("title").unwrap_or_default().to_string(),
                r.get::<i64>("start_at").unwrap_or_default(),
                r.get::<i64>("all_day").unwrap_or(0) != 0,
                rule_from_row(&r),
            )
        })
        .collect())
}

/// Jobs still marked new that arrived since `since`: (count, latest id, latest created_at, "Title at Company").
pub fn recent_new_jobs(conn: &Connection, since: i64) -> Result<Option<(i64, i64, i64, String)>> {
    let res = conn.execute(
        "SELECT id, job_title, company, created_at, (SELECT COUNT(*) FROM jobs WHERE status='new' AND created_at >= ?) AS n \
         FROM jobs WHERE status='new' AND created_at >= ? ORDER BY created_at DESC, id DESC LIMIT 1",
        &[Value::Integer(since), Value::Integer(since)],
    )?;
    let found = res.rows().next().map(|r| {
        let title = r.get::<&str>("job_title").unwrap_or_default();
        let company = r.get::<&str>("company").unwrap_or_default();
        let label = if company.is_empty() { title.to_string() } else { format!("{title} at {company}") };
        (
            r.get::<i64>("n").unwrap_or_default(),
            r.get::<i64>("id").unwrap_or_default(),
            r.get::<i64>("created_at").unwrap_or_default(),
            label,
        )
    });
    Ok(found)
}

/// Cards with an expiry: (id, display name, expiry text).
pub fn card_expiries(conn: &Connection) -> Result<Vec<(i64, String, String)>> {
    let res = conn.execute("SELECT id, card_name, bank_name, expiry FROM cards WHERE expiry <> ''", &[])?;
    Ok(res
        .rows()
        .map(|r| {
            let name = r.get::<&str>("card_name").unwrap_or_default().trim().to_string();
            let bank = r.get::<&str>("bank_name").unwrap_or_default().trim().to_string();
            let display = if !name.is_empty() { name } else if !bank.is_empty() { format!("{bank} card") } else { "Card".to_string() };
            (
                r.get::<i64>("id").unwrap_or_default(),
                display,
                r.get::<&str>("expiry").unwrap_or_default().trim().to_string(),
            )
        })
        .collect())
}

/// Failed email sends since `since`: (id, to, subject, created_at).
pub fn recent_failed_emails(conn: &Connection, since: i64) -> Result<Vec<(i64, String, String, i64)>> {
    let res = conn.execute(
        "SELECT id, to_addr, subject, created_at FROM email_log WHERE status='failed' AND created_at >= ? ORDER BY created_at DESC LIMIT 10",
        &[Value::Integer(since)],
    )?;
    Ok(res
        .rows()
        .map(|r| {
            (
                r.get::<i64>("id").unwrap_or_default(),
                r.get::<&str>("to_addr").unwrap_or_default().to_string(),
                r.get::<&str>("subject").unwrap_or_default().to_string(),
                r.get::<i64>("created_at").unwrap_or_default(),
            )
        })
        .collect())
}
