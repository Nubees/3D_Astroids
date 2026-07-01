import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
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
  AURA_RING_INNER,
  AURA_RING_OUTER,
  DRONE_MESH_RADIUS,
  createAuraRing,
  createChargeUpRing,
  createDeployShockwave,
  createDroneBeam,
  createDroneMesh,
  createLockOnSprite,
  createMuzzleFlash,
  createPlasmaDroneBeam,
  createPlasmaDroneBeamGlow,
  createTetherLine,
  disposePlasmaDroneBeam,
  getUseShaderBeam,
  setUseShaderBeam,
  updateAuraPulse,
  updateBeam,
  updateChargeUpRing,
  updateDeployShockwave,
  updateDroneVisuals,
  updateLockOnSprite,
  updateMuzzleFlash,
  updatePlasmaDroneBeam,
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
  it('returns a Mesh with IcosahedronGeometry radius 0.24 (Phase 7i-2)', () => {
    const mesh = createDroneMesh(1);
    expect(mesh).toBeInstanceOf(Mesh);
    const geom = mesh.geometry as IcosahedronGeometry;
    expect(geom.parameters.radius).toBeCloseTo(0.24, 5);
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
  it('returns Mesh with RingGeometry inner=1.0 outer=2.2 48-segments (Phase 7i-2)', () => {
    const ring = createAuraRing(1);
    const geom = ring.geometry as RingGeometry;
    expect(geom.parameters.innerRadius).toBeCloseTo(1.0, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(2.2, 5);
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

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7i-2 Task 3 (drone beam + muzzle flash + charge-up ring)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: TDD tests for the new VFX factories + per-frame updaters added
//          in Phase 7i-2. The drone now fires a bright-red beam from its
//          barrel to the locked-on target, spawns an additive muzzle flash
//          sprite at the muzzle, and renders a tier-colored charge-up ring
//          under the ship during the Digit2 hold window.
// Setup:   Vitest node environment. The shared lock-on CanvasTexture is
//          guarded by `typeof document === 'undefined'` so the muzzle
//          flash's `map` is null in tests but every other property is
//          still asserted. Additive opacity caps come from
//          feedback_additive_blending_whiteout.md (beam 0.8, flash 0.6,
//          ring 0.5).
// Issues:  Pre-Phase 7i-2 the drone had no visible fire event — the
//          projectile was teleported away with no muzzle punch, no
//          tracing beam, and no charge-up telegraph before activation.
// Fix:     Three new factories (createDroneBeam, createMuzzleFlash,
//          createChargeUpRing) and three per-frame updaters (updateBeam,
//          updateMuzzleFlash, updateChargeUpRing) plus the three sizing
//          constants (DRONE_MESH_RADIUS, AURA_RING_INNER, AURA_RING_OUTER)
//          that the existing createDroneMesh / createAuraRing now read
//          from. Beam is bright red (0xff2233), ring is tier-colored.
// Gotchas: updateChargeUpRing test uses MAX_RADIUS=3.0 (from
//          ORBIT_DRONES_CHARGE_UP_RING_MAX_RADIUS in src/pickups.ts) so
//          the close-to check is 1 decimal. updateMuzzleFlash uses a
//          half-sine curve: 0 → PEAK → 0 across the 80ms lifetime — the
//          test for age=0.04 (mid-life) is where peak-opacity (0.6) hits.
//          updateBeam receives plain {x,y,z} objects (not Vector3) and
//          reads them with .x/.y/.z in the implementation.
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 7i-2 — drone mesh + aura sizing', () => {
  it('DRONE_MESH_RADIUS === 0.24 (2x v7)', () => {
    expect(DRONE_MESH_RADIUS).toBe(0.24);
  });

  it('AURA_RING_INNER === 1.0', () => {
    expect(AURA_RING_INNER).toBe(1.0);
  });

  it('AURA_RING_OUTER === 2.2', () => {
    expect(AURA_RING_OUTER).toBe(2.2);
  });
});

describe('Phase 7i-2 — createDroneBeam', () => {
  it('returns a Mesh with AdditiveBlending material (dispatcher contract)', () => {
    // Phase 7i-2 hotfix #8 — createDroneBeam is now a thin dispatcher
    // that branches on ORBIT_DRONES_USE_SHADER_BEAM at create time.
    // The material can be EITHER MeshBasicMaterial (legacy solid
    // cylinder) OR ShaderMaterial (plasma path) depending on the
    // runtime constant. Material-specific assertions live in the
    // dedicated describe blocks below. This test only pins the
    // public contract: it returns a Mesh, the material is
    // AdditiveBlending + transparent, and opacity never exceeds the
    // 0.8 white-out cap.
    const beam = createDroneBeam(2);
    expect(beam).toBeInstanceOf(THREE.Mesh);
    // Three.js exposes blending on every Material base class, so the
    // contract holds for both material branches.
    const mat = beam.material as THREE.MeshBasicMaterial | THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    // For MeshBasicMaterial the opacity is on the material directly;
    // for ShaderMaterial the opacity is computed per-fragment in
    // the fragment shader (clamped to 0.8 by min() in the GLSL).
    // The GLSL clamp is asserted in the plasma-specific tests below.
    if (mat instanceof THREE.MeshBasicMaterial) {
      expect(mat.opacity).toBeLessThanOrEqual(0.8);
    }
  });

  it('starts hidden (visible=false) so spawnDroneDeployment shows nothing on frame 0', () => {
    const beam = createDroneBeam(1);
    expect(beam.visible).toBe(false);
  });

  it('uses a CylinderGeometry with r=0.24 + h=1 (unit height for per-frame Y-scale)', () => {
    const beam = createDroneBeam(1);
    const geom = beam.geometry as THREE.CylinderGeometry;
    expect(geom).toBeInstanceOf(THREE.CylinderGeometry);
    // radiusTop === radiusBottom === 0.24 (Phase 7i-2 hotfix #7 — was 0.08
    // after hotfix #6 (0.04→0.08), now 0.24 per user feedback "make the
    // lasers 2 pixels thicker" interpreted as "make the laser actually
    // read as thick". Bloom is DISABLED in this project (see
    // src/post-processing.ts:23-36) so the wider cylinder is the only
    // lever for visual area; 0.24u radius = 0.48u diameter, ~25px on a
    // 1280px viewport at camera z=20, FOV=60°. Unit h is set via scale.y
    // in updateBeam, not baked into the geometry.
    expect(geom.parameters.radiusTop).toBeCloseTo(0.24, 6);
    expect(geom.parameters.radiusBottom).toBeCloseTo(0.24, 6);
    expect(geom.parameters.height).toBe(1);
  });
});

describe('Phase 7i-2 — createMuzzleFlash', () => {
  it('returns a Sprite with AdditiveBlending and red color', () => {
    const flash = createMuzzleFlash(1);
    const mat = flash.material as THREE.SpriteMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.color.getHex()).toBe(0xff0033);
  });
});

describe('Phase 7i-2 — createChargeUpRing', () => {
  it('returns a Mesh with additive tier-color material', () => {
    const ring = createChargeUpRing(3);
    const mat = ring.material as THREE.MeshBasicMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.opacity).toBeLessThanOrEqual(0.5);
    expect(mat.color.getHex()).toBe(0xffcc44); // gold for tier 3
  });
});

describe('Phase 7i-2 — updateBeam', () => {
  it('positions the cylinder at the drone→target midpoint', () => {
    const beam = createDroneBeam(1);
    updateBeam(beam, { x: 0, y: 0, z: 0 }, { x: 4, y: 6, z: 0 });
    expect(beam.position.x).toBeCloseTo(2, 6);
    expect(beam.position.y).toBeCloseTo(3, 6);
    expect(beam.position.z).toBeCloseTo(0, 6);
  });

  it('scales the cylinder Y to the segment length', () => {
    const beam = createDroneBeam(1);
    updateBeam(beam, { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
    // 3-4-5 triangle, length = 5.
    expect(beam.scale.y).toBeCloseTo(5, 6);
    // X/Z stay 1 so the cylinder thickness isn't squashed.
    expect(beam.scale.x).toBe(1);
    expect(beam.scale.z).toBe(1);
  });

  it('rotates the cylinder so its +Y axis points from drone to target', () => {
    const beam = createDroneBeam(1);
    // Origin → +X direction. Cylinder default axis is +Y, so after
    // updateBeam the quaternion should map +Y → +X. We test the
    // rotated-up vector to assert this without re-deriving the quat
    // math.
    updateBeam(beam, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(beam.quaternion);
    expect(up.x).toBeCloseTo(1, 6);
    expect(up.y).toBeCloseTo(0, 6);
    expect(up.z).toBeCloseTo(0, 6);
  });

  it('handles a coincident drone/target without producing NaN (length clamped to 0.001)', () => {
    const beam = createDroneBeam(1);
    updateBeam(beam, { x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 0 });
    expect(Number.isFinite(beam.position.x)).toBe(true);
    expect(Number.isFinite(beam.position.y)).toBe(true);
    expect(Number.isFinite(beam.position.z)).toBe(true);
    expect(Number.isFinite(beam.scale.y)).toBe(true);
    expect(Number.isFinite(beam.quaternion.x)).toBe(true);
  });
});

describe('Phase 7i-2 — updateMuzzleFlash', () => {
  it('opacity = 0 at age=0', () => {
    const flash = createMuzzleFlash(1);
    updateMuzzleFlash(flash, 0);
    const mat = flash.material as THREE.SpriteMaterial;
    expect(mat.opacity).toBe(0);
  });

  it('opacity > 0 at age=0.04 (mid 80ms lifetime)', () => {
    const flash = createMuzzleFlash(1);
    updateMuzzleFlash(flash, 0.04);
    const mat = flash.material as THREE.SpriteMaterial;
    expect(mat.opacity).toBeGreaterThan(0);
    expect(mat.opacity).toBeLessThanOrEqual(0.6);
  });

  it('opacity = 0 at age=0.08 (end of lifetime)', () => {
    const flash = createMuzzleFlash(1);
    updateMuzzleFlash(flash, 0.08);
    const mat = flash.material as THREE.SpriteMaterial;
    expect(mat.opacity).toBe(0);
  });
});

describe('Phase 7i-2 — updateChargeUpRing', () => {
  it('scales ring from 0 to MAX_RADIUS as fraction goes 0 → 1', () => {
    const ring = createChargeUpRing(1);
    updateChargeUpRing(ring, 0);
    expect(ring.scale.x).toBeCloseTo(0, 6);
    updateChargeUpRing(ring, 1);
    expect(ring.scale.x).toBeCloseTo(3.0, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7i-2 hotfix #8 (plasma beam shader)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: TDD tests for the shader-driven plasma beam (user picked
//          "Shader-driven plasma beam" from the 4-way architecture question
//          after the 3rd failed beam-width iteration). The plasma beam
//          replaces the solid-color MeshBasicMaterial cylinder with a
//          custom ShaderMaterial that adds radial falloff + axial FBM
//          noise — the in-shader substitute for the disabled bloom pass.
// Setup:   Vitest node environment. ShaderMaterial is created without
//          a real GL context, so we can only assert on the JS-level
//          properties (uniforms, blending flags, material type). The
//          actual GLSL rendering is verified by the in-game Playwright
//          screenshot — see tests/phase-7i-2-hotfix-8-screenshot.spec.ts.
// Issues:  3 prior beam-width iterations (0.04 → 0.08 → 0.24) failed to
//          deliver a "power laser" feel because bloom is DISABLED in
//          this project. A wider cylinder alone reads as "fat red bar",
//          not "energy beam". Only an animated, gradient, glowing
//          surface can fake bloom in a no-bloom pipeline.
// Fix:     createPlasmaDroneBeam (ShaderMaterial) + updatePlasmaDroneBeam
//          (writes uTime per frame) + disposePlasmaDroneBeam (explicit
//          material dispose). The 3 factory exports keep their public
//          signatures; createDroneBeam is now a thin dispatcher that
//          branches on ORBIT_DRONES_USE_SHADER_BEAM at create time.
// Gotchas: ORBIT_DRONES_USE_SHADER_BEAM is `true` by default — so the
//          existing createDroneBeam test that asserts MeshBasicMaterial
//          will need a follow-up that flips the constant OR tests
//          createPlasmaDroneBeam directly. The test below opts for the
//          direct-call approach so it stays robust against future
//          constant flips.
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 7i-2 hotfix #8 — createPlasmaDroneBeam', () => {
  it('returns a Mesh with ShaderMaterial (not MeshBasicMaterial)', () => {
    // Import lazily so the test file reads top-to-bottom; plasma path
    // is only exercised by this describe block.
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      expect(beam).toBeInstanceOf(Mesh);
      expect(beam.material).toBeInstanceOf(THREE.ShaderMaterial);
    });
  });

  it('plasma material is transparent + AdditiveBlending + DoubleSide + depthWrite false', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(2);
      const mat = beam.material as THREE.ShaderMaterial;
      expect(mat.transparent).toBe(true);
      expect(mat.blending).toBe(AdditiveBlending);
      expect(mat.side).toBe(DoubleSide);
      expect(mat.depthWrite).toBe(false);
    });
  });

  it('plasma material exposes uTime / uCoreColor / uOuterColor / uBeamRadius / uPlasmaSpeed / uFalloffPower uniforms', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      const mat = beam.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uTime).toBeDefined();
      expect(mat.uniforms.uCoreColor).toBeDefined();
      expect(mat.uniforms.uOuterColor).toBeDefined();
      expect(mat.uniforms.uBeamRadius).toBeDefined();
      expect(mat.uniforms.uPlasmaSpeed).toBeDefined();
      expect(mat.uniforms.uFalloffPower).toBeDefined();
      // uTime starts at 0 so the first frame's axial noise is at t=0.
      expect(mat.uniforms.uTime.value).toBe(0);
    });
  });

  it('plasma geometry is CylinderGeometry r=0.24 (same as solid beam — only material differs)', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      const geom = beam.geometry as THREE.CylinderGeometry;
      expect(geom).toBeInstanceOf(THREE.CylinderGeometry);
      expect(geom.parameters.radiusTop).toBeCloseTo(0.24, 6);
      expect(geom.parameters.radiusBottom).toBeCloseTo(0.24, 6);
      expect(geom.parameters.height).toBe(1);
    });
  });

  it('plasma beam starts hidden (visible=false) so spawnDroneDeployment shows nothing on frame 0', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      expect(beam.visible).toBe(false);
    });
  });

  it('plasma fragment shader contains the FBM hash + noise functions', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      const mat = beam.material as THREE.ShaderMaterial;
      // hash11 is the entry point; fbm is the call we use; noise1d
      // is the smooth-step interpolator. All three must be present so
      // the shader compiles + the noise animation renders.
      expect(mat.fragmentShader).toContain('float hash11');
      expect(mat.fragmentShader).toContain('float noise1d');
      expect(mat.fragmentShader).toContain('float fbm');
    });
  });

  it('plasma fragment shader caps final alpha at 0.8 (additive white-out discipline)', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      const mat = beam.material as THREE.ShaderMaterial;
      // The min() call against 0.8 is the additive white-out guard.
      // It is REQUIRED so 2 stacked beams cannot saturate a pixel to
      // pure white.
      expect(mat.fragmentShader).toContain('min(');
      expect(mat.fragmentShader).toContain('0.8');
    });
  });
});

