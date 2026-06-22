---
paths:
  - "src/ships/inspector.ts"
  - "src/exhaust-config.ts"
  - "src/exhaust-gameplay.ts"
  - "ships-inspector.html"
  - "vite.config.ts"
---

# Framework — GLB Inspector Hangar

Use this framework when a 3D model asset contains visible features that need matching particle/effect placement and the asset metadata does not expose those features.

## Decision trigger

If any of these are true, build a hangar instead of guessing offsets:

- The effect must sit on a GLB model but there are no named nodes for exhaust ports, lights, or hardpoints.
- Multiple ship/character variants have different feature counts, positions, or colors.
- Previous attempts using sprite pixels, concept art, or raw vertex clusters produced visibly misaligned results.
- Players need to customize effect placement/count/color at runtime.

## Action sequence

1. **Create a dedicated HTML entry point.**
   - Add an `.html` file at the repository root (e.g., `ships-inspector.html`).
   - Add it to `vite.config.ts` Rollup inputs so it is served and bundled.
2. **Reuse the production loader.**
   - Import `loadCatalogMesh` (or equivalent) and render with the same FOV/z-distance as gameplay.
3. **Display one model at a time.**
   - Provide keyboard navigation to cycle variants.
4. **Overlay diagnostics.**
   - Wireframe, bounding box, axes, and per-feature markers.
5. **Derive normalized coordinates from the centered bounding box.**
   - Record positions as ratios of hull width/length, not absolute world units.
6. **Match colors visually.**
   - Compare the rendered engine glow/painted feature to the effect color in the hangar.
7. **Support drag-to-place editing.**
   - Raycast against marker meshes.
   - On pointer down, build a `THREE.Plane` from the camera direction and the marker's world position.
   - Project each pointer move onto the plane, world-to-local the hit point, and map it back to `xPosition`/`yOffset` and `baseOffset`.
   - Pause auto-rotation during the drag and resume afterward if it was enabled.
8. **Support nozzle duplication and deletion.**
   - `F` duplicates the selected nozzle.
   - `D` removes it, keeping at least one nozzle.
9. **Persist edits to localStorage.**
   - Store a full `ShipExhaustConfig` per ship ID.
   - Make gameplay read effective config: override first, hard-coded fallback.
10. **Verify in the real game.**
    - Launch the main entry point, trigger the effect, and capture a screenshot.
11. **Lock the method in memory.**
    - Write a memory file for the project and update `MEMORY.md`.

## Anti-patterns

- Do not measure the bounding box after adding shield, magnet, or UI children to the model group.
- Do not use absolute pixel values from concept art or sprite sheets as the final offsets.
- Do not rebuild the drag plane once and reuse it across multiple frames while the ship rotates; recreate it on pointer down.

## Verification checklist

- [ ] Hangar page loads and renders each model.
- [ ] Bounding box helper aligns with the centered mesh.
- [ ] Dragging a marker updates `xPosition`, `yOffset`, and `baseOffset` in real time.
- [ ] `Insert` adds a nozzle and `Delete` removes one, with at least one remaining.
- [ ] Custom configs survive a page reload via `localStorage`.
- [ ] Gameplay screenshot shows effects at the same relative positions as the hangar.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] The hangar page is present in `dist/` after `npm run build` if it is player-facing.

## Links

- Detailed write-up: `Knowledge/Wiki/glb-inspector-hangar-method.md`
- Project memory: [[glb-inspector-hangar-method]]
