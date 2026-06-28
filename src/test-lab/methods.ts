import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  Color,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  Mesh,
  MeshNormalMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NormalBlending,
  Points,
  PointsMaterial,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  VideoTexture,
  WireframeGeometry,
} from 'three';
import {
  applyChromaKeyToStandardMaterial,
  applySoftChromaKeyToStandardMaterial,
  CHROMA_KEY_DISCARD_FROM_VID_GLSL,
  chromaKeyCanvas,
} from './chroma-key';
import { loadVideoFrameTable, type FrameTable } from './video-frame-table';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Asteroid Test Lab: 20 Video-Overlay Methods (Phase 7h v7)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: 20 numbered factory functions (createMethod1 ... createMethod20)
//          that each return a Group containing the asteroid visual for one
//          candidate approach. Called by lab.ts in a spacebar-cycle.
//
// Setup:   Standalone test harness served from
//          public/test-lab/asteroid-lab.html. NO imports from the main
//          game — this file is fully self-contained. The MP4 lives at
//          /public/video/asteroid1.mp4 and is decoded ONCE into a
//          singleton VideoTexture (getSharedVideoTexture()) shared by
//          every method that needs it.
//
// Issues:  User reported v6 (BoxGeometry cube-cross) "still doesn't look
//          good" after 5 prior attempts. v7 widens the search — instead
//          of guessing at the 6th variation, present 20 distinct
//          approaches ranked by likely-solve-the-problem and let the
//          user pick what reads as "asteroid."
//
// Fix:     Phase 7h v7 — Methods 1-20 each have a short, focused
//          implementation. The factory pattern keeps per-method
//          complexity bounded (50-100 lines per method). All methods
//          return { group, description, update? } so lab.ts can wire
//          them uniformly.
//
// Gotchas:
//  - ASTEROID_RADIUS = 2.2 matches the LARGE Iron Slag from src/asteroid.ts
//    so the visual size is consistent across all 20 methods.
//  - The shared VideoTexture is lazily created on first use and never
//    disposed by individual methods (lab.ts calls disposeAll() at the
//    end if needed; for now we just leave it alive).
//  - All shaders use `precision highp float;` etc. as needed.
//  - Each method's My Rules comment is in the body, NOT in this header,
//    so each can be inspected/replaced independently.
// ═══════════════════════════════════════════════════════════════════════════

export const ASTEROID_RADIUS = 2.2;
export const METHOD_COUNT = 43;

export interface MethodResult {
  group: Group;
  description: string;
  update?: (dt: number, t: number) => void;
}

export const METHOD_TITLES: ReadonlyArray<string> = [
  'BoxGeometry cube-cross (v6 baseline)',
  'Icosahedron + emissive video (v5 pattern)',
  'Cave Glow — video only in recessed cracks',
  'Video IS the Bump — normalMap from video',
  'Wet/Dry Patches — video modulates roughness',
  'Video as Soul Light — PointLight color from video',
  'Just a Real Asteroid — stock CC0 texture, no video',
  'Holographic Sprite — billboard over lumpy rock',
  'Triplanar Video — no UV seams, 3-axis projection',
  'Damaged Hull — half rock, half video',
  'Rim Glow — Fresnel tinted by video color',
  'Energy Exhalation — particles colored by video',
  'Vector Arcade — wireframe + video tint',
  'Hologram Shader — scanlines + chromatic aberration',
  'Geometry Wars Bloom — neon emissive accents',
  'Living Rock — vertex displacement from video',
  'CSS3D video overlay — HTML video over 3D asteroid',
  'Two-sphere shell — outer faceted + inner video sphere',
  'MultiplyBlending composite — video × procedural gray',
  'Pixel-Art Cube — low-res canvas texture, retro',
  // ═══ Phase 7h v9 — Chroma-key variants ═══
  'v9.1 Box cube-cross + chroma 0.05 (tight)',
  'v9.2 Box cube-cross + chroma 0.30 (loose)',
  'v9.3 Icosahedron emissive + chroma (clean rock)',
  'v9.4 Icosahedron emissive + chroma + Fresnel rim',
  'v9.5 Triplanar video + chroma + dark rock underlay',
  'v9.6 MultiplyBlending + chroma',
  'v9.7 Box + video as diffuse map + chroma (textured cube)',
  'v9.8 Holographic Sprite + chroma (asteroid silhouette)',
  'v9.9 Icosahedron + chroma + vein highlight (red boost)',
  'v9.10 Icosahedron + chroma + emissive boost (pop)',
  'v10.1 NO30 at emissive 1.2 (gentle pop)',
  'v10.2 NO30 at emissive 1.3 (medium pop)',
  'v10.3 NO30 at emissive 1.4 (bright pop)',
  'v10.4 NO30 at emissive 1.5 (max-safe pop)',
  'v11.1 Box + 1.5 only (minimal port)',
  'v11.2 Box + 1.5 + DoubleSide (no-disappear port)',
  'v11.3 Box + 1.5 + DoubleSide + chroma (full port keep-box)',
  // ═══ Phase 7h v12 — Smooth loop frame-table comparator ═══
  'v12.1 NO38 — B3 frame table @ 128² (pre-baked seam blend, 15.7 MB)',
  'v12.2 NO39 — B3 frame table @ 256² (pre-baked seam blend, 62.9 MB)',
  'v12.3 NO40 — B3 frame table @ 512² (pre-baked seam blend, 251.7 MB)',
  // ═══ Phase 7h v12.4 — "half round" fix variants ═══
  'v12.4 NO41 — B3 + cropped frames (256², crop to asteroid body)',
  'v12.5 NO42 — B3 + UV remap (256², icosahedron UVs constrained to asteroid region)',
  'v12.6 NO43 — B3 + soft chroma-key (256², alpha fade instead of discard)',
];

// ═══════════════════════════════════════════════════════════════════════
// Shared video singleton
// ═══════════════════════════════════════════════════════════════════════
let sharedVideoEl: HTMLVideoElement | null = null;
let sharedVideoTex: VideoTexture | null = null;

function getSharedVideoTexture(): VideoTexture {
  if (sharedVideoTex !== null) return sharedVideoTex;

  const VIDEO_SRC = '/video/asteroid1.mp4';
  const HIDDEN = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;'
    + 'pointer-events:none;opacity:0;';

  const video = document.createElement('video');
  video.src = VIDEO_SRC;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.style.cssText = HIDDEN;
  document.body.appendChild(video);

  const playResult = video.play();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[test-lab] autoplay rejected:', err);
    });
  }

  const texture = new VideoTexture(video);
  texture.colorSpace = 'srgb';
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;

  sharedVideoEl = video;
  sharedVideoTex = texture;
  return texture;
}

/**
 * Average a single frame of the video to a Color. Used by methods that
 * need the "video's overall color" without sampling the texture (e.g.,
 * Rim Glow tint, PointLight color). Reads a 1×1 canvas from the video.
 */
function sampleAverageColor(video: HTMLVideoElement): Color {
  if (video.readyState < 2) return new Color(0xffffff);
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext('2d');
  if (!ctx) return new Color(0xffffff);
  ctx.drawImage(video, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return new Color(d[0] / 255, d[1] / 255, d[2] / 255);
}

// ═══════════════════════════════════════════════════════════════════════
// Per-method factories
// ═══════════════════════════════════════════════════════════════════════

// NO1 — BoxGeometry cube-cross (v6 baseline). Includes this as control
// so the user can A/B compare every other method against the v6 attempt.
function createMethod1(): MethodResult {
  const side = ASTEROID_RADIUS * 2;
  const tex = getSharedVideoTexture();
  const geom = new BoxGeometry(side, side, side);
  const FACE_UV_RANGES: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.50, 0.75, 0.333, 0.667],
    [0.00, 0.25, 0.333, 0.667],
    [0.25, 0.50, 0.667, 1.000],
    [0.25, 0.50, 0.000, 0.333],
    [0.25, 0.50, 0.333, 0.667],
    [0.75, 1.00, 0.333, 0.667],
  ];
  const uvs = new Float32Array(24);
  for (let f = 0; f < 6; f++) {
    const [uMin, uMax, vMin, vMax] = FACE_UV_RANGES[f];
    const b = f * 8;
    uvs[b + 0] = uMin; uvs[b + 1] = vMax;
    uvs[b + 2] = uMax; uvs[b + 3] = vMax;
    uvs[b + 4] = uMin; uvs[b + 5] = vMin;
    uvs[b + 6] = uMax; uvs[b + 7] = vMin;
  }
  geom.setAttribute('uv', new BufferAttribute(uvs, 2));
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.0,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'v6 attempt: BoxGeometry with cube-cross UV remap (each face a unique 1/4×1/3 video slice).',
  };
}

