-- Add store to submissions. Nullable so existing rows (pre-store) remain valid.
-- New entries are rejected at the API layer unless store is one of the known
-- stores for the chosen province, or the literal "Other".
--
-- Apply with:
--   wrangler d1 execute oros-stokvel --remote --file=migrations/0003_add_store.sql
--
-- Prod reminder: back up the D1 database and record a baseline row count
-- before running against the prod binding.

ALTER TABLE submissions ADD COLUMN store TEXT;
