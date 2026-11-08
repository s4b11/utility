CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sl_no TEXT,
  job_title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  salary_package TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  skills_required TEXT NOT NULL DEFAULT '',
  matched_skills TEXT NOT NULL DEFAULT '',
  job_type TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  link_to_apply TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'webhook',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_sl_no ON jobs(sl_no);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