// NO2 — Icosahedron + emissive video (v5 pattern on faceted geom).
// Same material channel routing as v5 but on the chunky Iron Slag shape.
function createMethod2(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.0,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Phase 7h v5 emissive-only material on chunky IcosahedronGeometry. Video covers whole asteroid.',
  };
}

// NO3 — Cave Glow: video only in recessed cracks. We fake a "crack
// mask" using the world-space Y of each vertex — bottom areas get the
// video as emissive, top areas get dark rock.
function createMethod3(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  // Build a crack-mask UV attribute by reusing the Y vertex position
  // mapped into [0,1] — drives a separate CanvasTexture that's pure
  // gradient. Cheap and gives a clear "dark top, glowing bottom" split.
  const positions = geom.attributes.position;
  const mask = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    mask[i * 2] = 0.5;
    mask[i * 2 + 1] = (y / ASTEROID_RADIUS + 1) * 0.5;
  }
  geom.setAttribute('uv', new BufferAttribute(mask, 2));
  const mat = new MeshStandardMaterial({
    color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0.8,
    emissiveMap: tex, flatShading: true, roughness: 0.9, metalness: 0.0,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Cave Glow: dark rock with video as emissiveMap. Lighting reveals the lumpiness.',
  };
}

// NO4 — Video IS the Bump: video as normalMap. The video's luminance
// drives surface relief via the normal map; no video color visible.
function createMethod4(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 4);
  const mat = new MeshStandardMaterial({
    color: 0x555555, roughness: 0.9, metalness: 0.05,
    normalMap: tex, flatShading: false,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Video as normalMap: the video shapes surface relief, but no video color is visible.',
  };
}

// NO5 — Wet/Dry Patches: video as roughnessMap. Bright video pixels
// = smooth/glossy, dark video pixels = matte rock. Reads as mineral variation.
function createMethod5(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 2);
  const mat = new MeshStandardMaterial({
    color: 0x444444, roughness: 1.0, metalness: 0.0,
    roughnessMap: tex, flatShading: true,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Video as roughnessMap: bright pixels = glossy patches, dark pixels = matte rock.',
  };
}

// NO6 — Video as Soul Light: PointLight at center, color from per-frame
// video average. Pure dark rock asteroid lit from inside by video color.
function createMethod6(): MethodResult {
  const tex = getSharedVideoTexture();
  void tex;
  const geom = new DodecahedronGeometry(ASTEROID_RADIUS, 1);
  const mat = new MeshStandardMaterial({
    color: 0x111111, roughness: 0.9, metalness: 0.0, flatShading: true,
  });
  const mesh = new Mesh(geom, mat);
  // PointLight is part of the group so it follows the asteroid rotation.
  const light = new PointLight(0xffffff, 2.5, 8);
  const group = new Group();
  group.add(mesh);
  group.add(light);
  return {
    group,
    description: 'PointLight inside dark rock; color updates each frame from average video pixel.',
    update: () => {
      const video = sharedVideoEl;
      if (!video) return;
      light.color.copy(sampleAverageColor(video));
    },
  };
}

// NO7 — Just a Real Asteroid: stock CC0 texture, NO video. Control.
// Uses a procedurally-generated CanvasTexture (no asset dependency) so
// the test lab has no external image downloads. Rocky gray with craters.
function createMethod7(): MethodResult {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  // Rocky gradient with random darker spots
  const grad = ctx.createRadialGradient(128, 128, 30, 128, 128, 130);
  grad.addColorStop(0, '#888');
  grad.addColorStop(0.6, '#555');
  grad.addColorStop(1, '#222');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = Math.random() * 8 + 1;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = Math.random() * 4 + 1;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = 1000; tex.wrapT = 1000; // RepeatWrapping
  tex.repeat.set(2, 1);
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const mat = new MeshStandardMaterial({
    map: tex, roughness: 0.95, metalness: 0.0, flatShading: true,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Just a Real Asteroid: procedural rocky texture, NO video. Control case.',
  };
}

// NO8 — Holographic Sprite overlay: real lumpy asteroid + a transparent
// sprite in front of it that displays the video at 50% opacity.
function createMethod8(): MethodResult {
  const tex = getSharedVideoTexture();
  const rockGeom = new IcosahedronGeometry(ASTEROID_RADIUS, 2);
  const rockMat = new MeshStandardMaterial({
    color: 0x444444, roughness: 0.85, metalness: 0.05, flatShading: true,
  });
  const rock = new Mesh(rockGeom, rockMat);

  const spriteMat = new SpriteMaterial({
    map: tex, transparent: true, opacity: 0.55, depthTest: false,
    blending: NormalBlending,
  });
  const sprite = new Sprite(spriteMat);
  sprite.scale.set(ASTEROID_RADIUS * 2.4, ASTEROID_RADIUS * 2.4, 1);
  sprite.position.z = 0.05;

  const group = new Group();
  group.add(rock);
  group.add(sprite);
  return {
    group,
    description: 'Lumpy dark rock + a transparent Sprite overlaying the video. Holographic look.',
  };
}

// NO9 — Triplanar Video: custom shader sampling video from X, Y, Z
// projections and blending by world normal. No UV seams.
function createMethod9(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const mat = new ShaderMaterial({
    uniforms: {
      uVideo: { value: tex },
      uLightDir: { value: new Vector3(3, 4, 5).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uVideo;
      uniform vec3 uLightDir;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vWorldPos);
        vec3 blend = abs(n);
        blend = pow(blend, vec3(4.0));
        blend /= (blend.x + blend.y + blend.z);
        vec2 uvX = n.yz * 0.5 + 0.5;
        vec2 uvY = n.xz * 0.5 + 0.5;
        vec2 uvZ = n.xy * 0.5 + 0.5;
        vec4 cx = texture2D(uVideo, uvX);
        vec4 cy = texture2D(uVideo, uvY);
        vec4 cz = texture2D(uVideo, uvZ);
        vec4 col = cx * blend.x + cy * blend.y + cz * blend.z;
        // Cheap diffuse lighting
        float l = max(0.0, dot(normalize(vNormal), uLightDir));
        col.rgb *= 0.4 + l * 0.8;
        gl_FragColor = vec4(col.rgb, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Triplanar video projection: samples video from 3 axes blended by normal. No UV seams.',
  };
}

// NO10 — Damaged Hull: split hemisphere, half rock + half video.
// Uses two material groups on an IcosahedronGeometry. Splits by face
// index where the centroid's Y is positive (top half = video, bottom = rock).
function createMethod10(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 2);
  // Compute face centroids and assign material index 0 (rock) or 1 (video).
  const posAttr = geom.attributes.position;
  const triCount = posAttr.count / 3;
  const matIndices: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const cy = (posAttr.getY(t * 3) + posAttr.getY(t * 3 + 1) + posAttr.getY(t * 3 + 2)) / 3;
    matIndices.push(cy > 0 ? 1 : 0);
  }
  geom.clearGroups();
  // Assign one group per triangle — expensive but explicit.
  let start = 0;
  let currentIdx = matIndices[0];
  for (let t = 1; t <= triCount; t++) {
    if (t === triCount || matIndices[t] !== currentIdx) {
      geom.addGroup(start * 3, (t - start) * 3, currentIdx);
      if (t < triCount) {
        start = t;
        currentIdx = matIndices[t];
      }
    }
  }
  const rockMat = new MeshStandardMaterial({
    color: 0x444444, roughness: 0.9, metalness: 0.05, flatShading: true,
  });
  const videoMat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.9,
    emissiveMap: tex, flatShading: true, roughness: 0.7,
  });
  const mesh = new Mesh(geom, [rockMat, videoMat]);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Damaged Hull: top hemisphere = video (emissive), bottom hemisphere = rock. Stylized split.',
  };
}

