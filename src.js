import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const root = document.getElementById('lens-app');
const viewport = root.querySelector('#viewport');
const canvas = root.querySelector('#lens-canvas');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x090e13, 0.017);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
camera.position.set(11.9, 7.2, 13.7);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.7;

scene.add(new THREE.AmbientLight(0xc5dbea, 2.0));
const key = new THREE.DirectionalLight(0xffd6ab, 4.2);
key.position.set(4, 8, 10);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6bc9e2, 4);
rim.position.set(-7, -3, -8);
scene.add(rim);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 11;
controls.maxDistance = 31;
controls.maxPolarAngle = Math.PI * .86;
controls.autoRotateSpeed = 0.38;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectable = [];
const parts = [];
const partMap = new Map();
const lensRoot = new THREE.Group();
lensRoot.scale.z = .66;
scene.add(lensRoot);

const MAT = {
  shell: new THREE.MeshStandardMaterial({ color: 0x1d2227, metalness: .18, roughness: .71, side: THREE.DoubleSide }),
  extension: new THREE.MeshStandardMaterial({ color: 0x1d2227, metalness: .22, roughness: .50, side: THREE.DoubleSide }),
  shellDark: new THREE.MeshStandardMaterial({ color: 0x11161a, metalness: .22, roughness: .78, side: THREE.DoubleSide }),
  grip: new THREE.MeshStandardMaterial({ color: 0x323a3f, metalness: .2, roughness: .65 }),
  edge: new THREE.MeshStandardMaterial({ color: 0x343d42, metalness: .38, roughness: .54 }),
  mountSteel: new THREE.MeshStandardMaterial({ color: 0xbec5c8, metalness: .92, roughness: .25 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc59a5b, metalness: .72, roughness: .34 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xaa6e50, metalness: .72, roughness: .34 }),
  board: new THREE.MeshStandardMaterial({ color: 0x265458, metalness: .35, roughness: .55 }),
};
const hoodSurface = new THREE.MeshStandardMaterial({ color: 0x151a1f, metalness: .12, roughness: .79, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false });
const hoodSolid = new THREE.MeshStandardMaterial({ color: 0x161a1e, metalness: .10, roughness: .80, side: THREE.DoubleSide });
const hoodLip = new THREE.MeshStandardMaterial({ color: 0x22282b, metalness: .12, roughness: .73, side: THREE.DoubleSide });

function register(id, group, objects, base, drift, layer) {
  group.position.set(...base);
  group.userData.part = id;
  const item = { id, group, objects, base: new THREE.Vector3(...base), drift: new THREE.Vector3(...drift), layer };
  parts.push(item);
  partMap.set(id, item);
  lensRoot.add(group);
  group.traverse(obj => { if (obj.isMesh) { obj.userData.part = id; selectable.push(obj); } });
  return item;
}

function tube(radius, length, material, thetaStart = 0, thetaLength = Math.PI * 2) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 80, 1, true, thetaStart, thetaLength), material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

// The cutout faces the default camera. At 0% explode, the complete shell is shown.
const cutStart = 2.89;
const cutLength = Math.PI * 2 - 1.52;
function cutTube(radius, length, material) { return tube(radius, length, material, cutStart, cutLength); }

function shellVariants(group, buildFull, buildCut) {
  const full = new THREE.Group();
  const cut = new THREE.Group();
  buildFull(full);
  buildCut(cut);
  group.add(full, cut);
  group.userData.shellVariants = { full, cut };
  return { full, cut };
}

function addGrip(parent, radius, length, cut = false, count = 88) {
  const geometry = new THREE.BoxGeometry(.038, .055, length * .94);
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count;
    const facingCamera = angle > -.02 && angle < 1.52;
    const wrappedFacingCamera = angle > Math.PI * 2 - .02;
    if (cut && (facingCamera || wrappedFacingCamera)) continue;
    const rib = new THREE.Mesh(geometry, MAT.grip);
    rib.position.set(Math.cos(angle) * (radius + .025), Math.sin(angle) * (radius + .025), 0);
    rib.rotation.z = angle;
    parent.add(rib);
  }
}

function decal(text, width, height, radius, angle, axial, size = 42, canvasWidth = 1536) {
  const surface = document.createElement('canvas');
  surface.width = canvasWidth;
  surface.height = 180;
  const ctx = surface.getContext('2d');
  ctx.fillStyle = '#e6e9e7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${size}px Arial, sans-serif`;
  ctx.fillText(text, surface.width / 2, surface.height / 2);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = Math.max(12, Math.ceil(width * 28));
  const arc = width / radius;
  for (let row = 0; row <= 1; row++) {
    for (let col = 0; col <= segments; col++) {
      const u = col / segments;
      const theta = angle + (u - .5) * arc;
      positions.push(radius * Math.cos(theta), radius * Math.sin(theta), axial + (row - .5) * height);
      uvs.push(u, row);
    }
  }
  for (let col = 0; col < segments; col++) {
    const a = col;
    const b = col + 1;
    const c = col + segments + 1;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide, depthWrite: false }));
}

