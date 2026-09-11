PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL CHECK(service_id IN ('haircut','beard','combo')),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  notes TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
  locale TEXT NOT NULL DEFAULT 'it' CHECK(locale IN ('it','ar','fr','es')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS blocked_periods (
  id TEXT PRIMARY KEY,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS prevent_overlapping_booking
BEFORE INSERT ON bookings WHEN NEW.status='confirmed'
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE status='confirmed' AND start_at<NEW.end_at AND end_at>NEW.start_at)
    OR EXISTS(SELECT 1 FROM blocked_periods WHERE start_at<NEW.end_at AND end_at>NEW.start_at)
    THEN RAISE(ABORT,'slot_unavailable') END;
END;

CREATE TRIGGER IF NOT EXISTS prevent_overlapping_block
BEFORE INSERT ON blocked_periods
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM blocked_periods WHERE start_at<NEW.end_at AND end_at>NEW.start_at)
    THEN RAISE(ABORT,'block_overlap') END;
END;

CREATE INDEX IF NOT EXISTS bookings_start_idx ON bookings(start_at);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
CREATE INDEX IF NOT EXISTS blocks_start_idx ON blocked_periods(start_at);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON admin_sessions(expires_at);
