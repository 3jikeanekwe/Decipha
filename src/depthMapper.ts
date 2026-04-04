// ============================================================
// depthMapper.ts
// Stage 4 — Assign a Z (depth) value to every pixel, then
// triangulate the result into a real 3D mesh.
//
// We don’t have a depth camera, so we estimate depth from
// two signals available in the image itself:
//
//   1. Luminance  — brighter pixels are assumed to be “closer”.
//      This works for most lit objects: the front face catches
//      more light and appears lighter.
//
//   2. Edge strength — pixels near sharp edges are likely on
//      the rim/side of the object, so they get pushed back (lower Z).
//
// Formula:
//   Z = (luminance × 0.6) + (edgeInverse × 0.4)
//
// “edgeInverse” = 1 − normalised edge magnitude.
// A strong edge means “this is a boundary” → low Z (rim/side).
// A weak edge means “this is a surface” → contributes to Z.
//
// After depth is assigned, we triangulate by connecting each
// pixel to its right and bottom neighbours, forming two triangles
// per “cell” — this is the simplest possible mesh tessellation.
// ============================================================

import { ImageState, DepthPixel, Point3D, Triangle, Mesh } from “./types”;

// ─────────────────────────────────────────────
// luminance  (same helper as edgeDetector, repeated for isolation)
// ─────────────────────────────────────────────
function luminance(r: number, g: number, b: number): number {
// Weighted sum — matches human brightness perception.
return (0.299 * r + 0.587 * g + 0.114 * b) / 255; // normalised to 0–1
}

// ─────────────────────────────────────────────
// assignDepth
//
// Adds a `z` field to every pixel.
// z ranges from 0.0 (background/far) to 1.0 (foreground/close).
// ─────────────────────────────────────────────
export function assignDepth(state: ImageState): ImageState {

const { pixels, edges, width, height } = state;

// ── Build a lookup of edge magnitude by position ──
// Normalised so the maximum edge in the image = 1.0.
const edgeMag = new Map<string, number>();
let maxMag = 0;

for (const e of edges) {
if (e.magnitude > maxMag) maxMag = e.magnitude; // find the max first
}
for (const e of edges) {
// Normalise: divide every magnitude by the max so values are 0–1.
edgeMag.set(`${e.x},${e.y}`, e.magnitude / (maxMag || 1));
}

// ── Assign Z to every pixel ──
const depthPixels: DepthPixel[] = pixels.map(p => {

```
// Skip transparent (background) pixels — give them Z = 0.
if (p.a === 0) return { ...p, z: 0 };

// How bright is this pixel? (0.0–1.0)
const lum = luminance(p.r, p.g, p.b);

// How strong is the edge here? (0.0–1.0)
// If there's no edge record for this pixel, default to 0.
const edgeStrength = edgeMag.get(`${p.x},${p.y}`) ?? 0;

// edgeInverse: strong edge → low value → pulls Z down (it's a rim).
const edgeInverse = 1 - edgeStrength;

// Combine: luminance is the primary driver (60%), edge inverse secondary (40%).
// You can tune these weights for different kinds of images.
const z = lum * 0.6 + edgeInverse * 0.4;

return { ...p, z };
```

});

return { …state, depthPixels };
}