function petalHoodGeometry(radius, length, backZ) {
  const points = [];
  const triangles = [];
  const count = 128;
  for (let i = 0; i <= count; i++) {
    const angle = i / count * Math.PI * 2;
    const x = Math.cos(angle), y = Math.sin(angle);
    const front = backZ + length + .34 * Math.cos(4 * angle);
    points.push(radius * x, radius * y, backZ, (radius + .10) * x, (radius + .10) * y, front);
    if (i < count) {
      const k = i * 2;
      triangles.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function petalLipGeometry(radius, length, backZ) {
  const points = [];
  const triangles = [];
  const count = 128;
  for (let i = 0; i <= count; i++) {
    const angle = i / count * Math.PI * 2;
    const x = Math.cos(angle), y = Math.sin(angle);
    const front = backZ + length + .34 * Math.cos(4 * angle);
    points.push((radius + .07) * x, (radius + .07) * y, front,
      (radius + .16) * x, (radius + .16) * y, front);
    if (i < count) {
      const k = i * 2;
      triangles.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function ring(radius, thickness, material, z = 0, segments = 80) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, segments), material);
  mesh.position.z = z;
  return mesh;
}

function glassGeometry(radius, thickness, frontCurve, backCurve) {
  const points = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const r = radius * i / steps;
    const normalized = r / radius;
    points.push(new THREE.Vector2(r, thickness / 2 + frontCurve * (1 - normalized * normalized)));
  }
  points.push(new THREE.Vector2(radius, -thickness / 2));
  for (let i = steps - 1; i >= 0; i--) {
    const r = radius * i / steps;
    const normalized = r / radius;
    points.push(new THREE.Vector2(r, -thickness / 2 - backCurve * (1 - normalized * normalized)));
  }
  const geometry = new THREE.LatheGeometry(points, 72);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

const elements = [
  { z: 3.75, r: 1.48, t: .20, f: .35, b: -.08, type: 'normal' },
  { z: 3.50, r: 1.44, t: .22, f: .10, b: .06, type: 'normal' },
  { z: 2.93, r: 1.27, t: .28, f: .04, b: -.30, type: 'asph' },
  { z: 2.50, r: 1.12, t: .24, f: -.12, b: .02, type: 'normal' },
  { z: 2.16, r: 1.10, t: .16, f: .08, b: .12, type: 'normal' },
  { z: 1.73, r: .94, t: .14, f: .14, b: .03, type: 'normal' },
  { z: -.25, r: 1.02, t: .27, f: .18, b: .10, type: 'asph' },
  { z: -.72, r: .98, t: .25, f: -.06, b: -.05, type: 'normal' },
  { z: -.95, r: .97, t: .23, f: .08, b: .22, type: 'sld' },
  { z: -1.62, r: .84, t: .20, f: .15, b: .08, type: 'asph' },
  { z: -2.35, r: .73, t: .10, f: .05, b: -.08, type: 'normal' },
  { z: -3.41, r: .80, t: .12, f: -.03, b: -.04, type: 'normal' },
  { z: -3.65, r: .86, t: .23, f: .03, b: .18, type: 'normal' },
];

const colors = { normal: 0x8bd9df, asph: 0xe0ad76, sld: 0x91a9ef };
const frontGlassDark = new THREE.Color(0x11232b);
const frontGlassOpen = new THREE.Color(colors.normal);
function frontLensTexture() {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 512;
  const ctx = surface.getContext('2d');
  const coating = ctx.createRadialGradient(230, 222, 24, 256, 256, 255);
  coating.addColorStop(0, '#09151b');
  coating.addColorStop(.55, '#0b191d');
  coating.addColorStop(.83, '#14282c');
  coating.addColorStop(.96, '#182c30');
  coating.addColorStop(1, '#071116');
  ctx.fillStyle = coating;
  ctx.fillRect(0, 0, 512, 512);
  const reflection = ctx.createRadialGradient(130, 120, 8, 140, 130, 180);
  reflection.addColorStop(0, 'rgba(91,143,151,.16)');
  reflection.addColorStop(1, 'rgba(91,143,151,0)');
  ctx.fillStyle = reflection;
  ctx.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const assembledFrontLens = new THREE.Mesh(
  new THREE.CircleGeometry(1.455, 96),
  new THREE.MeshBasicMaterial({ map: frontLensTexture(), side: THREE.DoubleSide })
);
assembledFrontLens.position.z = .48;
const assembledRearLens = new THREE.Mesh(
  new THREE.CircleGeometry(.84, 96),
  new THREE.MeshBasicMaterial({ map: frontLensTexture(), side: THREE.DoubleSide })
);
assembledRearLens.position.z = .18;
const opticRims = [];
elements.forEach((e, i) => {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color: colors[e.type], metalness: 0, roughness: .09, transmission: .26,
    transparent: true, opacity: .62, side: THREE.DoubleSide, depthWrite: false,
    emissive: colors[e.type], emissiveIntensity: .08, clearcoat: 1, clearcoatRoughness: .08,
  });
  const glass = new THREE.Mesh(glassGeometry(e.r, e.t, e.f, e.b), material);
  group.add(glass);
  if (i === 0) group.add(assembledFrontLens);
  if (i === elements.length - 1) group.add(assembledRearLens);
  const opticRim = ring(e.r, .018, new THREE.MeshBasicMaterial({ color: colors[e.type], transparent: true, opacity: .86 }));
  group.add(opticRim);
  opticRims.push(opticRim);
  const ex = (6 - i) * .34;
  register(`element-${i + 1}`, group, [glass], [0, 0, e.z], [0, 0, ex], 'optics');
});

// Rounded seven-blade diaphragm. The leaf outline and pivots are illustrative;
// SIGMA publishes the blade count, but not the cam and leaf drawings.
const iris = new THREE.Group();
const bladeCount = 7;
const bladeStep = Math.PI * 2 / bladeCount;
const polar = (r, angle) => new THREE.Vector2(r * Math.cos(angle), r * Math.sin(angle));
// Official range: F2.8–F22. Intermediate labels are conventional third-stop values.
const apertureValues = [2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22];
const apertureRadius = fNumber => .70 * 2.8 / fNumber;
const openingPoint = (angle, progress, radius, twist) => {
  const curvedRadius = radius + .02 * Math.min(1, radius / .25) * Math.pow(2 * progress - 1, 2);
  return polar(curvedRadius, angle + twist + progress * bladeStep);
};
iris.add(new THREE.Mesh(new THREE.RingGeometry(.72, 1.10, 96), new THREE.MeshStandardMaterial({ color: 0x0d1419, metalness: .18, roughness: .9, side: THREE.DoubleSide })));
const bladeEdge = new THREE.LineBasicMaterial({ color: 0x86949b, transparent: true, opacity: .72, depthWrite: false });
const bladeSeam = new THREE.LineBasicMaterial({ color: 0x99a7ad, transparent: true, opacity: .82, depthWrite: false });
const pivotMetal = new THREE.MeshStandardMaterial({ color: 0x606c72, metalness: .74, roughness: .37 });
const bladeFinishes = [0x354148, 0x2b353b, 0x303c43];
const irisBlades = [];
function bladeOutline(angle, radius, twist) {
  const shape = new THREE.Shape();
  const innerStart = openingPoint(angle, 0, radius, twist);
  const outerStart = polar(1.05, angle - .25);
  shape.moveTo(innerStart.x, innerStart.y);
  const lead = polar(.77, angle - .43 + twist * .35);
  shape.quadraticCurveTo(lead.x, lead.y, outerStart.x, outerStart.y);
  for (let j = 1; j <= 16; j++) {
    const outerAngle = angle - .25 + (bladeStep + .52) * j / 16;
    const p = polar(1.05, outerAngle);
    shape.lineTo(p.x, p.y);
  }
  const innerEnd = openingPoint(angle, 1, radius, twist);
  const trail = polar(.77, angle + bladeStep + .43 + twist * .35);
  shape.quadraticCurveTo(trail.x, trail.y, innerEnd.x, innerEnd.y);
  for (let j = 15; j >= 0; j--) {
    const p = openingPoint(angle, j / 16, radius, twist);
    shape.lineTo(p.x, p.y);
  }
  shape.closePath();
  return { shape, innerStart, outerStart, lead };
}

for (let i = 0; i < bladeCount; i++) {
  const angle = i * bladeStep;
  const bladeZ = .018 + i * .004;
  const blade = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
    color: bladeFinishes[i % bladeFinishes.length], metalness: .42, roughness: .73,
    side: THREE.DoubleSide, emissive: 0x172027, emissiveIntensity: .12,
  }));
  blade.position.z = bladeZ;
  iris.add(blade);
  const edge = new THREE.Line(new THREE.BufferGeometry(), bladeEdge);
  const seam = new THREE.Line(new THREE.BufferGeometry(), bladeSeam);
  iris.add(edge, seam);
  irisBlades.push({ angle, bladeZ, blade, edge, seam });
  const pivot = polar(.96, angle - .18);
  const rivet = new THREE.Mesh(new THREE.SphereGeometry(.028, 12, 8), pivotMetal);
  rivet.position.set(pivot.x, pivot.y, .085);
  iris.add(rivet);
}
function updateIrisBlades(fNumber) {
  const radius = apertureRadius(fNumber);
  const twist = .19 * (1 - 2.8 / fNumber);
  for (const { angle, bladeZ, blade, edge, seam } of irisBlades) {
    const outline = bladeOutline(angle, radius, twist);
    blade.geometry.dispose();
    blade.geometry = new THREE.ShapeGeometry(outline.shape, 12);
    const edgePoints = [];
    for (let j = 0; j <= 24; j++) {
      const p = openingPoint(angle, j / 24, radius, twist);
      edgePoints.push(new THREE.Vector3(p.x, p.y, bladeZ + .003));
    }
    edge.geometry.dispose();
    edge.geometry = new THREE.BufferGeometry().setFromPoints(edgePoints);
    const seamCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(outline.innerStart.x, outline.innerStart.y, .077),
      new THREE.Vector3(outline.lead.x, outline.lead.y, .077),
      new THREE.Vector3(outline.outerStart.x, outline.outerStart.y, .077)
    );
    seam.geometry.dispose();
    seam.geometry = new THREE.BufferGeometry().setFromPoints(seamCurve.getPoints(16));
  }
}
updateIrisBlades(apertureValues[0]);
iris.add(ring(1.11, .09, MAT.edge, .055));
iris.add(ring(1.005, .025, MAT.shellDark, .06));
register('iris', iris, [], [0, 0, .75], [-.13, -.42, .12], 'mechanics');

