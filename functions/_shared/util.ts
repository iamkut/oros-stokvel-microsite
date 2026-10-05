// Collapse SA phone numbers to canonical E.164 (+27XXXXXXXXX) so that
// +27662535135, 0662535135, 27662535135, and +270662535135 all compare equal.
// Returns null for anything that cannot be read as a 9-digit SA subscriber number.
export function normalizePhone(raw: string): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('27')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^\d{9}$/.test(digits)) return null;
  return '+27' + digits;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  ip: string | null
): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });
  const data = await res.json<{ success: boolean }>();
  return data.success === true;
}
