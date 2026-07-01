// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Weapon Test Lab (LAB-NO2)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Standalone test harness for the 3 active deployable weapons
//          (BOMB_STRIKE / ORBIT_DRONES / HOMING_MISSILES) and the 1 active
//          buff (MAGNET_BOOSTER). User picks a ship, clicks LAUNCH, then
//          presses Digit1/2/3/4 to fire each weapon at 10 spawned iron
//          asteroids — no level / wave / pickup-drop system, no scoring.
//          Camera follows the ship (Arena-style, no drift).
// Setup:   Served from public/test-lab/weapon-lab.html. Mounts the SAME
//          useActiveItem + fireBombStrike + ship-movement free functions
//          that the production game calls (Phase 7i-3 refactor). The lab
//          builds its own GameplayContext with no-op DOM callbacks so the
//          bomb's screen flash / punch-zoom / camera shake are skipped
//          (the lab has no DOM HUD wrap or shake camera), but the bomb's
//          6-layer VFX, charge-stack deploy, drone beam logic, and
//          missile-schedule spawning are byte-for-byte production paths.
//          Camera follows the ship at z=20 / FOV=60° matching the
//          production game camera.
// Issues:  Pre-Lab-2 the only way to see active-weapon VFX was to play
//          the game, collect pickups, and fire in a real arena. Reviewing
//          per-weapon tuning (beam radius, missile sprite, bomb ring
//          timing) required full game flow.
//          Pre-Phase-7i-3 the lab re-implemented useActiveItem +
//          fireBombStrike + ship-movement + asteroid-damage in a parallel
//          code path that drifted from production. The lab bomb was no
//          longer a faithful copy of the production bomb.
// Fix:     Phase 7i-3 — the lab now mounts the SAME code paths the
//          production game uses via src/gameplay-context.ts. The lab
//          builds a GameplayContext that supplies its own damage callback
//          (a local splitAsteroid mirror) and omits all 6 DOM/visual
//          side-effect callbacks (the lab has no .game-wrap DOM and no
//          shake camera, so bomb-triggered screen flash / punch-zoom /
//          camera shake are intentionally skipped — see
//          gameplay-context.ts Gotcha #2 for the design rationale).
// Gotchas: The lab creates its OWN camera + scene + InputManager; it does
//          not import the production Game class. The lab's local
//          damageAsteroid path uses a smaller damage value (1 per drone
//          beam hit, 10 per missile impact) that matches the production
//          constants but routes through a lab-only splitAsteroid helper
//          (no score, no pickup drops). The lab deploys drones at tier 3
//          unconditionally so the user always sees the peak-tier visual
//          — production's charge-stack deploy (1/2/3 charges → tier 1/2/3)
//          is replaced with a fixed tier-3 max for visual review.
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
  tickActiveAmmo,
} from '../pickups';
import {
  DroneDeploymentState,
  HomingMissileState,
  VolleySchedule,
  disposeDroneDeployment,
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
import { applyArenaShipMovement } from '../movement/arena-controller';
import {
  GameplayContext,
  GameplayAsteroid,
  fireBombStrike,
  useActiveItem,
} from '../gameplay-context';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — single source of truth for the lab
// ═══════════════════════════════════════════════════════════════════════════

// Initial ammo bank. 5 of each so the user can fire BOMB×5 + DRONES×5 +
// MISSILES×5 + MAGNET×5 without worrying about running dry mid-test.
const INITIAL_AMMO = 5;

const ASTEROID_COUNT = 10;
const ASTEROID_RING_MIN = 8;
const ASTEROID_RING_MAX = 12;

// Lab-only damage per drone beam hit. Production's ORBIT_DRONES_DAMAGE = 1
// (src/pickups.ts:518) — we hard-code 1 here to match production's beam
// damage without re-importing the constant (the lab is a self-contained
// test surface; pulling in too many production constants makes the
// imports noise-heavy).
const DRONE_BEAM_DAMAGE = 1;

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

  // ── Ship movement (production Arena controller) ──────────────────────
  // Phase 7i-3 refactor — the lab previously had a hand-cloned
  // applyShipMovement (lines 488-529) that drifted from production. The
  // lab now calls the SAME applyArenaShipMovement free function exported
  // by src/movement/arena-controller.ts that production's
  // ArenaMovementController.apply() delegates to. Mouse-aim is computed
  // here (the production controller's apply() takes aim as input; the
  // lab's aim is mouse-driven, not the production gamepad/keyboard aim).
  updateShipAimFromMouse(labState.ship.state, input);
  applyArenaShipMovement(labState.ship.state, input, dt);
  labState.ship.group.position.x = labState.ship.state.position.x;
  labState.ship.group.position.y = labState.ship.state.position.y;
  labState.ship.group.rotation.z = Math.atan2(labState.ship.state.aim.y, labState.ship.state.aim.x) - Math.PI / 2;

  // ── Input → fire actions ────────────────────────────────────────────
  // Mirror src/game.ts:998-1085 dispatch. We use the live useActive1/2/3/4
  // booleans because the lab doesn't need charge-up (Digit2 fires on press
  // here — no release detection for drones). tryFireWeapon routes through
  // the production useActiveItem free function (Phase 7i-3 refactor) so
  // the lab's bomb / drones / missiles are byte-equivalent to production.
  if (input.useActive1) tryFireWeapon(PickupKind.BOMB_STRIKE);
  if (input.useActive2) tryFireWeapon(PickupKind.ORBIT_DRONES);
  if (input.useActive3) tryFireWeapon(PickupKind.HOMING_MISSILES);
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
      labDamageAsteroid(asteroid, 10);
    },
  );
  labState.shockwaves = updateShockwaves(labState.shockwaves, labState.scene, dt);
  updateShockwaveParticles(dt);
  updateLabCoreFlashes(dt);
  updateMagnetVfx(dt, gameTime);

  // ── Asteroid update (drift + cull) ──────────────────────────────────
  tickAsteroids(dt);

  // ── HUD reconcile ───────────────────────────────────────────────────
  refreshHud();
}

