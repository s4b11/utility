-- In-app notifications are computed on request. This table keeps which ones were read or dismissed.
CREATE TABLE IF NOT EXISTS notification_state (
  key TEXT PRIMARY KEY,
  read_at INTEGER,
  dismissed_at INTEGER
);
