// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Weapon Test Lab (LAB-NO2)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Standalone test harness for the 3 active deployable weapons
//          (BOMB_STRIKE / ORBIT_DRONES / HOMING_MISSILES) and the 1 active
//          buff (MAGNET_BOOSTER). User picks a ship, clicks LAUNCH, then
//          presses Digit1/2/3/4 to fire each weapon at 10 spawned iron
//          asteroids — no level / wave / pickup-drop system, no scoring.
//          Camera follows the ship (Arena-style, no drift).
// Setup:   Served from public/test-lab/weapon-lab.html. Imports the same
//          active-deployments / pickups / magnet-booster modules as the
//          main game so the visuals match 1:1. Standalone — does NOT
//          import from src/main.ts, src/game.ts, or src/ship-select.ts.
//          The user's "Press [1] BOMB · [2] DRONES · [3] MISSILES · [4]
//          MAGNET" hint sits under the HUD. Camera follows the ship at
//          z=20 / FOV=60° matching the production game camera.
// Issues:  Pre-Lab-2 the only way to see active-weapon VFX was to play
//          the game, collect pickups, and fire in a real arena. Reviewing
//          per-weapon tuning (beam radius, missile sprite, bomb ring
//          timing) required full game flow.
// Fix:     Phase 7i-3 — added this standalone page so the user can cycle
//          through 5 of each addon without playing. Asteroids are pure
//          iron (no crystals, no shards) so the bomb screen-clear is
//          clean. The bomb uses a simplified damage pass (no scoring, no
//          pickup drops) so respawning is a single button. Magnets
//          activate from a 5-charge bank that maps to the
//          pendingTier/activeTier state machine in src/magnet-booster.ts.
// Gotchas: The lab creates its OWN camera + scene + InputManager; it does
//          not import the production Game class. spawnDroneDeployment /
//          scheduleMissileVolley / fireBombStrike (replicated locally) all
//          accept a scene + ship position so the lab can drive them
//          without the Game wrapper. The lab's bomb is a stripped clone
//          of Game.fireBombStrike: shockwave + particles + DOM flash only,
//          no camera-shake / freeze-frame / punch-zoom (those are Game-
//          level integrations not relevant for visual VFX review).
//          updateActiveAmmo + the per-frame DroneDeploymentState /
//          VolleySchedule tick functions handle all the per-frame VFX
//          state. Respawn Asteroids re-runs the spawn pass; Reload Ammo
//          resets the ammo counters to 5 and clears the active
//          deployments (so the drone's 11s window doesn't outlive a
//          reload).
// ═══════════════════════════════════════════════════════════════════════════

import {
  AdditiveBlending,
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  SHIP_CATALOG,
  ShipCatalogEntry,
  loadCatalogMesh,
} from '../ships/catalog';
import { InputManager } from '../input';
import { preloadMissileTexture } from '../missile-vfx';
import {
  PickupKind,
  createEmptyActiveAmmo,
  ActiveAmmoMap,
  ActiveAmmoState,
  canFireActive,
  consumeActiveCharge,
  tickActiveAmmo,
} from '../pickups';
import {
  DroneDeploymentState,
  HomingMissileState,
  VolleySchedule,
  disposeDroneDeployment,
  scheduleMissileVolley,
  spawnDroneDeployment,
  tickDroneDeployments,
  tickMissileVolleySchedules,
  tickHomingMissiles,
} from '../active-deployments';
import {
  createAsteroidMesh,
  createAsteroidState,
  disposeAsteroidMesh,
  AsteroidSize,
  AsteroidKind,
} from '../asteroid';
import { AsteroidState, Vector2 } from '../types';
import { Shockwave, updateShockwaves } from '../shockwave';
import { emitShockwaveParticles, updateShockwaveParticles, disposeShockwaveParticles } from '../shockwave-particles';
import {
  activateMagnetBooster,
  createMagnetBooster,
  effectiveMagnetMultiplier,
  tickMagnetBooster,
  activeRemainingSeconds,
  MagnetBoosterState,
} from '../magnet-booster';
import {
  createActiveField,
  createActiveRing,
  updateActiveField,
  updateActiveRing,
} from '../magnet-booster-vfx';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — single source of truth for the lab
// ═══════════════════════════════════════════════════════════════════════════

