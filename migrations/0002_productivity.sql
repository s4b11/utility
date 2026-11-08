CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'med',
  tags TEXT NOT NULL DEFAULT '',
  due_at INTEGER,
  scheduled_at INTEGER,
  rec_freq TEXT NOT NULL DEFAULT 'none',
  rec_interval INTEGER NOT NULL DEFAULT 1,
  rec_until INTEGER,
  rec_count INTEGER,
  rec_byday TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  rec_freq TEXT NOT NULL DEFAULT 'none',
  rec_interval INTEGER NOT NULL DEFAULT 1,
  rec_until INTEGER,
  rec_count INTEGER,
  rec_byday TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_type TEXT NOT NULL,
  parent_id INTEGER NOT NULL,
  lead_minutes INTEGER NOT NULL DEFAULT 0,
  remind_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  snooze_until INTEGER,
  dismissed_through INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_parent ON reminders(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
