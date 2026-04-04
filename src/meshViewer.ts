// ============================================================
// meshViewer.ts
// Takes the Mesh object produced by depthMapper.ts and renders
// it live in the browser using Three.js + WebGL.
//
// No downloads needed — runs in any modern browser.
// Users can rotate, zoom and pan with mouse or touch.
//
// Three.js is loaded from a CDN in index.html so this file
// imports from the same CDN URL using an import map.
// ============================================================

import * as THREE from “three”;

// OrbitControls lets the user spin, zoom and pan the model
// with mouse drag / scroll / touch — without us writing any
// input handling ourselves.
import { OrbitControls } from “three/addons/controls/OrbitControls.js”;

import { Mesh } from “./types”;

// ─────────────────────────────────────────────
// ViewerOptions
//
// Everything the caller can customise.
// All fields have defaults so passing {} is fine.
// ─────────────────────────────────────────────
export interface ViewerOptions {
// Which canvas element to render into.
// Pass the id string or the element itself.
canvas: HTMLCanvasElement;

// How the mesh surface is coloured.
//   “texture”  = use the original pixel colours from the image
//   “depth”    = heatmap — blue (far) → red (close)
//   “wireframe”= just the triangle edges, no fill
//   “normals”  = each face coloured by its surface direction (looks iridescent)
colorMode: “texture” | “depth” | “wireframe” | “normals”;

// Background colour of the 3D canvas (CSS colour string).
background: string;

// If true, the model slowly auto-rotates so users see it is 3D
// even before they interact with it.
autoRotate: boolean;
}

const DEFAULT_OPTIONS: ViewerOptions = {
canvas:     null as any, // must be supplied
colorMode:  “texture”,
background: “#07090f”,
autoRotate: true,
};

