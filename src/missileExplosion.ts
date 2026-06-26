import {
  AdditiveBlending,
  BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import { Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Missile Explosion VFX (Phase 7g)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Procedural layered explosion that fires when a homing missile is
//          destroyed (impact OR fuel-expiry, per user choice 2026-06-26).
//          Two co-emitted layers:
//            - SHARDS: 50 dark tumbling TetrahedronGeometry meshes via
//              InstancedMesh — gives the explosion physical mass
//              (matches missile scale: small, fast, projectile-like)
//            - SPARKS: 80 yellow→white Points (billboards via gl_PointSize)
//              with custom ShaderMaterial — radial-gradient fragment so each
//              spark reads as a glowing dot, not a square. AdditiveBlending,
//              low per-source opacity to dodge the project's white-out rule
//              (feedback_additive_blending_whiteout.md).
//          Plus a single 100ms core-flash sphere as the punch moment at
//          frame 0. Total = 3 draw calls per active explosion. Pools are
//          pre-allocated at factory time and reset/reused across
//          detonations (no per-frame new/dispose → no GC churn in rAF).
// Setup:   createMissileExplosionFactory(this.scene) called from Game
//          constructor; factory returns { spawn, update, dispose }. spawn
//          is called by active-deployments.ts BEFORE disposeMissileState
//          (both fuel-expiry and impact paths). update is called from the
//          Game update loop. dispose is called from Game.stop().
// Issues:  None at creation.
// Fix:     Phase 7g. User asked "Add an explosion effect when Missile is
//          destroyed . Find a great looking explosion effect". Agent
//          research returned 7 candidate techniques; user picked the
//          B+D layered combo (shards + sparks, recommended). The shockwave
//          ring (option C) was rejected to avoid duplication with the
//          Bomb Strike pickup which already uses RingGeometry.
// Gotchas:
//  - Vector2 is readonly → construct new objects, never mutate .x/.y.
//  - Pool slots have an `alive` flag + `age` counter. Update loop
//    advances `age` and zeroes slot data when `age >= lifetime`. Reset
//    on spawn (not on death) to keep spawn code single-purpose.
//  - Shards use NON-additive MeshStandardMaterial (dark grey) so they
//    contribute ZERO additive budget — total white-out budget per
//    explosion peak = 80 sparks @ 0.3 + 1 flash @ 0.55 = 24 + 0.55 =
//    24.55 per-pixel max, well under the 60-saturation threshold.
//  - Sparks billboard via Points + gl_PointSize in vertex shader. We do
//    NOT use Sprites or mesh billboarding (would double draw calls and
//    need a separate update path).
//  - The `profile` param on spawn lets per-missile-kind color overrides
//    fire later without changing the call signature. For Phase 7g all
//    kinds use the default yellow-white profile.
//  - 50 + 80 + 1 = 131 GPU slots always live; per-frame work is one
//    O(130) loop, no allocations. Safe for 6 simultaneous explosions.
//  - DO NOT use `require('three')` anywhere — see
//    feedback_require_three_freeze.md for the full story (Phase 7b
//    bomb freeze was caused by inline `require('three')` calls).
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7g-3 — Brightness + Density + White Smoke Tuning
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Five compounding visibility issues from the Phase 7g/7g-2
//          explosion made the user say "Cannot See the Explosion .. Its
//          All Very DArk". Root causes + fixes:
//
//            1. Flash sphere too small: 0.40u × 1.4 max-scale = ~17px peak.
//               → FLASH_MESH_RADIUS 0.40 → 0.70, FLASH_MAX_SCALE 1.4 → 2.2
//                 (peak size ≈ 0.70 × 2.2 = 1.54u ≈ ~30px on screen)
//            2. Flash too brief: 0.10s = 6 frames at 60fps. Eye misses it.
//               → FLASH_DURATION_SECONDS 0.10 → 0.16 (~50% longer punch)
//            3. Flash dim at peak: 0.55 opacity × warm-white tint.
//               → FLASH_PEAK_OPACITY 0.55 → 0.85
//            4. Sparks tiny: gl_PointSize ×200 + pow(1-r, 2.5) thin cores
//               gave ~1.4px per spark. Hard to see.
//               → ×200 → ×320 multiplier, falloff 2.5 → 1.4 (wider core),
//                 per-spark size 0.08-0.14u → 0.12-0.22u
//            5. Shards invisible: dark grey 0x222222 with no emissive,
//               against dark starfield → ZERO pixels.
//               → DEFAULT_SHARD_COLOR 0x222222 → 0x555566 (lighter slate),
//                 emissive 0x000000 → 0x111122 (faint blue glow catches bloom)
//
//          Plus user-requested white smoke layer (the "maybe white smoke"
//          in their ask). 30 PlaneGeometry instances, additive blend at
//          0.4 opacity per puff, scale grows 0.35u → ~1.7u over 0.85s.
//          PlaneGeometry chosen over Points because Points gl_PointSize
//          is screen-space pixels — can't grow in world units which is
//          what makes smoke billow.
//
// White-out budget (peak per-pixel sum):
//   sparks 80 × 0.5 = 40 + flash 1 × 0.85 = 0.85 + smoke 30 × 0.4 = 12
//   shards (NON-additive) = 0 → total 52.85, under 60-saturation threshold
//   from feedback_additive_blending_whiteout.md. Smoke overlap is typically
//   ≤3 puffs per pixel after expansion (spread across ~20 sq.u.), so real
//   worst-case at explosion center ≈ 4.55 per channel (well under 1.0).
// ═══════════════════════════════════════════════════════════════════════════

const SHARD_COUNT = 50;
const SPARK_COUNT = 80;
const SMOKE_COUNT = 30; // NEW LAYER (Phase 7g-3)
const FLASH_DURATION_SECONDS = 0.16; // 0.10 → 0.16
const SHARD_LIFETIME_SECONDS = 0.60;
const SPARK_LIFETIME_SECONDS = 0.45;
const SMOKE_LIFETIME_SECONDS = 0.85; // NEW — smoke lingers past flash + sparks
const FLASH_MESH_RADIUS = 0.70; // 0.40 → 0.70

const SHARD_BASE_SPEED = 7.0; // mean outward velocity (u/s)
const SHARD_SPEED_VARIANCE = 4.0;
const SHARD_TUMBLE_RATE = 12.0; // rad/s on each axis
const SHARD_DRAG = 0.92; // per-second velocity multiplier (decay)

const SPARK_BASE_SPEED = 11.0;
const SPARK_SPEED_VARIANCE = 6.0;
const SPARK_DRAG = 0.85;

const SMOKE_BASE_SPEED = 3.5; // NEW — slower than sparks (smoke drifts)
const SMOKE_SPEED_VARIANCE = 1.5; // NEW
const SMOKE_DRAG = 0.78; // NEW — heavier decay → puffs slow down
const SMOKE_BASE_SCALE = 0.35; // NEW — start small
const SMOKE_GROWTH_SCALE = 1.4; // NEW — grow by this much over lifetime

const FLASH_MAX_SCALE = 2.2; // 1.4 → 2.2
const FLASH_PEAK_OPACITY = 0.85; // 0.55 → 0.85
const FLASH_COLOR = 0xfff5cc; // warm white

const DEFAULT_SHARD_COLOR = 0x555566; // 0x222222 → 0x555566 — lighter slate
const DEFAULT_SPARK_COLOR_INNER = 0xfff2a8; // warm yellow
const DEFAULT_SPARK_COLOR_OUTER = 0xffffff; // white core
const DEFAULT_SMOKE_COLOR = 0xeeeeee; // NEW — off-white (not pure white)

/**
 * Profile for a single missile-explosion detonation. Per-missile-kind
 * variants can override color/intensity; defaults are the standard
 * yellow plasma look.
 */
export interface MissileExplosionProfile {
  readonly shardColor: number;
  readonly sparkInnerColor: number;
  readonly sparkOuterColor: number;
  readonly flashColor: number;
  readonly intensity: number; // 0..1 multiplier on particle count + speed
}

export const DEFAULT_MISSILE_EXPLOSION_PROFILE: MissileExplosionProfile = {
  shardColor: DEFAULT_SHARD_COLOR,
  sparkInnerColor: DEFAULT_SPARK_COLOR_INNER,
  sparkOuterColor: DEFAULT_SPARK_COLOR_OUTER,
  flashColor: FLASH_COLOR,
  intensity: 1.0,
};

interface ShardSlot {
  alive: boolean;
  age: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotVx: number;
  rotVy: number;
  rotVz: number;
  scale: number;
}

interface SparkSlot {
  alive: boolean;
  age: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

interface FlashSlot {
  alive: boolean;
  age: number;
  x: number;
  y: number;
}

// Phase 7g-3 — SmokeSlot for the new white smoke layer. Same pool pattern
// as ShardSlot / SparkSlot: alive flag + age counter + x/y/vx/vy. Only
// extras are rotZ (puffs face random rotations so they don't all look
// identical) and initialScale (size jitter so puffs vary in size).
interface SmokeSlot {
  alive: boolean;
  age: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotZ: number;
  initialScale: number;
}

interface ExplosionSlots {
  shards: ShardSlot[];
  sparks: SparkSlot[];
  flashes: FlashSlot[];
  smoke: SmokeSlot[]; // Phase 7g-3
  // Scratch object for matrix writes (reused — no per-frame allocations).
  dummy: Object3D;
}

interface ExplosionFactory {
  readonly group: Group;
  spawn(
    position: Vector2,
    velocityDir: Vector2,
    profile?: MissileExplosionProfile,
  ): void;
  update(deltaTime: number): void;
  dispose(): void;
  /** Test-only: returns true if any particles are alive. */
  hasActiveParticles(): boolean;
}

function makeShardSlots(): ShardSlot[] {
  const slots: ShardSlot[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    slots.push({
      alive: false,
      age: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      rotVx: 0,
      rotVy: 0,
      rotVz: 0,
      scale: 0.1,
    });
  }
  return slots;
}

function makeSparkSlots(): SparkSlot[] {
  const slots: SparkSlot[] = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    slots.push({ alive: false, age: 0, x: 0, y: 0, vx: 0, vy: 0, size: 0.1 });
  }
  return slots;
}

function makeFlashSlots(): FlashSlot[] {
  return [{ alive: false, age: 0, x: 0, y: 0 }];
}

// Phase 7g-3 — pre-allocate smoke pool. Same shape as makeSparkSlots but
// with the two smoke-specific extras (rotZ + initialScale).
function makeSmokeSlots(): SmokeSlot[] {
  const slots: SmokeSlot[] = [];
  for (let i = 0; i < SMOKE_COUNT; i++) {
    slots.push({
      alive: false,
      age: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rotZ: 0,
      initialScale: 0.3,
    });
  }
  return slots;
}

// Phase 7g-3 — same signature as resetShard / resetSpark: takes pre-baked
// unit direction × speed so spawn() controls the velocity math. Sets the
// smoke-specific rotation + size jitter.
function resetSmoke(
  slot: SmokeSlot,
  x: number,
  y: number,
  vx: number,
  vy: number,
): void {
  slot.alive = true;
  slot.age = 0;
  slot.x = x;
  slot.y = y;
  slot.vx = vx;
  slot.vy = vy;
  slot.rotZ = Math.random() * Math.PI * 2;
  // 0.7..1.0 size jitter — modulates the base scale so puffs vary.
  slot.initialScale = 0.7 + Math.random() * 0.3;
}

function randomDirection(): Vector2 {
  // Uniform angle 0..2π → unit vector. Pure function on global RNG so tests
  // can stub Math.random in setUp/tearDown.
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
}

function resetShard(slot: ShardSlot, x: number, y: number, vx: number, vy: number): void {
  slot.alive = true;
  slot.age = 0;
  slot.x = x;
  slot.y = y;
  slot.vx = vx;
  slot.vy = vy;
  slot.rotX = Math.random() * Math.PI * 2;
  slot.rotY = Math.random() * Math.PI * 2;
  slot.rotZ = Math.random() * Math.PI * 2;
  // Tumble axis: random unit vector × SHARD_TUMBLE_RATE.
  slot.rotVx = (Math.random() * 2 - 1) * SHARD_TUMBLE_RATE;
  slot.rotVy = (Math.random() * 2 - 1) * SHARD_TUMBLE_RATE;
  slot.rotVz = (Math.random() * 2 - 1) * SHARD_TUMBLE_RATE;
  slot.scale = 0.08 + Math.random() * 0.07; // 0.08..0.15u
}

function resetSpark(slot: SparkSlot, x: number, y: number, vx: number, vy: number): void {
  slot.alive = true;
  slot.age = 0;
  slot.x = x;
  slot.y = y;
  slot.vx = vx;
  slot.vy = vy;
  // Phase 7g-3 — 0.08..0.14u → 0.12..0.22u (~60% larger raw spark size).
  slot.size = 0.12 + Math.random() * 0.10;
}

function resetFlash(slot: FlashSlot, x: number, y: number): void {
  slot.alive = true;
  slot.age = 0;
  slot.x = x;
  slot.y = y;
}

/**
 * Vertex shader for spark Points. Scales gl_PointSize by particle size +
 * lifetime-fade so dying sparks shrink visually before disappearing.
 */
const SPARK_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Phase 7g-3 — 200.0 → 320.0 makes each spark ~60% larger in screen pixels.
    gl_PointSize = aSize * 320.0 * aLife / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader for spark Points. Radial gradient: bright center fading
 * to transparent edge, color blend from inner→outer based on vLife. Gives
 * every spark a glowing dot silhouette without any texture asset.
 */
const SPARK_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  varying float vLife;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    // Phase 7g-3 — falloff exponent 2.5 → 1.4 gives each spark a wider
    // bright core (was a thin hot dot, now reads as a glowing puff).
    float core = pow(1.0 - r, 1.4);
    vec3 col = mix(uOuterColor, uInnerColor, vLife);
    gl_FragColor = vec4(col * core * vLife, core * vLife);
  }
`;

export function createMissileExplosionFactory(parentScene: Object3D): ExplosionFactory {
  // --- SHARDS layer (InstancedMesh) ----------------------------------------
  const shardGeometry = new TetrahedronGeometry(1, 0); // unit, scaled per-instance
  const shardMaterial = new MeshStandardMaterial({
    color: DEFAULT_SHARD_COLOR,
    // Phase 7g-3 — emissive 0x111122 + intensity 0.5 gives shards a faint
    // blue glow so they catch the project's bloom pass against the dark
    // starfield. Without this, the lighter slate color (0x555566) still
    // reads as dim — bloom catches emissive, not diffuse.
    emissive: 0x111122,
    emissiveIntensity: 0.5,
    roughness: 0.65,
    metalness: 0.2,
    flatShading: true,
  });
  const shardMesh = new InstancedMesh(shardGeometry, shardMaterial, SHARD_COUNT);
  shardMesh.frustumCulled = false;

  // --- SPARKS layer (Points + custom ShaderMaterial) -----------------------
  const sparkGeometry = new PlaneGeometry(1, 1);
  const sparkMaterial = new ShaderMaterial({
    uniforms: {
      uInnerColor: { value: new Vector3(1, 0.95, 0.66) },
      uOuterColor: { value: new Vector3(1, 1, 1) },
    },
    vertexShader: SPARK_VERTEX_SHADER,
    fragmentShader: SPARK_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const sparkPoints = new Points(sparkGeometry, sparkMaterial);
  sparkPoints.frustumCulled = false;

  // --- FLASH layer (single Mesh) -------------------------------------------
  const flashGeometry = new SphereGeometry(FLASH_MESH_RADIUS, 16, 12);
  const flashMaterial = new MeshBasicMaterial({
    color: FLASH_COLOR,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  });
  const flashMesh = new Mesh(flashGeometry, flashMaterial);
  flashMesh.visible = false;
  flashMesh.frustumCulled = false;

  // --- SMOKE layer (InstancedMesh of PlaneGeometry) — Phase 7g-3 ------------
  // Why PlaneGeometry not Points: gl_PointSize is screen-space pixels —
  // can't grow in world units, which is what makes smoke billow from
  // 0.35u to ~1.7u over its 0.85s life. PlaneGeometry instances scale
  // naturally in world space via setMatrixAt per frame.
  //
  // Why no texture asset: per Karpathy Method — minimum code that solves
  // the problem. The "puff silhouette" comes from the additive overlap
  // of 30 planes at 0.4 opacity each, not from a masked sprite. If the
  // visual is wrong, that's a Phase 7g-4 follow-up, not a guess now.
  const smokeGeometry = new PlaneGeometry(1, 1);
  const smokeMaterial = new MeshBasicMaterial({
    color: DEFAULT_SMOKE_COLOR,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    opacity: 0.4,
  });
  const smokeMesh = new InstancedMesh(smokeGeometry, smokeMaterial, SMOKE_COUNT);
  smokeMesh.frustumCulled = false;

  // --- Group all layers under one parent for easy scene mgmt ---------------
  // IMPORTANT: order matters for test fixtures that read factory.group.children
  // by index. 0=shards, 1=sparks, 2=flash, 3=smoke. Smoke appended LAST so
  // existing flash-at-children[2] tests don't break.
  const group = new Group();
  group.name = 'MissileExplosionFactory';
  group.add(shardMesh, sparkPoints, flashMesh, smokeMesh);
  parentScene.add(group);

  // --- Per-instance buffer attributes for sparks ----------------------------
  // Points needs position (3) + custom aSize (1) + aLife (1) per vertex.
  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  const sparkSizes = new Float32Array(SPARK_COUNT);
  const sparkLifes = new Float32Array(SPARK_COUNT);
  for (let i = 0; i < SPARK_COUNT; i++) {
    sparkPositions[i * 3 + 0] = 0;
    sparkPositions[i * 3 + 1] = 0;
    sparkPositions[i * 3 + 2] = 0;
    sparkSizes[i] = 0.1;
    sparkLifes[i] = 0;
  }
  sparkGeometry.setAttribute('position', new BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute('aSize', new BufferAttribute(sparkSizes, 1));
  sparkGeometry.setAttribute('aLife', new BufferAttribute(sparkLifes, 1));

  // --- Slot pools -----------------------------------------------------------
  const slots: ExplosionSlots = {
    shards: makeShardSlots(),
    sparks: makeSparkSlots(),
    flashes: makeFlashSlots(),
    smoke: makeSmokeSlots(), // Phase 7g-3
    // Scratch dummy for matrix writes (InstancedMesh setMatrixAt needs an Object3D).
    dummy: new Object3D(),
  };

  function applyShardsMatrices(): void {
    const dummy = slots.dummy;
    for (let i = 0; i < SHARD_COUNT; i++) {
      const s = slots.shards[i];
      if (s.alive) {
        dummy.position.set(s.x, s.y, 0);
        dummy.rotation.set(s.rotX, s.rotY, s.rotZ);
        dummy.scale.setScalar(s.scale);
      } else {
        // Park unused slots off-screen with zero scale so they don't render.
        dummy.position.set(0, 0, -1000);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      shardMesh.setMatrixAt(i, dummy.matrix);
    }
    shardMesh.instanceMatrix.needsUpdate = true;
  }

  function applySparkAttributes(): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = slots.sparks[i];
      if (s.alive) {
        const lifeT = 1 - s.age / SPARK_LIFETIME_SECONDS;
        sparkPositions[i * 3 + 0] = s.x;
        sparkPositions[i * 3 + 1] = s.y;
        sparkSizes[i] = s.size;
        sparkLifes[i] = Math.max(0, lifeT);
      } else {
        sparkPositions[i * 3 + 0] = 0;
        sparkPositions[i * 3 + 1] = 0;
        sparkSizes[i] = 0;
        sparkLifes[i] = 0;
      }
    }
    const posAttr = sparkGeometry.attributes.position as BufferAttribute;
    const sizeAttr = sparkGeometry.attributes.aSize as BufferAttribute;
    const lifeAttr = sparkGeometry.attributes.aLife as BufferAttribute;
    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    lifeAttr.needsUpdate = true;
  }

  function applyFlashState(): void {
    const f = slots.flashes[0];
    if (!f.alive) {
      flashMesh.visible = false;
      return;
    }
    flashMesh.visible = true;
    flashMesh.position.set(f.x, f.y, 0);
    // Scale rises fast then fades; opacity peaks early then fades to 0.
    const t = f.age / FLASH_DURATION_SECONDS;
    const rise = Math.min(1, t * 4); // 0→1 over first 25% of lifetime
    const fade = 1 - t; // 1→0 over lifetime
    const scale = 0.2 + (FLASH_MAX_SCALE - 0.2) * rise;
    flashMesh.scale.set(scale, scale, scale);
    flashMaterial.opacity = FLASH_PEAK_OPACITY * fade;
  }

  // Phase 7g-3 — same shape as applyShardsMatrices but with scale growth
  // over lifetime (puffs billow outward). Alive slots get a per-frame
  // matrix; dead slots are parked off-screen at zero scale so they
  // don't render.
  function applySmokeMatrices(): void {
    const dummy = slots.dummy;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const s = slots.smoke[i];
      if (s.alive) {
        const t = s.age / SMOKE_LIFETIME_SECONDS;
        // Scale = initialScale × (base + growth × t). At t=0 the puff is
        // initialScale × base (small); at t=1 it is initialScale × (base
        // + growth) (full size). The growth gives the billowing-puff feel.
        const scale = s.initialScale * (SMOKE_BASE_SCALE + SMOKE_GROWTH_SCALE * t);
        dummy.position.set(s.x, s.y, 0);
        dummy.rotation.set(0, 0, s.rotZ);
        dummy.scale.set(scale, scale, scale);
      } else {
        dummy.position.set(0, 0, -1000);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      smokeMesh.setMatrixAt(i, dummy.matrix);
    }
    smokeMesh.instanceMatrix.needsUpdate = true;
  }

  function spawn(
    position: Vector2,
    velocityDir: Vector2,
    profile: MissileExplosionProfile = DEFAULT_MISSILE_EXPLOSION_PROFILE,
  ): void {
    const intensity = Math.max(0.1, Math.min(1.0, profile.intensity));
    // Count scales with intensity (capped at full pool).
    const shardBudget = Math.floor(SHARD_COUNT * intensity);
    const sparkBudget = Math.floor(SPARK_COUNT * intensity);
    const smokeBudget = Math.floor(SMOKE_COUNT * intensity); // Phase 7g-3

    // Fire the flash first (single slot — fastest reset).
    resetFlash(slots.flashes[0], position.x, position.y);

    // Fire shards in random outward directions, biased along velocityDir.
    // Biased = missile's last-known motion direction (so the debris field
    // "throws forward" — feels like the missile sprayed its contents in
    // flight). Bias weight 0.4 means 40% of the direction vector points
    // along velocityDir (rest is uniform random).
    let shardsFired = 0;
    for (let i = 0; i < SHARD_COUNT && shardsFired < shardBudget; i++) {
      if (slots.shards[i].alive) continue; // skip already-alive
      const dir = randomDirection();
      const bx = dir.x + velocityDir.x * 0.4;
      const by = dir.y + velocityDir.y * 0.4;
      const blen = Math.hypot(bx, by);
      const ndx = blen > 0.01 ? bx / blen : 1;
      const ndy = blen > 0.01 ? by / blen : 0;
      const speed = SHARD_BASE_SPEED + Math.random() * SHARD_SPEED_VARIANCE;
      resetShard(slots.shards[i], position.x, position.y, ndx * speed, ndy * speed);
      shardsFired++;
    }

    // Fire sparks — same bias pattern, faster (these are energy, not mass).
    let sparksFired = 0;
    for (let i = 0; i < SPARK_COUNT && sparksFired < sparkBudget; i++) {
      if (slots.sparks[i].alive) continue;
      const dir = randomDirection();
      const bx = dir.x + velocityDir.x * 0.3;
      const by = dir.y + velocityDir.y * 0.3;
      const blen = Math.hypot(bx, by);
      const ndx = blen > 0.01 ? bx / blen : 1;
      const ndy = blen > 0.01 ? by / blen : 0;
      const speed = SPARK_BASE_SPEED + Math.random() * SPARK_SPEED_VARIANCE;
      resetSpark(slots.sparks[i], position.x, position.y, ndx * speed, ndy * speed);
      sparksFired++;
    }

    // Phase 7g-3 — fire smoke puffs. Lower velocity-bias than sparks (0.2
    // vs 0.3) because smoke drifts more than it flies — the user wants
    // "white smoke" to read as billowing clouds, not a streak.
    let smokeFired = 0;
    for (let i = 0; i < SMOKE_COUNT && smokeFired < smokeBudget; i++) {
      if (slots.smoke[i].alive) continue;
      const dir = randomDirection();
      const bx = dir.x + velocityDir.x * 0.2;
      const by = dir.y + velocityDir.y * 0.2;
      const blen = Math.hypot(bx, by);
      const ndx = blen > 0.01 ? bx / blen : 1;
      const ndy = blen > 0.01 ? by / blen : 0;
      const speed = SMOKE_BASE_SPEED + Math.random() * SMOKE_SPEED_VARIANCE;
      resetSmoke(slots.smoke[i], position.x, position.y, ndx * speed, ndy * speed);
      smokeFired++;
    }

    // Apply current profile to materials.
    shardMaterial.color.setHex(profile.shardColor);
    const innerR = ((profile.sparkInnerColor >> 16) & 0xff) / 255;
    const innerG = ((profile.sparkInnerColor >> 8) & 0xff) / 255;
    const innerB = (profile.sparkInnerColor & 0xff) / 255;
    const outerR = ((profile.sparkOuterColor >> 16) & 0xff) / 255;
    const outerG = ((profile.sparkOuterColor >> 8) & 0xff) / 255;
    const outerB = (profile.sparkOuterColor & 0xff) / 255;
    (sparkMaterial.uniforms.uInnerColor.value as Vector3).set(innerR, innerG, innerB);
    (sparkMaterial.uniforms.uOuterColor.value as Vector3).set(outerR, outerG, outerB);
    flashMaterial.color.setHex(profile.flashColor);

    // Push initial state to GPU so the explosion is visible IMMEDIATELY
    // (before the first update tick). Without this, the flash mesh stays
    // hidden for one frame because applyFlashState only runs from update().
    applyShardsMatrices();
    applySparkAttributes();
    applyFlashState();
    applySmokeMatrices(); // Phase 7g-3 — same reason as the others above
  }

  function update(deltaTime: number): void {
    const dragShard = Math.pow(SHARD_DRAG, deltaTime);
    const dragSpark = Math.pow(SPARK_DRAG, deltaTime);
    const dragSmoke = Math.pow(SMOKE_DRAG, deltaTime); // Phase 7g-3

    // Shards: integrate position + rotation, apply drag, age out.
    for (let i = 0; i < SHARD_COUNT; i++) {
      const s = slots.shards[i];
      if (!s.alive) continue;
      s.age += deltaTime;
      if (s.age >= SHARD_LIFETIME_SECONDS) {
        s.alive = false;
        continue;
      }
      s.x += s.vx * deltaTime;
      s.y += s.vy * deltaTime;
      s.vx *= dragShard;
      s.vy *= dragShard;
      s.rotX += s.rotVx * deltaTime;
      s.rotY += s.rotVy * deltaTime;
      s.rotZ += s.rotVz * deltaTime;
    }

    // Sparks: integrate, apply drag, age out. No rotation (they're billboards).
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = slots.sparks[i];
      if (!s.alive) continue;
      s.age += deltaTime;
      if (s.age >= SPARK_LIFETIME_SECONDS) {
        s.alive = false;
        continue;
      }
      s.x += s.vx * deltaTime;
      s.y += s.vy * deltaTime;
      s.vx *= dragSpark;
      s.vy *= dragSpark;
    }

    // Phase 7g-3 — Smoke: integrate, apply drag, age out. No rotation update
    // (rotZ is fixed at spawn — keeps the per-frame loop cheap; the puffs
    // grow via scale not via spin). Same shape as the sparks loop, just
    // different constants and a longer lifetime (0.85s vs 0.45s).
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const s = slots.smoke[i];
      if (!s.alive) continue;
      s.age += deltaTime;
      if (s.age >= SMOKE_LIFETIME_SECONDS) {
        s.alive = false;
        continue;
      }
      s.x += s.vx * deltaTime;
      s.y += s.vy * deltaTime;
      s.vx *= dragSmoke;
      s.vy *= dragSmoke;
    }

    // Flash: single slot, age-driven scale + opacity curve.
    const f = slots.flashes[0];
    if (f.alive) {
      f.age += deltaTime;
      if (f.age >= FLASH_DURATION_SECONDS) {
        f.alive = false;
      }
    }

    applyShardsMatrices();
    applySparkAttributes();
    applyFlashState();
    applySmokeMatrices(); // Phase 7g-3
  }

  function dispose(): void {
    parentScene.remove(group);
    shardGeometry.dispose();
    shardMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    flashGeometry.dispose();
    flashMaterial.dispose();
    smokeGeometry.dispose(); // Phase 7g-3
    smokeMaterial.dispose(); // Phase 7g-3
    if (shardMesh.dispose) shardMesh.dispose();
    if (smokeMesh.dispose) smokeMesh.dispose(); // Phase 7g-3
  }

  function hasActiveParticles(): boolean {
    for (const s of slots.shards) if (s.alive) return true;
    for (const s of slots.sparks) if (s.alive) return true;
    for (const f of slots.flashes) if (f.alive) return true;
    for (const s of slots.smoke) if (s.alive) return true; // Phase 7g-3
    return false;
  }

  return { group, spawn, update, dispose, hasActiveParticles };
}