const hood = new THREE.Group();
const hoodGeometry = petalHoodGeometry(1.78, 2.34, -1.22);
const hoodFull = new THREE.Mesh(hoodGeometry, hoodSolid);
const hoodGhost = new THREE.Mesh(hoodGeometry, hoodSurface);
hood.add(hoodFull, hoodGhost);
hood.userData.shellVariants = { full: hoodFull, cut: hoodGhost };
hood.add(new THREE.Mesh(petalLipGeometry(1.78, 2.34, -1.22), hoodLip));
const hoodCollar = tube(1.61, .50, MAT.shellDark);
hoodCollar.position.z = -1.46;
hood.add(hoodCollar);
hood.add(ring(1.79, .025, MAT.edge, -1.22));
for (let i = 0; i < 128; i++) {
  const a = i * Math.PI * 2 / 128;
  const rib = new THREE.Mesh(new THREE.BoxGeometry(.014, .032, .24), MAT.grip);
  rib.position.set(Math.cos(a) * 1.805, Math.sin(a) * 1.805, -.82);
  rib.rotation.z = a;
  hood.add(rib);
}
hood.add(decal('—', .18, .18, 1.806, .65, -1.03, 105));
register('hood', hood, [], [0, 0, 3.33], [.45, 2.4, 1.3], 'shell');