/**
 * Lab-only mouse-aim updater. Production reads aim from gamepad/keyboard
 * (see src/ship-controller.ts:readShipAim) — the lab's input is mouse
 * position. The production `applyArenaShipMovement` consumes aim from
 * `ship.aim` without computing it, so the lab updates aim here BEFORE
 * calling the production movement function. This is the one piece of
 * ship behavior the lab owns (it does not exist in production because
 * production's aim path lives in the ShipController's per-frame update).
 */
function updateShipAimFromMouse(
  ship: { aim: Vector2 },
  input: { aim: Vector2 },
): void {
  const dx = input.aim.x - window.innerWidth / 2;
  const dy = -(input.aim.y - window.innerHeight / 2);
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    ship.aim = { x: dx / len, y: dy / len };
  }
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
/**
 * Lab-only damage helper. Mirrors the relevant subset of
 * Game.destroyAsteroid for the visual test path: decrement health, and
 * if it hits zero, call labSplitAsteroid (which spawns two SMALLER
 * children — the classic Asteroids split, or removes the asteroid
 * outright for TINY size). We intentionally do NOT call into the full
 * Game destroy path because the lab is decoupled from scoring /
 * pickup drops / crystal cascades / shard swarms.
 *
 * Phase 7i-3 refactor — this is the callback wired into the lab's
 * GameplayContext.onDamageAsteroid (see labBuildContext). The free
 * function fireBombStrike in src/gameplay-context.ts calls this
 * callback after its own damage pass decrements health, so the lab's
 * BOMB behavior is byte-equivalent to production's BOMB except for
 * scoring.
 */
function labDamageAsteroid(asteroid: AsteroidState, damage: number): void {
  if (!labState) return;
  const live = labState.asteroids.find((a) => a.state === asteroid);
  if (!live) return;
  live.state.health -= damage;
  if (live.state.health <= 0) {
    labSplitAsteroid(live);
  }
}

