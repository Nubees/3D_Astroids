import { describe, it, expect } from 'vitest';
import { getHeartbeatPhase, CrystalBoltSparks } from '../src/crystal-fx';

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

describe('CrystalBoltSparks', () => {
  it('pool size is between 32 and 48', () => {
    const sparks = new CrystalBoltSparks(42);
    // The positions buffer size reveals the pool size
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    const poolSize = positionsAttr.array.length / 3;
    expect(poolSize).toBeGreaterThanOrEqual(32);
    expect(poolSize).toBeLessThanOrEqual(48);
    sparks.dispose();
  });

  it('all particles start parked off-screen at origin', () => {
    const sparks = new CrystalBoltSparks(42);
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      expect(positionsAttr.array[i]).toBe(9999);
      expect(positionsAttr.array[i + 1]).toBe(9999);
    }
    sparks.dispose();
  });

  it('emits sparks when charge > 0', () => {
    const sparks = new CrystalBoltSparks(42);
    // deltaTime 0.05s × rate 35 (charge=0.5 → rate=35) → expected ~1.75+r,
    // capped at 8 per frame. Rounds to ≥1 in 100% of trials.
    sparks.emit(0.5, { x: 0, y: 0 }, 1.0, 0.05);
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    let movedCount = 0;
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      if (positionsAttr.array[i] !== 9999) movedCount += 1;
    }
    expect(movedCount).toBeGreaterThan(0);
    sparks.dispose();
  });

  it('does not emit when charge is 0', () => {
    const sparks = new CrystalBoltSparks(42);
    sparks.emit(0, { x: 0, y: 0 }, 1.0, 0.016);
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      expect(positionsAttr.array[i]).toBe(9999);
    }
    sparks.dispose();
  });

  it('ages particles to 0.6s then parks them off-screen', () => {
    const sparks = new CrystalBoltSparks(42);
    sparks.emit(0.5, { x: 0, y: 0 }, 1.0, 0.016);
    sparks.update(1.0); // 1 second > 0.6s lifetime
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      expect(positionsAttr.array[i]).toBe(9999);
      expect(positionsAttr.array[i + 1]).toBe(9999);
    }
    sparks.dispose();
  });
});