const frontBarrel = new THREE.Group();
shellVariants(frontBarrel,
  full => {
    full.add(tube(1.48, 2.76, MAT.extension));
    const sleeve = tube(1.47, 1.65, MAT.extension);
    sleeve.position.z = -1.92;
    full.add(sleeve);
  },
  cut => {
    cut.add(cutTube(1.48, 2.76, MAT.extension));
    const sleeve = cutTube(1.47, 1.65, MAT.extension);
    sleeve.position.z = -1.92;
    cut.add(sleeve);
  });
frontBarrel.add(ring(1.59, .035, MAT.edge, 1.36));
frontBarrel.add(ring(1.53, .055, MAT.shellDark, 1.45));
frontBarrel.add(ring(1.48, .025, MAT.edge, 1.52));
const frontBezel = new THREE.Mesh(new THREE.RingGeometry(1.46, 1.59, 96), MAT.shellDark);
frontBezel.position.z = 1.52;
frontBarrel.add(frontBezel);
frontBarrel.add(decal('—', .16, .16, 1.606, .65, -.52, 105));
register('front-barrel', frontBarrel, [], [0, 0, 2.58], [1.85, .78, 1.24], 'shell');

// The end positions follow product photos; the exact zoom cam throw is unpublished.
const ZOOM_EXTENSION = 1.55;
const ZOOM_ROTATION = 1.05;
const ZOOM_INDEX_ANGLE = .65;
const zoomBarrel = new THREE.Group();
shellVariants(zoomBarrel,
  full => { full.add(tube(1.61, 1.78, MAT.shellDark)); addGrip(full, 1.605, 1.72, false, 104); },
  cut => { cut.add(cutTube(1.61, 1.78, MAT.shellDark)); addGrip(cut, 1.605, 1.72, true, 104); });
zoomBarrel.add(ring(1.635, .012, MAT.edge, .89));
zoomBarrel.add(ring(1.635, .012, MAT.edge, -.89));
const zoomScaleBand = tube(1.657, .54, MAT.shell);
zoomScaleBand.position.z = -1.06;
zoomBarrel.add(zoomScaleBand);
for (const focal of [18, 24, 28, 35, 50]) {
  const angle = ZOOM_INDEX_ANGLE - ZOOM_ROTATION * (focal - 18) / 32;
  zoomBarrel.add(decal(String(focal), .40, .31, 1.670, angle, -1.08, 108, 224));
}
register('zoom-ring', zoomBarrel, [], [0, 0, .52], [-2.02, -.27, .38], 'shell');

