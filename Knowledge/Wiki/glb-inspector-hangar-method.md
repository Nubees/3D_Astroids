# GLB Inspector Hangar Method

A repeatable workflow for deriving effect anchor points, sizes, and colors from actual GLB model geometry instead of concept art, sprite sheets, or manual guesswork.

## When to use this

- The source asset is a 3D model (GLB/GLTF) whose visual features are not exposed as named bones, empty nodes, or metadata.
- You need to place particle/system effects (exhaust flames, engine glows, weapon ports, lights) so they sit exactly on the drawn model.
- Different variants of the model have different feature counts or colors, so hard-coded offsets break for some variants.
- Players (or designers) want to visually tune effect placement, count, and color inside the browser.

## Why it works

A GLB passes through a loading/normalization pipeline (centering, rotation, scaling) before it appears in the game. Any measurement taken outside that pipeline — PNG pixels, raw vertex clusters, or concept art — is in a different coordinate space. The hangar loads the model through the **same pipeline** the game uses, so `size.x` really is nose-to-tail and `size.y` really is left-to-right.

## Workflow

1. **Create a dedicated hangar page.**
   - Root-level `.html` file (e.g., `ships-inspector.html`).
   - Add it to `vite.config.ts` Rollup inputs so it is served in dev and bundled into `dist` for players.
2. **Load models exactly like the game.**
   - Use the production loader (`loadCatalogMesh`) with the same centering, rotation, and scaling the game uses.
3. **Match the in-game camera.**
   - Same FOV, same z-distance, same background color.
4. **Overlay diagnostics.**
   - Wireframe toggle.
   - Bounding box + axes helpers.
   - Small nozzle markers at candidate exhaust positions.
5. **Derive normalized positions.**
   - For a port at world Y `yPort` on a hull whose centered bounding box spans `[-width/2, +width/2]`,
     `xPosition = (yPort / width) + 0.5`.
6. **Sample colors from the render.**
   - Pick the brightest pixel of the engine glow and convert to hex.
7. **Tune with percentage controls.**
   - Y nudge: ±2% hull width.
   - Flame length: ±10% hull length.
   - Flame radius: ±5% of base radius.
   - Base offset: ±2% hull length.
8. **Drag-to-place nozzle markers (player-facing).**
   - Let the player click and drag the red marker dots to set the exact exhaust start point.
   - Project mouse rays onto a camera-facing plane through the marker, then convert the world point back into the rotating ship's local space each frame.
   - Pause auto-rotation during the drag so the drag plane stays stable.
9. **Duplicate / delete nozzles with hotkeys.**
   - `F` duplicates the selected nozzle.
   - `D` removes the selected nozzle, keeping at least one.
10. **Reset tuning with a dedicated key.**
    - `T` resets the current ship's tuning values without changing nozzle count.
11. **Persist edits to localStorage.**
    - Store the full `ShipExhaustConfig` per ship ID.
    - Gameplay reads the effective config (override first, hard-coded fallback).
12. **Verify in the real game.**
    - Launch the main entry point, thrust, and capture a screenshot. Compare flame placement and color to the hangar preview.

## Known pitfalls

- **Bounding-box pollution.** If the ship group already contains a shield sphere or magnet ring when you measure, the box will be far larger than the hull and flames will land in empty space. Measure the hull-only group first, then attach effects, then attach UI children.
- **Lighting differences.** The hangar may use brighter rim/fill lights than the game. This changes how colors read, so final verification must happen in gameplay.
- **Silent missing config.** A ship without an exhaust config currently gets no flames and no warning. Add a `console.warn` and a catalog-coverage unit test.
- **Drag plane drift on a rotating model.** Always build the drag plane from the camera direction and the marker's current world position on pointer down, and recompute the world-to-local conversion every pointer move.

## Example: exhaust flame placement

```ts
const box = new Box3().setFromObject(shipModelOnly);
const size = new Vector3();
box.getSize(size);
const rearX = -size.x * 0.5;
const flameLength = size.x * 0.25;
// base of the cone sits at rearX; mesh center is offset back by half length
mesh.position.set(rearX - flameLength * 0.5, yAnchor, 0);
```

See `src/ships/inspector.ts` for the full implementation and `src/exhaust-config.ts` for the resulting data format.
