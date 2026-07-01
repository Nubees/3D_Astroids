// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Orbit Drone VFX (Phase 7i Sprint 1 + Phase 7i-2 delta)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Single home for all Orbit Drone visual factories and per-frame
//          updaters. Pure visual layer — no state machine, no projectile
//          spawning, no targeting. State + per-frame tick live in
//          src/active-deployments.ts; the Game class wires spawn→tick→dispose.
// Setup:   Game imports createDroneMesh / createAuraRing / createTetherLine /
//          createLockOnSprite / createDeployShockwave once at deploy time and
//          calls the matching `update*` helper each frame. All factories
//          return Three.js objects; tier color is the only knob.
// Issues:  Pre-Phase 7i the drone was a bare static IcosahedronGeometry
//          with no animation, aura, or targeting visibility. It looked
//          "plain, simple, not very effective."
// Fix:     Phase 7i Sprint 1. Five new visual layers:
//          - Aura ring under the ship (AdditiveBlending, 2 Hz opacity pulse)
//          - Per-drone idle spin (Y 90°/s, X 60°/s) + Y-bob
//          - Per-fire scale pop + emissive flash (80ms ramp)
//          - Tether line from drone to current target (additive, 0.25 opacity)
//          - Lock-on Sprite at target position (additive, 0.15u scale)
//          - Deploy shockwave ring (250ms scale 0.5→2.0 + opacity 1→0)
//          Phase 7i-2 (Task 3) DELTA — three more visual layers + sizing
//          bump so the drone actually feels like it fires a weapon:
//          - DRONE_MESH_RADIUS 0.12 → 0.24 (2× — reads at glance distance)
//          - AURA_RING 0.6→1.4 → 1.0→2.2 (wider footprint, matches scale-up)
//          - createDroneBeam — bright red CYLINDER from muzzle to target
//            (additive, opacity 0.8 cap, color ORBIT_DRONES_BEAM_COLOR).
//            Originally a Line + LineBasicMaterial, but the WebGL spec
//            ignores `linewidth` so 1px additive red was invisible against
//            bloom + bright asteroid surfaces. Cylinder r=BEAM_RADIUS
//            (was 0.04, hotfix #6 doubled to 0.08 = 2× width per user
//            "make the laser 2x bigger in width", hotfix #7 tripled to
//            0.24 = 3× the original 0.04 per user "make the lasers 2
//            pixels thicker" — root cause was that bloom is DISABLED
//            in this project so the wider cylinder is the only lever
//            for visual area; at game camera z=20, FOV=60° the 0.16u
//            cylinder was still only ~7-8px on a 1280px viewport)
//            renders as a real triangle mesh and reads as a confident
//            bright-red laser at glance distance. Color is 0xff0033
//            after hotfix #7 (was 0xff2233 from v15.0→#6) — R=255,
//            G=0, B=51 zeroed green channel so additive blending
//            against warm surfaces (bright orange asteroids) doesn't
//            push the result toward yellow/orange. Same visual
//            contract otherwise.
//          - createMuzzleFlash — additive Sprite at muzzle using the
//            shared lock-on diamond texture, 80ms sin-curve opacity 0→0.6→0
//          - createChargeUpRing — tier-colored flat ring under ship
//            (RingGeometry 0.95→1.0, additive opacity 0.5, scale 0→3.0 over
//            the Digit2 hold window), color ORBIT_DRONES_TIER_COLOR(tier)
// Gotchas: All additive opacity caps per feedback_additive_blending_whiteout.md:
//          aura peak 0.6, sparks 0.4, tether 0.25, beam 0.8, muzzle 0.6,
//          charge-up 0.5. depthWrite=false on all additive layers so they
//          don't occlude scene geometry. The aura ring is parented to the
//          ship (added in src/game.ts), not the scene, so it inherits
//          ship position automatically.
//          Lock-on Sprite uses a CanvasTexture for the diamond shape —
//          created once at module load (shared across all sprites per tier).
//          getSharedLockOnTexture is exported so the muzzle-flash sprite
//          (this file, Phase 7i-2) and the drone-kill sparks
//          (src/drone-kill-sparks.ts) can re-use the same diamond bitmap
//          instead of allocating separate textures.
//          updateMuzzleFlash uses a half-sine: 0 → PEAK → 0 across the
//          80ms lifetime. updateChargeUpRing clamps fraction to [0,1]
//          so an out-of-range pulse from src/active-deployments.ts can't
//          blow the scale past 3.0.
// ═══════════════════════════════════════════════════════════════════════════

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { Vector2 } from './types';
import {
  ORBIT_DRONES_BEAM_COLOR,
  ORBIT_DRONES_BEAM_GLOW_COLOR,
  ORBIT_DRONES_BEAM_GLOW_OPACITY,
  ORBIT_DRONES_BEAM_GLOW_RADIUS,
  ORBIT_DRONES_BEAM_OUTER_COLOR,
  ORBIT_DRONES_BEAM_PLASMA_FALLOFF_POWER,
  ORBIT_DRONES_BEAM_PLASMA_SPEED,
  ORBIT_DRONES_CHARGE_UP_RING_MAX_RADIUS,
  ORBIT_DRONES_USE_SHADER_BEAM,
} from './pickups';
import { ORBIT_DRONES_TIER_COLOR, bobOffset, fireFlashCurve, spinAngles } from './orbit-drone';

