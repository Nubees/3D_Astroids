import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { InputManager, InputState } from './input';
import { ShipSelection } from './ship-select';
import { Ship, SHIELD_RADIUS, SHIP_RADIUS } from './ship';
import { createProjectile, PROJECTILE_LIFETIME, PROJECTILE_RADIUS, updateProjectile } from './projectile';
import { attachGameplayFlames, toggleFlames } from './exhaust-gameplay';
import {
  AsteroidSize,
  AsteroidKind,
  CrystalMeshUserData,
  SIZE_RADIUS,
  createAsteroidMesh,
  createAsteroidState,
  disposeAsteroidMesh,
  resolveAsteroidCollision,
  shouldCrystalFracture,
  splitAsteroid,
  splitSmallAsteroid,
  swapToFracturedMaterial,
} from './asteroid';
import { disposeVideoAsteroidResources, tickVideoAsteroid } from './video-asteroid';
import {
  MAX_SHARDS,
  SHARD_RADIUS,
  SHARDS_PER_CRYSTAL,
  createShard,
  generateShardSpawnAngles,
  isShardDead,
  shardCountForBurstIndex,
  updateShard,
} from './shard';
import { createShardMesh, orientShard } from './shard-mesh';
import { circlesCollide, resolveShipAsteroidBounce } from './utils/collision';
import {
  AsteroidState,
  BreatherZoneState,
  CLUTCH_WINDOW_SECONDS,
  Projectile as ProjectileState,
  SATURATION_DURATION_SECONDS,
  ScrapState,
  ShardState,
  ULTRA_CLEAN_WINDOW_SECONDS,
  Vector2,
} from './types';
import {
  CrystalBoltSparks,
  CrystalFractureScheduler,
  CrystalLightning,
  computeTimeBonusTier,
  createBurstTelegraph,
  createFracturedMaterial,
  crystalCharge,
  getBurstFlash,
  getHeartbeatPhase,
  isClutchApplicable,
  isPerfectApplicable,
  TELEGRAPH_DURATION_SECONDS,
  updateFracturedMaterialTelegraph,
} from './crystal-fx';
import { Shockwave, updateShockwaves } from './shockwave';
import {
  FREEZE_FRAME_TICKS,
  PUNCH_ZOOM_DURATION_SECONDS,
  SCREEN_FLASH_DURATION_SECONDS,
  SCREEN_FLASH_OPACITY,
} from './bomb-timing';
import { ArenaMovementController } from './movement/arena-controller';
import {
  ShieldState,
  absorbHit,
  absorbShardHit,
  createShieldState,
  shieldColor,
  shieldPercent,
  SHIELD_MAX_ENERGY,
  updateShield,
} from './shield';
import {
  DamageParticle,
  ExplosionParticle,
  SparkArc,
  createDamageParticle,
  createExplosionParticle,
  createSparkArc,
  disposeAllDamageParticles,
  disposeAllExplosionParticles,
  disposeAllSparkArcs,
  randomHullPoint,
  updateDamageParticles,
  updateExplosionParticles,
  updateSparkArcs,
} from './ship-damage';
import {
  WaveState,
  awardBreak,
  createWaveState,
  getAsteroidBaseSpeed,
  getSpawnInterval,
  updateWave,
} from './waves';
import {
  MAGNET_RADIUS,
  createScrap,
  isScrapCollected,
  isScrapExpired,
  magnetPull,
  scrapDropChance,
  updateScrap,
} from './scrap';
import {
  BREATHER_METER_COST,
  BREATHER_SCORE_MULTIPLIER,
  createBreatherZoneState,
  isInsideBreatherZone,
  updateBreather,
} from './breather';
import { createBloomComposer } from './post-processing';
import {
  addShieldImpact,
  clearShieldImpacts,
  createShieldMesh as createShieldVisualMesh,
  setShieldEnergy,
  updateShieldVisuals,
} from './shield-visuals';
import { createChargeUpRing, updateChargeUpRing } from './orbit-drone-vfx';
import {
  ActiveAmmoMap,
  ACTIVE_KIND_SPECS,
  ActivePickupEffect,
  BOMB_STRIKE_DAMAGE,
  BOMB_STRIKE_RADIUS,
  HOMING_MISSILES_DAMAGE,
  ORBIT_DRONES_CHARGE_UP_HOLD_SECONDS,
  ORBIT_DRONES_COOLDOWN_SECONDS,
  ORBIT_DRONES_DURATION_SECONDS,
  PICKUP_BOB_AMPLITUDE,
  PICKUP_BOB_FREQUENCY_HZ,
  PICKUP_COLOR,
  PICKUP_EMISSIVE_PULSE_AMPLITUDE,
  PICKUP_EMISSIVE_PULSE_FREQUENCY_HZ,
  PICKUP_HALO_BASE_OPACITY,
  PICKUP_HALO_PROXIMITY_BOOST,
  PICKUP_SONAR_RING_PERIOD_SECONDS,
  PICKUP_SPIN_AXIS,
  HOMING_MISSILES_TINY_KNOCKBACK_SPEED, // Phase 7f-2 — tiny-knockback impulse speed
  PickupKind,
  PickupState,
  applyActivePickupEffect,
  applyPickupEffect,
  canFireActive,
  consumeActiveCharge,
  createEmptyActiveAmmo,
  createPickupMesh,
  createPickupState,
  disposePickupMesh,
  isPickupCollected,
  isPickupExpired,
  maybeDropPickup,
  tickActiveAmmo,
  updatePickup,
  KillSource, // Phase 7c — tagged kill source for the split rule
} from './pickups';
import { shouldSplitForKillSource } from './game-helpers';
import {
  DroneDeploymentState,
  HomingMissileState,
  VolleySchedule,
  clearDroneBeam, // Phase 7i-2 hotfix — hide beam mesh + clear target on hit
  scheduleMissileVolley,
  spawnDroneDeployment,
  tickDroneDeployments,
  tickHomingMissiles,
  tickMissileVolleySchedules,
} from './active-deployments';
import {
  disposeShockwaveParticles,
  emitShockwaveParticles,
  updateShockwaveParticles,
} from './shockwave-particles';
import { disposeMissileVfx, updateMissileSmoke } from './missile-vfx';
import {
  setShieldBoostColor,
  setShieldBoostPulse,
  tickShieldFlare,
  triggerShieldFlare,
} from './shield-visuals';
// Phase 7f — Magnet Booster. Renamed the imported effectiveMagnetRadius to
// effectiveMagnetRadiusFromState because the Game class adds its own getter
// with the same name; importing both as `effectiveMagnetRadius` triggers a
// TypeScript duplicate-identifier error.
import {
  MAGNET_BOOSTER_DURATION_SECONDS,
  MagnetBoosterState,
  activateMagnetBooster,
  activeRemainingSeconds,
  collectMagnetBooster,
  createMagnetBooster,
  effectiveMagnetRadius as effectiveMagnetRadiusFromState,
  tickMagnetBooster,
} from './magnet-booster';
import {
  createActiveField,
  createActiveRing,
  updateActiveField,
  updateActiveRing,
} from './magnet-booster-vfx';
import { createMissileExplosionFactory } from './missileExplosion';
import {
  createDroneKillSparks,
  tickDroneKillSparks,
  DroneKillSparks,
} from './drone-kill-sparks';

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7i-2 (Task 9) — Beam-vs-Asteroid Geometry Helpers
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: pure functions for the new beam intersection check. Free functions
//          (not methods) so the per-frame hot loop in handleCollisions can
//          call them without `this` binding. Pure means: no scene access, no
//          drone state, no allocations beyond the return value.
// Setup:   pointToSegmentDistance(px, py, ax, ay, bx, by) returns the
//          minimum distance from point (px,py) to the line segment
//          (ax,ay)→(bx,by). BEAM_HIT_RADIUS is the per-asteroid forgiveness
//          around the line (the visual beam is 1px wide, so the gameplay
//          hit radius must be much larger or the player will perceive the
//          beam as missing asteroids that the segment technically touches).
//          Both are imported into handleCollisions below.
// Issues:  None — both helpers are < 10 lines of pure math, no side effects.
// Fix:     Phase 7i-2 Task 9. taskToSegmentDistance is a textbook
//          parametric projection (clamp t to [0,1] for a finite segment,
//          fall back to point-to-point distance when the segment
//          degenerates). BEAM_HIT_RADIUS = 0.3 matches the visual beam
//          width perceived at the canvas resolution the user plays at —
//          tight enough that a beam aimed off-center misses, generous
//          enough that the player doesn't feel cheated when the beam
//          visually overlaps an asteroid edge.
// Gotchas: We do NOT export these (the existing per-frame math in
//          handleCollisions is the only call site). If a future task
//          needs them in tests, promote to a separate src/geometry.ts
//          module rather than scattering copy-pastes — the per-frame hot
//          loop is performance-sensitive and we'd rather not import a
//          module-scope helper that's only used here.
// ═══════════════════════════════════════════════════════════════════════════
const BEAM_HIT_RADIUS = 0.3;

function pointToSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Game Loop
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Own the Three.js scene, camera, renderer, and update/render loop.
// Setup: Created with a canvas element; starts via requestAnimationFrame.
// Issues: Phase 1 hard-coded arena movement inside Game.ts.
// Fix: Phase 2 extracted an ArenaMovementController strategy; drift was tested
//      but the user decided to lock Arena as the main movement identity.
// Gotchas: The MovementController abstraction is kept so drift can return as a
//          variant mode later. Camera stays static at the world origin in Arena.
//          Shield is a panic button with energy and cooldown. Wave pacing
//          increases spawn rate and asteroid speed over time. Phase 4 adds scrap
//          drops and a deployable Breather Zone that recharges shield, doubles
//          score, labels the zone with floating text, and slows/repels asteroids.
//          Asteroids now spawn from all arena edges; every 4th spawn is targeted
//          at the player and ignores asteroid-vs-asteroid bounces, while other
//          asteroids bounce off each other with larger asteroids acting as walls.
//          Ship movement is now inertia-based with arena-boundary bounce. Shield
//          knockback reflects the ship off the impact like an elastic bounce. When
//          the shield is depleted the ship explodes into particles, the screen is
//          cleared of threats, and the player must press a key and wait through a
//          3-second countdown before respawning.
//
//          Phase 7f adds the Magnet Booster — a 4th active pickup with a dedicated
//          state machine in src/magnet-booster.ts (pendingTier / activeTier /
//          activeUntil). The Game owns a magnetBooster state field, an
//          active ring (pulses during the 10s activation window) and an
//          active field disk (green, shield-style); both are children of shipMesh
//          so they inherit position + rotation. The effectiveMagnetRadius getter
//          wraps the state-machine function so every per-frame call site
//          (updateScrap, updatePickups, updateMagnetRing) reads the current
//          radius through one accessor. Active input dispatches Digit4 directly
//          to activateMagnetBooster (chargeCap=0 so the ammo/charge path is
//          inert). HUD 4th slot reconciles 3 visual states (empty / pending /
//          active) from pendingTier + activeTier — Task 7 supplies the .empty /
//          .pending / .active CSS classes; this task sets className + countLabel
//          text + bar fill so the DOM state is correct.
//
//          Phase 7i-2 (Task 9) DELTA — beam-vs-asteroid hit detection. Two
//          free functions added at module scope: pointToSegmentDistance
//          (textbook parametric projection, < 10 lines, pure) and the
//          BEAM_HIT_RADIUS = 0.3 constant (the per-asteroid forgiveness
//          around the beam line). The per-frame intersection check lives
//          at the end of handleCollisions (after the per-asteroid loop
//          prunes this.asteroids): for each active deployment with
//          dep.fadeTimer === 0, for each drone with a non-null
//          currentBeamTarget and beamLine.visible, the loop tests each
//          asteroid via pointToSegmentDistance(asteroid, drone, target)
//          <= BEAM_HIT_RADIUS + SIZE_RADIUS[size]. A hit invokes
//          dep.beamHitCallback (set in useActiveItem to the bound
//          onDroneBeamHitAsteroid method) and sets drone.beamHasHitTarget
//          = true so subsequent frames within the same 0.25s beam window
//          short-circuit. onDroneBeamHitAsteroid is the single damage
//          path: TINY asteroids get a knockback impulse away from the
//          ship at HOMING_MISSILES_TINY_KNOCKBACK_SPEED (same pattern
//          as the homing-missile TINY path at lines 1976-1991), non-TINY
//          get spawnDroneKillSparks(position) + destroyAsteroid(live,
//          'DRONE') which sets source to 'DRONE' so the kill-source
//          rule in shouldSplitForKillSource skips splitAsteroid (1 shot
//          = 1 kill, no children). KillSource is a type union, not an
//          enum, so the string literal 'DRONE' is the correct dispatch
//          (the existing onMissileImpact uses 'MISSILE' the same way).
//          The intersection check is placed AFTER the per-asteroid
//          projectile loop so any projectile-driven destruction has
//          already pruned the asteroid list, and the check sees the
//          post-prune list. fade-out branches (dep.fadeTimer > 0) skip
//          the check entirely so a fading deployment cannot deal damage
//          to a freshly-pruned survivor.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_DELTA_TIME = 0.1;
const MAX_BURSTS_PER_FRAME = 1;
const CAMERA_SHAKE_MAX_AMPLITUDE = 0.20;
const CAMERA_SHAKE_HALF_LIFE = 0.1;
const CRYSTAL_DEATH_TWEEN_DURATION = 0.4;
const CRYSTAL_DEATH_TWEEN_POOL_CAP = 8;

interface LiveAsteroid {
  state: AsteroidState;
  mesh: Group;
  // Stable per-instance id. Monotonically increasing counter assigned at
  // spawn time. Crystals use this as the scheduler key; non-crystal
  // asteroids ignore it. Required because array indices are not stable
  // across frames (culled entries get spliced out).
  readonly id: number;
}

interface LiveProjectile {
  state: ProjectileState;
  mesh: Mesh;
}

interface LiveShard {
  state: ShardState;
  mesh: Mesh;
}

interface LiveScrap {
  state: ScrapState;
  mesh: Mesh;
}

interface LivePickup {
  state: PickupState;
  mesh: Group;
}

interface ActiveHudIcon {
  container: HTMLDivElement;
  nameLabel: HTMLDivElement;   // small-font addon name header ("BOMB" / "DRONES" / "MISSILES")
  countLabel: HTMLDivElement;
  bar: HTMLDivElement;
  stateLabel: HTMLDivElement; // "READY" / "COOLDOWN" / "DEPLOYED" / "EMPTY"
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — PassivePill Interface (Phase 7 Bug Fix 2026-06-24)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Cache the pill's child DOM refs at creation time so the per-frame
//           HUD reconcile loop can update label/time/bar WITHOUT re-querying
//           the DOM with `pill.querySelector(...)`. The previous version set
//           `pill.dataset.labelId` on the pill itself but then queried for it
//           as a *child* selector — the children never received those dataset
//           attributes, so `querySelector` returned null and the next
//           `timeLabel.textContent = ...` threw a TypeError that froze the
//           game loop the first time a passive pickup was collected.
// Setup:    Created in the same place the pill DOM was built (updateHud,
//           inner-loop creation branch). Consumed by the update branch of
//           the same loop, which used to read child refs via querySelector.
// Issues:   Pre-fix bug was a TypeScript type-assertion lie: `as HTMLDivElement`
//           hid the null at compile time. Replacing it with a real cached ref
//           makes the runtime failure impossible.
// Fix:      2026-06-24 — replace `querySelector` + `as` cast with a typed
//           ref captured at creation. Mirrors the ActiveHudIcon pattern
//           already in this file (container/countLabel/bar/stateLabel).
// Gotchas:  Keep `pill` in this struct even though it is unused at update time
//           — tests or future features may need it for positioning.
// ═══════════════════════════════════════════════════════════════════════════
interface PassivePill {
  pill: HTMLDivElement;
  label: HTMLDivElement;
  timeLabel: HTMLDivElement;
  bar: HTMLDivElement;
}

interface FloatingText {
  element: HTMLDivElement;
  age: number;
  duration: number;
  baseX: number;
  baseY: number;
}

interface CrystalDeathTween {
  mesh: Group;
  fracturedMaterial: MeshStandardMaterial;
  age: number;
  duration: number;
  position: Vector2;
}

interface PendingTelegraph {
  mesh: import('three').LineSegments;
  position: Vector2;
  angles: readonly number[];
  spawnAt: number;
  count: number;
}

export class Game {
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly input: InputManager;
  private readonly shipMesh: Group;
  private readonly shipId: number;
  private readonly ship: Ship;
  private readonly starfield: Points;
  private readonly shieldMesh: Mesh;
  private readonly magnetRing: Mesh;
  private readonly breatherMesh: Mesh;
  // Phase 7f — Magnet Booster state + visuals. Active ring + green field
  // disk pulse during the 10s activation window (activeTier>0). Both are
  // children of shipMesh so they inherit ship position + rotation; both
  // default to visible=false so they
  // never appear on a fresh game start.
  private magnetBooster: MagnetBoosterState = createMagnetBooster();
  private readonly magnetActiveRing: Mesh = createActiveRing();
  private readonly magnetActiveField: Mesh = createActiveField();
  private readonly shield: ShieldState;
  private readonly wave: WaveState;
  private readonly breather: BreatherZoneState;
  private projectiles: LiveProjectile[] = [];
  private asteroids: LiveAsteroid[] = [];
  private activeShards: LiveShard[] = [];
  private crystalsSpawnedThisRun: number = 0;
  private crystalsSpawnedThisWave: number = 0;
  private scrap: LiveScrap[] = [];
  private readonly controller: ArenaMovementController;
  // Phase 6c3: bloom disabled. The factory returns a stub with composer: null.
  // Kept as a field so the call sites don't need to change; null guards before use.
  private readonly bloomComposer: EffectComposer | null;
  private lastTime = 0;
  private running = true;
  private gameTimeSeconds = 0;
  private clockPaused = false;
  private fractureSchedulers = new Map<number, CrystalFractureScheduler>();
  private crystalDeathTimes = new Map<number, number>();
  private crystalShardsAbsorbed = new Map<number, number>();
  private crystalDeathTweens: CrystalDeathTween[] = [];
  private crystalBolts = new Map<number, CrystalLightning>();
  // Per-crystal spark particle pools. One Points draw call per fractured
  // crystal on screen — disposed with the crystal in destroyCrystal.
  private crystalSparks = new Map<number, CrystalBoltSparks>();
  private activeShockwaves: Shockwave[] = [];
  // Phase 7 — pickup subsystem.
  private pickups: LivePickup[] = [];
  private activeEffects: ActivePickupEffect[] = [];
  private activeAmmo: ActiveAmmoMap = createEmptyActiveAmmo();
  private activeDeployments: DroneDeploymentState[] = [];
  private homingMissiles: HomingMissileState[] = [];
  // Phase 7g — missile-destroyed explosion factory. Pre-allocates 50
  // shards + 80 sparks + 1 flash sphere; reused across all detonations.
  // The factory is created in the constructor and disposed in stop().
  private missileExplosionFactory: ReturnType<typeof createMissileExplosionFactory> | null = null;
  // Phase 7i Sprint 2 Task 6 — drone-kill sparks. Spawned when a drone-
  // tagged projectile (projectile.state.source === 'DRONE') destroys an
  // asteroid. Each entry is a 12-sprite additive burst that lives 0.4s
  // before the tick path removes its sprites and disposes its materials.
  private droneKillSparks: DroneKillSparks[] = [];
  private pickupHudElement: HTMLDivElement | null = null;
  private pickupHudPills: Map<PickupKind, PassivePill> = new Map();
  private activeHudElement: HTMLDivElement | null = null;
  private activeHudIcons: Map<PickupKind, ActiveHudIcon> = new Map();
  private pendingTelegraphs: PendingTelegraph[] = [];
  private cameraShakeAmplitude = 0;
  private cameraShakeRemaining = 0;
  private isCrystalBurstFrame = false;
  // Rotating 0/1/2/3 counter used to give each crystal-kill floating text a
  // distinct vertical starting offset so simultaneous kills don't all stack
  // at the same y-pixel. Wraps at 4 (i.e. +0/+30/+60/+90px) which is enough
  // for the realistic max simultaneous kills.
  private crystalKillIndex = 0;
  // Phase 7b — staggered missile schedules. Each press of Digit3 pushes a
  // VolleySchedule onto this list; tickMissileVolleySchedules drains it over
  // the next 540ms, promoting pending missiles into homingMissiles as their
  // per-missile delay expires. Empty when no fire is in flight.
  private missileVolleySchedules: VolleySchedule[] = [];
  // Phase 7b — shockwave-particle InstancedMesh has been added to the scene
  // (so the per-frame update path doesn't re-attach it). Tracks the boolean
  // for the safety check inside emitShockwaveParticles.
  private shockwaveParticlesAttached = false;
  // Phase 7b — hot core flash meshes for the Bomb Strike's layer 1 visual.
  // Each entry ages over `duration`; when the tween ends, the mesh is
  // removed and its geometry/material disposed. Kept as an array so multiple
  // queued bombs can flash concurrently (3 charges × 100ms ≈ 3 in flight).
  private activeCoreFlashes: { mesh: Mesh; age: number; duration: number }[] = [];
  // Phase 7b — singleton DOM element for the Bomb Strike's screen-edge flash.
  // Created lazily on first bomb so the div does not appear in the DOM
  // unless the player has used a bomb; removed by stop() during cleanup.
  private bombEdgeFlashElement: HTMLDivElement | null = null;
  // Phase 7c — Bomb Strike 3-phase time sequence: screen flash, freeze-frame,
  // and CSS punch-zoom. Each is a countdown (seconds or ticks) decremented in
  // updateBombVisuals; the DOM/CSS classes are added at fire time and removed
  // when the countdown hits zero. The screen-flash div is created lazily on
  // first bomb; the canvas wrapper is resolved from the canvas's parentNode.
  private screenFlashElement: HTMLDivElement | null = null;
  private screenFlashRemaining = 0;
  private freezeFramesRemaining = 0;
  private punchZoomRemaining = 0;
  private nextAsteroidId = 1;
  private lastWaveNumber = 1;
  private readonly resizeHandler: () => void;
  private scoreElement: HTMLDivElement | null = null;
  private waveElement: HTMLDivElement | null = null;
  private breatherElement: HTMLDivElement | null = null;
  private shieldElement: HTMLDivElement | null = null;
  private resumeElement: HTMLDivElement | null = null;
  private activeFloatingTexts: FloatingText[] = [];
  private activeExplosions: ExplosionParticle[] = [];
  private activeDamageParticles: DamageParticle[] = [];
  private activeSparks: SparkArc[] = [];
  private breatherWasActive = false;
  private asteroidSpawnCount = 0;
  private shieldShakeRemaining = 0;
  private lowShieldDebrisTimer = 0;
  private sparkTimer = 0;
  private shipRespawnDelay = 0;
  private countdownTimer = 0;
  private respawnPhase: 'none' | 'exploding' | 'pressKey' | 'countdown' = 'none';

