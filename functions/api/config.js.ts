import type { Env } from '../_shared/types';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const body = `window.OROS_CONFIG = ${JSON.stringify({
    turnstileSiteKey: env.TURNSTILE_SITE_KEY
  })};`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
};