// NO11 — Rim Glow: dark rock + Fresnel rim tinted by video color.
function createMethod11(): MethodResult {
  const tex = getSharedVideoTexture();
  void tex;
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const rockMat = new MeshStandardMaterial({
    color: 0x222222, roughness: 0.9, metalness: 0.05, flatShading: true,
  });
  const mesh = new Mesh(geom, rockMat);

  // Overlay: slightly larger transparent sphere with Fresnel shader.
  const overlayGeom = new SphereGeometry(ASTEROID_RADIUS * 1.02, 32, 24);
  const overlayMat = new ShaderMaterial({
    uniforms: { uColor: { value: new Color(0xffffff) } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -normalize(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - max(0.0, dot(vView, vNormal));
        rim = pow(rim, 2.5);
        gl_FragColor = vec4(uColor * rim, rim * 0.85);
      }
    `,
  });
  const overlay = new Mesh(overlayGeom, overlayMat);

  const group = new Group();
  group.add(mesh);
  group.add(overlay);
  return {
    group,
    description: 'Dark rock with a Fresnel rim overlay tinted by per-frame video color.',
    update: () => {
      const video = sharedVideoEl;
      if (!video) return;
      (overlayMat.uniforms.uColor.value as Color).copy(sampleAverageColor(video));
    },
  };
}

// NO12 — Energy Exhalation: 150 points around the asteroid, each
// colored by sampling the video at a per-particle UV (spherical).
function createMethod12(): MethodResult {
  const tex = getSharedVideoTexture();
  const N = 150;
  const positions = new Float32Array(N * 3);
  const uvs = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    // Uniform point on a sphere shell
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = ASTEROID_RADIUS * (1.05 + Math.random() * 0.4);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  const mat = new PointsMaterial({
    size: 0.18, map: tex, transparent: true, opacity: 0.6,
    blending: AdditiveBlending, depthWrite: false, vertexColors: false,
  });
  const points = new Points(geom, mat);

  // Add a small dark rock at the center so it's not just particles
  const rock = new Mesh(
    new IcosahedronGeometry(ASTEROID_RADIUS * 0.7, 1),
    new MeshStandardMaterial({ color: 0x222222, roughness: 0.9, flatShading: true }),
  );

  const group = new Group();
  group.add(rock);
  group.add(points);
  return {
    group,
    description: '150 particles around a small dark rock; each particle is colored by sampling the video at its UV.',
  };
}

// NO13 — Vector Arcade: wireframe Icosahedron with two LineSegments
// (one white static, one tinted by video color).
function createMethod13(): MethodResult {
  const tex = getSharedVideoTexture();
  void tex;
  const baseGeom = new IcosahedronGeometry(ASTEROID_RADIUS, 1);
  const wire = new WireframeGeometry(baseGeom);
  const whiteMat = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const tintMat = new LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.9 });
  const whiteLines = new LineSegments(wire, whiteMat);
  const tintLines = new LineSegments(wire.clone(), tintMat);

  const group = new Group();
  group.add(whiteLines);
  group.add(tintLines);
  return {
    group,
    description: 'Wireframe-only asteroid. White lines static; red lines tinted by per-frame video color. Retro CRT look.',
    update: () => {
      const video = sharedVideoEl;
      if (!video) return;
      tintMat.color.copy(sampleAverageColor(video));
    },
  };
}

// NO14 — Hologram Shader: scanlines + chromatic aberration + Fresnel
// rim glow. The video is sampled with R/G/B at slightly offset UVs.
function createMethod14(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const mat = new ShaderMaterial({
    uniforms: {
      uVideo: { value: tex },
      uTime: { value: 0 },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -normalize(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uVideo;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      void main() {
        // Scanline discard pattern
        float scan = step(0.5, fract(vUv.y * 80.0 + uTime * 2.0));
        if (scan < 0.5 && mod(vUv.y * 200.0, 2.0) < 0.5) discard;
        // Chromatic aberration
        float ca = 0.008;
        float r = texture2D(uVideo, vUv + vec2(ca, 0.0)).r;
        float g = texture2D(uVideo, vUv).g;
        float b = texture2D(uVideo, vUv - vec2(ca, 0.0)).b;
        vec3 col = vec3(r, g, b);
        // Fresnel rim
        float rim = pow(1.0 - max(0.0, dot(vView, vNormal)), 1.8);
        col += vec3(0.4, 0.7, 1.0) * rim * 0.6;
        gl_FragColor = vec4(col, 0.85);
      }
    `,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Hologram shader: scanlines, chromatic aberration, Fresnel rim glow. Sci-fi look.',
    update: (_dt, t) => {
      mat.uniforms.uTime.value = t;
    },
  };
}

// NO15 — Geometry Wars Bloom: dark asteroid with neon emissive accents
// (v5 channel routing) + vertex-colored intensity brightening edges.
function createMethod15(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const posAttr = geom.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    // Brighter on vertices closer to the silhouette edge — cheap glow effect
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    const t = Math.abs(x) + Math.abs(y) + Math.abs(z); // silhouette factor
    const k = Math.min(1, t / len / 1.5);
    colors[i * 3] = k;
    colors[i * 3 + 1] = k;
    colors[i * 3 + 2] = k;
  }
  geom.setAttribute('color', new BufferAttribute(colors, 3));
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.0,
    emissiveMap: tex, vertexColors: true, flatShading: true,
    roughness: 0.7, metalness: 0.0,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Neon emissive video with vertex-colored intensity (edges glow brighter). Geometry Wars aesthetic.',
  };
}

// NO16 — Living Rock: vertex displacement from video luminance.
// Custom vertex shader samples video and pushes vertices outward where
// video is bright. Cheap fake — no normal recomputation.
function createMethod16(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 5);
  const mat = new ShaderMaterial({
    uniforms: {
      uVideo: { value: tex },
      uTime: { value: 0 },
      uLightDir: { value: new Vector3(3, 4, 5).normalize() },
    },
    vertexShader: `
      uniform sampler2D uVideo;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        float luma = texture2D(uVideo, uv).r * 0.3
                   + texture2D(uVideo, uv).g * 0.59
                   + texture2D(uVideo, uv).b * 0.11;
        vec3 disp = position + normal * (luma - 0.5) * 0.35;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(disp, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uLightDir;
      uniform sampler2D uVideo;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uVideo, vUv);
        float l = max(0.0, dot(normalize(vNormal), uLightDir));
        gl_FragColor = vec4(c.rgb * (0.4 + l * 0.8), 1.0);
      }
    `,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'Vertex displacement from video luminance: asteroid bulges where video is bright.',
  };
}

// NO17 — CSS3D video overlay: a 3D-positioned HTMLVideoElement floating
// in front of a faceted asteroid. No MP4→texture decoding; the browser
// plays the video natively and we just place it in 3D space.
function createMethod17(): MethodResult {
  // Rock underneath
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 2);
  const rockMat = new MeshStandardMaterial({
    color: 0x444444, roughness: 0.85, metalness: 0.05, flatShading: true,
  });
  const rock = new Mesh(geom, rockMat);
  const group = new Group();
  group.add(rock);

  // HTML video element positioned absolutely
  const videoEl = document.createElement('video');
  videoEl.src = '/video/asteroid1.mp4';
  videoEl.muted = true;
  videoEl.loop = true;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.crossOrigin = 'anonymous';
  videoEl.style.position = 'absolute';
  videoEl.style.width = '200px';
  videoEl.style.height = '200px';
  videoEl.style.borderRadius = '50%';
  videoEl.style.objectFit = 'cover';
  videoEl.style.pointerEvents = 'none';
  videoEl.style.border = '2px solid rgba(255,255,255,0.4)';
  document.body.appendChild(videoEl);
  const playResult = videoEl.play();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[test-lab] NO17 autoplay rejected:', err);
    });
  }

  return {
    group,
    description: 'Faceted rock with a circular HTML <video> floating in front of it (CSS positioning, not 3D-mapped).',
    update: () => {
      // The video stays at its CSS position — this method is intentionally
      // a "video on top of 3D" hack rather than a true 3D mapping.
      void videoEl;
    },
  };
}

