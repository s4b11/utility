CREATE TABLE IF NOT EXISTS agent_proposals (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  result_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_proposals_user ON agent_proposals(user_id, status, created_at);
CREATE TABLE IF NOT EXISTS agent_requests (
  user_id INTEGER PRIMARY KEY,
  last_at INTEGER NOT NULL
);