// Mirror src/pickups.ts:BOMB_STRIKE_RADIUS (we replicate bomb damage locally
// because we are not in the Game class; the radius matches the production
// constant so a single bomb covers the 8-12u asteroid ring at radius < 15u).
const BOMB_RADIUS = 15.0;
const BOMB_DAMAGE = 10;

// Arena bounds — copy of src/movement/arena-controller.ts so the lab can
// clamp ship position the same way the production game does.
const ARENA_HALF_WIDTH = 13;
const ARENA_HALF_HEIGHT = 9;

const SHIP_MAX_SPEED = 7;
const SHIP_ACCEL = 12;
const BOUNCE_DAMPING = 0.55;

// Initial ammo bank. 5 of each so the user can fire BOMB×5 + DRONES×5 +
// MISSILES×5 + MAGNET×5 without worrying about running dry mid-test.
const INITIAL_AMMO = 5;

const ASTEROID_COUNT = 10;
const ASTEROID_RING_MIN = 8;
const ASTEROID_RING_MAX = 12;

// Iron asteroid size weights — favor SMALL + MEDIUM so the user can see
// fragments split when bomb shrapnel hits them.
const ASTEROID_SIZE_POOL: AsteroidSize[] = [
  AsteroidSize.TINY,
  AsteroidSize.SMALL,
  AsteroidSize.SMALL,
  AsteroidSize.SMALL,
  AsteroidSize.MEDIUM,
  AsteroidSize.MEDIUM,
  AsteroidSize.MEDIUM,
  AsteroidSize.LARGE,
];

interface LabAsteroid {
  state: AsteroidState;
  mesh: Group;
}

interface WeaponLabState {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  ship: { group: Group; state: { position: Vector2; velocity: Vector2; aim: Vector2 } };
  input: InputManager;
  asteroids: LabAsteroid[];
  activeAmmo: ActiveAmmoMap;
  magnet: MagnetBoosterState;
  droneDeployments: DroneDeploymentState[];
  missileSchedules: VolleySchedule[];
  activeMissiles: HomingMissileState[];
  shockwaves: Shockwave[];
  coreFlashes: { mesh: Mesh; age: number; duration: number }[];
  magnetRing: Mesh;
  magnetField: Mesh;
  startTimeSeconds: number;
}

let labState: WeaponLabState | null = null;
let labRafId = 0;

// ═══════════════════════════════════════════════════════════════════════════
// Ship-select phase
// ═══════════════════════════════════════════════════════════════════════════

interface LoadedShip {
  readonly entry: ShipCatalogEntry;
  readonly mesh: Group;
}

let loadedShips: LoadedShip[] = [];
let focusedShipIndex = 0;
let selectedShip: LoadedShip | null = null;

async function loadShips(): Promise<void> {
  loadedShips = await Promise.all(
    SHIP_CATALOG.map(async (entry) => {
      const mesh = await loadCatalogMesh(entry);
      return { entry, mesh };
    }),
  );
}

function renderShipGrid(): void {
  const grid = document.getElementById('ship-grid') as HTMLDivElement | null;
  if (!grid) return;
  grid.innerHTML = '';
  loadedShips.forEach((ship, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lab-ship-card';
    card.dataset.index = String(index);

    const num = document.createElement('div');
    num.className = 'lab-ship-card-num';
    num.textContent = `Ship ${ship.entry.id}`;
    const name = document.createElement('div');
    name.className = 'lab-ship-card-name';
    name.textContent = ship.entry.name;

    card.appendChild(num);
    card.appendChild(name);

    card.addEventListener('mouseenter', () => {
      focusedShipIndex = index;
      updateFocus();
    });
    card.addEventListener('click', () => {
      focusedShipIndex = index;
      updateFocus();
      confirmSelection();
    });
    grid.appendChild(card);
  });
}

function updateFocus(): void {
  const grid = document.getElementById('ship-grid');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.lab-ship-card')) as HTMLElement[];
  cards.forEach((card, i) => {
    card.classList.toggle('focused', i === focusedShipIndex);
  });
  const launch = document.getElementById('launch-button') as HTMLButtonElement | null;
  if (launch) launch.disabled = false;
}

function confirmSelection(): void {
  if (loadedShips.length === 0) return;
  selectedShip = loadedShips[focusedShipIndex];
  enterArena();
}

