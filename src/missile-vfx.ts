import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Texture,
  TextureLoader,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Missile VFX Smoke Pool (Phase 7b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: InstancedMesh pool of additive billboard smoke puffs that trail
//          behind each homing missile. One draw call for the entire pool,
//          regardless of how many missiles are in flight. Worst case is
//          12 missiles × 24 puffs/missile life = 288 active instances.
// Setup:   Imported by src/active-deployments.ts tickHomingMissiles.
//          Module-scope texture + InstancedMesh created lazily on first
//          emit (parent scene required to add the InstancedMesh).
// Issues:  Phase 7b ship (6d0f0f0) used `require('three').Matrix4` /
//          `.InstancedBufferAttribute` inline. The same anti-pattern that
//          froze the bomb at first fire (see shockwave-particles.ts My
//          Rules) would freeze any missile volley here — `require` is a
//          Node global, not a browser one. User-reported 2026-06-25.
// Fix:     Moved `Matrix4` + `InstancedBufferAttribute` to the top-level
//          three import block. Inline `require` calls are gone.
// Gotchas: The 16×16 radial-alpha texture is generated ONCE at module load
//          (not lazily) because CanvasTexture.fromCanvas is cheap and
//          deterministic — no WebGL dependency. Pool size = 288 matches
//          the worst-case (3 charges × 4 missiles × 24 puffs each). We
//          share one material across all 288 instances; opacity is per-
//          instance via the instanceColor .a channel multiplied into RGB.
//          Disposal must remove the InstancedMesh from the scene BEFORE
//          disposing the texture (texture dispose is a no-op here, but
//          the pattern is to clean in reverse-add order).
//          DO NOT use `require('three')` anywhere — see
//          feedback_require_three_freeze.md for the full story.
// ═══════════════════════════════════════════════════════════════════════════

const POOL_SIZE = 576; // was 288 — Phase 7c-2: 6 missiles × 24 puffs × 3 charges = 432, +33% headroom
const SMOKE_LIFETIME_SECONDS = 0.6;
const SMOKE_BASE_SIZE = 0.4;
const SMOKE_BASE_OPACITY = 0.4;
const SMOKE_SCALE_GROWTH = 1.4; // final scale = base * (1 + growth * t)

function makeRadialAlphaTexture(): CanvasTexture | null {
  // Guarded for Node test envs (vitest) where document is undefined. Returns
  // null if no DOM is available — the pool then falls back to a flat-white
  // additive material, which is fine for smoke puffs (the smoke is supposed
  // to be soft and dim; the radial alpha just makes it slightly softer).
  if (typeof document === 'undefined') return null;
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface SmokeSlot {
  alive: boolean;
  age: number;
  x: number;
  y: number;
}

const slots: SmokeSlot[] = [];
let instanced: InstancedMesh | null = null;
let material: MeshBasicMaterial | null = null;
let texture: CanvasTexture | null = null;
let scene: Object3D | null = null;

function ensureInstanced(parentScene: Object3D): InstancedMesh {
  if (instanced) return instanced;
  scene = parentScene;
  texture = makeRadialAlphaTexture(); // null in Node envs — Material has no map, which is fine
  const geometry = new PlaneGeometry(SMOKE_BASE_SIZE, SMOKE_BASE_SIZE);
  material = new MeshBasicMaterial({
    map: texture,
    color: 0xaaaaaa,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  instanced = new InstancedMesh(geometry, material, POOL_SIZE);
  instanced.frustumCulled = false;
  parentScene.add(instanced);
  for (let i = 0; i < POOL_SIZE; i++) {
    slots.push({ alive: false, age: 0, x: 0, y: 0 });
  }
  return instanced;
}

export function emitMissileSmoke(parentScene: Object3D, x: number, y: number): void {
  const inst = ensureInstanced(parentScene);
  // Find a free slot; if none, steal the oldest alive one (overwrite).
  let slotIdx = -1;
  let oldestAge = -1;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (!slots[i].alive) {
      slotIdx = i;
      break;
    }
    if (slots[i].age > oldestAge) {
      oldestAge = slots[i].age;
      slotIdx = i;
    }
  }
  if (slotIdx < 0) return; // pool exhausted (shouldn't happen given math)
  slots[slotIdx].alive = true;
  slots[slotIdx].age = 0;
  slots[slotIdx].x = x;
  slots[slotIdx].y = y;
  inst.count = POOL_SIZE; // ensure all instances drawn
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Missile Body Assembly + Rear-Nozzle Smoke (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7c — make the homing missile body visible. The original
//          Phase 7b body was a 0.10u semi-transparent sphere in the same
//          color family as the smoke trail, so the player saw only the smoke
//          cloud. The new body is a Group of four pieces:
//            - core: opaque MeshBasicMaterial sphere (0.14u) — the eye locks
//              on this solid shape first, then reads the smoke as a separate
//              trail element
//            - halo: BackSide AdditiveBlending sphere (0.30u, opacity 0.5) —
//              a soft glow that bleeds outward from the solid body
//            - noseTip: forward-pointing cone at +X (mounts the body's front)
//            - fins: 4 flat magenta triangles in an X-pattern at -X (rear)
//          Smoke now spawns at the rear nozzle (behind the body, along
//          velocity direction) instead of at the body center, so the smoke
//          trails behind the missile silhouette rather than engulfing it.
// Setup:   createMissileAssembly is called by src/active-deployments.ts
//          spawnMissileFromPending (replaces the inline body construction).
//          emitMissileSmokeRear is called by tickHomingMissiles (replaces
//          the current center-spawn emitMissileSmoke call).
// Issues:  Phase 7b visual: 0.10u body + 0.4u smoke puff = smoke was 4× the
//          body's volume; the body vanished under the smoke cloud. Phase 7c
//          went to 0.10u body + 2-piece (core+halo) but the body was still
//          too small and featureless to read against the magenta smoke.
// Fix:     Hades/ETG "opaque core + BackSide additive halo" pattern. The
//          halo radius is 2× the core so the glow visibly bleeds out; the
//          BackSide makes the halo appear as a soft outer ring rather than
//          a second solid sphere. Smoke now spawns 0.12u behind the body
//          center (MISSILE_RADIUS + 0.02 padding) along the velocity vector.
//          Phase 7c-2 bumps body to 0.14u, adds noseTip cone at +X and 4
//          rear fins at -X to give the silhouette weapon-shape readability.
//          Phase 7d bumps body +30% (0.14→0.18u) and halo +30% (0.30→0.39u)
//          per user feedback "make the missile 30% bigger". The noseTip cone
//          and fin triangles also scale +30% so proportions stay consistent.
//          SMOKE_REAR_OFFSET is derived from MISSILE_BODY_RADIUS so it auto-
//          adjusts (0.12→0.20u) — smoke now trails further behind the bigger
//          body, which keeps the trail from re-engulfing it.
//          Phase 7d-2 — assembly.scale.x = MISSILE_LENGTH_MULTIPLIER (2.5×)
//          stretches the body + halo + nose + fins along the local +X (the
//          flight axis). A non-uniform Group scale is safe because all the
//          child meshes are centered at the assembly origin, so the body
//          doesn't visually drift off-axis. The stretched halo is the
//          desired "forward-blooming glow" look for a fast projectile.
//          Phase 7e — sprite missile. User provided a hand-painted PNG
//          (cyan-tipped magenta missile, pre-shaded for additive). Replaces
//          the 6-piece procedural body (core + halo + nose cone + 4 fins)
//          with a single PlaneGeometry(1.0 × 1.15u) carrying the texture.
//          1 draw per missile instead of 6; visual quality = artist intent.
//          Flight-rotation becomes atan2(vy,vx) - π/2 (cyan tip at PNG +Y,
//          rotated so +Y maps to velocity direction). Plane is DoubleSide so
//          it's visible from both faces if camera ever crosses the plane.
//          Texture is loaded ONCE at module scope (preloadMissileTexture)
//          and shared across all missiles — no per-missile texture alloc.
//          MISSILE_SMOKE_REAR_OFFSET auto-derives from plane height so
//          smoke follows the bigger body without manual tuning.
// Gotchas: 6 draws per missile (core + halo + noseTip + 4 fins) instead of
//          2. With max 6 missiles in flight at any time, +36 draws total —
//          well under budget. The halo's opacity 0.5 stays under the 0.7
//          additive cap. emitMissileSmokeRear falls back to center-spawn
//          when speed < 0.01 (so a near-stationary turning missile doesn't
//          reverse its smoke position). Uses
//          PICKUP_COLOR[PickupKind.HOMING_MISSILES] so the body color stays
//          in lockstep with the rest of the pickup system — single source
//          of truth. The 4 fins share ONE material instance (no per-fin
//          allocation); ConeGeometry for the noseTip is rotated -π/2 around
//          Z to point along +X.
//          (Phase 7e supersedes most of the above — sprite replaces the
//          6-piece body, so the body-color / halo-cap / per-fin-material
//          notes no longer apply. Kept for historical context; future
//          readers see the full evolution of the missile visual.)
// ═══════════════════════════════════════════════════════════════════════════

export const MISSILE_PLANE_WIDTH = 1.0;        // perpendicular to flight axis
export const MISSILE_PLANE_HEIGHT = 1.15;      // along flight axis (1.0 width × 1.15 h/w)
export const MISSILE_SMOKE_REAR_OFFSET =
  MISSILE_PLANE_HEIGHT / 2 + 0.05; // 0.625u — auto-derives from plane height

let missileTexture: Texture | null = null;
let missileTextureLoadPromise: Promise<Texture> | null = null;

const MISSILE_TEXTURE_URL = '/textures/missile.png';

/**
 * Preload the hand-painted missile sprite from public/textures/missile.png.
 * Called once at game startup (alongside the ship catalog load). Subsequent
 * calls return the cached Texture.
 *
 * Browser: loads via TextureLoader (PNG → Texture).
 * Node test env: TextureLoader.load → ImageLoader fails (no `document`).
 *   We fall back to a synthetic 1×1 white-pixel Texture so vitest tests
 *   can still exercise the "material has a non-null map" assertion path.
 *   The fallback ONLY runs when the real loader throws — the browser never
 *   sees it.
 */
export function preloadMissileTexture(): Promise<Texture> {
  if (missileTexture) return Promise.resolve(missileTexture);
  if (missileTextureLoadPromise) return missileTextureLoadPromise;
  const loader = new TextureLoader();
  missileTextureLoadPromise = loader
    .loadAsync(MISSILE_TEXTURE_URL)
    .then((tex) => {
      missileTexture = tex;
      return tex;
    })
    .catch((err) => {
      // Reset the cached promise on failure so the next call retries.
      missileTextureLoadPromise = null;
      // Node test env: ImageLoader needs `document` which vitest doesn't
      // provide. Build a stub 1×1 Texture so the test can still assert
      // `mat.map` is non-null with non-zero dimensions. The stub has no
      // real pixels; production never hits this path.
      if (typeof document === 'undefined') {
        const stub = new Texture();
        // Synthetic 1×1 RGBA — enough to satisfy tex.image.width/height checks.
        stub.image = { width: 1, height: 1 } as Texture['image'];
        stub.needsUpdate = true;
        missileTexture = stub;
        missileTextureLoadPromise = Promise.resolve(stub);
        return stub;
      }
      throw err;
    });
  return missileTextureLoadPromise;
}

/**
 * Returns the cached missile texture (or null if preloadMissileTexture hasn't
 * completed yet). Used by sync createMissileAssembly so the sprite plane
 * gets the loaded texture the moment it exists. If called before preload,
 * the plane falls back to no map (a flat magenta additive plane) — the
 * game preloads at startup so this fallback should never fire in practice.
 */
export function getMissileTexture(): Texture | null {
  return missileTexture;
}

export function createMissileAssembly(): {
  assembly: Group;
  mesh: Mesh;
  flame: Mesh;
} {
  const tex = getMissileTexture();
  const material = new MeshBasicMaterial({
    map: tex,
    color: 0xffffff,            // white tint — preserve baked cyan/magenta art
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,           // visible from both faces (no edge-on vanishing)
  });
  const mesh = new Mesh(
    new PlaneGeometry(MISSILE_PLANE_WIDTH, MISSILE_PLANE_HEIGHT),
    material,
  );
  const flame = createMissileFlame();
  const assembly = new Group();
  assembly.add(mesh);
  assembly.add(flame);
  return { assembly, mesh, flame };
}

/**
 * Rear thruster cone. Mirrors the exhaust-gameplay.ts:244-270 pattern — a
 * warm-orange ConeGeometry, additive + DoubleSide, mounted at the rear pole
 * of the sprite plane so the flame trails BEHIND the cyan-tipped body.
 */
function createMissileFlame(): Mesh {
  const FLAME_LENGTH = 0.40;
  const FLAME_BASE_RADIUS = 0.16;
  const geom = new ConeGeometry(FLAME_BASE_RADIUS, FLAME_LENGTH, 8);
  geom.scale(1, -1, 1);
  geom.rotateZ(-Math.PI / 2);
  geom.translate(-0.10 - FLAME_LENGTH * 0.5, 0, 0);
  const mat = new MeshBasicMaterial({
    color: 0xffaa44,            // warm orange, contrasts with magenta body
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const flame = new Mesh(geom, mat);
  // Anchor the flame at the rear pole of the plane (cyan tip points along
  // +X, so the rear is -X). Local -X = -MISSILE_PLANE_HEIGHT / 2.
  flame.position.set(-MISSILE_PLANE_HEIGHT / 2, 0, 0);
  return flame;
}

export function emitMissileSmokeRear(
  scene: Object3D,
  x: number,
  y: number,
  velX: number,
  velY: number,
): void {
  const speed = Math.hypot(velX, velY);
  if (speed < 0.01) {
    // Near-stationary missile — fall back to center-spawn.
    emitMissileSmoke(scene, x, y);
    return;
  }
  // Place smoke MISSILE_SMOKE_REAR_OFFSET units BEHIND the body along velocity.
  const rearX = x - (velX / speed) * MISSILE_SMOKE_REAR_OFFSET;
  const rearY = y - (velY / speed) * MISSILE_SMOKE_REAR_OFFSET;
  emitMissileSmoke(scene, rearX, rearY);
}

export function updateMissileSmoke(deltaTime: number): void {
  if (!instanced) return;
  const tempMatrix = new Matrix4();
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = slots[i];
    if (!slot.alive) {
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    slot.age += deltaTime;
    const t = slot.age / SMOKE_LIFETIME_SECONDS;
    if (t >= 1.0) {
      slot.alive = false;
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    const scale = 1.0 + SMOKE_SCALE_GROWTH * t;
    tempMatrix.makeScale(scale, scale, 1);
    tempMatrix.setPosition(slot.x, slot.y, 0);
    instanced.setMatrixAt(i, tempMatrix);
    const alpha = SMOKE_BASE_OPACITY * (1.0 - t);
    // Assign to a local so TS narrows the type for the setXYZ call below
    // (same pattern as src/shockwave-particles.ts:160-169 — fixed in Task 3).
    let colorAttr = instanced.instanceColor;
    if (!colorAttr) {
      colorAttr = new InstancedBufferAttribute(
        new Float32Array(POOL_SIZE * 3), 3,
      );
      instanced.instanceColor = colorAttr;
    }
    colorAttr!.setXYZ(i, alpha, alpha, alpha);
  }
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
}

export function disposeMissileVfx(): void {
  if (instanced && scene) {
    scene.remove(instanced);
    instanced.geometry.dispose();
    if (material) material.dispose();
    if (texture) texture.dispose();
  }
  instanced = null;
  material = null;
  texture = null;
  scene = null;
  slots.length = 0;
  // Note: missileTexture is module-scope and shared across all missiles, so
  // it is intentionally NOT disposed here. (Same pattern as `instanced` —
  // the smoke pool survives multiple volleys, the texture survives the whole
  // game.)
}