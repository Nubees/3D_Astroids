import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  SHIP_CATALOG,
  ShipCatalogEntry,
  loadCatalogMesh,
} from './ships/catalog';
import { preloadMissileTexture } from './missile-vfx';

import './ship-select.css';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Selection Screen
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Present a hangar-style menu where the player chooses a ship before
//          the game starts. Shows a live rotating preview of the selected ship
//          behind an HTML overlay of selectable cards, and provides a launch
//          point into the Ship Hangar for visual flame customization.
// Setup: Created by main.ts with the shared #game-canvas. Loads all ship GLBs,
//        renders one preview, and resolves with the chosen ship mesh and entry.
// Issues: A missing or slow ship asset could leave the menu blank.
// Fix: Show a loading state and fall back to a placeholder mesh for any ship
//      that fails to load, so the menu is always usable.
// Gotchas: The preview renderer is disposed before the game starts. The selected
//          ship mesh is removed from the preview scene and handed off to Game,
//          so it must not share disposable resources with the preview renderer.
//          Keyboard focus is managed manually so arrow keys move through the
//          grid and Enter confirms. The hangar icon is a simple link navigation,
//          not a modal, so the ShipSelectScreen is recreated on return.
// ═══════════════════════════════════════════════════════════════════════════

interface LoadedShip {
  readonly entry: ShipCatalogEntry;
  readonly mesh: Group;
}

export interface ShipSelection {
  readonly entry: ShipCatalogEntry;
  readonly mesh: Group;
}

export class ShipSelectScreen {
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly previewGroup = new Group();
  private loadedShips: LoadedShip[] = [];
  private focusedIndex = 0;
  private running = false;
  private overlay: HTMLDivElement | null = null;
  private grid: HTMLDivElement | null = null;
  private resolve: ((value: ShipSelection) => void) | null = null;
  private rafId = 0;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.scene = new Scene();
    this.scene.background = new Color(0x050510);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene.add(new AmbientLight(0xffffff, 1.2));
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(2, 4, 6);
    this.scene.add(key);
    const fill = new DirectionalLight(0x4455ff, 0.6);
    fill.position.set(-3, -2, 4);
    this.scene.add(fill);

    this.previewGroup.position.set(0, 0.3, 0);
    this.scene.add(this.previewGroup);

