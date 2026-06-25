import { describe, it, expect } from 'vitest';
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import { PICKUP_COLOR, PickupKind } from '../src/pickups';
import { createMissileAssembly } from '../src/missile-vfx';

const MISSILE_MAGENTA = PICKUP_COLOR[PickupKind.HOMING_MISSILES];

describe('createMissileAssembly — Phase 7c-2 7-mesh body', () => {
  it('returns a Group with exactly 7 children (core + halo + noseTip + 4 fins)', () => {
    const { assembly } = createMissileAssembly();
    expect(assembly).toBeInstanceOf(Group);
    expect(assembly.children.length).toBe(7);
  });

  it('core mesh is opaque (transparent: false) with magenta HOMING_MISSILES color', () => {
    const { core } = createMissileAssembly();
    const mat = core.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(false);
    expect(mat.color.getHex()).toBe(MISSILE_MAGENTA);
  });

  it('core geometry is a SphereGeometry (visual sanity)', () => {
    const { core } = createMissileAssembly();
    expect(core.geometry).toBeInstanceOf(SphereGeometry);
  });

  it('halo mesh uses AdditiveBlending + BackSide with opacity 0.5', () => {
    const { halo } = createMissileAssembly();
    const mat = halo.material as MeshBasicMaterial;
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.side).toBe(BackSide);
    expect(mat.opacity).toBe(0.5);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('noseTip is a ConeGeometry with the missile color and is opaque', () => {
    const { noseTip } = createMissileAssembly();
    expect(noseTip.geometry).toBeInstanceOf(ConeGeometry);
    const mat = noseTip.material as MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(MISSILE_MAGENTA);
    expect(mat.transparent).toBe(false);
  });

  it('fins array contains exactly 4 Mesh entries (rear X-pattern)', () => {
    const { fins } = createMissileAssembly();
    expect(fins.length).toBe(4);
    for (const fin of fins) {
      // Each fin is a 3-vertex triangle BufferGeometry (not a stock primitive).
      expect(fin.geometry).toBeInstanceOf(BufferGeometry);
      const posAttr = fin.geometry.getAttribute('position');
      expect(posAttr.count).toBe(3);
    }
  });

  it('fins share ONE material instance with DoubleSide + magenta color (sanity)', () => {
    const { fins } = createMissileAssembly();
    const firstMat = fins[0].material as MeshBasicMaterial;
    expect(firstMat.side).toBe(DoubleSide);
    expect(firstMat.color.getHex()).toBe(MISSILE_MAGENTA);
    // All 4 fins reference the same material (no per-fin allocation).
    for (let i = 1; i < fins.length; i++) {
      expect(fins[i].material).toBe(firstMat);
    }
  });
});
