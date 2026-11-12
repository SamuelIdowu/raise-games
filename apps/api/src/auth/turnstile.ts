export interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstileToken(
  secret: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = (await res.json()) as TurnstileResponse;
  return data.success === true;
}
