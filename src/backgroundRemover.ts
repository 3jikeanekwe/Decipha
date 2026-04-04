// ============================================================
// backgroundRemover.ts
// Stage 3 — Remove the background by flood-filling from
// the image borders inward, stopping at edge pixels.
//
// The idea:
//   Start at every corner/border pixel.
//   Spread outward (like water flooding a room).
//   Whenever you hit an edge, stop — you can’t cross a wall.
//   Everything you reached = background → set alpha to 0 (transparent).
//   Everything you never reached = inside the subject → keep it.
// ============================================================

import { ImageState, EdgePixel } from “./types”;

// ─────────────────────────────────────────────
// removeBackground
//
// edgeThreshold: edges with magnitude above this are treated
//   as “walls” that block the flood fill.
//   Higher = only strong edges block → more background removed.
//   Lower  = even weak edges block → more conservative removal.
// ─────────────────────────────────────────────
export function removeBackground(
state:          ImageState,
edgeThreshold:  number = 30
): ImageState {

const { width, height, pixels, edges } = state;

// ── Build a set of edge positions for fast lookup ──
// A Set of “x,y” strings lets us check “is this pixel an edge?”
// in O(1) time rather than scanning the whole edges array every time.
const edgeSet = new Set<string>();
for (const e of edges) {
if (e.magnitude > edgeThreshold) {
edgeSet.add(`${e.x},${e.y}`);
}
}

// ── Build a grid of all pixel alpha values ──
// We’ll modify these as we mark pixels as background.
// Key = “x,y”, value = current alpha (starts at original value).
const alphaGrid = new Map<string, number>();
for (const p of pixels) {
alphaGrid.set(`${p.x},${p.y}`, p.a);
}

// ── Flood fill ──
// We use a queue (breadth-first search) so we process pixels level by level,
// spreading outward evenly from every border pixel simultaneously.
const queue: Array<{ x: number; y: number }> = [];

// “visited” tracks pixels we’ve already queued so we don’t process them twice.
const visited = new Set<string>();

// Seed the queue with every pixel on the image border.
// Top and bottom rows:
for (let x = 0; x < width; x++) {
queue.push({ x, y: 0 });           // top edge
queue.push({ x, y: height - 1 }); // bottom edge
visited.add(`${x},0`);
visited.add(`${x},${height - 1}`);
}
// Left and right columns (skip corners — already added above):
for (let y = 1; y < height - 1; y++) {
queue.push({ x: 0,         y }); // left edge
queue.push({ x: width - 1, y }); // right edge
visited.add(`0,${y}`);
visited.add(`${width - 1},${y}`);
}

// Process the queue until it’s empty.
while (queue.length > 0) {

```
// Take the next pixel off the front of the queue.
const { x, y } = queue.shift()!;

const key = `${x},${y}`;

// If this pixel is an edge, stop here — don't cross the wall.
if (edgeSet.has(key)) continue;

// This pixel is reachable from outside → it's background.
// Set its alpha to 0 (fully transparent).
alphaGrid.set(key, 0);

// Check all 4 direct neighbours (up, down, left, right).
// We use 4-connectivity rather than 8 to avoid leaking around corners.
const neighbours = [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 },
];

for (const n of neighbours) {

  // Skip if out of bounds.
  if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;

  const nKey = `${n.x},${n.y}`;

  // Skip if we've already visited this pixel.
  if (visited.has(nKey)) continue;

  visited.add(nKey);
  queue.push(n);
}
```

}

// ── Rebuild the pixel array with updated alpha values ──
const newPixels = pixels.map(p => ({
…p,                                       // copy all fields
a: alphaGrid.get(`${p.x},${p.y}`) ?? p.a,  // use new alpha if set
}));

return { …state, pixels: newPixels };
}

// ─────────────────────────────────────────────
// backgroundToCode
//
// Serialise only the non-transparent (foreground) pixels.
// Background pixels (alpha = 0) are omitted entirely —
// the code only describes the subject.
// ─────────────────────────────────────────────
export function backgroundToCode(state: ImageState): string {

// Only keep pixels that are still visible (alpha > 0).
const fg = state.pixels.filter(p => p.a > 0);

const lines: string[] = [
`// CPG Foreground v1.0`,
`META width:${state.width} height:${state.height} foregroundPixels:${fg.length}`,
``,
];

for (const p of fg) {
lines.push(
`P ${p.x.toString().padStart(4)} ${p.y.toString().padStart(4)}  rgb(${p.r},${p.g},${p.b})  a:${p.a}`
);
}

return lines.join(”\n”);
}