describe('Phase 7i-2 hotfix #8 — updatePlasmaDroneBeam', () => {
  it('writes uTime uniform each call so the axial noise animation advances', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      mod.updatePlasmaDroneBeam(
        beam,
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        1.234,
      );
      const mat = beam.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uTime.value).toBeCloseTo(1.234, 6);
    });
  });

  it('positions the cylinder at the drone→target midpoint (same as updateBeam)', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      mod.updatePlasmaDroneBeam(
        beam,
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 6, z: 0 },
        0,
      );
      expect(beam.position.x).toBeCloseTo(2, 6);
      expect(beam.position.y).toBeCloseTo(3, 6);
      expect(beam.position.z).toBeCloseTo(0, 6);
    });
  });

  it('scales the cylinder Y to the segment length (same as updateBeam)', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      mod.updatePlasmaDroneBeam(
        beam,
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 4, z: 0 },
        0,
      );
      // 3-4-5 triangle.
      expect(beam.scale.y).toBeCloseTo(5, 6);
    });
  });

  it('handles coincident drone/target without producing NaN (length clamp)', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      mod.updatePlasmaDroneBeam(
        beam,
        { x: 1, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        0,
      );
      expect(Number.isFinite(beam.position.x)).toBe(true);
      expect(Number.isFinite(beam.scale.y)).toBe(true);
      expect(Number.isFinite(beam.quaternion.x)).toBe(true);
    });
  });
});