    this.createOverlay();
    this.bindResize();
  }

  async waitForSelection(): Promise<ShipSelection> {
    this.running = true;
    this.showLoading(true);

    this.loadedShips = await this.loadAllShips();
    await preloadMissileTexture();
    this.showLoading(false);
    this.buildGrid();
    this.updatePreview();
    this.updateFocus();

    this.lastTime = performance.now();
    this.loop();

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private async loadAllShips(): Promise<LoadedShip[]> {
    const results = await Promise.all(
      SHIP_CATALOG.map(async (entry) => {
        const mesh = await loadCatalogMesh(entry);
        return { entry, mesh };
      }),
    );
    return results;
  }

  private createOverlay(): void {
    const overlay = document.createElement('div');
    overlay.className = 'ship-select-overlay';

    // ═══════════════════════════════════════════════════════════════════════════
    // My Rules — Ship Select toolbar icons (top-left launcher pair)
    // ═══════════════════════════════════════════════════════════════════════════
    // Purpose: Give players a discoverable way to open the Ship Hangar
    //          (tune exhaust flames) AND the Asteroid Lab (compare 20
    //          video-textured asteroid methods, Phase 7h v7) before flying.
    // Setup:   Two small icons in the top-left of the overlay, side by
    //          side as a toolbar pair. The Hangar navigates to
    //          /ships-inspector.html; the Lab navigates to
    //          /test-lab/asteroid-lab.html. Both use the same cyan-bordered
    //          hex clip-path visual treatment (see .ship-select-{hangar,
    //          lab}-icon in ship-select.css) — only position differs.
    // Issues:  Before Phase 7h v8 the hangar was the only launcher icon;
    //          the test lab was reachable only via direct URL. Players
    //          reviewing v6 / v7 / v8 video-asteroid methods had no
    //          discoverable entry point.
    // Fix:     Added the Lab icon immediately to the right of the
    //          Hangar icon (Hangar at left:18px, Lab at left:74px —
    //          44px button + 12px gap + 18px page padding).
    // Gotchas: Both icons live on the ship-select overlay which is
    //          pointer-events: none — the icons themselves must opt back
    //          in with pointer-events: auto (handled by the shared CSS
    //          class). Returning players use browser back to return.
    //          publicDir is enabled in vite.config.ts so
    //          public/test-lab/asteroid-lab.html ships to dist/ in
    //          production builds alongside dist/ships-inspector.html.
    // ═══════════════════════════════════════════════════════════════════════════
    const hangarButton = document.createElement('button');
    hangarButton.className = 'ship-select-hangar-icon';
    hangarButton.type = 'button';
    hangarButton.setAttribute('aria-label', 'Open Ship Hangar');
    hangarButton.title = 'Open Ship Hangar';
    hangarButton.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    hangarButton.addEventListener('click', () => {
      window.location.href = '/ships-inspector.html';
    });
    overlay.appendChild(hangarButton);

    // Asteroid Lab — Phase 7h v7 test lab at /test-lab/asteroid-lab.html
    // (20 numbered video-overlay methods, spacebar-cycled).
    const labButton = document.createElement('button');
    labButton.className = 'ship-select-lab-icon';
    labButton.type = 'button';
    labButton.setAttribute('aria-label', 'Open Asteroid Lab');
    labButton.title = 'Open Asteroid Lab';
    // Faceted asteroid outline + filled play-triangle inside (the
    // triangle reads as "video" / "play" — the lab is for video-textured
    // asteroid methods).
    labButton.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.2 L19 7 L20.8 12 L18 17.5 L13 20.5 L7.5 19 L4 14.5 L5 8.5 L9.5 4.5 Z"/><path d="M10 9.5 L15 12 L10 14.5 Z" fill="currentColor" stroke="none"/></svg>`;
    labButton.addEventListener('click', () => {
      window.location.href = '/test-lab/asteroid-lab.html';
    });
    overlay.appendChild(labButton);

    const title = document.createElement('h1');
    title.className = 'ship-select-title';
    title.textContent = 'SELECT YOUR FIGHTER';
    overlay.appendChild(title);

    const loading = document.createElement('div');
    loading.className = 'ship-select-loading';
    loading.textContent = 'Loading Hangar...';
    overlay.appendChild(loading);

    const info = document.createElement('div');
    info.className = 'ship-select-info';
    const infoName = document.createElement('div');
    infoName.className = 'ship-select-info-name';
    const infoDesc = document.createElement('div');
    infoDesc.className = 'ship-select-info-desc';
    info.appendChild(infoName);
    info.appendChild(infoDesc);
    overlay.appendChild(info);

    const grid = document.createElement('div');
    grid.className = 'ship-select-grid';
    overlay.appendChild(grid);

    const hint = document.createElement('div');
    hint.className = 'ship-select-hint';
    hint.textContent = 'Click or press Enter to launch';
    overlay.appendChild(hint);

    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.grid = grid;
  }

  private showLoading(show: boolean): void {
    if (!this.overlay) return;
    const loading = this.overlay.querySelector('.ship-select-loading') as HTMLElement;
    if (loading) loading.style.display = show ? 'block' : 'none';
    const grid = this.overlay.querySelector('.ship-select-grid') as HTMLElement;
    if (grid) grid.style.display = show ? 'none' : 'grid';
    const info = this.overlay.querySelector('.ship-select-info') as HTMLElement;
    if (info) info.style.display = show ? 'none' : 'block';
    const hint = this.overlay.querySelector('.ship-select-hint') as HTMLElement;
    if (hint) hint.style.display = show ? 'none' : 'block';
  }

  private buildGrid(): void {
    if (!this.grid) return;
    this.grid.innerHTML = '';

    this.loadedShips.forEach((ship, index) => {
      const card = document.createElement('button');
      card.className = 'ship-select-card';
      card.type = 'button';
      card.dataset.index = String(index);

      const number = document.createElement('div');
      number.className = 'ship-select-card-number';
      number.textContent = ` Ship ${ship.entry.id} `;

      const name = document.createElement('div');
      name.className = 'ship-select-card-name';
      name.textContent = ship.entry.name;

      card.appendChild(number);
      card.appendChild(name);

      card.addEventListener('mouseenter', () => {
        this.focusedIndex = index;
        this.updateFocus();
      });
      card.addEventListener('click', () => {
        this.focusedIndex = index;
        this.updateFocus();
        this.confirmSelection();
      });

      if (this.grid) {
        this.grid.appendChild(card);
      }
    });

    this.bindKeyboard();
  }

  private bindKeyboard(): void {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.grid) return;
      const columns = this.computeColumnCount();
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          this.focusedIndex = (this.focusedIndex + 1) % this.loadedShips.length;
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.focusedIndex = (this.focusedIndex - 1 + this.loadedShips.length) % this.loadedShips.length;
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.focusedIndex = (this.focusedIndex + columns) % this.loadedShips.length;
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.focusedIndex = (this.focusedIndex - columns + this.loadedShips.length) % this.loadedShips.length;
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          this.confirmSelection();
          return;
        default:
          return;
      }
      this.updateFocus();
    };

    document.addEventListener('keydown', onKeyDown);
    this.disposeListeners.push(() => document.removeEventListener('keydown', onKeyDown));
  }

  private computeColumnCount(): number {
    if (!this.grid) return 4;
    const width = window.innerWidth;
    if (width < 600) return 2;
    if (width < 900) return 3;
    if (width < 1200) return 4;
    return 6;
  }

  private updateFocus(): void {
    if (!this.grid) return;
    const cards = Array.from(this.grid.querySelectorAll('.ship-select-card')) as HTMLElement[];
    cards.forEach((card, index) => {
      const isFocused = index === this.focusedIndex;
      card.classList.toggle('focused', isFocused);
      card.setAttribute('aria-selected', String(isFocused));
      if (isFocused) {
        card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });

    const focused = this.loadedShips[this.focusedIndex];
    if (focused) {
      const infoName = this.overlay?.querySelector('.ship-select-info-name') as HTMLElement | null;
      const infoDesc = this.overlay?.querySelector('.ship-select-info-desc') as HTMLElement | null;
      if (infoName) infoName.textContent = focused.entry.name;
      if (infoDesc) infoDesc.textContent = focused.entry.description;
    }

    this.updatePreview();
  }

  private updatePreview(): void {
    this.previewGroup.clear();
    const focused = this.loadedShips[this.focusedIndex];
    if (!focused) return;

    // Clone the mesh so the preview can rotate without affecting the original.
    const previewMesh = focused.mesh.clone();
    previewMesh.position.set(0, 0, 0);
    previewMesh.rotation.set(0, 0, 0);
    this.previewGroup.add(previewMesh);
  }

  private confirmSelection(): void {
    if (!this.resolve) return;
    const focused = this.loadedShips[this.focusedIndex];
    if (!focused) return;

    // Return the original loaded mesh, not the clone, so Game owns it.
    this.resolve({ entry: focused.entry, mesh: focused.mesh });
    this.dispose();
  }

  private loop = () => {
    if (!this.running) return;
    const time = performance.now();
    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.previewGroup.rotation.z += delta * 0.4;
    this.previewGroup.rotation.y = Math.sin(time * 0.0008) * 0.15;

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private bindResize(): void {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    this.disposeListeners.push(() => window.removeEventListener('resize', onResize));
  }

  private disposeListeners: (() => void)[] = [];

  private dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);

    this.disposeListeners.forEach((fn) => fn());
    this.disposeListeners = [];

    this.previewGroup.clear();

    // The selected ship is handed off to Game, so do not dispose it.
    const selectedMesh = this.loadedShips[this.focusedIndex]?.mesh;
    this.loadedShips.forEach((ship) => {
      if (ship.mesh === selectedMesh) return;
      ship.mesh.traverse((child) => {
        const mesh = child as {
          geometry?: { dispose: () => void };
          material?: { dispose: () => void } | { dispose: () => void }[];
        };
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((m) => m.dispose());
        }
      });
    });
    this.loadedShips = [];

    this.renderer.dispose();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
