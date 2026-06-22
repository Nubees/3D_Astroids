import {
  AdditiveBlending,
  Box3,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';

import { SHIP_EXHAUST_CONFIGS, EXHAUST_FLAME_NAME, ShipExhaustConfig } from './exhaust-config';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Gameplay Exhaust Flames
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Attach thrust flame cones to each gameplay ship at nozzle positions
//          derived from the actual GLB mesh geometry and tuned visually in the
//          Ship Hangar inspector. Flames appear only while forward thrust is
//          held (W/Up), are sized proportionally to each hull, and respect
//          player-defined nozzle layouts and colors stored by the hangar.
// Setup: Called once per ship in Game.create() before the shield/magnet children
//        are attached, so the bounding box measures only the GLB hull. The
//        catalog loader has already centered, rotated (-90° Z), and scaled the
//        GLB so size.x is nose-to-tail and size.y is left-to-right width.
// Issues: Previous flames were positioned by sprite PNG pixel proxies and raw
//         vertex clusters, producing misaligned and oversized results. A later
//         debugging pass also left red rings, a green hull-width line, and
//         console logging in this file.
// Fix: Flame base is shifted slightly inside the hull so it overlaps the
//      drawn idle exhaust glow on each ship, while the tip extends farther back.
//      Length is 35% of hull length, radius is 20% wider than config, and all
//      debug geometry and logging were removed.
// Gotchas: ConeGeometry points up (+Y) by default; scale Y by -1 and rotate Z by
//          -π/2 so the wide base sits at +X relative to the mesh origin and the
//          tip points backward (-X). The mesh must therefore be positioned at
//          rearX - length/2, not at the base itself.
// ═══════════════════════════════════════════════════════════════════════════

export const FLAME_NAME = EXHAUST_FLAME_NAME;

/** Flame length as a fraction of the ship's nose-to-tail bounding-box length. */
export const FLAME_LENGTH_RATIO = 0.35;

/** How far the flame base overlaps the drawn idle exhaust, as % of hull length. */
export const FLAME_BASE_OVERLAP_RATIO = 0.04;

/** Global width multiplier applied to every ship's flameWidthPercent radius. */
export const FLAME_WIDTH_MULTIPLIER = 1.20;

/** Per-ship base-overlap overrides keyed by catalog entry ID. Values are added to
 *  the global FLAME_BASE_OVERLAP_RATIO and are useful when one ship's drawn idle
 *  flame sits deeper inside the hull than the others. */
const SHIP_BASE_OVERLAP_OVERRIDES: ReadonlyMap<number, number> = new Map([
  [4, 0.15], // Ship 4 Starneedle — drawn idle flame sits deep; pull cone 15% closer
  [5, 0.10], // Ship 5 Cometbreaker — pull cone 10% closer
  [6, 0.10], // Ship 6 Dustdevil — pull cone 10% closer
  [8, 0.10], // Ship 8 Thunderbolt — pull cone 10% closer
]);

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Player-Defined Flame Color Overrides
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Let players change flame colors in the Ship Hangar and have those
//          choices carry into actual gameplay without editing source files.
// Setup: Colors are stored in localStorage under a project-specific key as a
//        map of shipId → number[] (hex color per nozzle). The hangar page
//        writes overrides; gameplay and the hangar preview read them.
// Issues: None.
// Fix: Added get/set/clear helpers that gracefully degrade when localStorage
//      is unavailable (Node tests, private browsing, storage quota).
// Gotchas: localStorage access is wrapped in try/catch because it throws in some
//          test environments and when disabled. Overrides are per-nozzle, so a
//          ship with four nozzles stores four colors.
// ═══════════════════════════════════════════════════════════════════════════

const FLAME_COLOR_STORAGE_KEY = '3dAstroidsFlameColors';
const EXHAUST_CONFIG_STORAGE_KEY = '3dAstroidsExhaustConfigs';

type FlameColorOverrides = Record<number, number[]>;
type ExhaustConfigOverrides = Record<number, ShipExhaustConfig>;

function loadColorOverrides(): FlameColorOverrides {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FLAME_COLOR_STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FlameColorOverrides;
    return parsed;
  } catch {
    return {};
  }
}

function saveColorOverrides(overrides: FlameColorOverrides): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FLAME_COLOR_STORAGE_KEY, JSON.stringify(overrides));
    }
  } catch {
    // Ignore storage errors (private mode, quota, disabled).
  }
}

export function getFlameColorOverride(shipId: number, nozzleIndex: number): number | null {
  const overrides = loadColorOverrides();
  const colors = overrides[shipId];
  if (!Array.isArray(colors)) return null;
  const color = colors[nozzleIndex];
  return typeof color === 'number' ? color : null;
}

export function setFlameColorOverride(shipId: number, nozzleIndex: number, color: number): void {
  const overrides = loadColorOverrides();
  const previous = overrides[shipId];
  const colors = Array.isArray(previous) ? [...previous] : [];
  colors[nozzleIndex] = color;
  saveColorOverrides({ ...overrides, [shipId]: colors });
}

