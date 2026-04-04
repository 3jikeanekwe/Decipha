// depthMapper.ts
// Stage 4 - Assign a Z (depth) value to every pixel, then
// triangulate the result into a real 3D mesh.
//
// We estimate depth from two signals in the image:
//   1. Luminance  - brighter pixels are assumed to be closer.
//   2. Edge strength - pixels near sharp edges get pushed back (lower Z).
//
// Formula per pixel:
//   Z = (luminance * 0.6) + (edgeInverse * 0.4)
//
// After depth is assigned, we triangulate by connecting each pixel
// to its right and bottom neighbours, forming two triangles per cell.

import { ImageState, DepthPixel, Point3D, Triangle, Mesh } from “./types”;

// luminance normalised to 0-1
function luminance(r: number, g: number, b: number): number {
return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// assignDepth
// Adds a z field to every pixel. z ranges from 0.0 (far) to 1.0 (close).
export function assignDepth(state: ImageState): ImageState {

const { pixels, edges } = state;

// Build a lookup of edge magnitude by position, normalised to 0-1.
const edgeMag = new Map<string, number>();
let maxMag = 0;

for (const e of edges) {
if (e.magnitude > maxMag) maxMag = e.magnitude;
}
for (const e of edges) {
edgeMag.set(e.x + “,” + e.y, e.magnitude / (maxMag || 1));
}

const depthPixels: DepthPixel[] = pixels.map(p => {

```
// Background pixels get Z = 0
if (p.a === 0) return { ...p, z: 0 };

const lum = luminance(p.r, p.g, p.b);
const edgeStrength = edgeMag.get(p.x + "," + p.y) ?? 0;

// edgeInverse: strong edge -> low value -> pulls Z down (it is a rim).
const edgeInverse = 1 - edgeStrength;

// Combine: luminance is the primary driver (60%), edge inverse secondary (40%).
const z = lum * 0.6 + edgeInverse * 0.4;

return { ...p, z };
```

});

return { …state, depthPixels };
}

// buildMesh
// Converts the depthPixel array into a 3D mesh.
//
// zScale controls how tall the 3D relief is.
//
// Triangulation: for every pixel that has a right and bottom neighbour,
// we create 2 triangles sharing the diagonal:
//
//   A - B
//   | \ |
//   C - D
//
//   Triangle 1: A, B, C
//   Triangle 2: B, D, C
export function buildMesh(state: ImageState, zScale: number = 50): Mesh {

const { depthPixels, width, height } = state;

// Map (x, y) -> index in depthPixels array
const indexMap = new Map<string, number>();
depthPixels.forEach((p, i) => indexMap.set(p.x + “,” + p.y, i));

// Build the Point3D list.
// Scale z by zScale so depth differences are visible.
const points: Point3D[] = depthPixels.map(p => ({
x: p.x,
y: p.y,
z: p.z * zScale,
r: p.r,
g: p.g,
b: p.b,
}));

const triangles: Triangle[] = [];

// Only iterate to (width-1) and (height-1) because we look one step ahead.
for (let y = 0; y < height - 1; y++) {
for (let x = 0; x < width - 1; x++) {

```
  const iA = indexMap.get(x + "," + y);
  const iB = indexMap.get((x + 1) + "," + y);
  const iC = indexMap.get(x + "," + (y + 1));
  const iD = indexMap.get((x + 1) + "," + (y + 1));

  if (iA === undefined || iB === undefined ||
      iC === undefined || iD === undefined) continue;

  // Skip cells where all corners are transparent
  const allBackground =
    depthPixels[iA].a === 0 &&
    depthPixels[iB].a === 0 &&
    depthPixels[iC].a === 0 &&
    depthPixels[iD].a === 0;
  if (allBackground) continue;

  // Triangle 1: top-left, top-right, bottom-left
  triangles.push({ a: iA, b: iB, c: iC });

  // Triangle 2: top-right, bottom-right, bottom-left
  triangles.push({ a: iB, b: iD, c: iC });
}
```

}

return { points, triangles };
}

// meshToCode
// Serialise the 3D mesh into your custom code format.
// V lines = vertices, T lines = triangles.
export function meshToCode(mesh: Mesh): string {

const lines: string[] = [
“// CPG Mesh v1.0”,
“META vertices:” + mesh.points.length + “ triangles:” + mesh.triangles.length,
“”,
];

mesh.points.forEach((p, i) => {
lines.push(
“V “ + i.toString().padStart(6) +
“  x:” + p.x.toFixed(1).padStart(7) +
“  y:” + p.y.toFixed(1).padStart(7) +
“  z:” + p.z.toFixed(2).padStart(7) +
“  rgb(” + p.r + “,” + p.g + “,” + p.b + “)”
);
});

lines.push(””);

for (const t of mesh.triangles) {
lines.push(
“T  a:” + t.a.toString().padStart(6) +
“  b:” + t.b.toString().padStart(6) +
“  c:” + t.c.toString().padStart(6)
);
}

return lines.join(”\n”);
}

// meshToOBJ
// Export the mesh in standard Wavefront OBJ format.
// This lets you import into Blender, Three.js, or any 3D tool.
export function meshToOBJ(mesh: Mesh): string {

const lines: string[] = [
“# Exported from CPG Pipeline”,
“# Vertices: “ + mesh.points.length,
“# Triangles: “ + mesh.triangles.length,
“”,
];

// “v x y z” - one line per vertex.
// OBJ uses Y-up, so we negate Y to avoid upside-down output.
for (const p of mesh.points) {
lines.push(“v “ + p.x.toFixed(4) + “ “ + (-p.y).toFixed(4) + “ “ + p.z.toFixed(4));
}

lines.push(””);

// “f a b c” - one line per triangle face.
// OBJ indices start at 1, not 0.
for (const t of mesh.triangles) {
lines.push(“f “ + (t.a + 1) + “ “ + (t.b + 1) + “ “ + (t.c + 1));
}

return lines.join(”\n”);
}