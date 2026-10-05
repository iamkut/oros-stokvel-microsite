# Oros Stokvel - Operations Runbook

Short reference for recurring operational tasks on the live site.
Deployment stack: Cloudflare Pages + Workers (Pages Functions) + D1 + Turnstile + Zero Trust Access.

> **⚠ Turnstile is currently PARKED.** The entry form submits without CAPTCHA verification. See [Pre-launch: un-park Turnstile](#pre-launch-un-park-turnstile) before go-live.

---

## Pre-launch: un-park Turnstile

Turnstile verification was temporarily disabled during pre-launch work. The relevant code is still in the tree, marked with `PARKED:` comments. Un-parking is a straight revert of five edits — no infra changes needed (the production `TURNSTILE_SECRET` is still set in Pages, and `TURNSTILE_SITE_KEY` is still in `wrangler.toml`).

Find all un-park points:

```bash
grep -rn "PARKED:" .
```

You'll find them in:

| File | What to restore |
|---|---|
| `functions/api/entries.ts` | Uncomment the `verifyTurnstile` call + the 400 return |
| `app.js` (goTo) | Restore `if (step === 'form') mountTurnstile();` |
| `app.js` (submit handler) | Restore the token-presence check and `turnstileToken: token` payload field |
| `index.html` (`<head>`) | Uncomment the Turnstile `<script>` tag |
| `index.html` (form) | Uncomment the `<div class="cf-turnstile">` widget |

After un-parking, test locally with Cloudflare's test keys (see [Local development](#local-development)) before pushing.

**Risk of leaving Turnstile parked at go-live:** the only submission-rate defense is `MAX_PER_IP_PER_HOUR = 5` in [`functions/api/entries.ts`](functions/api/entries.ts) + the `UNIQUE(campaign, phone)` DB constraint. Bots can still burn through the IP cap and pollute the DB.

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
npm run db:migrate:local
npm run dev
# http://localhost:8788
```

While Turnstile is parked (see top of this doc), the form submits locally without a CAPTCHA challenge.

### Testing with Turnstile re-enabled

Once un-parked, use Cloudflare's always-pass test keys (public, documented by Cloudflare) so you don't need a real widget locally:

1. In `wrangler.toml` temporarily set `TURNSTILE_SITE_KEY = "1x00000000000000000000AA"`.
2. In `.dev.vars` add `TURNSTILE_SECRET="1x0000000000000000000000000000000AA"`.
3. Restart `npm run dev`. The widget auto-solves, the token POSTs, and `siteverify` returns `success: true`.

Other Cloudflare test variants for exercising failure paths:

| Purpose | Site key | Secret |
|---|---|---|
| Always passes | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always blocks | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |
| Token always invalid server-side | — | `3x0000000000000000000000000000000AA` |

**Revert `wrangler.toml` before committing.** `.dev.vars` is gitignored; `wrangler.toml` is not.

### Local D1 gotcha

`wrangler pages dev` and `wrangler d1 execute --local` must resolve to the **same** local SQLite file in `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`. The dev script now relies on the `[[d1_databases]]` binding in `wrangler.toml` (no `--d1` CLI flag), which keeps both commands in sync. If you ever hit `D1_ERROR: no such table: submissions` from the dev server after a successful `npm run db:migrate:local`, you've got two SQLite files — re-run migrate after wiping `.wrangler/state/v3/d1/`.

---

## Known open items

- **Scheduled 90-day cleanup cron** — currently manual (see D1 section).
- **Winner-selection UI** in admin page — currently no way to flag a winner.
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
