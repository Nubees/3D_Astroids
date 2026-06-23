import { describe, it, expect } from 'vitest';
import { getHeartbeatPhase } from '../src/crystal-fx';

describe('getHeartbeatPhase', () => {
  it('returns 0 at the start of each heartbeat cycle', () => {
    expect(getHeartbeatPhase(0)).toBeCloseTo(0, 5);
    expect(getHeartbeatPhase(0.15)).toBeCloseTo(0, 5);
    expect(getHeartbeatPhase(0.30)).toBeCloseTo(0, 5);
  });

  it('peaks at t=0.075s within each cycle', () => {
    expect(getHeartbeatPhase(0.075)).toBeCloseTo(1.0, 5);
    expect(getHeartbeatPhase(0.225)).toBeCloseTo(1.0, 5);
  });

  it('stays in [0, 1] across many cycles', () => {
    for (let i = 0; i < 50; i += 1) {
      const v = getHeartbeatPhase(i * 0.01);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
