# Oros Stokvel - Operations Runbook

Short reference for recurring operational tasks on the live site.
Deployment stack: Cloudflare Pages + Workers (Pages Functions) + D1 + Turnstile + Zero Trust Access.

---

## Abuse defences

The entry endpoint has layered defences, from cheapest to strongest:

| Layer | Where | What it blocks |
|---|---|---|
| Honeypot `website` field | [`index.html`](index.html), [`functions/api/entries.ts`](functions/api/entries.ts) | Dumb bots that fill every input |
| Minimum fill time (2s) | [`functions/api/entries.ts`](functions/api/entries.ts) `MIN_FORM_FILL_MS` | Scripted POSTs that don't wait like a human |
| Turnstile | [`functions/api/entries.ts`](functions/api/entries.ts) `verifyTurnstile` | Bulk headless submissions and known-bad clients |
| Per-IP rate limit | [`functions/api/entries.ts`](functions/api/entries.ts) `MAX_PER_IP_PER_HOUR` (200) | Runaway abuse from a single network |
| Unique phone constraint | `schema.sql` `UNIQUE(campaign, phone)` | Exact-duplicate submissions |
| Post-draw OTP | Manual (see below) | Fake-but-unique phone numbers winning the draw |

The per-IP cap is deliberately high (200/hr) to accommodate shared-IP kiosk use at marketing activations. Draw integrity relies on **post-draw OTP** rather than entry-time verification.

---

## Launch day: flip splash → entry form

Pre-launch routing is controlled by a single `_redirects` file at the repo root:

```
/entry  /index.html         200
/       /coming-soon.html   302
```

- `/` → 302 to the coming-soon splash
- `/entry` → rewrites to serve the entry form (QA access during pre-launch)
- `/coming-soon.html` → 200 splash (direct URL)
- `/index.html` → auto-strips to `/` → hits the splash redirect

**Launch is a one-file deletion.** Remove `_redirects` and `/` serves `index.html` (the entry form) directly.

```bash
git checkout main
git pull
git rm _redirects
git commit -m "Launch: enable entry form at root"
git push origin main
```

Cloudflare auto-builds and promotes to production in 1-3 min.

### Verify post-launch

```bash
curl -s https://orosstokvel.co.za/ | grep -oE "<title>[^<]+"
# expect: <title>Oros Stokvel - Win Your Share of R20 000

curl -s -o /dev/null -w "%{http_code}\n" https://orosstokvel.co.za/entry
# expect: 404 (QA rewrite is gone)
```

### Rollback to splash (if launch is aborted)

Restore the file:

```bash
cat > _redirects <<'EOF'
/entry  /index.html         200
/       /coming-soon.html   302
EOF
git add _redirects
git commit -m "Rollback: restore splash at root"
git push origin main
```

---

## Admin access

Admin UI is at `/admin.html`, behind Cloudflare Zero Trust Access with One-time PIN (email OTP).

- First visit prompts for your email, PIN arrives seconds later.
- Session lasts 24 hours.
- Add/remove admin emails: Zero Trust dashboard → Access → Applications → `Oros Admin` → policy `Admins` → Emails list.

Admin page shows all entries and exposes a CSV download at `/api/admin/export.csv` (also Access-gated).

---

## D1 database

Database name: `oros-stokvel` (ID in `wrangler.toml`).

### Common queries

```bash
# Total submissions
npx wrangler d1 execute oros-stokvel --remote \
  --command "SELECT COUNT(*) AS total FROM submissions"

# Recent entries
npx wrangler d1 execute oros-stokvel --remote \
  --command "SELECT id, created_at, name, phone, flavour FROM submissions ORDER BY id DESC LIMIT 20"

# Admin activity log
npx wrangler d1 execute oros-stokvel --remote \
  --command "SELECT at, actor, action FROM audit_log ORDER BY id DESC LIMIT 50"

# Flavour tally
npx wrangler d1 execute oros-stokvel --remote \
  --command "SELECT flavour, COUNT(*) AS n FROM submissions GROUP BY flavour ORDER BY n DESC"
```

### Re-apply schema (only if DB was dropped)

```bash
npm run db:migrate:remote
```

The schema is idempotent (`CREATE TABLE IF NOT EXISTS`), so this is safe to re-run.

### Manual retention cleanup (90-day POPIA policy)

Until the scheduled cleanup cron is built, run this monthly:

```bash
npx wrangler d1 execute oros-stokvel --remote \
  --command "DELETE FROM submissions WHERE created_at < datetime('now','-90 days')"
```

---

## Secrets

Set via Wrangler (never commit values):

```bash
npx wrangler pages secret put TURNSTILE_SECRET --project-name=oros-stokvel-microsite
npx wrangler pages secret put DAILY_SALT      --project-name=oros-stokvel-microsite
```

To rotate: run `put` again with the new value. Takes effect on next deploy.

List currently-set secrets (names only):

```bash
npx wrangler pages secret list --project-name=oros-stokvel-microsite
```

---

## Deploy manually (if GitHub auto-build is broken)

```bash
npx wrangler pages deploy . --project-name=oros-stokvel-microsite --branch=main
```

Bypasses GitHub integration entirely. Useful when the "disconnected from Git" banner is up in the Pages dashboard.

---

## Local development

