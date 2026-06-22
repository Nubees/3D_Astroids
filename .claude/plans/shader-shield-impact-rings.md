# Plan — Shader-Based Ship Shield with Impact Rings

## Goal
Replace the current simple transparent sphere + flat arc with a proper energy
shield shader: a faint light-blue bubble around the ship with a Fresnel rim glow,
a procedural hex-grid surface, and glowing impact ripples that expand from any
contact point (asteroids, and later lasers / rockets / enemy ships).

## Approach

### 1. New module: `src/shield-visuals.ts`
Create a self-contained shield visual system that owns its shader material,
impact ring buffer, and helpers.

- `ShieldMaterialUniforms` interface with:
  - `uTime` (float)
  - `uBaseColor` (vec3) — very light cyan
  - `uFresnelPower`, `uFresnelStrength`, `uOpacity` (floats)
  - `uHexScale`, `uHexStrength` (floats)
  - `uHitCount` (int)
  - `uHitPositions` (vec3[8])
  - `uHitTimes` (float[8])
  - `uRingSpeed`, `uRingWidth`, `uRingMaxRadius` (floats)

- `createShieldMesh(radius: number): Mesh`
  - Builds a `SphereGeometry` slightly larger than the ship collision radius.
  - Uses a custom `ShaderMaterial` with additive blending, transparent,
    `depthWrite: false`.
  - Vertex shader passes `vNormal`, `vViewDir`, `vWorldPos`, `vObjPos`.
  - Fragment shader:
    - Fresnel rim term for the bubble silhouette.
    - Light blue base tint modulated by a procedural hex grid.
    - Soft pulsing via `sin(uTime)` so the shield feels alive.
    - For each active impact, compute geodesic distance on the sphere from the
      hit point, add an expanding glowing ring where distance matches
      `elapsed * uRingSpeed`, faded by smoothstep falloff.
    - Additive composition of base + rim + impacts.

- `addShieldImpact(mesh: Mesh, worldPoint: Vector2): void`
  - Converts the 2D world impact point into the shield's local 3D space.
  - Writes position + current time into the next free slot in the uniform arrays.
  - Wraps around at `MAX_IMPACTS` so we never overflow.

- `updateShieldImpacts(mesh: Mesh, deltaTime: number): void`
  - Ages every impact by `deltaTime`.
  - Removes impacts whose age exceeds `uRingMaxRadius / uRingSpeed`.

- `setShieldEnergy(mesh: Mesh, energyPercent: number): void`
  - Adjusts `uOpacity` and `uFresnelStrength` so the shield fades when energy is
    low and disappears entirely below a small threshold.

### 2. `src/game.ts` integration
- Replace the local `createShieldMesh()` with an import from
  `src/shield-visuals.ts`.
- In `onShieldAbsorbedHit(asteroid)`:
  - Remove the old `RingGeometry` arc spawn.
  - Call `addShieldImpact(this.shieldMesh, asteroid.position)`.
  - Keep the HUD shake.
- In `update(deltaTime)`:
  - Call `updateShieldImpacts(this.shieldMesh, deltaTime)`.
- In `updateShieldMesh()`:
  - Call `setShieldEnergy(this.shieldMesh, shieldPercent(this.shield))`.
- In `respawnShip()`:
  - Clear all active shield impacts.
- In `stop()`:
  - Dispose the shield mesh geometry and shader material.

### 3. Cleanup of old arc system
- Remove `spawnShieldArc()` and `updateShieldArcs()` from `src/game.ts`.
- Remove the `ShieldArc` interface.
- Remove `activeShieldArcs` array.

### 4. Tests
- Add `tests/shield-visuals.test.ts`:
  - Verify `createShieldMesh` returns a mesh with a ShaderMaterial.
  - Verify `addShieldImpact` writes into uniforms.
  - Verify `updateShieldImpacts` ages out old impacts.
- Update `tests/shield.test.ts` comment block if it still mentions the old arc
  (it shouldn't need logic changes).

## Risks
- Writing GLSL inline in TypeScript can be error-prone; keep the shader in a
  template literal with clear sections and test via typecheck/build.
- Three.js `ShaderMaterial` uniforms must be updated every frame for time and
  impacts; forgetting `needsUpdate = false` is fine because we mutate values, but
  array uniforms require `value` reassignment after mutation.
- Impact ring geodesic math uses `acos(dot)`; clamp dot to avoid NaN.
- The ship mesh rotates; the shield sphere is a child so it inherits rotation,
  meaning local-space impact positions stay correct as the ship turns.

## Verification
1. `npm run typecheck` → no GLSL/template errors.
2. `npm test` → new shield-visuals tests pass.
3. `npm run build` → succeeds.
4. Dev-server screenshot shows a faint blue bubble; manual or scripted death can
   verify impact rings if needed (visual smoke test).

---

## Status: Completed (2026-06-22)

Closed by user sign-off. Verified against current source:

- `src/shield-visuals.ts` — self-contained module with `ShieldMaterialUniforms` (uTime, uBaseColor, Fresnel/hex uniforms, uHitPositions[8], uHitTimes[8], uRingSpeed/uRingWidth/uRingMaxRadius); `createShieldMesh(radius)` builds a `ShaderMaterial` with additive blending, depthWrite disabled, geodesic-distance impact rings, Fresnel rim, and procedural hex-grid tint; `addShieldImpact`, `updateShieldImpacts`, `setShieldEnergy` round out the API.
- `src/game.ts` — old `spawnShieldArc` / `updateShieldArcs` / `ShieldArc` / `activeShieldArcs` removed; shield mesh created via `createShieldVisualMesh`; `onShieldAbsorbedHit` calls `addShieldImpact(this.shieldMesh, contactPoint, this.ship.state.position)`; per-frame `updateShieldImpacts` and energy-driven `setShieldEnergy` keep the bubble alive; `respawnShip()` clears active impacts; `stop()` disposes geometry + shader material.
- `tests/shield-visuals.test.ts` — verifies `createShieldMesh` returns a `ShaderMaterial`, `addShieldImpact` writes into uniforms, and aged impacts are removed.
- Impact ring math uses `acos(clamp(dot, -1, 1))` to avoid NaN at antipodal points.

Verification: `npm run typecheck` ✅, `npm test` ✅, `npm run build` ✅.
