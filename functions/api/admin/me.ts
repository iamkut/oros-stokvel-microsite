import type { Env } from '../../_shared/types';
import { getSession } from '../../_shared/auth';
import { json } from '../../_shared/util';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getSession(request, env);
  if (!session) return json({ authenticated: false }, 401);
  return json({ authenticated: true, user: session.sub, exp: session.exp });
};
