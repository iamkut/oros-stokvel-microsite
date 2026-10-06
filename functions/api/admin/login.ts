import type { Env } from '../../_shared/types';
import { issueSessionCookie, timingSafeEqual } from '../../_shared/auth';
import { json } from '../../_shared/util';

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: 'Admin login is not configured on this server.' }, 503);
  }

  let body: LoginPayload;
  try {
    body = await request.json<LoginPayload>();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    return json({ error: 'Username and password are required.' }, 400);
  }

  // Constant-time compare on both to avoid user enumeration via timing.
  const userOk = timingSafeEqual(username, env.ADMIN_USERNAME);
  const passOk = timingSafeEqual(password, env.ADMIN_PASSWORD);
  if (!(userOk && passOk)) {
    // Small delay to blunt brute-force cadence a little.
    await new Promise(r => setTimeout(r, 350));
    return json({ error: 'Invalid credentials.' }, 401);
  }

  const cookie = await issueSessionCookie(env, username);

  await env.DB.prepare(
    `INSERT INTO audit_log (actor, action, details) VALUES (?, 'login', ?)`
  ).bind(username, JSON.stringify({ ip: request.headers.get('CF-Connecting-IP') ?? null })).run();

  return new Response(JSON.stringify({ ok: true, user: username }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': cookie
    }
  });
};
