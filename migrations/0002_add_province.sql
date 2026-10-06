-- Add province to submissions. Nullable so existing rows (pre-province) remain valid.
-- New entries are rejected at the API layer unless a valid SA province is supplied.
--
-- Apply with:
--   wrangler d1 execute oros-stokvel --remote --file=migrations/0002_add_province.sql

ALTER TABLE submissions ADD COLUMN province TEXT;
