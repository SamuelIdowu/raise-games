import { connect } from 'node:net';

/**
 * Every e2e signup comes from 127.0.0.1, so repeated local runs trip the per-IP
 * OTP limit. Clear only those keys (raw RESP, no Redis client dependency).
 */
export default async function globalSetup() {
  const url = new URL(process.env.E2E_REDIS_URL ?? 'redis://localhost:6379');
  const script =
    "for _,k in ipairs(redis.call('keys', ARGV[1])) do redis.call('del', k) end return 1";
  const args = ['EVAL', script, '0', 'otp:rate:ip:*'];
  const command =
    `*${args.length}\r\n` +
    args.map((a) => '$' + Buffer.byteLength(a) + '\r\n' + a + '\r\n').join('');
  await new Promise<void>((resolve) => {
    const socket = connect(Number(url.port || 6379), url.hostname, () => socket.write(command));
    socket.once('data', () => {
      socket.end();
      resolve();
    });
    socket.once('error', () => resolve()); // best-effort: a fresh Redis has nothing to clear
    socket.setTimeout(3000, () => {
      socket.destroy();
      resolve();
    });
  });
}
