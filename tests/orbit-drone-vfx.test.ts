import { describe, expect, it } from 'vitest';
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { ORBIT_DRONES_TIER_COLOR } from '../src/orbit-drone';
import {
  createAuraRing,
  createDeployShockwave,
  createDroneMesh,
  createLockOnSprite,
  createTetherLine,
  updateAuraPulse,
  updateDeployShockwave,
  updateDroneVisuals,
  updateLockOnSprite,
  updateTetherLine,
} from '../src/orbit-drone-vfx';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Orbit Drone VFX Tests (Phase 7i Sprint 1 Task 2)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: TDD tests for the visual factories and per-frame updaters in
//          src/orbit-drone-vfx.ts. Pins the public contract that Task 3
//          wires into src/active-deployments.ts: tier-color routing, additive
//          blending + DoubleSide + depthWrite=false on every overlay,
//          visibility defaulting to false, and the per-frame math (spin,
//          bob, fire-flash, aura pulse, deploy shockwave).
// Setup:   Vitest node environment. The shared lock-on CanvasTexture is
//          guarded by `typeof document === 'undefined'` so the node test
//          runner doesn't try to create a canvas — the Sprite's `map` ends
//          up null but every other property is still asserted. JSDOM is
//          only needed for the video-asteroid test (separate file).
// Issues:  Pre-Phase 7i the drones had no per-frame animation. These tests
//          lock in the geometry (drone 0.12u Icosahedron, aura 0.6→1.4
//          ring, deploy shockwave 0.5→0.7 ring, lock-on 0.15u sprite,
//          tether two-vertex Line) and the per-frame curves (spin 90°/s Y
//          + 60°/s X, bob 0.08u @ 1.2 Hz, fire-flash 0.08s linear, aura
//          0.35 + 0.25 * sin(t * 4π), deploy 0.5→2.0 + opacity 1→0 in 250ms).
// Gotchas: fireFlashCurve returns 1.0 at age=0 and 0.0 at age>=0.08s, so
//          the "age=0" update tests see the PEAK state (scale 1.15,
//          emissive 2.5, aura opacity 0.6) and the "age>=0.08s" tests see
//          the REST state (scale 1.0, emissive 0.8, aura opacity 0.35).
//          The aura ring lays flat (rotation.x = -π/2) so it parallels
//          the XZ plane under the ship.
//          The pure-pulse baseline test (expecting 0.35 at t=0) passes
//          fireFlashAge=0.5s so the flash contribution is zero — the
//          otherwise-identical "peak" test passes age=0 (flash=1, opacity
//          0.6). The two tests together prove both code paths.
// ═══════════════════════════════════════════════════════════════════════════

describe('createDroneMesh', () => {
  it('returns a Mesh with IcosahedronGeometry radius 0.12', () => {
    const mesh = createDroneMesh(1);
    expect(mesh).toBeInstanceOf(Mesh);
    const geom = mesh.geometry as IcosahedronGeometry;
    expect(geom.parameters.radius).toBeCloseTo(0.12, 5);
    expect(geom.parameters.detail).toBe(0);
  });

  it('uses MeshStandardMaterial with tier color emissive at intensity 0.8', () => {
    const mesh = createDroneMesh(2);
    const mat = mesh.material as MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xff66dd);
    expect(mat.emissive.getHex()).toBe(0xff66dd);
    expect(mat.emissiveIntensity).toBeCloseTo(0.8, 5);
    expect(mat.flatShading).toBe(true);
  });
});

describe('createAuraRing', () => {
  it('returns Mesh with RingGeometry inner=0.6 outer=1.4 48-segments', () => {
    const ring = createAuraRing(1);
    const geom = ring.geometry as RingGeometry;
    expect(geom.parameters.innerRadius).toBeCloseTo(0.6, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(1.4, 5);
    expect(geom.parameters.thetaSegments).toBe(48);
  });

  it('uses AdditiveBlending, DoubleSide, depthWrite false, opacity 0.35', () => {
    const ring = createAuraRing(3);
    const mat = ring.material as MeshBasicMaterial;
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.side).toBe(DoubleSide);
    expect(mat.depthWrite).toBe(false);
    expect(mat.opacity).toBeCloseTo(0.35, 5);
  });

  it('tier 3 ring uses gold color', () => {
    const ring = createAuraRing(3);
    expect((ring.material as MeshBasicMaterial).color.getHex()).toBe(0xffcc44);
  });

  it('starts hidden (visible=false)', () => {
    const ring = createAuraRing(1);
    expect(ring.visible).toBe(false);
  });

  it('rotation.x is -PI/2 (lays flat on XZ plane)', () => {
    const ring = createAuraRing(1);
    expect(ring.rotation.x).toBeCloseTo(-Math.PI / 2, 5);
  });
});

