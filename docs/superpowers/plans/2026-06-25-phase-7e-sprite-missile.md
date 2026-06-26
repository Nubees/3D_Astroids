# Phase 7e — Sprite Missile Swap

## Context

The current homing missile (Phase 7c-2 + 7d + 7d-2 + 7d-3) is a 6-piece procedural
Group: opaque core sphere + additive halo sphere + cone nose + 4 triangle fins,
all stretched 2.5× along the flight axis via `assembly.scale.x = 2.5`. The user
has provided a hand-painted sprite (`C:\Users\User101\Downloads\3d Astroids\Missile\Missile.png`)
that is pre-shaded for additive blending (bright cyan tip fading into magenta
body) and wants it swapped in as the body.

**Why this is its own phase, not part of 7d-3:** the user said "missile is
looking better :)" before reporting the targeting/impact bugs. The sprite swap
is a visual direction change, not a bug fix — a follow-on commit on the same
branch so the user can compare "procedural stretched" vs "art sprite" back
to back.

**Decisions locked in (from user Q&A):**

1. **Rotated plane, not billboard sprite** — keep the per-frame `atan2(vy, vx)`
   rotation so the tapered trail visually points backward as the missile flies.
   A `THREE.Sprite` would always face the camera and lose that direction cue.
2. **White tint, no color override** — preserve the baked cyan/magenta art.
   Tinting with `PICKUP_COLOR[PickupKind.HOMING_MISSILES]` muddies the cyan
   tip; the sprite is its own source of truth.
3. **Bundle at `public/textures/missile.png`** — mirrors the existing GLB
   pattern (`/models/ships/Ship1.glb`), works in dev + prod without `?url`
   imports, picked over `src/assets/` because `publicDir: 'public'` is the
   established pattern.

## Files to modify

- `public/textures/missile.png` — NEW (copy of source sprite)
- `src/missile-vfx.ts` — replace `createMissileAssembly()` body; delete the
  nose-tip, fins, and stretched-sphere code; load texture once via
  `TextureLoader` (module-scope cached); preserve the rear-smoke hook
  (`emitMissileSmokeRear`)
- `src/active-deployments.ts` — `HomingMissileState` loses `noseTip` + `fins`
  fields; `spawnMissileFromPending` no longer assigns them; `disposeMissileState`
  disposes only the new single `mesh` (sprite plane) + `flame` (thruster)
- `tests/missile-body.test.ts` — rewrite the 6 existing tests for the new
  shape: 1 child mesh (sprite plane), confirm transparent + additive + has
  the loaded texture, confirm scale matches sprite aspect, confirm the old
  nose-tip + fins assertions are gone
- `tests/missile-targeting.test.ts` — fixture: drop `noseTip: null` and `fins: []`
  from `makeMissile()` (now TypeScript errors would force the change)

## Design

### Asset placement

```
public/textures/missile.png      # 142×155 (h: w = 1.09), baked additive palette
```

`TextureLoader` is browser-only — vitest runs in Node, so the texture must
be lazy-loaded on first `createMissileAssembly()` call from the scene
context. Use the same guard pattern as `ensureInstanced()` in missile-vfx.ts:
```ts
let missileTexture: CanvasTexture | Texture | null = null;
async function ensureMissileTexture(): Promise<Texture> {
  if (missileTexture) return missileTexture;
  const loader = new TextureLoader();
  missileTexture = await loader.loadAsync('/textures/missile.png');
  return missileTexture;
}
```

**New question for the plan: should `createMissileAssembly` become async?**
Three options:

(a) `async createMissileAssembly(): Promise<{...}>` — caller awaits in
    `spawnMissileFromPending`. Adds `await` to a hot spawn path. Vitest
    fixtures need to handle the promise.
(b) Sync create + lazy texture assign — assembly is created with a
    placeholder material; a per-missile `textureReady` callback attaches
    the texture when it loads. Race-condition-prone.
(c) **Preload texture once at game start**, hold a Promise, `await` it on
    first missile fire. Cold path on startup, hot path stays sync. **(PICK)**

Recommendation: **(c)**. Game already has an async startup phase (catalog
load in `ship-select.ts:118`). Add `await preloadMissileTexture()` to the
same startup await chain. First missile fire is sync. Tests can
`await preloadMissileTexture()` in `beforeAll` and stay sync after.

### Sprite plane geometry

The sprite is 142×155 px (h×w in the source). Aspect ratio h/w = 1.09. The
flight axis in the source image: the wide end (155px) is the BODY/BOTTOM,
the tapered end (cyan tip) is the TRAILING edge of the body — wait, need to
verify. Look at the source image: cyan tip is at the TOP of the PNG, magenta
body fills the bottom 70%, the trail tapers upward to the cyan point.

In the existing procedural missile, `noseTip` was at +X (forward) and
`fins` were at -X (rear). For the sprite to feel like "missile flying
forward", the cyan tip (forward/leading edge) should be at +X.