describe('Phase 7i-2 hotfix #8 — disposePlasmaDroneBeam', () => {
  it('does not throw when called once on a fresh beam', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      expect(() => mod.disposePlasmaDroneBeam(beam)).not.toThrow();
    });
  });

  it('disposes both geometry and material (custom ShaderMaterial needs explicit dispose)', () => {
    return import('../src/orbit-drone-vfx').then(mod => {
      const beam = mod.createPlasmaDroneBeam(1);
      // Spy on dispose; vitest's vi.fn() lets us assert without
      // needing a real GL context to confirm the resource was freed.
      const geomDispose = vi.spyOn(beam.geometry, 'dispose');
      const matDispose = vi.spyOn(beam.material as THREE.ShaderMaterial, 'dispose');
      mod.disposePlasmaDroneBeam(beam);
      expect(geomDispose).toHaveBeenCalledTimes(1);
      expect(matDispose).toHaveBeenCalledTimes(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7i-2 hotfix #9 — runtime-toggled shader beam selector
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: The B-key handler in main.ts and the __hooks.setPlasmaBeam hook
//          both call setUseShaderBeam to flip the module-level
//          _useShaderBeam. createDroneBeam reads this value (not the
//          ORBIT_DRONES_USE_SHADER_BEAM const from pickups.ts) so the
//          toggle actually changes the next-spawned beam's material.
//          In hotfix #8 the toggle was a local `let` in main.ts that
//          only fed console.log, so pressing B did nothing visually.
//          These tests pin the live-read behavior so a future refactor
//          can't regress back to a dead toggle.
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 7i-2 hotfix #9 — runtime shader beam toggle', () => {
  // Save/restore the toggle around the test so other tests' behavior
  // (which may depend on the default `true`) isn't affected. Default
  // is true (see ORBIT_DRONES_USE_SHADER_BEAM in src/pickups.ts).
  const original = getUseShaderBeam();
  afterEach(() => {
    setUseShaderBeam(original);
  });
  it('starts true by default and getUseShaderBeam reads it', () => {
    setUseShaderBeam(true);
    expect(getUseShaderBeam()).toBe(true);
    setUseShaderBeam(false);
    expect(getUseShaderBeam()).toBe(false);
  });
  it('createDroneBeam reflects the current toggle value (not the const)', () => {
    setUseShaderBeam(true);
    const shader = createDroneBeam(1);
    expect(shader.material).toBeInstanceOf(THREE.ShaderMaterial);
    setUseShaderBeam(false);
    const solid = createDroneBeam(1);
    // When the toggle is false, createDroneBeam returns the hotfix #7
    // MeshBasicMaterial path (the fall-back preserved verbatim from
    // commit 67812bf for the A/B comparison).
    expect(solid.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7i-2 hotfix #9 — outer glow cylinder for the two-layer beam
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: createPlasmaDroneBeamGlow returns a larger desaturated-red
//          cylinder that pairs with the bright core from
//          createPlasmaDroneBeam. The two-layer approach approximates
//          the bloom dilation this project can't provide
//          (src/post-processing.ts:23-36 returns a no-op composer
//          stub). These tests pin the contract that active-deployments
//          depends on: ShaderMaterial with all 6 uniforms initialized,
//          geometry is a CylinderGeometry with the GLOW radius, default
//          visible=false, dispose works through the same Material cast
//          that the core uses.
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 7i-2 hotfix #9 — createPlasmaDroneBeamGlow', () => {
  it('returns a Mesh with a ShaderMaterial', () => {
    const glow = createPlasmaDroneBeamGlow(2);
    expect(glow).toBeInstanceOf(THREE.Mesh);
    expect(glow.material).toBeInstanceOf(THREE.ShaderMaterial);
  });
  it('initializes all six shader uniforms (uTime, uPlasmaSpeed, uFalloffPower, uCoreColor, uOuterColor, uBeamRadius, uOpacityCap)', () => {
    const glow = createPlasmaDroneBeamGlow(2);
    const u = (glow.material as THREE.ShaderMaterial).uniforms;
    expect(u.uTime).toBeDefined();
    expect(u.uPlasmaSpeed).toBeDefined();
    expect(u.uFalloffPower).toBeDefined();
    expect(u.uCoreColor).toBeDefined();
    expect(u.uOuterColor).toBeDefined();
    expect(u.uBeamRadius).toBeDefined();
    expect(u.uOpacityCap).toBeDefined();
  });
  it('uses the GLOW radius for the cylinder geometry (larger than the core)', () => {
    const glow = createPlasmaDroneBeamGlow(2);
    const core = createPlasmaDroneBeam(2);
    // CylinderGeometry's `parameters` object exposes the constructor
    // args. Both top and bottom are the same for our beams (uniform
    // cylinder) so reading either is fine. Comparing radiusTop is the
    // cheapest check without instantiating a real GPU buffer.
    const glowR = (glow.geometry as THREE.CylinderGeometry).parameters.radiusTop;
    const coreR = (core.geometry as THREE.CylinderGeometry).parameters.radiusTop;
    expect(glowR).toBeGreaterThan(coreR);
    expect(glowR).toBe(0.6); // ORBIT_DRONES_BEAM_GLOW_RADIUS
  });
  it('defaults to visible=false (matches core beam contract — beam is shown on fire, hidden otherwise)', () => {
    const glow = createPlasmaDroneBeamGlow(1);
    expect(glow.visible).toBe(false);
  });
  it('uOpacityCap is 0.4 (lower than core 0.8 — white-out discipline)', () => {
    const glow = createPlasmaDroneBeamGlow(1);
    const u = (glow.material as THREE.ShaderMaterial).uniforms;
    expect(u.uOpacityCap.value).toBeCloseTo(0.4, 5);
  });
  it('disposePlasmaDroneBeam cleans up both geometry and material', () => {
    const glow = createPlasmaDroneBeamGlow(1);
    const geomDispose = vi.spyOn(glow.geometry, 'dispose');
    const matDispose = vi.spyOn(glow.material as THREE.ShaderMaterial, 'dispose');
    disposePlasmaDroneBeam(glow);
    expect(geomDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);
  });
  it('updatePlasmaDroneBeam writes uTime to the glow uniform (lockstep with core)', () => {
    const glow = createPlasmaDroneBeamGlow(1);
    updatePlasmaDroneBeam(
      glow,
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      1.23,
    );
    expect((glow.material as THREE.ShaderMaterial).uniforms.uTime.value).toBe(1.23);
  });
});