function bindShipSelectKeys(): void {
  const onKey = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusedShipIndex = (focusedShipIndex + 1) % loadedShips.length;
        updateFocus();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusedShipIndex = (focusedShipIndex - 1 + loadedShips.length) % loadedShips.length;
        updateFocus();
        break;
      case 'Enter':
        event.preventDefault();
        confirmSelection();
        break;
    }
  };
  document.addEventListener('keydown', onKey);
}

function bindLaunchButton(): void {
  const launch = document.getElementById('launch-button');
  if (!launch) return;
  launch.addEventListener('click', confirmSelection);
}

// ═══════════════════════════════════════════════════════════════════════════
// Arena phase
// ═══════════════════════════════════════════════════════════════════════════

function enterArena(): void {
  if (!selectedShip) return;
  const overlay = document.getElementById('ship-select-overlay');
  if (overlay) overlay.style.display = 'none';
  const hud = document.getElementById('weapon-hud');
  if (hud) hud.removeAttribute('hidden');
  const controls = document.getElementById('arena-controls');
  if (controls) controls.removeAttribute('hidden');
  buildArena();
}

function buildArena(): void {
  if (!selectedShip) return;

  const canvas = document.getElementById('lab-canvas') as HTMLCanvasElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new Scene();
  scene.background = new Color(0x050510);

  // Same FOV + camera z as src/game.ts:589-590 (production match).
  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 20);

  scene.add(new AmbientLight(0x404040, 1.5));
  const sun = new DirectionalLight(0xffffff, 2);
  sun.position.set(10, 10, 10);
  scene.add(sun);
  const rim = new DirectionalLight(0x445566, 0.8);
  rim.position.set(-10, -5, -5);
  scene.add(rim);

  // Ship: the chosen catalog mesh, owned by the lab (not handed back to a
  // Game class — we just keep it for the rest of the lab's lifetime).
  const shipGroup = new Group();
  shipGroup.add(selectedShip.mesh);
  shipGroup.position.set(0, 0, 0);
  scene.add(shipGroup);

  // Active ammo: 5 of each. We bypass ACTIVE_KIND_SPECS charge caps
  // (which are 3 for BOMB/DRONES/MISSILES) by writing directly into the
  // ammo state — this is a TEST lab, not a balance test.
  const activeAmmo = createEmptyActiveAmmo();
  for (const k of Object.values(PickupKind)) {
    if (k === PickupKind.MAGNET_BOOSTER) {
      activeAmmo[k].charges = 0; // MAGNET uses pendingTier in src/magnet-booster.ts
    } else {
      activeAmmo[k].charges = INITIAL_AMMO;
    }
  }

  const magnet = createMagnetBooster();
  // Pre-fill MAGNET to pendingTier 2 (max) so the first Digit4 press
  // activates at the highest tier — the user is here to see VFX, not
  // collect pickups.
  magnet.pendingTier = 2;

  const magnetRing = createActiveRing();
  const magnetField = createActiveField();
  scene.add(magnetRing);
  scene.add(magnetField);

  labState = {
    scene,
    camera,
    renderer,
    ship: {
      group: shipGroup,
      state: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, aim: { x: 1, y: 0 } },
    },
    input: new InputManager(),
    asteroids: [],
    activeAmmo,
    magnet,
    droneDeployments: [],
    missileSchedules: [],
    activeMissiles: [],
    shockwaves: [],
    coreFlashes: [],
    magnetRing,
    magnetField,
    startTimeSeconds: 0,
  };

  spawnAsteroids();
  preloadMissileTexture();
  refreshHud();
  bindArenaControls();
  bindResize();

  if (labRafId) cancelAnimationFrame(labRafId);
  const clock = new Clock();
  labState.startTimeSeconds = performance.now() / 1000;
  function loop(): void {
    labRafId = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 1 / 30);
    tickArena(dt);
    renderer.render(scene, camera);
  }
  loop();
}

function bindResize(): void {
  if (!labState) return;
  const onResize = (): void => {
    if (!labState) return;
    labState.camera.aspect = window.innerWidth / window.innerHeight;
    labState.camera.updateProjectionMatrix();
    labState.renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);
}

