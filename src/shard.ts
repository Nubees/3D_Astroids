import { BURST_INTERVAL_SECONDS, BURST_SCHEDULE, FIRST_BURST_DELAY_SECONDS, ShardState, Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shard Logic (Phase 6 Shard Swarm + Phase 6b Fracture Cascade)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure data + math for crystal-shard homing projectiles.
// Setup: Imported by src/game.ts. Game owns the Three.js meshes; this module
//        owns the data, motion, and lifetime logic.
// Issues: Homing turns can oscillate if you snap angle directly to the target.
// Fix:  Use a clamped turn rate (SHARD_TURN_RATE) and integrate velocity from
//       the steered angle each frame. Velocity magnitude is preserved.
//       Wrap-around: shortest signed delta between angles via atan2.
// Gotchas:
//  - createShard initializes homingDelay = SHARD_HOMING_DELAY so shards fan out
//    before steering — without this delay the swarm collides at the spawn point.
//  - MAX_SHARDS = 64 hard cap to prevent runaway arrays if update logic misses
//    culling (defensive — game.ts also prunes). Phase 6b bumped from 32 → 64 to
//    leave headroom for two cascading bursts to overlap.
//  - isShardDead uses the arena bounds radius; shards that leave the play area
//    are culled without dealing damage.
//  - shard↔ship collision uses circlePointCollide from src/utils/collision.ts;
//    not duplicated here to keep this module pure.
//  - ShardState.crystalId is the source-of-truth for which crystal spawned the
//    shard. -1 is reserved for non-crystal shards (none exist after Phase 6b
//    deletes spawnCrystalShards). Game uses this for the absorbed-counter map
//    that gates the PERFECT bonus.
//  - BURST_SCHEDULE + constants are re-exported here so callers can import from
//    one place; types.ts remains the single source of truth.
// ═══════════════════════════════════════════════════════════════════════════

export { BURST_INTERVAL_SECONDS, BURST_SCHEDULE, FIRST_BURST_DELAY_SECONDS };

export const MAX_SHARDS = 64;
export const SHARD_SPEED = 9.0;
export const SHARD_LIFETIME = 2.5;
export const SHARD_HOMING_DELAY = 0.4;
// 120° per second, in radians.
export const SHARD_TURN_RATE = (Math.PI * 2) / 3;
export const SHARD_RADIUS = 0.22;
export const SHARDS_PER_CRYSTAL = 8;

export function createShard(spawnPosition: Vector2, angle: number, crystalId = -1): ShardState {
  return {
    position: { x: spawnPosition.x, y: spawnPosition.y },
    velocity: {
      x: Math.cos(angle) * SHARD_SPEED,
      y: Math.sin(angle) * SHARD_SPEED,
    },
    angle,
    targetAngle: angle,
    homingDelay: SHARD_HOMING_DELAY,
    lifetime: SHARD_LIFETIME,
    maxLifetime: SHARD_LIFETIME,
    crystalId,
  };
}

/**
 * Return the shard count for a given burst-schedule index. Out-of-range inputs
 * are clamped: negatives return the first step (1 shard), values past the last
 * step return the saturation cap (24 shards). This makes the helper safe to
 * call with computed indices without an explicit bounds check.
 */
export function shardCountForBurstIndex(i: number): number {
  if (i < 0) return BURST_SCHEDULE[0];
  const lastIndex = BURST_SCHEDULE.length - 1;
  if (i > lastIndex) return BURST_SCHEDULE[lastIndex];
  return BURST_SCHEDULE[i];
}

/**
 * Wrap an angle into [-π, π].
 */
function wrapAngle(angle: number): number {
  // Normalize to [-π, π].
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Steer a current angle toward a target angle, clamped by turnRate * deltaTime.
 */
function steerAngle(current: number, target: number, turnRate: number, deltaTime: number): number {
  const delta = wrapAngle(target - current);
  const maxStep = turnRate * deltaTime;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/**
 * Per-frame update. Steers toward `shipPosition` once homingDelay elapses.
 * Mutates the shard in place — caller owns the array.
 */
export function updateShard(shard: ShardState, deltaTime: number, shipPosition: Vector2): void {
  if (shard.homingDelay > 0) {
    shard.homingDelay -= deltaTime;
  }

  if (shard.homingDelay <= 0) {
    shard.targetAngle = Math.atan2(
      shipPosition.y - shard.position.y,
      shipPosition.x - shard.position.x,
    );
    shard.angle = steerAngle(shard.angle, shard.targetAngle, SHARD_TURN_RATE, deltaTime);
    shard.velocity = {
      x: Math.cos(shard.angle) * SHARD_SPEED,
      y: Math.sin(shard.angle) * SHARD_SPEED,
    };
  }

  shard.position = {
    x: shard.position.x + shard.velocity.x * deltaTime,
    y: shard.position.y + shard.velocity.y * deltaTime,
  };
  shard.lifetime -= deltaTime;
}

export function isShardDead(shard: ShardState, boundsRadius: number): boolean {
  if (shard.lifetime <= 0) return true;
  const outOfBounds = Math.hypot(shard.position.x, shard.position.y) > boundsRadius;
  return outOfBounds;
}

/**
 * Generate evenly-spaced spawn angles around the crystal center, with a small
 * random jitter so the swarm doesn't look mechanical.
 */
export function generateShardSpawnAngles(count: number, jitter: number): number[] {
  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = (i / count) * Math.PI * 2;
    const j = (Math.random() - 0.5) * jitter;
    angles.push(base + j);
  }
  return angles;
}