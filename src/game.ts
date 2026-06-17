import * as THREE from 'three';
import { createShip } from './ship';
import { AsteroidSize, createAsteroid } from './asteroid';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Game Loop
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Own the Three.js scene, camera, renderer, and update/render loop.
// Setup: Created with a canvas element; starts via requestAnimationFrame.
// Issues: None.
// Fix: Minimal custom loop for Phase 0 with a rotating ship and asteroid.
// Gotchas: Resize listener uses window dimensions; keep pixel ratio capped at 2.
// ═══════════════════════════════════════════════════════════════════════════

export class Game {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly ship: THREE.Group;
  private readonly asteroid: THREE.Group;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050510);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = 20;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene.add(new THREE.AmbientLight(0x404040, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(10, 10, 10);
    this.scene.add(sun);

    this.scene.add(createStarfield());

    this.ship = createShip();
    this.ship.position.set(0, -5, 0);
    this.scene.add(this.ship);

    this.asteroid = createAsteroid(AsteroidSize.LARGE);
    this.asteroid.position.set(0, 8, 0);
    this.scene.add(this.asteroid);

    window.addEventListener('resize', this.handleResize);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private loop = (time: number): void => {
    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.ship.rotation.z += deltaTime * 0.5;
    this.asteroid.rotation.x += deltaTime * 0.2;
    this.asteroid.rotation.y += deltaTime * 0.3;

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}

function createStarfield(): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const count = 800;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 1) {
    positions[i] = (Math.random() - 0.5) * 200;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    sizeAttenuation: false,
  });
  return new THREE.Points(geometry, material);
}
