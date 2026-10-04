import type { Env } from '../../_shared/types';

interface Row {
  created_at: string;
  name: string;
  phone: string;
  flavour: string;
  opt_in: number;
  consent: number;
}

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const actor = request.headers.get('CF-Access-Authenticated-User-Email');
  if (!actor) return new Response('Unauthorized', { status: 401 });

  const rows = await env.DB.prepare(
    `SELECT created_at, name, phone, flavour, opt_in, consent
     FROM submissions
     WHERE campaign = ?
     ORDER BY created_at DESC`
  ).bind(env.CAMPAIGN).all<Row>();

  const header = ['timestamp', 'name', 'phone', 'flavour', 'opt_in', 'consent'];
  const lines = [header.join(',')];
  for (const r of rows.results ?? []) {
    lines.push([
      csvEscape(r.created_at),
      csvEscape(r.name),
      csvEscape(r.phone),
      csvEscape(r.flavour),
      r.opt_in ? 'Yes' : 'No',
      r.consent ? 'Yes' : 'No'
    ].join(','));
  }
  const csv = '﻿' + lines.join('\r\n');

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'export', ?)`
  ).bind(actor, JSON.stringify({ count: rows.results?.length ?? 0 })).run();

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="oros-stokvel-entries-${stamp}.csv"`
    }
  });
};
