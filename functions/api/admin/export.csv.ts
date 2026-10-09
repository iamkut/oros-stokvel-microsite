import type { Env } from '../../_shared/types';
import { parseFilters, queryEntries, toSAST } from '../../_shared/entries-query';
import { requireAdmin } from '../../_shared/auth';

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  const actor = auth.actor;

  const url = new URL(request.url);
  const filters = parseFilters(url);
  const rows = await queryEntries(env, filters);

  const header = ['timestamp', 'name', 'phone', 'flavour', 'province', 'store', 'opt_in', 'consent'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(toSAST(r.created_at)),
      csvEscape(r.name),
      csvEscape(r.phone),
      csvEscape(r.flavour),
      csvEscape(r.province),
      csvEscape(r.store),
      r.opt_in ? 'Yes' : 'No',
      r.consent ? 'Yes' : 'No'
    ].join(','));
  }
  const csv = '﻿' + lines.join('\r\n');

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'export', ?)`
  ).bind(actor, JSON.stringify({ format: 'csv', count: rows.length, filters })).run();

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="oros-stokvel-entries-${stamp}.csv"`
    }
  });
};
