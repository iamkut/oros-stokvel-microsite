import type { Env } from '../../_shared/types';
import { json } from '../../_shared/util';
import { parseFilters, queryEntries } from '../../_shared/entries-query';
import { requireAdmin } from '../../_shared/auth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const filters = parseFilters(url);
  const entries = await queryEntries(env, filters, 1000);

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'list', ?)`
  ).bind(auth.actor, JSON.stringify({ count: entries.length, filters })).run();

  return json({ entries });
};
