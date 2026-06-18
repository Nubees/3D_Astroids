import {
  AmbientLight,
  BufferGeometry,
  Color,
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
  WebGLRenderer,
} from 'three';
import { InputManager } from './input';
import { Ship, createShipMesh, SHIP_RADIUS } from './ship';
import { createProjectile, PROJECTILE_RADIUS, updateProjectile } from './projectile';
import {
  AsteroidSize,
  SIZE_RADIUS,
  createAsteroidMesh,
  createAsteroidState,
  disposeAsteroidMesh,
  splitAsteroid,
} from './asteroid';
import { circlesCollide } from './utils/collision';
import {
  AsteroidState,
  BreatherZoneState,
  InputState,
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
  SHIELD_MAX_ENERGY,
} from './shield';
import {
  WaveState,
  awardBreak,
  createWaveState,
  getAsteroidBaseSpeed,
  getSpawnInterval,
  updateWave,
} from './waves';
import {
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
//          drops and a deployable Breather Zone that recharges shield and boosts
//          score while the ship is inside.
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

export class Game {
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly input: InputManager;
  private readonly shipMesh: Group;
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
  private lastTime = 0;
  private running = true;
  private readonly resizeHandler: () => void;
  private scoreElement: HTMLDivElement | null = null;
  private waveElement: HTMLDivElement | null = null;
  private breatherElement: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new Scene();
    this.scene.background = new Color(0x050510);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = 20;

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
    this.shipMesh = createShipMesh();
    this.scene.add(this.shipMesh);

    this.shield = createShieldState();
    this.shieldMesh = createShieldMesh();
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
    };
    window.addEventListener('resize', this.resizeHandler);

    this.createHud();
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
  }

  private loop = (time: number): void => {
    if (!this.running) return;

    const rawDelta = (time - this.lastTime) / 1000;
    const deltaTime = Math.min(rawDelta, MAX_DELTA_TIME);
    this.lastTime = time;

    this.update(deltaTime);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };

  private update(deltaTime: number): void {
    this.controller.update();

    const rawInput = this.input.currentState();
    const input: InputState = {
      move: rawInput.move,
      aim: this.screenToWorld(rawInput.aim),
      fire: rawInput.fire,
      shield: rawInput.shield,
      deployBreather: rawInput.deployBreather,
    };

    updateWave(this.wave, deltaTime);
    updateShield(this.shield, input.shield, deltaTime);
    updateBreather(this.breather, this.shield, this.ship.state.position, input.deployBreather, deltaTime);

    this.controller.apply(this.ship.state, input, deltaTime);
    this.ship.state.position = this.controller.clampToBounds(this.ship.state.position);
    this.ship.update(input, deltaTime);

    if (input.fire && this.ship.canFire()) {
      this.fireProjectile();
    }

    this.updateShipMesh();
    this.updateShieldMesh();
    this.updateMagnetRing();
    this.updateBreatherMesh();
    this.updateProjectiles(deltaTime);
    this.updateAsteroids(deltaTime);
    this.updateScrap(deltaTime);
    this.updateSpawning(deltaTime);
    this.updateHud();

    this.handleCollisions();
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

  private updateShieldMesh(): void {
    this.shieldMesh.visible = this.shield.active;
    const scale = 1.0 + (this.shield.energy / SHIELD_MAX_ENERGY) * 0.2;
    this.shieldMesh.scale.set(scale, scale, scale);
  }

  private updateMagnetRing(): void {
    this.magnetRing.visible = true;
  }

  private updateBreatherMesh(): void {
    this.breatherMesh.visible = this.breather.active;
    if (this.breather.active) {
      this.breatherMesh.position.set(this.breather.position.x, this.breather.position.y, 0);
      const pulse = 1.0 + Math.sin(this.breather.durationRemaining * 4) * 0.05;
      this.breatherMesh.scale.set(pulse, pulse, pulse);
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

  private spawnAsteroid(size: AsteroidSize, position: Vector2, velocity: Vector2): void {
    const state = createAsteroidState(size, position, velocity);
    const mesh = createAsteroidMesh(size);
    mesh.position.set(position.x, position.y, 0);
    this.asteroids.push({ state, mesh });
    this.scene.add(mesh);
  }

  private spawnRandomAsteroid(): void {
    const baseSpeed = getAsteroidBaseSpeed(this.wave);
    const position = this.controller.getSpawnPosition();
    const velocity = {
      x: (Math.random() - 0.5) * 0.5,
      y: -(baseSpeed + Math.random() * 0.5),
    };
    this.spawnAsteroid(AsteroidSize.LARGE, position, velocity);
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
      } else {
        aliveAsteroids.push(asteroid);
        if (circlesCollide(asteroid.state.position, asteroidRadius * 0.85, this.ship.state.position, SHIP_RADIUS)) {
          if (!absorbHit(this.shield, this.ship.state)) {
            this.respawnShip();
            return;
          }
        }
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

  private respawnShip(): void {
    for (const projectile of this.projectiles) {
      this.disposeProjectile(projectile);
    }
    this.projectiles = [];

    this.ship.state.position = { x: 0, y: 0 };
    this.ship.state.velocity = { x: 0, y: 0 };
    this.ship.state.aim = { x: 1, y: 0 };
    this.ship.fireCooldown = 0;
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
  }

  private updateHud(): void {
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

function createShieldMesh(): Mesh {
  const geometry = new SphereGeometry(SHIP_RADIUS * 1.6, 16, 16);
  const material = new MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.25,
    side: 2,
  });
  return new Mesh(geometry, material);
}

function createMagnetRing(): Mesh {
  const geometry = new RingGeometry(2.3, 2.5, 32);
  const material = new MeshBasicMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0.12,
    side: 2,
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
