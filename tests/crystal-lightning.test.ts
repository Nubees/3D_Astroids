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
    // Phase 6d follow-up (round 5): floor raised 0.18 → 0.22 alongside
    // the round-5 brightness bump. With scale breathe / position shake
    // / yellow sparks re-enabled, the bolt needs a stronger base
    // presence to stay dominant in the visual budget.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.22, 2);
    bolt.dispose();
  });

  it('update(dt, charge=1) caps peak opacity (anti white-out)', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 1, { x: 0, y: 0 }, 1.0, 42);
    // Phase 6d follow-up (round 5): peak raised 0.50 → 0.65 with the
    // bolt thickness bump (round 5) and the re-enabled competing FX.
    // 2 strikes × 0.65 = 1.3 per channel — slightly over saturation
    // but on a cyan color, so the result is a bright cyan-white
    // crackle, not a white-out. The over-saturation is what makes
    // the bolt pop against the animated crystal body.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.65, 2);
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