  private constructor(canvas: HTMLCanvasElement, entryId: number, shipMesh: Group) {
    this.shipId = entryId;
    this.scene = new Scene();
    this.scene.background = new Color(0x050510);

    // Phase 7g — missile-destroyed explosion factory (creates the 131-slot
    // pool: 50 shards + 80 sparks + 1 flash sphere). Called BEFORE any
    // other scene-add so the explosion group lives at a stable layer index.
    this.missileExplosionFactory = createMissileExplosionFactory(this.scene);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = 20;

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.bloomComposer = createBloomComposer(this.renderer, this.scene, this.camera).composer;

    this.scene.add(new AmbientLight(0x404040, 1.5));
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(10, 10, 10);
    this.scene.add(sun);

    const rim = new DirectionalLight(0x445566, 0.8);
    rim.position.set(-10, -5, -5);
    this.scene.add(rim);

    this.starfield = createStarfield();
    this.scene.add(this.starfield);

    this.input = new InputManager();

    this.ship = new Ship(0, 0);
    this.shipMesh = shipMesh;
    this.scene.add(this.shipMesh);

    this.shield = createShieldState();
    this.shieldMesh = createShieldVisualMesh(SHIELD_RADIUS);
    this.shipMesh.add(this.shieldMesh);

    this.magnetRing = createMagnetRing();
    this.shipMesh.add(this.magnetRing);

    // Phase 7f — attach active ring + green field disk to the ship group so
    // they inherit the ship's position + rotation. Both default to
    // visible=false at construction (see createActiveRing / createActiveField
    // in magnet-booster-vfx.ts), so a fresh game start shows no extra rings.
    // 2026-06-26 v2 — preview ring removed; pending state is HUD-only.
    this.shipMesh.add(this.magnetActiveRing);
    this.shipMesh.add(this.magnetActiveField);
    this.magnetActiveRing.visible = false;
    this.magnetActiveField.visible = false;

    this.breather = createBreatherZoneState();
    this.breatherMesh = createBreatherMesh();
    this.breatherMesh.visible = false;
    this.scene.add(this.breatherMesh);

    this.wave = createWaveState();
    this.controller = new ArenaMovementController();

    this.resizeHandler = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.bloomComposer) this.bloomComposer.setSize(w, h);
      // Phase 6c follow-up: Line2 + LineMaterial needed the viewport
      // resolution in pixels to compute screen-space line thickness. The
      // Phase 6d CrystalLightning class keeps setResolution as a no-op so
      // this loop still compiles but does nothing — kept for API compat.
      for (const bolt of this.crystalBolts.values()) {
        bolt.setResolution(w, h);
      }
    };
    window.addEventListener('resize', this.resizeHandler);