But in the source PNG the cyan tip is at the TOP, not the right edge.
**Two options:**
- **(A)** Rotate the sprite plane so the cyan tip points +X: bake
  `plane.rotation.z = -Math.PI / 2` into the mesh. Pros: cyan tip leads,
  trail tapers backward — reads as a missile. Cons: requires per-missile
  rotation in addition to the existing `atan2(vy,vx)` flight-direction
  rotation.
- **(B)** Keep cyan tip at +Y of the plane, then the flight-direction
  rotation (`atan2(vy,vx)`) is replaced with `atan2(vy,vx) + π/2` to align
  cyan-tip with velocity. Pros: no extra plane rotation. Cons: same
  math but offset by π/2; tests have to know about it.

**Going with (B):** simpler. The flight-direction rotation formula changes
from `missile.mesh.rotation.z = atan2(vy, vx)` (current) to
`missile.mesh.rotation.z = Math.atan2(velocityY, velocityX) + Math.PI / 2`.

The PNG's "up = forward" convention means cyan tip = leading edge.

### Geometry size

User wants "more or less the size of our current missile."

Current procedural visual size:
- Body radius 0.18u (sphere), halo radius 0.39u → effective visible diameter
  ~0.78u when accounting for the halo glow.
- Stretched 2.5× along flight axis → flight-axis length ~0.9u (2 × 0.18 × 2.5).

Target for the sprite: same on-screen footprint.
- Plane width (perpendicular to flight) = 0.78u (= halo diameter)
- Plane height (along flight) = 0.9u
- Geometry: `PlaneGeometry(0.78, 0.9)`. Aspect ratio 0.9/0.78 = 1.15,
  close enough to the PNG's 1.09 to avoid squishing.

### Material

```ts
new MeshBasicMaterial({
  map: missileTexture,
  color: 0xffffff,            // white tint — leave baked colors alone
  transparent: true,
  blending: AdditiveBlending,
  depthWrite: false,
  side: DoubleSide,           // visible from both sides (avoids "invisible" bug if camera crosses the plane)
});
```

**Why `DoubleSide`:** `PlaneGeometry` only renders the front face. If the
missile ever flies in a way that puts its plane edge-on to the camera, the
back face disappears — visual pop. `DoubleSide` costs nothing for a small
sprite and prevents the issue.

### Mesh structure

```ts
export interface MissileAssembly {
  assembly: Group;  // wrapper so game.ts code that does missile.assembly.x stays unchanged
  mesh: Mesh;       // the single plane mesh (was: assembly of 6 meshes)
  flame: Mesh;      // existing thruster cone — UNCHANGED
}

export function createMissileAssembly(): MissileAssembly {
  const mesh = new Mesh(new PlaneGeometry(0.78, 0.9), /* material above */);
  const flame = createMissileFlame();  // unchanged from current code
  const assembly = new Group();
  assembly.add(mesh);
  assembly.add(flame);
  return { assembly, mesh, flame };
}
```

**Why keep `assembly` as a wrapper:** `game.ts` (and `active-deployments.ts`)
references `missile.assembly.position.set(x, y, 0)` and
`missile.assembly.rotation.z = ...`. Keeping the Group wrapper means no
upstream call sites need to change.

**Removal of stretched scale:** `assembly.scale.set(2.5, 1, 1)` is GONE. The
sprite is already at the right aspect ratio; stretching would distort the
art. The plane geometry size IS the new "stretched length."

### State field removal

```ts
// REMOVE from HomingMissileState:
noseTip: Mesh | null;
fins: Mesh[];

// KEEP (now holds the sprite plane, not a sphere):
mesh: Mesh;
```

### Disposal update

`disposeMissileState(missile, scene)` currently does:
```ts
missile.mesh.geometry.dispose();
(missile.mesh.material as MeshBasicMaterial).dispose();
missile.halo.geometry.dispose();             // DELETE (halo gone)
(missile.halo.material as MeshBasicMaterial).dispose();  // DELETE
missile.noseTip.geometry.dispose();          // DELETE
(mile.noseTip.material as MeshBasicMaterial).dispose(); // DELETE
for (const fin of missile.fins) {            // DELETE
  fin.geometry.dispose();
  (fin.material as MeshBasicMaterial).dispose();
}
missile.flame.geometry.dispose();
(missile.flame.material as MeshBasicMaterial).dispose();
```

New version (applies to BOTH expiry + impact paths via the existing helper):
```ts
missile.mesh.geometry.dispose();
(missile.mesh.material as MeshBasicMaterial).dispose();
missile.flame.geometry.dispose();
(missile.flame.material as MeshBasicMaterial).dispose();
```