describe('createTetherLine', () => {
  it('returns a Line with two vertex positions, opacity 0.25', () => {
    const line = createTetherLine(2);
    expect(line).toBeInstanceOf(Line);
    const mat = line.material as LineBasicMaterial;
    expect(mat.opacity).toBeCloseTo(0.25, 5);
    expect(mat.blending).toBe(AdditiveBlending);
    const positions = (line.geometry as BufferGeometry).attributes.position;
    expect(positions.count).toBe(2);
  });

  it('tier color matches', () => {
    const line = createTetherLine(3);
    expect((line.material as LineBasicMaterial).color.getHex()).toBe(0xffcc44);
  });

  it('starts hidden', () => {
    const line = createTetherLine(1);
    expect(line.visible).toBe(false);
  });
});

describe('createLockOnSprite', () => {
  it('returns a Sprite with tier color, additive blending', () => {
    const sprite = createLockOnSprite(2);
    expect(sprite).toBeInstanceOf(Sprite);
    const mat = sprite.material as SpriteMaterial;
    expect(mat.color.getHex()).toBe(0xff66dd);
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
  });

  it('scale 0.15', () => {
    const sprite = createLockOnSprite(1);
    expect(sprite.scale.x).toBeCloseTo(0.15, 5);
    expect(sprite.scale.y).toBeCloseTo(0.15, 5);
  });

  it('starts hidden', () => {
    const sprite = createLockOnSprite(1);
    expect(sprite.visible).toBe(false);
  });
});