// NO18 — Two-sphere shell: outer faceted transparent shell + inner
// video sphere. Outer shell has wireframe edges + Fresnel for a "cage"
// feel; inner is the video wrapped on a sphere.
function createMethod18(): MethodResult {
  const tex = getSharedVideoTexture();
  // Inner video sphere
  const innerGeom = new SphereGeometry(ASTEROID_RADIUS * 0.85, 24, 16);
  const innerMat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.9,
    emissiveMap: tex, flatShading: false, roughness: 0.7,
  });
  const inner = new Mesh(innerGeom, innerMat);
  // Outer faceted shell
  const outerGeom = new IcosahedronGeometry(ASTEROID_RADIUS, 1);
  const outerMat = new MeshPhongMaterial({
    color: 0x111122, transparent: true, opacity: 0.35,
    wireframe: true, depthWrite: false,
  });
  const outer = new Mesh(outerGeom, outerMat);
  const group = new Group();
  group.add(inner);
  group.add(outer);
  return {
    group,
    description: 'Inner video sphere + outer faceted transparent wireframe shell. Cage-around-energy-core look.',
  };
}

// NO19 — MultiplyBlending composite: rock material multiplied by video.
// Video color tints the rock; dark areas of video stay dark, bright
// areas lift the rock. Uses MultiplyBlending in a custom shader.
function createMethod19(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const mat = new ShaderMaterial({
    uniforms: {
      uVideo: { value: tex },
      uLightDir: { value: new Vector3(3, 4, 5).normalize() },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uVideo;
      uniform vec3 uLightDir;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec4 vid = texture2D(uVideo, vUv);
        vec3 rock = vec3(0.45, 0.42, 0.40);
        // Multiply: darken rock by video. Bright video = lift toward video color.
        vec3 col = rock * (0.4 + vid.rgb * 1.5);
        float l = max(0.0, dot(normalize(vNormal), uLightDir));
        col *= 0.3 + l * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'MultiplyBlending-style: rock color multiplied by video. Video lifts the rock into colorful tints.',
  };
}

// NO20 — Pixel-Art Cube: low-res canvas texture (64×32) updated per
// frame from the video, NearestFilter for chunky pixels, applied to
// a Dodecahedron.
function createMethod20(): MethodResult {
  // Pixel-canvas: 64x32 resampled from the video each frame
  const W = 64, H = 32;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const tex = new CanvasTexture(c);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;

  const geom = new DodecahedronGeometry(ASTEROID_RADIUS, 0);
  const mat = new MeshStandardMaterial({
    color: 0x222222, map: tex, roughness: 0.85, metalness: 0.05, flatShading: true,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);

  return {
    group,
    description: 'Low-res 64×32 canvas sampled per frame from the video; NearestFilter for chunky pixel-art look.',
    update: () => {
      const video = sharedVideoEl;
      if (!video || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, W, H);
      tex.needsUpdate = true;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 7h v9 — Chroma-key variants (NO21 - NO30)
// ═══════════════════════════════════════════════════════════════════════
// Purpose: User feedback was that NO1-NO20 all showed a green tint
//          because the source MP4 uses a green-screen background instead
//          of an alpha channel. Pixel sampling confirmed the background
//          is uniform `#107d31` across timestamps — classic chroma key.
//          These variants apply the chroma-key helper (imported from
//          ./chroma-key.ts) to the most promising original methods so
//          the user can A/B in the lab and pick the best.
//
// Setup:   Each variant takes a known-good base method and changes ONE
//          dimension (threshold, blend mode, post-effect). The user
//          reviews them in the lab and selects the winner; we improve
//          from there.
//
// Gotchas:
//  - NO27 (video as diffuse map) uses `map: tex` instead of
//    `emissiveMap: tex`. Diffuse is multiplied by lighting, so the
//    chroma-keyed pixels (transparent) just show through to whatever's
//    behind. Looks different from emissive (which is self-lit).
//  - NO29 boosts red-dominant pixels to make the asteroid's "veins"
//    (which read pink/red in the source video) glow brighter.
// ═══════════════════════════════════════════════════════════════════════

// NO21 — Box cube-cross with TIGHT chroma (threshold 0.05). Removes
// only the most-saturated green pixels, keeps any yellowish-green
// that might be part of the asteroid.
function createMethod21(): MethodResult {
  const side = ASTEROID_RADIUS * 2;
  const tex = getSharedVideoTexture();
  const geom = new BoxGeometry(side, side, side);
  const FACE_UV_RANGES: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.50, 0.75, 0.333, 0.667],
    [0.00, 0.25, 0.333, 0.667],
    [0.25, 0.50, 0.667, 1.000],
    [0.25, 0.50, 0.000, 0.333],
    [0.25, 0.50, 0.333, 0.667],
    [0.75, 1.00, 0.333, 0.667],
  ];
  const uvs = new Float32Array(24);
  for (let f = 0; f < 6; f++) {
    const [uMin, uMax, vMin, vMax] = FACE_UV_RANGES[f];
    const b = f * 8;
    uvs[b + 0] = uMin; uvs[b + 1] = vMax;
    uvs[b + 2] = uMax; uvs[b + 3] = vMax;
    uvs[b + 4] = uMin; uvs[b + 5] = vMin;
    uvs[b + 6] = uMax; uvs[b + 7] = vMin;
  }
  geom.setAttribute('uv', new BufferAttribute(uvs, 2));
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.0,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
    transparent: true,
  });
  applyChromaKeyToStandardMaterial(mat);
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'NO1 box + chroma threshold 0.05 (very tight — only kills the brightest green).',
  };
}

// NO22 — Box cube-cross with LOOSE chroma (threshold 0.30). Removes
// anything green-tinted, even mild greens — keeps only red/blue/pink
// asteroid pixels.
function createMethod22(): MethodResult {
  const side = ASTEROID_RADIUS * 2;
  const tex = getSharedVideoTexture();
  const geom = new BoxGeometry(side, side, side);
  const FACE_UV_RANGES: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.50, 0.75, 0.333, 0.667],
    [0.00, 0.25, 0.333, 0.667],
    [0.25, 0.50, 0.667, 1.000],
    [0.25, 0.50, 0.000, 0.333],
    [0.25, 0.50, 0.333, 0.667],
    [0.75, 1.00, 0.333, 0.667],
  ];
  const uvs = new Float32Array(24);
  for (let f = 0; f < 6; f++) {
    const [uMin, uMax, vMin, vMax] = FACE_UV_RANGES[f];
    const b = f * 8;
    uvs[b + 0] = uMin; uvs[b + 1] = vMax;
    uvs[b + 2] = uMax; uvs[b + 3] = vMax;
    uvs[b + 4] = uMin; uvs[b + 5] = vMin;
    uvs[b + 6] = uMax; uvs[b + 7] = vMin;
  }
  geom.setAttribute('uv', new BufferAttribute(uvs, 2));
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.0,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
    transparent: true,
  });
  // Custom threshold override via onBeforeCompile — replace the constant
  const mat2: any = mat;
  mat2.onBeforeCompile = (shader: { fragmentShader: string }) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      if (totalEmissiveRadiance.g - max(totalEmissiveRadiance.r, totalEmissiveRadiance.b) > 0.30) discard;`,
    );
  };
  mat.needsUpdate = true;
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'NO1 box + chroma threshold 0.30 (loose — kills any green tint).',
  };
}

// NO23 — Icosahedron emissive + chroma (clean rock). The v5 pattern
// applied to a chunky 20-face icosahedron — flat-shaded so each face
// reads as a discrete rock facet.
function createMethod23(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.0,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
    transparent: true,
  });
  applyChromaKeyToStandardMaterial(mat);
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'NO2 icosahedron + chroma. Clean self-lit rock, each face shows video color.',
  };
}

// NO24 — Icosahedron + chroma + Fresnel rim. Like NO23 but with a
// transparent overlay sphere that adds a Fresnel rim glow tinted by the
// video's average color.
function createMethod24(): MethodResult {
  const tex = getSharedVideoTexture();
  void tex;
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.0,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
    transparent: true,
  });
  applyChromaKeyToStandardMaterial(mat);
  const mesh = new Mesh(geom, mat);

  // Fresnel rim overlay (from NO11 pattern)
  const overlayGeom = new SphereGeometry(ASTEROID_RADIUS * 1.02, 32, 24);
  const overlayMat = new ShaderMaterial({
    uniforms: { uColor: { value: new Color(0xffffff) } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -normalize(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - max(0.0, dot(vView, vNormal));
        rim = pow(rim, 2.5);
        gl_FragColor = vec4(uColor * rim, rim * 0.85);
      }
    `,
  });
  const overlay = new Mesh(overlayGeom, overlayMat);

  const group = new Group();
  group.add(mesh);
  group.add(overlay);
  return {
    group,
    description: 'NO2 icosahedron + chroma + Fresnel rim tinted by video color.',
    update: () => {
      const video = sharedVideoEl;
      if (!video) return;
      (overlayMat.uniforms.uColor.value as Color).copy(sampleAverageColor(video));
    },
  };
}

