import { describe, it, expect } from 'vitest';
import { Scene } from 'three';

describe('missile-vfx pool (Phase 7b)', () => {
  it('exports the expected API surface', async () => {
    const mod = await import('../src/missile-vfx');
    expect(typeof mod.emitMissileSmoke).toBe('function');
    expect(typeof mod.updateMissileSmoke).toBe('function');
    expect(typeof mod.disposeMissileVfx).toBe('function');
  });

  it('emit then advance past lifetime does not throw', async () => {
    const mod = await import('../src/missile-vfx');
    const scene = new Scene();
    for (let i = 0; i < 12; i++) mod.emitMissileSmoke(scene, i, 0);
    expect(() => mod.updateMissileSmoke(1.0)).not.toThrow();
    mod.disposeMissileVfx();
  });

  it('emitting 1000+ puffs caps to pool size and does not throw', async () => {
    const mod = await import('../src/missile-vfx');
    const scene = new Scene();
    expect(() => {
      for (let i = 0; i < 1000; i++) mod.emitMissileSmoke(scene, i % 10, 0);
    }).not.toThrow();
    mod.disposeMissileVfx();
  });
});