describe('createDeployShockwave', () => {
  it('returns Mesh with RingGeometry inner=0.5 outer=0.7 starting hidden', () => {
    const ring = createDeployShockwave(2);
    const geom = ring.geometry as RingGeometry;
    expect(geom.parameters.innerRadius).toBeCloseTo(0.5, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(0.7, 5);
    expect(ring.visible).toBe(false);
  });

  it('tier color matches', () => {
    const ring = createDeployShockwave(3);
    expect((ring.material as MeshBasicMaterial).color.getHex()).toBe(0xffcc44);
  });
});

describe('updateDroneVisuals', () => {
  it('applies spinAngles to mesh.rotation at t=1s', () => {
    const mesh = createDroneMesh(1);
    updateDroneVisuals(mesh, 1.0, 0, 0);
    // X = 60°/s × 1s = π/3; Y = 90°/s × 1s = π/2
    expect(mesh.rotation.x).toBeCloseTo(Math.PI / 3, 5);
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });

  it('fireFlashCurve at age=0 multiplies scale to 1.15', () => {
    const mesh = createDroneMesh(1);
    updateDroneVisuals(mesh, 0, 0, 0); // age=0, fire flash just fired
    expect(mesh.scale.x).toBeCloseTo(1.15, 5);
    expect(mesh.scale.y).toBeCloseTo(1.15, 5);
  });

  it('fireFlashCurve at age=200ms (past end) resets scale to 1.0', () => {
    const mesh = createDroneMesh(1);
    updateDroneVisuals(mesh, 0, 0.2, 0);
    expect(mesh.scale.x).toBeCloseTo(1.0, 5);
  });

  it('emissiveIntensity flashes to 2.5 at fire moment', () => {
    const mesh = createDroneMesh(1);
    updateDroneVisuals(mesh, 0, 0, 0);
    expect((mesh.material as MeshStandardMaterial).emissiveIntensity).toBeCloseTo(2.5, 5);
  });

  it('emissiveIntensity decays to 0.8 after flash window', () => {
    const mesh = createDroneMesh(1);
    updateDroneVisuals(mesh, 0, 0.2, 0);
    expect((mesh.material as MeshStandardMaterial).emissiveIntensity).toBeCloseTo(0.8, 5);
  });

  it('bobOffset adds to mesh.position.y (orbital base + bob)', () => {
    const mesh = createDroneMesh(1);
    mesh.position.set(0, 0, 0);
    updateDroneVisuals(mesh, 0, 0.5, Math.PI / 2); // t=0, fireFlashAge=0.5 (past), bobPhase=π/2
    // bobOffset(0, π/2) = 0.08 * sin(0 + π/2) = 0.08
    // Actually mesh.position.y is overwritten by orbital update (Task 3). The
    // bob only fires via setY when caller passes orbitalY as the 4th arg.
    // For this test, we verify the additive call directly:
    updateDroneVisuals(mesh, 0, 0.5, Math.PI / 2, 1.0); // orbitalY=1.0
    expect(mesh.position.y).toBeCloseTo(1.0 + 0.08, 5);
  });
});

describe('updateAuraPulse', () => {
  it('sets ring.visible=true when tier>0', () => {
    const ring = createAuraRing(1);
    updateAuraPulse(ring, 1, 0, 0);
    expect(ring.visible).toBe(true);
  });

  it('sets ring.visible=false when tier=0', () => {
    const ring = createAuraRing(1);
    ring.visible = true;
    updateAuraPulse(ring, 0, 0, 0);
    expect(ring.visible).toBe(false);
  });

  it('opacity pulse baseline (no fire flash): 0.35 + 0.25 * sin(t * 4) at t=0 → 0.35', () => {
    // fireFlashAge=0.5s is past the 80ms flash window, so flash=0 and only
    // the pure pulse contributes: 0.35 + 0.25 * sin(0) = 0.35.
    const ring = createAuraRing(1);
    updateAuraPulse(ring, 1, 0, 0.5);
    expect((ring.material as MeshBasicMaterial).opacity).toBeCloseTo(0.35, 5);
  });

  it('opacity peak (fire flash) ramps to 0.6 then decays', () => {
    const ring = createAuraRing(1);
    updateAuraPulse(ring, 1, 0, 0); // fire flash just fired (age=0, flash=1)
    expect((ring.material as MeshBasicMaterial).opacity).toBeCloseTo(0.6, 5);
  });
});

describe('updateTetherLine', () => {
  it('sets visible=true and updates positions when target is non-null', () => {
    const line = createTetherLine(1);
    updateTetherLine(line, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(line.visible).toBe(true);
    const positions = (line.geometry as BufferGeometry).attributes.position;
    expect(positions.getX(0)).toBeCloseTo(0, 5);
    expect(positions.getY(0)).toBeCloseTo(0, 5);
    expect(positions.getX(1)).toBeCloseTo(1, 5);
    expect(positions.getY(1)).toBeCloseTo(1, 5);
  });

  it('sets visible=false when target is null', () => {
    const line = createTetherLine(1);
    line.visible = true;
    updateTetherLine(line, { x: 0, y: 0 }, null);
    expect(line.visible).toBe(false);
  });
});

describe('updateLockOnSprite', () => {
  it('positions sprite at target and shows it when target non-null', () => {
    const sprite = createLockOnSprite(1);
    updateLockOnSprite(sprite, { x: 2, y: 3 });
    expect(sprite.visible).toBe(true);
    expect(sprite.position.x).toBeCloseTo(2, 5);
    expect(sprite.position.y).toBeCloseTo(3, 5);
  });

  it('hides sprite when target is null', () => {
    const sprite = createLockOnSprite(1);
    sprite.visible = true;
    updateLockOnSprite(sprite, null);
    expect(sprite.visible).toBe(false);
  });
});

describe('updateDeployShockwave', () => {
  it('starts visible at scale 0.5 when age=0', () => {
    const ring = createDeployShockwave(1);
    updateDeployShockwave(ring, 0);
    expect(ring.visible).toBe(true);
    expect(ring.scale.x).toBeCloseTo(0.5, 5);
  });

  it('scales 0.5 → 2.0 over 250ms (linear)', () => {
    const ring = createDeployShockwave(1);
    updateDeployShockwave(ring, 0.125); // halfway
    expect(ring.scale.x).toBeCloseTo(1.25, 5);
  });

  it('opacity 1.0 → 0 over 250ms (linear)', () => {
    const ring = createDeployShockwave(1);
    updateDeployShockwave(ring, 0.125);
    expect((ring.material as MeshBasicMaterial).opacity).toBeCloseTo(0.5, 5);
  });

  it('hides ring after 250ms (age past duration)', () => {
    const ring = createDeployShockwave(1);
    updateDeployShockwave(ring, 0.3);
    expect(ring.visible).toBe(false);
  });
});
