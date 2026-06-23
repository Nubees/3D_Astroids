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
    // Phase 6d tuning: floor dropped from 0.3 → 0.15 to keep 4 overlapping
    // strikes + AdditiveBlending from saturating the framebuffer. Bolts
    // still readable at rest, but the screen doesn't go white.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.15, 2);
    bolt.dispose();
  });

  it('update(dt, charge=1) caps peak opacity (anti white-out)', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 1, { x: 0, y: 0 }, 1.0, 42);
    // Phase 6d tuning: peak capped at 0.55 (not 1.0). With 4 overlapping
    // strikes at 0.55-color × AdditiveBlending, the framebuffer sum stays
    // below 2.2 — bright cyan-white flash, not pure white screen. Prior
    // peak of 1.0 with color 0xfff0d0 saturated every channel past 1.0
    // and wiped out the whole scene.
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.55, 2);
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