// ─────────────────────────────────────────────
// buildMesh
//
// Converts the depthPixel array into a 3D mesh.
//
// Each pixel becomes a 3D point (x, y, z × zScale).
// zScale controls how “tall” the 3D relief is —
// higher = more dramatic depth extrusion.
//
// Triangulation:
//   For every pixel that has a right neighbour and a bottom neighbour,
//   we create 2 triangles sharing the diagonal:
//
//     A ─ B
//     │ ╲ │
//     C ─ D
//
//   Triangle 1: A, B, C
//   Triangle 2: B, D, C
//
//   This tessellates the entire surface with no gaps.
// ─────────────────────────────────────────────
export function buildMesh(state: ImageState, zScale: number = 50): Mesh {

const { depthPixels, width, height } = state;

// ── Map (x, y) → index in the depthPixels array ──
// We need this to look up point indices when building triangles.
const indexMap = new Map<string, number>();
depthPixels.forEach((p, i) => indexMap.set(`${p.x},${p.y}`, i));

// ── Build the Point3D list ──
// We scale x and y by 1 (screen pixels).
// We scale z by zScale so depth differences are visible.
const points: Point3D[] = depthPixels.map(p => ({
x: p.x,
y: p.y,
z: p.z * zScale,   // e.g., a pixel with z=0.8 sits at z=40 in 3D space
r: p.r,
g: p.g,
b: p.b,
}));

// ── Build the triangle list ──
const triangles: Triangle[] = [];

// Only iterate to (width-1) and (height-1) because we look one step ahead.
for (let y = 0; y < height - 1; y++) {
for (let x = 0; x < width - 1; x++) {

```
  // The four corners of the current "cell":
  const iA = indexMap.get(`${x},${y}`);         // top-left
  const iB = indexMap.get(`${x + 1},${y}`);     // top-right
  const iC = indexMap.get(`${x},${y + 1}`);     // bottom-left
  const iD = indexMap.get(`${x + 1},${y + 1}`); // bottom-right

  // Skip this cell if any corner is missing (outside image or no data).
  if (iA === undefined || iB === undefined ||
      iC === undefined || iD === undefined) continue;

  // Skip cells where all corners are transparent (background).
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

// ─────────────────────────────────────────────
// meshToCode
//
// Serialise the 3D mesh into your custom code format.
//
// V lines = vertices (3D points with colour)
// T lines = triangles (three vertex indices)
//
// This is structurally similar to the OBJ 3D file format
// but in your own syntax — you own it completely.
// ─────────────────────────────────────────────
export function meshToCode(mesh: Mesh): string {

const lines: string[] = [
`// CPG Mesh v1.0`,
`META vertices:${mesh.points.length} triangles:${mesh.triangles.length}`,
``,
];

// Write every vertex: V <index>  x:<x>  y:<y>  z:<z>  rgb(<r>,<g>,<b>)
mesh.points.forEach((p, i) => {
lines.push(
`V ${i.toString().padStart(6)}  ` +
`x:${p.x.toFixed(1).padStart(7)}  ` +
`y:${p.y.toFixed(1).padStart(7)}  ` +
`z:${p.z.toFixed(2).padStart(7)}  ` +
`rgb(${p.r},${p.g},${p.b})`
);
});

lines.push(``); // blank line between vertices and triangles

// Write every triangle: T  a:<i>  b:<i>  c:<i>
for (const t of mesh.triangles) {
lines.push(
`T  a:${t.a.toString().padStart(6)}  ` +
`b:${t.b.toString().padStart(6)}  ` +
`c:${t.c.toString().padStart(6)}`
);
}

return lines.join(”\n”);
}

// ─────────────────────────────────────────────
// meshToOBJ
//
// Export the mesh in the standard Wavefront OBJ format.
// This lets you import the result directly into Blender,
// Three.js, or any other 3D tool.
// ─────────────────────────────────────────────
export function meshToOBJ(mesh: Mesh): string {

const lines: string[] = [
`# Exported from CPG Pipeline`,
`# Vertices: ${mesh.points.length}`,
`# Triangles: ${mesh.triangles.length}`,
``,
];

// “v x y z” — one line per vertex position.
// OBJ uses Y-up, so we map our image Y to −Y to avoid upside-down output.
for (const p of mesh.points) {
lines.push(`v ${p.x.toFixed(4)} ${-p.y.toFixed(4)} ${p.z.toFixed(4)}`);
}

lines.push(``);

// “f a b c” — one line per triangle face.
// OBJ indices start at 1 (not 0), so we add 1 to each.
for (const t of mesh.triangles) {
lines.push(`f ${t.a + 1} ${t.b + 1} ${t.c + 1}`);
}

return lines.join(”\n”);
}