export function clearFlameColorOverrides(shipId: number): void {
  const overrides = loadColorOverrides();
  const { [shipId]: _, ...rest } = overrides;
  saveColorOverrides(rest);
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Player-Defined Exhaust Config Overrides
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Allow the Ship Hangar to save entire per-ship exhaust nozzle layouts
//          (positions, widths, colors) and have gameplay pick them up instead of
//          the hard-coded src/exhaust-config.ts values.
// Setup: Full ShipExhaustConfig objects are stored under a project-specific
//        localStorage key as a map of shipId → config. Gameplay calls
//        getEffectiveExhaustConfig() to merge stored layout with defaults.
// Issues: None.
// Fix: Added load/save/get/clear helpers that degrade safely when localStorage is
//      unavailable, plus a helper that falls back to hard-coded configs.
// Gotchas: A stored config overrides the *entire* ShipExhaustConfig for that ship,
//          not just individual nozzles. The Hangar is responsible for keeping the
//          stored config structurally valid (nozzleCount matches nozzles.length).
// ═══════════════════════════════════════════════════════════════════════════

function loadExhaustConfigOverrides(): ExhaustConfigOverrides {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(EXHAUST_CONFIG_STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExhaustConfigOverrides;
    return parsed;
  } catch {
    return {};
  }
}

function saveExhaustConfigOverrides(overrides: ExhaustConfigOverrides): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(EXHAUST_CONFIG_STORAGE_KEY, JSON.stringify(overrides));
    }
  } catch {
    // Ignore storage errors.
  }
}

export function getEffectiveExhaustConfig(shipId: number): ShipExhaustConfig | undefined {
  const stored = loadExhaustConfigOverrides()[shipId];
  if (stored && Array.isArray(stored.nozzles)) {
    return { ...stored, nozzleCount: stored.nozzles.length };
  }
  return SHIP_EXHAUST_CONFIGS.get(shipId);
}

export function setExhaustConfigOverride(shipId: number, config: ShipExhaustConfig): void {
  const overrides = loadExhaustConfigOverrides();
  saveExhaustConfigOverrides({
    ...overrides,
    [shipId]: { ...config, nozzleCount: config.nozzles.length },
  });
}

export function clearExhaustConfigOverride(shipId: number): void {
  const overrides = loadExhaustConfigOverrides();
  const { [shipId]: _, ...rest } = overrides;
  saveExhaustConfigOverrides(rest);
}

export function clearAllExhaustOverrides(shipId: number): void {
  clearExhaustConfigOverride(shipId);
  clearFlameColorOverrides(shipId);
}

/** Attach exhaust flame cones to a gameplay ship based on its catalog entry ID. */
export function attachGameplayFlames(shipGroup: Group, shipId: number): void {
  const config = getEffectiveExhaustConfig(shipId);
  if (!config) {
    // Unknown ship — no flames. Warn so a missing catalog entry is not silent.
    // eslint-disable-next-line no-console
    console.warn(`No exhaust config for ship ${shipId}; flames disabled.`);
    return;
  }

  const box = new Box3().setFromObject(shipGroup);
  const size = new Vector3();
  box.getSize(size);

  // After catalog.ts rotation (-90° Z): size.x = nose-to-tail, size.y = left-to-right.
  const hullWidthY = size.y;
  const hullLengthX = size.x;
  const halfLengthX = hullLengthX * 0.5;
  const rearX = -halfLengthX;
  const flameLength = hullLengthX * FLAME_LENGTH_RATIO;
  const baseOverlap = hullLengthX * FLAME_BASE_OVERLAP_RATIO;

  const perShipOverlap = getPerShipBaseOverlap(shipId, baseOverlap, hullLengthX);

  config.nozzles.forEach((nozzle, nozzleIndex) => {
    const yAnchor = (-0.5 + nozzle.xPosition) * hullWidthY;
    const flameRadius = nozzle.flameWidthPercent * hullWidthY * 0.5
      * FLAME_WIDTH_MULTIPLIER;
    const brightness = Math.random() * (nozzle.brightnessMax - nozzle.brightnessMin)
      + nozzle.brightnessMin;

    // Base sits inside the hull by perShipOverlap so the particle flame covers the
    // drawn idle exhaust; the tip extends flameLength behind the ship.
    const baseX = rearX + perShipOverlap;
    const colorOverride = getFlameColorOverride(shipId, nozzleIndex);
    createFlameCone(shipGroup, {
      color: colorOverride !== null ? colorOverride : nozzle.color,
      length: flameLength,
      radius: flameRadius,
      position: { x: baseX - flameLength * 0.5, y: yAnchor, z: 0 },
      brightness,
    });
  });
}

export function toggleFlames(group: Group, visible: boolean): void {
  group.traverse((child) => {
    if (child.name === FLAME_NAME) {
      (child as Mesh).visible = visible;
    }
  });
}

function createFlameCone(
  parent: Group,
  spec: FlameSpec,
): void {
  // ConeGeometry default: tip at +Y, base at -Y.
  // scale(1, -1, 1) flips it so tip is at -Y and base is at +Y.
  // rotateZ(-π/2) then maps +Y to +X and -Y to -X, so the wide base is at +X
  // (the mesh center) and the tip points toward -X.
  const geometry = new ConeGeometry(spec.radius, spec.length, 8);
  geometry.scale(1, -1, 1);
  geometry.rotateZ(-Math.PI / 2);

  const material = new MeshBasicMaterial({
    color: spec.color,
    transparent: true,
    opacity: Math.min(0.95, spec.brightness),
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = FLAME_NAME;
  mesh.position.set(spec.position.x, spec.position.y, spec.position.z);

  parent.add(mesh);
}

function getPerShipBaseOverlap(
  shipId: number,
  defaultOverlap: number,
  hullLengthX: number,
): number {
  const override = SHIP_BASE_OVERLAP_OVERRIDES.get(shipId);
  if (override !== undefined) {
    return defaultOverlap + hullLengthX * override;
  }
  return defaultOverlap;
}

interface FlameSpec {
  readonly color: number;
  readonly length: number;
  readonly radius: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly brightness: number;
}
