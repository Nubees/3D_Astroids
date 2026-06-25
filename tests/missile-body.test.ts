import { describe, it, expect } from 'vitest';
import { AdditiveBlending, BackSide, MeshBasicMaterial, Group } from 'three';
import { PICKUP_COLOR, PickupKind } from '../src/pickups';
import { createMissileAssembly } from '../src/missile-vfx';

describe('createMissileAssembly — Phase 7c missile body visibility', () => {
  it('returns a Group with exactly 2 children (core + halo)', () => {
    const { assembly } = createMissileAssembly();
    expect(assembly).toBeInstanceOf(Group);
    expect(assembly.children.length).toBe(2);
  });

  it('core mesh is opaque (transparent: false) with magenta HOMING_MISSILES color', () => {
    const { core } = createMissileAssembly();
    const mat = core.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(false);
    expect(mat.color.getHex()).toBe(PICKUP_COLOR[PickupKind.HOMING_MISSILES]);
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
});