    this.createHud();
  }

  static async create(canvas: HTMLCanvasElement, entryId: number, shipMesh: Group): Promise<Game> {
    // Attach flames BEFORE constructing Game so the bounding-box measurement in
    // attachGameplayFlames sees only the GLB hull, not the shield sphere or the
    // magnet ring that the constructor adds as children of shipMesh.
    attachGameplayFlames(shipMesh, entryId);
    const game = new Game(canvas, entryId, shipMesh);
    return game;
  }

  start(): void {
    this.lastTime = performance.now();
    this.controller.spawnConfig.nextSpawnIn = 0.5;
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    window.removeEventListener('resize', this.resizeHandler);
    // Phase 7i-2 (Task 8) — dispose any in-flight charge-up ring before
    // the scene is torn down. Mirrors the release-branch dispose in
    // update(): scene.remove + geometry/material dispose to avoid a GPU
    // leak on shutdown.
    if (this.input.digit2ChargeUp.ring) {
      const ring = this.input.digit2ChargeUp.ring;
      this.scene.remove(ring);
      ring.geometry.dispose();
      (ring.material as MeshBasicMaterial).dispose();
      this.input.digit2ChargeUp.ring = null;
    }
    this.input.digit2ChargeUp.pressTime = null;
    this.input.digit2ChargeUp.start = null;
    this.input.digit2ChargeUp.tier = null;
    this.input.digit2ChargeUp.isChargeUp = false;
    this.input.destroy();
    if (this.scoreElement) this.scoreElement.remove();
    if (this.waveElement) this.waveElement.remove();
    if (this.breatherElement) this.breatherElement.remove();
    if (this.shieldElement) this.shieldElement.remove();
    if (this.resumeElement) this.resumeElement.remove();
    for (const text of this.activeFloatingTexts) {
      text.element.remove();
    }
    this.activeFloatingTexts = [];
    disposeAllExplosionParticles(this.activeExplosions);
    this.activeExplosions = [];

    disposeAllDamageParticles(this.activeDamageParticles);
    this.activeDamageParticles = [];

    disposeAllSparkArcs(this.activeSparks);
    this.activeSparks = [];

    for (const shard of this.activeShards) {
      this.disposeShard(shard);
    }
    this.activeShards = [];

    // Phase 6b: dispose all crystal cascade state — schedulers, shockwaves,
    // telegraphs, death tweens, camera shake. Cracked-material disposal is
    // handled inside disposeAsteroidMesh.
    this.fractureSchedulers.clear();
    this.crystalDeathTimes.clear();
    this.crystalShardsAbsorbed.clear();
    this.crystalKillIndex = 0;
    for (const wave of this.activeShockwaves) {
      this.scene.remove(wave.mesh);
      wave.dispose();
    }
    this.activeShockwaves = [];
    // Phase 6c3: dispose all per-crystal bolts and sparks so their GPU
    // resources are released when the game stops. (Per-crystal disposal
    // happens normally in destroyCrystal; this is the safety net.)
    for (const bolt of this.crystalBolts.values()) {
      bolt.detach(this.scene);
      bolt.dispose();
    }
    this.crystalBolts.clear();
    for (const sparks of this.crystalSparks.values()) {
      this.scene.remove(sparks.points);
      sparks.dispose();
    }
    this.crystalSparks.clear();
    for (const pending of this.pendingTelegraphs) {
      this.scene.remove(pending.mesh);
      pending.mesh.geometry.dispose();
      (pending.mesh.material as Material).dispose();
    }
    this.pendingTelegraphs = [];
    for (const tween of this.crystalDeathTweens) {
      this.scene.remove(tween.mesh);
      disposeAsteroidMesh(tween.mesh);
    }
    this.crystalDeathTweens = [];
    this.cameraShakeAmplitude = 0;
    this.cameraShakeRemaining = 0;

    // Phase 7g — dispose the missile-destroyed explosion factory. Removes
    // the shards InstancedMesh + sparks Points + flash sphere from the
    // scene and disposes their geometry + materials. Idempotent: a fresh
    // Game instance will re-create the factory in its constructor.
    if (this.missileExplosionFactory) {
      this.missileExplosionFactory.dispose();
      this.missileExplosionFactory = null;
    }

    // Phase 7h — dispose the shared video <video> element + VideoTexture
    // used by RED targeted asteroids. Per-asteroid disposal detaches the
    // material reference but the texture itself stays alive (other
    // targeted asteroids may still reference it); the explicit teardown
    // pauses the video + frees the texture exactly once at stop() time.
    disposeVideoAsteroidResources();

    // ═══════════════════════════════════════════════════════════════════════════
    // My Rules — Phase 7 HUD Cleanup
    // ═══════════════════════════════════════════════════════════════════════════
    // Purpose:  Remove the 2 new HUD regions from the DOM and reset all
    //           Phase 7 state so a stop() → start() cycle starts clean.
    // Setup:    Called from Game.stop() right after camera-shake reset. The
    //           order is: remove DOM → clear pill/icon maps → reset state
    //           containers (effects, ammo, deployments, missiles, pickups).
    // Issues:   None.
    // Fix:      Phase 7 Task 13. Without this, a stop() followed by a new
    //           Game instance would leak the previous HUD region (orphaned
    //           div on document.body) and any active effects from the prior
    //           run would persist via the long-lived pickupHudElement ref.
    // Gotchas:  pill.remove() is called BEFORE the map delete so the loop
    //           that mutates the map's iteration cursor isn't double-stepped.
    //           createEmptyActiveAmmo() must be re-imported if the type
    //           import isn't already present (it is — line ~153).
    //           activeDeployments / homingMissiles / activeEffects / pickups
    //           are reset to empty arrays here even though their per-frame
    //           tickers normally prune them — defense in depth in case stop()
    //           is called from a state where those arrays still hold entries.
    // ═══════════════════════════════════════════════════════════════════════════
    if (this.pickupHudElement) {
      this.pickupHudElement.remove();
      this.pickupHudElement = null;
    }
    this.pickupHudPills.clear();
    if (this.activeHudElement) {
      this.activeHudElement.remove();
      this.activeHudElement = null;
    }
    this.activeHudIcons.clear();
    this.activeAmmo = createEmptyActiveAmmo();
    this.activeDeployments = [];
    this.homingMissiles = [];
    this.activeEffects = [];
    this.pickups = [];
    // Phase 7b — Bomb Strike side effects. The missileVolleySchedules queue
    // and any in-flight core flashes must be cleared; the bomb edge flash
    // DOM element must be removed; the module-scope InstancedMesh pools for
    // shockwave particles and missile smoke must be disposed so a fresh
    // Game instance starts with a clean GPU state.
    this.missileVolleySchedules = [];
    this.activeCoreFlashes.forEach((f) => {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as MeshBasicMaterial).dispose();
    });
    this.activeCoreFlashes = [];
    if (this.bombEdgeFlashElement) {
      this.bombEdgeFlashElement.remove();
      this.bombEdgeFlashElement = null;
    }
    // Phase 7c — screen-flash div cleanup.
    if (this.screenFlashElement) {
      this.screenFlashElement.classList.remove('active');
      this.screenFlashElement = null;
    }
    // Phase 7c — punch-zoom cleanup (remove class from canvas).
    this.renderer.domElement.classList.remove('punch-zoom');
    this.screenFlashRemaining = 0;
    this.punchZoomRemaining = 0;
    this.freezeFramesRemaining = 0;
    disposeShockwaveParticles();
    disposeMissileVfx();
    // Phase 7i Sprint 2 Task 6 — drone-kill spark cleanup. Force-expire any
    // in-flight sparks so their sprites are removed from the scene and
    // their materials are disposed (the lock-on texture is module-scope
    // shared and is NOT disposed here). A long dt is safe because
    // tickDroneKillSparks is dt-bounded by the lifetime clamp.
    for (const sparks of this.droneKillSparks) {
      tickDroneKillSparks(sparks, 1.0, this.scene);
    }
    this.droneKillSparks = [];
    // Phase 7f — Magnet Booster cleanup. Reset the state machine so a
    // stop() → start() cycle starts clean (no stale pendingTier or active
    // window), and hide both rings so they don't carry over to the next
    // game instance. The 4th active HUD icon's DOM is removed by the
    // activeHudElement branch above (activeHudIcons.clear() drops the
    // cached refs along with the 3 ammo icons).
    this.magnetBooster = createMagnetBooster();
    this.magnetActiveRing.visible = false;
    this.magnetActiveField.visible = false;
  }

  private loop = (time: number): void => {
    if (!this.running) return;

    const rawDelta = (time - this.lastTime) / 1000;
    // Clamp deltaTime to 1/30s. Tab unfocus + browser throttling can produce
    // huge raw deltas; without this clamp a single frame could fire the
    // entire burst cascade and overwhelm MAX_SHARDS (4th-pass Risk 1).
    const deltaTime = Math.min(rawDelta, MAX_DELTA_TIME, 1 / 30);
    this.lastTime = time;
    // debugPauseClock freezes the in-game clock so screenshot harnesses can
    // inspect static fracture state. Physics + animation still tick (so the
    // scene doesn't freeze solid), but the cascade scheduler sees no time
    // pass and no auto-bursts fire.
    if (!this.clockPaused) {
      this.gameTimeSeconds += deltaTime;
    }
    this.isCrystalBurstFrame = false;

    this.update(deltaTime);
    if (this.bloomComposer) {
      this.bloomComposer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.loop);
  };

  private update(deltaTime: number): void {
    // Phase 7i-2 (Task 8) DELTA — Digit2 charge-up hold lives in the
    //   active-dispatch block below. It tracks 3 states (press → hold →
    //   release) via InputManager edge methods; per-frame ring update
    //   uses wall-clock time so the 0.3s threshold feels constant. The
    //   release branch calls useActiveItem({isChargeUp}) which then
    //   pre-scales dep.deployShockwave for the larger end-scale.
    //   Full DELTA on useActiveItem's My Rules block.
    // Phase 7c — freeze-frame skip. When a bomb has just fired, the first
    // 2 ticks are skipped to give the player a "bullet time" beat. The
    // 6-layer bomb visual still progresses because fireBombStrike was called
    // synchronously at press time (before update was entered), so the
    // tween counters in activeCoreFlashes / activeShockwaves continue to
    // tick down. The freeze only skips the per-frame simulation (asteroid
    // integration, missile tracking, etc.) so the player sees the rings
    // expand against a frozen arena.
    if (this.freezeFramesRemaining > 0) {
      this.freezeFramesRemaining -= 1;
      // Still tick the bomb visual tweens (DOM flash, punch-zoom, camera shake)
      // so the moment reads as a real beat, not a stuck frame.
      this.updateBombVisuals(deltaTime);
      this.applyCameraShake(deltaTime);
      this.updateFloatingTexts(deltaTime);
      return;
    }

    this.controller.update();

    const rawInput = this.input.currentState();
    const input: InputState = {
      move: rawInput.move,
      aim: this.screenToWorld(rawInput.aim),
      fire: rawInput.fire,
      deployBreather: rawInput.deployBreather,
      useActive1: rawInput.useActive1,
      useActive2: rawInput.useActive2,
      useActive3: rawInput.useActive3,
      useMagnetBooster: rawInput.useMagnetBooster,
      // Phase 7i-2 (Task 8) — Digit2 charge-up fields. The InputManager holds
      // a long-lived digit2ChargeUp object that we read here and mutate
      // directly via this.input.digit2ChargeUp.* below.
      useActive2PressTime: rawInput.useActive2PressTime,
      useActive2ChargeUpRing: rawInput.useActive2ChargeUpRing,
      useActive2ChargeUpTier: rawInput.useActive2ChargeUpTier,
      useActive2ChargeUpStart: rawInput.useActive2ChargeUpStart,
      useActive2IsChargeUp: rawInput.useActive2IsChargeUp,
    };

    // Phase 7i-2 hotfix — drone system must keep ticking during ship
    // respawn. The respawn early-return below (line ~933) skips EVERY
    // per-frame ticker including updateActiveDeployments, which freezes
    // elapsedSeconds/remaining/sceneClock + beam-vs-asteroid hit detection.
    // User-visible symptom: the drone's in-flight beam visually sticks
    // pointing at the last acquired (now stale) asteroid position (looks
    // like "shoots into middle space") and any prior-frame beam-hit
    // pickup drops float uncollected until the player respawns. Calling
    // updateActiveDeployments here, BEFORE the respawn gate, keeps the
    // full 11s window the player paid for alive regardless of ship state.
    // Note: updateActiveDeployments now also internally drives beam
    // hit detection (was at the end of handleCollisions, gated by the
    // same respawn flow), so this single move covers both.
    this.updateActiveDeployments(deltaTime);

    // Respawn flow: ship is dead/exploding; skip gameplay until it revives.
    if (this.respawnPhase !== 'none') {
      this.updateRespawn(deltaTime, input);
      return;
    }

    updateWave(this.wave, deltaTime);
    if (this.wave.waveNumber !== this.lastWaveNumber) {
      this.crystalsSpawnedThisWave = 0;
      this.lastWaveNumber = this.wave.waveNumber;
    }
    const inBreatherZone = isInsideBreatherZone(this.breather, this.ship.state.position);
    updateShield(this.shield, inBreatherZone, deltaTime);
    updateBreather(this.breather, this.shield, this.ship.state.position, input.deployBreather, deltaTime);

    this.controller.apply(this.ship.state, input, deltaTime);
    // Phase 7c — bomb visual tweens (DOM flash fade, punch-zoom decay).
    this.updateBombVisuals(deltaTime);
    // Phase 7 Task 14 — FIRE_RATE passive pickup multiplies the per-frame
    // cooldown decrement by 3× for 6 seconds. The Ship.update signature
    // already accepts `fireRateMultiplier = 1` (Task 8), so passing 3 is
    // the entire wiring. Default = 1 keeps behavior identical when no
    // FIRE_RATE effect is active.
    const fireRateMultiplier = this.activeEffects.some((e) => e.kind === PickupKind.FIRE_RATE) ? 3 : 1;
    this.ship.update(input, deltaTime, fireRateMultiplier);

    if (input.fire && this.ship.canFire()) {
      this.fireProjectile();
    }

    this.updateShipMesh();
    this.updateExhaustFlames(input);
    this.updateShieldMesh();
    this.updateMagnetRing();
    this.updateBreatherMesh();
    this.updateProjectiles(deltaTime);
    // Phase 7 — pickup subsystem ticks. Per spec, the four tickers run
    // BEFORE updateShards so the drone/missile callbacks see the current
    // frame's asteroid array.
    this.updateActivePickupEffects(deltaTime);
    this.updatePickups(deltaTime);
    this.updateActiveAmmoCooldowns(deltaTime);
    // Phase 7i-2 hotfix — updateActiveDeployments was REMOVED from this
    // post-respawn block. It now lives ABOVE the respawn early-return so
    // the drone system (tick + beam-vs-asteroid hits) stays alive during
    // ship death. Leaving a duplicate call here would double-tick the
    // drone state machine (orbit, fire timer, beam, kill sparks) and risk
    // double-firing the beamHitCallback. See the explanatory comment at
    // the new call site above the respawn gate.
    // Phase 7 — active input dispatch (Digit1/2/3 → BOMB/DRONES/MISSILES).
    if (input.useActive1) this.useActiveItem(PickupKind.BOMB_STRIKE);
    // Phase 7i-2 (Task 8) — Digit2 charge-up hold. Three states:
    //   press  → spawn tier-colored ring at ship, record wall-clock start
    //   hold   → each frame, check heldFor against threshold; if past,
    //             flip isChargeUp=true and continue updating the ring
    //   release→ fire useActiveItem({isChargeUp}), dispose ring, reset
    // Edge detection is provided by InputManager.digit2JustPressed() /
    // digit2JustReleased() so a held key only triggers the press/release
    // exactly once. Time is wall-clock (performance.now()/1000), NOT
    // game-time dt — the 0.3s threshold must feel like 0.3s to the
    // player regardless of frame rate. State lives on
    // this.input.digit2ChargeUp (long-lived) since the per-frame
    // InputState snapshot does not persist.
    if (this.input.digit2JustPressed()) {
      // Capture the pre-decrement tier so the deploy fires the correct
      // drone count even though consumeActiveCharge() inside
      // useActiveItem will decrement charges by 1.
      const preDecrementCharges = this.activeAmmo[PickupKind.ORBIT_DRONES].charges;
      const tier = (preDecrementCharges + 1) as 1 | 2 | 3;
      const now = performance.now() / 1000;
      // Phase 7i-2 (Task 11) — DELTA CRITICAL: dispose any stale ring
      // from a prior press before re-assigning digit2ChargeUp.ring.
      // Previously the press branch just overwrote the field, leaking
      // a Mesh (geometry + material) every retry. The release branch
      // already had the right dispose pattern (lines below); mirror it
      // here. If the field is null this is a no-op.
      const staleRing = this.input.digit2ChargeUp.ring;
      if (staleRing) {
        this.scene.remove(staleRing);
        staleRing.geometry.dispose();
        (staleRing.material as MeshBasicMaterial).dispose();
      }
      this.input.digit2ChargeUp.pressTime = now;
      this.input.digit2ChargeUp.start = now;
      this.input.digit2ChargeUp.tier = tier;
      this.input.digit2ChargeUp.isChargeUp = false;
      const ring = createChargeUpRing(tier);
      ring.position.set(
        this.ship.state.position.x,
        this.ship.state.position.y,
        -0.05,
      );
      this.scene.add(ring);
      this.input.digit2ChargeUp.ring = ring;
    }
    if (
      this.input.digit2ChargeUp.pressTime !== null
      && this.input.digit2ChargeUp.ring !== null
      && this.input.digit2ChargeUp.tier !== null
    ) {
      const heldFor = (performance.now() / 1000) - this.input.digit2ChargeUp.pressTime;
      if (heldFor >= ORBIT_DRONES_CHARGE_UP_HOLD_SECONDS) {
        this.input.digit2ChargeUp.isChargeUp = true;
      }
      const fraction = Math.min(
        1,
        heldFor / ORBIT_DRONES_CHARGE_UP_HOLD_SECONDS,
      );
      updateChargeUpRing(
        this.input.digit2ChargeUp.ring,
        fraction,
      );
    }
    if (this.input.digit2JustReleased()) {
      if (this.input.digit2ChargeUp.pressTime !== null) {
        const isChargeUp = this.input.digit2ChargeUp.isChargeUp;
        this.useActiveItem(PickupKind.ORBIT_DRONES, { isChargeUp });
        // Dispose the charge-up ring. Scene ownership belongs to the
        // Game; InputManager has no scene reference. Materials and
        // geometry are created by createChargeUpRing — see
        // src/orbit-drone-vfx.ts:140-160.
        const ring = this.input.digit2ChargeUp.ring;
        if (ring) {
          this.scene.remove(ring);
          ring.geometry.dispose();
          (ring.material as MeshBasicMaterial).dispose();
        }
        this.input.digit2ChargeUp.pressTime = null;
        this.input.digit2ChargeUp.start = null;
        this.input.digit2ChargeUp.tier = null;
        this.input.digit2ChargeUp.isChargeUp = false;
        this.input.digit2ChargeUp.ring = null;
      }
    }
    if (input.useActive3) this.useActiveItem(PickupKind.HOMING_MISSILES);
    // Phase 7f — Magnet Booster dispatch (Digit4). Routes directly to
    // activateMagnetBooster rather than useActiveItem because the magnet
    // booster uses a dedicated state machine (pendingTier / activeTier) and
    // has chargeCap=0 + isDeployable=false in ACTIVE_KIND_SPECS, so the
    // ammo/charge path would gate it permanently. activateMagnetBooster is
    // itself idempotent (returns false if already active or pendingTier=0),
    // so spam-Digit4 is safe.
    if (input.useMagnetBooster) activateMagnetBooster(this.magnetBooster, this.gameTimeSeconds);
    this.updateShards(deltaTime);
    this.updateAsteroids(deltaTime);
    this.handleAsteroidCollisions();
    this.updateScrap(deltaTime);
    this.updateSpawning(deltaTime);
    this.updateCrystalBursts(this.gameTimeSeconds);
    this.updatePendingTelegraphs(this.gameTimeSeconds);
    this.updateCrystalDeathTweens(deltaTime);
    this.updateShockwaveList(deltaTime);
    // Phase 7b — bomb core flash + shockwave particle pool. Both are
    // ticker functions (no scene argument) that prune their own dead
    // entries; the InstancedMesh stays attached to the scene for the
    // lifetime of the Game.
    this.updateCoreFlashes(deltaTime);
    updateShockwaveParticles(deltaTime);
    this.updateCrystalVisuals(deltaTime, this.gameTimeSeconds);
    this.applyCameraShake(deltaTime);
    this.updateHud(deltaTime);
    this.updateFloatingTexts(deltaTime);
    updateShieldVisuals(this.shieldMesh, deltaTime);
    // Phase 7b — shield boost tick. While a SHIELD active effect is live,
    // tint the shield green and bump its pulse/grid strength. When no
    // effect is active, the helpers are called with intensity=0 to leave
    // the baseline cyan alone (the brief's "safe default"). tickShieldFlare
    // advances the one-shot 0.6s flare started by applyPickupToShip.
    const shieldBoost = this.activeEffects.find((e) => e.kind === PickupKind.SHIELD);
    if (shieldBoost) {
      const t = shieldBoost.remaining / shieldBoost.total;
      setShieldBoostColor(this.shieldMesh, t);
      setShieldBoostPulse(this.shieldMesh, t);
    } else {
      // Restore baseline cyan if no boost active. (setShieldBoostColor with
      // intensity=0 leaves the baseline untouched; this is the safe default.)
      setShieldBoostColor(this.shieldMesh, 0);
      setShieldBoostPulse(this.shieldMesh, 0);
    }
    tickShieldFlare(this.shieldMesh, deltaTime);
    this.updateExplosions(deltaTime);
    this.updateDamageEffects(deltaTime);
    this.updateLowShieldEffects(deltaTime);

    this.handleCollisions();
  }

  private updateRespawn(deltaTime: number, input: InputState): void {
    this.updateExplosions(deltaTime);
    this.updateDamageEffects(deltaTime);
    updateShieldVisuals(this.shieldMesh, deltaTime);
    this.updateFloatingTexts(deltaTime);

    if (this.respawnPhase === 'exploding') {
      this.shipRespawnDelay -= deltaTime;
      if (this.shipRespawnDelay <= 0) {
        this.respawnPhase = 'pressKey';
        if (this.resumeElement) {
          this.resumeElement.textContent = 'Press a Key to resume';
          this.resumeElement.style.display = 'block';
        }
      }
    } else if (this.respawnPhase === 'pressKey') {
      if (this.input.consumeAnyKeyHit()) {
        this.respawnPhase = 'countdown';
        this.countdownTimer = 3.0;
        if (this.resumeElement) {
          this.resumeElement.textContent = '3';
          this.resumeElement.style.display = 'block';
        }
      }
    } else if (this.respawnPhase === 'countdown') {
      this.countdownTimer -= deltaTime;
      if (this.resumeElement) {
        const value = Math.max(0, Math.ceil(this.countdownTimer));
        this.resumeElement.textContent = value > 0 ? String(value) : '';
        this.resumeElement.style.display = value > 0 ? 'block' : 'none';
      }
      if (this.countdownTimer <= 0) {
        this.respawnPhase = 'none';
        if (this.resumeElement) {
          this.resumeElement.style.display = 'none';
        }
        this.finishRespawn();
      }
    }

    this.updateHud(deltaTime);
  }

  private screenToWorld(screen: Vector2): Vector2 {
    const ndcX = (screen.x / window.innerWidth) * 2 - 1;
    const ndcY = -(screen.y / window.innerHeight) * 2 + 1;
    const halfHeight = this.camera.position.z * Math.tan((this.camera.fov * Math.PI) / 360);
    const halfWidth = halfHeight * this.camera.aspect;
    return {
      x: ndcX * halfWidth,
      y: ndcY * halfHeight,
    };
  }

  private updateShipMesh(): void {
    this.shipMesh.position.set(this.ship.state.position.x, this.ship.state.position.y, 0);
    const angle = Math.atan2(this.ship.state.aim.y, this.ship.state.aim.x);
    this.shipMesh.rotation.z = angle;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Exhaust Flame Toggle (Gameplay Only)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Show exhaust flame cones only while the player presses forward thrust.
  // Setup: toggleFlames() walks the ship mesh children and flips visibility on
  //        each child named 'exhaustFlame'. input.move.y > 0 means forward thrust.
  // Issues: Flames are additive-blended cone meshes positioned at each nozzle's
  //         GLB bounding-box rear-edge coordinate. No pixel analysis needed —
  //         the config data (position + color) is per-ship in exhaust-config.ts.
  // Gotchas: input.move.y uses inverted Y for forward thrust in the arena controller.
  // ═══════════════════════════════════════════════════════════════════════════
  private updateExhaustFlames(input: InputState): void {
    toggleFlames(this.shipMesh, input.move.y > 0);
  }

  private updateShieldMesh(): void {
    this.shieldMesh.visible = this.shield.energy > 0.01;
    const scale = 1.0 + (this.shield.energy / SHIELD_MAX_ENERGY) * 0.2;
    this.shieldMesh.scale.set(scale, scale, scale);
    setShieldEnergy(this.shieldMesh, shieldPercent(this.shield));
  }

  private updateMagnetRing(): void {
    const shipPosition = this.ship.state.position;
    const pullCount = this.scrap.reduce((count, piece) => {
      const dx = piece.state.position.x - shipPosition.x;
      const dy = piece.state.position.y - shipPosition.y;
      return Math.hypot(dx, dy) <= this.effectiveMagnetRadius ? count + 1 : count;
    }, 0);

    const material = this.magnetRing.material as MeshBasicMaterial;
    if (pullCount > 0) {
      // Ring brightens and pulses when scrap is being pulled in.
      const pulse = 1.0 + Math.sin(performance.now() * 0.008) * 0.15;
      material.opacity = 0.12 * pulse;
    } else {
      // Faint baseline ring so the player always knows the magnet radius.
      material.opacity = 0.025;
    }
  }

  // Phase 7f — wraps the state-machine function so every per-frame call site
  // (updateScrap, updatePickups, updateMagnetRing) reads the current radius
  // through one getter. activeTier overrides pendingTier in the underlying
  // effectiveMagnetMultiplier, so the player always sees the strongest
  // current radius even mid-activation.
  get effectiveMagnetRadius(): number {
    return effectiveMagnetRadiusFromState(this.magnetBooster, MAGNET_RADIUS);
  }

  private updateBreatherMesh(): void {
    this.breatherMesh.visible = this.breather.active;
    if (this.breather.active) {
      this.breatherMesh.position.set(this.breather.position.x, this.breather.position.y, 0);
      const pulse = 1.0 + Math.sin(this.breather.durationRemaining * 4) * 0.05;
      const scale = this.breather.radius * pulse;
      this.breatherMesh.scale.set(scale, scale, scale);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — spreadAnglesForFrame (Phase 7 Task 14)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose:  Pure function returning the per-frame projectile angle offsets
  //           (radians) for the player's fireProjectile path. Default = [0]
  //           (single shot); SPREAD pickup active = [-0.26, 0, 0.26] (3-way
  //           spread at ±15°).
  // Setup:    Called once per fire from fireProjectile. Reads only
  //           `this.activeEffects` — no mutation.
  // Issues:   None.
  // Fix:      Phase 7 Task 14. Centralizes the spread logic so fireProjectile
  //           stays a thin loop. ±15° (= 0.2618 rad) was chosen to match the
  //           spec: each spread bullet is distinguishable from neighbors but
  //           the trio still reads as "one shot" at gameplay distance.
  // Gotchas:  The helper returns a fresh array each call — callers must not
  //           hold on to the returned array across frames (the player can
  //           collect/expire SPREAD between calls). The [0] default case is
  //           the existing pre-Phase-7 behavior, byte-identical to a single
  //           straight shot.
  //           activeEffects is an array of ActivePickupEffect (kind + remaining
  //           + total) — using `.some(e => e.kind === PickupKind.SPREAD)` is
  //           O(n) but n ≤ 3 (3 passive kinds), so the scan is trivially cheap.
  // ═══════════════════════════════════════════════════════════════════════════
  private spreadAnglesForFrame(): number[] {
    const hasSpread = this.activeEffects.some((e) => e.kind === PickupKind.SPREAD);
    if (!hasSpread) return [0];
    // 3-way spread at ±15° (0.2618 rad).
    return [-0.2618, 0, 0.2618];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Spread-Shot Firing (Phase 7 Task 14)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose:  Fire one projectile per angle offset in `spreadAnglesForFrame()`.
  //           Default = [0] (single straight shot); SPREAD pickup = [-0.26, 0,
  //           0.26] (3-way spread at ±15°).
  // Setup:    Called from update(input) when `input.fire && this.ship.canFire()`.
  //           Reads `this.ship.state.aim` as the base direction and rotates it
  //           by each angleOffset before spawning a projectile.
  // Issues:   None.
  // Fix:      Phase 7 Task 14. Wraps the original single-shot body in a `for`
  //           loop over the offsets returned by spreadAnglesForFrame(). The
  //           unchanged-when-no-SPREAD case is the [0] offset path, so the
  //           default behavior is byte-identical to the pre-Task-14 build.
  // Gotchas:  spreadAnglesForFrame is a pure function of `this.activeEffects` —
  //           it does NOT mutate. The 0.9 nose offset must be applied to the
  //           rotated direction (not the base aim) so spread bullets emerge
  //           from the player's nose, not from a stack at the ship center.
  //           resetCooldown() stays OUTSIDE the loop so a single key press
  //           costs one cooldown tick no matter how many bullets fire.
  //           The drone projectile path (fireDroneProjectile) intentionally
  //           does NOT use spreadAnglesForFrame — drones fire straight shots
  //           per their own per-target tracking logic.
  // ═══════════════════════════════════════════════════════════════════════════
  private fireProjectile(): void {
    this.ship.resetCooldown();
    const baseAim = this.ship.state.aim;
    for (const angleOffset of this.spreadAnglesForFrame()) {
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);
      const dirX = baseAim.x * cos - baseAim.y * sin;
      const dirY = baseAim.x * sin + baseAim.y * cos;
      const dir: Vector2 = { x: dirX, y: dirY };
      const noseOffset: Vector2 = {
        x: dirX * 0.9,
        y: dirY * 0.9,
      };
      const spawn: Vector2 = {
        x: this.ship.state.position.x + noseOffset.x,
        y: this.ship.state.position.y + noseOffset.y,
      };
      const state = createProjectile(spawn, dir);
      const mesh = new Mesh(
        new SphereGeometry(PROJECTILE_RADIUS, 8, 8),
        new MeshBasicMaterial({ color: 0xaaddff }),
      );
      mesh.position.set(spawn.x, spawn.y, 0);
      this.projectiles.push({ state, mesh });
      this.scene.add(mesh);
    }
  }

  private updateProjectiles(deltaTime: number): void {
    const alive: LiveProjectile[] = [];
    for (const projectile of this.projectiles) {
      updateProjectile(projectile.state, deltaTime);
      projectile.mesh.position.set(projectile.state.position.x, projectile.state.position.y, 0);
      const dead = projectile.state.lifetime <= 0 || this.controller.isOutsideCullBounds(projectile.state.position);
      if (dead) {
        this.disposeProjectile(projectile);
      } else {
        alive.push(projectile);
      }
    }
    this.projectiles = alive;
  }

  private updateShards(deltaTime: number): void {
    const boundsRadius = this.controller.cameraPosition
      ? Math.max(Math.hypot(this.controller.cameraPosition.x, this.controller.cameraPosition.y), 30)
      : 30;
    const alive: LiveShard[] = [];
    for (const shard of this.activeShards) {
      updateShard(shard.state, deltaTime, this.ship.state.position);
      shard.mesh.position.set(shard.state.position.x, shard.state.position.y, 0);
      orientShard(shard.mesh, shard.state.angle);

      // Shard ↔ ship collision. If the shield absorbs it, fire the impact
      // visual and knockback; otherwise respawn. Either way, the shard is
      // consumed on contact.
      let consumed = false;
      if (circlesCollide(shard.state.position, SHARD_RADIUS, this.ship.state.position, SHIELD_RADIUS)) {
        if (absorbShardHit(this.shield)) {
          const contact = { x: shard.state.position.x, y: shard.state.position.y };
          addShieldImpact(this.shieldMesh, contact, this.ship.state.position);
          this.applyShieldKnockbackFromPoint(contact);
          // Track absorbed shards per source crystal for the PERFECT bonus.
          if (shard.state.crystalId !== -1) {
            const prev = this.crystalShardsAbsorbed.get(shard.state.crystalId) ?? 0;
            this.crystalShardsAbsorbed.set(shard.state.crystalId, prev + 1);
          }
        } else {
          this.respawnShip();
        }
        consumed = true;
      }

      if (!consumed && isShardDead(shard.state, boundsRadius)) {
        this.disposeShard(shard);
        consumed = true;
      }

      if (!consumed) {
        alive.push(shard);
      } else if (shard.mesh.parent) {
        this.disposeShard(shard);
      }
    }
    this.activeShards = alive;
  }

  private disposeShard(shard: LiveShard): void {
    this.scene.remove(shard.mesh);
    // Shard geometry + material are shared via shard-mesh.ts. Do not dispose
    // them here — disposing would break other in-flight shards that share
    // the same ConeGeometry / MeshStandardMaterial.
  }

  private applyShieldKnockbackFromPoint(contact: Vector2): void {
    const dx = this.ship.state.position.x - contact.x;
    const dy = this.ship.state.position.y - contact.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) return;
    const impulse = 6.0;
    this.ship.state.velocity = {
      x: this.ship.state.velocity.x + (dx / distance) * impulse,
      y: this.ship.state.velocity.y + (dy / distance) * impulse,
    };
  }

  private updateAsteroids(deltaTime: number): void {
    const alive: LiveAsteroid[] = [];
    for (const asteroid of this.asteroids) {
      if (this.breather.active) {
        const dx = asteroid.state.position.x - this.breather.position.x;
        const dy = asteroid.state.position.y - this.breather.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < this.breather.radius) {
          // Slow asteroids inside the safe zone and push them outward.
          const slowdown = Math.max(0.1, 1 - 3.0 * deltaTime);
          const pushForce = 4.0;
          const invDistance = 1 / distance;
          const pushX = (dx * invDistance) * pushForce * deltaTime;
          const pushY = (dy * invDistance) * pushForce * deltaTime;

          asteroid.state.velocity = {
            x: asteroid.state.velocity.x * slowdown + pushX,
            y: asteroid.state.velocity.y * slowdown + pushY,
          };
        }
      }

      asteroid.state.position = {
        x: asteroid.state.position.x + asteroid.state.velocity.x * deltaTime,
        y: asteroid.state.position.y + asteroid.state.velocity.y * deltaTime,
      };
      asteroid.mesh.position.set(asteroid.state.position.x, asteroid.state.position.y, 0);
      asteroid.mesh.rotation.x += deltaTime * 0.2;
      asteroid.mesh.rotation.y += deltaTime * 0.3;
      // Phase 7h v13 — re-upload current frame + modulate emissive in fade
      // window for the targeted video asteroid. tickVideoAsteroid is a
      // no-op for non-video asteroids (the userData.videoAsteroid stash is
      // undefined) and for video asteroids whose frame table hasn't
      // resolved yet (the placeholder material is still in place).
      tickVideoAsteroid(asteroid.mesh);

      if (this.controller.isOutsideCullBounds(asteroid.state.position)) {
        this.scene.remove(asteroid.mesh);
        disposeAsteroidMesh(asteroid.mesh);
      } else {
        alive.push(asteroid);
      }
    }
    this.asteroids = alive;
  }

  private updateScrap(deltaTime: number): void {
    const alive: LiveScrap[] = [];
    for (const piece of this.scrap) {
      updateScrap(piece.state, deltaTime);
      magnetPull(piece.state, this.ship.state.position, deltaTime, this.effectiveMagnetRadius);
      piece.mesh.position.set(piece.state.position.x, piece.state.position.y, 0);

      if (isScrapCollected(piece.state, this.ship.state.position)) {
        this.breather.meter = Math.min(BREATHER_METER_COST, this.breather.meter + 1);
        this.scene.remove(piece.mesh);
        piece.mesh.geometry.dispose();
        (piece.mesh.material as Material).dispose();
      } else if (isScrapExpired(piece.state)) {
        this.scene.remove(piece.mesh);
        piece.mesh.geometry.dispose();
        (piece.mesh.material as Material).dispose();
      } else {
        alive.push(piece);
      }
    }
    this.scrap = alive;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Pickup Lifecycle (Phase 7)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Per-frame tick for the pickup array: magnetize, age, collect, expire.
  // Setup:   Game owns `this.pickups`. updatePickups is called from the main
  //          update loop (Task 12 wires it). Collected pickups dispatch to
  //          applyPickupToShip; expired ones are disposed.
  // Issues:  None.
  // Fix:     Phase 7. The shape mirrors updateShards — iterate, mutate,
  //          prune-and-replace. This avoids the array-splice-during-iteration
  //          trap that the original pickup code hit.
  // Gotchas: createPickupState is the lifecycle constructor; createPickupMesh
  //          is the visual factory. They are separate so pickup tests can
  //          skip Three.js entirely. updatePickup mutates the PickupState in
  //          place; the mesh is updated from `pickup.state.position`/`.spin`.
  // ═══════════════════════════════════════════════════════════════════════════
  private updatePickups(deltaTime: number): void {
    const alive: LivePickup[] = [];
    for (const pickup of this.pickups) {
      updatePickup(pickup.state, this.ship.state.position, deltaTime, this.effectiveMagnetRadius);
      // Per-kind axis rotation (Phase 7b).
      const axis = PICKUP_SPIN_AXIS[pickup.state.kind];
      pickup.mesh.rotation[axis] = pickup.state.spin;
      // Vertical bobbing.
      const bob = Math.sin(
        pickup.state.age * Math.PI * 2 * PICKUP_BOB_FREQUENCY_HZ,
      ) * PICKUP_BOB_AMPLITUDE;
      pickup.mesh.position.set(
        pickup.state.position.x,
        pickup.state.position.y + bob,
        0,
      );
      // Emissive pulse on the body mesh.
      const ref = pickup.mesh as Group & { _body?: Mesh; _sonar?: Mesh; _halo?: Sprite };
      if (ref._body) {
        const mat = ref._body.material as MeshStandardMaterial;
        mat.emissiveIntensity =
          0.4 +
          Math.sin(
            pickup.state.age * Math.PI * 2 * PICKUP_EMISSIVE_PULSE_FREQUENCY_HZ,
          ) * PICKUP_EMISSIVE_PULSE_AMPLITUDE;
      }
      // Sonar ring pulse (1.5s period).
      const sonarRef = ref._sonar;
      if (sonarRef) {
        const sonarMat = sonarRef.material as MeshBasicMaterial;
        const phase =
          (pickup.state.age % PICKUP_SONAR_RING_PERIOD_SECONDS) / PICKUP_SONAR_RING_PERIOD_SECONDS;
        sonarRef.scale.set(1.0 + phase * 1.5, 1.0 + phase * 1.5, 1);
        sonarMat.opacity = 0.4 * (1.0 - phase);
      }
      // Proximity halo brightness.
      const haloRef = ref._halo;
      if (haloRef) {
        const haloMat = haloRef.material as SpriteMaterial;
        const dx = this.ship.state.position.x - pickup.state.position.x;
        const dy = this.ship.state.position.y - pickup.state.position.y;
        const distance = Math.hypot(dx, dy);
        const prox = Math.max(0, 1 - distance / 2.5);
        haloMat.opacity = PICKUP_HALO_BASE_OPACITY + PICKUP_HALO_PROXIMITY_BOOST * prox;
        haloRef.scale.setScalar(0.6 + 0.5 * prox);
      }
      if (isPickupCollected(pickup.state, this.ship.state.position)) {
        this.applyPickupToShip(pickup.state.kind);
        this.disposePickup(pickup);
        continue;
      }
      if (isPickupExpired(pickup.state)) {
        this.disposePickup(pickup);
        continue;
      }
      alive.push(pickup);
    }
    this.pickups = alive;
  }

  private updateActivePickupEffects(deltaTime: number): void {
    const alive: ActivePickupEffect[] = [];
    for (const effect of this.activeEffects) {
      const remaining = effect.remaining - deltaTime;
      if (remaining > 0) {
        alive.push({ kind: effect.kind, remaining, total: effect.total });
      }
    }
    this.activeEffects = alive;
  }

  private applyPickupToShip(kind: PickupKind): void {
    // Phase 7f — Magnet Booster uses a dedicated state machine in
    // src/magnet-booster.ts instead of the ammo/charge map. Branch out
    // BEFORE the existing active/passive split so collectMagnetBooster runs
    // (and only runs) for MAGNET_BOOSTER. The "isActive" check is true while
    // activeUntil > gameTime (collect-while-active bumps pendingTier but
    // never resets activeUntil — see magnet-booster.ts).
    if (kind === PickupKind.MAGNET_BOOSTER) {
      collectMagnetBooster(
        this.magnetBooster,
        this.magnetBooster.activeUntil > this.gameTimeSeconds,
      );
    } else if (
      kind === PickupKind.BOMB_STRIKE ||
      kind === PickupKind.ORBIT_DRONES ||
      kind === PickupKind.HOMING_MISSILES
    ) {
      applyActivePickupEffect(kind, this.activeAmmo);
    } else {
      const shieldSnapshot = { energy: this.shield.energy, maxEnergy: SHIELD_MAX_ENERGY };
      const effect = applyPickupEffect(kind, { fireCooldown: 0 }, shieldSnapshot);
      this.shield.energy = shieldSnapshot.energy;
      this.activeEffects.push(effect);
      // Phase 7b — SHIELD pickup moment: trigger the 0.6s shield flare, push a
      // blue Shockwave ring, and spawn a secondary "+50%" floating text so the
      // player reads the heal amount AND sees the shield flare.
      if (kind === PickupKind.SHIELD) {
        triggerShieldFlare(this.shieldMesh, 0.6);
        this.activeShockwaves.push(new Shockwave(
          { x: this.ship.state.position.x, y: this.ship.state.position.y },
          0x66aaff,
          0.55,
        ));
        // Override the latest shockwave's opacity to enforce the additive cap.
        const lastWave = this.activeShockwaves[this.activeShockwaves.length - 1];
        (lastWave.mesh.material as MeshBasicMaterial).opacity = 0.55;
        this.spawnFloatingTextAt(
          '+50%',
          { x: this.ship.state.position.x, y: this.ship.state.position.y + 0.5 },
          0,
          '#88ffaa',
          0,
          0,
          12,
          1.2,
        );
      }
    }
    this.spawnFloatingTextAt(
      `+${ACTIVE_KIND_SPECS[kind].displayName}`,
      { x: this.ship.state.position.x, y: this.ship.state.position.y + 0.5 },
      0,
      '#00ffaa',
      0,
      0,
      14,
      1.5,
    );
  }

  private disposePickup(pickup: LivePickup): void {
    this.scene.remove(pickup.mesh);
    disposePickupMesh(pickup.mesh);
  }

  private spawnPickup(kind: PickupKind, position: Vector2): void {
    const state = createPickupState(kind, position);
    const mesh = createPickupMesh(kind);
    mesh.position.set(position.x, position.y, 0);
    this.scene.add(mesh);
    this.pickups.push({ state, mesh });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Active Item Dispatch (Phase 7 Task 12 → Phase 7b Task 8)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose:  Wire Digit1/2/3 → consumeActiveCharge → per-kind deploy or impact.
  //           Single dispatch table keyed by ACTIVE_KIND_SPECS[kind].displayName
  //           so adding a new active kind later only needs a new branch.
  // Setup:    Called once per frame from update(input). Reads
  //           `input.useActive1/2/3` (set by InputManager from Digit1/2/3).
  //           Mutates `this.activeAmmo`, `this.activeDeployments`,
  //           `this.missileVolleySchedules`, and `this.activeShockwaves`.
  // Issues:   None.
  // Fix:      Phase 7 Task 12. canFireActive + consumeActiveCharge are the
  //           single source of truth for charge/cooldown gating — Game does
  //           NOT re-check charges itself, that would invite drift between
  //           the table and the firing code.
  //           Phase 7b Task 8. The MISSILES branch no longer spawns 4
  //           missiles directly — it pushes a VolleySchedule onto
  //           `this.missileVolleySchedules`; tickMissileVolleySchedules
  //           (called from updateActiveDeployments) drains that schedule
  //           over 540ms (0/180/360/540ms staggers) and promotes each
  //           pending missile into `this.homingMissiles` as its delay
  //           expires. The BOMB branch calls fireBombStrike (6-layer combo
  //           from Task 8 — see "My Rules — Bomb Strike" below).
  //           The SHIELD pickup moment lives in applyPickupToShip: a SHIELD
  //           collect calls triggerShieldFlare for a 0.6s one-shot
  //           color/pulse burst, and the sustained 8s boost tints the
  //           shield green via setShieldBoostColor + setShieldBoostPulse,
  //           ticked from the main update loop.
  // Gotchas: Drone re-press is blocked at deployment-time by the `length > 0`
  //          guard in useActiveItem — prevents the player from stacking two
  //          drone flights during the 6s active window. The plan's note that
  //          "DRONES cooldown starts AFTER the 6s window expires" is enforced
  //          by (a) consumeActiveCharge skipping cooldownRemaining set for
  //          deployable kinds, and (b) updateActiveDeployments setting it
  //          when the deployment is culled. The re-press refund path here
  //          restores the consumed charge so the press doesn't silently eat
  //          one — setting `cooldownRemaining = 0` is a defensive no-op
  //          for deployable kinds since consumeActiveCharge never set it.
  //          Missile schedules: pushing 3 schedules in a single frame (3
  //          charges pressed in quick succession) is safe — each schedule
  //          ticks independently and drains in 540ms.
  // I1 deviation: dispatch is via ACTIVE_KIND_SPECS[kind].displayName
  //          (string compare) rather than a PickupKind switch. Trade-off
  //          accepted: a new active kind needs only a new branch here
  //          (no enum switch to update), at the cost of one string compare
  //          per frame per active slot. Worth it for extensibility.
  //          Phase 7c — destroyAsteroid takes a `source: KillSource` param.
  //          BOMB and MISSILE source skip splitAsteroid so a 10-damage
  //          one-shot actually clears the screen. fireBombStrike and
  //          onMissileImpact pass their source explicitly; all bullet kills
  //          (default 'BULLET') keep the classic Asteroids split behavior.
  //
  // Phase 7i-2 (Task 8) DELTA — Digit2 charge-up hold:
  //   Purpose: useActiveItem now accepts opts.isChargeUp. The Digit2 input
  //            loop (above) tracks a 3-state press/hold/release flow: on
  //            press, spawn a tier-colored charge-up ring at the ship; on
  //            hold, update the ring scale and flip isChargeUp once heldFor
  //            >= ORBIT_DRONES_CHARGE_UP_HOLD_SECONDS; on release, fire
  //            useActiveItem with the captured isChargeUp and dispose the
  //            ring.
  //   Setup:   createChargeUpRing + updateChargeUpRing come from
  //            src/orbit-drone-vfx.ts (Task 3). Time is wall-clock via
  //            performance.now()/1000 — NOT dt accumulation. Edge detection
  //            is provided by InputManager.digit2JustPressed/Released.
  //   Issues:  None on the typecheck side; the spawnDroneDeployment
  //            function returns a single DroneDeploymentState, so the
  //            isChargeUp pre-scale is straightforward.
  //   Fix:     Multiplied dep.deployShockwave.scale by 1.25 when isChargeUp
  //            is true. updateDeployShockwave is hard-coded 0.5→2.0 inside
  //            orbit-drone-vfx.ts:281-283 (forbidden to edit per Task 8
  //            constraints), so pre-scaling the base ring maps the tick
  //            loop's range to 0.625→2.5 — matching the
  //            ORBIT_DRONES_CHARGE_UP_DEPLOY_SCALE = 2.5 constant.
  //   Gotchas: (1) The drone lerp duration distinction (0.5s base vs 0.7s
  //            charge-up) is NOT visually distinct: spawnDroneDeployment
  //            places drones at the ship and tickDroneDeployments snaps
  //            them to orbit slots on the first frame — there is no
  //            per-drone lerp in the tick loop. The 0.7s constant lives
  //            in src/pickups.ts but is unreferenced; documented as a
  //            known scope limitation in the Task 8 report. (2) The
  //            charge-up ring dispose path uses scene.remove + geometry
  //            dispose + material dispose — mirrors the dispose pattern
  //            in src/orbit-drone-vfx.ts (createChargeUpRing owns the
  //            RingGeometry + MeshBasicMaterial). InputManager has no
  //            scene reference, so dispose lives in Game. (3) The
  //            onBlur reset in InputManager clears all 5 charge-up
  //            fields so a held Digit2 doesn't fire a phantom release on
  //            tab refocus.
  // ═══════════════════════════════════════════════════════════════════════════
  private useActiveItem(
    kind: PickupKind,
    opts?: { isChargeUp?: boolean },
  ): void {
    if (!canFireActive(this.activeAmmo[kind])) return;
    if (!consumeActiveCharge(this.activeAmmo[kind], kind)) return;
    const spec = ACTIVE_KIND_SPECS[kind];
    const shipPos = this.ship.state.position;
    // I1 dispatch: routed through displayName so adding a new active kind
    // requires only a new `else if` branch below — no PickupKind switch
    // table to keep in sync.
    if (spec.displayName === 'BOMB') {
      this.fireBombStrike(shipPos);
    } else if (spec.displayName === 'DRONES') {
      // Block re-press while a deployment is live or fading.
      if (this.activeDeployments.length > 0) {
        // Refund the charge so the press doesn't silently consume a charge.
        this.activeAmmo[kind].charges += 1;
        this.activeAmmo[kind].cooldownRemaining = 0;
        return;
      }
      // Phase 7i Sprint 3 — charge-stack deploy. consumeActiveCharge already
      // decremented charges by 1, so the CURRENT charges field is banked-1.
      // We add 1 to recover the banked count and pass it as tier (1/2/3),
      // then reset charges to 0 — the player banked 3 pickups but the cost
      // is still one cooldown. Example: banked 3, pressed Digit2 → tier=3
      // deploy (4 drones), charges=0, cooldown=4s.
      const tier = (this.activeAmmo[kind].charges + 1) as 1 | 2 | 3;
      this.activeAmmo[kind].charges = 0;
      const dep = spawnDroneDeployment(shipPos, this.scene, tier);
      // Phase 7i-2 (Task 9) — wire the beam-vs-asteroid hit callback. The
      // dispatch field was added in Task 6 (default null) and is the single
      // hook through which fireDroneBeam's beam line routes to the engine's
      // damage path. Setting it ONCE in the deploy path is cleaner than
      // checking it inside the per-frame intersection loop (which would
      // need a guard or no-op) — every beam in this deployment now shares
      // the same handler. The handler (`onDroneBeamHitAsteroid` method
      // below) is bound via an arrow closure to keep `this` pointing at
      // the Game instance; the callback's own signature is
      // `(asteroid, tier) => void` so the method's signature is
      // `(asteroid: AsteroidState, tier: 1 | 2 | 3) => void`.
      dep.beamHitCallback = (asteroid, t) => this.onDroneBeamHitAsteroid(asteroid, t);
      // Phase 7i-2 (Task 8) — charge-up apply. When Digit2 was held past
      // ORBIT_DRONES_CHARGE_UP_HOLD_SECONDS, the deploy shockwave grows
      // 25% larger (end-scale 2.0 → 2.5). We do this by pre-scaling the
      // base ring.scale — updateDeployShockwave hard-codes 0.5 → 2.0
      // inside orbit-drone-vfx.ts:281-283, so multiplying by 1.25 at
      // spawn time maps the tick loop's range to 0.625 → 2.5 without
      // touching the VFX module. The drone lerp duration distinction
      // (0.5s vs 0.7s) is conceptual: spawnDroneDeployment places
      // drones at the ship and tickDroneDeployments snaps them to
      // their orbit slots on the first frame — there is no actual
      // per-drone lerp to lengthen. Documented as a known scope
      // limitation in the Task 8 report.
      const isChargeUp = opts?.isChargeUp ?? false;
      if (isChargeUp) {
        dep.deployShockwave.scale.set(1.25, 1.25, 1);
      }
      this.activeDeployments.push(dep);
    } else if (spec.displayName === 'MISSILES') {
      // Phase 7b — push a VolleySchedule; the schedule is drained each frame
      // by tickMissileVolleySchedules inside updateActiveDeployments. The
      // 4 missiles launch at 0/180/360/540ms with narrow angular spread.
      this.missileVolleySchedules.push(
        scheduleMissileVolley(shipPos, this.ship.state.aim),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Bomb Strike (Phase 7 Task 12)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Radial AOE damage at the ship position. Iterates all live
  //          asteroids, decrements health for those within BOMB_STRIKE_RADIUS,
  //          and destroys any whose health hits 0. Also spawns a Shockwave
  //          ring + "BOMB!" floating text for visual feedback.
  // Setup:   Called from useActiveItem when Digit1 is pressed. Charge has
  //          already been consumed by the caller. Iterates `this.asteroids`
  //          (LiveAsteroid[]) — matches the existing `handleCollisions` loop.
  // Issues:  The original `handleCollisions` loop builds a fresh `aliveAsteroids`
  //          array. Bomb Strike does the same so a destroyed asteroid is
  //          dropped from the array in the same frame.
  // Fix:     Phase 7 Task 12. Mirrors the projectile damage path from
  //          handleCollisions: iron always dies on hit; crystal decrements
  //          health and lets the existing fracture/destroy cascade handle
  //          the kill.
  // Gotchas: `destroyAsteroid` removes the mesh from the scene and disposes
  //          its GPU resources, so we must NOT also call scene.remove +
  //          disposeAsteroidMesh here. The post-destroy `aliveAsteroids`
  //          skip is the only "tombstone" we need. crystal.kind: shockwaves
  //          and floating text are independent of which kind was killed, so
  //          a single shared Shockwave + text emission is enough.
  // ═══════════════════════════════════════════════════════════════════════════
  private fireBombStrike(position: Vector2): void {
    // Phase 7c — 3-phase time sequence. Replaces Phase 7b's 6-layer combo
    // (which peaked all layers in the same frame, reading as additive soup).
    // Phase 1 (T+0ms):   DOM white-flash + freeze-frame (2 ticks) + CSS punch-zoom + layer 1 core flash
    // Phase 2 (T+50ms):  primary 12u shock ring + 30 streamers (layers 2, 4)
    // Phase 3 (T+200ms): camera shake onset (0.8/0.5s, bumped from 0.6/0.4)
    //                    + debris chunks (layer 5) at T+300ms
    // Phase 4 (T+400ms): secondary 14u ring (was T+80ms with 10u radius)
    // Tail    (T+800ms): residual glow sprite (existing via secondary ring's fade)
    //
    // The 3 phases feel distinct because of:
    //   - DOM flash (high attention, 80ms ease-out)
    //   - Freeze-frame (2 ticks skipped, ~60ms of frozen arena)
    //   - Punch-zoom (canvas scale 1.02, 100ms ease-out)
    //   - 50ms gap before the primary ring (so the flash reads as a beat
    //     BEFORE the ring, not concurrently with it)

    // T+0: DOM white-flash (zero-WebGL screen-level beat).
    this.triggerScreenFlash();
    // T+0: Freeze-frame (skip 2 update ticks).
    this.freezeFramesRemaining = FREEZE_FRAME_TICKS;
    // T+0: CSS punch-zoom.
    this.triggerBombPunchZoom();

    // Layer 1: Hot core flash — single-frame additive sphere that expands to 1u.
    const core = new Mesh(
      new SphereGeometry(0.5, 16, 16),
      new MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    core.position.set(position.x, position.y, -0.1);
    this.scene.add(core);
    this.activeCoreFlashes.push({ mesh: core, age: 0, duration: 0.1 });

    // T+50: Primary shock ring (16u radius, orange) — Phase 7d: was 12u, bumped to match 15u damage radius.
    setTimeout(() => {
      this.activeShockwaves.push(new Shockwave(position, 0xff8800, 1.0, 16.0));
    }, 50);

    // T+50: Shock-front particles (30 outward streamers, 30u/s so they reach the 15u edge in 0.5s lifetime).
    setTimeout(() => {
      emitShockwaveParticles(this.scene, position.x, position.y, {
        count: 30,
        speed: 30,
        color: 0xffcc66,
        lifetime: 0.5,
      });
    }, 50);

    // T+200: Camera shake onset, bumped 0.6/0.4 → 0.8/0.5.
    setTimeout(() => {
      this.cameraShakeAmplitude = Math.max(this.cameraShakeAmplitude, 0.8);
      this.cameraShakeRemaining = Math.max(this.cameraShakeRemaining, 0.5);
    }, 200);

    // T+300: Debris chunks (8 faster, bigger, 30u/s to reach new 15u radius).
    setTimeout(() => {
      emitShockwaveParticles(this.scene, position.x, position.y, {
        count: 8,
        speed: 30,
        color: 0xffaa00,
        lifetime: 0.6,
        isDebris: true,
      });
    }, 300);

    // T+400: Secondary outer ring (18u radius, cooler red-orange) — Phase 7d: was 14u, bumped to overshoot new 15u damage radius.
    setTimeout(() => {
      this.activeShockwaves.push(new Shockwave(position, 0xff4400, 0.5, 18.0));
    }, 400);

    // DOM edge flash (Phase 7b — kept).
    this.triggerBombEdgeFlash();
    // Shards cleansing — restores the EXPANSION spec's "I countered the Shard Swarm" payoff.
    this.activeShards = this.activeShards.filter(
      (s) =>
        Math.hypot(
          s.state.position.x - position.x,
          s.state.position.y - position.y,
        ) > BOMB_STRIKE_RADIUS,
    );
    // Damage pass (unchanged).
    const alive: LiveAsteroid[] = [];
    for (const asteroid of this.asteroids) {
      const d = Math.hypot(
        asteroid.state.position.x - position.x,
        asteroid.state.position.y - position.y,
      );
      if (d <= BOMB_STRIKE_RADIUS) {
        asteroid.state.health = Math.max(0, asteroid.state.health - BOMB_STRIKE_DAMAGE);
        if (asteroid.state.health <= 0) {
          this.destroyAsteroid(asteroid, 'BOMB');
          continue;
        }
      }
      alive.push(asteroid);
    }
    this.asteroids = alive;
    this.spawnFloatingTextAt('BOMB!', position, 0, '#ff8800', 0, 0, 18, 1.0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Active Ammo Cooldown Tick (Phase 7 Task 12)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Per-frame decrement of activeAmmo[k].cooldownRemaining for the
  //          non-deployable active kinds (BOMB_STRIKE, HOMING_MISSILES).
  //          Deployable kinds (ORBIT_DRONES) are skipped here ONLY WHILE a
  //          deployment is currently active — their cooldown is set by the
  //          Game when the deployment is culled in updateActiveDeployments,
  //          so the cooldown tick must resume once that happens.
  // Setup:   Called once per frame from update(input) BEFORE
  //          updateActiveDeployments so the cull-detection in the next
  //          method sees the post-tick cooldown value (which is a no-op for
  //          DRONES anyway since we skip it).
  // Issues:  None.
  // Fix:     Round 2 (Task 12 follow-up). The original guard unconditionally
  //          skipped deployable kinds, so the cooldown set on deployment
  //          fade-out would NEVER tick down — the player could never fire
  //          DRONES a second time. The guard is now conditional on
  //          activeDeployments.length > 0, so the cooldown ticks normally
  //          after the deployment has been pruned by tickDroneDeployments.
  // Gotchas: ACTIVE_KIND_SPECS[kind].isDeployable is the single source of
  //          truth for "should the cooldown tick here?" — keep this guard
  //          in sync with the same flag used in consumeActiveCharge.
  // ═══════════════════════════════════════════════════════════════════════════
  private updateActiveAmmoCooldowns(deltaTime: number): void {
    for (const k of Object.values(PickupKind)) {
      // Round 2 fix: only skip deployable kinds WHILE a deployment is
      // active. After tickDroneDeployments prunes the deployment array,
      // this.activeDeployments.length is 0 and the cooldown set by
      // updateActiveDeployments will tick down normally.
      if (ACTIVE_KIND_SPECS[k].isDeployable && this.activeDeployments.length > 0) continue;
      tickActiveAmmo(this.activeAmmo[k], deltaTime);
    }
    // Phase 7f — Magnet Booster per-frame tick + visual updates. The tick
    // expires the 10s window and returns true on the expiry frame (a signal
    // available for future HUD transition animations). updateActiveRing hides
    // the gold ring outline when activeTier=0 or the window just expired;
    // updateActiveField does the same for the green shield-style disk and
    // also advances the disk shader's uTime clock so it pulses in sync
    // with the ring. 2026-06-26 v2 — preview ring removed entirely; the
    // pending state is communicated by the HUD pill alone.
    tickMagnetBooster(this.magnetBooster, this.gameTimeSeconds);
    updateActiveRing(
      this.magnetActiveRing,
      this.magnetBooster.activeTier,
      activeRemainingSeconds(this.magnetBooster, this.gameTimeSeconds),
      deltaTime,
    );
    updateActiveField(
      this.magnetActiveField,
      this.magnetBooster.activeTier,
      activeRemainingSeconds(this.magnetBooster, this.gameTimeSeconds),
      deltaTime,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Active Deployment Tickers (Phase 7 Task 12)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Per-frame tickers for the 2 deployable active pickup kinds.
  //          Both functions return a pruned list — caller reassigns the
  //          field. The drone callback spawns a regular projectile at the
  //          nearest target; the missile callback applies damage and
  //          triggers destruction.
  // Setup:   Called once per frame from update(input). The drone ticker
  //          culls fully-faded deployments from this.activeDeployments;
  //          this method then sets the DRONES cooldown (the spec's 4s
  //          post-fade-out wait) only when a deployment was actually
  //          removed this frame. If the returned list is the same length
  //          as the input, no deployment ended and no cooldown is set.
  // Issues:  None.
  // Fix:     Phase 7 Task 12 (C1 fix). Earlier draft left the DRONES
  //          cooldown set inside consumeActiveCharge at press time, which
  //          violated the spec rule "cooldown starts AFTER the 6s active
  //          window expires". The fix: consumeActiveCharge no longer sets
  //          cooldownRemaining for deployable kinds; the Game sets it
  //          here, after tickDroneDeployments has confirmed the deployment
  //          has fully faded out.
  // Gotchas: `previousCount` is captured BEFORE the call, then compared
  //          with the post-call array length. A length drop of N means N
  //          deployments ended this frame — only set the cooldown when
  //          N > 0 (otherwise repeated calls with empty inputs would
  //          keep resetting the cooldown to 0 — a no-op but noisy).
  //          The "ORBIT_DRONES_COOLDOWN_SECONDS" set here is the SAME
  //          value ACTIVE_KIND_SPECS[ORBIT_DRONES].cooldownSeconds
  //          references; using the constant directly keeps the import
  //          visible at the call site for grep-ability.
  // ═══════════════════════════════════════════════════════════════════════════
  private updateActiveDeployments(deltaTime: number): void {
    const previousDroneCount = this.activeDeployments.length;
    this.activeDeployments = tickDroneDeployments(
      this.activeDeployments,
      this.ship.state.position,
      this.asteroids.map((a) => a.state),
      deltaTime,
      this.scene,
      // Phase 7i-2 (Task 6) — the onDroneFire callback used to invoke
      // this.fireDroneProjectile which spawned a tagged Projectile mesh.
      // The beam fire path (src/active-deployments.ts fireDroneBeam) now
      // drives the visual layer inline, so the callback is a no-op
      // (kept as a parameter for forward-compat with any future
      // Game-side hook — Task 9 will use it for the beamHitCallback
      // wiring). Damage application is also deferred to Task 9.
      () => {},
    );
    // Spec: DRONES cooldown starts AFTER the 6s active window + 0.3s fade.
    // We detect "deployment ended" by a length drop in the returned array.
    if (this.activeDeployments.length < previousDroneCount) {
      this.activeAmmo[PickupKind.ORBIT_DRONES].cooldownRemaining = ORBIT_DRONES_COOLDOWN_SECONDS;
    }
    // Phase 7b — tick the missile schedule FIRST so scheduled missiles enter
    // the live list in the same frame their stagger expires. The schedule
    // drains itself over the 0/180/360/540ms stagger; once all 4 missiles
    // have launched, the schedule is removed from the array.
    this.missileVolleySchedules = tickMissileVolleySchedules(
      this.missileVolleySchedules,
      this.ship.state.position,
      this.ship.state.aim,
      deltaTime,
      this.scene,
      this.homingMissiles,
    );
    // Phase 7 fix — capture which asteroids get destroyed this tick so we
    // can prune `this.asteroids` after tickHomingMissiles returns. The
    // prior implementation called onMissileImpact directly inside the
    // tick's iteration, but the callback never spliced the LiveAsteroid
    // out of this.asteroids — so subsequent missiles in the same volley
    // kept targeting the dead asteroid's frozen position, "flew past
    // nothing," and timed out at the 10s tracking duration. handleCollisions
    // and fireBombStrike already rebuild `this.asteroids` from a fresh
    // `alive` list inside their own loops; the missile path now mirrors
    // that pattern by pruning the destroyed wrappers here.
    //
    // Phase 7f-2 — parallel `tinyKnockbacks` map captures TINY pushes the
    // missile delivers instead of destroying. After the tick returns we
    // apply the velocity impulse to each LiveAsteroid's state in place
    // (no list rebuild — tinies stay in play). The knockback direction
    // is already a unit vector; we add it scaled by
    // HOMING_MISSILES_TINY_KNOCKBACK_SPEED to the asteroid's existing
    // velocity. This is what gives missiles their "shove tinies aside
    // and keep flying" behavior — see src/active-deployments.ts Phase
    // 7f-2 entry for the targeting + impact-branch details.
    const destroyedThisTick = new Set<AsteroidState>();
    const tinyKnockbacks = new Map<AsteroidState, Vector2>();
    this.homingMissiles = tickHomingMissiles(
      this.homingMissiles,
      this.asteroids.map((a) => a.state),
      deltaTime,
      this.scene,
      (asteroid) => {
        destroyedThisTick.add(asteroid);
        this.onMissileImpact(asteroid);
      },
      (asteroid, direction) => {
        tinyKnockbacks.set(asteroid, direction);
      },
      // Phase 7g — spawn the layered explosion VFX at the missile's last
      // known position when it is destroyed (either fuel-expiry or impact).
      // The factory's spawn is O(1) + a small randomized direction loop.
      (position, velocityDir) => {
        if (this.missileExplosionFactory) {
          this.missileExplosionFactory.spawn(position, velocityDir);
        }
      },
    );
    if (destroyedThisTick.size > 0) {
      this.asteroids = this.asteroids.filter((a) => !destroyedThisTick.has(a.state));
    }
    if (tinyKnockbacks.size > 0) {
      const knockSpeed = HOMING_MISSILES_TINY_KNOCKBACK_SPEED;
      this.asteroids = this.asteroids.map((a) => {
        const dir = tinyKnockbacks.get(a.state);
        if (!dir) return a;
        return {
          ...a,
          state: {
            ...a.state,
            velocity: {
              x: a.state.velocity.x + dir.x * knockSpeed,
              y: a.state.velocity.y + dir.y * knockSpeed,
            },
          },
        };
      });
    }
    // Tick the smoke pool (one InstancedMesh for all in-flight missiles).
    updateMissileSmoke(deltaTime);
    // Phase 7g — tick the missile explosion factory (shards + sparks + flash).
    // The factory's slot pools self-prune when particles exceed their lifetime.
    if (this.missileExplosionFactory) {
      this.missileExplosionFactory.update(deltaTime);
    }
    // Phase 7i Sprint 2 Task 6 — tick the drone-kill spark pools. Each entry
    // ages 0.4s before the tick path disposes its 12 sprites and removes
    // them from this.droneKillSparks. Safe to call every frame even when
    // the array is empty (filter on an empty array is a no-op).
    this.updateDroneKillSparks(deltaTime);
    // Phase 7i-2 hotfix — beam-vs-asteroid hit detection used to live at
    // the end of handleCollisions. handleCollisions is gated by the ship-
    // alive path (Game.update returns early when respawnPhase !== 'none'),
    // so a player death mid-deployment would freeze drone targeting + beam
    // hits. The beam visually stuck pointing at the last acquired (now
    // stale) asteroid position and any prior-frame pickup drops floated
    // in the world. Moving the check here (inside updateActiveDeployments,
    // which now runs before the respawn gate) keeps the entire drone
    // system live for the full 11s window regardless of ship state. The
    // ordering still respects projectile/asteroid prune: missiles and
    // projectiles don't interact with beam check (different hit channels)
    // so calling after tickDroneDeployments + tickHomingMissiles is safe.
    this.checkDroneBeamHits();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Drone Projectile Spawn Callback (Phase 7 Task 12 / Phase 7i Sprint 2) [REMOVED Phase 7i-2 Task 6]
  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 7i-2 (Task 6) — fireDroneProjectile was the per-drone fire
  // callback that spawned a tier-coloured projectile mesh and pushed it
  // onto this.projectiles. The beam fire path (src/active-deployments.ts
  // fireDroneBeam) replaces projectile fire with an instant red beam, so
  // this method is dead code as of Task 6. The My Rules + body are
  // deleted rather than stubbed so the call site in tickDroneDeployments
  // (which used to pass an onDroneFire callback invoking this method) can
  // stop invoking it. The pre-Task 6 history is preserved in
  // docs/superpowers/specs/2026-06-29-phase-7i-orbit-drone-polish-design.md
  // and the kill-sparks routing (projectile.state.source === 'DRONE')
  // in handleCollisions is preserved for any future drone source that
  // might re-introduce a tagged projectile. The per-kill sparks still
  // fire from KillSource.DRONE once Task 9 wires beam-vs-asteroid
  // damage through the new dep.beamHitCallback.

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Homing Missile Impact (Phase 7 Task 12)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Apply missile damage when a HomingMissileState reports an impact.
  //          The hit-test (hypot < 0.3) lives in `tickHomingMissiles`; this
  //          method only handles damage + destruction. Damage matches the
  //          existing projectile collision path in `handleCollisions`.
  // Setup:   Called from tickHomingMissiles via the onMissileImpact callback.
  //          The `asteroid` argument is an `AsteroidState` (the same object
  //          stored in LiveAsteroid.state) — we look up the wrapping
  //          LiveAsteroid to call destroyAsteroid (which handles iron vs
  //          crystal dispatch + scoring + VFX).
  // Issues:  None.
  // Fix:     Phase 7 Task 12. Iron always dies on a missile hit; crystal
  //          decrements health, then runs the existing fracture check +
  //          destroy cascade so a multi-hit crystal behaves identically
  //          to a multi-hit from a player projectile.
  // Gotchas: do NOT mutate `this.asteroids` directly here — build a
  //          replacement list inside the callback. `destroyAsteroid` does
  //          not splice the asteroid out of the array, so the wrapping
  //          loop in updateActiveDeployments still holds a reference. The
  //          outer update() never re-enters during the callback because
  //          tickHomingMissiles returns synchronously before the next
  //          ticker runs.
  // ═══════════════════════════════════════════════════════════════════════════
  private onMissileImpact(asteroid: AsteroidState): void {
    const live = this.asteroids.find((a) => a.state === asteroid);
    if (!live) return;
    live.state.health = Math.max(0, live.state.health - HOMING_MISSILES_DAMAGE);
    if (live.state.health <= 0) {
      this.destroyAsteroid(live, 'MISSILE');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Drone Beam Hit (Phase 7i-2 Task 9)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Apply damage when a drone beam (Phase 7i-2 Task 6) overlaps an
  //          asteroid. Wired through dep.beamHitCallback in useActiveItem
  //          so the dispatch lives in src/active-deployments.ts (it owns
  //          the per-drone currentBeamTarget pointer) and the damage logic
  //          lives here (it owns the asteroid list + scoring + sparks).
  // Setup:   Called from the per-frame intersection loop at the end of
  //          handleCollisions. Signature is (asteroid, tier) where tier
  //          is forwarded from the deployment (1/2/3) so the kill-sparks
  //          factory can use the tier-coloured sparks.
  // Issues:  Pre-Task 9, the beam was a visual-only fire dispatch (Task 6
  //          removed fireDroneProjectile). Asteroids took no damage from
  //          drone beams. Drones essentially did nothing gameplay-wise.
  // Fix:     Phase 7i-2 Task 9. TINY asteroids get a knockback impulse
  //          away from the ship (same pattern as the homing-missile TINY
  //          handling at lines 1976-1991) so the drone "shoves aside" the
  //          small fragments in its path. Non-TINY asteroids get a clean
  //          destroy with KillSource.DRONE — bomb/missile kills skip
  //          splitAsteroid (no children spawn, screen really clears), and
  //          we want the same feel for drone kills so the player sees a
  //          visible cause→effect (one shot = one kill). The drone-kill
  //          sparks spawn BEFORE destroyAsteroid so the sparks read as
  //          the kill's signature, not a delayed after-effect.
  // Gotchas: We do NOT look up the LiveAsteroid wrapper before applying
  //          TINY knockback — the missile path's tinyKnockbacks map-based
  //          approach (lines 1976-1991) batches velocity updates for ALL
  //          asteroids in a single map pass. The beam path only ever
  //          knocks ONE asteroid per callback (1 hit per beam), so the
  //          per-asteroid in-place map pattern is wasteful. Instead, we
  //          update the matched asteroid's velocity directly through a
  //          fresh array. This diverges slightly from the missile code
  //          path but is correct for the 1-hit-per-beam contract.
  //          KillSource is passed as the string literal 'DRONE' — the
  //          type is a union (`'BULLET' | 'BOMB' | 'MISSILE' | 'WALL' |
  //          'SHARD' | 'DRONE'`) NOT an enum, so the enum-import pattern
  //          used elsewhere in the engine does not apply. The string
  //          literal is what onMissileImpact uses on the line above
  //          (`destroyAsteroid(live, 'MISSILE')`) — same convention.
  // ═══════════════════════════════════════════════════════════════════════════
  private onDroneBeamHitAsteroid(asteroid: AsteroidState, tier: 1 | 2 | 3): void {
    if (asteroid.size === AsteroidSize.TINY) {
      // TINY: knockback away from the ship (the orbit center). Direction
      // is asteroid→ship normalized, then we add the impulse scaled by
      // HOMING_MISSILES_TINY_KNOCKBACK_SPEED to the asteroid's existing
      // velocity. Vector2 is readonly in this codebase, so we cannot
      // mutate asteroid.velocity in place — same pattern as
      // resolveAsteroidCollision in src/asteroid.ts:266. We map this.asteroids
      // to a new array; only the matched asteroid's wrapper is rebuilt.
      const shipPos = this.ship.state.position;
      const dx = shipPos.x - asteroid.position.x;
      const dy = shipPos.y - asteroid.position.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.01) {
        const dirX = dx / len;
        const dirY = dy / len;
        const speed = HOMING_MISSILES_TINY_KNOCKBACK_SPEED;
        this.asteroids = this.asteroids.map((a) => {
          if (a.state !== asteroid) return a;
          return {
            ...a,
            state: {
              ...a.state,
              velocity: {
                x: a.state.velocity.x + dirX * speed,
                y: a.state.velocity.y + dirY * speed,
              },
            },
          };
        });
      }
      return;
    }
    // Non-TINY: spawn kill-sparks at the impact point, then destroy the
    // asteroid with KillSource.DRONE. findByState pattern matches
    // onMissileImpact (line 2110) — the asteroid could have been culled
    // by a projectile in the same frame's handleCollisions loop above,
    // in which case we silently no-op (the player will see the sparks
    // AND the projectile kill, which reads as overkill, not a bug).
    const live = this.asteroids.find((a) => a.state === asteroid);
    if (!live) return;
    this.spawnDroneKillSparks(live.state.position);
    this.destroyAsteroid(live, 'DRONE');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // My Rules — Drone Kill Spark Spawn (Phase 7i Sprint 2 Task 6)
  // ══════════════════════════════════════════════════════════════════════════
  // Purpose: Spawn the 12-sprite additive burst at the position of an
  //          asteroid that was just killed by a drone-tagged projectile.
  //          Pushes the entry onto this.droneKillSparks for the per-frame
  //          tick in updateDroneKillSparks, AND adds all sprites to the
  //          scene with visible=true so they render on the very next frame.
  // Setup:   Called from handleCollisions ONLY when the destroying
  //          projectile's source tag is 'DRONE' (passed in via hitSource
  //          local). The tier is read from the active orbit-drone
  //          deployment; in Sprint 2 the deployment is always tier 1 so
  //          the `?? 1` fallback covers the rare "no active deployment"
  //          case (drone killed in the same frame the deployment began
  //          fading out).
  // Issues:  Pre-Phase 7i drone kills were silent — the only visual cue
  //          was the drone mesh itself, which was no longer relevant the
  //          instant the projectile collided.
  // Fix:     Phase 7i Sprint 2 Task 6. createDroneKillSparks emits 12
  //          outward-radiating sprites, each tinted to the deployment's
  //          tier color (cyan/magenta/gold). The tick path disposes the
  //          sprites when their 0.4s lifetime expires.
  // Gotchas: We flip sprite.visible=true AFTER scene.add so the
  //          spawn-at-origin frame never causes a single-frame flicker at
  //          z=0. The factory defaults to visible=false for that exact
  //          reason. This helper is the only writer of droneKillSparks;
  //          updateDroneKillSparks owns the read/eviction side.
  // ══════════════════════════════════════════════════════════════════════════
  private spawnDroneKillSparks(position: Vector2): void {
    const tier = (this.activeDeployments[0]?.tier ?? 1) as 1 | 2 | 3;
    const sparks = createDroneKillSparks(position, tier);
    this.droneKillSparks.push(sparks);
    for (const s of sparks.sprites) {
      this.scene.add(s);
      s.visible = true;
    }
  }

  private updateDroneKillSparks(deltaTime: number): void {
    this.droneKillSparks = this.droneKillSparks.filter((s) => {
      return !tickDroneKillSparks(s, deltaTime, this.scene);
    });
  }

  private updateSpawning(deltaTime: number): void {
    const cfg = this.controller.spawnConfig;
    cfg.nextSpawnIn -= deltaTime;
    if (cfg.nextSpawnIn <= 0) {
      this.spawnRandomAsteroid();
      cfg.nextSpawnIn = getSpawnInterval(this.wave);
    }
  }

  private spawnAsteroid(size: AsteroidSize, position: Vector2, velocity: Vector2, isTargeted = false, kind: AsteroidKind = AsteroidKind.IRON): void {
    const state = createAsteroidState(size, position, velocity, isTargeted, kind);
    const mesh = createAsteroidMesh(size, isTargeted, kind);
    mesh.position.set(position.x, position.y, 0);
    this.asteroids.push({ state, mesh, id: this.nextAsteroidId });
    this.nextAsteroidId += 1;
    this.scene.add(mesh);
  }

  private spawnCrystal(): void {
    const baseSpeed = getAsteroidBaseSpeed(this.wave);
    const position = this.controller.getSpawnPosition();
    const inward = this.controller.getSpawnVelocity();
    const inwardSpeed = Math.hypot(inward.x, inward.y);
    const speed = baseSpeed * 0.9;
    const velocity = inwardSpeed > 0
      ? { x: (inward.x / inwardSpeed) * speed, y: (inward.y / inwardSpeed) * speed }
      : { x: 0, y: -speed };
    this.spawnAsteroid(AsteroidSize.LARGE, position, velocity, false, AsteroidKind.CRYSTAL);
    this.crystalsSpawnedThisRun += 1;
    this.crystalsSpawnedThisWave += 1;
  }

  /**
   * Trigger the fracture state on a crystal: swap to the bright emissive
   * fractured material, spawn an electricity-arc LineSegments mesh, register
   * the burst scheduler, and announce it. Called from handleCollisions when
   * shouldCrystalFracture returns true.
   *
   * Phase 6c: cracked-vein canvas texture + perturbCrystalGeometry are gone.
   * The visual is now carried per-frame by:
   *   - emissiveIntensity pulse via crystalCharge
   *   - scale breathe ±5% via crystalCharge
   *   - CrystalLightning rebuilds + opacity flicker
   *   - Per-crystal CrystalBoltSparks emission bursts from the surface
   */
  private fractureCrystal(asteroid: LiveAsteroid): void {
    const crystalId = asteroid.id;
    asteroid.state.fractured = true;

    // 1. Swap to bright emissive fractured material (single MeshStandardMaterial).
    const fracturedMaterial = createFracturedMaterial();
    swapToFracturedMaterial(asteroid.mesh, fracturedMaterial);

    // 2. Build the CrystalLightning mesh and attach to scene.
    //    CrystalLightning takes only a seed; position is set per-frame in update().
    //    setResolution is a no-op kept for API compat with the old ExtrudingBolt
    //    signature — LightningStrike does not need viewport resolution.
    const bolt = new CrystalLightning(crystalId);
    bolt.setResolution(
      this.renderer.domElement.clientWidth,
      this.renderer.domElement.clientHeight,
    );
    bolt.attach(this.scene);
    this.crystalBolts.set(crystalId, bolt);

    // 2b. Per-crystal spark pool: one Points geometry per crystal, disposed
    //     with it. Sparks are emitted each frame from `updateCrystalVisuals`
    //     while charge > 0.
    const sparks = new CrystalBoltSparks(crystalId);
    this.scene.add(sparks.points);
    this.crystalSparks.set(crystalId, sparks);

    // 3. Register the burst scheduler with game-time as the clock.
    this.fractureSchedulers.set(crystalId, new CrystalFractureScheduler(crystalId, this.gameTimeSeconds));
    this.crystalDeathTimes.set(crystalId, this.gameTimeSeconds);
    this.crystalShardsAbsorbed.set(crystalId, 0);

    // 4. Announce it.
    this.spawnFloatingTextAt('FRACTURING!', asteroid.state.position, 0.0, '#66ddee');

    // 5. Camera shake on the fracture frame so the player feels the hit.
    this.cameraShakeAmplitude = Math.min(CAMERA_SHAKE_MAX_AMPLITUDE, Math.max(this.cameraShakeAmplitude, 0.5));
    this.cameraShakeRemaining = 0.4;
    this.isCrystalBurstFrame = true;
  }

  /**
   * Advance all crystal burst schedulers. Fires at most MAX_BURSTS_PER_FRAME
   * bursts total across all schedulers per call. Mutates the scheduler
   * state — callers should treat the returned list as a fresh snapshot.
   */
  private updateCrystalBursts(gameTime: number): void {
    let totalFired = 0;
    for (const [id, scheduler] of this.fractureSchedulers) {
      if (totalFired >= MAX_BURSTS_PER_FRAME) break;
      const target = this.findCrystalById(id);
      if (!target) continue;
      const result = scheduler.update(gameTime);
      for (const count of result.burstsToFire) {
        this.spawnBurst(target, count, scheduler);
        totalFired += 1;
        if (totalFired >= MAX_BURSTS_PER_FRAME) break;
      }
      if (result.done) {
        // Saturation cap reached — crystal is destroyed for +10 SURVIVOR.
        this.destroyCrystal(target);
        this.fractureSchedulers.delete(id);
      }
    }
  }

  /**
   * Find a LiveAsteroid by its stable id. O(n) but n is small (1-3 crystals
   * per wave).
   */
  private findCrystalById(id: number): LiveAsteroid | null {
    for (const asteroid of this.asteroids) {
      if (asteroid.state.kind === AsteroidKind.CRYSTAL && asteroid.id === id) {
        return asteroid;
      }
    }
    return null;
  }

  /**
   * Spawn a single burst of N shards from a crystal. Computes the cap-aware
   * actual count, attaches a telegraph, then dispatches the VFX. Wraps the
   * VFX in a try/catch so a single misbehaving crystal cannot freeze the
   * entire cascade.
   */
  private spawnBurst(
    target: LiveAsteroid,
    requestedCount: number,
    scheduler: CrystalFractureScheduler,
  ): void {
    try {
      const room = Math.max(0, MAX_SHARDS - this.activeShards.length);
      const actual = Math.min(requestedCount, room);
      const angles = generateShardSpawnAngles(actual, 0.2);
      this.isCrystalBurstFrame = true;

      // Burst-shape telegraph: a 0.15s preview of where shards will go.
      // Phase 6d follow-up (round 3): telegraph lines disabled per user
      // feedback. The user said 'disable all these effects, and return
      // the lightling' — the cyan radial spike lines were reading as
      // additional 'blooming light flashes' and drawing attention away
      // from the actual lightning. Shards still spawn at the burst
      // frame; only the preview lines are gone. Re-enable by uncommenting:
      //   if (actual === requestedCount && actual > 0) {
      //     this.spawnTelegraph(target.state.position, angles, this.gameTimeSeconds + TELEGRAPH_DURATION_SECONDS, actual);
      //   }

      // Spawn the actual shards (after the telegraph finishes). The telegraph
      // is purely visual — the shards are dispatched now because the player
      // will see the telegraph for TELEGRAPH_DURATION_SECONDS then the real
      // shards immediately after. The shard creation itself is also capped
      // by room above.
      for (const angle of angles) {
        const state = createShard(target.state.position, angle, target.id);
        const mesh = createShardMesh();
        mesh.position.set(state.position.x, state.position.y, 0);
        orientShard(mesh, state.angle);
        this.activeShards.push({ state, mesh });
        this.scene.add(mesh);
      }

      // Shockwave ring at the crystal position.
      const intensity = 0.5 + 0.5 * (actual / 24);
      this.activeShockwaves.push(new Shockwave(target.state.position, 0x55ccdd, intensity));

      // Floating text — never lie about counts.
      if (actual === requestedCount && actual > 0) {
        this.spawnFloatingTextAt(`+${actual}`, target.state.position, 0.0, '#ff5544');
      } else if (actual > 0) {
        this.spawnFloatingTextAt('+SATURATED', target.state.position, 0.0, '#888888');
      } else {
        this.spawnFloatingTextAt('+0 SHARDS', target.state.position, 0.0, '#888888');
      }

      // Camera shake — take max with prior frame, never overwrite.
      const shake = Math.min(1.0, actual / 24);
      this.cameraShakeAmplitude = Math.min(
        CAMERA_SHAKE_MAX_AMPLITUDE,
        Math.max(this.cameraShakeAmplitude, shake),
      );
      this.cameraShakeRemaining = Math.max(this.cameraShakeRemaining, 0.3);
    } catch (e) {
      console.error('[crystal-burst]', e);
    }
  }

  private spawnTelegraph(position: Vector2, angles: readonly number[], spawnAt: number, count: number): void {
    const mesh = createBurstTelegraph(position, angles);
    this.scene.add(mesh);
    this.pendingTelegraphs.push({ mesh, position, angles, spawnAt, count });
  }

  private updatePendingTelegraphs(gameTime: number): void {
    const alive: PendingTelegraph[] = [];
    for (const pending of this.pendingTelegraphs) {
      if (gameTime >= pending.spawnAt) {
        this.scene.remove(pending.mesh);
        pending.mesh.geometry.dispose();
        (pending.mesh.material as Material).dispose();
      } else {
        alive.push(pending);
      }
    }
    this.pendingTelegraphs = alive;
  }

  /**
   * Drive every visual channel of every fractured crystal each frame:
   *   - emissiveIntensity pulse (via crystalCharge)
   *   - scale breathe ±5% (via crystalCharge)
   *   - electricity-arc opacity + flicker (via crystalCharge^2 for a
   *     sharper pre-burst ramp)
   *   - spark emission bursts from the surface
   * Single source of truth so all four channels peak together at the
   * pre-burst moment, reading as one coherent "about to burst" signal.
   *
   * Phase 6c rewrite: replaced the old cracked-texture pulse + position
   * shake with the new effects suite. Position shake was kept (cheap and
   * adds character).
   */
  private updateCrystalVisuals(deltaTime: number, gameTime: number): void {
    for (const [id, scheduler] of this.fractureSchedulers) {
      const target = this.findCrystalById(id);
      if (!target) continue;
      const fracturedMaterial = (target.mesh.userData as CrystalMeshUserData).fracturedMaterial;
      if (!fracturedMaterial) continue;
      // Phase 6d follow-up (round 5): scale breathe, position shake,
      // and yellow spark emission re-enabled. The user said 're-enble
      // Scale breathe / Position shake / Yellow spark particles' —
      // the bolt is now bright + thick enough (round 5) to be the
      // dominant FX, so these supporting FX no longer drown it out.
      // Emissive body pulse and telegraph lines stay disabled; those
      // were the actual "blooming light flash" offenders.
      const timeToNext = scheduler.getTimeToNextBurst(gameTime);
      const charge = crystalCharge(timeToNext);
      // Scale breathe: 1.0 baseline → 1.05 peak pre-burst. Uses charge² so
      // the breathe "stretches" only in the final third of the interval —
      // matches the visual intuition of a charging capacitor.
      const breathe = 1.0 + 0.05 * charge * charge;
      // Continuous shake of the mesh position (kept from Phase 6b).
      const shakeSeed = (target.mesh.userData as CrystalMeshUserData).shakeSeed ?? id;
      const shakeX = 0.05 * Math.sin(gameTime * Math.PI * 2 * 20 + shakeSeed) + 0.025 * Math.sin(gameTime * Math.PI * 2 * 37 + shakeSeed + 1.7);
      const shakeY = 0.05 * Math.sin(gameTime * Math.PI * 2 * 20 + shakeSeed + 0.3) + 0.025 * Math.sin(gameTime * Math.PI * 2 * 37 + shakeSeed + 2.0);
      target.mesh.position.set(
        target.state.position.x + shakeX,
        target.state.position.y + shakeY,
        0,
      );
      target.mesh.scale.set(breathe, breathe, 1);
      // Drive the crystal lightning — strike geometry regenerated each frame
      // inside CrystalLightning.update via LightningStrike.update(currentTime),
      // opacity tracks crystalCharge so the bolts only really light up just
      // before a burst.
      const crystalRadius = SIZE_RADIUS[target.state.size];
      const bolt = this.crystalBolts.get(id);
      if (bolt) {
        bolt.update(deltaTime, charge, target.state.position, crystalRadius, id);
      }
      // Phase 6e — body-emissive telegraph. The fractured material's
      // onBeforeCompile injection reads uTime (for the pulse rhythm) and
      // uCharge (drives the fresnel rim + 3-stage color shift). The
      // timeAccum lives on the material's userData; it is wiped to
      // undefined by disposeAsteroidMesh when the crystal is destroyed.
      const telegraphUserData = fracturedMaterial.userData as { timeAccum?: number };
      const prevTime = telegraphUserData.timeAccum ?? 0;
      const nextTime = prevTime + deltaTime;
      telegraphUserData.timeAccum = nextTime;
      updateFracturedMaterialTelegraph(fracturedMaterial, nextTime, charge);
      // Yellow sparks disabled (Phase 6d round 6). The user said
      // '-disbale Yellow spark particles' — they're reading as
      // visual noise against the now-dominant bolt and the
      // re-enabled breathe / shake. The pool is still constructed
      // and ticked (sparks.update) so any in-flight particles age
      // out cleanly within SPARK_LIFETIME_SECONDS (0.6s), and the
      // dispose chain in destroyCrystal stays simple. Re-enable by
      // uncommenting the sparks.emit() line.
      const sparks = this.crystalSparks.get(id);
      if (sparks) {
        // sparks.emit(charge, target.state.position, crystalRadius, deltaTime, 0.65);
        sparks.update(deltaTime);
      }
    }
  }

  private spawnCrystalDeathTween(target: LiveAsteroid): void {
    if (this.crystalDeathTweens.length >= CRYSTAL_DEATH_TWEEN_POOL_CAP) {
      // Snap-remove the oldest tween to stay under the cap.
      const oldest = this.crystalDeathTweens.shift();
      if (oldest) {
        this.scene.remove(oldest.mesh);
        disposeAsteroidMesh(oldest.mesh);
      }
    }
    const userData = target.mesh.userData as CrystalMeshUserData;
    const fracturedMaterial = userData.fracturedMaterial ?? (target.mesh.children[0] as Mesh).material as MeshStandardMaterial;
    this.crystalDeathTweens.push({
      mesh: target.mesh,
      fracturedMaterial,
      age: 0,
      duration: CRYSTAL_DEATH_TWEEN_DURATION,
      position: { x: target.state.position.x, y: target.state.position.y },
    });
    // No floating text here — destroyCrystal already emits the tier/hook text
    // at the kill site with proper staggered vertical + temporal offsets.
    // Spawning a second copy here would cause a duplicate at the same pixel.
  }

  private updateCrystalDeathTweens(deltaTime: number): void {
    const alive: CrystalDeathTween[] = [];
    for (const tween of this.crystalDeathTweens) {
      tween.age += deltaTime;
      const t = Math.min(1, tween.age / tween.duration);
      // Cubic ease-out: 1 - (1-t)^3
      const easeOut = 1 - (1 - t) * (1 - t) * (1 - t);
      const scale = 1.0 + 0.6 * easeOut;
      tween.mesh.scale.set(scale, scale, scale);
      // Fade opacity 1.0 → 0 over the tween duration. Phase 6c follow-up:
      // `transparent: true` is now set at material creation (see
      // createFracturedMaterial) so this fade actually works without a
      // mid-render shader recompile. Previously the runtime
      // `transparent = true` here caused the inner mesh to render with a
      // disposed/garbage material state for one frame after t=1, which
      // read as "marks that don't disappear" on the screen.
      tween.fracturedMaterial.opacity = 1.0 - t;
      if (t >= 1) {
        this.scene.remove(tween.mesh);
        // disposeAsteroidMesh traverses children and disposes BOTH the
        // geometry AND the fracturedMaterial (set on userData). The inner
        // Mesh inside the Group also shares this material instance via
        // swapToFracturedMaterial — disposeAsteroidMesh handles that by
        // skipping the material.dispose() if it's already disposed
        // (Three.js's dispose() is idempotent).
        disposeAsteroidMesh(tween.mesh);
      } else {
        alive.push(tween);
      }
    }
    this.crystalDeathTweens = alive;
  }

  private updateShockwaveList(deltaTime: number): void {
    this.activeShockwaves = updateShockwaves(this.activeShockwaves, this.scene, deltaTime);
  }

  private applyCameraShake(deltaTime: number): void {
    if (this.cameraShakeRemaining <= 0) {
      this.cameraShakeAmplitude = 0;
      return;
    }
    this.cameraShakeRemaining = Math.max(0, this.cameraShakeRemaining - deltaTime);
    const decay = Math.pow(0.5, deltaTime / CAMERA_SHAKE_HALF_LIFE);
    this.cameraShakeAmplitude *= decay;
    const shakeX = (Math.random() - 0.5) * this.cameraShakeAmplitude * 2;
    const shakeY = (Math.random() - 0.5) * this.cameraShakeAmplitude * 2;
    this.camera.position.x = shakeX;
    this.camera.position.y = shakeY;
    if (this.cameraShakeRemaining <= 0) {
      this.camera.position.x = 0;
      this.camera.position.y = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Bomb Core Flash (Phase 7b)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose:  Tick the layer-1 hot-core flash spawned by fireBombStrike. The
  //           flash is a single additive sphere that scales 1.0→2.0× and
  //           fades 0.7→0.0 over 0.1s; when the tween ends the mesh +
  //           geometry + material are disposed. Multiple concurrent bombs
  //           each get their own entry.
  // Setup:    Called from update(deltaTime) alongside updateShockwaveList.
  //           Reads this.activeCoreFlashes; mutates the array in place
  //           (prune-and-replace pattern, same as updateShards / tweens).
  // Issues:   None.
  // Fix:      Phase 7b Task 8. The pre-Task-8 fireBombStrike had no
  //           "focal point" — the player saw a ring expand but no white-hot
  //           center. The core flash gives the bomb a clear origin so the
  //           eye knows where the explosion began, then the rings expand
  //           outward from that point.
  // Gotchas:  flash.mesh.material is a MeshBasicMaterial — must cast to
  //           call .dispose() cleanly. t ≥ 1.0 entries are disposed
  //           BEFORE they're dropped from the array (otherwise their
  //           GPU resources would leak). alive.push() comes AFTER dispose
  //           for the pruning case but BEFORE for the keep case — the
  //           `continue` in the prune branch prevents fall-through.
  // ═══════════════════════════════════════════════════════════════════════════
  private updateCoreFlashes(deltaTime: number): void {
    const alive: { mesh: Mesh; age: number; duration: number }[] = [];
    for (const flash of this.activeCoreFlashes) {
      flash.age += deltaTime;
      const t = flash.age / flash.duration;
      if (t >= 1.0) {
        this.scene.remove(flash.mesh);
        flash.mesh.geometry.dispose();
        (flash.mesh.material as MeshBasicMaterial).dispose();
        continue;
      }
      const scale = 1.0 + t * 1.0; // 0.5u → 1.0u
      flash.mesh.scale.set(scale, scale, scale);
      (flash.mesh.material as MeshBasicMaterial).opacity = 0.7 * (1.0 - t);
      alive.push(flash);
    }
    this.activeCoreFlashes = alive;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Bomb Edge Flash (Phase 7b)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose:  Trigger the screen-edge DOM flash for the bomb. The
  //           #bomb-edge-flash <div> is created lazily on first bomb (so it
  //           never appears in the DOM unless the player actually uses a
  //           bomb) and the opacity is reset to 1 then forced to 0 via a
  //           reflow so the CSS transition fires.
  // Setup:    Called from fireBombStrike. Writes to
  //           this.bombEdgeFlashElement and to document.body (only on the
  //           first call). The CSS transition is `opacity 120ms ease-out`
  //           from index.html.
  // Issues:   The first attempted version set `el.style.opacity = '0'`
  //           immediately after `el.style.opacity = '1'` and the browser
  //           coalesced the two writes into a single frame — no transition
  //           fired and the screen never flashed. The `void el.offsetHeight`
  //           line is a deliberate reflow trigger to force the browser to
  //           paint the opacity:1 frame before scheduling the opacity:0
  //           transition.
  // Fix:      Phase 7b Task 8. The original Task-12 bomb had no screen
  //           flash — the rings stayed near the ship and the rest of the
  //           screen was unaffected, making a 6u radius explosion read as
  //           a 1u radius one. The edge flash gives the explosion a
  //           peripherally-visible cue that survives even when the rings
  //           are off-screen.
  // Gotchas:  The element is `mix-blend-mode: screen` so the orange tint
  //           only affects the dark areas of the background — the player's
  //           ship and shield stay readable. Re-triggering a flash while
  //           one is still in the 120ms fade resets the opacity to 1 and
  //           starts a new transition; subsequent bombs therefore always
  //           produce a visible flash, never a "missed" one because the
  //           previous transition hadn't completed.
  // ═══════════════════════════════════════════════════════════════════════════
  private triggerBombEdgeFlash(): void {
    if (!this.bombEdgeFlashElement) {
      this.bombEdgeFlashElement = document.createElement('div');
      this.bombEdgeFlashElement.id = 'bomb-edge-flash';
      document.body.appendChild(this.bombEdgeFlashElement);
    }
    const el = this.bombEdgeFlashElement;
    el.style.opacity = '1';
    // Force reflow so the transition triggers.
    void el.offsetHeight;
    el.style.opacity = '0';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Bomb Strike 3-Phase Time Sequence (Phase 7c)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Phase 7c — make the bomb moment a deliberate "I just changed
  //          everything" beat instead of an additive-soup 6-layer peak. The
  //          3 phases (screen flash → freeze → punch-zoom) all fire at T+0
  //          and last 60-100ms; the existing 6 layers are time-staggered
  //          inside fireBombStrike so their peaks spread across 1.2s.
  // Setup:   triggerScreenFlash + triggerBombPunchZoom are called from
  //          fireBombStrike. updateBombVisuals is called from update(dt) to
  //          decrement the 3 counters and remove CSS classes at zero.
  // Issues:  Phase 7b's 6 layers all peaked in the same frame — the eye saw
  //          a momentary bright blob, not a controlled blast.
  // Fix:     DOM white-flash (CSS class .active on #screen-flash, 80ms ease-
  //          out) provides zero-WebGL screen-level punctuation. Freeze-frame
  //          (2 ticks skipped) is the "bullet time" beat — the player sees
  //          the rings expand while asteroids are frozen. CSS punch-zoom
  //          (canvas scale 1.02, 100ms ease-out) is the "I just hit something"
  //          feedback. None of these cost any new GPU resources.
  // Gotchas:  screenFlashElement is created lazily on first bomb (same
  //          pattern as bombEdgeFlashElement). The canvas wrapper is the
  //          canvas's parentNode — the CSS transform applies to the canvas
  //          directly because the canvas is what owns the 3D viewport. The
  //          freeze-frame counter is checked FIRST in update(dt) and skips
  //          the entire simulation pass; HUD effects (camera shake, floating
  //          text) still tick so the world does not feel completely paused.
  // ═══════════════════════════════════════════════════════════════════════════

  private triggerScreenFlash(): void {
    if (!this.screenFlashElement) {
      this.screenFlashElement = document.getElementById('screen-flash') as HTMLDivElement | null;
      if (!this.screenFlashElement) {
        // Fallback: create it manually if index.html hasn't loaded (e.g., in tests).
        this.screenFlashElement = document.createElement('div');
        this.screenFlashElement.id = 'screen-flash';
        document.body.appendChild(this.screenFlashElement);
      }
    }
    this.screenFlashElement.classList.add('active');
    this.screenFlashRemaining = SCREEN_FLASH_DURATION_SECONDS;
  }

  private triggerBombPunchZoom(): void {
    const canvas = this.renderer.domElement;
    canvas.classList.add('punch-zoom');
    this.punchZoomRemaining = PUNCH_ZOOM_DURATION_SECONDS;
  }

  private updateBombVisuals(deltaTime: number): void {
    if (this.screenFlashRemaining > 0) {
      this.screenFlashRemaining = Math.max(0, this.screenFlashRemaining - deltaTime);
      if (this.screenFlashRemaining <= 0 && this.screenFlashElement) {
        this.screenFlashElement.classList.remove('active');
      }
    }
    if (this.punchZoomRemaining > 0) {
      this.punchZoomRemaining = Math.max(0, this.punchZoomRemaining - deltaTime);
      if (this.punchZoomRemaining <= 0) {
        this.renderer.domElement.classList.remove('punch-zoom');
      }
    }
  }

  private spawnRandomAsteroid(): void {
    // Crystal gating: at wave 3+, occasionally swap a normal LARGE spawn for a
    // crystal. Per-wave quota enforced by `crystalsSpawnedThisWave` so a single
    // wave cannot spawn more than its share even if the 35% roll fires many
    // times in a row.
    const waveNumber = this.wave.waveNumber;
    const perWaveQuota = waveNumber < 6 ? 1 : waveNumber < 9 ? 2 : 3;
    if (
      waveNumber >= 3 &&
      this.crystalsSpawnedThisRun < waveNumber - 2 &&
      this.crystalsSpawnedThisWave < perWaveQuota &&
      Math.random() < 0.35
    ) {
      this.spawnCrystal();
      return;
    }

    const baseSpeed = getAsteroidBaseSpeed(this.wave);
    const position = this.controller.getSpawnPosition();
    this.asteroidSpawnCount += 1;

    const isTargeted = this.asteroidSpawnCount % 4 === 0;
    let velocity: Vector2;
    if (isTargeted) {
      const dx = this.ship.state.position.x - position.x;
      const dy = this.ship.state.position.y - position.y;
      const distance = Math.hypot(dx, dy);
      const speed = baseSpeed * 1.2;
      if (distance > 0.01) {
        velocity = { x: (dx / distance) * speed, y: (dy / distance) * speed };
      } else {
        const inward = this.controller.getSpawnVelocity();
        const inwardSpeed = Math.hypot(inward.x, inward.y);
        velocity = inwardSpeed > 0
          ? { x: (inward.x / inwardSpeed) * speed, y: (inward.y / inwardSpeed) * speed }
          : { x: 0, y: -speed };
      }
    } else {
      const inward = this.controller.getSpawnVelocity();
      const inwardSpeed = Math.hypot(inward.x, inward.y);
      const speed = baseSpeed * (0.8 + Math.random() * 0.4);
      velocity = inwardSpeed > 0
        ? { x: (inward.x / inwardSpeed) * speed, y: (inward.y / inwardSpeed) * speed }
        : { x: 0, y: -speed };
    }

    this.spawnAsteroid(AsteroidSize.LARGE, position, velocity, isTargeted);
  }

  private handleAsteroidCollisions(): void {
    for (let i = 0; i < this.asteroids.length; i += 1) {
      const a = this.asteroids[i];
      for (let j = i + 1; j < this.asteroids.length; j += 1) {
        const b = this.asteroids[j];
        const aRadius = SIZE_RADIUS[a.state.size];
        const bRadius = SIZE_RADIUS[b.state.size];
        if (circlesCollide(a.state.position, aRadius, b.state.position, bRadius)) {
          resolveAsteroidCollision(a.state, b.state);
        }
      }
    }
  }

  private handleCollisions(): void {
    const aliveAsteroids: LiveAsteroid[] = [];

    for (const asteroid of this.asteroids) {
      let hit = false;
      // Phase 7i Sprint 2 Task 6 — tag the projectile that actually collides
      // so the destroy branch can fan out into drone-specific visuals. The
      // default 'BULLET' covers the legacy single-shot path; 'DRONE' is set
      // by fireDroneProjectile on every drone-fired projectile (see
      // Projectile.source in src/types.ts).
      let hitSource: KillSource = 'BULLET';
      const asteroidRadius = SIZE_RADIUS[asteroid.state.size];
      const remainingProjectiles: LiveProjectile[] = [];

      for (const projectile of this.projectiles) {
        if (!hit && circlesCollide(asteroid.state.position, asteroidRadius, projectile.state.position, PROJECTILE_RADIUS)) {
          hit = true;
          // Crystals track damage (multi-hit). Iron asteroids die on any hit,
          // matching pre-Phase 6 behavior — Iron Slag has 1 HP for SMALL/TINY
          // and 2/4 for MEDIUM/LARGE, but they were always 1-shot in practice
          // because splitAsteroid was called from destroyAsteroid unconditionally.
          // For crystals (6 HP), we subtract 1 here and let the threshold check
          // below decide whether to fracture or destroy.
          if (asteroid.state.kind === AsteroidKind.CRYSTAL) {
            asteroid.state.health = Math.max(0, asteroid.state.health - 1);
          }
          // Phase 7i-2 (Task 6) — drone-tagged projectile branch was
          // removed because beam fire replaces projectile fire. The
          // source field is now 'BULLET' | 'BOMB' | undefined; no
          // projectile can carry 'DRONE' anymore. The drone-kill sparks
          // are re-wired in Task 9 to fire from the new
          // DroneDeploymentState.beamHitCallback when a beam actually
          // hits an asteroid. The spawnDroneKillSparks method itself
          // stays in place (now only called from Task 9).
          this.disposeProjectile(projectile);
        } else {
          remainingProjectiles.push(projectile);
        }
      }
      this.projectiles = remainingProjectiles;

      if (hit) {
        // Iron asteroids always die on a hit (pre-Phase 6 behavior).
        if (asteroid.state.kind === AsteroidKind.IRON) {
          this.destroyAsteroid(asteroid, hitSource);
          continue;
        }

        // Crystal branch: check threshold before destroying — if it fractured
        // this frame, swap to the cracked material, perturb geometry, register
        // the burst scheduler, and skip the destroy. The player still has to
        // finish it off and the cascade will fire 1→2→4→8→16→24 shards over 10s.
        if (shouldCrystalFracture(asteroid.state)) {
          this.fractureCrystal(asteroid);
          aliveAsteroids.push(asteroid);
          continue;
        }

        if (asteroid.state.health <= 0) {
          this.destroyAsteroid(asteroid, hitSource);
          continue;
        }
        // Non-fatal hit on a crystal: keep it alive so the player can still
        // commit to a clean kill or watch it fracture on a future hit.
        aliveAsteroids.push(asteroid);
        continue;
      }

      let keepAsteroid = true;
      if (circlesCollide(asteroid.state.position, asteroidRadius * 0.85, this.ship.state.position, SHIELD_RADIUS)) {
        if (absorbHit(this.shield, asteroid.state)) {
          keepAsteroid = this.onShieldAbsorbedHit(asteroid, asteroid.state);
        } else {
          this.respawnShip();
          return;
        }
      }

      if (keepAsteroid) {
        aliveAsteroids.push(asteroid);
      }
    }

    this.asteroids = aliveAsteroids;
  }

  // Phase 7i-2 (Task 9) — beam-vs-asteroid hit detection. For every
  // active deployment, for every drone with a currentBeamTarget, check
  // whether the line segment drone→target passes within
  // (BEAM_HIT_RADIUS + asteroid.radius) of each asteroid's centre. If so,
  // call dep.beamHitCallback (set in useActiveItem at deploy time) which
  // applies TINY-knockback or destroyAsteroid + the kill-sparks VFX.
  //
  // The per-beam-once throttling lives in PerDroneState.beamHasHitTarget
  // (see src/active-deployments.ts Task 9 DELTA): fireDroneBeam sets it
  // false on every shot, and the first hit in this loop flips it true
  // via the closure. Subsequent frames within the same 0.25s beam window
  // see true and short-circuit.
  //
  // We iterate asteroids via .state so the callback gets the same
  // AsteroidState the rest of the engine uses; lookup to LiveAsteroid
  // happens inside onDroneBeamHitAsteroid.
  //
  // **Phase 7i-2 hotfix — respawn-gate independent hit check.**
  // The original location was at the end of handleCollisions. handleCollisions
  // is gated by the ship-alive path: if the player dies mid-deployment the
  // respawn early-return at the top of Game.update() skips EVERY per-frame
  // ticker, including updateActiveDeployments and handleCollisions. Result:
  // the deployment's elapsedSeconds/remaining/sceneClock freeze, the drone
  // re-acquires no new target, and the in-flight beam visually sticks pointing
  // at the last acquired (now stale) asteroid position. The pickup drop
  // (maybeDropPickup inside onDroneBeamHitAsteroid → destroyAsteroid) also
  // pauses — but the *prior frame's* beam hits still spawned pickups which
  // drift in space and get collected when the player respawns, giving the
  // "shoots into middle space and produces a collectable" impression.
  // Extraction into a standalone method (called from updateActiveDeployments,
  // which now runs BEFORE the respawn gate) keeps the entire drone system
  // (tick + targeting + fire + hit detection) live for the full 11s window
  // the player paid for, regardless of ship state.
  private checkDroneBeamHits(): void {
    for (const dep of this.activeDeployments) {
      if (dep.fadeTimer > 0) continue; // no hits during fade-out
      for (const drone of dep.perDrone) {
        if (!drone.currentBeamTarget) continue;
        if (drone.beamHasHitTarget) continue; // per-beam-once gate
        if (!drone.beamLine || !drone.beamLine.visible) continue;
        const target = drone.currentBeamTarget;
        // Phase 7i-2 hotfix — stale-target check. currentBeamTarget is
        // set once at fire time and only cleared at end-of-beam-life or
        // when the hit loop BELOW finds the asteroid. If the asteroid
        // was destroyed by ANOTHER system (player blaster shot, sibling
        // drone's beam) between fire time and this frame, it has been
        // removed from this.asteroids by the destroyedThisTick filter
        // at line ~2098. The hit loop iterates this.asteroids, so it
        // never finds the dead asteroid and clearDroneBeam is never
        // called — the beam keeps pointing at the dead position for
        // the full 0.25s lifetime. The fix: if currentBeamTarget is
        // not in this.asteroids, clear immediately. The distributed
        // picker (findDistributedDroneTargets) will hand the drone a
        // fresh target next frame, so it can fire again right away.
        let targetStillLive = false;
        for (const live of this.asteroids) {
          if (live.state === target) {
            targetStillLive = true;
            break;
          }
        }
        if (!targetStillLive) {
          clearDroneBeam(drone);
          continue;
        }
        for (const live of this.asteroids) {
          const radius = SIZE_RADIUS[live.state.size];
          const dist = pointToSegmentDistance(
            live.state.position.x, live.state.position.y,
            drone.mesh.position.x, drone.mesh.position.y,
            target.position.x, target.position.y,
          );
          if (dist <= BEAM_HIT_RADIUS + radius) {
            if (dep.beamHitCallback) {
              dep.beamHitCallback(live.state, dep.tier);
            }
            drone.beamHasHitTarget = true;
            // Phase 7i-2 hotfix — clearDroneBeam hides the beam mesh
            // AND nulls drone.currentBeamTarget so the beam doesn't keep
            // pointing at the destroyed asteroid's last-known position
            // for the remaining 0.25s beam lifetime. Without this, the
            // visual "shoots into middle space" (the destroyed FX
            // position near origin) for a quarter second after every
            // hit. The beam's own per-frame tick also clears
            // currentBeamTarget when beamAge >= BEAM_LIFETIME — this
            // just makes the cut-off immediate.
            clearDroneBeam(drone);
            break; // one hit per beam — no need to test other asteroids
          }
        }
      }
    }
  }

  private destroyAsteroid(target: LiveAsteroid, source: KillSource = 'BULLET'): void {
    // Single dispatch on kind — the iron path stays exactly as it was before
    // Phase 6b; the crystal path lives in destroyCrystal (scoring + cascade
    // cleanup + death explosion VFX).
    // Phase 7c — `source` is forwarded to destroyIronAsteroid so bomb/missile
    // kills skip splitAsteroid (no children spawned, screen really clears).
    if (target.state.kind === AsteroidKind.CRYSTAL) {
      this.destroyCrystal(target);
      return;
    }
    this.destroyIronAsteroid(target, source);
  }

  private destroyIronAsteroid(target: LiveAsteroid, source: KillSource = 'BULLET'): void {
    const multiplier = isInsideBreatherZone(this.breather, this.ship.state.position)
      ? BREATHER_SCORE_MULTIPLIER
      : 1.0;
    awardBreak(this.wave, target.state.size, multiplier);
    this.spawnScrapFromAsteroid(target);
    // Phase 7 — pickup drop. Iron LARGE has a 10% chance; other iron sizes
    // never drop. maybeDropPickup already encapsulates the roll so this call
    // is the entire hook.
    const dropKind = maybeDropPickup(target.state);
    if (dropKind !== null) this.spawnPickup(dropKind, target.state.position);
    this.scene.remove(target.mesh);
    disposeAsteroidMesh(target.mesh);
    // Phase 7c — bomb/missile kills skip splitAsteroid so a 10-damage one-shot
    // actually clears the screen instead of replacing the killed asteroid with
    // 2 MEDIUM children. Bullet/wall kills keep splitting (classic Asteroids
    // behavior). SHARD splits via its own dispatcher (also a child-spawn path)
    // so it falls under the BULLET-like default.
    if (shouldSplitForKillSource(source)) {
      const children = splitAsteroid(target.state);
      for (const child of children) {
        this.spawnAsteroid(child.size, child.position, child.velocity);
      }
    }
  }

  /**
   * Single home for crystal destruction (Phase 6b fix H6). Computes the
   * score tier, applies CLUTCH + PERFECT hook bonuses, spawns the death
   * explosion, and cleans up scheduler / counter maps. The iron path above
   * is byte-for-byte the original destroyAsteroid body.
   */
  private destroyCrystal(target: LiveAsteroid): void {
    const crystalId = this.crystalIdFor(target);
    const fractureStart = this.crystalDeathTimes.get(crystalId) ?? this.gameTimeSeconds;
    const elapsed = Math.max(0, this.gameTimeSeconds - fractureStart);
    const shardsAbsorbed = this.crystalShardsAbsorbed.get(crystalId) ?? 0;

    // Score tier (CLEAN / ULTRA / LATE / SURVIVOR) based on elapsed fracture time.
    const tier = computeTimeBonusTier(elapsed);

    // Hook bonuses: CLUTCH (tight-timing kill) and PERFECT (zero-shard run).
    let hookBonus = 0;
    const hookTexts: { text: string; color: string }[] = [];
    const scheduler = this.fractureSchedulers.get(crystalId);
    if (scheduler && isClutchApplicable(elapsed, scheduler.getTimeToNextBurst(this.gameTimeSeconds))) {
      hookBonus += 15;
      hookTexts.push({ text: '+15 CLUTCH', color: '#ff44ff' });
    }
    if (isPerfectApplicable(shardsAbsorbed)) {
      hookBonus += 250;
      // Vivid lime — rare and rewarding.
      hookTexts.push({ text: '+250 PERFECT', color: '#aaff00' });
    }

    // Apply scoring — base crystal score gets the breather 2× multiplier, but
    // tier and hook bonuses do not (per 4th-pass review decision).
    const inBreather = isInsideBreatherZone(this.breather, this.ship.state.position);
    const baseCrystalScore = inBreather ? tier.bonus * BREATHER_SCORE_MULTIPLIER : tier.bonus;
    this.wave.score += baseCrystalScore + hookBonus;

    // Floating text: tier label (if any) + hook labels, staggered so they
    // read as a clear vertical cascade rather than a tangled pile. Each text
    // gets 95px of vertical room and 0.6s of temporal headroom so the player
    // can actually read each line before the next appears. Horizontal fan-out
    // (±55px per text) keeps the lines from stacking directly on top of one
    // another when several share the same spawn instant. A per-kill y-offset
    // (rotating 0/30/60/90px via crystalKillIndex) breaks ties between
    // simultaneous crystal kills that happen to project to the same y-pixel
    // — otherwise 3 simultaneous kills spawn 9 texts all sharing the same
    // vertical band.
    //
    // Setup:  crystalKillIndex is a Game-level counter incremented once per
    //         crystal kill (and reset to 0 in both round-reset and
    //         respawn-clear sites). 4 positions are enough for the realistic
    //         max simultaneous kills (most kills land 1-at-a-time when the
    //         burst-blasts land; 4 is the biggest possible pile).
    // Issues: 2nd-pass polish — user reported that rapid multi-kill cascades
    //         "bunched up" the floating text: 3 simultaneous kills spawned
    //         3 copies of "+100 CLEAN KILL" all at the exact same y-pixel.
    // Fix:    1) Vertical offset per text 60 → 95px so a 2-text cascade
    //            (CLEAN + PERFECT) reads as a clear two-line stack.
    //         2) Temporal stagger 0.35s → 0.6s so each line has time to be
    //            read before the next appears.
    //         3) Duration 3.5s → 5.0s and drift 70 → 50 px/s so the fade is
    //            visibly slower (50 × 5.0 = 250px total, slightly more than
    //            before but spread across 40% more time).
    //         4) Per-kill y-offset rotation (0/30/60/90) so simultaneous
    //            kills get different starting rows.
    // Gotchas: Don't refactor this to a per-tick Random offset — that would
    //         cause the same kill to read inconsistently across replays
    //         and would make A/B screenshots unreliable. Deterministic
    //         rotation is the right primitive here.
    const yKillOffset = (this.crystalKillIndex % 4) * 30;
    this.crystalKillIndex += 1;
    let textIndex = 0;
    if (tier.text) {
      this.spawnFloatingTextAt(
        tier.text,
        target.state.position,
        textIndex * 0.6,
        tier.color,
        textIndex * 95 + yKillOffset,
        textIndex * 55 - 55,
        26,
      );
      textIndex++;
    }
    for (const hook of hookTexts) {
      this.spawnFloatingTextAt(
        hook.text,
        target.state.position,
        textIndex * 0.6,
        hook.color,
        textIndex * 95 + yKillOffset,
        textIndex * 55 - 55,
        22,
      );
      textIndex++;
    }

    // Phase 7 — pickup drop. Crystals always drop a pickup (1 of 6 kinds
    // uniform random). Spawn BEFORE the death tween + cleanup so the pickup
    // is anchored to the crystal's position, not the expanding tween mesh.
    const pickupKind = maybeDropPickup(target.state);
    if (pickupKind !== null) this.spawnPickup(pickupKind, target.state.position);

    // Death explosion: 1 shockwave ring + scale-up + fade tween (the new
    // CrystalDeathTween reuses the cracked material so the death flash is
    // visible at the moment the crystal pops).
    const intensity = 0.5 + 0.5 * (tier.bonus / 100);
    this.activeShockwaves.push(new Shockwave(target.state.position, 0x55ccdd, intensity));
    this.spawnCrystalDeathTween(target);

    // Clean up scheduler / counter maps. The mesh itself is removed by the
    // CrystalDeathTween when its 0.4s tween ends (so the player sees the pop).
    this.fractureSchedulers.delete(crystalId);
    this.crystalDeathTimes.delete(crystalId);
    this.crystalShardsAbsorbed.delete(crystalId);
    // Phase 6d: remove the CrystalLightning mesh + per-crystal spark pool
    // from the scene and dispose their GPU resources. Done before the death
    // tween starts so the bolt does not flicker on a fading mesh.
    const bolt = this.crystalBolts.get(crystalId);
    if (bolt) {
      bolt.detach(this.scene);
      bolt.dispose();
      this.crystalBolts.delete(crystalId);
    }
    const sparks = this.crystalSparks.get(crystalId);
    if (sparks) {
      this.scene.remove(sparks.points);
      sparks.dispose();
      this.crystalSparks.delete(crystalId);
    }
  }

  /**
   * Return the stable crystal id stored on the LiveAsteroid. Crystals are
   * assigned an id at spawn time; the scheduler uses the same id as its
   * map key. Pre-fracture crystals have a scheduler entry created on the
   * first fracture frame, so `crystalIdFor` is only ever called from
   * destroyCrystal — by which time the scheduler exists if the crystal
   * ever fractured.
   */
  private crystalIdFor(target: LiveAsteroid): number {
    return target.id;
  }

  private spawnScrapFromAsteroid(target: LiveAsteroid): void {
    if (Math.random() > scrapDropChance(target.state.size)) return;

    const state = createScrap(target.state.position);
    const mesh = new Mesh(
      new SphereGeometry(0.12, 6, 6),
      new MeshBasicMaterial({ color: 0xffcc00 }),
    );
    mesh.position.set(state.position.x, state.position.y, 0);
    this.scrap.push({ state, mesh });
    this.scene.add(mesh);
  }

  private disposeProjectile(projectile: LiveProjectile): void {
    this.scene.remove(projectile.mesh);
    projectile.mesh.geometry.dispose();
    const material = projectile.mesh.material;
    if (Array.isArray(material)) {
      material.forEach((m: Material) => m.dispose());
    } else {
      material.dispose();
    }
  }

  private onShieldAbsorbedHit(liveAsteroid: LiveAsteroid, asteroid: AsteroidState): boolean {
    // Normal points from the asteroid toward the ship (direction of impact).
    const dx = this.ship.state.position.x - asteroid.position.x;
    const dy = this.ship.state.position.y - asteroid.position.y;
    const distance = Math.hypot(dx, dy);
    let nx = 0;
    let ny = 0;

    if (distance > 0.001) {
      nx = dx / distance;
      ny = dy / distance;

      // ═══════════════════════════════════════════════════════════════════════════
      // My Rules — Velocity-Scored Shield Bounce
      // ═══════════════════════════════════════════════════════════════════════════
      // Purpose: Make the ship recoil from an asteroid impact with the same
      //          strength it hit the asteroid with: a gentle tap gives a soft
      //          bounce, a hard ram gives a hard bounce.
      // Setup: The collision normal points from the asteroid toward the ship. The
      //        dot product of (ship.velocity - asteroid.velocity) with that normal
      //        tells us whether the two objects are closing and how fast.
      // Issues: The old bounce used a fixed size-scaled impulse, so a stationary
      //         tap and a high-speed ram produced the same recoil.
      // Fix: Reflect the ship's closing velocity back along the normal with a
      //      fixed restitution (0.9), and give the asteroid a proportional nudge
      //      based on its size. Only apply the impulse when the objects are
      //      actually closing, preventing separation collisions from reversing
      //      the ship.
      // Gotchas: Large asteroids are treated as nearly immovable; tiny/small
      //          asteroids pick up more of the impact and are usually destroyed
      //          by the shield anyway, so their bounce is short-lived.
      // ═══════════════════════════════════════════════════════════════════════════
      // Use the shared helper so the math is unit-testable and not duplicated.
      const asteroidBounceBySize: Record<AsteroidSize, number> = {
        [AsteroidSize.TINY]: 0.8,
        [AsteroidSize.SMALL]: 0.6,
        [AsteroidSize.MEDIUM]: 0.3,
        [AsteroidSize.LARGE]: 0.1,
      };
      const bounce = resolveShipAsteroidBounce(
        this.ship.state.velocity,
        asteroid.velocity,
        { x: nx, y: ny },
        asteroidBounceBySize[asteroid.size],
      );
      this.ship.state.velocity = bounce.shipVelocity;
      asteroid.velocity = bounce.asteroidVelocity;

      // Push the asteroid back out of the shield so it cannot drain energy again
      // on the very next frame.
      const separation = 0.12;
      asteroid.position = {
        x: asteroid.position.x - nx * separation,
        y: asteroid.position.y - ny * separation,
      };
    }

    // Impact ripple starts from the shield surface at the contact point, not the
    // asteroid center, so the glow sits exactly where the energy bubble was hit.
    const contactPoint = {
      x: this.ship.state.position.x - nx * SHIELD_RADIUS,
      y: this.ship.state.position.y - ny * SHIELD_RADIUS,
    };
    addShieldImpact(this.shieldMesh, contactPoint, this.ship.state.position);
    this.shieldShakeRemaining = 0.25;

    // Critical shield: hull debris breaks off every time the ship is hit while
    // shields are below 40%. The lower the shield, the more debris flies off.
    const percent = shieldPercent(this.shield);
    if (percent < 40) {
      const severity = 1.0 - percent / 40;
      const count = 3 + Math.floor(severity * 4) + Math.floor(Math.random() * 3);
      this.spawnHullDebris(count);
    }

    // Tiny and small asteroids are consumed by the shield. Small ones either
    // disintegrate or break into two tiny fragments; tiny ones always pop.
    // Medium and large asteroids reflect off and remain in play.
    if (asteroid.size === AsteroidSize.TINY) {
      this.destroyAsteroidOnShieldHit(liveAsteroid);
      return false;
    }

    if (asteroid.size === AsteroidSize.SMALL) {
      if (Math.random() < 0.5) {
        this.destroyAsteroidOnShieldHit(liveAsteroid);
      } else {
        this.splitSmallAsteroidOnShieldHit(liveAsteroid);
      }
      return false;
    }

    return true;
  }

  private destroyAsteroidOnShieldHit(target: LiveAsteroid): void {
    this.scene.remove(target.mesh);
    disposeAsteroidMesh(target.mesh);
    this.spawnScrapFromAsteroid(target);
  }

  private splitSmallAsteroidOnShieldHit(target: LiveAsteroid): void {
    this.scene.remove(target.mesh);
    disposeAsteroidMesh(target.mesh);
    const children = splitSmallAsteroid(target.state);
    for (const child of children) {
      this.spawnAsteroid(child.size, child.position, child.velocity);
    }
  }

  private updateExplosions(deltaTime: number): void {
    this.activeExplosions = updateExplosionParticles(this.activeExplosions, deltaTime);
  }

  private updateDamageEffects(deltaTime: number): void {
    this.activeDamageParticles = updateDamageParticles(this.activeDamageParticles, deltaTime);
    this.activeSparks = updateSparkArcs(this.activeSparks, deltaTime);
  }

  private updateLowShieldEffects(deltaTime: number): void {
    const percent = shieldPercent(this.shield);

    // Eject hull debris every second while shields are 40% or lower. The lower
    // the shield, the bigger each ejection so the ship looks like it is falling
    // apart as it nears destruction.
    if (percent <= 40) {
      this.lowShieldDebrisTimer += deltaTime;
      if (this.lowShieldDebrisTimer >= 1.0) {
        const severity = 1.0 - percent / 40;
        const count = 3 + Math.floor(severity * 3);
        this.spawnHullDebris(count);
        this.lowShieldDebrisTimer = 0;
      }
    } else {
      this.lowShieldDebrisTimer = 0;
    }

    if (percent < 40) {
      this.sparkTimer += deltaTime;
      // More sparks the lower the shield; at 0% spawn arcs very frequently.
      const interval = percent === 0 ? 0.06 : 0.18;
      if (this.sparkTimer >= interval) {
        this.spawnSparkArc();
        this.sparkTimer = 0;
      }
    } else {
      this.sparkTimer = 0;
    }
  }

  private spawnHullDebris(count: number): void {
    const shipPosition = this.shipMesh.position;
    for (let i = 0; i < count; i += 1) {
      const local = randomHullPoint();
      const world = {
        x: shipPosition.x + local.x,
        y: shipPosition.y + local.y,
      };
      const particle = createDamageParticle(world);
      this.scene.add(particle.mesh);
      this.activeDamageParticles.push(particle);
    }
  }

  private spawnSparkArc(): void {
    const shipPosition = this.shipMesh.position;
    const origin = new Vector3(shipPosition.x, shipPosition.y, 0);
    const arc = createSparkArc(origin, 0.55);
    this.scene.add(arc.mesh);
    this.activeSparks.push(arc);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Ship Explosion Cleanup
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Visual feedback when the shield is depleted and the ship dies.
  // Setup: Called from respawnShip(); particles are now managed by the shared
  //        ship-damage module so cleanup is consistent with debris and sparks.
  // Issues: Explosion shards were previously cleaned up only inside
  //         updateExplosions(), which could leave particles on screen if the
  //         respawn flow changed or if the game stopped unexpectedly.
  // Fix: Centralize creation/update/disposal in ship-damage.ts. respawnShip()
  //      disposes any stale explosion particles before spawning fresh ones;
  //      finishRespawn() performs a hard safety clear so the next life starts
  //      with a clean scene.
  // Gotchas: Particles use ConeGeometry with transparency; dispose both geometry
  //          and material to avoid leaks. The ship and its children are hidden
  //          during the death delay, not removed from the scene.
  // ═══════════════════════════════════════════════════════════════════════════

  private spawnShipExplosion(): void {
    // Spawn ~24 outward-flying shards at the ship's death position.
    const position = this.ship.state.position;
    for (let i = 0; i < 24; i += 1) {
      const particle = createExplosionParticle(position);
      this.scene.add(particle.mesh);
      this.activeExplosions.push(particle);
    }
  }

  private respawnShip(): void {
    // Clear all threats so the player respawns into a clean arena.
    for (const projectile of this.projectiles) {
      this.disposeProjectile(projectile);
    }
    this.projectiles = [];

    for (const asteroid of this.asteroids) {
      this.scene.remove(asteroid.mesh);
      disposeAsteroidMesh(asteroid.mesh);
    }
    this.asteroids = [];

    for (const shard of this.activeShards) {
      this.disposeShard(shard);
    }
    this.activeShards = [];

    for (const piece of this.scrap) {
      this.scene.remove(piece.mesh);
      piece.mesh.geometry.dispose();
      (piece.mesh.material as Material).dispose();
    }
    this.scrap = [];

    // Phase 6b: clear all crystal cascade state too. The respawn flow must
    // wipe fracture state so a fresh life starts with no leftover bursts.
    this.fractureSchedulers.clear();
    this.crystalDeathTimes.clear();
    this.crystalShardsAbsorbed.clear();
    this.crystalKillIndex = 0;
    for (const wave of this.activeShockwaves) {
      this.scene.remove(wave.mesh);
      wave.dispose();
    }
    this.activeShockwaves = [];
    for (const pending of this.pendingTelegraphs) {
      this.scene.remove(pending.mesh);
      pending.mesh.geometry.dispose();
      (pending.mesh.material as Material).dispose();
    }
    this.pendingTelegraphs = [];
    for (const tween of this.crystalDeathTweens) {
      this.scene.remove(tween.mesh);
      disposeAsteroidMesh(tween.mesh);
    }
    this.crystalDeathTweens = [];
    this.cameraShakeAmplitude = 0;
    this.cameraShakeRemaining = 0;

    // Ensure any stale explosion particles from a previous death are gone before
    // spawning the new ones, so effects cannot stack up across multiple deaths.
    disposeAllExplosionParticles(this.activeExplosions);
    this.activeExplosions = [];

    this.spawnShipExplosion();
    clearShieldImpacts(this.shieldMesh);
    disposeAllDamageParticles(this.activeDamageParticles);
    this.activeDamageParticles = [];
    disposeAllSparkArcs(this.activeSparks);
    this.activeSparks = [];
    this.lowShieldDebrisTimer = 0;
    this.sparkTimer = 0;
    this.shipMesh.visible = false;
    this.shieldMesh.visible = false;
    this.magnetRing.visible = false;
    this.ship.markDead(1.0);
    this.shipRespawnDelay = 1.0;
    this.respawnPhase = 'exploding';
  }

  private finishRespawn(): void {
    this.ship.markAlive();
    this.shield.energy = SHIELD_MAX_ENERGY;
    this.shipMesh.visible = true;
    this.shieldMesh.visible = this.shield.energy > 0.01;
    this.magnetRing.visible = true;

    // Hard safety: any explosion particles still alive when the player revives
    // are forcibly removed so the screen is clean for the next life.
    disposeAllExplosionParticles(this.activeExplosions);
    this.activeExplosions = [];
  }

  private createHud(): void {
    this.scoreElement = document.createElement('div');
    this.scoreElement.style.position = 'absolute';
    this.scoreElement.style.top = '16px';
    this.scoreElement.style.left = '16px';
    this.scoreElement.style.color = '#ffffff';
    this.scoreElement.style.fontFamily = 'monospace';
    this.scoreElement.style.fontSize = '18px';
    this.scoreElement.style.textShadow = '0 0 4px #000000';
    document.body.appendChild(this.scoreElement);

    this.waveElement = document.createElement('div');
    this.waveElement.style.position = 'absolute';
    this.waveElement.style.top = '16px';
    this.waveElement.style.right = '16px';
    this.waveElement.style.color = '#ffffff';
    this.waveElement.style.fontFamily = 'monospace';
    this.waveElement.style.fontSize = '18px';
    this.waveElement.style.textShadow = '0 0 4px #000000';
    document.body.appendChild(this.waveElement);

    this.breatherElement = document.createElement('div');
    this.breatherElement.style.position = 'absolute';
    this.breatherElement.style.top = '48px';
    this.breatherElement.style.left = '16px';
    this.breatherElement.style.color = '#ffcc00';
    this.breatherElement.style.fontFamily = 'monospace';
    this.breatherElement.style.fontSize = '18px';
    this.breatherElement.style.textShadow = '0 0 4px #000000';
    document.body.appendChild(this.breatherElement);

    this.shieldElement = document.createElement('div');
    this.shieldElement.style.position = 'absolute';
    this.shieldElement.style.top = '80px';
    this.shieldElement.style.left = '16px';
    this.shieldElement.style.fontFamily = 'monospace';
    this.shieldElement.style.fontSize = '18px';
    this.shieldElement.style.fontWeight = 'bold';
    this.shieldElement.style.textShadow = '0 0 4px #000000';
    this.shieldElement.style.transition = 'color 0.2s ease';
    document.body.appendChild(this.shieldElement);

    this.resumeElement = document.createElement('div');
    this.resumeElement.style.position = 'absolute';
    this.resumeElement.style.top = '50%';
    this.resumeElement.style.left = '50%';
    this.resumeElement.style.transform = 'translate(-50%, -50%)';
    this.resumeElement.style.color = '#ffffff';
    this.resumeElement.style.fontFamily = 'monospace';
    this.resumeElement.style.fontSize = '48px';
    this.resumeElement.style.fontWeight = 'bold';
    this.resumeElement.style.textShadow = '0 0 12px #000000';
    this.resumeElement.style.whiteSpace = 'nowrap';
    this.resumeElement.style.pointerEvents = 'none';
    this.resumeElement.style.display = 'none';
    document.body.appendChild(this.resumeElement);

    // ═══════════════════════════════════════════════════════════════════════════
    // My Rules — Phase 7 HUD Regions (Passive Pill Row + Active Icon Row)
    // ═══════════════════════════════════════════════════════════════════════════
    // Purpose:  Mount two new DOM HUD regions at game start: a bottom-center
    //           pill row that surfaces currently-active passive effects (one
    //           pill per kind, with a colored border + drain bar), and a
    //           bottom-right 3-icon row that surfaces active ammo (count, bar,
    //           state label). Both are anchored absolute on document.body and
    //           carry pointerEvents='none' so they never block gameplay clicks.
    // Setup:    Called once from the Game constructor (line ~409). Pill rows
    //           are reconciled PER-FRAME by updateHud; icons are reconciled
    //           similarly. Both regions are removed by stop().
    // Issues:   None — both regions match the existing HUD style
    //           (position:absolute, monospace, textShadow, no new fonts).
    // Fix:      Phase 7 Task 13. The 3 active icons are created eagerly in
    //           createHud because the row is always visible (the icon opacity
    //           distinguishes EMPTY from READY). The 3 passive pills are
    //           created LAZILY in updateHud because we don't know which kinds
    //           the player has collected yet — pills appear/disappear as
    //           passive effects come and go.
    // Gotchas:  spec.color is a numeric hex (e.g. 0xff8800) — must be
    //           converted via `.toString(16).padStart(6, '0')` and prefixed
    //           with `#` to be a valid CSS color. Forgetting the prefix or
    //           the zero-padding silently renders as black/transparent.
    //           `dataset` is the cheapest way to stash a per-pill lookup id
    //           for querySelector — alternatives (closure over the pill
    //           reference, id attributes) all work but are noisier.
    // ═══════════════════════════════════════════════════════════════════════════

    // Bottom-center passive pill row.
    this.pickupHudElement = document.createElement('div');
    this.pickupHudElement.style.position = 'absolute';
    this.pickupHudElement.style.bottom = '16px';
    this.pickupHudElement.style.left = '50%';
    this.pickupHudElement.style.transform = 'translateX(-50%)';
    this.pickupHudElement.style.display = 'flex';
    this.pickupHudElement.style.gap = '8px';
    this.pickupHudElement.style.pointerEvents = 'none';
    document.body.appendChild(this.pickupHudElement);

    // Bottom-right active icon row.
    this.activeHudElement = document.createElement('div');
    this.activeHudElement.style.position = 'absolute';
    this.activeHudElement.style.bottom = '16px';
    this.activeHudElement.style.right = '16px';
    this.activeHudElement.style.display = 'flex';
    this.activeHudElement.style.gap = '8px';
    this.activeHudElement.style.pointerEvents = 'none';
    document.body.appendChild(this.activeHudElement);

    // Phase 7f — Magnet Booster icon (4th slot). Uses the same DOM shape
    // as the 3 ammo icons (header + box + countLabel + bar + stateLabel)
    // but its reconcile logic differs — it reads pendingTier / activeTier
    // from the dedicated magnet-booster state machine (not ammo.charges).
    // The icon is always visible (Task 7's "4" label in the empty state
    // teaches the player the input key).
    for (const kind of [PickupKind.BOMB_STRIKE, PickupKind.ORBIT_DRONES, PickupKind.HOMING_MISSILES, PickupKind.MAGNET_BOOSTER]) {
      const spec = ACTIVE_KIND_SPECS[kind];
      // ═════════════════════════════════════════════════════════════════════
      // My Rules — Active HUD Icon Row (Phase 7b addon names)
      // ═════════════════════════════════════════════════════════════════════
      // Purpose:  Render the 3 active addon slots (BOMB / DRONES / MISSILES)
      //           as small bordered boxes in the bottom-right. Each slot also
      //           carries a small-font name header above the box so the
      //           player can identify which addon a count/bar/state belongs
      //           to without trial-and-error.
      // Setup:    Called once during createActiveHud() (which runs inside
      //           the Game constructor after the HUD elements are appended).
      //           The 3 specs come from ACTIVE_KIND_SPECS; their displayName
      //           field is the single source of truth for the header text.
      // Issues:   None.
      // Fix:      Phase 7b user-request: "Add the addon NAME to the GUI, in
      //           small font". Layout decision: small-font name above the
      //           box (not inside) so the box's 3 stacked children
      //           (count / bar / state) keep their breathing room. An outer
      //           flex-column wrapper holds the header + box; each child's
      //           ref (nameLabel, countLabel, bar, stateLabel, container)
      //           is cached on the ActiveHudIcon struct for O(1) reconcile
      //           access — same lesson as the PassivePill cached-refs fix.
      // Gotchas:  The name label uses 9px (smaller than the 10px stateLabel)
      //           and is color-matched to the spec border so the name reads
      //           as a tinted caption rather than competing with the white
      //           count digits. letter-spacing 1px gives the short caps
      //           ("BOMB" / "DRONES" / "MISSILES") enough room to breathe.
      //           Do not reuse this slot for SHIELD/SPREAD/FIRE_RATE — those
      //           are passive and already get a pill via updateHud.
      // ═════════════════════════════════════════════════════════════════════
      // Outer wrapper holds the small-font addon name (header) above the 56×56
      // box, so the name does not crowd count/bar/state inside the box itself.
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';
      const nameLabel = document.createElement('div');
      nameLabel.textContent = spec.displayName;
      nameLabel.style.fontFamily = 'monospace';
      nameLabel.style.fontSize = '9px';
      nameLabel.style.color = `#${spec.color.toString(16).padStart(6, '0')}`;
      nameLabel.style.letterSpacing = '1px';
      nameLabel.style.marginBottom = '2px';
      wrapper.appendChild(nameLabel);
      const container = document.createElement('div');
      container.style.width = '56px';
      container.style.height = '56px';
      container.style.border = `2px solid #${spec.color.toString(16).padStart(6, '0')}`;
      container.style.padding = '4px';
      container.style.fontFamily = 'monospace';
      container.style.fontSize = '12px';
      container.style.color = '#ffffff';
      container.style.background = 'rgba(0,0,0,0.4)';
      container.style.textAlign = 'center';
      container.style.opacity = '0.3';
      const countLabel = document.createElement('div');
      countLabel.textContent = '0';
      countLabel.style.fontWeight = 'bold';
      const bar = document.createElement('div');
      bar.style.height = '4px';
      bar.style.background = `#${spec.color.toString(16).padStart(6, '0')}`;
      bar.style.marginTop = '4px';
      bar.style.width = '0%';
      const stateLabel = document.createElement('div');
      stateLabel.textContent = 'EMPTY';
      stateLabel.style.fontSize = '10px';
      container.appendChild(countLabel);
      container.appendChild(bar);
      container.appendChild(stateLabel);
      wrapper.appendChild(container);
      this.activeHudElement.appendChild(wrapper);
      this.activeHudIcons.set(kind, { container, nameLabel, countLabel, bar, stateLabel });
    }
  }

  private spawnFloatingText(text: string, delaySeconds: number): void {
    const world = new Vector3(this.breather.position.x, this.breather.position.y, 0);
    this.spawnFloatingTextAt(text, world, delaySeconds);
  }

  private spawnFloatingTextAt(
    text: string,
    worldPosition: Vector2,
    delaySeconds: number,
    color = '#00ffaa',
    verticalOffset = 0,
    horizontalOffset = 0,
    fontSize = 16,
    duration = 5.0,
  ): void {
    const world = new Vector3(worldPosition.x, worldPosition.y, 0);
    world.project(this.camera);
    const baseX = (world.x * 0.5 + 0.5) * window.innerWidth + horizontalOffset;
    // verticalOffset shifts the initial spawn position upward (negative = up)
    // so multiple texts from the same event do not bunch at the same pixel.
    const baseY = (-world.y * 0.5 + 0.5) * window.innerHeight - verticalOffset;

    const element = document.createElement('div');
    element.textContent = text;
    element.style.position = 'absolute';
    element.style.left = `${baseX}px`;
    element.style.top = `${baseY}px`;
    element.style.color = color;
    element.style.fontFamily = 'monospace';
    element.style.fontSize = `${fontSize}px`;
    element.style.fontWeight = 'bold';
    element.style.textShadow = '0 0 6px #000000, 0 0 3px #000000';
    element.style.whiteSpace = 'nowrap';
    element.style.pointerEvents = 'none';
    element.style.transform = 'translate(-50%, -120%)';
    element.style.opacity = '1';
    element.style.display = 'none';
    document.body.appendChild(element);

    this.activeFloatingTexts.push({
      element,
      age: -delaySeconds,
      duration,
      baseX,
      baseY,
    });
  }

  private updateHud(deltaTime: number): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `SCORE ${this.wave.score}  BREAKS ${this.wave.asteroidsDestroyed}`;
    }
    if (this.waveElement) {
      const nextIn = Math.max(0, this.wave.nextWaveIn).toFixed(1);
      this.waveElement.textContent = `WAVE ${this.wave.waveNumber}  NEXT ${nextIn}`;
    }
    if (this.breatherElement) {
      if (this.breather.active) {
        const remaining = this.breather.durationRemaining.toFixed(1);
        this.breatherElement.textContent = `ZONE ACTIVE ${remaining}`;
      } else if (this.breather.meter >= BREATHER_METER_COST) {
        this.breatherElement.textContent = 'ZONE READY (X)';
      } else {
        this.breatherElement.textContent = `ZONE ${this.breather.meter}/${BREATHER_METER_COST}`;
      }
    }
    if (this.shieldElement) {
      const percent = shieldPercent(this.shield);
      this.shieldElement.textContent = `SHIELD ${percent}`;
      this.shieldElement.style.color = shieldColor(percent);

      this.shieldShakeRemaining = Math.max(0, this.shieldShakeRemaining - deltaTime);
      if (this.shieldShakeRemaining > 0 && !this.isCrystalBurstFrame) {
        const shakeX = (Math.random() - 0.5) * 6;
        const shakeY = (Math.random() - 0.5) * 6;
        this.shieldElement.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
      } else {
        this.shieldElement.style.transform = 'translate(0, 0)';
      }
    }
    if (this.breather.active && !this.breatherWasActive) {
      this.spawnFloatingText('Safe Zone here', 0.0);
      this.spawnFloatingText('Recharge Shields', 1.2);
      this.spawnFloatingText('2x Score Booster', 2.4);
    }
    this.breatherWasActive = this.breather.active;

    // ═══════════════════════════════════════════════════════════════════════════
    // My Rules — HUD Reconciliation (Phase 7 Task 13)
    // ═══════════════════════════════════════════════════════════════════════════
    // Purpose:  Each frame, reconcile the 2 HUD regions to the current game
    //           state — passive pills to activeEffects, active icons to
    //           activeAmmo + activeDeployments. Passive pills are spawned
    //           lazily on first appearance and removed when the effect
    //           expires; active icons are always present (they just change
    //           opacity / text / bar fill).
    // Setup:    Called every frame from update(deltaTime) at line ~585 (and
    //           from updateRespawn at line ~635 so the HUD continues to
    //           refresh during the 3-second respawn countdown). Reads
    //           this.activeEffects, this.activeAmmo, this.activeDeployments.
    // Issues:   None.
    // Fix:      Phase 7 Task 13. The reconcile pattern (snapshot present
    //           kinds, prune entries no longer in the snapshot, spawn new
    //           entries, update existing entries) is the same shape used
    //           for activeShockwaves / activeShards — keeping it consistent
    //           makes the codebase easier to reason about.
    // Gotchas:  Pill labels use ACTIVE_KIND_SPECS[effect.kind].displayName,
    //           NOT PICKUP_COLOR-derived text — both work but displayName
    //           is the single source of truth for what the player reads.
    //           Child refs (label, timeLabel, bar) are cached on the
    //           PassivePill struct at creation time so the per-frame
    //           reconcile can read them with O(1) property access. (Earlier
    //           versions used `pill.querySelector` + a `dataset` round-trip
    //           and hit a null-deref when a passive pickup was first
    //           collected — the dataset was set on the parent but the
    //           children were never tagged, so the query returned null.
    //           See PassivePill interface for the fix history.)
    //           bar width math: non-deployable kinds use cooldown ratio
    //           (1 - remaining/total) so the bar FILLS as cooldown completes
    //           (matches the "loading bar" intuition). Deployable kinds
    //           use remaining/total so the bar DRAINS as the deployment
    //           fades — opposite direction, matches the depletion timeline.
    // ═══════════════════════════════════════════════════════════════════════════

    // Reconcile passive pill row to activeEffects.
    const presentPassiveKinds = new Set(this.activeEffects.map((e) => e.kind));
    for (const [kind, entry] of this.pickupHudPills) {
      if (!presentPassiveKinds.has(kind)) {
        entry.pill.remove();
        this.pickupHudPills.delete(kind);
      }
    }
    for (const effect of this.activeEffects) {
      let entry = this.pickupHudPills.get(effect.kind);
      if (!entry) {
        const pill = document.createElement('div');
        const color = `#${PICKUP_COLOR[effect.kind].toString(16).padStart(6, '0')}`;
        pill.style.border = `2px solid ${color}`;
        pill.style.padding = '4px 8px';
        pill.style.minWidth = '80px';
        pill.style.fontFamily = 'monospace';
        pill.style.fontSize = '12px';
        pill.style.color = '#ffffff';
        pill.style.background = 'rgba(0,0,0,0.4)';
        // Phase 7b — pill pop-in animation (200ms ease-out-back overshoot).
        pill.style.transform = 'scale(0)';
        pill.style.transition = 'transform 200ms cubic-bezier(.2,.9,.3,1.2)';
        requestAnimationFrame(() => {
          pill.style.transform = 'scale(1.15)';
          setTimeout(() => {
            pill.style.transform = 'scale(1.0)';
            pill.style.transition = 'transform 120ms ease-out';
          }, 120);
        });
        const label = document.createElement('div');
        label.style.fontWeight = 'bold';
        const timeLabel = document.createElement('div');
        timeLabel.style.fontSize = '10px';
        const bar = document.createElement('div');
        bar.style.height = '4px';
        bar.style.background = color;
        bar.style.marginTop = '2px';
        pill.appendChild(label);
        pill.appendChild(timeLabel);
        pill.appendChild(bar);
        this.pickupHudElement?.appendChild(pill);
        entry = { pill, label, timeLabel, bar };
        this.pickupHudPills.set(effect.kind, entry);
      }
      // Phase 7b — SHIELD pill: brighter border + secondary text while boost active.
      if (effect.kind === PickupKind.SHIELD) {
        entry.label.textContent = `SHIELD +BOOST ${effect.remaining.toFixed(1)}s`;
        entry.pill.style.border = `2px solid #88ddff`;
      } else {
        entry.label.textContent = ACTIVE_KIND_SPECS[effect.kind].displayName;
      }
      entry.timeLabel.textContent = `${effect.remaining.toFixed(1)}s`;
      entry.bar.style.width = `${(effect.remaining / effect.total) * 100}%`;
    }

    // Reconcile active icon row to activeAmmo + magnet booster state.
    // Phase 7f — extends the 3-slot row to 4 slots. MAGNET_BOOSTER is the
    // 4th slot and uses a separate branch: its reconcile reads from
    // this.magnetBooster (pendingTier / activeTier) instead of activeAmmo.
    // The shape of the DOM (header + box + countLabel + bar + stateLabel)
    // matches the other 3 so the existing CSS selectors apply unchanged.
    for (const kind of [PickupKind.BOMB_STRIKE, PickupKind.ORBIT_DRONES, PickupKind.HOMING_MISSILES, PickupKind.MAGNET_BOOSTER]) {
      const icon = this.activeHudIcons.get(kind);
      if (!icon) continue;
      // Phase 7f — Magnet Booster reconcile is special: it uses 3 visual
      // states (empty / pending / active) mapped from pendingTier and
      // activeTier. Task 7 will style the .empty / .pending / .active CSS
      // classes on the container; for now we just set the className +
      // countLabel text + bar fill so the DOM state is correct.
      if (kind === PickupKind.MAGNET_BOOSTER) {
        const mb = this.magnetBooster;
        const remaining = activeRemainingSeconds(mb, this.gameTimeSeconds);
        if (mb.activeTier > 0) {
          // ACTIVE: pulsing gold border (via .active CSS class), count
          // shows the active tier multiplier, bar fills as the 6s window
          // drains.
          icon.container.className = 'magnet-booster-pill active';
          icon.countLabel.textContent = `${mb.activeTier + 1}x`;
          icon.stateLabel.textContent = `${remaining.toFixed(1)}s`;
          icon.bar.style.width = `${(remaining / MAGNET_BOOSTER_DURATION_SECONDS) * 100}%`;
        } else if (mb.pendingTier > 0) {
          // PENDING: solid gold border, count shows the queued multiplier,
          // bar is empty (no time-based drain while pending).
          icon.container.className = 'magnet-booster-pill pending';
          icon.countLabel.textContent = `${mb.pendingTier + 1}x`;
          icon.stateLabel.textContent = 'READY';
          icon.bar.style.width = '0%';
        } else {
          // EMPTY: dim border, no count text, "4" label (always visible
          // so the player learns the Digit4 binding).
          icon.container.className = 'magnet-booster-pill empty';
          icon.countLabel.textContent = '4';
          icon.stateLabel.textContent = '';
          icon.bar.style.width = '0%';
        }
        continue;
      }
      const ammo = this.activeAmmo[kind];
      const spec = ACTIVE_KIND_SPECS[kind];
      icon.countLabel.textContent = `${ammo.charges}`;
      const onCooldown = ammo.cooldownRemaining > 0;
      const deployed = kind === PickupKind.ORBIT_DRONES && this.activeDeployments.length > 0;
      // Phase 7i Sprint 3 — ORBIT_DRONES pill border tracks the charge stack
      // so the player sees at a glance what tier the next deploy will be:
      //   0 charges  → 0x444444 (dim grey — empty)
      //   1 charge   → 0x66ddff (cyan — tier 1 = 2 drones)
      //   2 charges  → 0xff66dd (magenta — tier 2 = 3 drones)
      //   3 charges  → 0xffcc44 (gold — tier 3 = 4 drones)
      // Matches ORBIT_DRONES_TIER_COLOR in src/orbit-drone.ts:54-60.
      // BOMB_STRIKE and HOMING_MISSILES keep spec.color so their pills don't
      // shift hue as charges accumulate (they don't have tier visuals).
      if (kind === PickupKind.ORBIT_DRONES) {
        const tierColor = ammo.charges >= 3 ? 0xffcc44
          : ammo.charges >= 2 ? 0xff66dd
          : ammo.charges >= 1 ? 0x66ddff
          : 0x444444;
        icon.container.style.border = `2px solid #${tierColor.toString(16).padStart(6, '0')}`;
      }
      if (ammo.charges === 0 && !onCooldown) {
        icon.container.style.opacity = '0.3';
        icon.stateLabel.textContent = 'EMPTY';
        icon.bar.style.width = '0%';
      } else if (deployed) {
        icon.container.style.opacity = '1';
        icon.stateLabel.textContent = 'DEPLOYED';
        const dep = this.activeDeployments[0];
        const ratio = dep.remaining / ORBIT_DRONES_DURATION_SECONDS;
        icon.bar.style.width = `${ratio * 100}%`;
      } else if (onCooldown) {
        icon.container.style.opacity = '0.5';
        icon.stateLabel.textContent = 'COOLDOWN';
        const ratio = 1 - ammo.cooldownRemaining / spec.cooldownSeconds;
        icon.bar.style.width = `${ratio * 100}%`;
      } else {
        icon.container.style.opacity = '1';
        icon.stateLabel.textContent = 'READY';
        icon.bar.style.width = '100%';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // My Rules — updateFloatingTexts
  // ───────────────────────────────────────────────────────────────────────
  // Purpose:  Tick every active floating-text entry — fade, drift, sway,
  //           and remove DOM when expired.
  // Setup:    Called once per frame from the main update loop with the
  //           frame delta. Spawning happens via spawnFloatingTextAt which
  //           appends a div to document.body and pushes a FloatingText
  //           record into this.activeFloatingTexts.
  // Issues:   1) The alive list was never populated (no `alive.push(text)`
  //           in the loop), so every entry was implicitly dropped from
  //           this.activeFloatingTexts after one frame. Result: text
  //           appeared, stayed frozen at full opacity at its spawn
  //           position, never drifted, never removed from the DOM. Delayed
  //           texts (breather "Recharge Shields" / "2x Score Booster")
  //           never reached `age >= 0` so never became visible.
  //           2) Crystal scoring tier + hook text spawned at the SAME
  //           pixel, SAME frame, SAME font — three or four strings piled
  //           on top of each other, illegible.
  // Fix:      1) Added `alive.push(text)` for non-expired entries,
  //           mirroring the canonical pattern in updateCrystalDeathTweens
  //           (line ~1014). Now entries persist across frames, age
  //           accumulates toward duration, the DOM element is removed at
  //           expiry, and delayed texts count down their negative age into
  //           the visible region.
  //           2) spawnFloatingTextAt now accepts a `verticalOffset`,
  //           `horizontalOffset`, and `fontSize` param. The crystal kill
  //           site staggers each text by 95 px vertically, 0.6 s
  //           temporally, and ±55 px horizontally, using 22-26 px font
  //           and a unique vibrant color per tier. Duration bumped 3.5 →
  //           5.0 s and drift 70 → 50 px/s (slower per second but
  //           ~250 px total travel) so the cascade is clearly readable as
  //           a sequence rather than a fast pop. A rotating per-kill
  //           y-offset (0/30/60/90 px) prevents simultaneous kills from
  //           piling all their texts in the same vertical band.
  // Gotchas:  `text.element.remove()` mutates the DOM. Do not reparent the
  //           element after remove() — create a fresh div in
  //           spawnFloatingTextAt if you need to reuse it.
  // ═══════════════════════════════════════════════════════════════════════
  private updateFloatingTexts(deltaTime: number): void {
    const alive: FloatingText[] = [];
    for (const text of this.activeFloatingTexts) {
      text.age += deltaTime;
      if (text.age >= text.duration) {
        text.element.remove();
        continue;
      }
      if (text.age >= 0) {
        const progress = text.age / text.duration;
        // 50 px/s upward drift — over a 5.0s lifetime each text travels ~250px,
        // which is enough to read each line individually. The horizontal sway
        // is a small sin-wave jitter (±4 px) so the text doesn't rise in a
        // perfectly straight line. Drift is intentionally slower than the
        // first 2.0s-lifetime pass so the player has time to read each line
        // of a multi-tier cascade (tier + 1-3 hook bonuses).
        const driftPixels = 50 * text.age;
        const swayPixels = 4 * Math.sin(text.age * 4);
        text.element.style.display = 'block';
        text.element.style.top = `${text.baseY - driftPixels}px`;
        text.element.style.left = `${text.baseX + swayPixels}px`;
        text.element.style.opacity = `${1 - progress}`;
      }
      alive.push(text);
    }
    this.activeFloatingTexts = alive;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Screenshot / debug hooks
  // ───────────────────────────────────────────────────────────────────────
  // Purpose: Give the Playwright screenshot harness a deterministic way to
  //          stage specific crystal-cascade moments. Called from
  //          tests/phase6b-screenshots.spec.ts via window.__game. The hooks
  //          do not affect normal gameplay.
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Spawn a crystal at the given world position with zero velocity. Returns
   * the crystal's stable id (used to look it up later). Screenshot hook.
   */
  debugSpawnCrystalAt(x: number, y: number): number {
    const id = this.nextAsteroidId;
    this.spawnAsteroid(
      AsteroidSize.LARGE,
      { x, y },
      { x: 0, y: 0 },
      false,
      AsteroidKind.CRYSTAL,
    );
    // Mark the crystal as already at low HP so the next damage event
    // (or our direct fracture call) will trigger the cascade.
    const crystal = this.asteroids.find((a) => a.id === id);
    if (crystal) crystal.state.health = 1;
    return id;
  }

  /**
   * Force-fracture the crystal with the given id. Screenshot hook. Idempotent
   * — calling twice on the same crystal is a no-op.
   */
  debugFractureCrystal(id: number): boolean {
    const crystal = this.asteroids.find((a) => a.id === id);
    if (!crystal) return false;
    if (crystal.state.fractured) return false;
    this.fractureCrystal(crystal);
    return true;
  }

  /**
   * Set the internal game-time clock to `t`. Subsequent burst updates will
   * fire based on the new time, letting the harness jump to specific
   * moments in the cascade. Screenshot hook.
   */
  debugSetGameTime(seconds: number): void {
    this.gameTimeSeconds = seconds;
    // If a scheduler is registered, push its `nextBurstAt` forward so it
    // fires at the requested game-time minus FIRST_BURST_DELAY.
    for (const scheduler of this.fractureSchedulers.values()) {
      scheduler.state.nextBurstAt = seconds;
    }
  }

  /**
   * Look up a crystal by id. Screenshot hook. Returns null if missing.
   */
  debugGetCrystal(id: number): { id: number; x: number; y: number; fractured: boolean } | null {
    const crystal = this.asteroids.find((a) => a.id === id);
    if (!crystal) return null;
    return {
      id: crystal.id,
      x: crystal.state.position.x,
      y: crystal.state.position.y,
      fractured: crystal.state.fractured,
    };
  }

  /**
   * Force-kill a crystal as if the player shot it. Triggers the full
   * destroyCrystal path including the score-tier + hook floating text
   * emission. Screenshot hook for visual verification of scoring text.
   * Returns the new total wave score, or null if the crystal was missing.
   */
  debugKillCrystal(id: number): { score: number } | null {
    const crystal = this.asteroids.find((a) => a.id === id);
    if (!crystal) return null;
    this.destroyCrystal(crystal);
    return { score: this.wave.score };
  }

  /**
   * Freeze the in-game clock so screenshot harnesses can inspect a static
   * fracture state without the auto-firing cascade destroying the crystal.
   * Returns the new paused state. Pass `false` to resume.
   */
  debugPauseClock(paused: boolean): boolean {
    this.clockPaused = paused;
    return this.clockPaused;
  }

  /**
   * Phase 7i Sprint 2 Task 6 — spawn a pickup of the given kind at the
   * given world position. Wraps the private spawnPickup so Playwright
   * tests can force a pickup to drop near the ship without having to
   * roll the natural 10% drop chance off an Iron LARGE. Accepts the
   * PickupKind string value (e.g. 'orbitDrones', 'magnetBooster') —
   * the same value the PickupKind enum uses internally.
   */
  debugSpawnPickup(kind: string, x: number, y: number): boolean {
    const validKinds = Object.values(PickupKind) as string[];
    if (!validKinds.includes(kind)) return false;
    const pickupKind = kind as PickupKind;
    this.spawnPickup(pickupKind, { x, y });
    return true;
  }
}

function createStarfield(): Points {
  const geometry = new BufferGeometry();
  const count = 1200;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 200;
    positions[i3 + 1] = (Math.random() - 0.5) * 200;
    positions[i3 + 2] = (Math.random() - 0.5) * 100;
    sizes[i] = Math.random() * 0.2 + 0.05;
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('size', new Float32BufferAttribute(sizes, 1));
  const material = new PointsMaterial({
    color: 0xffffff,
    size: 0.12,
    sizeAttenuation: true,
  });
  return new Points(geometry, material);
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Range Ring
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Show the passive scrap-magnet collection radius around the ship.
// Setup: Yellow ring attached to the ship mesh, always facing the camera.
// Issues: Previous ring was thick (0.2 units) and fairly opaque, making it
//         visually compete with the ship and shield.
// Fix: Use a thinner band and much lower opacity so it reads as a faint HUD
//      indicator rather than a solid object. DoubleSide keeps it visible from
//      any angle; transparent + depthWrite:false prevents it from occluding.
// Gotchas: The ring is part of the ship group, so it inherits ship position and
//          rotation. Keep z slightly behind the ship so it does not clip the hull.
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Range Ring
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Show the passive scrap-magnet collection radius around the ship.
// Setup: Yellow ring attached to the ship mesh, always facing the camera.
// Issues: Previous ring was thick (0.2 units) and fairly opaque, making it
//         visually compete with the ship and shield.
// Fix: Use a very thin band and low opacity so it reads as a faint HUD
//      indicator. Only turn it on when scrap is actually within pull range,
//      so it does not clutter the screen when there is nothing to collect.
// Gotchas: The ring is part of the ship group, so it inherits ship position and
//          rotation. Keep z slightly behind the ship so it does not clip the hull.
//          updateMagnetRing runs before updateScrap each frame, so visibility
//          reflects the previous frame's scrap positions; one-frame lag is
//          imperceptible for this UI hint.
// ═══════════════════════════════════════════════════════════════════════════
function createMagnetRing(): Mesh {
  const geometry = new RingGeometry(MAGNET_RADIUS - 0.01, MAGNET_RADIUS, 64);
  const material = new MeshBasicMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0.03,
    side: 2,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = -0.5;
  return mesh;
}

function createBreatherMesh(): Mesh {
  const geometry = new SphereGeometry(1, 32, 32);
  const material = new MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.15,
    side: 2,
  });
  const mesh = new Mesh(geometry, material);
  mesh.scale.set(4, 4, 4);
  return mesh;
}
