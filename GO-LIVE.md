# Oros Stokvel - Operations Runbook

Short reference for recurring operational tasks on the live site.
Deployment stack: Cloudflare Pages + Workers (Pages Functions) + D1 + Turnstile + Zero Trust Access.

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

Turnstile auto-skips in local dev (the frontend sees no site key and bypasses the check), so form submits work without the challenge.

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
