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
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { InputManager } from './input';
import { Ship, createShipMesh, SHIP_RADIUS } from './ship';
import { createProjectile, isProjectileDead, PROJECTILE_RADIUS, updateProjectile } from './projectile';
import {
  AsteroidSize,
  SIZE_RADIUS,
  createAsteroidMesh,
  createAsteroidState,
  disposeAsteroidMesh,
  splitAsteroid,
} from './asteroid';
import { circlesCollide } from './utils/collision';
import { AsteroidState, InputState, Projectile as ProjectileState, Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Game Loop
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Own the Three.js scene, camera, renderer, and update/render loop.
// Setup: Created with a canvas element; starts via requestAnimationFrame.
// Issues: Phase 0 was static. Phase 1 adds input, movement, shooting,
//         breakable asteroids, collisions, and death/restart.
// Fix: Added arena-style gameplay: ship strafes, asteroids spawn and drift,
//      projectiles split rocks, ship collision triggers fast restart.
// Gotchas: Delta time is clamped to avoid huge jumps after lag spikes.
//          Arena bounds keep entities within a fixed play area.
//          Mouse aim is converted from screen pixels to world coordinates.
// ═══════════════════════════════════════════════════════════════════════════

const ARENA_WIDTH = 26;
const ARENA_HEIGHT = 18;
const MAX_DELTA_TIME = 0.1;
const SPAWN_INTERVAL = 4.0;

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
  private projectiles: LiveProjectile[] = [];
  private asteroids: LiveAsteroid[] = [];
  private spawnTimer = 0;
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

    this.scene.add(createStarfield());

    this.input = new InputManager();

    this.ship = new Ship(0, 0);
    this.shipMesh = createShipMesh();
    this.scene.add(this.shipMesh);

    this.resizeHandler = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.resizeHandler);

    this.spawnAsteroid(AsteroidSize.LARGE, { x: 0, y: 8 }, { x: 0, y: -1.5 });
  }

  start(): void {
    this.lastTime = performance.now();
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
    const rawInput = this.input.currentState();
    const input: InputState = {
      move: rawInput.move,
      aim: this.screenToWorld(rawInput.aim),
      fire: rawInput.fire,
    };

    this.ship.update(input, deltaTime);
    this.clampShipToArena();
    this.updateShipMesh();

    if (input.fire && this.ship.canFire()) {
      this.fireProjectile();
    }

    this.updateProjectiles(deltaTime);
    this.updateAsteroids(deltaTime);
    this.spawnTimer -= deltaTime;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      this.spawnRandomAsteroid();
    }

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

  private clampShipToArena(): void {
    const halfW = ARENA_WIDTH / 2;
    const halfH = ARENA_HEIGHT / 2;
    this.ship.state.position = {
      x: Math.max(-halfW, Math.min(halfW, this.ship.state.position.x)),
      y: Math.max(-halfH, Math.min(halfH, this.ship.state.position.y)),
    };
  }

  private updateShipMesh(): void {
    this.shipMesh.position.set(this.ship.state.position.x, this.ship.state.position.y, 0);
    const angle = Math.atan2(this.ship.state.aim.y, this.ship.state.aim.x);
    this.shipMesh.rotation.z = angle;
  }

  private fireProjectile(): void {
    this.ship.resetCooldown();
    const noseOffset: Vector2 = {
      x: this.ship.state.aim.x * 0.9,
      y: this.ship.state.aim.y * 0.9,
    };
    const spawn: Vector2 = {
      x: this.ship.state.position.x + noseOffset.x,
      y: this.ship.state.position.y + noseOffset.y,
    };
    const state = createProjectile(spawn, this.ship.state.aim);
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
      if (isProjectileDead(projectile.state, 20)) {
        this.disposeProjectile(projectile);
      } else {
        alive.push(projectile);
      }
    }
    this.projectiles = alive;
  }

  private updateAsteroids(deltaTime: number): void {
    for (const asteroid of this.asteroids) {
      asteroid.state.position = {
        x: asteroid.state.position.x + asteroid.state.velocity.x * deltaTime,
        y: asteroid.state.position.y + asteroid.state.velocity.y * deltaTime,
      };
      asteroid.mesh.position.set(asteroid.state.position.x, asteroid.state.position.y, 0);
      asteroid.mesh.rotation.x += deltaTime * 0.2;
      asteroid.mesh.rotation.y += deltaTime * 0.3;
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
    const x = (Math.random() - 0.5) * ARENA_WIDTH;
    const y = ARENA_HEIGHT / 2 + 1;
    const speed = 1.0 + Math.random();
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    const velocity = {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };
    this.spawnAsteroid(AsteroidSize.LARGE, { x, y }, velocity);
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