function bindArenaControls(): void {
  const respawn = document.getElementById('respawn-asteroids-button');
  if (respawn) respawn.addEventListener('click', respawnAsteroids);
  const reload = document.getElementById('reload-ammo-button');
  if (reload) reload.addEventListener('click', reloadAmmo);
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-frame arena tick
// ═══════════════════════════════════════════════════════════════════════════

function tickArena(dt: number): void {
  if (!labState) return;
  const gameTime = performance.now() / 1000 - labState.startTimeSeconds;
  const input = labState.input.currentState();

  // ── Ship movement (Arena clone) ──────────────────────────────────────
  applyShipMovement(labState.ship.state, input, dt);
  labState.ship.group.position.x = labState.ship.state.position.x;
  labState.ship.group.position.y = labState.ship.state.position.y;
  labState.ship.group.rotation.z = Math.atan2(labState.ship.state.aim.y, labState.ship.state.aim.x) - Math.PI / 2;

  // ── Input → fire actions ────────────────────────────────────────────
  // Mirror src/game.ts:998-1085 dispatch. We use the live useActive1/2/3/4
  // booleans because the lab doesn't need charge-up (Digit2 fires on press
  // here — no release detection for drones).
  if (input.useActive1) tryFireBomb();
  if (input.useActive2) tryFireDrones();
  if (input.useActive3) tryFireMissiles();
  if (input.useMagnetBooster) tryFireMagnet(gameTime);

  // ── Active ammo cooldowns (skip MAGNET — it uses gameTime in
  //    src/magnet-booster.ts) ───────────────────────────────────────────
  for (const k of Object.values(PickupKind)) {
    if (k === PickupKind.MAGNET_BOOSTER) continue;
    tickActiveAmmo(labState.activeAmmo[k], dt);
  }

  // ── Magnet state machine ────────────────────────────────────────────
  tickMagnetBooster(labState.magnet, gameTime);

  // ── Per-frame VFX updates ───────────────────────────────────────────
  // Drone beam hits arrive through dep.beamHitCallback (set in
  // tryFireDrones), so the onDroneFire arg here is just a no-op
  // placeholder for the legacy projectile fire path (drones no longer
  // spawn projectiles — Phase 7i-2 Task 6 beam rewire).
  const shipPos: Vector2 = {
    x: labState.ship.state.position.x,
    y: labState.ship.state.position.y,
  };
  const asteroidStates = labState.asteroids.map((a) => a.state);
  labState.droneDeployments = tickDroneDeployments(
    labState.droneDeployments,
    shipPos,
    asteroidStates,
    dt,
    labState.scene,
    () => { /* drones fire beams, not projectiles */ },
  );
  labState.missileSchedules = tickMissileVolleySchedules(
    labState.missileSchedules,
    shipPos,
    labState.ship.state.aim,
    dt,
    labState.scene,
    labState.activeMissiles,
  );
  labState.activeMissiles = tickHomingMissiles(
    labState.activeMissiles,
    asteroidStates,
    dt,
    labState.scene,
    (asteroid) => {
      // Lab-only damage path: matching HOMING_MISSILES_DAMAGE = 10.
      damageAsteroid(asteroid, 10);
    },
  );
  labState.shockwaves = updateShockwaves(labState.shockwaves, labState.scene, dt);
  updateShockwaveParticles(dt);
  updateCoreFlashes(dt);
  updateMagnetVfx(dt, gameTime);

  // ── Asteroid update (drift + cull) ──────────────────────────────────
  tickAsteroids(dt);

  // ── HUD reconcile ───────────────────────────────────────────────────
  refreshHud();
}

function applyShipMovement(
  ship: { position: Vector2; velocity: Vector2; aim: Vector2 },
  input: { move: Vector2; aim: Vector2 },
  dt: number,
): void {
  // Aim toward mouse (transform screen→world using camera projection:
  // we keep it simple and use the screen-centered direction, which
  // matches what production does for top-down aim).
  const dx = input.aim.x - window.innerWidth / 2;
  const dy = -(input.aim.y - window.innerHeight / 2);
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    ship.aim = { x: dx / len, y: dy / len };
  }
  // Thrust relative to facing.
  const forward = input.move.y;
  const strafe = input.move.x;
  const accelX = (forward * ship.aim.x + strafe * ship.aim.y) * SHIP_ACCEL;
  const accelY = (forward * ship.aim.y - strafe * ship.aim.x) * SHIP_ACCEL;
  ship.velocity = {
    x: ship.velocity.x + accelX * dt,
    y: ship.velocity.y + accelY * dt,
  };
  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  if (speed > SHIP_MAX_SPEED) {
    const scale = SHIP_MAX_SPEED / speed;
    ship.velocity = { x: ship.velocity.x * scale, y: ship.velocity.y * scale };
  }
  ship.position = {
    x: ship.position.x + ship.velocity.x * dt,
    y: ship.position.y + ship.velocity.y * dt,
  };
  // Soft bounce at arena bounds (mirror arena-controller.ts:69-86).
  let { x: vx, y: vy } = ship.velocity;
  let { x: px, y: py } = ship.position;
  if (px > ARENA_HALF_WIDTH) { px = ARENA_HALF_WIDTH; vx *= -BOUNCE_DAMPING; }
  else if (px < -ARENA_HALF_WIDTH) { px = -ARENA_HALF_WIDTH; vx *= -BOUNCE_DAMPING; }
  if (py > ARENA_HALF_HEIGHT) { py = ARENA_HALF_HEIGHT; vy *= -BOUNCE_DAMPING; }
  else if (py < -ARENA_HALF_HEIGHT) { py = -ARENA_HALF_HEIGHT; vy *= -BOUNCE_DAMPING; }
  ship.position = { x: px, y: py };
  ship.velocity = { x: vx, y: vy };
}

