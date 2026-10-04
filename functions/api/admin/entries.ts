import type { Env } from '../../_shared/types';
import { json } from '../../_shared/util';

interface Row {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  flavour: string;
  opt_in: number;
  consent: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const actor = request.headers.get('CF-Access-Authenticated-User-Email');
  if (!actor) return json({ error: 'Unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT id, created_at, name, phone, flavour, opt_in, consent
     FROM submissions
     WHERE campaign = ?
     ORDER BY created_at DESC
     LIMIT 1000`
  ).bind(env.CAMPAIGN).all<Row>();

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'list', ?)`
  ).bind(actor, JSON.stringify({ count: rows.results?.length ?? 0 })).run();

  return json({ entries: rows.results ?? [] });
};