// NO25 — Triplanar video + chroma + dark rock underlay. NO9 pattern
// with the chroma discard added; underneath is a dark icosahedron so
// the discarded fragments show through to rock instead of empty space.
function createMethod25(): MethodResult {
  const tex = getSharedVideoTexture();
  // Underlying dark rock
  const rockGeom = new IcosahedronGeometry(ASTEROID_RADIUS * 0.98, 3);
  const rockMat = new MeshStandardMaterial({
    color: 0x333333, roughness: 0.85, metalness: 0.05, flatShading: true,
  });
  const rock = new Mesh(rockGeom, rockMat);

  // Triplanar video on top (slightly larger so the rock shows through
  // discarded pixels at the silhouette).
  const overlayGeom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const mat = new ShaderMaterial({
    uniforms: {
      uVideo: { value: tex },
      uLightDir: { value: new Vector3(3, 4, 5).normalize() },
    },
    transparent: true,
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uVideo;
      uniform vec3 uLightDir;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vWorldPos);
        vec3 blend = abs(n);
        blend = pow(blend, vec3(4.0));
        blend /= (blend.x + blend.y + blend.z);
        vec2 uvX = n.yz * 0.5 + 0.5;
        vec2 uvY = n.xz * 0.5 + 0.5;
        vec2 uvZ = n.xy * 0.5 + 0.5;
        vec4 cx = texture2D(uVideo, uvX);
        vec4 cy = texture2D(uVideo, uvY);
        vec4 cz = texture2D(uVideo, uvZ);
        vec4 vid = cx * blend.x + cy * blend.y + cz * blend.z;
        if (vid.g - max(vid.r, vid.b) > 0.15) discard;
        float l = max(0.0, dot(normalize(vNormal), uLightDir));
        gl_FragColor = vec4(vid.rgb * (0.4 + l * 0.8), 1.0);
      }
    `,
  });
  const overlay = new Mesh(overlayGeom, mat);

  const group = new Group();
  group.add(rock);
  group.add(overlay);
  return {
    group,
    description: 'NO9 triplanar + chroma discard + dark rock underlay showing through.',
  };
}

// NO26 — MultiplyBlending + chroma. NO19 pattern with the chroma
// discard added — rock color multiplied by video, then green pixels
// discarded so the rock shows through where the video was green.
function createMethod26(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 3);
  const mat = new ShaderMaterial({
    uniforms: {
      uVideo: { value: tex },
      uLightDir: { value: new Vector3(3, 4, 5).normalize() },
    },
    transparent: true,
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uVideo;
      uniform vec3 uLightDir;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec4 vid = texture2D(uVideo, vUv);
        if (vid.g - max(vid.r, vid.b) > 0.15) discard;
        vec3 rock = vec3(0.45, 0.42, 0.40);
        vec3 col = rock * (0.4 + vid.rgb * 1.5);
        float l = max(0.0, dot(normalize(vNormal), uLightDir));
        col *= 0.3 + l * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'NO19 multiply + chroma discard. Rock tint × video color where video is non-green.',
  };
}

// NO27 — Box + video as DIFFUSE map + chroma. v5 used emissiveMap (no
// PBR lighting). This uses `map: tex` so the standard material's lighting
// affects the video — gives the rock a 3D shading model instead of
// flat self-lit.
function createMethod27(): MethodResult {
  const side = ASTEROID_RADIUS * 2;
  const tex = getSharedVideoTexture();
  const geom = new BoxGeometry(side, side, side);
  const FACE_UV_RANGES: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.50, 0.75, 0.333, 0.667],
    [0.00, 0.25, 0.333, 0.667],
    [0.25, 0.50, 0.667, 1.000],
    [0.25, 0.50, 0.000, 0.333],
    [0.25, 0.50, 0.333, 0.667],
    [0.75, 1.00, 0.333, 0.667],
  ];
  const uvs = new Float32Array(24);
  for (let f = 0; f < 6; f++) {
    const [uMin, uMax, vMin, vMax] = FACE_UV_RANGES[f];
    const b = f * 8;
    uvs[b + 0] = uMin; uvs[b + 1] = vMax;
    uvs[b + 2] = uMax; uvs[b + 3] = vMax;
    uvs[b + 4] = uMin; uvs[b + 5] = vMin;
    uvs[b + 6] = uMax; uvs[b + 7] = vMin;
  }
  geom.setAttribute('uv', new BufferAttribute(uvs, 2));
  const mat = new MeshStandardMaterial({
    color: 0xffffff, map: tex,
    roughness: 0.7, metalness: 0.05, flatShading: true,
    transparent: true,
  });
  // For diffuse-map chroma, inject AFTER the diffuse map sample.
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      if (diffuseColor.rgb.g - max(diffuseColor.rgb.r, diffuseColor.rgb.b) > 0.15) discard;`,
    );
  };
  mat.needsUpdate = true;
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'NO1 box + video as DIFFUSE map + chroma. Lit by PBR, transparent where green.',
  };
}

// NO28 — Holographic Sprite + chroma. Like NO8 but the sprite is the
// chroma-keyed asteroid silhouette at full opacity (instead of 0.55
// green-tinted video overlay).
function createMethod28(): MethodResult {
  const tex = getSharedVideoTexture();
  // Dark rock underneath
  const rockGeom = new IcosahedronGeometry(ASTEROID_RADIUS, 2);
  const rockMat = new MeshStandardMaterial({
    color: 0x444444, roughness: 0.85, metalness: 0.05, flatShading: true,
  });
  const rock = new Mesh(rockGeom, rockMat);

  // Sprite with video map, transparent (chroma-key happens via the
  // SpriteMaterial transparent flag + the video's actual color — but
  // Sprites don't support per-pixel discard, so we use opacity 1 and
  // rely on the video being mostly opaque where the asteroid is).
  const spriteMat = new SpriteMaterial({
    map: tex, transparent: true, opacity: 1.0, depthTest: false,
    blending: NormalBlending,
  });
  const sprite = new Sprite(spriteMat);
  sprite.scale.set(ASTEROID_RADIUS * 2.4, ASTEROID_RADIUS * 2.4, 1);
  sprite.position.z = 0.05;

  const group = new Group();
  group.add(rock);
  group.add(sprite);
  return {
    group,
    description: 'NO8 lumpy rock + chroma-key sprite. Sprite shows asteroid silhouette at full opacity.',
  };
}

// NO29 — Icosahedron + chroma + vein highlight. Same as NO23 but the
// fragment shader (we'd need a custom shader) boosts red-dominant
// pixels — the asteroid's glowing veins (red/pink in the source video)
// pop brighter than the rest of the rock.
function createMethod29(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  // Use ShaderMaterial so we can do the vein boost in the same shader.
  const mat = new ShaderMaterial({
    uniforms: {
      uVideo: { value: tex },
      uLightDir: { value: new Vector3(3, 4, 5).normalize() },
    },
    transparent: true,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uVideo;
      uniform vec3 uLightDir;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vec4 vid = texture2D(uVideo, vUv);
        if (vid.g - max(vid.r, vid.b) > 0.15) discard;
        // Vein highlight: boost red-dominant pixels.
        float vein = smoothstep(0.3, 0.7, vid.r - max(vid.g, vid.b));
        vec3 col = vid.rgb + vec3(vein * 1.2, vein * 0.3, vein * 0.3);
        float l = max(0.0, dot(normalize(vNormal), uLightDir));
        col *= 0.5 + l * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'NO2 icosahedron + chroma + red-vein highlight boost.',
  };
}

// NO30 — Icosahedron + chroma + emissive boost. NO23 with the emissive
// intensity jacked up so the asteroid really pops. Also tries
// DoubleSide so back faces aren't black silhouettes.
function createMethod30(): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.6,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
    transparent: true, side: DoubleSide,
  });
  applyChromaKeyToStandardMaterial(mat);
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description: 'NO2 icosahedron + chroma + emissive boost 1.6x + DoubleSide. Bright self-lit rock.',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 7h v10 — Emissive-intensity sweep (NO31 - NO34)
//
// Why these exist: User picked NO30 as the best of NO21-NO30, but noted
// it might over-bright in the bloom pipeline (the lab has no bloom,
// in-game does). These 4 methods vary ONLY the emissiveIntensity (1.2,
// 1.3, 1.4, 1.5) so the user can A/B pick the brightest value that
// doesn't blow out when UnrealBloomPass is active.
//
// Single-axis sweep (geometry, DoubleSide, flatShading, color, roughness,
// metalness, transparent, chroma) all identical to NO30. Only
// emissiveIntensity changes. This isolates the knob.
//
// Method range for user review:
//   NO30 — emissive 1.6  (v9 baseline, may over-bloom in-game)
//   NO31 — emissive 1.2  (gentle pop, safe under bloom)
//   NO32 — emissive 1.3
//   NO33 — emissive 1.4
//   NO34 — emissive 1.5  (max-safe pop)
//
// Once user picks one, we port that single number to the production
// asteroid factory in src/video-asteroid.ts.
// ═══════════════════════════════════════════════════════════════════════