// ═══════════════════════════════════════════════════════════════════════════
// Asteroid lifecycle
// ═══════════════════════════════════════════════════════════════════════════

function spawnAsteroids(): void {
  if (!labState) return;
  for (let i = 0; i < ASTEROID_COUNT; i++) {
    spawnOneAsteroid();
  }
}

function spawnOneAsteroid(): void {
  if (!labState) return;
  const size = ASTEROID_SIZE_POOL[Math.floor(Math.random() * ASTEROID_SIZE_POOL.length)];
  const angle = Math.random() * Math.PI * 2;
  const r = ASTEROID_RING_MIN + Math.random() * (ASTEROID_RING_MAX - ASTEROID_RING_MIN);
  const position: Vector2 = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  // Drift slowly outward so the ring expands over time.
  const velocity: Vector2 = {
    x: Math.cos(angle) * 0.3,
    y: Math.sin(angle) * 0.3,
  };
  const state = createAsteroidState(size, position, velocity, false, AsteroidKind.IRON);
  const mesh = createAsteroidMesh(size, false, AsteroidKind.IRON);
  mesh.position.set(position.x, position.y, 0);
  labState.scene.add(mesh);
  labState.asteroids.push({ state, mesh });
}

function respawnAsteroids(): void {
  if (!labState) return;
  for (const a of labState.asteroids) {
    labState.scene.remove(a.mesh);
    disposeAsteroidMesh(a.mesh);
  }
  labState.asteroids = [];
  spawnAsteroids();
}

function tickAsteroids(dt: number): void {
  if (!labState) return;
  const alive: LabAsteroid[] = [];
  for (const a of labState.asteroids) {
    a.state.position = {
      x: a.state.position.x + a.state.velocity.x * dt,
      y: a.state.position.y + a.state.velocity.y * dt,
    };
    a.mesh.position.x = a.state.position.x;
    a.mesh.position.y = a.state.position.y;
    // Cull only if extremely far (the asteroid ring is bounded; this
    // guard keeps the lab scene from accumulating dead asteroids if the
    // user leaves it open for hours).
    const r = Math.hypot(a.state.position.x, a.state.position.y);
    if (r < 30) {
      alive.push(a);
    } else {
      labState.scene.remove(a.mesh);
      disposeAsteroidMesh(a.mesh);
    }
  }
  labState.asteroids = alive;
}

/**
 * Lab-only damage helper. Mirrors Game.destroyIronAsteroid for the visual
 * test path: decrement health, and if it hits zero, remove the asteroid
 * and spawn two SMALLER children (the classic Asteroids split). We
 * intentionally do NOT call into the full Game destroy path because the
 * lab is decoupled from scoring / pickup drops / crystal cascades.
 */
