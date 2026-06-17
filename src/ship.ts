import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Mesh
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Procedurally build the player ship mesh for Phase 0.
// Setup: Called by Game to add the ship to the scene.
// Issues: None.
// Fix: Cone + cylinder form a simple forward-pointing ship; no external assets.
// Gotchas: Geometry defaults point up (+Y); rotate -90° around Z so nose is +X.
// ═══════════════════════════════════════════════════════════════════════════

export function createShip(): THREE.Group {
  const ship = new THREE.Group();

  const bodyGeometry = new THREE.ConeGeometry(0.5, 1.5, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x00ccff, roughness: 0.4 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.rotation.z = -Math.PI / 2;
  ship.add(body);

  const engineGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.6, 8);
  const engineMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const engine = new THREE.Mesh(engineGeometry, engineMaterial);
  engine.rotation.z = -Math.PI / 2;
  engine.position.x = -0.8;
  ship.add(engine);

  return ship;
}
