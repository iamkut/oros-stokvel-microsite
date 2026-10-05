-- Normalize all existing phone numbers to canonical E.164 (+27XXXXXXXXX).
-- Collapses variants like 0662535135, 27662535135, +27662535135, +270662535135
-- so the UNIQUE(campaign, phone) constraint catches dupes going forward.
--
-- Apply with:
--   wrangler d1 execute oros-stokvel --remote --file=migrations/0001_normalize_phones.sql
--
-- Strategy: strip spaces, drop a leading +, drop a leading 27 country code,
-- drop a leading 0, then re-prefix with +27. Done as nested REPLACE/SUBSTR
-- because D1 (SQLite) has no regex. Any pre-existing collisions after the
-- rewrite are resolved by keeping the oldest row per (campaign, normalized).
--
-- D1 rejects raw BEGIN/COMMIT (transactions must go via the JS API); each
-- statement below runs atomically on its own. If the run aborts mid-way,
-- rerun by first dropping phone_norm manually.

ALTER TABLE submissions ADD COLUMN phone_norm TEXT;

UPDATE submissions
SET phone_norm = (
  WITH stripped AS (
    SELECT REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') AS d
  ),
  no_cc AS (
    SELECT CASE WHEN substr(d, 1, 2) = '27' THEN substr(d, 3) ELSE d END AS d
    FROM stripped
  ),
  no_zero AS (
    SELECT CASE WHEN substr(d, 1, 1) = '0' THEN substr(d, 2) ELSE d END AS d
    FROM no_cc
  )
  SELECT '+27' || d FROM no_zero
);

-- Delete all but the oldest row for each (campaign, normalized phone) pair.
DELETE FROM submissions
WHERE id NOT IN (
  SELECT MIN(id) FROM submissions GROUP BY campaign, phone_norm
);

-- Commit the normalized value as the real phone.
UPDATE submissions SET phone = phone_norm;
ALTER TABLE submissions DROP COLUMN phone_norm;
