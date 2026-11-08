-- Email templates: a log of sent (or failed) emails. Sender settings live in app_settings.
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  cc TEXT NOT NULL DEFAULT '',
  bcc TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at DESC)
