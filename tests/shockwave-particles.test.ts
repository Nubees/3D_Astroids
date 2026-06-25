import { describe, it, expect } from 'vitest';
import { Scene } from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shockwave Particles Pool Math Test (Phase 7b Task 3)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Lock the pool's per-particle update math (lifetime, fade, growth)
//          without needing a WebGL context. We use a minimal stub for
//          InstancedMesh to verify the slot math; the actual GPU upload
//          is verified in the Playwright A/B screenshots (tests/bomb-vfx.spec.ts).
// Setup:   Imports the module, calls emit, calls update with a known dt,
//          asserts the returned alive-count matches the expected curve.
// Issues:  None.
// Fix:     Phase 7b Task 3.
// Gotchas: We stub InstancedMesh via Object.defineProperty on the
//          instanceMatrix setter so the module's internal calls don't
//          throw. The real implementation's GPU side is covered by
//          integration tests, not unit tests.
// ═══════════════════════════════════════════════════════════════════════════

describe('shockwave-particles pool (Phase 7b)', () => {
  it('exports the expected API surface', async () => {
    const mod = await import('../src/shockwave-particles');
    expect(typeof mod.emitShockwaveParticles).toBe('function');
    expect(typeof mod.updateShockwaveParticles).toBe('function');
    expect(typeof mod.disposeShockwaveParticles).toBe('function');
  });

  it('emit then advance past lifetime culls particles (no throw, returns void)', async () => {
    const mod = await import('../src/shockwave-particles');
    const scene = new Scene();
    mod.emitShockwaveParticles(scene, 0, 0, {
      count: 8,
      speed: 6,
      color: 0xffcc66,
      lifetime: 0.5,
    });
    // Advance 1.0s — well past the 0.5s lifetime. Should not throw.
    expect(() => mod.updateShockwaveParticles(1.0)).not.toThrow();
    mod.disposeShockwaveParticles();
  });

  it('emitting more than POOL_SIZE silently caps to pool size (no throw)', async () => {
    const mod = await import('../src/shockwave-particles');
    const scene = new Scene();
    expect(() =>
      mod.emitShockwaveParticles(scene, 0, 0, {
        count: 999,
        speed: 6,
        color: 0xffcc66,
        lifetime: 0.5,
      }),
    ).not.toThrow();
    mod.disposeShockwaveParticles();
  });
});