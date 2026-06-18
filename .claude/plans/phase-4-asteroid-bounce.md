# Plan — Asteroid Omni-Directional Spawns, Targeted Threat, and Asteroid-B-Asteroid Bounce

## Goal
Replace the predictable top-down asteroid rain with omni-directional spawns, inject a
player-seeking threat every 4th spawn ("Asteroid no 4"), and make asteroids bounce off
each other in a way that favors chaos over predictability.

## Rules
1. Every asteroid spawns from a random edge of the arena and drifts inward.
2. Every 4th spawn is a "targeted" asteroid (`isTargeted: true`) whose initial velocity
   points directly at the player's current position.
3. Targeted asteroids do **not** participate in asteroid-vs-asteroid collisions at all.
4. Non-targeted asteroids bounce off each other, including split children.
5. When two non-targeted asteroids of different sizes collide, the larger asteroid is
   treated as immovable: its velocity and position do not change; only the smaller one
   bounces away.
6. When two asteroids of the same size collide, they swap their normal velocity
   components (elastic equal-mass bounce).

## Approach

### 1. Update shared types (`src/types.ts`)
- Add `isTargeted: boolean` to `AsteroidState`.

### 2. Update asteroid factory (`src/asteroid.ts`)
- Extend `createAsteroidState(size, position, velocity, isTargeted = false)`.
- Keep `splitAsteroid` producing non-targeted children (children inherit momentum but are
  normal bouncing asteroids).
- Add a pure-ish helper `resolveAsteroidCollision(a, b)` that mutates the two states in
  place:
  - Skip if either is targeted.
  - Compute collision normal and overlap.
  - Separate positions: equal sizes → both move by overlap/2; different sizes → only the
    smaller moves by the full overlap.
  - Resolve velocities: equal sizes → swap normal components; different sizes → larger
    unchanged, smaller reflects relative to the larger's normal velocity.

### 3. Update arena controller (`src/movement/arena-controller.ts`)
- Rewrite `getSpawnPosition()` to pick one of the four arena edges and place the asteroid
  just outside the cull bounds.
- Rewrite `getSpawnVelocity()` to point roughly toward the arena center with a small
  random spread.
- Update the controller's My Rules comment to remove "top of arena" references.

### 4. Update game loop (`src/game.ts`)
- Add a spawn counter (`asteroidSpawnCount`).
- In `spawnRandomAsteroid()`:
  - Use the controller's edge spawn position.
  - For the 4th spawn, set `isTargeted = true` and compute velocity as the normalized
    direction from spawn to the ship, scaled by wave base speed (plus a small boost).
  - For other spawns, use `controller.getSpawnVelocity()` scaled by wave base speed.
- Add `handleAsteroidCollisions()` that runs after movement but before projectile/ship
  collisions. Use an O(n²) pair loop over `this.asteroids` and call the resolver for
  overlapping pairs.
- Ensure targeted asteroids are visually distinct (e.g., reddish tint or emissive color).

### 5. Update tests
- `tests/asteroid.test.ts`: update factory calls, add tests for `isTargeted`, and add
  `resolveAsteroidCollision` cases (same-size swap, big-vs-small immovable large,
  targeted ignored).
- `tests/movement.test.ts`: update arena spawn tests to assert edge placement and inward
  velocity instead of top-only downward velocity.

### 6. Verification
- `npm run typecheck`
- `npm test`
- `npm run build`
- Dev-server screenshot: confirm asteroids enter from all sides and a targeted asteroid
  is visually distinct.

## Risks
- O(n²) asteroid collision is fine while the asteroid count stays small; if waves spawn
  many asteroids later, this may need a spatial partition.
- Equal-mass separation moves both asteroids, which can occasionally push one into the
  ship unexpectedly; this is acceptable chaotic behavior.
