import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CrystalLightning } from '../src/crystal-fx';

describe('CrystalLightning', () => {
  it('constructor produces a non-null mesh with the expected material setup', () => {
    const bolt = new CrystalLightning(42);
    expect(bolt.mesh).toBeDefined();
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).blending).toBe(THREE.AdditiveBlending);
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    bolt.dispose();
  });

  it('update(dt, charge=0) keeps bolts visible (low opacity floor)', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 0, { x: 0, y: 0 }, 1.0, 42);
    // Phase 6d follow-up: floor dropped 0.15 → 0.10. Combined with
    // STRIKES_PER_CRYSTAL=2 (was 4) and halved strike radius, the
    // additive contribution per frame is ~1/4 of the Phase 6d initial
    // tuning. Floor 0.10 keeps a hint of crackle visible from the
    // start of the burst window without dominating the scene.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.1, 2);
    bolt.dispose();
  });

  it('update(dt, charge=1) caps peak opacity (anti white-out)', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 1, { x: 0, y: 0 }, 1.0, 42);
    // Phase 6d follow-up: peak dropped 0.55 → 0.35. With 2 strikes
    // (was 4) at the dimmer color, peak × N = 0.7 per channel — far
    // below the white-out threshold of ~1.0. Bolts read as fine
    // electrical arcs, not a wash of glow.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.35, 2);
    bolt.dispose();
  });

  it('mesh.position follows worldPos', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 0.5, { x: 7, y: -3 }, 1.0, 42);
    expect(bolt.mesh.position.x).toBeCloseTo(7, 5);
    expect(bolt.mesh.position.y).toBeCloseTo(-3, 5);
    bolt.dispose();
  });

  it('dispose releases GPU resources', () => {
    const bolt = new CrystalLightning(42);
    expect(() => bolt.dispose()).not.toThrow();
  });
});