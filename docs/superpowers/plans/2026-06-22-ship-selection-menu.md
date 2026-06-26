# Plan — Ship Selection Menu

## Goal
Import all 12 ships from the user's collection, apply the same visual normalization used for Ship1 (GLB loader, centering, Z-rotation, scale, bright unlit material), assign thematic names, and present a polished ship-selection menu before the game starts.

## Ship Catalog

| No | File | Name |
|----|------|------|
| 1 | `Ship1.glb` | ShadowWing |
| 2 | `Ship2.glb` | Ironclaw |
| 3 | `Ship3.glb` | Voidstriker |
| 4 | `Ship4.glb` | Starneedle |
| 5 | `Ship5.glb` | Cometbreaker |
| 6 | `Ship6.glb` | Dustdevil |
| 7 | `Ship7.glb` | Shardwing |
| 8 | `Ship8.glb` | Thunderbolt |
| 9 | `Ship9.glb` | Blackbolt |
| 10 | `Ship10.glb` | Sunrazor |
| 11 | `Ship11.glb` | Frostfang |
| 12 | `Ship12.glb` | Emberlance |

Stats (shield, fire, speed) are **out of scope** for this task; a placeholder field will be added so they can be wired later without refactoring.

## Architecture

### 1. Asset pipeline
- Copy all 12 `.glb` files from `C:\Users\User101\Downloads\3d Astroids\Ships\SHIPS\` into `public/models/ships/`.
- Update `vite.config.ts` `assetsInclude` already covers `**/*.glb`.

### 2. Ship catalog module (`src/ships/catalog.ts`)
- Define `ShipCatalogEntry` interface: `id`, `name`, `modelPath`, `description`.
- Export `SHIP_CATALOG: ShipCatalogEntry[]` with the 12 ships above.
- Export `loadCatalogMesh(entry): Promise<Group>` that applies the same normalization as the current Ship1 loader:
  - Reset transform.
  - Compute bounding box.
  - Rotate -90° around Z (nose to +X).
  - Center to origin.
  - Scale to `SHIP_RADIUS * 5.2`.
  - Replace `MeshStandardMaterial` with `MeshBasicMaterial`, tint color × 1.1.

### 3. Refactor existing ship loader
- Move normalization helper into `src/ships/catalog.ts`.
- Keep `src/ship.ts` focused on runtime `Ship` state and the placeholder `createShipMesh()` fallback.
- Update `Game.create()` to accept an already-loaded ship `Group` instead of calling `loadShipMesh()` internally.

### 4. Ship selection screen (`src/ship-select.ts`)
- Class `ShipSelectScreen` that owns:
  - A hidden Three.js preview scene with a camera, lights, and a rotating pedestal group.
  - A full-screen HTML/CSS overlay for the menu.
- Behavior:
  - On construction, load all 12 GLBs concurrently and show a loading spinner.
  - Once loaded, render a responsive grid of ship cards at the bottom.
  - Highlight the focused/selected card.
  - Display the selected ship name and a short description.
  - Render a live, slow-rotating preview of the selected ship in the center.
  - Click or Enter on a card selects that ship and starts the game.
  - Keyboard: arrow keys move focus; Enter confirms; Escape cancels (no-op for now).
  - Mouse: hover focuses, click confirms.

### 5. Game integration
- `main.ts` becomes:
  ```ts
  const screen = new ShipSelectScreen();
  const shipMesh = await screen.waitForSelection();
  const game = await Game.create(canvas, shipMesh);
  game.start();
  ```
- `Game.create(canvas, shipMesh)` uses the provided mesh.

### 6. Styling
- Custom sci-fi CSS in `src/ship-select.css` (loaded via import in `ship-select.ts`).
- Cut-corner card panels, cyan glow on focus/selection, dark translucent background, mono font.
- Overlay uses `pointer-events: none` with interactive elements set to `pointer-events: auto`.

## Verification Plan

1. **Copy assets** → verify all 12 files exist in `public/models/ships/`.
2. **Type check** → `npm run typecheck` passes.
3. **Unit tests** → `npm test` passes; update any tests that instantiate `Game` or `createShipMesh`.
4. **Build** → `npm run build` passes; verify GLBs are copied to `dist/models/ships/`.
5. **Browser** → screenshot of menu with all 12 cards visible; screenshot of selected ship preview; screenshot of gameplay with chosen ship.

## Risks & Decisions

- **Loading time:** 12 GLBs ≈ 7–9 MB total. Loading spinner mitigates this. Could lazy-load preview on selection, but concurrent load is simpler.
- **Preview performance:** Only one rotating preview is rendered; the rest are static DOM cards. Keeps FPS high.
- **Naming:** User assigned Ship1 = ShadowWing; remaining names are original sci-fi flavored.
- **Scope control:** Stats/custom abilities are explicitly deferred to the next task.

## Files to modify/create

- Create: `src/ships/catalog.ts`
- Create: `src/ship-select.ts`
- Create: `src/ship-select.css`
- Modify: `src/ship.ts`
- Modify: `src/game.ts`
- Modify: `src/main.ts`
- Copy: `public/models/ships/Ship{1..12}.glb`

## No side changes
This work touches only ship loading, the menu, and the game bootstrap. It does not change movement, shield logic, asteroid behavior, scoring, or wave pacing.