function damageAsteroid(asteroid: AsteroidState, damage: number): void {
  if (!labState) return;
  const live = labState.asteroids.find((a) => a.state === asteroid);
  if (!live) return;
  live.state.health -= damage;
  if (live.state.health <= 0) {
    splitAsteroidLocal(live);
  }
}

function splitAsteroidLocal(parent: LabAsteroid): void {
  if (!labState) return;
  const p = parent.state.position;
  let childSize: AsteroidSize;
  switch (parent.state.size) {
    case AsteroidSize.LARGE: childSize = AsteroidSize.MEDIUM; break;
    case AsteroidSize.MEDIUM: childSize = AsteroidSize.SMALL; break;
    case AsteroidSize.SMALL: childSize = AsteroidSize.TINY; break;
    case AsteroidSize.TINY:
    default:
      labState.scene.remove(parent.mesh);
      disposeAsteroidMesh(parent.mesh);
      labState.asteroids = labState.asteroids.filter((a) => a !== parent);
      return;
  }
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity: Vector2 = { x: Math.cos(angle) * 1.5, y: Math.sin(angle) * 1.5 };
    const position: Vector2 = { x: p.x, y: p.y };
    const state = createAsteroidState(childSize, position, velocity, false, AsteroidKind.IRON);
    const mesh = createAsteroidMesh(childSize, false, AsteroidKind.IRON);
    mesh.position.set(position.x, position.y, 0);
    labState.scene.add(mesh);
    labState.asteroids.push({ state, mesh });
  }
  labState.scene.remove(parent.mesh);
  disposeAsteroidMesh(parent.mesh);
  labState.asteroids = labState.asteroids.filter((a) => a !== parent);
}

// ═══════════════════════════════════════════════════════════════════════════
// Fire actions
// ═══════════════════════════════════════════════════════════════════════════

function tryFireBomb(): void {
  if (!labState) return;
  const ammo = labState.activeAmmo[PickupKind.BOMB_STRIKE];
  if (!canFireActive(ammo)) return;
  if (!consumeActiveCharge(ammo, PickupKind.BOMB_STRIKE)) return;
  fireLabBombStrike({ x: labState.ship.state.position.x, y: labState.ship.state.position.y });
}

