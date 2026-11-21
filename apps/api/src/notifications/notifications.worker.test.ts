import { describe, expect, it } from 'vitest';
import { deliverJobId } from './notifications.worker';

describe('deliverJobId', () => {
  it('is stable per notification + channel and has no ":" (BullMQ rejects it)', () => {
    const id = deliverJobId('01a1e833-2734-72cd-b392-25d3ab4526ef', 'email');
    expect(id).toBe('deliver-01a1e833-2734-72cd-b392-25d3ab4526ef-email');
    expect(id).not.toContain(':');
    expect(deliverJobId('n', 'push')).not.toBe(deliverJobId('n', 'email'));
  });
});
