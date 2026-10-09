import type { Env, EntryPayload } from '../_shared/types';
import { FLAVOURS, PROVINCES, isValidStore } from '../_shared/types';
import { json, normalizePhone, sha256, verifyTurnstile } from '../_shared/util';

const MAX_PER_IP_PER_HOUR = 200;
const MIN_FORM_FILL_MS = 2000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: EntryPayload;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  // Honeypot: hidden field only bots fill. Silent-ish rejection — don't leak the trick.
  if ((body.website ?? '').trim() !== '') {
    return json({ error: 'Something went wrong. Please try again.' }, 400);
  }

  // Minimum fill time: a human cannot complete the form in under 2 seconds.
  if (typeof body.elapsedMs !== 'number' || body.elapsedMs < MIN_FORM_FILL_MS) {
    return json({ error: 'Something went wrong. Please try again.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, ip);
  if (!turnstileOk) return json({ error: 'Verification failed. Please try again.' }, 400);

  const name = (body.name ?? '').trim();
  const phone = normalizePhone(body.phone ?? '');
  const flavour = body.flavour ?? '';
  const province = body.province ?? '';
  const store = (body.store ?? '').trim();

  if (name.length < 2) return json({ error: 'Please enter your name and surname.' }, 400);
  if (!phone) return json({ error: 'Please enter a valid SA contact number.' }, 400);
  if (!FLAVOURS.includes(flavour)) return json({ error: 'Please select a flavour.' }, 400);
  if (!PROVINCES.includes(province)) return json({ error: 'Please select your province.' }, 400);
  if (!store || !isValidStore(province, store)) return json({ error: 'Please select your store.' }, 400);
  if (body.consent !== true) return json({ error: 'Please confirm you are 18+ and accept the Ts & Cs.' }, 400);

  const ipHash = ip ? await sha256(ip + env.DAILY_SALT) : null;

  if (ipHash) {
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions
       WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')`
    ).bind(ipHash).first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return json({ error: 'Too many attempts from this network. Please try again later.' }, 429);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO submissions (name, phone, flavour, province, store, opt_in, consent, ip_hash, user_agent, campaign)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(
      name,
      phone,
      flavour,
      province,
      store,
      body.optIn === true ? 1 : 0,
      ipHash,
      request.headers.get('User-Agent') ?? '',
      env.CAMPAIGN
    ).run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE')) {
      return json({ error: 'This number has already entered the competition.' }, 409);
    }
    console.error('Insert failed:', msg);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }

  return json({ ok: true });
};