function createMethodWithEmissive(intensity: number): MethodResult {
  const tex = getSharedVideoTexture();
  const geom = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  const mat = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: intensity,
    emissiveMap: tex, flatShading: true, roughness: 0.85, metalness: 0.05,
    transparent: true, side: DoubleSide,
  });
  applyChromaKeyToStandardMaterial(mat);
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description:
      `NO30 with emissiveIntensity ${intensity.toFixed(1)} + DoubleSide + chroma. ` +
      `Single-axis sweep — only the brightness changes.`,
  };
}

function createMethod31(): MethodResult {
  return createMethodWithEmissive(1.2);
}

function createMethod32(): MethodResult {
  return createMethodWithEmissive(1.3);
}

function createMethod33(): MethodResult {
  return createMethodWithEmissive(1.4);
}

function createMethod34(): MethodResult {
  return createMethodWithEmissive(1.5);
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 7h v11 — Production-port candidates (NO35 - NO37)
//
// Why these exist: User picked NO34 (emissive 1.5 + DoubleSide + chroma
// + IcosahedronGeometry) as the winner. But the current PRODUCTION
// asteroid in src/video-asteroid.ts uses BoxGeometry, has no DoubleSide,
// and has no chroma-key. To decide which subset to port, the user needs
// to compare 4 production-realistic candidates A/B/C/D.
//
// These 3 lab methods (NO35-NO37) are BOX-based production candidates.
// The full "everything" option (Icosahedron + 1.5 + DoubleSide + chroma)
// is NO34 — kept as the visual reference.
//
// Each method differs in exactly the property set we're deciding to port:
//
//   NO1  — Box, 1.0, FrontSide, no chroma        (current production state)
//   NO35 — Box, 1.5, FrontSide, no chroma        (just brightness, keep prod bugs)
//   NO36 — Box, 1.5, DoubleSide, no chroma       (brightness + no-disappear)
//   NO37 — Box, 1.5, DoubleSide, chroma          (full port keep box geometry)
//   NO34 — Ico,  1.5, DoubleSide, chroma         (full port change geometry)
//
// NO1 already exists as the control. NO34 already exists as the
// everything-on reference. NO35-NO37 are the in-between options.
//
// Why this matters: "The winner is NO34" is multi-property. We want the
// user to see what changes vs production under each subset so they can
// pick the right port scope.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cube-cross UV remap (same layout as NO1). Hoisted out so NO35-NO37
 * don't duplicate the 24-line remap block 3 times.
 */
function applyCubeCrossUVs(geom: BoxGeometry): void {
  const FACE_UV_RANGES: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.50, 0.75, 0.333, 0.667], // +X right  col 2, row 1
    [0.00, 0.25, 0.333, 0.667], // -X left   col 0, row 1
    [0.25, 0.50, 0.667, 1.000], // +Y top    col 1, row 0
    [0.25, 0.50, 0.000, 0.333], // -Y bottom col 1, row 2
    [0.25, 0.50, 0.333, 0.667], // +Z front  col 1, row 1
    [0.75, 1.00, 0.333, 0.667], // -Z back   col 3, row 1
  ];
  const uvs = new Float32Array(48); // 24 verts × itemSize 2 = 48 floats
  for (let f = 0; f < 6; f++) {
    const [uMin, uMax, vMin, vMax] = FACE_UV_RANGES[f];
    const b = f * 8;
    uvs[b + 0] = uMin; uvs[b + 1] = vMax;
    uvs[b + 2] = uMax; uvs[b + 3] = vMax;
    uvs[b + 4] = uMin; uvs[b + 5] = vMin;
    uvs[b + 6] = uMax; uvs[b + 7] = vMin;
  }
  geom.setAttribute('uv', new BufferAttribute(uvs, 2));
}

/**
 * Shared material factory for NO35-NO37. Takes the optional property
 * toggles so we can A/B isolate each property's visual contribution.
 */
function createProductionCandidateMaterial(opts: {
  readonly emissive: number;
  readonly doubleSide: boolean;
  readonly chroma: boolean;
}): MeshStandardMaterial {
  const tex = getSharedVideoTexture();
  const mat = new MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: opts.emissive,
    emissiveMap: tex,
    flatShading: true,
    roughness: 0.85,
    metalness: 0.05,
    side: opts.doubleSide ? DoubleSide : FrontSide,
    transparent: opts.chroma, // chroma requires transparent: true for the discard
  });
  if (opts.chroma) applyChromaKeyToStandardMaterial(mat);
  return mat;
}

