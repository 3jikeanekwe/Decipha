// meshViewer.ts
// Takes the Mesh object produced by depthMapper.ts and renders
// it live in the browser using Three.js + WebGL.
//
// No downloads needed - runs in any modern browser.
// Users can rotate, zoom and pan with mouse or touch.

import * as THREE from “three”;
import { OrbitControls } from “three/addons/controls/OrbitControls.js”;
import { Mesh } from “./types”;

// ViewerOptions - everything the caller can customise.
export interface ViewerOptions {
canvas: HTMLCanvasElement;
// How the mesh surface is coloured:
//   “texture”   = use the original pixel colours
//   “depth”     = heatmap blue (far) to red (close)
//   “wireframe” = just the triangle edges, no fill
//   “normals”   = each face coloured by its surface direction
colorMode: “texture” | “depth” | “wireframe” | “normals”;
background: string;   // CSS colour string
autoRotate: boolean;  // slowly spin the model
}

const DEFAULT_OPTIONS: ViewerOptions = {
canvas:     null as unknown as HTMLCanvasElement,
colorMode:  “texture”,
background: “#07090f”,
autoRotate: true,
};

export class MeshViewer {

private renderer:  THREE.WebGLRenderer;
private scene:     THREE.Scene;
public  camera:    THREE.PerspectiveCamera;
public  controls:  OrbitControls;
private frameId:   number = 0;
private meshGroup: THREE.Group | null = null;
private opts:      ViewerOptions;
private lastMesh:  Mesh | null = null;
private lastCanvas: HTMLCanvasElement | null = null;

constructor(options: Partial<ViewerOptions> & { canvas: HTMLCanvasElement }) {

```
this.opts = { ...DEFAULT_OPTIONS, ...options };

const canvas = this.opts.canvas;

// Renderer - uses the GPU via WebGL.
this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
this.renderer.setPixelRatio(window.devicePixelRatio);
this.renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600);
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
this.renderer.setClearColor(this.opts.background, 1);

// Scene - the root container.
this.scene = new THREE.Scene();

// Soft fog gives depth perception.
this.scene.fog = new THREE.FogExp2(this.opts.background, 0.002);

// Camera - PerspectiveCamera mimics how human eyes see.
// 75 = field of view, 0.1 and 5000 = near/far clipping planes.
const w = canvas.clientWidth  || 800;
const h = canvas.clientHeight || 600;
this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 5000);
this.camera.position.set(0, 0, 300);

// Lights
// AmbientLight is flat, directionless - fills in shadows.
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
this.scene.add(ambient);

// DirectionalLight acts like the sun.
const sun = new THREE.DirectionalLight(0xfff0e0, 1.2);
sun.position.set(200, 400, 300);
sun.castShadow = true;
sun.shadow.mapSize.width  = 1024;
sun.shadow.mapSize.height = 1024;
this.scene.add(sun);

// A second dimmer fill light from the opposite side.
const fill = new THREE.DirectionalLight(0x8080ff, 0.3);
fill.position.set(-200, -100, -200);
this.scene.add(fill);

// OrbitControls - mouse/touch listeners attached to the canvas.
// Left-drag = rotate, right-drag = pan, scroll = zoom.
this.controls = new OrbitControls(this.camera, canvas);
this.controls.enableDamping  = true;
this.controls.dampingFactor  = 0.08;
this.controls.autoRotate     = this.opts.autoRotate;
this.controls.autoRotateSpeed = 0.6;

// A subtle ground grid gives spatial context.
const grid = new THREE.GridHelper(600, 40, 0x0d2018, 0x0a1a10);
grid.position.y = -80;
this.scene.add(grid);

// Keep renderer in sync when the canvas resizes.
const ro = new ResizeObserver(() => this.onResize());
ro.observe(canvas);

this.animate();
```

}

// load
// Takes your CPG Mesh object and builds Three.js geometry from it.
// imageCanvas is optional - the original image for reference.
load(mesh: Mesh, imageCanvas?: HTMLCanvasElement): void {

```
this.lastMesh   = mesh;
this.lastCanvas = imageCanvas ?? null;

// Remove any previously loaded mesh from the scene.
if (this.meshGroup) {
  this.scene.remove(this.meshGroup);
  this.meshGroup.traverse(obj => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      (m.geometry as THREE.BufferGeometry).dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach(mat => mat.dispose());
      } else {
        (m.material as THREE.Material).dispose();
      }
    }
  });
}

// Build BufferGeometry.
// Three.js uses flat typed arrays that go straight to the GPU.
const geometry  = new THREE.BufferGeometry();
const positions = new Float32Array(mesh.points.length * 3);
const colors    = new Float32Array(mesh.points.length * 3);
const indices   = new Uint32Array(mesh.triangles.length * 3);

// Find the bounding box so we can centre the mesh at the origin.
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

// Normalise to ~200 units wide regardless of image size.
const span  = Math.max(maxX - minX, maxY - minY);
const scale = span > 0 ? 200 / span : 1;

// Fill position array.
// Negate Y because in images Y goes down, but in 3D Y goes up.
mesh.points.forEach((p, i) => {
  positions[i * 3]     = (p.x - cx) * scale;
  positions[i * 3 + 1] = -(p.y - cy) * scale;
  positions[i * 3 + 2] = (p.z - cz) * scale;
});

// Fill colour array based on current mode.
this.fillColors(colors, mesh, minZ, maxZ);

// Fill index array.
mesh.triangles.forEach((t, i) => {
  indices[i * 3]     = t.a;
  indices[i * 3 + 1] = t.b;
  indices[i * 3 + 2] = t.c;
});

// Attach arrays to geometry.
// BufferAttribute wraps a typed array and tells Three.js how many values per vertex.
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
geometry.setIndex(new THREE.BufferAttribute(indices, 1));

// Compute which way each face points so lighting works correctly.
geometry.computeVertexNormals();

// Build the material.
const material = this.buildMaterial();

// A Three.js Mesh = geometry (shape) + material (appearance).
const threeMesh = new THREE.Mesh(geometry, material);
threeMesh.castShadow    = true;
threeMesh.receiveShadow = true;

this.meshGroup = new THREE.Group();
this.meshGroup.add(threeMesh);

// Add a faint wireframe overlay so the triangle structure is visible.
if (this.opts.colorMode !== "wireframe") {
  const wireMat = new THREE.MeshBasicMaterial({
    color:       0x00ff88,
    wireframe:   true,
    transparent: true,
    opacity:     0.04,
  });
  this.meshGroup.add(new THREE.Mesh(geometry, wireMat));
}

this.scene.add(this.meshGroup);

// Reposition camera to see the whole mesh.
this.camera.position.set(0, 0, 300);
this.controls.target.set(0, 0, 0);
this.controls.update();
```

}

// fillColors - populates the colour buffer based on the active colour mode.
private fillColors(
colors: Float32Array,
mesh:   Mesh,
minZ:   number,
maxZ:   number
): void {

```
const zRange = maxZ - minZ || 1;

mesh.points.forEach((p, i) => {

  let r: number;
  let g: number;
  let b: number;

  if (this.opts.colorMode === "texture" || this.opts.colorMode === "wireframe") {
    // Use original image colour, normalised 0-255 to 0-1.
    r = p.r / 255;
    g = p.g / 255;
    b = p.b / 255;

  } else if (this.opts.colorMode === "depth") {
    // Heatmap: map Z (0-1) to blue -> cyan -> green -> yellow -> red.
    const t = (p.z - minZ) / zRange;
    r = Math.min(1, t * 2);
    g = Math.min(1, t < 0.5 ? t * 2 : 2 - t * 2);
    b = Math.max(0, 1 - t * 2);

  } else {
    // "normals" mode - rainbow cycle based on index.
    const h = (i / mesh.points.length) * 360;
    const result = hslToRgb(h, 0.8, 0.6);
    r = result[0];
    g = result[1];
    b = result[2];
  }

  colors[i * 3]     = r;
  colors[i * 3 + 1] = g;
  colors[i * 3 + 2] = b;
});
```

}

// buildMaterial - returns the right Three.js material for the colour mode.
private buildMaterial(): THREE.Material {

```
if (this.opts.colorMode === "wireframe") {
  return new THREE.MeshBasicMaterial({
    color:     0x00ff88,
    wireframe: true,
  });
}

// MeshStandardMaterial responds to lights realistically.
// vertexColors: true uses our per-vertex colour array.
return new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness:    0.7,
  metalness:    0.1,
  side:         THREE.DoubleSide,
});
```

}

// setColorMode - hot-swap the colour mode without reloading the mesh.
setColorMode(mode: ViewerOptions[“colorMode”]): void {
this.opts.colorMode = mode;
if (this.lastMesh) this.load(this.lastMesh, this.lastCanvas ?? undefined);
}

setAutoRotate(on: boolean): void {
this.controls.autoRotate = on;
}

// screenshot - renders one frame and triggers a PNG download.
screenshot(filename: string = “cpg-model.png”): void {
this.renderer.render(this.scene, this.camera);
const url = this.opts.canvas.toDataURL(“image/png”);
const a   = document.createElement(“a”);
a.href     = url;
a.download = filename;
a.click();
}

// animate - the render loop, called once per frame (~60fps).
private animate(): void {
this.frameId = requestAnimationFrame(() => this.animate());
this.controls.update();
this.renderer.render(this.scene, this.camera);
}

// onResize - called when the canvas element changes size.
private onResize(): void {
const canvas = this.opts.canvas;
const w = canvas.clientWidth;
const h = canvas.clientHeight;
this.camera.aspect = w / h;
this.camera.updateProjectionMatrix();
this.renderer.setSize(w, h);
}

// dispose - clean up to avoid memory leaks.
dispose(): void {
cancelAnimationFrame(this.frameId);
this.controls.dispose();
this.renderer.dispose();
}
}

// hslToRgb
// Converts Hue-Saturation-Lightness to 0-1 RGB.
// h = 0-360, s = 0-1, l = 0-1
// Returns [r, g, b] each 0-1.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
const k = (n: number) => (n + h / 30) % 12;
const a = s * Math.min(l, 1 - l);
const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
return [f(0), f(8), f(4)];
}