```bash
npm install
echo 'DAILY_SALT="localdev-salt-32chars-minimum"' > .dev.vars
echo 'TURNSTILE_SECRET="1x0000000000000000000000000000000AA"' >> .dev.vars
npm run db:migrate:local
npm run dev
# http://localhost:8788
```

Staging `wrangler.toml` already uses Cloudflare's always-pass test site key (`1x00000000000000000000AA`), paired with the always-pass test secret above in `.dev.vars`. The widget auto-solves and `siteverify` returns `success: true` with no interactive challenge.

### Cloudflare test key variants

| Purpose | Site key | Secret |
|---|---|---|
| Always passes | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always blocks | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |
| Token always invalid server-side | — | `3x0000000000000000000000000000000AA` |

Swap these into `wrangler.toml` / `.dev.vars` to test failure paths locally. **Revert `wrangler.toml` before committing** — `.dev.vars` is gitignored; `wrangler.toml` is not.

### Local D1 gotcha

`wrangler pages dev` and `wrangler d1 execute --local` must resolve to the **same** local SQLite file in `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`. The dev script now relies on the `[[d1_databases]]` binding in `wrangler.toml` (no `--d1` CLI flag), which keeps both commands in sync. If you ever hit `D1_ERROR: no such table: submissions` from the dev server after a successful `npm run db:migrate:local`, you've got two SQLite files — re-run migrate after wiping `.wrangler/state/v3/d1/`.

---

## Post-draw winner verification (OTP)

The draw happens after the campaign closes (`15 December 2026`). Because entry-time verification would introduce friction and SMS cost per entry, draw integrity is enforced *after* the draw, not before: a selected number only becomes a confirmed winner once an SMS code sent to them is entered back on a verification page. If they don't verify within the window, they forfeit and a backup is drawn.

This is already covered by the T&Cs — clause 6.3 allows the Promoter to substitute a backup if a finalist can't be contacted. SMS verification is the operational mechanism for "cannot be successfully contacted."

### Flow

1. **Draw** — Random-sample 10 winners + ~20 backups from `submissions` where `campaign = <current campaign>` and `consent = 1`.
2. **For each drawn number:**
   1. Admin triggers `POST /api/admin/draw/send-otp` with the submission id.
   2. Server generates a 6-digit code, stores a hash of it + an expiry (24h) against the submission, and sends an SMS: *"Oros Stokvel: your winner verification code is 123456. Enter it at https://oros.co.za/verify to claim your R2,000 prize. Reply STOP to opt out."*
   3. Winner receives SMS and enters the code at `/verify`.
   4. `POST /api/verify` checks the code hash, marks `verified_at` on the submission.
3. **Admin dashboard shows status per winner:** `pending`, `verified`, `expired`. Expired slots trigger a redraw from the backup pool.
4. **After all 10 verified,** export the final list for prize fulfilment.

### What needs building

- [ ] `winners` table (or columns on `submissions`): `otp_hash`, `otp_sent_at`, `otp_expires_at`, `verified_at`, `attempts`.
- [ ] `functions/api/admin/draw/*` — draw endpoint, resend-OTP endpoint, redraw endpoint. Admin-authenticated.
- [ ] `functions/api/verify.ts` — public endpoint, rate-limited (3 attempts per submission before lockout).
- [ ] `/verify` HTML page — single input + submit, no personal data entry.
- [ ] SMS provider integration — Clickatell or BulkSMS. Secret: `SMS_API_KEY`.
- [ ] Admin UI additions on `admin.html` — "Run draw", status table, "Resend OTP", "Redraw".

### Cost estimate

- 10 winners + ~20 backups × up to 3 SMS retries = ~90 SMS worst case.
- At ~R0.30/SMS = ~R27 total. Negligible against R20,000 prize pool.

### SMS provider choice (TBD)

| Provider | Cost/SMS | Notes |
|---|---|---|
| BulkSMS | ~R0.25 | SA-based, no setup fee, simple REST API |
| Clickatell | ~R0.30 | Mature, well-documented, works globally |
| Twilio | ~R0.50 | Overkill for a one-off campaign |

Decision needed before draw week.

---

## Known open items

- **Scheduled 90-day cleanup cron** — currently manual (see D1 section).
- **Winner-selection UI** in admin page — currently no way to flag a winner.
- **Post-draw OTP flow** — not yet built; see [Post-draw winner verification](#post-draw-winner-verification-otp).
- **POPIA Ts & Cs page** at `/terms.html` — consent checkbox links here but the page doesn't exist yet.

---

## Key files

| Path | Purpose |
|---|---|
| `index.html` | Entry form (served at `/entry` pre-launch via `_redirects`, at `/` post-launch) |
| `coming-soon.html` | Splash page (served at `/` pre-launch via `_redirects`) |
| `_redirects` | Pre-launch routing override — deleted on launch day |
| `admin.html` | Admin dashboard, Access-protected |
| `app.js`, `styles.css` | Entry-form frontend logic + styles |
| `functions/api/entries.ts` | Public POST endpoint for submissions |
| `functions/api/admin/*` | Access-gated list + CSV export |
| `functions/api/config.ts` | Injects Turnstile site key into the browser |
| `schema.sql` | D1 tables |
| `wrangler.toml` | Project config, D1 binding, public env vars |
