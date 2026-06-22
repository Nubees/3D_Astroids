import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { SHIP_EXHAUST_CONFIGS } from '../src/exhaust-config';
import { SHIP_CATALOG } from '../src/ships/catalog';
import {
  attachGameplayFlames,
  toggleFlames,
  FLAME_NAME,
  FLAME_LENGTH_RATIO,
  FLAME_BASE_OVERLAP_RATIO,
  FLAME_WIDTH_MULTIPLIER,
  getFlameColorOverride,
  setFlameColorOverride,
  clearFlameColorOverrides,
  getEffectiveExhaustConfig,
  setExhaustConfigOverride,
  clearExhaustConfigOverride,
} from '../src/exhaust-gameplay';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Exhaust Placement Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the per-ship exhaust flame config and the runtime placement
//          math that anchors flame cones to a ship's bounding box, including
//          player-defined flame color and full nozzle-layout overrides stored
//          in localStorage.
// Setup: Build a synthetic ship group with a known box size so expected
//        nozzle positions can be computed without loading GLBs. Mock
//        localStorage so override persistence can be exercised in Node.
// Issues: None.
// Fix: Added coverage for the new exhaust-config / exhaust-gameplay modules
//      and the color override helpers.
// Gotchas: The cone geometry is flipped and rotated; this file only asserts
//          flame count, mesh names, material color, and world-space anchor
//          positions, not the transformed cone vertices. localStorage is a
//          global stub, so tests must clean it up to avoid cross-test leakage.
// ═══════════════════════════════════════════════════════════════════════════

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem(key: string): string | null {
      return store[key] ?? null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createShipGroup(lengthX: number, widthY: number, depthZ = 1): Group {
  const group = new Group();
  const geometry = new BoxGeometry(lengthX, widthY, depthZ);
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  group.add(mesh);
  return group;
}

describe('SHIP_EXHAUST_CONFIGS', () => {
  it('has a config for every catalog ship id', () => {
    SHIP_CATALOG.forEach((entry) => {
      const config = SHIP_EXHAUST_CONFIGS.get(entry.id);
      expect(config).toBeDefined();
      expect(config!.nozzleCount).toBe(config!.nozzles.length);
    });
  });

  it('keeps nozzle xPosition inside [0, 1]', () => {
    SHIP_EXHAUST_CONFIGS.forEach((config) => {
      config.nozzles.forEach((nozzle) => {
        expect(nozzle.xPosition).toBeGreaterThanOrEqual(0);
        expect(nozzle.xPosition).toBeLessThanOrEqual(1);
      });
    });
  });

  it('keeps brightness range ordered', () => {
    SHIP_EXHAUST_CONFIGS.forEach((config) => {
      config.nozzles.forEach((nozzle) => {
        expect(nozzle.brightnessMin).toBeLessThanOrEqual(nozzle.brightnessMax);
      });
    });
  });
});

describe('attachGameplayFlames', () => {
  it('does not add flames for an unknown ship id', () => {
    const group = createShipGroup(4, 2);
    attachGameplayFlames(group, 999);

    const flames = group.children.filter((child) => child.name === FLAME_NAME);
    expect(flames.length).toBe(0);
  });

  it('adds one flame for a single-nozzle ship', () => {
    const group = createShipGroup(4, 2);
    attachGameplayFlames(group, 1);

    const flames = group.children.filter((child) => child.name === FLAME_NAME);
    expect(flames.length).toBe(1);

    const flame = flames[0] as Mesh;
    const material = flame.material as MeshBasicMaterial;
    expect(material.color.getHex()).toBe(0xccff00);

    // Hull length = 4, width = 2, single nozzle at xPosition 0.501.
    const halfLength = 4 * 0.5;
    const flameLength = 4 * FLAME_LENGTH_RATIO;
    const baseOverlap = 4 * FLAME_BASE_OVERLAP_RATIO;
    expect(flame.position.x).toBeCloseTo(
      -halfLength + baseOverlap - flameLength * 0.5,
      4,
    );
    expect(flame.position.y).toBeCloseTo((-0.5 + 0.501) * 2, 4);
    expect(flame.position.z).toBeCloseTo(0, 4);
  });

  it('places multiple nozzles symmetrically for a multi-nozzle ship', () => {
    const group = createShipGroup(8, 4);
    attachGameplayFlames(group, 2);

    const flames = group.children.filter((child) => child.name === FLAME_NAME);
    expect(flames.length).toBe(2);

    const halfLength = 8 * 0.5;
    const flameLength = 8 * FLAME_LENGTH_RATIO;
    const baseOverlap = 8 * FLAME_BASE_OVERLAP_RATIO;
    const expectedX = -halfLength + baseOverlap - flameLength * 0.5;

    flames.forEach((flame) => {
      expect(flame.position.x).toBeCloseTo(expectedX, 4);
    });

    const left = flames.find((flame) => flame.position.y < 0) as Mesh;
    const right = flames.find((flame) => flame.position.y > 0) as Mesh;
    expect(left.position.y).toBeCloseTo((-0.5 + 0.402) * 4, 4);
    expect(right.position.y).toBeCloseTo((-0.5 + 0.598) * 4, 4);
  });

  it('sizes flame radius from hull width and flameWidthPercent', () => {
    const group = createShipGroup(8, 4);
    attachGameplayFlames(group, 2);

    const flame = group.children.find((child) => child.name === FLAME_NAME) as Mesh;
    const box = new Box3().setFromObject(flame);
    const size = new Vector3();
    box.getSize(size);

    // The cone is rotated so its circular base lies in the world YZ plane;
    // size.y therefore equals the base diameter.
    const expectedRadius = 0.13 * 4 * 0.5 * FLAME_WIDTH_MULTIPLIER;
    expect(size.y).toBeCloseTo(expectedRadius * 2, 4);
  });

  it('caps opacity at 0.95 when brightnessMax is 1.0', () => {
    const group = createShipGroup(4, 2);
    const originalRandom = Math.random;
    Math.random = () => 1.0;

    try {
      attachGameplayFlames(group, 9);
    } finally {
      Math.random = originalRandom;
    }

    const flame = group.children.find((child) => child.name === FLAME_NAME) as Mesh;
    const material = flame.material as MeshBasicMaterial;
    expect(material.opacity).toBe(0.95);
  });
});

describe('toggleFlames', () => {
  it('toggles visibility only on exhaust flame meshes', () => {
    const group = new Group();

    const flameA = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    flameA.name = FLAME_NAME;
    const flameB = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    flameB.name = FLAME_NAME;
    const hull = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    hull.name = 'hull';

    group.add(flameA, flameB, hull);

    toggleFlames(group, false);
    expect(flameA.visible).toBe(false);
    expect(flameB.visible).toBe(false);
    expect(hull.visible).toBe(true);

    toggleFlames(group, true);
    expect(flameA.visible).toBe(true);
    expect(flameB.visible).toBe(true);
    expect(hull.visible).toBe(true);
  });
});

describe('flame color overrides', () => {
  it('reads back a stored override', () => {
    setFlameColorOverride(2, 0, 0xff0000);
    expect(getFlameColorOverride(2, 0)).toBe(0xff0000);
  });

  it('returns null when no override exists', () => {
    expect(getFlameColorOverride(2, 0)).toBeNull();
  });

  it('clears overrides for a ship', () => {
    setFlameColorOverride(2, 0, 0xff0000);
    setFlameColorOverride(2, 1, 0x00ff00);
    clearFlameColorOverrides(2);
    expect(getFlameColorOverride(2, 0)).toBeNull();
    expect(getFlameColorOverride(2, 1)).toBeNull();
  });

  it('does not affect other ships when clearing one ship', () => {
    setFlameColorOverride(2, 0, 0xff0000);
    setFlameColorOverride(3, 0, 0x00ff00);
    clearFlameColorOverrides(2);
    expect(getFlameColorOverride(2, 0)).toBeNull();
    expect(getFlameColorOverride(3, 0)).toBe(0x00ff00);
  });

  it('applies override color to gameplay flames', () => {
    const group = createShipGroup(4, 2);
    setFlameColorOverride(1, 0, 0xff0000);
    attachGameplayFlames(group, 1);

    const flame = group.children.find((child) => child.name === FLAME_NAME) as Mesh;
    const material = flame.material as MeshBasicMaterial;
    expect(material.color.getHex()).toBe(0xff0000);
  });
});

describe('exhaust config overrides', () => {
  it('falls back to hard-coded config when no override exists', () => {
    const config = getEffectiveExhaustConfig(1);
    expect(config).toBeDefined();
    expect(config!.nozzles.length).toBe(1);
    expect(config!.nozzles[0].xPosition).toBeCloseTo(0.501, 3);
  });

  it('uses stored override config when present', () => {
    const customConfig = {
      nozzleCount: 2,
      nozzles: [
        {
          xPosition: 0.25,
          flameWidthPercent: 0.12,
          color: 0xff0000,
          brightnessMin: 0.75,
          brightnessMax: 1.0,
        },
        {
          xPosition: 0.75,
          flameWidthPercent: 0.12,
          color: 0x00ff00,
          brightnessMin: 0.75,
          brightnessMax: 1.0,
        },
      ],
    };
    setExhaustConfigOverride(1, customConfig);

    const effective = getEffectiveExhaustConfig(1);
    expect(effective).toBeDefined();
    expect(effective!.nozzles.length).toBe(2);
    expect(effective!.nozzles[0].xPosition).toBeCloseTo(0.25, 3);
    expect(effective!.nozzles[1].color).toBe(0x00ff00);
  });

  it('clears override and falls back to hard-coded config', () => {
    setExhaustConfigOverride(1, {
      nozzleCount: 1,
      nozzles: [
        {
          xPosition: 0.5,
          flameWidthPercent: 0.1,
          color: 0xffffff,
          brightnessMin: 0.75,
          brightnessMax: 1.0,
        },
      ],
    });
    clearExhaustConfigOverride(1);

    const config = getEffectiveExhaustConfig(1);
    expect(config).toBeDefined();
    expect(config!.nozzles[0].color).toBe(0xccff00);
  });

  it('applies stored custom nozzle count to gameplay flames', () => {
    setExhaustConfigOverride(1, {
      nozzleCount: 3,
      nozzles: [
        {
          xPosition: 0.2,
          flameWidthPercent: 0.08,
          color: 0xff0000,
          brightnessMin: 0.75,
          brightnessMax: 1.0,
        },
        {
          xPosition: 0.5,
          flameWidthPercent: 0.08,
          color: 0x00ff00,
          brightnessMin: 0.75,
          brightnessMax: 1.0,
        },
        {
          xPosition: 0.8,
          flameWidthPercent: 0.08,
          color: 0x0000ff,
          brightnessMin: 0.75,
          brightnessMax: 1.0,
        },
      ],
    });

    const group = createShipGroup(4, 2);
    attachGameplayFlames(group, 1);
    const flames = group.children.filter((child) => child.name === FLAME_NAME);
    expect(flames.length).toBe(3);
  });
});
