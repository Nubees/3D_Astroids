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
  SIZE_RADIUS,
  createAsteroidMesh,
  createAsteroidState,
  disposeAsteroidMesh,
  resolveAsteroidCollision,
  splitAsteroid,
  splitSmallAsteroid,
} from './asteroid';
import { circlesCollide, resolveShipAsteroidBounce } from './utils/collision';
import {
  AsteroidState,
  BreatherZoneState,
  Projectile as ProjectileState,
  ScrapState,
  Vector2,
} from './types';
import { ArenaMovementController } from './movement/arena-controller';
import {
  ShieldState,
  createShieldState,
  updateShield,
  absorbHit,
  shieldColor,
  shieldPercent,
  SHIELD_MAX_ENERGY,
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

interface LiveAsteroid {
  state: AsteroidState;
  mesh: Group;
}

interface LiveProjectile {
  state: ProjectileState;
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
  private scrap: LiveScrap[] = [];
  private readonly controller: ArenaMovementController;
  private readonly bloomComposer: EffectComposer;
  private lastTime = 0;
  private running = true;
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
  }

  private loop = (time: number): void => {
    if (!this.running) return;

    const rawDelta = (time - this.lastTime) / 1000;
    const deltaTime = Math.min(rawDelta, MAX_DELTA_TIME);
    this.lastTime = time;

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
    this.updateAsteroids(deltaTime);
    this.handleAsteroidCollisions();
    this.updateScrap(deltaTime);
    this.updateSpawning(deltaTime);
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

  private spawnAsteroid(size: AsteroidSize, position: Vector2, velocity: Vector2, isTargeted = false): void {
    const state = createAsteroidState(size, position, velocity, isTargeted);
    const mesh = createAsteroidMesh(size, isTargeted);
    mesh.position.set(position.x, position.y, 0);
    this.asteroids.push({ state, mesh });
    this.scene.add(mesh);
  }

  private spawnRandomAsteroid(): void {
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
          this.disposeProjectile(projectile);
        } else {
          remainingProjectiles.push(projectile);
        }
      }
      this.projectiles = remainingProjectiles;

      if (hit) {
        this.destroyAsteroid(asteroid);
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

    for (const piece of this.scrap) {
      this.scene.remove(piece.mesh);
      piece.mesh.geometry.dispose();
      (piece.mesh.material as Material).dispose();
    }
    this.scrap = [];

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
    world.project(this.camera);
    const baseX = (world.x * 0.5 + 0.5) * window.innerWidth;
    const baseY = (-world.y * 0.5 + 0.5) * window.innerHeight;

    const element = document.createElement('div');
    element.textContent = text;
    element.style.position = 'absolute';
    element.style.left = `${baseX}px`;
    element.style.top = `${baseY}px`;
    element.style.color = '#00ffaa';
    element.style.fontFamily = 'monospace';
    element.style.fontSize = '16px';
    element.style.fontWeight = 'bold';
    element.style.textShadow = '0 0 6px #000000';
    element.style.whiteSpace = 'nowrap';
    element.style.pointerEvents = 'none';
    element.style.transform = 'translate(-50%, -120%)';
    element.style.opacity = '1';
    element.style.display = 'none';
    document.body.appendChild(element);

    this.activeFloatingTexts.push({
      element,
      age: -delaySeconds,
      duration: 2.0,
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
      if (this.shieldShakeRemaining > 0) {
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
        const driftPixels = 30 * text.age;
        text.element.style.display = 'block';
        text.element.style.top = `${text.baseY - driftPixels}px`;
        text.element.style.left = `${text.baseX}px`;
        text.element.style.opacity = `${1 - progress}`;
      }
      alive.push(text);
    }
    this.activeFloatingTexts = alive;
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
