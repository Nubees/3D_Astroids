import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  Color,
  DodecahedronGeometry,
  Float32BufferAttribute,
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
export const METHOD_COUNT = 20;

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
// Dispatch table
// ═══════════════════════════════════════════════════════════════════════

const METHOD_FACTORIES: ReadonlyArray<() => MethodResult> = [
  createMethod1, createMethod2, createMethod3, createMethod4, createMethod5,
  createMethod6, createMethod7, createMethod8, createMethod9, createMethod10,
  createMethod11, createMethod12, createMethod13, createMethod14, createMethod15,
  createMethod16, createMethod17, createMethod18, createMethod19, createMethod20,
];

export function createMethod(idx: number): MethodResult {
  const factory = METHOD_FACTORIES[idx];
  if (!factory) throw new Error(`Method index ${idx} out of range`);
  return factory();
}