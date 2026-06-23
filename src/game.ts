import {
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
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { InputManager, InputState } from './input';
import { ShipSelection } from './ship-select';
import { Ship, SHIELD_RADIUS, SHIP_RADIUS } from './ship';
import { createProjectile, PROJECTILE_RADIUS, updateProjectile } from './projectile';
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
  ExtrudingBolt,
  computeTimeBonusTier,
  createBurstTelegraph,
  createFracturedMaterial,
  crystalCharge,
  getBurstFlash,
  getHeartbeatPhase,
  isClutchApplicable,
  isPerfectApplicable,
  TELEGRAPH_DURATION_SECONDS,
} from './crystal-fx';
import { Shockwave, updateShockwaves } from './shockwave';
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
  private readonly bloomComposer: EffectComposer;
  private lastTime = 0;
  private running = true;
  private gameTimeSeconds = 0;
  private clockPaused = false;
  private fractureSchedulers = new Map<number, CrystalFractureScheduler>();
  private crystalDeathTimes = new Map<number, number>();
  private crystalShardsAbsorbed = new Map<number, number>();
  private crystalDeathTweens: CrystalDeathTween[] = [];
  private crystalBolts = new Map<number, ExtrudingBolt>();
  // Per-crystal spark particle pools. One Points draw call per fractured
  // crystal on screen — disposed with the crystal in destroyCrystal.
  private crystalSparks = new Map<number, CrystalBoltSparks>();
  private activeShockwaves: Shockwave[] = [];
  private pendingTelegraphs: PendingTelegraph[] = [];
  private cameraShakeAmplitude = 0;
  private cameraShakeRemaining = 0;
  private isCrystalBurstFrame = false;
  // Rotating 0/1/2/3 counter used to give each crystal-kill floating text a
  // distinct vertical starting offset so simultaneous kills don't all stack
  // at the same y-pixel. Wraps at 4 (i.e. +0/+30/+60/+90px) which is enough
  // for the realistic max simultaneous kills.
  private crystalKillIndex = 0;
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
      this.bloomComposer.setSize(w, h);
      // Phase 6c follow-up: Line2 + LineMaterial needs the viewport
      // resolution in pixels to compute screen-space line thickness. Push
      // it to every active bolt so they stay thick after a window resize
      // (otherwise they'd render at 0px on the new resolution).
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
    this.bloomComposer.render();
    requestAnimationFrame(this.loop);
  };

  private update(deltaTime: number): void {
    this.controller.update();

    const rawInput = this.input.currentState();
    const input: InputState = {
      move: rawInput.move,
      aim: this.screenToWorld(rawInput.aim),
      fire: rawInput.fire,
      deployBreather: rawInput.deployBreather,
    };

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
    this.ship.update(input, deltaTime);

    if (input.fire && this.ship.canFire()) {
      this.fireProjectile();
    }

    this.updateShipMesh();
    this.updateExhaustFlames(input);
    this.updateShieldMesh();
    this.updateMagnetRing();
    this.updateBreatherMesh();
    this.updateProjectiles(deltaTime);
    this.updateShards(deltaTime);
    this.updateAsteroids(deltaTime);
    this.handleAsteroidCollisions();
    this.updateScrap(deltaTime);
    this.updateSpawning(deltaTime);
    this.updateCrystalBursts(this.gameTimeSeconds);
    this.updatePendingTelegraphs(this.gameTimeSeconds);
    this.updateCrystalDeathTweens(deltaTime);
    this.updateShockwaveList(deltaTime);
    this.updateCrystalVisuals(deltaTime, this.gameTimeSeconds);
    this.applyCameraShake(deltaTime);
    this.updateHud(deltaTime);
    this.updateFloatingTexts(deltaTime);
    updateShieldVisuals(this.shieldMesh, deltaTime);
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
      return Math.hypot(dx, dy) <= MAGNET_RADIUS ? count + 1 : count;
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

  private updateBreatherMesh(): void {
    this.breatherMesh.visible = this.breather.active;
    if (this.breather.active) {
      this.breatherMesh.position.set(this.breather.position.x, this.breather.position.y, 0);
      const pulse = 1.0 + Math.sin(this.breather.durationRemaining * 4) * 0.05;
      const scale = this.breather.radius * pulse;
      this.breatherMesh.scale.set(scale, scale, scale);
    }
  }

  private fireProjectile(): void {
    this.ship.resetCooldown();
    const direction = this.ship.state.aim;
    const noseOffset: Vector2 = {
      x: direction.x * 0.9,
      y: direction.y * 0.9,
    };
    const spawn: Vector2 = {
      x: this.ship.state.position.x + noseOffset.x,
      y: this.ship.state.position.y + noseOffset.y,
    };
    const state = createProjectile(spawn, direction);
    const mesh = new Mesh(
      new SphereGeometry(PROJECTILE_RADIUS, 8, 8),
      new MeshBasicMaterial({ color: 0xaaddff }),
    );
    mesh.position.set(spawn.x, spawn.y, 0);
    this.projectiles.push({ state, mesh });
    this.scene.add(mesh);
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
      magnetPull(piece.state, this.ship.state.position, deltaTime);
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
   *   - ExtrudingBolt rebuilds + opacity flicker
   *   - Per-crystal CrystalBoltSparks emission bursts from the surface
   */
  private fractureCrystal(asteroid: LiveAsteroid): void {
    const crystalId = asteroid.id;
    asteroid.state.fractured = true;

    // 1. Swap to bright emissive fractured material (single MeshStandardMaterial).
    const fracturedMaterial = createFracturedMaterial();
    swapToFracturedMaterial(asteroid.mesh, fracturedMaterial);

    // 2. Build the extruding-bolt Line2 mesh and attach to scene.
    //    ExtrudingBolt takes only a seed; position is set per-frame in update().
    //    Line2 needs the viewport resolution so its custom shader can compute
    //    screen-space thickness. Pulled from the renderer's drawing buffer size
    //    (CSS pixels × DPR).
    const bolt = new ExtrudingBolt(crystalId);
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
      // Skipped if the burst was capped (don't telegraph a fake count).
      if (actual === requestedCount && actual > 0) {
        this.spawnTelegraph(target.state.position, angles, this.gameTimeSeconds + TELEGRAPH_DURATION_SECONDS, actual);
      }

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

      // White flash on the crystal mesh. Use crystalCharge at the pre-burst
      // peak (time-to-next ≈ 0) so the flash visibly pulses with the cascade.
      // (Phase 6c: pulse replaced by crystalCharge so the flash math stays
      // consistent with the per-frame update in updateCrystalVisuals.)
      // Phase 6c3 revert: emissive base restored to 0.5, charge² coefficient
      // restored to 0.6, flash coefficient restored to 0.4. These match the
      // original Phase 6c values; the dim Phase 6c2 numbers (0.25 / 0.4 / 0.3)
      // were paired with the dim bloom (threshold 0.35) so the yellow arcs
      // could read. The new white-hot bolts against brighter cyan need the
      // brighter pulse to feel like a real charge-up.
      const inner = target.mesh.children[0];
      if (inner instanceof Mesh) {
        const fractured = (target.mesh.userData as CrystalMeshUserData).fracturedMaterial;
        if (fractured) {
          const charge = crystalCharge(scheduler.getTimeToNextBurst(this.gameTimeSeconds));
          const flash = getBurstFlash(0.075); // peak flash
          fractured.emissiveIntensity = 0.5 + 0.6 * charge * charge + 0.4 * flash;
        }
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
      const timeToNext = scheduler.getTimeToNextBurst(gameTime);
      const charge = crystalCharge(timeToNext);
      // Scale breathe: 1.0 baseline → 1.05 peak pre-burst. Uses charge^2 so
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
      // Apply base pulse; spawnBurst may temporarily spike this for the flash frame.
      if (!this.isCrystalBurstFrame) {
        // Phase 6c3 revert: emissive base restored to 0.5, charge² coefficient
        // restored to 0.6. Crystal is the brighter Phase 6c value (see
        // createFracturedMaterial); base pulse peaks at ~1.1 which lets the
        // brighter bloom (threshold 0.15) catch the cyan body too — the
        // white-hot bolts bloom against the cyan naturally without needing
        // dim suppression.
        fracturedMaterial.emissiveIntensity = 0.5 + 0.6 * charge * charge;
      }
      // Drive the extruding bolt — geometry rebuilt every BOLT_REBUILD_INTERVAL
      // inside ExtrudingBolt.update, intensity tracks crystalCharge so the
      // bolts only really light up just before a burst.
      const crystalRadius = SIZE_RADIUS[target.state.size];
      const bolt = this.crystalBolts.get(id);
      if (bolt) {
        bolt.update(deltaTime, charge, target.state.position, crystalRadius, id);
      }
      // Emit sparks from the crystal surface and advance the per-crystal pool.
      // Each crystal has its own CrystalBoltSparks (built in fractureCrystal),
      // so draw cost scales linearly with the number of fractured crystals on
      // screen — acceptable for the typical 1-3 active crystals.
      const sparks = this.crystalSparks.get(id);
      if (sparks) {
        sparks.emit(charge, target.state.position, crystalRadius, deltaTime);
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
          this.disposeProjectile(projectile);
        } else {
          remainingProjectiles.push(projectile);
        }
      }
      this.projectiles = remainingProjectiles;

      if (hit) {
        // Iron asteroids always die on a hit (pre-Phase 6 behavior).
        if (asteroid.state.kind === AsteroidKind.IRON) {
          this.destroyAsteroid(asteroid);
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
          this.destroyAsteroid(asteroid);
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

  private destroyAsteroid(target: LiveAsteroid): void {
    // Single dispatch on kind — the iron path stays exactly as it was before
    // Phase 6b; the crystal path lives in destroyCrystal (scoring + cascade
    // cleanup + death explosion VFX).
    if (target.state.kind === AsteroidKind.CRYSTAL) {
      this.destroyCrystal(target);
      return;
    }
    this.destroyIronAsteroid(target);
  }

  private destroyIronAsteroid(target: LiveAsteroid): void {
    const multiplier = isInsideBreatherZone(this.breather, this.ship.state.position)
      ? BREATHER_SCORE_MULTIPLIER
      : 1.0;
    awardBreak(this.wave, target.state.size, multiplier);
    this.spawnScrapFromAsteroid(target);
    this.scene.remove(target.mesh);
    disposeAsteroidMesh(target.mesh);
    const children = splitAsteroid(target.state);
    for (const child of children) {
      this.spawnAsteroid(child.size, child.position, child.velocity);
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
    // Phase 6c3: remove the extruding-bolt Line2 + per-crystal spark pool
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
