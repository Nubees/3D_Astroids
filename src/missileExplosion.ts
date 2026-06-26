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

const SHARD_COUNT = 50;
const SPARK_COUNT = 80;
const FLASH_DURATION_SECONDS = 0.10;
const SHARD_LIFETIME_SECONDS = 0.60;
const SPARK_LIFETIME_SECONDS = 0.45;
const FLASH_MESH_RADIUS = 0.40;

const SHARD_BASE_SPEED = 7.0; // mean outward velocity (u/s)
const SHARD_SPEED_VARIANCE = 4.0;
const SHARD_TUMBLE_RATE = 12.0; // rad/s on each axis
const SHARD_DRAG = 0.92; // per-second velocity multiplier (decay)

const SPARK_BASE_SPEED = 11.0;
const SPARK_SPEED_VARIANCE = 6.0;
const SPARK_DRAG = 0.85;

const FLASH_MAX_SCALE = 1.4;
const FLASH_PEAK_OPACITY = 0.55;
const FLASH_COLOR = 0xfff5cc; // warm white

const DEFAULT_SHARD_COLOR = 0x222222; // dark grey, NON-additive
const DEFAULT_SPARK_COLOR_INNER = 0xfff2a8; // warm yellow
const DEFAULT_SPARK_COLOR_OUTER = 0xffffff; // white core

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

interface ExplosionSlots {
  shards: ShardSlot[];
  sparks: SparkSlot[];
  flashes: FlashSlot[];
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
  slot.size = 0.08 + Math.random() * 0.06; // 0.08..0.14u sprite
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
    gl_PointSize = aSize * 200.0 * aLife / -mvPosition.z;
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
    float core = pow(1.0 - r, 2.5);
    vec3 col = mix(uOuterColor, uInnerColor, vLife);
    gl_FragColor = vec4(col * core * vLife, core * vLife);
  }
`;

export function createMissileExplosionFactory(parentScene: Object3D): ExplosionFactory {
  // --- SHARDS layer (InstancedMesh) ----------------------------------------
  const shardGeometry = new TetrahedronGeometry(1, 0); // unit, scaled per-instance
  const shardMaterial = new MeshStandardMaterial({
    color: DEFAULT_SHARD_COLOR,
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

  // --- Group all layers under one parent for easy scene mgmt ---------------
  const group = new Group();
  group.name = 'MissileExplosionFactory';
  group.add(shardMesh, sparkPoints, flashMesh);
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

  function spawn(
    position: Vector2,
    velocityDir: Vector2,
    profile: MissileExplosionProfile = DEFAULT_MISSILE_EXPLOSION_PROFILE,
  ): void {
    const intensity = Math.max(0.1, Math.min(1.0, profile.intensity));
    // Count scales with intensity (capped at full pool).
    const shardBudget = Math.floor(SHARD_COUNT * intensity);
    const sparkBudget = Math.floor(SPARK_COUNT * intensity);

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
  }

  function update(deltaTime: number): void {
    const dragShard = Math.pow(SHARD_DRAG, deltaTime);
    const dragSpark = Math.pow(SPARK_DRAG, deltaTime);

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
  }

  function dispose(): void {
    parentScene.remove(group);
    shardGeometry.dispose();
    shardMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    flashGeometry.dispose();
    flashMaterial.dispose();
    if (shardMesh.dispose) shardMesh.dispose();
  }

  function hasActiveParticles(): boolean {
    for (const s of slots.shards) if (s.alive) return true;
    for (const s of slots.sparks) if (s.alive) return true;
    for (const f of slots.flashes) if (f.alive) return true;
    return false;
  }

  return { group, spawn, update, dispose, hasActiveParticles };
}