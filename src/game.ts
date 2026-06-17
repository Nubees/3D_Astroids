import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { InputManager } from './input';
import { Ship, createShipMesh, SHIP_RADIUS } from './ship';
import {
  createDriftProjectile,
  createProjectile,
  DRIFT_PROJECTILE_FORWARD_SPEED,
  isProjectileDead,
  PROJECTILE_RADIUS,
  updateProjectile,
} from './projectile';
import {
  AsteroidSize,
  ASTEROID_DANGER_Z,
  ASTEROID_PASS_Z,
  ASTEROID_SPAWN_Z,
  SIZE_RADIUS,
  createAsteroidMesh,
  createAsteroidState,
  disposeAsteroidMesh,
  getAsteroidVisualScale,
  isAsteroidBehindPlayer,
  splitAsteroid,
} from './asteroid';
import { circlesCollide } from './utils/collision';
import { AsteroidState, InputState, MovementMode, Projectile as ProjectileState, Vector2, Vector3 } from './types';
import { Starfield } from './starfield';
import { createPlanetBeacon } from './planet';
import { lerp } from './movement';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Game Loop
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Own the Three.js scene, camera, renderer, and update/render loop.
//          Phase 2 adds a second movement mode (drift) with into-the-screen
//          streaming, soft camera follow, and a distant planet beacon.
// Setup: Created with a canvas element; starts via requestAnimationFrame.
// Issues: Phase 1 was arena-only. Phase 2 needs a clean toggle between arena
//         and drift without breaking the sacred loop.
// Fix: Added MovementMode state, drift asteroid spawning + pooling, layered
//      streaming starfield, soft camera lag, and a mode-toggle HUD.
// Gotchas: Delta time is clamped to avoid huge jumps after lag spikes.
//          Mode switch resets ship and camera target to avoid bad transitions.
//          Collision stays 2D in X/Y; Z depth only gates when a rock is active.
// ═══════════════════════════════════════════════════════════════════════════