function fireLabBombStrike(position: Vector2): void {
  if (!labState) return;
  // Stripped clone of src/game.ts:fireBombStrike. Keeps the shockwave +
  // particles + screen flash but skips the Game-level camera-shake /
  // freeze-frame / punch-zoom since those are not VFX under review here.
  triggerScreenFlash();
  // Core flash (mirrors src/game.ts:1851-1863).
  const core = new Mesh(
    new IcosahedronGeometry(0.5, 2),
    new MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  core.position.set(position.x, position.y, -0.1);
  labState.scene.add(core);
  labState.coreFlashes.push({ mesh: core, age: 0, duration: 0.1 });

  // Primary ring.
  labState.shockwaves.push(new Shockwave({ x: position.x, y: position.y }, 0xff8800, 1.0, 16.0));
  // Shock-front particles.
  emitShockwaveParticles(labState.scene, position.x, position.y, {
    count: 30,
    speed: 30,
    color: 0xffcc66,
    lifetime: 0.5,
  });
  // Debris chunks.
  emitShockwaveParticles(labState.scene, position.x, position.y, {
    count: 8,
    speed: 30,
    color: 0xffaa00,
    lifetime: 0.6,
    isDebris: true,
  });
  // Secondary outer ring.
  labState.shockwaves.push(new Shockwave({ x: position.x, y: position.y }, 0xff4400, 0.5, 18.0));

  // Damage pass.
  const alive: LabAsteroid[] = [];
  for (const a of labState.asteroids) {
    const d = Math.hypot(a.state.position.x - position.x, a.state.position.y - position.y);
    if (d <= BOMB_RADIUS) {
      a.state.health = Math.max(0, a.state.health - BOMB_DAMAGE);
      if (a.state.health <= 0) {
        splitAsteroidLocal(a);
        continue;
      }
    }
    alive.push(a);
  }
  labState.asteroids = alive;
}

function tryFireDrones(): void {
  if (!labState) return;
  const ammo = labState.activeAmmo[PickupKind.ORBIT_DRONES];
  if (!canFireActive(ammo)) return;
  if (labState.droneDeployments.length > 0) {
    // Re-press while active: refund the charge so the press is not lost.
    ammo.charges += 1;
    ammo.cooldownRemaining = 0;
    return;
  }
  if (!consumeActiveCharge(ammo, PickupKind.ORBIT_DRONES)) return;
  // Lab always deploys at tier 3 (max drones) for visual review of the
  // full power. Production game.ts computes tier from banked charges.
  const dep = spawnDroneDeployment(
    { x: labState.ship.state.position.x, y: labState.ship.state.position.y },
    labState.scene,
    3,
  );
  dep.beamHitCallback = (asteroid, _tier) => {
    damageAsteroid(asteroid, 1);
  };
  labState.droneDeployments.push(dep);
}

function tryFireMissiles(): void {
  if (!labState) return;
  const ammo = labState.activeAmmo[PickupKind.HOMING_MISSILES];
  if (!canFireActive(ammo)) return;
  if (!consumeActiveCharge(ammo, PickupKind.HOMING_MISSILES)) return;
  labState.missileSchedules.push(
    scheduleMissileVolley(
      { x: labState.ship.state.position.x, y: labState.ship.state.position.y },
      labState.ship.state.aim,
    ),
  );
}

function tryFireMagnet(gameTime: number): void {
  if (!labState) return;
  // Different from the 3 other weapons: MAGNET uses the magnet-booster
  // state machine (pendingTier / activeTier) instead of the ammo
  // charge-counter. The lab pre-fills pendingTier=2 on init, so the
  // first Digit4 press activates at the highest tier. Subsequent
  // presses are no-ops until the 10s window expires — matching
  // src/magnet-booster.ts:activateMagnetBooster.
  if (labState.magnet.activeUntil > gameTime) return;
  if (labState.magnet.pendingTier === 0) {
    // Re-fill pendingTier so the user can keep testing after each expiry.
    labState.magnet.pendingTier = 2;
  }
  activateMagnetBooster(labState.magnet, gameTime);
}

// ═══════════════════════════════════════════════════════════════════════════
// VFX helpers
// ═══════════════════════════════════════════════════════════════════════════

function triggerScreenFlash(): void {
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.background = 'white';
  flash.style.pointerEvents = 'none';
  flash.style.zIndex = '15';
  flash.style.opacity = '0.6';
  flash.style.transition = 'opacity 0.15s ease-out';
  document.body.appendChild(flash);
  // Force layout, then fade.
  void flash.offsetWidth;
  flash.style.opacity = '0';
  setTimeout(() => flash.remove(), 200);
}

function updateCoreFlashes(dt: number): void {
  if (!labState) return;
  const alive: typeof labState.coreFlashes = [];
  for (const f of labState.coreFlashes) {
    f.age += dt;
    if (f.age >= f.duration) {
      labState.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as MeshBasicMaterial).dispose();
      continue;
    }
    const t = f.age / f.duration;
    f.mesh.scale.setScalar(1 + t * 1.0);
    (f.mesh.material as MeshBasicMaterial).opacity = 0.7 * (1 - t);
    alive.push(f);
  }
  labState.coreFlashes = alive;
}

function updateMagnetVfx(dt: number, gameTime: number): void {
  if (!labState) return;
  const remaining = activeRemainingSeconds(labState.magnet, gameTime);
  const effectiveTier = (labState.magnet.activeTier > 0
    ? labState.magnet.activeTier
    : labState.magnet.pendingTier) as 0 | 1 | 2;
  updateActiveRing(labState.magnetRing, effectiveTier, remaining, dt);
  updateActiveField(labState.magnetField, effectiveTier, remaining, dt);
}

// ═══════════════════════════════════════════════════════════════════════════
// HUD
// ═══════════════════════════════════════════════════════════════════════════

function refreshHud(): void {
  if (!labState) return;
  updateHudPill('BOMB_STRIKE', labState.activeAmmo[PickupKind.BOMB_STRIKE]);
  updateHudPill('ORBIT_DRONES', labState.activeAmmo[PickupKind.ORBIT_DRONES]);
  updateHudPill('HOMING_MISSILES', labState.activeAmmo[PickupKind.HOMING_MISSILES]);
  updateMagnetPill();
}

