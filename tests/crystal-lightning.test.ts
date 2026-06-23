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
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThanOrEqual(0.25);
    bolt.dispose();
  });

  it('update(dt, charge=1) hits peak opacity', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 1, { x: 0, y: 0 }, 1.0, 42);
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(1.0, 1);
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