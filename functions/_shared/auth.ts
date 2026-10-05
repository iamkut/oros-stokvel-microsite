import type { Env } from './types';

const COOKIE_NAME = 'oros_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

interface SessionPayload {
  sub: string;   // username
  iat: number;   // issued-at (unix seconds)
  exp: number;   // expiry (unix seconds)
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

async function verify(payload: string, sig: string, secret: string): Promise<boolean> {
  const key = await hmacKey(secret);
  try {
    return await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

// Compare two short strings in constant time.
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export async function issueSessionCookie(env: Env, username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await sign(body, env.SESSION_SECRET);
  const token = `${body}.${sig}`;
  return (
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    if (p.slice(0, eq) === name) return p.slice(eq + 1);
  }
  return null;
}

export async function getSession(
  request: Request,
  env: Env
): Promise<SessionPayload | null> {
  if (!env.SESSION_SECRET) return null;
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await verify(body, sig, env.SESSION_SECRET))) return null;
  let payload: SessionPayload;
  try {
    const json = new TextDecoder().decode(b64urlDecode(body));
    payload = JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

// Guard for admin endpoints. Returns the actor username on success, or a
// 401 Response on failure.
export async function requireAdmin(
  request: Request,
  env: Env
): Promise<{ actor: string } | Response> {
  const session = await getSession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  return { actor: session.sub };
}