**Texture is NOT disposed** — it's a module-scope singleton, lives for the
whole game. (Same pattern as `missile-vfx.ts`'s `instanced` smoke pool.)

### Rotation line in tickHomingMissiles

Current (`active-deployments.ts` in tickHomingMissiles):
```ts
missile.assembly.rotation.z = Math.atan2(missile.velocity.y, missile.velocity.x);
```

New (cyan tip leads, so add π/2):
```ts
missile.assembly.rotation.z = Math.atan2(missile.velocity.y, missile.velocity.x) + Math.PI / 2;
```

The math is the same: `atan2` gives velocity-direction angle; π/2 aligns
PNG-up = forward.

## Tests

### tests/missile-body.test.ts (REWRITTEN)

Drop the 6 old tests. Replace with 4:

```ts
describe('createMissileAssembly — Phase 7e sprite missile', () => {
  it('returns a Group containing exactly 1 sprite mesh + 1 flame mesh', () => {
    const { assembly } = createMissileAssembly();
    expect(assembly).toBeInstanceOf(Group);
    expect(assembly.children.length).toBe(2);
  });

  it('sprite mesh is a PlaneGeometry of size 0.78×0.9, additive, transparent, double-sided', () => {
    const { mesh } = createMissileAssembly();
    const geom = mesh.geometry as PlaneGeometry;
    expect(geom.parameters.width).toBeCloseTo(0.78, 5);
    expect(geom.parameters.height).toBeCloseTo(0.9, 5);
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
    expect(mat.side).toBe(DoubleSide);
  });

  it('sprite material has the missile texture loaded as its map', () => {
    const { mesh } = createMissileAssembly();
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.map).not.toBeNull();
    // We can't assert image content in vitest (no DOM), but we can assert
    // a Texture instance with non-zero dimensions was assigned.
    const tex = mat.map as Texture;
    expect(tex.image.width).toBeGreaterThan(0);
    expect(tex.image.height).toBeGreaterThan(0);
  });

  it('white tint: material color is 0xffffff (no magenta override)', () => {
    const { mesh } = createMissileAssembly();
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0xffffff);
  });
});
```

**Texture loading in tests:** the `beforeAll` block calls
`await preloadMissileTexture()`. If the texture fails to load (e.g.,
running outside the browser), the tests should fail with a clear error
rather than silently passing. Use a `try`/`expect.fail` guard.

```ts
beforeAll(async () => {
  try {
    await preloadMissileTexture();
  } catch (e) {
    expect.fail(`Failed to preload missile texture: ${e}`);
  }
});
```

### tests/missile-targeting.test.ts (MINOR FIX)

The `makeMissile()` helper currently has:
```ts
noseTip: null as unknown as HomingMissileState['noseTip'],
fins: [],
```

These lines need to be DELETED (they no longer exist on the type). Tests
otherwise stay identical.

## Verification

```
Plan:
1. Copy missile.png → public/textures/missile.png → verify: file exists, vite dev server serves it at /textures/missile.png
2. Add preloadMissileTexture + createMissileAssembly to src/missile-vfx.ts → verify: 4 new missile-body tests pass
3. Update HomingMissileState + spawnMissileFromPending + disposeMissileState in src/active-deployments.ts → verify: 4 missile-targeting stickiness tests pass
4. Update tickHomingMissiles flight-direction rotation (+π/2) → verify: visual screenshot shows cyan tip leading, magenta trail behind
5. Run full quality gate (typecheck + vitest + build)
6. Atomic commit on phase-2-movement
```

## Anti-patterns avoided

- **No halo-leak repeat** — disposal helper called from BOTH expiry + impact
  paths, texture kept module-scope so we don't dispose a shared resource
- **No new `require('three')` inline** — `TextureLoader` + `MeshBasicMaterial`
  + `PlaneGeometry` + `AdditiveBlending` + `DoubleSide` all top-level imports
- **No per-frame texture alloc** — single module-scope `Texture` shared by all
  missiles
- **No plane-edge vanishing** — `DoubleSide` so the sprite is visible from
  both faces
- **No asset-double-bake** — sprite is a hand-painted PNG, not regenerated
  from code
- **No tests in vitest that need DOM** — texture load is async, awaited in
  `beforeAll`, with clear failure on load error

## Commit message

`feat(missiles): Phase 7e — swap procedural body for hand-painted sprite`

## Self-Review

- **Spec coverage:** All 3 user decisions (rotated plane + white tint +
  bundled at public/textures) → material + geometry + texture loader
  placement. ✓
- **Type consistency:** `HomingMissileState` removes `noseTip` + `fins`,
  keeps `mesh` + `flame` + `assembly`. `MissileAssembly` return type drops
  `core` + `halo` + `noseTip` + `fins`, adds single `mesh`. Test fixtures
  match. ✓
- **Rotation math:** cyan tip at +Y of source PNG, plane is atan2(vy,vx)+π/2
  to align. Verified mentally: velocity (1,0) → atan2(0,1) = 0 → +π/2 = π/2
  → plane rotated 90° clockwise → PNG up (cyan tip) now points +X. ✓
- **No new dependencies** — `THREE.TextureLoader` ships with three. ✓
- **No chargeCap / damage / radius changes** — pure visual swap, gameplay
  unchanged. ✓
- **Phase 7d-3 fixes preserved** — sticky target + 0.95u impact radius
  untouched. ✓