const DEPLOY_SHOCKWAVE_DURATION_SECONDS = 0.25;
const FIRE_FLASH_PEAK_EMISSIVE = 2.5;
const FIRE_FLASH_REST_EMISSIVE = 0.8;
const AURA_PULSE_BASELINE = 0.35;
const AURA_PULSE_AMPLITUDE = 0.25;
// Spec: 2 Hz pulse. sin(t * 2π * 2) = sin(t * 4π) = sin(t * Math.PI * 4).
// Period = 2π / (4π) = 0.5s → 2 cycles/second.
const AURA_PULSE_FREQ = Math.PI * 4;
const AURA_PEAK_FLASH = 0.6;
const LOCK_ON_SCALE = 0.15;
// Phase 7i-2 — drone body + aura footprint grew so the drone reads at
// glance distance. 2× radius (0.12 → 0.24), aura band ~3.7× area
// (0.6→1.4 → 1.0→2.2).
export const DRONE_MESH_RADIUS = 0.24;
export const AURA_RING_INNER = 1.0;
export const AURA_RING_OUTER = 2.2;
// Phase 7i-2 — muzzle flash lifetime + peak opacity. Half-sine 0→PEAK→0.
const MUZZLE_FLASH_LIFETIME_SECONDS = 0.08;
const MUZZLE_FLASH_PEAK_OPACITY = 0.6;
const MUZZLE_FLASH_SCALE = 0.3;
// Phase 7i-2 (post-ship hotfix) — beam thickness. The original v15 spec
// used Three.js Line + LineBasicMaterial, but `linewidth` is a no-op in
// the WebGL spec (all lines render at 1px regardless of the property).
// A 1px additive-red line on top of bloom + bright asteroid surfaces is
// effectively invisible — that was the user-reported "weird beam"
// symptom after commit e9d0030. CylinderGeometry r=BEAM_RADIUS renders
// as a real triangle mesh, so the beam reads as a thick bright-red
// streak at glance distance. Same color (0xff2233), same additive
// opacity cap (0.8), same depthWrite=false.
//
// Phase 7i-2 hotfix #6 — user feedback: "make the laser 2x bigger in
// width and bright red in color". Doubled the radius (0.04 → 0.08) so
// the beam reads as a clearly visible "laser" rather than a thin
// streak. Additive overlap math is unchanged per-pixel (2 beams still
// meet at most), so the per-channel color saturation is identical —
// the beam now occupies a larger area of saturated red on screen
// instead of a thinner streak that was washing to orange against the
// existing bloom + dark asteroid backdrop. Color is unchanged
// (0xff2233 was already "bright red"); bumping the radius is what
// makes it LOOK brighter because more pixels hit the saturation cap.
//
// Phase 7i-2 hotfix #7 — user feedback after #6: "Note Sees to be no
// change, as THe Lasers are not thinker and Not in Bright RED" —
// root-cause analysis showed the prior premise was wrong:
//  • Bloom is DISABLED in this project (src/post-processing.ts:23-36
//    returns a no-op composer stub — UnrealBloomPass removed to fix
//    crystal white-out), so there is no bloom convolution dilating
//    the saturated pixels. The 0.04→0.08 change only doubled the
//    geometric area; at camera z=20, FOV=60° the 0.16u-diameter
//    cylinder is only ~7-8px on a 1280px viewport which still reads
//    as a thin streak.
//  • The color was already 0xff2233 (R=255, G=34, B=51) but additive
//    blending against bright orange asteroids (R~0.8, G~0.4, B~0.1)
//    pushes the rendered result toward warm tones. The saturated
//    red needs to DOMINATE the visual patch, not blend into the
//    surface below it.
// Fix: BEAM_RADIUS 0.08 → 0.24 (3× per user "make the laser 2 pixels
// thicker" — interpreted as "make the laser actually read as thick"
// since 2px at game camera distance is below the visual threshold).
// ORBIT_DRONES_BEAM_COLOR 0xff2233 → 0xff0033 (R=255, G=0, B=51 —
// maximum red saturation, G channel zeroed so additive mixing
// against any warm surface pulls the result back toward red, not
// toward yellow/orange). 9× the geometric area + 100% R-channel
// saturation = confident bright-red laser even over bright asteroids.
// BEAM_HIT_RADIUS=0.3 unchanged (visual is cosmetic; hit check is
// point-to-segment, independent of cylinder radius). Per-pixel
// additive overlap math unchanged: worst case 2 beams/pixel, peak
// stack unchanged.
const BEAM_RADIUS = 0.24;

