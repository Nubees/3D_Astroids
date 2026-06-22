import {
  Box3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHIP_RADIUS } from '../ship';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Catalog
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Define the playable ship roster and provide a single loader that
//          normalizes every ship model to the same conventions.
// Setup: Each entry points to a GLB file in public/models/ships/. The loader
//        applies the same centering, rotation, scale, and brightness tweaks that
//        were tuned for the first ship so every craft looks consistent in game.
// Issues: Without normalization, imported ships face different directions,
//         are different sizes, and are too dark to read against space.
// Fix: Center the model to its bounding box, rotate the top-view sprite so its
//      nose points +X, scale it to a fixed gameplay size, replace dark PBR
//      materials with bright unlit materials.
// Gotchas: SpEx extrudes sprites along Z, so the flat face is already on the XY
//          plane. Only a -90° Z rotation is needed. The loader falls back to a
//          procedural placeholder if any GLB fails so the menu can still open.
// ═══════════════════════════════════════════════════════════════════════════

export interface ShipCatalogEntry {
  readonly id: number;
  readonly name: string;
  readonly modelPath: string;
  readonly description: string;
}

export const SHIP_CATALOG: ShipCatalogEntry[] = [
  {
    id: 1,
    name: 'ShadowWing',
    modelPath: '/models/ships/Ship1.glb',
    description: 'A sleek recon hull built for silent runs through debris fields.',
  },
  {
    id: 2,
    name: 'Ironclaw',
    modelPath: '/models/ships/Ship2.glb',
    description: 'Armored bruiser with a reinforced prow meant for ramming rock.',
  },
  {
    id: 3,
    name: 'Voidstriker',
    modelPath: '/models/ships/Ship3.glb',
    description: 'Long-range interceptor tuned for dark-sector patrols.',
  },
  {
    id: 4,
    name: 'Starneedle',
    modelPath: '/models/ships/Ship4.glb',
    description: 'Slender high-speed scout with a piercing nose profile.',
  },
  {
    id: 5,
    name: 'Cometbreaker',
    modelPath: '/models/ships/Ship5.glb',
    description: 'Salvaged mining hull turned gunship; reinforced asteroid bow.',
  },
  {
    id: 6,
    name: 'Dustdevil',
    modelPath: '/models/ships/Ship6.glb',
    description: 'Nimble skirmisher that kicks up fragments as it strafes.',
  },
  {
    id: 7,
    name: 'Shardwing',
    modelPath: '/models/ships/Ship7.glb',
    description: 'Angular stealth fighter with reflective, crystalline panels.',
  },
  {
    id: 8,
    name: 'Thunderbolt',
    modelPath: '/models/ships/Ship8.glb',
    description: 'Shielded assault craft built around heavy forward cannons.',
  },
  {
    id: 9,
    name: 'Blackbolt',
    modelPath: '/models/ships/Ship9.glb',
    description: 'Stripped-down racer-turned-raider with a radar-absorbing finish.',
  },
  {
    id: 10,
    name: 'Sunrazor',
    modelPath: '/models/ships/Ship10.glb',
    description: 'Solar-reflective interceptor tuned for fast diving attacks.',
  },
  {
    id: 11,
    name: 'Frostfang',
    modelPath: '/models/ships/Ship11.glb',
    description: 'Cryo-cooled precision striker with a pale engine glare.',
  },
  {
    id: 12,
    name: 'Emberlance',
    modelPath: '/models/ships/Ship12.glb',
    description: 'Aggressive close-range fighter with red-hot thruster vents.',
  },
];

const TARGET_LENGTH = SHIP_RADIUS * 5.2;
const loader = new GLTFLoader();

export async function loadCatalogMesh(entry: ShipCatalogEntry): Promise<Group> {
  try {
    const gltf = await loader.loadAsync(entry.modelPath);
    const model = gltf.scene;

    model.rotation.set(0, 0, 0);
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    const box = new Box3().setFromObject(model);
    const size = new Vector3();
    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);

    // Top-view sprite, nose points +Y in source, gameplay expects +X.
    model.rotation.z = -Math.PI / 2;

    model.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) {
        mesh.position.sub(center);
      }
    });

    const xySize = Math.max(size.x, size.y);
    const scale = xySize > 0 ? TARGET_LENGTH / xySize : 1;
    model.scale.set(scale, scale, scale);

    model.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) {
        const material = mesh.material;
        const materials = Array.isArray(material) ? material : [material];
        const newMaterials = materials.map((mat) => {
          if (mat instanceof MeshStandardMaterial) {
            const newMat = new MeshBasicMaterial({
              map: mat.map,
              transparent: mat.transparent,
              opacity: mat.opacity,
              side: mat.side,
              depthWrite: mat.depthWrite,
            });
            // Tint white to keep the artwork crisp, but darken slightly so it
            // does not blow out against the black background and shield glow.
            newMat.color = new Color(0xffffff);
            newMat.color.multiplyScalar(0.82);
            return newMat;
          }
          return mat;
        });
        mesh.material = materials.length > 1 ? newMaterials : newMaterials[0];
      }
    });

    const ship = new Group();
    ship.add(model);
    return ship;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to load ship ${entry.name}, falling back to placeholder:`, error);
    return createPlaceholderShip();
  }
}

function createPlaceholderShip(): Group {
  const group = new Group();

  // Minimal fallback arrow so the menu and game still work if a GLB is missing.
  const material = new MeshBasicMaterial({ color: 0x00ccff });

  const body = new Mesh(new ConeGeometry(0.5, 1.5, 8), material);
  body.rotation.z = -Math.PI / 2;
  group.add(body);

  const engine = new Mesh(new CylinderGeometry(0.2, 0.3, 0.6, 8), material);
  engine.rotation.z = -Math.PI / 2;
  engine.position.x = -0.8;
  group.add(engine);

  return group;
}
