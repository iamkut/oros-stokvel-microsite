import type { Env } from '../../_shared/types';
import { parseFilters, queryEntries, toSASTHuman } from '../../_shared/entries-query';
import { buildXlsx } from '../../_shared/xlsx';
import { requireAdmin } from '../../_shared/auth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  const actor = auth.actor;

  const url = new URL(request.url);
  const filters = parseFilters(url);
  const rows = await queryEntries(env, filters);

  const data = buildXlsx({
    name: 'Entries',
    columns: [
      { header: 'Timestamp (SAST)', width: 22 },
      { header: 'Name', width: 24 },
      { header: 'Phone', width: 16 },
      { header: 'Flavour', width: 14 },
      { header: 'Province', width: 16 },
      { header: 'Opt-in', width: 10 },
      { header: 'Consent', width: 10 }
    ],
    rows: rows.map(r => [
      toSASTHuman(r.created_at),
      r.name,
      r.phone,
      r.flavour,
      r.province ?? '',
      r.opt_in ? 'Yes' : 'No',
      r.consent ? 'Yes' : 'No'
    ])
  });

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'export', ?)`
  ).bind(actor, JSON.stringify({ format: 'xlsx', count: rows.length, filters })).run();

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(data, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="oros-stokvel-entries-${stamp}.xlsx"`,
      'Content-Length': String(data.length)
    }
  });
};
