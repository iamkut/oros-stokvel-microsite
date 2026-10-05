import type { Env } from '../../_shared/types';
import { parseFilters, queryEntries, toSASTHuman } from '../../_shared/entries-query';
import { buildPdf } from '../../_shared/pdf';
import { requireAdmin } from '../../_shared/auth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  const actor = auth.actor;

  const url = new URL(request.url);
  const filters = parseFilters(url);
  const rows = await queryEntries(env, filters);

  const generatedAt = new Date();
  const generatedSast = new Date(generatedAt.getTime() + 2 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19) + ' SAST';
  const parts: string[] = [`${rows.length} entries`, `Generated ${generatedSast}`];
  if (filters.q) parts.push(`search="${filters.q}"`);
  if (filters.flavour) parts.push(`flavour=${filters.flavour}`);
  if (filters.optIn === '1') parts.push('opt-in=yes');
  if (filters.optIn === '0') parts.push('opt-in=no');
  if (filters.from) parts.push(`from=${filters.from}`);
  if (filters.to) parts.push(`to=${filters.to}`);

  const data = buildPdf({
    title: 'Oros Stokvel - Entries',
    subtitle: parts.join('  |  '),
    columns: [
      { header: 'Timestamp (SAST)', width: 140 },
      { header: 'Name', width: 170 },
      { header: 'Phone', width: 110 },
      { header: 'Flavour', width: 110 },
      { header: 'Opt-in', width: 60 },
      { header: 'Consent', width: 60 }
    ],
    rows: rows.map(r => [
      toSASTHuman(r.created_at),
      r.name,
      r.phone,
      r.flavour,
      r.opt_in ? 'Yes' : 'No',
      r.consent ? 'Yes' : 'No'
    ])
  });

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'export', ?)`
  ).bind(actor, JSON.stringify({ format: 'pdf', count: rows.length, filters })).run();

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(data, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="oros-stokvel-entries-${stamp}.pdf"`,
      'Content-Length': String(data.length)
    }
  });
};