function labSplitAsteroid(parent: LabAsteroid): void {
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

/**
 * Lab's core-flash tween. The production fireBombStrike free function
 * pushes a new { mesh, age, duration } onto ctx.activeCoreFlashes, and
 * the production Game's update loop tweens + disposes them at lines
 * 2058-2076 of src/game.ts. The lab has no Game update loop, so we
 * re-implement the tween here. This is the ONLY VFX helper the lab
 * still owns — everything else (shockwave, particles, ring, debris)
 * is owned by production. The tween math matches production byte-for-
 * byte (scale 1→2, opacity 0.7→0 over 0.1s) so a screenshot from the
 * lab and a screenshot from production look identical at the same
 * age.
 */
function updateLabCoreFlashes(dt: number): void {
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

// ═══════════════════════════════════════════════════════════════════════════
// Fire actions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a GameplayContext for the lab. The context is rebuilt on every
 * call (cheap — plain data + 2 closure objects) so per-frame state
 * (asteroids array, charge counters, etc.) is always current.
 *
 * Side-effect callbacks (onScreenFlash, onPunchZoom, onEdgeFlash,
 * onCameraShake, onFloatingText, onFreezeFrames) are intentionally
 * OMITTED — the lab has no DOM HUD wrap, no score floaters, no shake
 * camera. The bomb's 6-layer VFX (core flash, primary shockwave,
 * shock-front particles, debris chunks, secondary outer ring, floating
 * text) still all fire; only the production-only DOM/score side effects
 * are skipped. See gameplay-context.ts Gotcha #2 for design rationale.
 *
 * onDamageAsteroid routes to labDamageAsteroid (no score, no pickup
 * drops, no crystal cascade — just a local splitAsteroid mirror).
 */
function labBuildContext(): GameplayContext {
  if (!labState) {
    throw new Error('labBuildContext called before labState was initialized');
  }
  return {
    scene: labState.scene,
    activeAmmo: labState.activeAmmo,
    activeDeployments: labState.droneDeployments,
    homingMissiles: labState.activeMissiles,
    missileVolleySchedules: labState.missileSchedules,
    activeShockwaves: labState.shockwaves,
    activeCoreFlashes: labState.coreFlashes,
    magnet: labState.magnet,
    asteroids: labState.asteroids as unknown as GameplayAsteroid[],
    onDamageAsteroid: (asteroid, _damage, _source) => {
      // gameplay-context.ts already decremented health and verified
      // health <= 0. We route to the lab's local split handler. No
      // score / pickup / shard logic — the lab is a VFX review surface
      // for the BOMB itself, not the full destruction cascade.
      labSplitAsteroid(asteroid as unknown as LabAsteroid);
    },
    gameTimeSeconds: performance.now() / 1000 - labState.startTimeSeconds,
    getShipPosition: () => labState!.ship.state.position,
    getShipAim: () => labState!.ship.state.aim,
  };
}

/**
 * Lab-side fire dispatcher. Calls the production useActiveItem free
 * function with the lab's GameplayContext, then post-wires the drone
 * beam hit callback (which needs a closure over the lab's local damage
 * path — production wires it to Game.onDroneBeamHitAsteroid, the lab
 * wires it to labDamageAsteroid).
 *
 * Pattern matches src/game.ts:1746-1758 (useActiveItem in production).
 * Phase 7i-3 refactor — before this, the lab had tryFireBomb /
 * tryFireDrones / tryFireMissiles each duplicating the production
 * charge-check / consume / dispatch logic. They are now collapsed into
 * one call into the production free function.
 */
function tryFireWeapon(kind: PickupKind): void {
  if (!labState) return;
  const previousDroneCount = labState.droneDeployments.length;
  useActiveItem(labBuildContext(), kind);
  // Post-wire the drone beam hit callback (lab has no Game.onDroneBeamHitAsteroid
  // to bind to — the lab's damage path is a no-score split mirror).
  if (
    labState.droneDeployments.length > previousDroneCount &&
    kind === PickupKind.ORBIT_DRONES
  ) {
    const dep = labState.droneDeployments[labState.droneDeployments.length - 1];
    dep.beamHitCallback = (asteroid, _tier) => {
      labDamageAsteroid(asteroid, DRONE_BEAM_DAMAGE);
    };
  }
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
// (The lab previously had its own triggerScreenFlash + updateCoreFlashes
// helpers. The screen flash is now omitted entirely (the lab's
// GameplayContext does not wire onScreenFlash), and the core-flash
// tween is owned by the production fireBombStrike free function via
// ctx.activeCoreFlashes — the lab just hands that array to the free
// function, and the free function pushes a new flash + the lab's
// existing per-frame update path disposes it. See
// gameplay-context.ts:228-241 for the core-flash mesh construction
// that lives in production now.)

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