export function createDroneMesh(tier: 1 | 2 | 3): Mesh {
  const color = ORBIT_DRONES_TIER_COLOR(tier);
  const geometry = new IcosahedronGeometry(DRONE_MESH_RADIUS, 0);
  const material = new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: FIRE_FLASH_REST_EMISSIVE,
    flatShading: true,
  });
  return new Mesh(geometry, material);
}

export function createAuraRing(tier: 1 | 2 | 3): Mesh {
  const geometry = new RingGeometry(AURA_RING_INNER, AURA_RING_OUTER, 48, 1);
  const material = new MeshBasicMaterial({
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: AURA_PULSE_BASELINE,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

export function createTetherLine(tier: 1 | 2 | 3): Line {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3),
  );
  const material = new LineBasicMaterial({
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: 0.25,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const line = new Line(geometry, material);
  line.visible = false;
  return line;
}

let _lockOnTexture: CanvasTexture | null = null;

/**
 * Lazy module-scope CanvasTexture for the lock-on diamond bitmap. Returns
 * null in node environments (no `document`); callers (createLockOnSprite)
 * pass null to SpriteMaterial.map without crashing. Exported so Task 6
 * (drone-kill sparks) can share the same texture instead of allocating
 * a second one.
 */
export function getSharedLockOnTexture(): CanvasTexture | null {
  if (_lockOnTexture !== null) return _lockOnTexture;
  if (typeof document === 'undefined') return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size / 2, 4);
  ctx.lineTo(size - 4, size / 2);
  ctx.lineTo(size / 2, size - 4);
  ctx.lineTo(4, size / 2);
  ctx.closePath();
  ctx.fill();
  _lockOnTexture = new CanvasTexture(canvas);
  _lockOnTexture.needsUpdate = true;
  return _lockOnTexture;
}

export function createLockOnSprite(tier: 1 | 2 | 3): Sprite {
  const material = new SpriteMaterial({
    map: getSharedLockOnTexture(),
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(LOCK_ON_SCALE, LOCK_ON_SCALE, 1);
  sprite.visible = false;
  return sprite;
}

export function createDeployShockwave(tier: 1 | 2 | 3): Mesh {
  const geometry = new RingGeometry(0.5, 0.7, 48, 1);
  const material = new MeshBasicMaterial({
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: 1.0,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

/**
 * Apply per-frame visual updates to a single drone mesh. Caller is
 * responsible for setting the orbital X/Y position before calling
 * (this helper adds the Y-bob on top, leaves X untouched, and assigns
 * spin + fire-flash).
 */
export function updateDroneVisuals(
  mesh: Mesh,
  t: number,
  fireFlashAge: number,
  bobPhase: number,
  orbitalY: number = mesh.position.y,
): void {
  const angles = spinAngles(t);
  mesh.rotation.x = angles.x;
  mesh.rotation.y = angles.y;
  const flash = fireFlashCurve(fireFlashAge);
  const scale = 1.0 + 0.15 * flash;
  mesh.scale.set(scale, scale, scale);
  const mat = mesh.material as MeshStandardMaterial;
  mat.emissiveIntensity = FIRE_FLASH_REST_EMISSIVE
    + (FIRE_FLASH_PEAK_EMISSIVE - FIRE_FLASH_REST_EMISSIVE) * flash;
  mesh.position.y = orbitalY + bobOffset(t, bobPhase);
}

export function updateAuraPulse(
  ring: Mesh,
  tier: 0 | 1 | 2 | 3,
  t: number,
  fireFlashAge: number,
): void {
  if (tier === 0) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  const flash = fireFlashCurve(fireFlashAge);
  const pulse = AURA_PULSE_BASELINE + AURA_PULSE_AMPLITUDE * Math.sin(t * AURA_PULSE_FREQ);
  const opacity = Math.min(AURA_PEAK_FLASH, pulse + (AURA_PEAK_FLASH - AURA_PULSE_BASELINE) * flash);
  (ring.material as MeshBasicMaterial).opacity = opacity;
}

export function updateTetherLine(
  line: Line,
  dronePosition: Vector2,
  targetPosition: Vector2 | null,
): void {
  if (targetPosition === null) {
    line.visible = false;
    return;
  }
  line.visible = true;
  const positions = (line.geometry as BufferGeometry).attributes.position;
  positions.setXYZ(0, dronePosition.x, dronePosition.y, 0);
  positions.setXYZ(1, targetPosition.x, targetPosition.y, 0);
  positions.needsUpdate = true;
}

export function updateLockOnSprite(sprite: Sprite, targetPosition: Vector2 | null): void {
  if (targetPosition === null) {
    sprite.visible = false;
    return;
  }
  sprite.visible = true;
  sprite.position.set(targetPosition.x, targetPosition.y, 0);
}

export function updateDeployShockwave(ring: Mesh, age: number): void {
  if (age >= DEPLOY_SHOCKWAVE_DURATION_SECONDS) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  const t = age / DEPLOY_SHOCKWAVE_DURATION_SECONDS; // 0..1
  const scale = 0.5 + 1.5 * t; // 0.5 → 2.0
  ring.scale.set(scale, scale, 1);
  (ring.material as MeshBasicMaterial).opacity = 1.0 - t;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7i-2 (Task 3) — beam + muzzle flash + charge-up ring
// ═══════════════════════════════════════════════════════════════════════════
// These three layers read in addition to the Phase 7i baseline. All live
// in this file so the visual contract is one-stop; the Game class wires
// them in via src/active-deployments.ts (Task 4). Pure visual — no state,
// no targeting math, no disposal contract. The disposers in active-deployments
// handle teardown (Line/Sprite/Mesh are standard Three.js objects).

/**
 * Phase 7i-2 (post-ship hotfix) — beam was Line + LineBasicMaterial in
 * v15.0 but WebGL's `linewidth` is a no-op (always 1px), so the beam
 * was effectively invisible against bloom + bright asteroid surfaces.
 * Now a CylinderGeometry (r=BEAM_RADIUS=0.24, h=1 along Y) so the
 * beam is a real triangle mesh that renders at the intended thickness.
 * Phase 7i-2 hotfix #6 doubled the radius from 0.04 → 0.08 per user
 * feedback "make the laser 2x bigger in width". Phase 7i-2 hotfix #7
 * tripled it again to 0.24 per user feedback "make the laser 2 pixels
 * thicker" — see BEAM_RADIUS My Rules for the bloom-disabled root
 * cause. The cylinder is unit-height; updateBeam scales Y to the
 * drone→target distance and re-orients via
 * Quaternion.setFromUnitVectors(UP, dir). Color (0xff0033 after #7,
 * was 0xff2233 from v15.0), additive blending, opacity cap 0.8, and
 * depthWrite=false are unchanged.
 */
/**
 * Phase 7i-2 hotfix #8 — `createDroneBeam` is now a thin dispatcher that
 * branches on `ORBIT_DRONES_USE_SHADER_BEAM` at construction time.
 *
 * - If true: returns the ShaderMaterial plasma beam from `createPlasmaDroneBeam`
 *   (radial falloff + flowing FBM noise — the in-shader substitute for
 *   bloom that compensates for bloom being disabled in this project).
 * - If false: returns the original MeshBasicMaterial solid-color cylinder
 *   (preserved verbatim from hotfix #7 so the A/B comparison is clean).
 *
 * Runtime note: the constant is read at construction time only. Existing
 * beams in flight keep their original material — flipping the constant
 * mid-game affects the next beam spawned, not currently-active ones.
 * The keyboard handler in `src/main.ts` (B key) and the `__hooks.setPlasmaBeam`
 * hook let the user flip the value at runtime without a rebuild.
 */
// Phase 7i-2 hotfix #9 — module-level runtime copy of the toggle so the
// B-key handler and __hooks.setPlasmaBeam actually affect createDroneBeam.
// In hotfix #8 the toggle lived only as a local `let` in main.ts that
// was never read by the dispatcher, so pressing B did nothing — user
// reported "It has not Changed" after the B press, which was technically
// correct (the toggle was wired to console.log only). Mirrored here
// so the dispatch path reads the live value, not the const import.
let _useShaderBeam = ORBIT_DRONES_USE_SHADER_BEAM;
export function setUseShaderBeam(enabled: boolean): void {
  _useShaderBeam = enabled;
}
export function getUseShaderBeam(): boolean {
  return _useShaderBeam;
}
export function createDroneBeam(tier: 1 | 2 | 3): Mesh {
  if (_useShaderBeam) {
    return createPlasmaDroneBeam(tier);
  }
  const geometry = new CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, 1, 8, 1, true);
  const material = new MeshBasicMaterial({
    color: ORBIT_DRONES_BEAM_COLOR,
    transparent: true,
    opacity: 0.8,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  // Mesh is invisible until fireDroneBeam promotes it (consistent with
  // the v15 Line path which started with visible=false).
  mesh.visible = false;
  return mesh;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7i-2 hotfix #8 — ShaderMaterial plasma beam (user picked
// "Shader-driven plasma beam" from the 4-way architecture AskUserQuestion
// after the 3rd failed beam-width iteration). Replaces the solid-color
// MeshBasicMaterial cylinder with a custom ShaderMaterial that adds:
//   1. Radial-falloff alpha — beam fades to zero at the edges instead of
//      a hard cylinder outline. Eliminates the "red bar" look.
//   2. Bright core (0xff0033) + softer outer (0x661122) color mix — the
//      silhouette reads as a "glowing energy core" instead of a "tube
//      painted red".
//   3. Axial FBM noise animated by a `time` uniform — creates a "flowing
//      energy" effect that scrolls drone→target at ORBIT_DRONES_BEAM_PLASMA_SPEED
//      Hz. This is the in-shader substitute for bloom (which is disabled
//      in this project, see src/post-processing.ts:23-36). Without bloom,
//      a static wide cylinder reads as a fat red bar; with the flowing
//      noise, it reads as a "power laser".
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phase 7i-2 hotfix #8 — GLSL fragment shader for the plasma beam.
 *
 * UVs come from the CylinderGeometry's default UV layout: u runs around
 * the circumference (0..1), v runs along the length (0=base, 1=top).
 * Because the beam is a CYLINDER (not a flat plane), u is NOT a true
 * "radial" coordinate — it's the angular position around the cylinder.
 * We need a real radial coordinate for the falloff. Trick: convert the
 * world-space position of the fragment to a local coordinate relative
 * to the cylinder's axis (Y in local space), then use the distance from
 * the axis as the radial coordinate. The vertex shader passes the local
 * position to the fragment, and the fragment computes the radial
 * distance in the local frame.
 *
 * The vertex shader is minimal — pass through position, normal, uv.
 *
 * The fragment does:
 *   1. localRadial = length(vLocalPosition.xz) / cylinderRadius
 *   2. radialAlpha = pow(1.0 - localRadial, FALLOFF_POWER)
 *   3. colorMix = mix(OUTER, CORE, radialAlpha)
 *   4. axialNoise = fbm(vUv.y * 6.0 - time * PLASMA_SPEED) // flows
 *   5. finalAlpha = radialAlpha * (0.6 + 0.4 * axialNoise) // pulse
 *   6. gl_FragColor = vec4(colorMix, finalAlpha)
 *
 * Per the additive-blending white-out discipline
 * (feedback_additive_blending_whiteout.md), the per-pixel alpha is
 * capped at 0.8 by mixing against a base brightness floor. The
 * combination of (a) radial falloff reducing edge contribution,
 * (b) 0.6 base + 0.4 noise pulse range, and (c) the OUTER color being
 * a dim red (0x661122) instead of saturated (0xff0033) means the
 * beam cannot stack with a second beam into pure white at the
 * worst-case overlap (2 beams/pixel at peak tier 3 deployment).
 */
const _PLASMA_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalPosition;
  varying vec2 vUv;
  void main() {
    vLocalPosition = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const _PLASMA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uPlasmaSpeed;
  uniform float uFalloffPower;
  uniform vec3 uCoreColor;
  uniform vec3 uOuterColor;
  uniform float uBeamRadius;
  uniform float uOpacityCap;
  varying vec3 vLocalPosition;
  varying vec2 vUv;

  // 1D hash + smooth interpolation. Cheap, branchless, deterministic.
  // Identical pattern to the inline GLSL noise in src/crystal-fx.ts:140
  // (Phase 6d CrystalLightning) and src/lightning.ts:60 (vendored
  // three.js r149). Avoids the need to vendor a SimplexNoise library
  // for a single FBM call.
  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float noise1d(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), u);
  }

  // 4-octave FBM. The 0.5 amplitude ladder + 2.0 frequency ladder is
  // the standard fBm recipe (Musgrave et al 1992) — gives a fractal
  // texture that reads as "energy" without obvious periodicity.
  float fbm(float x) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise1d(x);
      x *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // CylinderGeometry local frame: axis is Y, radial direction is XZ.
    // Length(xz) at the cylinder surface equals uBeamRadius.
    float radial = length(vLocalPosition.xz) / uBeamRadius;
    // Clamp to [0, 1] — fragments inside the cap triangles (at the
    // cylinder ends) can have radial > 1 in degenerate cases.
    radial = clamp(radial, 0.0, 1.0);
    // Radial falloff: 1.0 at center (radial=0), 0.0 at edge (radial=1).
    // pow() sharpens the falloff — FALLOFF_POWER=2.0 gives a quadratic
    // falloff that reads as a "soft glow" rather than a "tube".
    float radialAlpha = pow(1.0 - radial, uFalloffPower);

    // Core/outer color mix: outer (dim red) at edges, core (bright red)
    // at center. The mix factor uses radialAlpha so the colors blend
    // along the same gradient as the alpha.
    vec3 color = mix(uOuterColor, uCoreColor, radialAlpha);

    // Axial noise: scrolls along the beam length. vUv.y goes 0→1 along
    // the cylinder Y axis, time advances the noise sample so the
    // pattern appears to flow drone→target.
    float axialCoord = vUv.y * 6.0 - uTime * uPlasmaSpeed;
    float noiseValue = fbm(axialCoord);

    // Modulate alpha by noise: 0.6 base + 0.4 noise range. The base
    // ensures the beam is always visible (never fades to zero), the
    // noise range gives the "flowing energy" texture.
    float finalAlpha = radialAlpha * (0.6 + 0.4 * noiseValue);

    // Cap finalAlpha at uOpacityCap per the additive-blending white-out
    // discipline — even with 2 beams stacked, the per-pixel result
    // stays at 2*CAP of one beam, not 2.0 of one beam. Core uses 0.8,
    // glow uses 0.4, worst-case 2-stack of (core + glow) is 1.2 per
    // pixel — well below the white-out threshold.
    finalAlpha = min(finalAlpha, uOpacityCap);

    gl_FragColor = vec4(color, finalAlpha);
  }
`;

/**
 * Phase 7i-2 hotfix #8 — plasma beam factory. Replaces createDroneBeam's
 * MeshBasicMaterial cylinder with a ShaderMaterial cylinder. Same
 * geometry (CylinderGeometry r=BEAM_RADIUS, unit Y-height) so updateBeam
 * per-frame pose logic is unchanged. The shader needs a `time` uniform
 * updated each frame; updatePlasmaDroneBeam writes it via the standard
 * `material.uniforms.uTime.value = clock` pattern.
 */
export function createPlasmaDroneBeam(_tier: 1 | 2 | 3): Mesh {
  const geometry = new CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, 1, 12, 1, true);
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPlasmaSpeed: { value: ORBIT_DRONES_BEAM_PLASMA_SPEED },
      uFalloffPower: { value: ORBIT_DRONES_BEAM_PLASMA_FALLOFF_POWER },
      uCoreColor: { value: new Vector3(
        ((ORBIT_DRONES_BEAM_COLOR >> 16) & 0xff) / 255,
        ((ORBIT_DRONES_BEAM_COLOR >> 8) & 0xff) / 255,
        (ORBIT_DRONES_BEAM_COLOR & 0xff) / 255,
      ) },
      uOuterColor: { value: new Vector3(
        ((ORBIT_DRONES_BEAM_OUTER_COLOR >> 16) & 0xff) / 255,
        ((ORBIT_DRONES_BEAM_OUTER_COLOR >> 8) & 0xff) / 255,
        (ORBIT_DRONES_BEAM_OUTER_COLOR & 0xff) / 255,
      ) },
      uBeamRadius: { value: BEAM_RADIUS },
      uOpacityCap: { value: 0.8 },
    },
    vertexShader: _PLASMA_VERTEX_SHADER,
    fragmentShader: _PLASMA_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.visible = false;
  return mesh;
}

/**
 * Phase 7i-2 hotfix #8 — per-frame pose update for the plasma beam.
 * Identical to updateBeam's pose logic (drone→target midpoint, Y-scale
 * to length, quaternion to align +Y with direction) but also writes
 * the shader's uTime uniform so the axial noise animation advances.
 */
export function updatePlasmaDroneBeam(
  beam: Mesh,
  dronePos: { x: number; y: number; z: number },
  targetPos: { x: number; y: number; z: number },
  timeSeconds: number,
): void {
  // Pose — identical to updateBeam.
  const dx = targetPos.x - dronePos.x;
  const dy = targetPos.y - dronePos.y;
  const dz = targetPos.z - dronePos.z;
  const length = Math.max(0.001, Math.hypot(dx, dy, dz));
  _BEAM_DIR.set(dx / length, dy / length, dz / length);
  _BEAM_QUAT.setFromUnitVectors(_BEAM_UP, _BEAM_DIR);
  beam.position.set(
    (dronePos.x + targetPos.x) * 0.5,
    (dronePos.y + targetPos.y) * 0.5,
    (dronePos.z + targetPos.z) * 0.5,
  );
  beam.quaternion.copy(_BEAM_QUAT);
  beam.scale.set(1, length, 1);
  // Shader time update — advances the axial noise animation.
  (beam.material as ShaderMaterial).uniforms.uTime.value = timeSeconds;
}

/**
 * Phase 7i-2 hotfix #8 — dispose the plasma beam's GPU resources.
 * The ShaderMaterial is custom so it isn't auto-disposed by Three.js's
 * standard MeshBasicMaterial path; explicit dispose is required.
 */
export function disposePlasmaDroneBeam(beam: Mesh): void {
  beam.geometry.dispose();
  (beam.material as ShaderMaterial).dispose();
}

/**
 * Phase 7i-2 hotfix #9 — outer "glow" cylinder for the two-layer beam.
 * Pairs with the bright core returned by createPlasmaDroneBeam: the core
 * handles the saturated-red silhouette (~19px diameter at game camera
 * distance), the glow provides a desaturated-red halo (~37px diameter)
 * that approximates the bloom dilation this project can't provide
 * (src/post-processing.ts:23-36 returns a no-op composer stub).
 *
 * Same plasma shader as the core (radial falloff + axial FBM noise) but
 * with different uniforms:
 *   - uCoreColor = GLOW_COLOR (desaturated red, reads as halo not beam)
 *   - uOuterColor = GLOW_COLOR (no contrast — the glow is uniformly
 *     dim, not a bright center)
 *   - uBeamRadius = GLOW_RADIUS (the falloff normalizer scales with the
 *     larger geometry)
 *   - uFalloffPower = same as core (consistent halo shape)
 *
 * The opacity cap is 0.40 (vs core's 0.8) so the per-pixel additive
 * contribution stays well below the 2-beam stack limit. Returns a
 * Mesh with visible=false; active-deployments sets visible=true on
 * fire and back to false on beam expiry. updatePlasmaDroneBeam and
 * disposePlasmaDroneBeam work unchanged on this mesh because it uses
 * the same shader, geometry family, and material lifecycle.
 */
export function createPlasmaDroneBeamGlow(_tier: 1 | 2 | 3): Mesh {
  const geometry = new CylinderGeometry(
    ORBIT_DRONES_BEAM_GLOW_RADIUS,
    ORBIT_DRONES_BEAM_GLOW_RADIUS,
    1,
    16, // more segments than core (12) — larger circumference needs more polys
    1,
    true,
  );
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPlasmaSpeed: { value: ORBIT_DRONES_BEAM_PLASMA_SPEED },
      uFalloffPower: { value: ORBIT_DRONES_BEAM_PLASMA_FALLOFF_POWER },
      uCoreColor: { value: new Vector3(
        ((ORBIT_DRONES_BEAM_GLOW_COLOR >> 16) & 0xff) / 255,
        ((ORBIT_DRONES_BEAM_GLOW_COLOR >> 8) & 0xff) / 255,
        (ORBIT_DRONES_BEAM_GLOW_COLOR & 0xff) / 255,
      ) },
      uOuterColor: { value: new Vector3(
        ((ORBIT_DRONES_BEAM_GLOW_COLOR >> 16) & 0xff) / 255,
        ((ORBIT_DRONES_BEAM_GLOW_COLOR >> 8) & 0xff) / 255,
        (ORBIT_DRONES_BEAM_GLOW_COLOR & 0xff) / 255,
      ) },
      uBeamRadius: { value: ORBIT_DRONES_BEAM_GLOW_RADIUS },
      uOpacityCap: { value: ORBIT_DRONES_BEAM_GLOW_OPACITY },
    },
    vertexShader: _PLASMA_VERTEX_SHADER,
    fragmentShader: _PLASMA_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.visible = false;
  return mesh;
}

/**
 * Phase 7i-2 — bright red muzzle flash sprite at the drone barrel.
 * Reuses the shared lock-on diamond texture (the diamond shape reads
 * as a brief muzzle burst at this size). Opacity is 0 at spawn and
 * animated by updateMuzzleFlash (half-sine 0→PEAK→0 over 80ms).
 */
export function createMuzzleFlash(_tier: 1 | 2 | 3): Sprite {
  const material = new SpriteMaterial({
    map: getSharedLockOnTexture(),
    color: ORBIT_DRONES_BEAM_COLOR,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(MUZZLE_FLASH_SCALE, MUZZLE_FLASH_SCALE, 1);
  return sprite;
}

/**
 * Phase 7i-2 — tier-colored flat ring rendered under the ship during
 * the Digit2 charge-up hold. The ring starts at scale 0 and grows to
 * ORBIT_DRONES_CHARGE_UP_RING_MAX_RADIUS (3.0) as the held-time fraction
 * goes 0 → 1. Uses RingGeometry(0.95, 1.0) so the band is a thin
 * "decanter" outline that reads as a "filling" meter rather than a
 * solid disc.
 */
export function createChargeUpRing(tier: 1 | 2 | 3): Mesh {
  const geometry = new RingGeometry(0.95, 1.0, 48, 1);
  const material = new MeshBasicMaterial({
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // lay flat on XZ plane
  mesh.scale.set(0, 0, 1);
  return mesh;
}

/**
 * Phase 7i-2 (post-ship hotfix) — per-frame pose update for the
 * cylinder beam. The cylinder is unit-height along +Y at construction;
 * we compute the drone→target direction, set the mesh to the midpoint,
 * scale Y to the segment length, and rotate +Y to align with the
 * direction via Quaternion.setFromUnitVectors. Length is clamped to
 * >=0.001 so a coincident drone/target can't produce NaN from a
 * zero-length normalize.
 */
const _BEAM_UP = new Vector3(0, 1, 0);
const _BEAM_DIR = new Vector3();
const _BEAM_QUAT = new Quaternion();
export function updateBeam(
  beam: Mesh,
  dronePos: { x: number; y: number; z: number },
  targetPos: { x: number; y: number; z: number },
): void {
  const dx = targetPos.x - dronePos.x;
  const dy = targetPos.y - dronePos.y;
  const dz = targetPos.z - dronePos.z;
  const length = Math.max(0.001, Math.hypot(dx, dy, dz));
  _BEAM_DIR.set(dx / length, dy / length, dz / length);
  _BEAM_QUAT.setFromUnitVectors(_BEAM_UP, _BEAM_DIR);
  beam.position.set(
    (dronePos.x + targetPos.x) * 0.5,
    (dronePos.y + targetPos.y) * 0.5,
    (dronePos.z + targetPos.z) * 0.5,
  );
  beam.quaternion.copy(_BEAM_QUAT);
  beam.scale.set(1, length, 1);
}

/**
 * Phase 7i-2 — half-sine opacity curve for the muzzle flash.
 * 0 at age=0, PEAK at age=lifetime/2, 0 at age>=lifetime. Outside the
 * window the sprite is "dead" (opacity=0) — the active-deployment
 * disposer should also remove the object from the scene once the
 * lifetime elapses; this helper only drives the visual.
 */
export function updateMuzzleFlash(sprite: Sprite, age: number): void {
  const material = sprite.material as SpriteMaterial;
  if (age >= MUZZLE_FLASH_LIFETIME_SECONDS) {
    material.opacity = 0;
    return;
  }
  const t = age / MUZZLE_FLASH_LIFETIME_SECONDS;
  material.opacity = MUZZLE_FLASH_PEAK_OPACITY * Math.sin(t * Math.PI);
}

/**
 * Phase 7i-2 — scale animation for the charge-up ring. fraction is
 * clamped to [0, 1] so a glitched pulse from the active-deployment
 * ticker can't blow the ring past MAX_RADIUS. The Z scale stays at 1
 * (the ring lives on the XZ plane after the -π/2 X rotation; scaling
 * Z by 0 would shrink its rendered thickness to zero).
 */
export function updateChargeUpRing(ring: Mesh, fraction: number): void {
  const clamped = Math.max(0, Math.min(1, fraction));
  const r = clamped * ORBIT_DRONES_CHARGE_UP_RING_MAX_RADIUS;
  ring.scale.set(r, r, 1);
}
