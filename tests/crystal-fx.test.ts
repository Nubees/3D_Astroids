import { describe, it, expect } from 'vitest';
import { getHeartbeatPhase, computeBoltEndpoints } from '../src/crystal-fx';

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

describe('computeBoltEndpoints', () => {
  it('produces (segs + 1) vertices per bolt', () => {
    const { positions } = computeBoltEndpoints(42, 1.0, 8);
    // (segs + 1) vertices × 3 floats = 27 floats
    expect(positions.length).toBe((8 + 1) * 3);
  });

  it('start vertex lies just inside the crystal surface (radius * 0.95)', () => {
    const { positions } = computeBoltEndpoints(42, 2.0, 8);
    const startX = positions[0];
    const startY = positions[1];
    const startZ = positions[2];
    const startDist = Math.sqrt(startX * startX + startY * startY + startZ * startZ);
    expect(startDist).toBeCloseTo(2.0 * 0.95, 1);
  });

  it('end vertex lies 1.5-2.5 crystal-radii from origin', () => {
    for (let i = 0; i < 20; i += 1) {
      const { positions } = computeBoltEndpoints(i * 17 + 1, 1.0, 8);
      const lastIdx = positions.length - 3;
      const endX = positions[lastIdx];
      const endY = positions[lastIdx + 1];
      const endZ = positions[lastIdx + 2];
      const endDist = Math.sqrt(endX * endX + endY * endY + endZ * endZ);
      expect(endDist).toBeGreaterThanOrEqual(1.5);
      expect(endDist).toBeLessThanOrEqual(2.5);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = computeBoltEndpoints(123, 1.0, 8);
    const b = computeBoltEndpoints(123, 1.0, 8);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});