const fixedBody = new THREE.Group();
shellVariants(fixedBody,
  full => full.add(tube(1.65, 2.82, MAT.shell)),
  cut => cut.add(cutTube(1.65, 2.82, MAT.shell)));
fixedBody.add(tube(1.65, .74, MAT.shell));
fixedBody.children[fixedBody.children.length - 1].position.z = 1.00;
fixedBody.add(ring(1.652, .010, MAT.edge, 1.38));
fixedBody.add(ring(1.652, .010, MAT.edge, .62));
fixedBody.add(decal('│', .18, .30, 1.666, ZOOM_INDEX_ANGLE, 1.36, 105, 256));
fixedBody.add(decal('18–50mm 1:2.8 DC DN Ø55   SIGMA', 2.30, .40, 1.666, .65, 1.02, 79));
fixedBody.add(decal('C', .22, .34, 1.666, 1.57, 1.02, 112));
fixedBody.add(ring(1.61, .025, MAT.shellDark, -1.41));
register('fixed-body', fixedBody, [], [0, 0, -2.12], [1.63, -.57, -.82], 'shell');

const focusBarrel = new THREE.Group();
shellVariants(focusBarrel,
  full => { full.add(tube(1.61, .65, MAT.shellDark)); addGrip(full, 1.605, .61, false, 100); },
  cut => { cut.add(cutTube(1.61, .65, MAT.shellDark)); addGrip(cut, 1.605, .61, true, 100); });
focusBarrel.add(ring(1.635, .012, MAT.edge, .34));
focusBarrel.add(ring(1.635, .012, MAT.edge, -.34));
register('focus-ring', focusBarrel, [], [0, 0, -2.115], [-1.57, -.74, -.25], 'shell');

const motor = new THREE.Group();
motor.add(ring(1.29, .095, MAT.copper));
motor.add(ring(1.42, .055, MAT.edge, -.22));
motor.add(ring(1.42, .055, MAT.edge, .22));
for (let i = 0; i < 20; i++) {
  const a = i * Math.PI * 2 / 20;
  const coil = new THREE.Mesh(new THREE.BoxGeometry(.10, .25, .35), MAT.copper);
  coil.position.set(Math.cos(a) * 1.39, Math.sin(a) * 1.39, 0);
  coil.rotation.z = a;
  motor.add(coil);
}
register('motor', motor, [], [0, 0, -1.16], [-2.35, 1.33, -.34], 'mechanics');

const mount = new THREE.Group();
const rearCollar = tube(1.55, .65, MAT.shellDark);
rearCollar.position.z = .41;
mount.add(rearCollar);
mount.add(tube(1.39, .47, MAT.shellDark));
mount.add(ring(1.46, .075, MAT.mountSteel, -.23));
mount.add(ring(1.48, .10, MAT.mountSteel, -.36));
mount.add(ring(1.18, .05, MAT.edge, -.41));
for (let i = 0; i < 10; i++) {
  const angle = -Math.PI * .78 + i * Math.PI * .12;
  const contact = new THREE.Mesh(new THREE.BoxGeometry(.105, .19, .045), MAT.gold);
  contact.position.set(Math.cos(angle) * 1.29, Math.sin(angle) * 1.29, -.43);
  contact.rotation.z = angle - Math.PI / 2;
  mount.add(contact);
}
register('mount', mount, [], [0, 0, -3.43], [.72, -.15, -1.76], 'mechanics');

const guideMaterial = new THREE.LineDashedMaterial({ color: 0x7895a2, dashSize: .14, gapSize: .13, transparent: true, opacity: .43 });
const guidePoints = [new THREE.Vector3(0, 0, -7.7), new THREE.Vector3(0, 0, 7.7)];
const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(guidePoints), guideMaterial);
guide.computeLineDistances();
scene.add(guide);
guide.scale.z = .66;
const guideCaps = new THREE.Group();
for (const z of [-7.7, 7.7]) guideCaps.add(ring(.11, .012, new THREE.MeshBasicMaterial({ color: 0x7895a2, transparent: true, opacity: .6 }), z));
scene.add(guideCaps);
guideCaps.scale.z = .66;