const ARENA_WIDTH = 26;
const ARENA_HEIGHT = 18;
const MAX_DELTA_TIME = 0.1;
const SPAWN_INTERVAL = 4.0;
const DRIFT_SPEED = 10;
const CAMERA_Z_OFFSET = 14;
const CAMERA_LAG = 0.18;
const CAMERA_DANGER_Z = 1.5;
const DRIFT_CAMERA_BEHIND = 16;
const DRIFT_CAMERA_ABOVE = 10;

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
  private mode: MovementMode = MovementMode.ARENA;
  private cameraTarget: Vector3 = { x: 0, y: 0, z: 0 };
  private readonly starfield: Starfield;
  private readonly planetBeacon: Group;
  private readonly hudModeLabel: HTMLElement;
  private readonly resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new Scene();
    this.scene.background = new Color(0x050510);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = CAMERA_Z_OFFSET;

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

    this.starfield = new Starfield();
    this.scene.add(this.starfield.getMesh());

    this.planetBeacon = createPlanetBeacon();
    this.planetBeacon.visible = false;
    this.scene.add(this.planetBeacon);

    this.input = new InputManager();

    this.ship = new Ship(0, 0);
    this.shipMesh = createShipMesh();
    this.scene.add(this.shipMesh);

    this.hudModeLabel = this.createHud();
    this.updateHud();

    this.resizeHandler = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.resizeHandler);

    this.spawnAsteroid(AsteroidSize.LARGE, { x: 0, y: 8, z: 0 }, { x: 0, y: -1.5, z: 0 });
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
      toggleMode: rawInput.toggleMode,
    };

    if (input.toggleMode) {
      this.switchMode(this.mode === MovementMode.ARENA ? MovementMode.DRIFT : MovementMode.ARENA);
    }

    this.ship.update(input, deltaTime, this.mode);
    this.updateShipMesh(input);

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

    this.starfield.update(deltaTime, this.mode, DRIFT_SPEED);
    this.updateCamera(deltaTime);
    this.handleCollisions();
  }

  private createHud(): HTMLElement {
    const label = document.createElement('div');
    label.style.position = 'fixed';
    label.style.top = '16px';
    label.style.left = '16px';
    label.style.color = 'white';
    label.style.fontFamily = 'sans-serif';
    label.style.fontSize = '14px';
    label.style.textShadow = '0 1px 2px black';
    label.style.pointerEvents = 'none';
    label.style.userSelect = 'none';
    document.body.appendChild(label);
    return label;
  }

  private updateHud(): void {
    const instructions = this.mode === MovementMode.ARENA
      ? 'WASD / Arrows to strafe • Space / Click to fire • Tab: drift mode'
      : 'WASD / Arrows to strafe • Space / Click to fire • Tab: arena mode';
    this.hudModeLabel.textContent = `Mode: ${this.mode.toUpperCase()} — ${instructions}`;
  }

  private switchMode(nextMode: MovementMode): void {
    this.mode = nextMode;
    this.ship.state.position = { x: 0, y: 0, z: 0 };
    this.ship.state.velocity = { x: 0, y: 0 };
    this.ship.state.aim = { x: 1, y: 0 };
    this.ship.state.facing = { x: 1, y: 0 };
    this.cameraTarget = { x: 0, y: 0, z: 0 };
    this.planetBeacon.visible = nextMode === MovementMode.DRIFT;

    for (const asteroid of this.asteroids) {
      this.scene.remove(asteroid.mesh);
      disposeAsteroidMesh(asteroid.mesh);
    }
    this.asteroids = [];

    for (const projectile of this.projectiles) {
      this.disposeProjectile(projectile);
    }
    this.projectiles = [];

    this.spawnTimer = 0;
    this.spawnRandomAsteroid();
    this.updateHud();
  }

  private screenToWorld(screen: Vector2): Vector2 {
    const ndcX = (screen.x / window.innerWidth) * 2 - 1;
    const ndcY = -(screen.y / window.innerHeight) * 2 + 1;
    const halfHeight = this.camera.position.z * Math.tan((this.camera.fov * Math.PI) / 360);
    const halfWidth = halfHeight * this.camera.aspect;
    return {
      x: ndcX * halfWidth + this.cameraTarget.x,
      y: ndcY * halfHeight + this.cameraTarget.y,
    };
  }

  private updateShipMesh(input: InputState): void {
    this.shipMesh.position.set(this.ship.state.position.x, this.ship.state.position.y, 0);

    if (this.mode === MovementMode.DRIFT) {
      // In drift mode the camera is behind the ship. Build a target orientation
      // that points the nose back toward the camera (+Z) and banks with strafe,
      // then blends the nose toward the mouse aim so shooting looks aimed.
      const strafeStrength = 3;
      const backDistance = 25;
      const strafeLength = Math.hypot(input.move.x, input.move.y);
      const strafeX = strafeLength > 0.001 ? (input.move.x / strafeLength) * strafeStrength : 0;
      const strafeY = strafeLength > 0.001 ? (input.move.y / strafeLength) * strafeStrength : 0;

      const baseTargetX = this.ship.state.position.x + strafeX;
      const baseTargetY = this.ship.state.position.y + strafeY;
      const baseTargetZ = this.ship.state.position.z + backDistance;

      this.shipMesh.lookAt(baseTargetX, baseTargetY, baseTargetZ);
      this.shipMesh.rotateY(Math.PI / 2);
      const baseQuaternion = this.shipMesh.quaternion.clone();

      // Mouse-aimed nose: look at the aim point from the ship position.
      const aimDx = input.aim.x - this.ship.state.position.x;
      const aimDy = input.aim.y - this.ship.state.position.y;
      const aimDz = -18;
      const aimTargetX = this.ship.state.position.x + aimDx;
      const aimTargetY = this.ship.state.position.y + aimDy;
      const aimTargetZ = this.ship.state.position.z + aimDz;

      this.shipMesh.lookAt(aimTargetX, aimTargetY, aimTargetZ);
      this.shipMesh.rotateY(Math.PI / 2);
      const aimQuaternion = this.shipMesh.quaternion.clone();

      // Blend base drift pose with mouse-aimed pose (70% mouse aim visible).
      baseQuaternion.slerp(aimQuaternion, 0.7);
      this.shipMesh.quaternion.copy(baseQuaternion);
      return;
    }

    // Arena mode: ship faces its 2D movement direction.
    const moveLength = Math.hypot(input.move.x, input.move.y);
    if (moveLength > 0.001) {
      this.ship.state.facing = { x: input.move.x / moveLength, y: input.move.y / moveLength };
    }
    const angle = Math.atan2(this.ship.state.facing.y, this.ship.state.facing.x);
    this.shipMesh.rotation.set(0, 0, angle);
  }

  private fireProjectile(): void {
    this.ship.resetCooldown();
    let spawn: Vector3;

    if (this.mode === MovementMode.ARENA) {
      const noseOffset: Vector2 = {
        x: this.ship.state.facing.x * 0.9,
        y: this.ship.state.facing.y * 0.9,
      };
      spawn = {
        x: this.ship.state.position.x + noseOffset.x,
        y: this.ship.state.position.y + noseOffset.y,
        z: 0,
      };
    } else {
      // In drift mode the ship is angled into the screen; spawn at the center
      // so the blaster still fires from the ship body toward the mouse aim.
      spawn = { ...this.ship.state.position };
    }

    let state: ProjectileState;
    if (this.mode === MovementMode.ARENA) {
      state = createProjectile(spawn, this.ship.state.aim);
    } else {
      const aimOffset: Vector2 = {
        x: this.ship.state.aim.x - this.ship.state.position.x,
        y: this.ship.state.aim.y - this.ship.state.position.y,
      };
      state = createDriftProjectile(spawn, aimOffset, DRIFT_PROJECTILE_FORWARD_SPEED);
    }

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
      if (this.mode === MovementMode.DRIFT) {
        asteroid.state.position = {
          x: asteroid.state.position.x + asteroid.state.velocity.x * deltaTime,
          y: asteroid.state.position.y + asteroid.state.velocity.y * deltaTime,
          z: asteroid.state.position.z + (DRIFT_SPEED + asteroid.state.velocity.z) * deltaTime,
        };

        if (isAsteroidBehindPlayer(asteroid.state.position.z)) {
          this.respawnAsteroidFarAhead(asteroid);
        }

        const scale = getAsteroidVisualScale(asteroid.state.position.z);
        asteroid.mesh.scale.set(scale, scale, scale);
      } else {
        asteroid.state.position = {
          x: asteroid.state.position.x + asteroid.state.velocity.x * deltaTime,
          y: asteroid.state.position.y + asteroid.state.velocity.y * deltaTime,
          z: 0,
        };
        asteroid.mesh.scale.set(1, 1, 1);
      }

      asteroid.mesh.position.set(asteroid.state.position.x, asteroid.state.position.y, asteroid.state.position.z);
      asteroid.mesh.rotation.x += deltaTime * 0.2;
      asteroid.mesh.rotation.y += deltaTime * 0.3;
    }
  }

  private respawnAsteroidFarAhead(asteroid: LiveAsteroid): void {
    const spawnX = (Math.random() - 0.5) * ARENA_WIDTH * 1.5;
    const spawnY = (Math.random() - 0.5) * ARENA_HEIGHT * 1.5;
    const driftX = (Math.random() - 0.5) * 2;
    const driftY = (Math.random() - 0.5) * 2;
    asteroid.state.position = { x: spawnX, y: spawnY, z: ASTEROID_SPAWN_Z };
    asteroid.state.velocity = { x: driftX, y: driftY, z: 0 };
    asteroid.mesh.scale.set(0.1, 0.1, 0.1);
  }

  private spawnAsteroid(size: AsteroidSize, position: Vector3, velocity: Vector3): void {
    const state = createAsteroidState(size, position, velocity);
    const mesh = createAsteroidMesh(size);
    const scale = this.mode === MovementMode.DRIFT ? getAsteroidVisualScale(position.z) : 1;
    mesh.scale.set(scale, scale, scale);
    mesh.position.set(position.x, position.y, position.z);
    this.asteroids.push({ state, mesh });
    this.scene.add(mesh);
  }

  private spawnRandomAsteroid(): void {
    if (this.mode === MovementMode.DRIFT) {
      const x = (Math.random() - 0.5) * ARENA_WIDTH * 1.2;
      const y = (Math.random() - 0.5) * ARENA_HEIGHT * 1.2;
      const driftX = (Math.random() - 0.5) * 1.5;
      const driftY = (Math.random() - 0.5) * 1.5;
      this.spawnAsteroid(AsteroidSize.LARGE, { x, y, z: ASTEROID_SPAWN_Z }, { x: driftX, y: driftY, z: 0 });
    } else {
      const x = (Math.random() - 0.5) * ARENA_WIDTH;
      const y = ARENA_HEIGHT / 2 + 1;
      const speed = 1.0 + Math.random();
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      const velocity = {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
        z: 0,
      };
      this.spawnAsteroid(AsteroidSize.LARGE, { x, y, z: 0 }, velocity);
    }
  }

  private updateCamera(deltaTime: number): void {
    if (this.mode === MovementMode.DRIFT) {
      const t = Math.min(1, deltaTime / CAMERA_LAG);
      this.cameraTarget = {
        x: lerp(this.cameraTarget.x, this.ship.state.position.x, t),
        y: lerp(this.cameraTarget.y, this.ship.state.position.y, t),
        z: 0,
      };

      // Above-and-behind camera: position is behind (+Z) and above (+Y) the
      // ship, then look down toward a point slightly ahead of the ship.
      this.camera.position.set(
        this.cameraTarget.x,
        this.cameraTarget.y + DRIFT_CAMERA_ABOVE,
        this.cameraTarget.z + DRIFT_CAMERA_BEHIND,
      );
      this.camera.lookAt(
        this.cameraTarget.x,
        this.cameraTarget.y - 2,
        this.cameraTarget.z - 8,
      );
    } else {
      this.cameraTarget = { x: this.ship.state.position.x, y: this.ship.state.position.y, z: 0 };
      this.camera.position.set(this.cameraTarget.x, this.cameraTarget.y, CAMERA_Z_OFFSET);
      this.camera.lookAt(this.ship.state.position.x, this.ship.state.position.y, 0);
    }
  }

  private handleCollisions(): void {
    const aliveAsteroids: LiveAsteroid[] = [];

    for (const asteroid of this.asteroids) {
      let hit = false;
      const asteroidRadius = SIZE_RADIUS[asteroid.state.size];
      const zActive = this.mode === MovementMode.ARENA || Math.abs(asteroid.state.position.z) < CAMERA_DANGER_Z;
      const remainingProjectiles: LiveProjectile[] = [];

      for (const projectile of this.projectiles) {
        if (!hit && circlesCollide(
          { x: asteroid.state.position.x, y: asteroid.state.position.y },
          asteroidRadius,
          { x: projectile.state.position.x, y: projectile.state.position.y },
          PROJECTILE_RADIUS,
        )) {
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
        if (zActive && circlesCollide(
          { x: asteroid.state.position.x, y: asteroid.state.position.y },
          asteroidRadius * 0.85,
          { x: this.ship.state.position.x, y: this.ship.state.position.y },
          SHIP_RADIUS,
        )) {
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

    this.ship.state.position = { x: 0, y: 0, z: 0 };
    this.ship.state.velocity = { x: 0, y: 0 };
    this.ship.state.aim = { x: 1, y: 0 };
    this.ship.state.facing = { x: 1, y: 0 };
    this.ship.fireCooldown = 0;
  }
}
