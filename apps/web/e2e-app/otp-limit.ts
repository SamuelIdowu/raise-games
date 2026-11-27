import { connect } from 'node:net';

/**
 * Every e2e signup comes from 127.0.0.1, so a full run trips the per-IP OTP limit.
 * The same applies to the per-IP WebSocket connect limit (every page load opens a socket).
 * Clears only those keys (raw RESP, no Redis client dependency). Best-effort.
 */
export async function clearOtpIpLimit(): Promise<void> {
  const url = new URL(process.env.E2E_REDIS_URL ?? 'redis://localhost:6379');
  const script =
    "for _,p in ipairs(ARGV) do for _,k in ipairs(redis.call('keys', p)) do redis.call('del', k) end end return 1";
  const args = ['EVAL', script, '0', 'otp:rate:ip:*', 'rl:ws:connect:*'];
  const command =
    `*${args.length}\r\n` +
    args.map((a) => '$' + Buffer.byteLength(a) + '\r\n' + a + '\r\n').join('');
  await new Promise<void>((resolve) => {
    const socket = connect(Number(url.port || 6379), url.hostname, () => socket.write(command));
    socket.once('data', () => {
      socket.end();
      resolve();
    });
    socket.once('error', () => resolve()); // a fresh Redis has nothing to clear
    socket.setTimeout(3000, () => {
      socket.destroy();
      resolve();
    });
  });
}
