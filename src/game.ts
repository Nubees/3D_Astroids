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
  Scene,
  SphereGeometry,
  TorusGeometry,
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
  InputState,
  MovementController,
  MovementMode,
  Projectile as ProjectileState,
  Vector2,
} from './types';
import { ArenaMovementController } from './movement/arena-controller';
import { DriftMovementController } from './movement/drift-controller';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Game Loop
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Own the Three.js scene, camera, renderer, and update/render loop.
// Setup: Created with a canvas element; starts via requestAnimationFrame.
// Issues: Phase 1 hard-coded arena movement inside Game.ts.
// Fix: Phase 2 delegates movement, bounds, camera, spawning, and culling to a
//      swappable MovementController. Arena is the default; 'M' toggles drift.
// Gotchas: screenToWorld must add the camera position because the camera now
//          moves in drift mode. Projectiles and asteroids are culled using the
//          active controller's bounds, not fixed world limits.
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

export class Game {
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly input: InputManager;
  private readonly shipMesh: Group;
  private readonly ship: Ship;
  private readonly starfield: Points;
  private readonly beacon: Mesh;
  private projectiles: LiveProjectile[] = [];
  private asteroids: LiveAsteroid[] = [];
  private controller: MovementController;
  private lastTime = 0;
  private running = true;
  private readonly resizeHandler: () => void;

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

    this.beacon = createBeaconMesh();
    this.scene.add(this.beacon);

    this.input = new InputManager();

    this.ship = new Ship(0, 0);
    this.shipMesh = createShipMesh();
    this.scene.add(this.shipMesh);

    this.controller = new ArenaMovementController();
    this.resetShipForController();

    this.resizeHandler = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.resizeHandler);
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
    if (this.input.consumeModeToggle()) {
      this.toggleMode();
    }

    this.controller.update(deltaTime);
    this.updateCamera();

    const rawInput = this.input.currentState();
    const input: InputState = {
      move: rawInput.move,
      aim: this.screenToWorld(rawInput.aim),
      fire: rawInput.fire,
    };

    this.controller.apply(this.ship.state, input, deltaTime);
    this.ship.state.position = this.controller.clampToBounds(this.ship.state.position);
    this.ship.update(input, deltaTime);

    if (input.fire && this.ship.canFire()) {
      this.fireProjectile();
    }

    this.updateShipMesh();
    this.updateStarfield();
    this.updateBeacon();
    this.updateProjectiles(deltaTime);
    this.updateAsteroids(deltaTime);
    this.updateSpawning(deltaTime);

    this.handleCollisions();
  }

  private toggleMode(): void {
    const nextMode = this.controller.mode === MovementMode.ARENA ? MovementMode.DRIFT : MovementMode.ARENA;
    this.setController(nextMode);
  }

  private setController(mode: MovementMode): void {
    this.clearProjectiles();
    this.clearAsteroids();

    this.controller = mode === MovementMode.ARENA
      ? new ArenaMovementController()
      : new DriftMovementController();

    this.resetShipForController();
    this.controller.spawnConfig.nextSpawnIn = 0.5;
    this.updateCamera();
    this.updateStarfield();
    this.updateBeacon();
  }

  private resetShipForController(): void {
    this.ship.state.position = { ...this.controller.cameraPosition };
    this.ship.state.velocity = { x: 0, y: 0 };
    this.ship.state.aim = { x: 1, y: 0 };
    this.ship.fireCooldown = 0;
  }

  private updateCamera(): void {
    const center = this.controller.cameraPosition;
    this.camera.position.set(center.x, center.y, 20);
  }

  private screenToWorld(screen: Vector2): Vector2 {
    const ndcX = (screen.x / window.innerWidth) * 2 - 1;
    const ndcY = -(screen.y / window.innerHeight) * 2 + 1;
    const halfHeight = this.camera.position.z * Math.tan((this.camera.fov * Math.PI) / 360);
    const halfWidth = halfHeight * this.camera.aspect;
    return {
      x: ndcX * halfWidth + this.camera.position.x,
      y: ndcY * halfHeight + this.camera.position.y,
    };
  }

  private updateShipMesh(): void {
    this.shipMesh.position.set(this.ship.state.position.x, this.ship.state.position.y, 0);
    const angle = Math.atan2(this.ship.state.aim.y, this.ship.state.aim.x);
    this.shipMesh.rotation.z = angle;
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

  private updateSpawning(deltaTime: number): void {
    const cfg = this.controller.spawnConfig;
    cfg.nextSpawnIn -= deltaTime;
    if (cfg.nextSpawnIn <= 0) {
      this.spawnRandomAsteroid();
      cfg.nextSpawnIn = cfg.minInterval + Math.random() * (cfg.maxInterval - cfg.minInterval);
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
    this.spawnAsteroid(
      AsteroidSize.LARGE,
      this.controller.getSpawnPosition(),
      this.controller.getSpawnVelocity(),
    );
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
          this.respawnShip();
          return;
        }
      }
    }

    this.asteroids = aliveAsteroids;
  }

  private destroyAsteroid(target: LiveAsteroid): void {
    this.scene.remove(target.mesh);
    disposeAsteroidMesh(target.mesh);
    const children = splitAsteroid(target.state);
    for (const child of children) {
      this.spawnAsteroid(child.size, child.position, child.velocity);
    }
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

  private clearProjectiles(): void {
    for (const projectile of this.projectiles) {
      this.disposeProjectile(projectile);
    }
    this.projectiles = [];
  }

  private clearAsteroids(): void {
    for (const asteroid of this.asteroids) {
      this.scene.remove(asteroid.mesh);
      disposeAsteroidMesh(asteroid.mesh);
    }
    this.asteroids = [];
  }

  private respawnShip(): void {
    this.clearProjectiles();
    this.ship.state.position = { ...this.controller.cameraPosition };
    this.ship.state.velocity = { x: 0, y: 0 };
    this.ship.state.aim = { x: 1, y: 0 };
    this.ship.fireCooldown = 0;
  }

  private updateStarfield(): void {
    const center = this.controller.cameraPosition;
    this.starfield.position.set(-center.x * 0.2, -center.y * 0.2, 0);
  }

  private updateBeacon(): void {
    if (this.controller.mode === MovementMode.DRIFT) {
      this.beacon.visible = true;
      const center = this.controller.cameraPosition;
      this.beacon.position.set(center.x + 40, 0, -5);
    } else {
      this.beacon.visible = false;
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

function createBeaconMesh(): Mesh {
  const geometry = new TorusGeometry(2, 0.25, 8, 24);
  const material = new MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff4400,
    emissiveIntensity: 0.6,
  });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
