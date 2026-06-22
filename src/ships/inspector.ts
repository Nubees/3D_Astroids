import {
  AdditiveBlending,
  AmbientLight,
  AxesHelper,
  Box3,
  Box3Helper,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { SHIP_CATALOG, ShipCatalogEntry, loadCatalogMesh } from './catalog';
import { SHIP_EXHAUST_CONFIGS, EXHAUST_FLAME_NAME, ExhaustNozzle, ShipExhaustConfig } from '../exhaust-config';
import {
  getFlameColorOverride,
  setFlameColorOverride,
  clearFlameColorOverrides,
  setExhaustConfigOverride,
  clearExhaustConfigOverride,
} from '../exhaust-gameplay';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Hangar Inspector
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Player-facing Ship Hangar page that loads the production GLB ship
//          models and lets the player visually tune exhaust flame position,
//          size, color, and even nozzle count. Custom layouts are persisted to
//          localStorage and picked up by the real game in src/exhaust-gameplay.ts.
// Setup: Reachable from the Ship Selector via a top-left icon, and bundled as
//        a second Vite entry point so it works in production builds. Loads all
//        ships through loadCatalogMesh() so transforms exactly match the real
//        game.
// Issues: Previous flame placement used sprite PNG proxies and raw vertex
//         clusters without visual confirmation, causing misaligned/oversized
//         flames in gameplay.
// Fix: Render each ship with the same camera/lighting as gameplay, overlay
//      wireframe/bbox/axes/nozzle markers, and provide live percentage-based
//      keyboard tuning, a clickable color palette, and drag-to-place nozzle
//      markers with add/duplicate/delete hotkeys.
// Gotchas: Vite only bundles index.html by default; vite.config.ts now includes
//          ships-inspector.html as a Rollup input. The camera is kept at z=20
//          with 60° FOV to match gameplay perspective. UI pointer-events are
//          disabled on the overlay layer, so every interactive panel must
//          re-enable them. Auto-rotation pauses while a nozzle marker is being
//          dragged so the drag plane stays stable relative to the cursor.
// ═══════════════════════════════════════════════════════════════════════════

interface NozzleTuning {
  yOffset: number; // absolute Three.js Y offset from config xPosition
  radiusScale: number; // multiplier on config flameWidthPercent radius
  length: number; // absolute flame length in Three.js units
  baseOffset: number; // absolute X offset from hull rear edge (negative = behind)
}

interface ShipTuning {
  nozzles: NozzleTuning[];
}

const CAMERA_Z = 20;
const CAMERA_FOV = 60;
const ROTATION_SPEED = 0.4;
const DEFAULT_FLAME_LENGTH_RATIO = 0.35; // starting flame length as % of hull length
const DEFAULT_FLAME_BASE_OVERLAP_RATIO = 0.04; // base sits inside hull by this %
const DEFAULT_FLAME_WIDTH_MULTIPLIER = 1.20; // global radius multiplier

const tuningByShip: Map<number, ShipTuning> = new Map();
const customConfigsByShip: Map<number, ShipExhaustConfig> = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Mutable Per-Ship Config in the Hangar
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Let the Ship Hangar edit nozzle count, positions, widths, and colors
//          without mutating the hard-coded SHIP_EXHAUST_CONFIGS source. Edits
//          are mirrored to localStorage so gameplay uses them.
// Setup: customConfigsByShip is seeded with deep copies from
//        SHIP_EXHAUST_CONFIGS the first time a ship is displayed. Helper
//        functions add, duplicate, and delete nozzles while keeping tuning and
//        color overrides in sync.
// Issues: The previous hangar read the immutable source config directly, so
//         adding or removing nozzles was impossible.
// Fix: Added getOrCreateCustomConfig(), saveCustomConfig(), and nozzle mutation
//      helpers. The config's nozzleCount is always kept equal to nozzles.length.
// Gotchas: Mutating a nozzle object mutates the custom config's array element,
//          so callers must save the config after structural changes.
// ═══════════════════════════════════════════════════════════════════════════

function deepCopyNozzle(nozzle: ExhaustNozzle): ExhaustNozzle {
  return { ...nozzle };
}

function getOrCreateCustomConfig(shipId: number): ShipExhaustConfig | undefined {
  if (customConfigsByShip.has(shipId)) {
    return customConfigsByShip.get(shipId);
  }
  const source = SHIP_EXHAUST_CONFIGS.get(shipId);
  if (!source) return undefined;
  const copy: ShipExhaustConfig = {
    nozzleCount: source.nozzleCount,
    nozzles: source.nozzles.map(deepCopyNozzle),
  };
  customConfigsByShip.set(shipId, copy);
  return copy;
}

function saveCustomConfig(shipId: number): void {
  const config = customConfigsByShip.get(shipId);
  if (!config) return;
  config.nozzleCount = config.nozzles.length;
  setExhaustConfigOverride(shipId, config);
}

function ensureTuningForConfig(shipId: number, size: Vector3): void {
  const config = getOrCreateCustomConfig(shipId);
  if (!config) return;

  let tuning = tuningByShip.get(shipId);
  if (!tuning) {
    tuning = { nozzles: [] };
    tuningByShip.set(shipId, tuning);
  }

  // Trim or expand the tuning array to match the nozzle count.
  while (tuning.nozzles.length > config.nozzles.length) {
    tuning.nozzles.pop();
  }
  while (tuning.nozzles.length < config.nozzles.length) {
    tuning.nozzles.push({
      yOffset: 0,
      radiusScale: DEFAULT_FLAME_WIDTH_MULTIPLIER,
      length: size.x * DEFAULT_FLAME_LENGTH_RATIO,
      baseOffset: size.x * DEFAULT_FLAME_BASE_OVERLAP_RATIO,
    });
  }
}

function addNozzle(shipId: number, size: Vector3): void {
  const config = getOrCreateCustomConfig(shipId);
  if (!config) return;

  const sourceColor = config.nozzles[selectedNozzle]?.color ?? FLAME_COLOR_OPTIONS[0].hex;
  const newNozzle: ExhaustNozzle = {
    xPosition: 0.5,
    flameWidthPercent: 0.1,
    color: sourceColor,
    brightnessMin: 0.75,
    brightnessMax: 1.0,
  };
  config.nozzles.push(newNozzle);
  config.nozzleCount = config.nozzles.length;

  ensureTuningForConfig(shipId, size);
  selectedNozzle = config.nozzles.length - 1;
  saveCustomConfig(shipId);
}

function duplicateNozzle(shipId: number, size: Vector3): void {
  const config = getOrCreateCustomConfig(shipId);
  if (!config) return;

  const source = config.nozzles[selectedNozzle];
  if (!source) return;

  const copy = deepCopyNozzle(source);
  copy.xPosition = Math.min(1, copy.xPosition + 0.05);
  config.nozzles.splice(selectedNozzle + 1, 0, copy);
  config.nozzleCount = config.nozzles.length;

  ensureTuningForConfig(shipId, size);
  selectedNozzle += 1;
  saveCustomConfig(shipId);
}

function deleteNozzle(shipId: number, size: Vector3): void {
  const config = getOrCreateCustomConfig(shipId);
  if (!config) return;
  if (config.nozzles.length <= 1) return; // Keep at least one nozzle.

  config.nozzles.splice(selectedNozzle, 1);
  config.nozzleCount = config.nozzles.length;

  ensureTuningForConfig(shipId, size);
  selectedNozzle = Math.min(selectedNozzle, config.nozzles.length - 1);
  saveCustomConfig(shipId);
  clearFlameColorOverrides(shipId); // Color indices shift; safest to reset colors.
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Flame Color Palette
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Define the fixed set of flame colors players can pick from in the
//          Ship Hangar. Each entry stores both the Three.js hex color and a
//          CSS string for the swatch button background.
// Setup: Hard-coded palette requested by the player (Red, Yellow, Green, Blue,
//        Purple, White, Orange). Swatches are rendered from this list.
// Issues: None.
// Fix: Added a typed palette so color names, hex values, and CSS stay in sync.
// Gotchas: White is included but additive blending can make it read as very
//          bright grey; still useful as an override choice.
// ═══════════════════════════════════════════════════════════════════════════

interface FlameColorOption {
  readonly name: string;
  readonly hex: number;
  readonly css: string;
}

const FLAME_COLOR_OPTIONS: Readonly<FlameColorOption[]> = [
  { name: 'Red', hex: 0xff2222, css: '#ff2222' },
  { name: 'Yellow', hex: 0xffdd22, css: '#ffdd22' },
  { name: 'Green', hex: 0x22ff66, css: '#22ff66' },
  { name: 'Blue', hex: 0x2288ff, css: '#2288ff' },
  { name: 'Purple', hex: 0xcc44ff, css: '#cc44ff' },
  { name: 'White', hex: 0xffffff, css: '#ffffff' },
  { name: 'Orange', hex: 0xff8822, css: '#ff8822' },
];

let loadedShips: { entry: ShipCatalogEntry; mesh: Group }[] = [];
let currentIndex = 0;
let selectedNozzle = 0;
let autoRotate = true;
let showWireframe = false;
let showHelpers = true;

const scene = new Scene();
scene.background = new Color(0x050510);

const camera = new PerspectiveCamera(
  CAMERA_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 0, CAMERA_Z);

const hangarCanvas = document.getElementById('hangar-canvas') as HTMLCanvasElement | null;
if (!hangarCanvas) {
  throw new Error('Missing #hangar-canvas element for Ship Hangar inspector');
}

const renderer = new WebGLRenderer({
  canvas: hangarCanvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

scene.add(new AmbientLight(0x404040, 1.5));
const sun = new DirectionalLight(0xffffff, 2);
sun.position.set(10, 10, 10);
scene.add(sun);
const rim = new DirectionalLight(0x445566, 0.8);
rim.position.set(-10, -5, -5);
scene.add(rim);

const shipRoot = new Group();
scene.add(shipRoot);

const helperRoot = new Group();
scene.add(helperRoot);

const gridHelper = new GridHelper(12, 24, 0x334455, 0x223344);
gridHelper.rotation.x = Math.PI / 2;
gridHelper.position.z = -0.5;
helperRoot.add(gridHelper);

const axesHelper = new AxesHelper(1.5);
helperRoot.add(axesHelper);

let bboxHelper: Box3Helper | null = null;
let currentFlameMeshes: Mesh[] = [];
let currentNozzleMarkers: Mesh[] = [];
let currentWireframeMeshes: Mesh[] = [];
let currentShipSize = new Vector3();

const raycaster = new Raycaster();
const mouse = new Vector2();
const dragPlane = new Plane();
const dragWorldPoint = new Vector3();
const dragLocalPoint = new Vector3();
let hoveredMarkerIndex = -1;
let draggedMarkerIndex = -1;
let wasAutoRotatingBeforeDrag = true;

const uiShipName = document.getElementById('hangar-ship-name') as HTMLDivElement;
const uiStats = document.getElementById('hangar-stats') as HTMLDivElement;
const uiNozzle = document.getElementById('hangar-nozzle') as HTMLDivElement;
const uiBack = document.getElementById('hangar-back') as HTMLButtonElement | null;
const uiSwatches = document.getElementById('hangar-color-swatches') as HTMLDivElement | null;
const uiColorAll = document.getElementById('hangar-color-all') as HTMLInputElement | null;
const uiColorReset = document.getElementById('hangar-color-reset') as HTMLButtonElement | null;

async function init(): Promise<void> {
  uiShipName.textContent = 'Loading hangar…';

  const results = await Promise.all(
    SHIP_CATALOG.map(async (entry) => {
      const mesh = await loadCatalogMesh(entry);
      return { entry, mesh };
    }),
  );

  loadedShips = results;
  if (loadedShips.length === 0) {
    uiShipName.textContent = 'No ships loaded';
    return;
  }

  initBackButton();
  initColorPicker();
  getOrCreateCustomConfig(loadedShips[0].entry.id);
  ensureTuning(loadedShips[0].entry.id);
  showShip(0);
  bindMouseDrag();
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  requestAnimationFrame(loop);
}

function ensureTuning(shipId: number, size?: Vector3): void {
  ensureTuningForConfig(shipId, size ?? currentShipSize);
}

function showShip(index: number): void {
  currentIndex = ((index % loadedShips.length) + loadedShips.length) % loadedShips.length;
  const { entry, mesh } = loadedShips[currentIndex];

  shipRoot.clear();
  helperRoot.clear();
  helperRoot.add(gridHelper);
  helperRoot.add(axesHelper);
  helperRoot.add(shipRoot);

  const displayMesh = mesh.clone();
  displayMesh.position.set(0, 0, 0);
  displayMesh.rotation.set(0, 0, 0);
  shipRoot.add(displayMesh);

  // Capture hull dimensions from the original model before centering it.
  const rawBox = new Box3().setFromObject(displayMesh);
  const size = new Vector3();
  rawBox.getSize(size);
  currentShipSize.copy(size);
  const center = new Vector3();
  rawBox.getCenter(center);

  // Center the ship in the root for clean rotation, then recompute the helper
  // box so the green bounding box actually aligns with the centered mesh.
  displayMesh.position.sub(center);
  const centeredBox = new Box3().setFromObject(displayMesh);

  if (showHelpers) {
    bboxHelper = new Box3Helper(centeredBox, 0x44ff44);
    helperRoot.add(bboxHelper);
  }

  ensureTuning(entry.id, currentShipSize);
  selectedNozzle = 0;
  attachInspectorFlames(displayMesh, entry.id, currentShipSize);
  attachNozzleMarkers(displayMesh, entry.id, currentShipSize);
  updateWireframe(displayMesh);
  updateUi(currentShipSize);
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Flame and Marker Lifecycle
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Rebuild the inspector flame cones and nozzle marker dots whenever
//          the player duplicates, deletes, or drags a nozzle so the preview
//          always matches the current config.
// Setup: attachInspectorFlames() and attachNozzleMarkers() dispose the previous
//        meshes and create new ones from the current ShipExhaustConfig.
// Issues: Old meshes were disposed but never removed from the ship group, so
//         duplicate/delete left ghost flames/markers on screen.
// Fix: Remove each old mesh from its parent before disposing geometry/material.
// Gotchas: The arrays track meshes for disposal only; the scene graph owns the
//          actual children, so forgetting the remove() call leaks visuals.
// ═══════════════════════════════════════════════════════════════════════════

function attachInspectorFlames(shipGroup: Group, shipId: number, size: Vector3): void {
  currentFlameMeshes.forEach((m) => {
    m.parent?.remove(m);
    m.geometry.dispose();
    (m.material as MeshBasicMaterial).dispose();
  });
  currentFlameMeshes = [];

  const config = getOrCreateCustomConfig(shipId);
  if (!config) return;

  const hullWidthY = size.y;
  const hullLengthX = size.x;
  const halfLengthX = hullLengthX * 0.5;
  const rearX = -halfLengthX;
  const tuning = tuningByShip.get(shipId);
  if (!tuning) return;

  config.nozzles.forEach((nozzle, i) => {
    const t = tuning.nozzles[i];
    if (t.length === 0) {
      t.length = hullLengthX * DEFAULT_FLAME_LENGTH_RATIO;
    }

    const yAnchor = (-0.5 + nozzle.xPosition) * hullWidthY + t.yOffset;
    const baseRadius = nozzle.flameWidthPercent * hullWidthY * 0.5;
    const radius = baseRadius * t.radiusScale;
    const baseX = rearX + t.baseOffset;
    const length = t.length;
    const color = getFlameColorOverride(shipId, i) ?? nozzle.color;

    const geometry = new ConeGeometry(radius, length, 8);
    geometry.scale(1, -1, 1);
    geometry.rotateZ(-Math.PI / 2);

    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });

    const mesh = new Mesh(geometry, material);
    mesh.name = EXHAUST_FLAME_NAME;
    mesh.position.set(baseX - length * 0.5, yAnchor, 0);

    shipGroup.add(mesh);
    currentFlameMeshes.push(mesh);
  });
}

function attachNozzleMarkers(shipGroup: Group, shipId: number, size: Vector3): void {
  currentNozzleMarkers.forEach((m) => {
    m.parent?.remove(m);
    m.geometry.dispose();
    (m.material as MeshBasicMaterial).dispose();
  });
  currentNozzleMarkers = [];

  const config = getOrCreateCustomConfig(shipId);
  if (!config) return;

  const hullWidthY = size.y;
  const halfLengthX = size.x * 0.5;
  const rearX = -halfLengthX;

  config.nozzles.forEach((nozzle, i) => {
    const isSelected = i === selectedNozzle;
    const isHovered = i === hoveredMarkerIndex;
    const geometry = new SphereGeometry(isSelected || isHovered ? 0.07 : 0.05, 12, 12);
    const material = new MeshBasicMaterial({
      color: isSelected ? 0x00eaff : 0xff4444,
      transparent: true,
      opacity: isHovered ? 1.0 : 0.9,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    const tuning = tuningByShip.get(shipId);
    const yOffset = tuning?.nozzles[i]?.yOffset ?? 0;
    mesh.position.set(rearX + (tuning?.nozzles[i]?.baseOffset ?? 0), (-0.5 + nozzle.xPosition) * hullWidthY + yOffset, 0.12);
    mesh.userData.nozzleIndex = i;
    shipGroup.add(mesh);
    currentNozzleMarkers.push(mesh);
  });
}

function updateWireframe(displayMesh: Group): void {
  currentWireframeMeshes.forEach((m) => {
    if (m.parent) m.parent.remove(m);
    (m.material as MeshBasicMaterial).dispose();
  });
  currentWireframeMeshes = [];

  if (!showWireframe) return;

  displayMesh.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;

    const wireMat = new MeshBasicMaterial({
      color: 0x00eaff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const wireMesh = new Mesh(mesh.geometry, wireMat);
    wireMesh.position.copy(mesh.position);
    wireMesh.rotation.copy(mesh.rotation);
    wireMesh.scale.copy(mesh.scale);
    wireMesh.name = 'wireframeOverlay';
    mesh.parent?.add(wireMesh);
    currentWireframeMeshes.push(wireMesh);
  });
}

function rebuildFlames(): void {
  const { entry } = loadedShips[currentIndex];
  const displayMesh = shipRoot.children[0] as Group;
  if (!displayMesh) return;

  attachInspectorFlames(displayMesh, entry.id, currentShipSize);
  updateUi(currentShipSize);
}

function rebuildMarkers(): void {
  const { entry } = loadedShips[currentIndex];
  const displayMesh = shipRoot.children[0] as Group;
  if (!displayMesh) return;

  attachNozzleMarkers(displayMesh, entry.id, currentShipSize);
}

function getCurrentSize(): Vector3 {
  return currentShipSize.clone();
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Hangar Keyboard Controls
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Provide one-handed keyboard shortcuts for tuning the ship preview
//          and editing nozzles without reaching for the mouse.
// Setup: All shortcuts live in onKeyDown(). Duplicate/delete/restructure keys
//        are lowercase letters to avoid conflicts with browser/OS hotkeys.
// Issues: The player asked for duplicate on F and delete on D, but D was
//         already used for reset tuning, and Insert/Delete are laptop-key
//         dependent.
// Fix: Moved duplicate to F, delete to D, and reset tuning to T. Updated the
//      legend in ships-inspector.html to match.
// Gotchas: Lowercase letters are case-insensitive here, but the legend shows
//          uppercase for readability. Keep the HTML legend in sync with this
//          switch statement.
// ═══════════════════════════════════════════════════════════════════════════

function onKeyDown(event: KeyboardEvent): void {
  if (loadedShips.length === 0) return;

  const { entry } = loadedShips[currentIndex];
  const tuning = tuningByShip.get(entry.id)!;
  const size = currentShipSize;
  const hullWidth = size.y;
  const hullLength = size.x;

  switch (event.key) {
    case 'ArrowRight':
      event.preventDefault();
      showShip(currentIndex + 1);
      return;
    case 'ArrowLeft':
      event.preventDefault();
      showShip(currentIndex - 1);
      return;
    case 'w':
    case 'W':
      showWireframe = !showWireframe;
      updateWireframe(shipRoot.children[0] as Group);
      updateUi(size);
      return;
    case 'b':
    case 'B':
      showHelpers = !showHelpers;
      showShip(currentIndex);
      return;
    case 'r':
    case 'R':
      autoRotate = !autoRotate;
      updateUi(size);
      return;
    case 'z':
    case 'Z':
      camera.position.z = Math.max(2, camera.position.z * 0.85);
      updateUi(size);
      return;
    case 'x':
    case 'X':
      camera.position.z = Math.min(60, camera.position.z / 0.85);
      updateUi(size);
      return;
    case '0':
      camera.position.z = CAMERA_Z;
      updateUi(size);
      return;
    case 'n':
    case 'N':
      selectedNozzle = (selectedNozzle + 1) % tuning.nozzles.length;
      rebuildMarkers();
      updateUi(size);
      return;
    case 'f':
    case 'F':
      duplicateNozzle(entry.id, size);
      rebuildFlames();
      rebuildMarkers();
      updateUi(size);
      return;
    case 'd':
    case 'D':
      deleteNozzle(entry.id, size);
      rebuildFlames();
      rebuildMarkers();
      updateUi(size);
      return;
    case 'ArrowUp':
      event.preventDefault();
      tuning.nozzles[selectedNozzle].yOffset += hullWidth * 0.02;
      rebuildFlames();
      return;
    case 'ArrowDown':
      event.preventDefault();
      tuning.nozzles[selectedNozzle].yOffset -= hullWidth * 0.02;
      rebuildFlames();
      return;
    case '+':
    case '=':
      tuning.nozzles[selectedNozzle].radiusScale = Math.min(
        2.0,
        tuning.nozzles[selectedNozzle].radiusScale * 1.05,
      );
      rebuildFlames();
      return;
    case '-':
    case '_':
      tuning.nozzles[selectedNozzle].radiusScale = Math.max(
        0.5,
        tuning.nozzles[selectedNozzle].radiusScale / 1.05,
      );
      rebuildFlames();
      return;
    case '[':
      tuning.nozzles[selectedNozzle].length -= hullLength * 0.1;
      tuning.nozzles[selectedNozzle].length = Math.max(
        hullLength * 0.05,
        tuning.nozzles[selectedNozzle].length,
      );
      rebuildFlames();
      return;
    case ']':
      tuning.nozzles[selectedNozzle].length += hullLength * 0.1;
      rebuildFlames();
      return;
    case ',':
    case '<':
      tuning.nozzles[selectedNozzle].baseOffset -= hullLength * 0.02;
      rebuildFlames();
      return;
    case '.':
    case '>':
      tuning.nozzles[selectedNozzle].baseOffset += hullLength * 0.02;
      rebuildFlames();
      return;
    case 't':
    case 'T':
      tuningByShip.delete(entry.id);
      ensureTuning(entry.id);
      rebuildFlames();
      rebuildMarkers();
      return;
    case 'c':
    case 'C':
      copyCurrentConfig();
      return;
    case 's':
    case 'S':
      saveScreenshot();
      return;
    default:
      return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Color Picker UI Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Render the flame-color swatch buttons, handle player clicks, and
//          persist the chosen colors to localStorage so gameplay picks them up.
// Setup: Called once during init(); builds swatch buttons from the hard-coded
//        FLAME_COLOR_OPTIONS palette. Clicking a swatch updates either the
//        currently selected nozzle or all nozzles depending on the checkbox.
// Issues: The color picker DOM was added to the HTML but had no behavior.
// Fix: Added initColorPicker(), applyColorToNozzle(), and helpers to read/write
//      overrides through the shared functions in src/exhaust-gameplay.ts.
// Gotchas: The swatch matching current color is highlighted. Because overrides
//          are per-nozzle, applying to all nozzles writes a separate override
//          for each index so the ship stays consistent even if defaults differ.
// ═══════════════════════════════════════════════════════════════════════════

function initBackButton(): void {
  if (!uiBack) return;
  uiBack.addEventListener('click', () => {
    window.location.href = '/';
  });
}

function initColorPicker(): void {
  if (!uiSwatches || !uiColorAll || !uiColorReset) return;

  uiSwatches.innerHTML = '';
  FLAME_COLOR_OPTIONS.forEach((option) => {
    const button = document.createElement('button');
    button.className = 'hangar-color-swatch';
    button.type = 'button';
    button.title = option.name;
    button.style.backgroundColor = option.css;
    button.dataset.hex = String(option.hex);
    button.setAttribute('aria-label', `Set flame color to ${option.name}`);
    button.addEventListener('click', () => onColorSwatchClick(option.hex));
    uiSwatches!.appendChild(button);
  });

  uiColorReset.addEventListener('click', () => {
    const { entry } = loadedShips[currentIndex];
    if (!entry) return;
    clearFlameColorOverrides(entry.id);
    rebuildFlames();
    updateColorSwatchSelection(entry.id);
  });

  updateColorSwatchSelection(loadedShips[0]?.entry.id ?? 1);
}

function onColorSwatchClick(color: number): void {
  const { entry } = loadedShips[currentIndex];
  if (!entry) return;
  const config = SHIP_EXHAUST_CONFIGS.get(entry.id);
  if (!config) return;

  const applyAll = uiColorAll?.checked ?? false;
  if (applyAll) {
    config.nozzles.forEach((_, i) => {
      setFlameColorOverride(entry.id, i, color);
    });
  } else {
    setFlameColorOverride(entry.id, selectedNozzle, color);
  }

  rebuildFlames();
  updateColorSwatchSelection(entry.id);
}

function updateColorSwatchSelection(shipId: number): void {
  if (!uiSwatches) return;

  const config = getOrCreateCustomConfig(shipId);
  const activeColor = config
    ? (getFlameColorOverride(shipId, selectedNozzle) ?? config.nozzles[selectedNozzle]?.color ?? null)
    : null;

  const buttons = Array.from(uiSwatches.querySelectorAll('.hangar-color-swatch')) as HTMLButtonElement[];
  buttons.forEach((button) => {
    const hex = Number(button.dataset.hex);
    button.classList.toggle('selected', activeColor !== null && hex === activeColor);
  });

  const colorHex = activeColor !== null ? `#${activeColor.toString(16).padStart(6, '0')}` : 'default';
  const allSame = config
    ? config.nozzles.every((_, i) => (getFlameColorOverride(shipId, i) ?? config.nozzles[i].color) === activeColor)
    : false;
  const prefix = allSame ? 'All nozzles' : `Nozzle ${selectedNozzle + 1}`;
  if (uiColorReset) {
    uiColorReset.textContent = activeColor !== null ? `${prefix}: ${colorHex}` : 'Reset colors';
  }
}

function copyCurrentConfig(): void {
  const { entry } = loadedShips[currentIndex];
  const config = getOrCreateCustomConfig(entry.id);
  const tuning = tuningByShip.get(entry.id);
  if (!config || !tuning) return;

  const size = getCurrentSize();
  const exportConfig = {
    shipId: entry.id,
    name: entry.name,
    hullLength: size.x,
    hullWidth: size.y,
    nozzleCount: config.nozzleCount,
    nozzles: config.nozzles.map((n, i) => {
      const t = tuning.nozzles[i];
      return {
        xPosition: n.xPosition,
        yOffset: t.yOffset,
        yOffsetRatio: size.y > 0 ? t.yOffset / size.y : 0,
        radiusScale: t.radiusScale,
        length: t.length,
        lengthRatio: size.x > 0 ? t.length / size.x : 0,
        baseOffset: t.baseOffset,
        baseOffsetRatio: size.x > 0 ? t.baseOffset / size.x : 0,
        color: getFlameColorOverride(entry.id, i) ?? n.color,
      };
    }),
  };

  const text = JSON.stringify(exportConfig, null, 2);
  navigator.clipboard.writeText(text).then(
    () => {
      const ui = uiNozzle;
      const original = ui.textContent;
      ui.textContent = 'Config copied to clipboard!';
      setTimeout(() => {
        ui.textContent = original;
      }, 1500);
    },
    () => {
      // eslint-disable-next-line no-console
      console.warn('Clipboard write failed');
    },
  );
}

function saveScreenshot(): void {
  const link = document.createElement('a');
  link.download = `hangar-ship-${loadedShips[currentIndex].entry.id}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
}

function updateUi(size: Vector3): void {
  const { entry } = loadedShips[currentIndex];
  const config = getOrCreateCustomConfig(entry.id);
  const tuning = tuningByShip.get(entry.id);

  uiShipName.textContent = `${entry.id}. ${entry.name}`;

  uiStats.innerHTML = [
    `Hull: ${size.x.toFixed(3)} × ${size.y.toFixed(3)}`,
    `Nozzles: ${config?.nozzleCount ?? 0}`,
    `Camera: ${camera.position.z.toFixed(1)}`,
    `Wireframe: ${showWireframe ? 'ON' : 'OFF'}`,
    `Helpers: ${showHelpers ? 'ON' : 'OFF'}`,
    `Rotate: ${autoRotate ? 'ON' : 'OFF'}`,
  ].join(' &nbsp;|&nbsp; ');

  if (!config || !tuning || tuning.nozzles.length === 0) {
    uiNozzle.textContent = 'No exhaust config for this ship.';
    return;
  }

  const t = tuning.nozzles[selectedNozzle];
  const n = config.nozzles[selectedNozzle];
  const currentColor = getFlameColorOverride(entry.id, selectedNozzle) ?? n.color;
  uiNozzle.innerHTML = [
    `Nozzle ${selectedNozzle + 1} / ${tuning.nozzles.length}`,
    `xPosition: ${n.xPosition.toFixed(3)}`,
    `yOffset: ${t.yOffset.toFixed(4)} (±2% hull width)`,
    `radiusScale: ${t.radiusScale.toFixed(2)} (±5%)`,
    `length: ${t.length.toFixed(4)} (±10% hull length)`,
    `baseOffset: ${t.baseOffset.toFixed(4)} (±2% hull length)`,
    `color: #${currentColor.toString(16).padStart(6, '0')}`,
  ].join(' <br>');

  updateColorSwatchSelection(entry.id);
}

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function loop(): void {
  if (autoRotate) {
    shipRoot.rotation.z += 0.004;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Mouse Dragging for Nozzle Placement
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Let the player drag the red nozzle marker dots to set the exact
//          exhaust start position with the mouse instead of keyboard nudges.
// Setup: A Raycaster tests mouse coordinates against the marker meshes. On
//        mousedown over a marker we pause auto-rotation, create a Plane facing
//        the camera through that marker, and project each mouse move onto the
//        plane. The intersection is converted to ship-local coordinates and
//        mapped back to xPosition + yOffset and baseOffset.
// Issues: The ship rotates continuously, so a screen-space-only drag would drift
//         relative to the model. Also, the overlay layer blocks pointer events.
// Fix: Listeners are bound directly to the canvas. We world-to-local the drag
//      point each frame so it tracks the rotating ship. Auto-rotation pauses
//      during the drag and resumes afterward unless the user toggled it off.
// Gotchas: The drag plane must be recreated at the marker's current world
//          position on mousedown, otherwise the marker will snap to a different
//          depth. We clamp offsets so the marker cannot be dragged inside the
//          nose or far outside the hull.
// ═══════════════════════════════════════════════════════════════════════════

function bindMouseDrag(): void {
  if (!hangarCanvas) return;

  hangarCanvas.addEventListener('pointermove', onPointerMove);
  hangarCanvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
}

function updateMouseFromEvent(event: PointerEvent): void {
  if (!hangarCanvas) return;
  const rect = hangarCanvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickMarker(): Mesh | null {
  if (currentNozzleMarkers.length === 0) return null;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(currentNozzleMarkers, false);
  return hits.length > 0 ? (hits[0].object as Mesh) : null;
}

function onPointerMove(event: PointerEvent): void {
  updateMouseFromEvent(event);

  if (draggedMarkerIndex >= 0) {
    updateDraggedMarker();
    return;
  }

  const hovered = pickMarker();
  const newHoveredIndex = hovered ? (hovered.userData.nozzleIndex as number) : -1;
  if (newHoveredIndex !== hoveredMarkerIndex) {
    hoveredMarkerIndex = newHoveredIndex;
    if (hangarCanvas) {
      hangarCanvas.style.cursor = hovered ? 'grab' : 'default';
    }
    rebuildMarkers();
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!hangarCanvas) return;
  updateMouseFromEvent(event);
  const marker = pickMarker();
  if (!marker) return;

  draggedMarkerIndex = marker.userData.nozzleIndex as number;
  selectedNozzle = draggedMarkerIndex;
  wasAutoRotatingBeforeDrag = autoRotate;
  autoRotate = false;
  hangarCanvas.style.cursor = 'grabbing';

  marker.getWorldPosition(dragWorldPoint);
  const cameraDirection = new Vector3();
  camera.getWorldDirection(cameraDirection);
  dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, dragWorldPoint);

  rebuildMarkers();
  updateUi(currentShipSize);
  updateDraggedMarker();
}

function onPointerUp(): void {
  if (draggedMarkerIndex < 0) return;
  draggedMarkerIndex = -1;
  if (wasAutoRotatingBeforeDrag) {
    autoRotate = true;
  }
  if (hangarCanvas) {
    hangarCanvas.style.cursor = hoveredMarkerIndex >= 0 ? 'grab' : 'default';
  }
  saveCustomConfig(loadedShips[currentIndex].entry.id);
}

function updateDraggedMarker(): void {
  if (draggedMarkerIndex < 0) return;

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.ray.intersectPlane(dragPlane, dragWorldPoint);
  if (!hit) return;

  dragLocalPoint.copy(dragWorldPoint);
  shipRoot.worldToLocal(dragLocalPoint);

  const { entry } = loadedShips[currentIndex];
  const config = getOrCreateCustomConfig(entry.id);
  const tuning = tuningByShip.get(entry.id);
  if (!config || !tuning) return;

  const size = currentShipSize;
  const halfLength = size.x * 0.5;
  const hullWidth = size.y;
  const nozzle = config.nozzles[draggedMarkerIndex];
  const t = tuning.nozzles[draggedMarkerIndex];

  // Compute desired marker world position from local X/Y.
  const desiredBaseX = dragLocalPoint.x;
  const desiredY = dragLocalPoint.y;

  // baseOffset is measured from rearX (-halfLength).
  t.baseOffset = desiredBaseX - (-halfLength);

  // xPosition is normalized across hull width; yOffset is the residual in world units.
  const normalizedY = desiredY / hullWidth + 0.5;
  nozzle.xPosition = Math.max(0, Math.min(1, normalizedY));
  t.yOffset = desiredY - (normalizedY - 0.5) * hullWidth;

  // Clamp base offset to keep flame base near the rear of the ship.
  const maxBehind = t.length * 0.5;
  const maxInside = halfLength;
  t.baseOffset = Math.max(-maxBehind, Math.min(maxInside, t.baseOffset));

  rebuildFlames();
  rebuildMarkers();
  updateUi(size);
  saveCustomConfig(entry.id);
}

init().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Hangar inspector failed to initialize:', error);
  uiShipName.textContent = 'Hangar failed to load';
});
