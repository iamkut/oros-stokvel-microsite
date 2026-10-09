import type { Env } from './types';

export interface EntryRow {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  flavour: string;
  province: string | null;
  store: string | null;
  opt_in: number;
  consent: number;
}

export interface EntryFilters {
  q?: string;
  flavour?: string;
  province?: string;
  store?: string;
  optIn?: '1' | '0';
  from?: string; // YYYY-MM-DD in SAST
  to?: string;   // YYYY-MM-DD in SAST
}

export function parseFilters(url: URL): EntryFilters {
  const g = (k: string) => {
    const v = url.searchParams.get(k);
    return v == null || v === '' ? undefined : v;
  };
  const optInRaw = g('optIn');
  const optIn = optInRaw === '1' || optInRaw === '0' ? optInRaw : undefined;
  return {
    q: g('q'),
    flavour: g('flavour'),
    province: g('province'),
    store: g('store'),
    optIn,
    from: g('from'),
    to: g('to')
  };
}

// Convert a SAST YYYY-MM-DD date into a UTC ISO string at the day boundary.
// SA has no DST, so the offset is constant +02:00.
function sastDayStartUtc(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  // Start of day in SAST = 00:00+02:00 = (previous day) 22:00 UTC
  const t = Date.UTC(y, m - 1, d, 0, 0, 0) - 2 * 60 * 60 * 1000;
  return new Date(t).toISOString();
}

function sastDayEndUtc(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  // End of day in SAST = 23:59:59.999+02:00 = next day 21:59:59.999 UTC
  const t = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 2 * 60 * 60 * 1000;
  return new Date(t).toISOString();
}

export async function queryEntries(
  env: Env,
  filters: EntryFilters,
  limit?: number
): Promise<EntryRow[]> {
  const where: string[] = ['campaign = ?'];
  const binds: unknown[] = [env.CAMPAIGN];

  if (filters.q) {
    where.push('(name LIKE ? OR phone LIKE ?)');
    const pattern = `%${filters.q}%`;
    binds.push(pattern, pattern);
  }
  if (filters.flavour) {
    where.push('flavour = ?');
    binds.push(filters.flavour);
  }
  if (filters.province) {
    where.push('province = ?');
    binds.push(filters.province);
  }
  if (filters.store) {
    where.push('store = ?');
    binds.push(filters.store);
  }
  if (filters.optIn === '1' || filters.optIn === '0') {
    where.push('opt_in = ?');
    binds.push(Number(filters.optIn));
  }
  if (filters.from) {
    const iso = sastDayStartUtc(filters.from);
    if (iso) { where.push('created_at >= ?'); binds.push(iso); }
  }
  if (filters.to) {
    const iso = sastDayEndUtc(filters.to);
    if (iso) { where.push('created_at <= ?'); binds.push(iso); }
  }

  let sql =
    `SELECT id, created_at, name, phone, flavour, province, store, opt_in, consent
       FROM submissions
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC`;
  if (typeof limit === 'number') sql += ` LIMIT ${limit}`;

  const rs = await env.DB.prepare(sql).bind(...binds).all<EntryRow>();
  return rs.results ?? [];
}

// Convert a UTC ISO string to a SAST ISO string with +02:00 offset.
export function toSAST(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const shifted = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  return shifted.toISOString().replace('Z', '+02:00');
}

// Human-readable SAST timestamp (YYYY-MM-DD HH:mm:ss).
export function toSASTHuman(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const shifted = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  return shifted.toISOString().replace('T', ' ').slice(0, 19);
}
