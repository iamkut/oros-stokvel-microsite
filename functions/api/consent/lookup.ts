import type { Env } from '../../_shared/types';
import { json, normalizePhone, sha256 } from '../../_shared/util';

// Public endpoint: look up an entry by phone to review current opt-in state.
// No auth (POPIA requires low-friction opt-out) but aggressively rate-limited
// per IP to prevent enumeration.
//
// TODO (OTP): before returning the entry, send a one-time code via SMS to the
// supplied number and require it on /update. Needs an SMS provider (e.g.
// Clickatell/Vonage) wired in via env secrets; see consent/update.ts for the
// matching verification step.

const MAX_LOOKUPS_PER_IP_PER_HOUR = 15;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const phone = normalizePhone(body.phone ?? '');
  if (!phone) return json({ error: 'Please enter a valid SA contact number.' }, 400);

  const ip = request.headers.get('CF-Connecting-IP');
  const ipHash = ip ? await sha256(ip + env.DAILY_SALT) : null;

  if (ipHash) {
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM audit_log
       WHERE actor = ? AND action = 'consent_lookup'
         AND at > datetime('now', '-1 hour')`
    ).bind('ip:' + ipHash).first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_LOOKUPS_PER_IP_PER_HOUR) {
      return json({ error: 'Too many lookups from this network. Please try again later.' }, 429);
    }
  }

  const row = await env.DB.prepare(
    `SELECT name, phone, opt_in
       FROM submissions
      WHERE campaign = ? AND phone = ?`
  ).bind(env.CAMPAIGN, phone).first<{ name: string; phone: string; opt_in: number }>();

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'consent_lookup', ?)`
  ).bind('ip:' + (ipHash ?? 'unknown'), JSON.stringify({ phone, found: !!row })).run();

  if (!row) return json({ found: false });

  // Mask the name slightly to reduce info exposure on confirmed numbers:
  // show first name only.
  const firstName = (row.name || '').trim().split(/\s+/)[0] ?? '';

  return json({
    found: true,
    name: firstName,
    phone: row.phone,
    optIn: row.opt_in === 1
  });
};
