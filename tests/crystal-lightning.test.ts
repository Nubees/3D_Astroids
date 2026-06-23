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
    // Phase 6d follow-up (round 2): floor raised 0.10 → 0.18 after
    // round 1 (peak 0.35, floor 0.10) made the bolts too dim to see
    // against the crystal's bloom-flash. 0.18 keeps a visible crackle
    // throughout the burst window instead of only in the final 30%.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.18, 2);
    bolt.dispose();
  });

  it('update(dt, charge=1) caps peak opacity (anti white-out)', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 1, { x: 0, y: 0 }, 1.0, 42);
    // Phase 6d follow-up (round 2): peak raised 0.35 → 0.50 after
    // round 1 (peak 0.35) made the bolts invisible against the
    // crystal's bloom-flash. New peak 0.50 with 2 strikes gives a
    // per-channel additive sum of ~1.0 — right at saturation but
    // still on a cyan color, not white. Bright cyan-white crackle
    // without white-out.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.5, 2);
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