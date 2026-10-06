import type { Env } from '../../_shared/types';
import { json, normalizePhone, sha256 } from '../../_shared/util';

// Public endpoint: toggle marketing opt-in for a phone number.
// POPIA requires opt-out to always succeed, so the limit is per-IP (not per
// phone) and generous — it throttles abuse without blocking a legitimate
// withdrawal of consent.
//
// TODO (OTP): require a one-time code (from /lookup → SMS) alongside the
// phone + optIn fields before writing. Reject if the code is missing, expired,
// or doesn't match. Store codes in a short-lived KV namespace or a new
// consent_otps table keyed by phone hash.

const MAX_UPDATES_PER_IP_PER_HOUR = 10;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { phone?: string; optIn?: boolean };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const phone = normalizePhone(body.phone ?? '');
  if (!phone) return json({ error: 'Please enter a valid SA contact number.' }, 400);
  if (typeof body.optIn !== 'boolean') return json({ error: 'Missing opt-in value.' }, 400);

  const ip = request.headers.get('CF-Connecting-IP');
  const ipHash = ip ? await sha256(ip + env.DAILY_SALT) : null;

  if (ipHash) {
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM audit_log
       WHERE actor = ? AND action = 'consent_update'
         AND at > datetime('now', '-1 hour')`
    ).bind('ip:' + ipHash).first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_UPDATES_PER_IP_PER_HOUR) {
      return json({ error: 'Too many updates from this network. Please try again later.' }, 429);
    }
  }

  const existing = await env.DB.prepare(
    `SELECT opt_in FROM submissions WHERE campaign = ? AND phone = ?`
  ).bind(env.CAMPAIGN, phone).first<{ opt_in: number }>();

  if (!existing) return json({ error: 'No entry found for that number.' }, 404);

  const next = body.optIn ? 1 : 0;
  const prev = existing.opt_in;

  if (next !== prev) {
    await env.DB.prepare(
      `UPDATE submissions SET opt_in = ? WHERE campaign = ? AND phone = ?`
    ).bind(next, env.CAMPAIGN, phone).run();
  }

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'consent_update', ?)`
  ).bind(
    'ip:' + (ipHash ?? 'unknown'),
    JSON.stringify({ phone, from: prev, to: next, changed: next !== prev })
  ).run();

  return json({ ok: true, optIn: next === 1 });
};
