import type { Env } from '../../_shared/types';
import { clearSessionCookie, getSession } from '../../_shared/auth';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getSession(request, env);
  if (session) {
    await env.DB.prepare(
      `INSERT INTO audit_log (actor, action, details) VALUES (?, 'logout', ?)`
    ).bind(session.sub, '{}').run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': clearSessionCookie()
    }
  });
};