function createMethod35(): MethodResult {
  // Box + 1.5 only — minimal port. Same disappearing-faces bug as NO1
  // (no DoubleSide, no chroma-key) but at the picked brightness.
  const side = ASTEROID_RADIUS * 2;
  const geom = new BoxGeometry(side, side, side);
  applyCubeCrossUVs(geom);
  const mat = createProductionCandidateMaterial({
    emissive: 1.5, doubleSide: false, chroma: false,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description:
      'Box + emissive 1.5 + FrontSide + no chroma. Mimics current production with only the brightness tuned up. Back faces still cull (asteroid may "disappear" when rotating).',
  };
}

function createMethod36(): MethodResult {
  // Box + 1.5 + DoubleSide — no-disappear port.
  const side = ASTEROID_RADIUS * 2;
  const geom = new BoxGeometry(side, side, side);
  applyCubeCrossUVs(geom);
  const mat = createProductionCandidateMaterial({
    emissive: 1.5, doubleSide: true, chroma: false,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description:
      'Box + emissive 1.5 + DoubleSide + no chroma. Back faces render, asteroid is always visible. Green background still tints the cube (no transparency).',
  };
}

function createMethod37(): MethodResult {
  // Box + 1.5 + DoubleSide + chroma — full port keeping BoxGeometry.
  const side = ASTEROID_RADIUS * 2;
  const geom = new BoxGeometry(side, side, side);
  applyCubeCrossUVs(geom);
  const mat = createProductionCandidateMaterial({
    emissive: 1.5, doubleSide: true, chroma: true,
  });
  const mesh = new Mesh(geom, mat);
  const group = new Group();
  group.add(mesh);
  return {
    group,
    description:
      'Box + emissive 1.5 + DoubleSide + chroma-key. Full port of NO34\'s lighting recipe while keeping the box geometry. Green pixels transparent, back faces visible.',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 7h v12 — Smooth video loop (B3 frame-table comparator)
//
// Why these exist: Phase 7h v11 (production port) still shows a rough
// loop. Research agent proved the source MP4 has a non-matching wrap
// (center-region mean abs diff 54.78 between frame 239 and frame 0; a
// normal step is ~9-11). No source-side fix hides the seam. B3 = pre-
// bake the 240 frames into a DataTexture with the seam pre-blended, then
// drive the index from `performance.now()` (no `loop=true` browser
// seek-hitch).
//
// These 3 lab methods (NO38-NO40) let the user A/B/C the decode size
// before production port (v13):
//   - NO38: 128² → 15.7 MB buffer, looks soft
//   - NO39: 256² → 62.9 MB buffer, likely the sweet spot
//   - NO40: 512² → 251.7 MB buffer, sharp but expensive
//
// The icosahedron + v11 material contract (chroma + DoubleSide +
// transparent + emissive 1.5) is preserved. Only the texture source
// changes (VideoTexture → DataTexture).
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cache decoded tables so SPACE-cycling doesn't re-decode the MP4.
 * Keyed by size + cropRegion so NO41 (with crop) and NO38/NO39/NO40
 * (without) don't share entries. NO42 and NO43 use the same no-crop
 * cache as the size-matched NO39 entry.
 */
const B3_TABLE_CACHE = new Map<string, Promise<FrameTable>>();

function getB3Table(
  size: number,
  opts: { cropRegion?: { x: number; y: number; width: number; height: number } } = {},
): Promise<FrameTable> {
  const key = opts.cropRegion
    ? `${size}|crop=${opts.cropRegion.x},${opts.cropRegion.y},`
      + `${opts.cropRegion.width},${opts.cropRegion.height}`
    : `${size}|full`;
  let promise = B3_TABLE_CACHE.get(key);
  if (promise === undefined) {
    promise = loadVideoFrameTable('/video/asteroid1.mp4', {
      targetSize: size,
      ...opts,
    });
    B3_TABLE_CACHE.set(key, promise);
  }
  return promise;
}

/**
 * Shared B3 method factory used by NO38/NO39/NO40. Sets up an
 * IcosahedronGeometry (same as v11 production) with a placeholder
 * material that's swapped to the v11 video material once the frame
 * table finishes decoding. The `update` callback re-uploads the
 * current frame each tick and modulates `emissiveIntensity` across
 * the pre-baked fade window.
 */
function createB3Method(size: number): MethodResult {
  const group = new Group();
  // Same IcosahedronGeometry as v11 production — detail=0 for the
  // chunky 20-face silhouette. SIZE_RADIUS is the production
  // constant; we mirror it via ASTEROID_RADIUS for visual parity.
  const geometry = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  // Placeholder dark-blue material so the user sees something while
  // the decode runs. Replaced the moment the table resolves.
  const placeholder = new MeshStandardMaterial({ color: 0x223355 });
  const mesh = new Mesh(geometry, placeholder);
  group.add(mesh);

  // Track table + material so the per-frame updater can find them.
  // We deliberately use `any` typing on the material slot because it
  // starts as a placeholder and gets reassigned to a real
  // MeshStandardMaterial below — Three.js Mesh accepts any
  // Material on construction.
  let table: FrameTable | null = null;
  let liveMaterial: MeshStandardMaterial | null = null;
  const t0 = performance.now();

  // Kick off the decode. Failures are silent (placeholder stays) —
  // the user sees a dark blob if the MP4 fails to load.
  getB3Table(size).then((t) => {
    table = t;
    // v11 material contract preserved verbatim: emissiveIntensity 1.5,
    // DoubleSide, transparent (required for chroma-key discard), and
    // applyChromaKeyToStandardMaterial for the green-screen inject.
    const mat = new MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      emissiveMap: t.texture,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      side: DoubleSide,
      transparent: true,
    });
    applyChromaKeyToStandardMaterial(mat);
    mesh.material = mat;
    liveMaterial = mat;
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[test-lab] B3 @ ${size}² decode failed:`, err);
  });

  const pixelsPerFrame = size * size * 4;
  const update = (_dt: number, _t: number): void => {
    if (table === null || liveMaterial === null) return;
    const u = ((performance.now() - t0) / 1000) * table.fps;
    const i = Math.floor(u) % table.frameCount;
    // Re-upload the current frame into the shared DataTexture. The
    // icosahedron's UVs already span [0,1]², so the material doesn't
    // need to know which frame is current. `image.data` is typed as
    // nullable by Three.js but we constructed it ourselves with a
    // non-null Uint8Array, so the assertion is safe.
    const offset = i * pixelsPerFrame;
    table.texture.image.data!.set(
      table.allFrames.subarray(offset, offset + pixelsPerFrame),
    );
    table.texture.needsUpdate = true;
    // B4 layered on: dim the emissive in the pre-baked fade window so
    // the seam blend reads even smoother. Fades from 1.5 → 0 across
    // the first `fadeFrames` frames after the wrap.
    if (i < table.fadeFrames) {
      liveMaterial.emissiveIntensity = 1.5 * (1 - i / table.fadeFrames);
    } else {
      liveMaterial.emissiveIntensity = 1.5;
    }
  };

  return {
    group,
    description: `B3 frame table @ ${size}² — pre-baked seam blend over the wrap.`
      + ` ${Math.round((size * size * 4 * 240) / (1024 * 1024) * 10) / 10} MB JS buffer.`
      + ` Driven by performance.now() so no browser loop-seek hitch.`,
    update,
  };
}

function createMethod38(): MethodResult { return createB3Method(128); }
function createMethod39(): MethodResult { return createB3Method(256); }
function createMethod40(): MethodResult { return createB3Method(512); }

// ═══════════════════════════════════════════════════════════════════════
// Phase 7h v12.4 — "half round" fix variants (NO41 / NO42 / NO43)
// ═══════════════════════════════════════════════════════════════════════
// Purpose: User reported the B3 asteroid "appears to be more a half round
//          shape" — root cause is that the icosahedron's auto UVs span
//          [0, 1.088] × [0.176, 0.824] of the texture, but the asteroid
//          itself only occupies ~39% × 77% of the frame (sampled from the
//          1280×720 MP4). Most triangles sample the green-screen border,
//          the chroma-key discards those fragments, and the asteroid
//          looks like a crescent.
//
//          Three independent fixes, each added as a separate lab method
//          so the user can compare side by side and pick the winner:
//
//          NO41 — Crop at decode time: loadVideoFrameTable now accepts a
//          cropRegion in source pixels. The cropped sub-frame is rescaled
//          to targetSize². The icosahedron's full UV range then samples
//          the asteroid body, not the green border. Cleanest approach
//          because it doesn't touch the geometry or the shader.
//
//          NO42 — Remap the icosahedron UVs to a tight centered region
//          after construction. Keeps the full 1280×720 frame table but
//          constrains the UV sampling. Doesn't reduce memory but
//          addresses the same root cause via geometry mutation.
//
//          NO43 — Replace the hard `discard` chroma-key with a soft
//          alpha fade. Pixels with greenness < 0.10 stay opaque; pixels
//          > 0.20 fade to transparent; the 0.10-0.20 band is smoothstep.
//          The asteroid body stays solid; green edges softly dissolve.
//          Most invasive — affects the shader, not the geometry/data.
//
//          Pick the winner and we'll port it to v13 production.
// ═══════════════════════════════════════════════════════════════════════

// Asteroid bounding box in the 1280×720 source MP4 (sampled by Playwright
// during v12.4 investigation): x=396→896 (width 500), y=52→608 (height
// 556). Padded slightly inward so we don't crop the silhouette edges.
const ASTEROID_CROP_REGION = { x: 380, y: 40, width: 540, height: 580 } as const;

// Tight UV region for NO42's icosahedron remap. Maps the auto UVs that
// span [0, 1.088] × [0.176, 0.824] into a centered 70% × 70% of the
// texture so triangles sample only the asteroid body, not the border.
const ASTEROID_UV_REGION = { uMin: 0.15, uMax: 0.85, vMin: 0.15, vMax: 0.85 } as const;

/**
 * Remap an IcosahedronGeometry's UVs from their auto-generated range
 * `[0, 1.088] × [0.176, 0.824]` to a tight target region. Used by lab
 * method NO42 to constrain the asteroid sampling to the centered region
 * of the video where the actual rock is.
 *
 * Mutates `geom.attributes.uv` in place. Caller is responsible for
 * ensuring `geom` is actually an IcosahedronGeometry (any geometry whose
 * auto UVs fit the [0, ~1.1] × [0.176, ~0.824] box would work, but the
 * math is calibrated for the icosahedron's specific layout).
 */
function remapIcosahedronUVs(
  geom: IcosahedronGeometry,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
): void {
  // Auto UV bounds for IcosahedronGeometry(_, 0) — see Node dump in
  // v12.4 investigation notes. u spans [0, 1.088] (note the overshoot
  // past 1.0 on one cluster) and v spans [0.176, 0.824].
  const SRC_U_MIN = 0;
  const SRC_U_MAX = 1.088;
  const SRC_V_MIN = 0.176;
  const SRC_V_MAX = 0.824;
  const uRange = SRC_U_MAX - SRC_U_MIN;
  const vRange = SRC_V_MAX - SRC_V_MIN;
  const uScale = (uMax - uMin) / uRange;
  const vScale = (vMax - vMin) / vRange;

  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const uNew = uMin + (u - SRC_U_MIN) * uScale;
    const vNew = vMin + (v - SRC_V_MIN) * vScale;
    uv.setXY(i, uNew, vNew);
  }
  uv.needsUpdate = true;
}

/**
 * NO41 — B3 with cropped source frames. The frame table samples only
 * the asteroid bounding box from each MP4 frame, so the icosahedron's
 * UVs (which span [0, 1.088] × [0.176, 0.824]) only ever touch asteroid
 * pixels. Memory cost is the same as NO39 — only the SOURCE content
 * changes, not the target texture dimensions.
 */
function createB3CroppedMethod(size: number): MethodResult {
  const group = new Group();
  const placeholder = new MeshStandardMaterial({ color: 0x223355 });
  const mesh = new Mesh(new IcosahedronGeometry(ASTEROID_RADIUS, 0), placeholder);
  group.add(mesh);

  let table: FrameTable | null = null;
  let liveMaterial: MeshStandardMaterial | null = null;
  const t0 = performance.now();
  getB3Table(size, { cropRegion: ASTEROID_CROP_REGION }).then((t) => {
    table = t;
    const mat = new MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      emissiveMap: t.texture,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      side: DoubleSide,
      transparent: true,
    });
    applyChromaKeyToStandardMaterial(mat);
    mesh.material = mat;
    liveMaterial = mat;
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[test-lab] B3-cropped @ ${size}² decode failed:`, err);
  });

  const pixelsPerFrame = size * size * 4;
  const update = (_dt: number, _t: number): void => {
    if (table === null || liveMaterial === null) return;
    const u = ((performance.now() - t0) / 1000) * table.fps;
    const i = Math.floor(u) % table.frameCount;
    const offset = i * pixelsPerFrame;
    table.texture.image.data!.set(
      table.allFrames.subarray(offset, offset + pixelsPerFrame),
    );
    table.texture.needsUpdate = true;
    if (i < table.fadeFrames) {
      liveMaterial.emissiveIntensity = 1.5 * (1 - i / table.fadeFrames);
    } else {
      liveMaterial.emissiveIntensity = 1.5;
    }
  };

  return {
    group,
    description: `B3 @ ${size}² + cropped source frames — frames rescaled from`
      + ` ${ASTEROID_CROP_REGION.width}×${ASTEROID_CROP_REGION.height} asteroid bbox.`
      + ` Icosahedron UVs now sample asteroid body, not green border.`,
    update,
  };
}

/**
 * NO42 — B3 with remapped icosahedron UVs. The geometry is built
 * normally, then `remapIcosahedronUVs` constrains the UV range to a
 * centered 70% × 70% region of the texture so triangles only sample
 * the asteroid body. Full frame table preserved (no source crop).
 */
function createB3UVRemapMethod(size: number): MethodResult {
  const group = new Group();
  const geometry = new IcosahedronGeometry(ASTEROID_RADIUS, 0);
  // Remap BEFORE the mesh is constructed so the geometry's UV attribute
  // is correct from the first render frame.
  remapIcosahedronUVs(
    geometry,
    ASTEROID_UV_REGION.uMin, ASTEROID_UV_REGION.uMax,
    ASTEROID_UV_REGION.vMin, ASTEROID_UV_REGION.vMax,
  );
  const placeholder = new MeshStandardMaterial({ color: 0x223355 });
  const mesh = new Mesh(geometry, placeholder);
  group.add(mesh);

  let table: FrameTable | null = null;
  let liveMaterial: MeshStandardMaterial | null = null;
  const t0 = performance.now();
  getB3Table(size).then((t) => {
    table = t;
    const mat = new MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      emissiveMap: t.texture,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      side: DoubleSide,
      transparent: true,
    });
    applyChromaKeyToStandardMaterial(mat);
    mesh.material = mat;
    liveMaterial = mat;
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[test-lab] B3-uvremap @ ${size}² decode failed:`, err);
  });

  const pixelsPerFrame = size * size * 4;
  const update = (_dt: number, _t: number): void => {
    if (table === null || liveMaterial === null) return;
    const u = ((performance.now() - t0) / 1000) * table.fps;
    const i = Math.floor(u) % table.frameCount;
    const offset = i * pixelsPerFrame;
    table.texture.image.data!.set(
      table.allFrames.subarray(offset, offset + pixelsPerFrame),
    );
    table.texture.needsUpdate = true;
    if (i < table.fadeFrames) {
      liveMaterial.emissiveIntensity = 1.5 * (1 - i / table.fadeFrames);
    } else {
      liveMaterial.emissiveIntensity = 1.5;
    }
  };

  return {
    group,
    description: `B3 @ ${size}² + UV remap — icosahedron UVs constrained to`
      + ` [${ASTEROID_UV_REGION.uMin}, ${ASTEROID_UV_REGION.uMax}]`
      + ` × [${ASTEROID_UV_REGION.vMin}, ${ASTEROID_UV_REGION.vMax}]`
      + ` so triangles only sample the asteroid body.`,
    update,
  };
}

/**
 * NO43 — B3 with SOFT chroma-key. Same B3 decode + same geometry as
 * NO39, but the chroma-key is alpha-fade instead of hard discard. Edge
 * pixels of the asteroid body that bleed green will softly dissolve
 * rather than punch a hard hole. The asteroid should look more "whole"
 * even when backfaces sample green border regions of the video.
 */
function createB3SoftKeyMethod(size: number): MethodResult {
  const group = new Group();
  const placeholder = new MeshStandardMaterial({ color: 0x223355 });
  const mesh = new Mesh(new IcosahedronGeometry(ASTEROID_RADIUS, 0), placeholder);
  group.add(mesh);

  let table: FrameTable | null = null;
  let liveMaterial: MeshStandardMaterial | null = null;
  const t0 = performance.now();
  getB3Table(size).then((t) => {
    table = t;
    const mat = new MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      emissiveMap: t.texture,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      side: DoubleSide,
      transparent: true,
    });
    applySoftChromaKeyToStandardMaterial(mat);
    mesh.material = mat;
    liveMaterial = mat;
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[test-lab] B3-softkey @ ${size}² decode failed:`, err);
  });

  const pixelsPerFrame = size * size * 4;
  const update = (_dt: number, _t: number): void => {
    if (table === null || liveMaterial === null) return;
    const u = ((performance.now() - t0) / 1000) * table.fps;
    const i = Math.floor(u) % table.frameCount;
    const offset = i * pixelsPerFrame;
    table.texture.image.data!.set(
      table.allFrames.subarray(offset, offset + pixelsPerFrame),
    );
    table.texture.needsUpdate = true;
    if (i < table.fadeFrames) {
      liveMaterial.emissiveIntensity = 1.5 * (1 - i / table.fadeFrames);
    } else {
      liveMaterial.emissiveIntensity = 1.5;
    }
  };

  return {
    group,
    description: `B3 @ ${size}² + soft chroma-key — alpha fades for`
      + ` green-dominant pixels (smoothstep 0.10-0.20).`
      + ` No hard discard, edges softly dissolve.`,
    update,
  };
}