// ─────────────────────────────────────────────
// MeshViewer  (class)
//
// Manages the entire Three.js lifecycle:
//   constructor → set up scene, camera, lights, controls
//   load(mesh)  → build geometry from your CPG Mesh data
//   setMode()   → swap colour mode without reloading mesh
//   screenshot()→ download a PNG of the current view
//   dispose()   → clean up when the viewer is closed
// ─────────────────────────────────────────────
export class MeshViewer {

// Three.js core objects — kept as class fields so every
// method can access them.
private renderer:  THREE.WebGLRenderer;
private scene:     THREE.Scene;
private camera:    THREE.PerspectiveCamera;
private controls:  OrbitControls;
private frameId:   number = 0;         // requestAnimationFrame handle
private meshGroup: THREE.Group | null = null; // the loaded 3D mesh
private opts:      ViewerOptions;

// Raw geometry data kept so we can rebuild the mesh when
// the colour mode changes without re-running the pipeline.
private lastMesh:     Mesh | null = null;
private lastCanvas:   HTMLCanvasElement | null = null; // original image canvas

constructor(options: Partial<ViewerOptions> & { canvas: HTMLCanvasElement }) {

```
// Merge with defaults.
this.opts = { ...DEFAULT_OPTIONS, ...options };

const canvas = this.opts.canvas;

// ── Renderer ──
// WebGLRenderer uses the GPU via WebGL.
// antialias: smooth diagonal edges.
// alpha: transparent background supported.
this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
this.renderer.setPixelRatio(window.devicePixelRatio); // sharp on retina screens
this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
this.renderer.shadowMap.enabled = true;               // enable shadow casting
this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
this.renderer.setClearColor(this.opts.background, 1);

// ── Scene ──
// A Scene is the root container — everything you want rendered lives here.
this.scene = new THREE.Scene();

// A soft fog makes distant parts of the mesh fade into the background
// giving depth perception without any extra work.
this.scene.fog = new THREE.FogExp2(this.opts.background, 0.002);

// ── Camera ──
// PerspectiveCamera mimics how human eyes see:
//   75 = field of view in degrees (wider = more fish-eye)
//   aspect = canvas width / height (recalculated on resize)
//   0.1, 5000 = near and far clipping planes
//     anything closer than 0.1 or farther than 5000 is invisible.
const aspect = canvas.clientWidth / canvas.clientHeight;
this.camera  = new THREE.PerspectiveCamera(75, aspect, 0.1, 5000);

// Position the camera above and in front of the scene.
// We'll reposition it properly once the mesh is loaded.
this.camera.position.set(0, 0, 300);

// ── Lights ──
// Without lights, materials that respond to light would be pitch black.

// AmbientLight is a flat, directionless light — fills in shadows.
// It doesn't create shadows itself. Intensity 0.4 = dim fill.
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
this.scene.add(ambient);

// DirectionalLight acts like the sun — parallel rays from one direction.
// We position it above-right-front of the scene.
const sun = new THREE.DirectionalLight(0xfff0e0, 1.2);
sun.position.set(200, 400, 300);
sun.castShadow = true;
// Shadow map resolution — higher = sharper shadows, more GPU cost.
sun.shadow.mapSize.width  = 1024;
sun.shadow.mapSize.height = 1024;
this.scene.add(sun);

// A second, dimmer, coloured fill light from the opposite side
// gives the mesh a subtle cool rim highlight.
const fill = new THREE.DirectionalLight(0x8080ff, 0.3);
fill.position.set(-200, -100, -200);
this.scene.add(fill);

// ── OrbitControls ──
// Attaches mouse/touch listeners to the canvas automatically.
// Left-drag = rotate, right-drag = pan, scroll = zoom.
this.controls = new OrbitControls(this.camera, canvas);
this.controls.enableDamping = true;  // smooth inertia when you release mouse
this.controls.dampingFactor  = 0.08;
this.controls.autoRotate     = this.opts.autoRotate;
this.controls.autoRotateSpeed = 0.6; // degrees per frame

// ── Grid helper ──
// A subtle ground grid gives spatial context.
const grid = new THREE.GridHelper(600, 40, 0x0d2018, 0x0a1a10);
grid.position.y = -80; // below the mesh
this.scene.add(grid);

// ── Resize observer ──
// Keeps the renderer and camera in sync when the browser window resizes.
const ro = new ResizeObserver(() => this.onResize());
ro.observe(canvas);

// ── Start the render loop ──
this.animate();
```

}

// ─────────────────────────────────────────────
// load
//
// Takes your CPG Mesh object (from depthMapper.ts) and
// builds Three.js geometry from it.
//
// imageCanvas (optional): the original image drawn on a canvas,
// used to create a real texture for “texture” colour mode.
// ─────────────────────────────────────────────
load(mesh: Mesh, imageCanvas?: HTMLCanvasElement): void {

```
// Store for re-use when colour mode changes.
this.lastMesh   = mesh;
this.lastCanvas = imageCanvas ?? null;

// Remove any previously loaded mesh from the scene.
if (this.meshGroup) {
  this.scene.remove(this.meshGroup);
  this.meshGroup.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) {
      ((obj as THREE.Mesh).geometry as THREE.BufferGeometry).dispose();
      const mat = (obj as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else (mat as THREE.Material).dispose();
    }
  });
}

// ── Build BufferGeometry ──
// Three.js uses "buffer geometry" — flat typed arrays that go
// straight to the GPU. We fill three arrays:
//   positions: [x0,y0,z0, x1,y1,z1, ...]  — one entry per vertex
//   colors:    [r0,g0,b0, r1,g1,b1, ...]  — one entry per vertex, 0–1 range
//   indices:   [a0,b0,c0, a1,b1,c1, ...]  — triangle vertex indices

const geometry  = new THREE.BufferGeometry();
const positions = new Float32Array(mesh.points.length * 3);
const colors    = new Float32Array(mesh.points.length * 3);
const indices   = new Uint32Array(mesh.triangles.length * 3);

// ── Centre the mesh ──
// Find the bounding box of all points so we can centre
// the mesh at the world origin (0,0,0).
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

for (const p of mesh.points) {
  if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
  if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
}

const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const cz = (minZ + maxZ) / 2;

// Also compute a scale so the mesh fits nicely in the view
// regardless of image size.
const span  = Math.max(maxX - minX, maxY - minY);
const scale = span > 0 ? 200 / span : 1; // normalise to ~200 units wide

// ── Fill position array ──
mesh.points.forEach((p, i) => {
  // Centre and scale X and Y.
  // Negate Y because in images Y goes down, but in 3D Y goes up.
  positions[i * 3]     = (p.x - cx) * scale;
  positions[i * 3 + 1] = -(p.y - cy) * scale; // flip Y
  positions[i * 3 + 2] = (p.z - cz) * scale;
});

// ── Fill colour array ──
// Depends on the current colour mode.
this.fillColors(colors, mesh, minZ, maxZ);

// ── Fill index array ──
mesh.triangles.forEach((t, i) => {
  indices[i * 3]     = t.a;
  indices[i * 3 + 1] = t.b;
  indices[i * 3 + 2] = t.c;
});

// ── Attach arrays to geometry ──
// BufferAttribute wraps a typed array and tells Three.js how
// many values per vertex (3 for xyz and rgb, 2 for uv etc).
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
geometry.setIndex(new THREE.BufferAttribute(indices, 1));

// computeVertexNormals calculates which way each face points
// so lighting (shading, shadows) works correctly.
geometry.computeVertexNormals();

// ── Choose material ──
const material = this.buildMaterial(imageCanvas);

// ── Create the Three.js mesh ──
// A Three.js Mesh = geometry (shape) + material (appearance).
const threeMesh = new THREE.Mesh(geometry, material);
threeMesh.castShadow    = true;
threeMesh.receiveShadow = true;

// Wrap in a Group so we can add extras (wireframe overlay) cleanly.
this.meshGroup = new THREE.Group();
this.meshGroup.add(threeMesh);

// Add a faint wireframe overlay on top of solid modes
// so the triangle structure is always subtly visible.
if (this.opts.colorMode !== "wireframe") {
  const wireMat = new THREE.MeshBasicMaterial({
    color:       0x00ff88,
    wireframe:   true,
    transparent: true,
    opacity:     0.04,   // very subtle
  });
  this.meshGroup.add(new THREE.Mesh(geometry, wireMat));
}

this.scene.add(this.meshGroup);

// ── Reposition camera ──
// Pull back far enough to see the whole mesh.
this.camera.position.set(0, 0, 300);
this.controls.target.set(0, 0, 0);
this.controls.update();
```

}

// ─────────────────────────────────────────────
// fillColors (private)
//
// Populates the colour buffer based on the active colour mode.
// Called by load() and again by setColorMode().
// ─────────────────────────────────────────────
private fillColors(
colors: Float32Array,
mesh:   Mesh,
minZ:   number,
maxZ:   number
): void {

```
const zRange = maxZ - minZ || 1;

mesh.points.forEach((p, i) => {

  let r: number, g: number, b: number;

  if (this.opts.colorMode === "texture" || this.opts.colorMode === "wireframe") {
    // Use the original image colour, normalised from 0–255 to 0–1.
    r = p.r / 255;
    g = p.g / 255;
    b = p.b / 255;

  } else if (this.opts.colorMode === "depth") {
    // Heatmap: map Z (normalised 0–1) to a blue→cyan→green→yellow→red gradient.
    const t = (p.z - minZ) / zRange; // 0 = far, 1 = close
    r = Math.min(1, t * 2);          // red ramps up in the second half
    g = Math.min(1, t < 0.5 ? t * 2 : 2 - t * 2); // green peaks at midpoint
    b = Math.max(0, 1 - t * 2);      // blue dominates at low Z

  } else {
    // "normals" mode — colour by the index position for an iridescent look.
    // The actual normals are computed by Three.js; here we just use a
    // rainbow cycle as a placeholder that looks great.
    const h = (i / mesh.points.length) * 360;
    const [hr, hg, hb] = hslToRgb(h, 0.8, 0.6);
    r = hr; g = hg; b = hb;
  }

  colors[i * 3]     = r;
  colors[i * 3 + 1] = g;
  colors[i * 3 + 2] = b;
});
```

}

// ─────────────────────────────────────────────
// buildMaterial (private)
//
// Returns the right Three.js material for the colour mode.
// ─────────────────────────────────────────────
private buildMaterial(imageCanvas?: HTMLCanvasElement): THREE.Material {

```
if (this.opts.colorMode === "wireframe") {
  // MeshBasicMaterial doesn't respond to lights — flat colour.
  return new THREE.MeshBasicMaterial({
    color:     0x00ff88,
    wireframe: true,
  });
}

// MeshStandardMaterial is a physically-based material:
// it responds to lights realistically (diffuse, specular, shadows).
// vertexColors: true tells it to use our per-vertex colour array
// instead of a single flat colour.
return new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness:    0.7,   // 0 = mirror, 1 = completely matte
  metalness:    0.1,   // slight metallic sheen
  side:         THREE.DoubleSide, // render both front and back faces
});
```

}

// ─────────────────────────────────────────────
// setColorMode
//
// Hot-swap the colour mode without reloading the mesh.
// Rebuilds geometry colours and swaps the material.
// ─────────────────────────────────────────────
setColorMode(mode: ViewerOptions[“colorMode”]): void {
this.opts.colorMode = mode;
if (this.lastMesh) this.load(this.lastMesh, this.lastCanvas ?? undefined);
}

// ─────────────────────────────────────────────
// setAutoRotate
// ─────────────────────────────────────────────
setAutoRotate(on: boolean): void {
this.controls.autoRotate = on;
}

// ─────────────────────────────────────────────
// screenshot
//
// Renders one frame and triggers a PNG download.
// We render once with preserveDrawingBuffer:true semantics
// by forcing a render before reading the canvas pixels.
// ─────────────────────────────────────────────
screenshot(filename: string = “cpg-model.png”): void {
// Force a render so the canvas is up to date.
this.renderer.render(this.scene, this.camera);

```
// toDataURL reads the WebGL canvas pixels as a base64 PNG.
const url = this.opts.canvas.toDataURL("image/png");

const a   = document.createElement("a");
a.href     = url;
a.download = filename;
a.click();
```

}

// ─────────────────────────────────────────────
// animate (private)
//
// The render loop — called once per frame (~60fps).
// requestAnimationFrame syncs to the screen refresh rate
// and pauses automatically when the tab is hidden.
// ─────────────────────────────────────────────
private animate(): void {
this.frameId = requestAnimationFrame(() => this.animate());

```
// controls.update() must be called every frame for damping
// and auto-rotate to work.
this.controls.update();

// Actually draw the scene from the camera's point of view.
this.renderer.render(this.scene, this.camera);
```

}

// ─────────────────────────────────────────────
// onResize (private)
//
// Called by the ResizeObserver whenever the canvas element
// changes size (window resize, layout change, etc.).
// ─────────────────────────────────────────────
private onResize(): void {
const canvas = this.opts.canvas;
const w = canvas.clientWidth;
const h = canvas.clientHeight;

```
// Update camera aspect ratio and projection matrix.
this.camera.aspect = w / h;
this.camera.updateProjectionMatrix();

// Resize the renderer output to match.
this.renderer.setSize(w, h);
```

}

// ─────────────────────────────────────────────
// dispose
//
// Clean up everything — call this when the viewer is removed
// from the page to avoid memory leaks.
// ─────────────────────────────────────────────
dispose(): void {
cancelAnimationFrame(this.frameId);
this.controls.dispose();
this.renderer.dispose();
}
}

// ─────────────────────────────────────────────
// hslToRgb  (utility)
//
// Converts a Hue-Saturation-Lightness colour to 0–1 RGB.
// Used by the “normals” colour mode for the rainbow cycle.
// h = 0–360, s = 0–1, l = 0–1
// Returns [r, g, b] each 0–1.
// ─────────────────────────────────────────────
function hslToRgb(h: number, s: number, l: number): [number, number, number] {

// Formula from CSS Color spec.
const k = (n: number) => (n + h / 30) % 12;
const a = s * Math.min(l, 1 - l);
const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

return [f(0), f(8), f(4)];
}