function updateHudPill(kind: string, ammo: ActiveAmmoState): void {
  const pill = document.querySelector(`.lab-hud-pill[data-kind="${kind}"]`);
  if (!pill) return;
  const count = pill.querySelector('.lab-hud-pill-count');
  const bar = pill.querySelector('.lab-hud-pill-bar') as HTMLElement | null;
  const state = pill.querySelector('.lab-hud-pill-state');
  if (count) count.textContent = String(ammo.charges);
  if (bar) {
    const pct = Math.min(100, (ammo.charges / 5) * 100);
    bar.style.width = `${pct}%`;
  }
  if (state) {
    let label = 'READY';
    if (ammo.charges <= 0) label = 'EMPTY';
    else if (ammo.cooldownRemaining > 0) label = 'CD';
    state.textContent = label;
  }
  (pill as HTMLElement).style.opacity = ammo.charges <= 0 ? '0.3' : '1.0';
}

function updateMagnetPill(): void {
  if (!labState) return;
  const pill = document.querySelector('.lab-hud-pill[data-kind="MAGNET_BOOSTER"]');
  if (!pill) return;
  const count = pill.querySelector('.lab-hud-pill-count');
  const bar = pill.querySelector('.lab-hud-pill-bar') as HTMLElement | null;
  const state = pill.querySelector('.lab-hud-pill-state');
  const gameTime = performance.now() / 1000 - labState.startTimeSeconds;
  const remaining = activeRemainingSeconds(labState.magnet, gameTime);
  const multiplier = effectiveMagnetMultiplier(labState.magnet);
  if (count) count.textContent = String(multiplier);
  if (bar) {
    const pct = remaining > 0 ? Math.min(100, (remaining / 10) * 100) : 0;
    bar.style.width = `${pct}%`;
  }
  if (state) {
    let label = `${multiplier}X PENDING`;
    if (remaining > 0) {
      label = `${multiplier}X ACTIVE`;
    } else if (labState.magnet.pendingTier === 0) {
      label = 'EMPTY';
    }
    state.textContent = label;
  }
  (pill as HTMLElement).style.opacity = labState.magnet.pendingTier === 0 && remaining === 0 ? '0.3' : '1.0';
}

// ═══════════════════════════════════════════════════════════════════════════
// Respawn / Reload
// ═══════════════════════════════════════════════════════════════════════════

function reloadAmmo(): void {
  if (!labState) return;
  for (const k of Object.values(PickupKind)) {
    if (k === PickupKind.MAGNET_BOOSTER) continue;
    labState.activeAmmo[k].charges = INITIAL_AMMO;
    labState.activeAmmo[k].cooldownRemaining = 0;
  }
  labState.magnet.pendingTier = 2;
  labState.magnet.activeTier = 0;
  labState.magnet.activeUntil = 0;
  for (const dep of labState.droneDeployments) {
    disposeDroneDeployment(dep, labState.scene);
  }
  labState.droneDeployments = [];
  refreshHud();
}

// ═══════════════════════════════════════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════════════════════════════════════

export function startWeaponLab(): void {
  loadShips()
    .then(() => preloadMissileTexture())
    .then(() => {
      renderShipGrid();
      updateFocus();
      bindShipSelectKeys();
      bindLaunchButton();
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Weapon lab failed to load ships:', err);
    });
}

// Auto-boot on script load. Matches the asteroid lab pattern in
// src/test-lab/lab.ts (which also auto-starts via the <script> tag).
startWeaponLab();

export function disposeWeaponLab(): void {
  if (labRafId) cancelAnimationFrame(labRafId);
  labRafId = 0;
  if (labState) {
    labState.input.destroy();
    for (const a of labState.asteroids) {
      labState.scene.remove(a.mesh);
      disposeAsteroidMesh(a.mesh);
    }
    for (const dep of labState.droneDeployments) {
      disposeDroneDeployment(dep, labState.scene);
    }
    for (const wave of labState.shockwaves) {
      labState.scene.remove(wave.mesh);
      wave.dispose();
    }
    labState.shockwaves = [];
    disposeShockwaveParticles();
    labState.scene.remove(labState.magnetRing);
    labState.scene.remove(labState.magnetField);
    (labState.magnetRing.material as MeshBasicMaterial).dispose();
    (labState.magnetField.material as MeshBasicMaterial).dispose();
    labState.renderer.dispose();
  }
  labState = null;
}