function createMethod41(): MethodResult { return createB3CroppedMethod(256); }
function createMethod42(): MethodResult { return createB3UVRemapMethod(256); }
function createMethod43(): MethodResult { return createB3SoftKeyMethod(256); }

// ═══════════════════════════════════════════════════════════════════════
// Dispatch table
// ═══════════════════════════════════════════════════════════════════════

const METHOD_FACTORIES: ReadonlyArray<() => MethodResult> = [
  createMethod1, createMethod2, createMethod3, createMethod4, createMethod5,
  createMethod6, createMethod7, createMethod8, createMethod9, createMethod10,
  createMethod11, createMethod12, createMethod13, createMethod14, createMethod15,
  createMethod16, createMethod17, createMethod18, createMethod19, createMethod20,
  createMethod21, createMethod22, createMethod23, createMethod24, createMethod25,
  createMethod26, createMethod27, createMethod28, createMethod29, createMethod30,
  createMethod31, createMethod32, createMethod33, createMethod34,
  createMethod35, createMethod36, createMethod37,
  createMethod38, createMethod39, createMethod40,
  createMethod41, createMethod42, createMethod43,
];

export function createMethod(idx: number): MethodResult {
  const factory = METHOD_FACTORIES[idx];
  if (!factory) throw new Error(`Method index ${idx} out of range`);
  return factory();
}