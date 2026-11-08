CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_name TEXT NOT NULL DEFAULT '',
  holder_name TEXT NOT NULL DEFAULT '',
  card_number TEXT NOT NULL DEFAULT '',
  expiry TEXT NOT NULL DEFAULT '',
  cvv TEXT NOT NULL DEFAULT '',
  card_type TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_updated ON cards(updated_at DESC);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holder_name TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  ifsc TEXT NOT NULL DEFAULT '',
  branch_name TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_banks_updated ON bank_accounts(updated_at DESC)