const descriptions = {
  overview: { kicker: 'EXPLODED VIEW / CONCEPT', title: '光学系と機構の全体像', body: '外装はSIGMAの製品写真に合わせ、花形フード、縦溝のリング、銘板、銀色のマウントを再現。光学系は公式構成図を参照し、内部の駆動部は模式的に表現しています。', meta: '10群13枚  ·  F2.8通し  ·  APS-C' },
  assembled: { kicker: 'PRODUCT VIEW / EXTERIOR', title: 'SIGMA 18–50mmの製品外観', body: '全レイヤーを表示して分解距離を0%にすると、フード、鏡筒、前玉、Xマウントが組み上がります。外装の形状と表記はSIGMAの製品写真を参照しています。', meta: '18–50mm F2.8 DC DN  ·  Xマウント' },
  hood: { kicker: '01 / LENS HOOD', title: '花形レンズフード', body: '付属する花形フードの輪郭と、基部の細かな溝を表現。フードは前玉に入る余分な光を遮り、フレアを抑えます。', meta: 'LH582-02' },
  'front-barrel': { kicker: '02 / FRONT BARREL', title: '前側鏡筒', body: '前玉の周囲を支える繰り出し部分。実機は望遠側にズームすると前側が伸びます。分解時は内部が見えるよう筒の一部を切り欠いています。', meta: '55 mm フィルター径' },
  'zoom-ring': { kicker: '03 / ZOOM', title: 'ズームリング', body: '焦点距離スライダーと連動して縦溝のリングが回り、目盛が固定指標の下を通ります。同時に前側鏡筒とフードが伸びます。各レンズ群の正確な移動量は公開されていません。', meta: '18—50 mm' },
  'fixed-body': { kicker: '04 / NAMEPLATE', title: '銘板と固定筒', body: '焦点距離、F値、DC DN、フィルター径、SIGMAロゴが記された滑らかな部分。外装形状と表記は製品写真を参考にしています。', meta: '18–50mm 1:2.8 DC DN Ø55' },
  'focus-ring': { kicker: '05 / FOCUS', title: 'フォーカスリング', body: 'マウント寄りにある細い縦溝のリング。ピント合わせは鏡筒内部のレンズを動かすインナーフォーカス方式です。', meta: 'インナーフォーカス' },
  iris: { kicker: '06 / DIAPHRAGM', title: '7枚羽根の円形絞り', body: '7枚の湾曲した薄い羽根を少しずつ重ね、絞ったときも開口が丸く見える構成を表現。実機はF2.8からF22まで調整できます。羽根の正確な輪郭と駆動機構は公開されていないため模式表現です。', meta: '7 blades  ·  F2.8—F22' },
  motor: { kicker: '07 / AF DRIVE', title: 'ステッピングモーター', body: '内部のフォーカス用レンズを動かすAF駆動。外周に浮かせたリングは役割を見せるための概念モデルで、実際の位置・形状を示すものではありません。', meta: 'STM  ·  インナーフォーカス' },
  mount: { kicker: '08 / INTERFACE', title: '富士フイルム Xマウント', body: 'カメラと接続する銀色のバヨネット部。実機は真鍮製のマウントと電気接点を備えています。接点の形状と配置は模式表現です。', meta: 'X Mount  ·  φ61.6 × 76.8 mm' },
};

function infoFor(id) {
  if (id && id.startsWith('element-')) {
    const index = Number(id.split('-')[1]);
    const e = elements[index - 1];
    const special = e.type === 'sld' ? 'SLDガラス' : e.type === 'asph' ? '非球面レンズ' : '標準ガラス要素';
    const body = e.type === 'sld'
      ? '色ごとの光の曲がり方の違いを抑える特殊低分散ガラス。公式構成図では青で示されています。'
      : e.type === 'asph'
        ? '球面からずれた曲面を持つレンズ。収差を抑えながら構成枚数と鏡筒サイズを小さくする設計に使われます。公式図では輪郭が赤で示されています。'
        : '光を屈折させる光学要素。形状と並びは公式断面図の概略に合わせていますが、曲率・厚み・群の動きは実測値ではありません。';
    return { kicker: `OPTICAL ELEMENT / ${String(index).padStart(2, '0')}`, title: special, body, meta: `13枚中 ${index}枚目  ·  ${e.type === 'normal' ? '光学ガラス' : special}` };
  }
  return descriptions[id] || descriptions.overview;
}

const state = { explode: 0, currentExplode: 0, selected: 'overview', shell: true, optics: true, mechanics: true, rotate: false, focal: 18, currentFocal: 18, apertureIndex: 0, currentApertureIndex: 0 };
let viewPanZ = 0;
let viewDolly = 0;
const zoomViewDirection = new THREE.Vector3();
const $ = id => root.querySelector(`#${id}`);
const explodeSlider = $('explode-slider');
const explodeReadout = $('explode-value');
const focalSlider = $('focal-slider');
const apertureSlider = $('aperture-slider');
const apertureReadout = $('aperture-readout');
const aperturePreview = $('aperture-preview');
const selectedLabel = $('selected-label');
const detailKicker = $('detail-kicker');
const detailTitle = $('detail-title');
const detailBody = $('detail-body');
const detailMeta = $('detail-meta');
const stageLabel = $('stage-label');
const stageCount = $('stage-count');
const annotation = $('selected-annotation');
const annotationName = $('annotation-name');
const isProductView = () => state.explode === 0 && state.shell && state.optics && state.mechanics;
function updateStage() {
  stageLabel.textContent = isProductView() ? 'PRODUCT VIEW' : state.explode > .1 ? 'EXPLODED STRUCTURE' : 'ASSEMBLED VIEW';
  stageCount.textContent = isProductView() ? 'SIGMA · 18–50mm F2.8 DC DN · X MOUNT' : 'OPTICAL AXIS · 13 ELEMENTS / 10 GROUPS';
}
const defaultCameraPosition = () => viewport.clientWidth < 540
  ? [11.7, 7.0, 13.5]
  : [12.2, 7.4, 14.3];

