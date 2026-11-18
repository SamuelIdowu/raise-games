import { v7 as uuidv7 } from 'uuid';

/** Accept a caller-supplied id only if it is short and plain (no log injection). */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * pino-http `genReqId` (Sprint 15, F15.4): keeps a valid incoming `x-request-id`, else
 * mints a UUIDv7, and echoes it on the response so a player's report can be traced.
 */
export function requestIdFor(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { headersSent: boolean; setHeader(name: string, value: string): unknown },
): string {
  const given = req.headers['x-request-id'];
  const candidate = Array.isArray(given) ? given[0] : given;
  const id = candidate && SAFE_ID.test(candidate) ? candidate : uuidv7();
  if (!res.headersSent) res.setHeader('x-request-id', id);
  return id;
}