function updateInfo() {
  const info = state.selected === 'overview' && isProductView() ? descriptions.assembled : infoFor(state.selected);
  detailKicker.textContent = info.kicker;
  detailTitle.textContent = info.title;
  detailBody.textContent = info.body;
  detailMeta.textContent = info.meta;
  selectedLabel.textContent = info.title;
  annotationName.textContent = info.title;
  annotation.hidden = state.selected === 'overview' || state.selected === 'iris';
  root.querySelectorAll('[data-part]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.part === state.selected)));
  parts.forEach(part => {
    part.group.traverse(obj => {
      if (!obj.isMesh || !obj.material || !('emissiveIntensity' in obj.material)) return;
      obj.material.emissiveIntensity = part.id === state.selected ? .35 : .08;
    });
  });
}

function setSelected(id) {
  const target = partMap.get(id);
  if (target && !state[target.layer]) {
    state[target.layer] = true;
    parts.filter(part => part.layer === target.layer).forEach(part => part.group.visible = true);
    root.querySelector(`[data-layer="${target.layer}"]`).setAttribute('aria-pressed', 'true');
  }
  state.selected = id;
  updateStage();
  updateInfo();
}

root.querySelectorAll('[data-part]').forEach(btn => btn.addEventListener('click', () => setSelected(btn.dataset.part)));
root.querySelectorAll('[data-layer]').forEach(btn => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.layer;
    state[name] = !state[name];
    btn.setAttribute('aria-pressed', String(state[name]));
    parts.filter(part => part.layer === name).forEach(part => part.group.visible = state[name]);
    if (!state[name] && partMap.get(state.selected)?.layer === name) setSelected('overview');
    updateStage();
    updateInfo();
  });
});

explodeSlider.addEventListener('input', () => {
  state.explode = Number(explodeSlider.value) / 100;
  explodeReadout.textContent = `${explodeSlider.value}%`;
  explodeSlider.style.background = `linear-gradient(90deg, var(--gold) 0 ${explodeSlider.value}%, #304149 ${explodeSlider.value}% 100%)`;
  updateStage();
  updateInfo();
});

function updateFocalControl() {
  $('focal-readout').textContent = `${state.focal} mm`;
  focalSlider.setAttribute('aria-valuetext', `${state.focal} mm`);
  const percent = (state.focal - 18) / 32 * 100;
  focalSlider.style.background = `linear-gradient(90deg, var(--gold) 0 ${percent}%, #304149 ${percent}% 100%)`;
}
focalSlider.addEventListener('input', () => {
  state.focal = Number(focalSlider.value);
  updateFocalControl();
});

function updateApertureControl() {
  const fNumber = apertureValues[state.apertureIndex];
  apertureReadout.textContent = `F${fNumber}`;
  apertureSlider.setAttribute('aria-valuetext', `F${fNumber}`);
  const percent = state.apertureIndex / (apertureValues.length - 1) * 100;
  apertureSlider.style.background = `linear-gradient(90deg, var(--gold) 0 ${percent}%, #304149 ${percent}% 100%)`;
}
apertureSlider.addEventListener('input', () => {
  state.apertureIndex = Number(apertureSlider.value);
  updateApertureControl();
});

function drawAperturePreview(fNumber) {
  const ctx = aperturePreview.getContext('2d');
  const mid = aperturePreview.width / 2;
  const scale = aperturePreview.width * .43 / 1.11;
  ctx.clearRect(0, 0, aperturePreview.width, aperturePreview.height);
  ctx.save();
  ctx.translate(mid, mid);
  ctx.scale(scale, -scale);
  ctx.beginPath();
  ctx.arc(0, 0, 1.11, 0, Math.PI * 2);
  ctx.fillStyle = '#263239';
  ctx.fill();
  ctx.clip();
  const radius = apertureRadius(fNumber);
  const twist = .19 * (1 - 2.8 / fNumber);
  for (let i = 0; i < bladeCount; i++) {
    const points = bladeOutline(i * bladeStep, radius, twist).shape.getPoints(12);
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = ['#36444b', '#2c383f', '#324047'][i % 3];
    ctx.fill();
    ctx.strokeStyle = '#73848b';
    ctx.lineWidth = .009;
    ctx.stroke();
  }
  ctx.restore();
}

$('rotate-toggle').addEventListener('click', () => {
  state.rotate = !state.rotate;
  controls.autoRotate = state.rotate;
  $('rotate-toggle').setAttribute('aria-pressed', String(state.rotate));
  $('rotate-toggle').textContent = state.rotate ? '回転を停止' : '自動回転';
});

$('reset-view').addEventListener('click', () => {
  camera.position.set(...defaultCameraPosition());
  controls.target.set(0, 0, 0);
  viewPanZ = 0;
  viewDolly = 0;
  controls.update();
  setSelected('overview');
});

function updateRaycast(event, click = false) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(selectable.filter(obj => obj.parent?.visible), false);
  const part = hits[0]?.object.userData.part;
  canvas.style.cursor = part ? 'pointer' : 'grab';
  if (click && part) setSelected(part);
}
canvas.addEventListener('pointermove', event => updateRaycast(event));
canvas.addEventListener('click', event => updateRaycast(event, true));

const size = () => {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
};
camera.position.set(...defaultCameraPosition());
new ResizeObserver(size).observe(viewport);
size();

let lastRenderedApertureIndex = -1;
function animate() {
  requestAnimationFrame(animate);
  state.currentExplode += (state.explode - state.currentExplode) * .075;
  state.currentFocal += (state.focal - state.currentFocal) * .11;
  if (Math.abs(state.focal - state.currentFocal) < .005) state.currentFocal = state.focal;
  state.currentApertureIndex += (state.apertureIndex - state.currentApertureIndex) * .15;
  if (Math.abs(state.apertureIndex - state.currentApertureIndex) < .005) state.currentApertureIndex = state.apertureIndex;
  if (Math.abs(state.currentApertureIndex - lastRenderedApertureIndex) > .005) {
    const lower = Math.floor(state.currentApertureIndex);
    const upper = Math.min(lower + 1, apertureValues.length - 1);
    const fNumber = THREE.MathUtils.lerp(apertureValues[lower], apertureValues[upper], state.currentApertureIndex - lower);
    updateIrisBlades(fNumber);
    drawAperturePreview(fNumber);
    lastRenderedApertureIndex = state.currentApertureIndex;
  }
  const e = state.currentExplode;
  const fullyAssembled = state.explode === 0 && e < .08 && state.shell && state.optics && state.mechanics;
  const focalNorm = (state.currentFocal - 18) / 32;
  const zoomExtension = ZOOM_EXTENSION * focalNorm;
  const viewPan = zoomExtension * .65 - viewPanZ;
  camera.position.z += viewPan;
  controls.target.z += viewPan;
  viewPanZ += viewPan;
  const dolly = zoomExtension * 1.55 - viewDolly;
  zoomViewDirection.subVectors(camera.position, controls.target).normalize();
  camera.position.addScaledVector(zoomViewDirection, dolly);
  viewDolly += dolly;
  zoomBarrel.rotation.z = ZOOM_ROTATION * focalNorm;
  for (const part of parts) {
    const opticalIndex = part.id.startsWith('element-') ? Number(part.id.split('-')[1]) : 0;
    const enclosedPart = part.id === 'iris' || part.id === 'motor' || (opticalIndex > 1 && opticalIndex < elements.length);
    part.group.visible = state[part.layer] && !(fullyAssembled && enclosedPart);
    part.group.position.copy(part.base).addScaledVector(part.drift, e);
    const variants = part.group.userData.shellVariants;
    if (variants) {
      variants.full.visible = e < .08;
      variants.cut.visible = e >= .08;
    }
    if (part.id === 'front-barrel' || part.id === 'hood') part.group.position.z += zoomExtension;
    if (part.id.startsWith('element-')) {
      const index = Number(part.id.split('-')[1]);
      part.group.position.z += index <= 5 ? zoomExtension * .88 : focalNorm * (index <= 9 ? -.26 : .12);
      if (index === 1) part.group.position.z -= .55 * Math.max(0, 1 - e / .16);
    }
  }
  const frontMaterial = partMap.get('element-1').objects[0].material;
  assembledFrontLens.visible = e < .08;
  assembledRearLens.visible = fullyAssembled;
  opticRims.forEach(rim => { rim.visible = !fullyAssembled; });
  guide.visible = !fullyAssembled;
  guideCaps.visible = !fullyAssembled;
  frontMaterial.color.copy(frontGlassDark).lerp(frontGlassOpen, Math.min(1, e * 1.55));
  frontMaterial.opacity = .96 - e * .34;
  frontMaterial.transmission = .03 + e * .23;
  hoodSurface.opacity = Math.max(.20, 1 - e * 1.12);
  controls.update();
  if (state.selected !== 'overview' && state.selected !== 'iris') {
    const part = partMap.get(state.selected);
    if (part?.group.visible) {
      part.group.updateWorldMatrix(true, false);
      const pos = part.group.getWorldPosition(new THREE.Vector3()).project(camera);
      annotation.style.left = `${(pos.x * .5 + .5) * viewport.clientWidth}px`;
      annotation.style.top = `${(-pos.y * .5 + .5) * viewport.clientHeight}px`;
      annotation.hidden = pos.z < -1 || pos.z > 1;
    }
  }
  renderer.render(scene, camera);
}
updateStage();
updateInfo();
updateFocalControl();
updateApertureControl();
animate();
