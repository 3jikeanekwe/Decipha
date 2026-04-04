// backgroundRemover.ts
// Stage 3 - Remove the background by flood-filling from
// the image borders inward, stopping at edge pixels.
//
// The idea:
//   Start at every border pixel.
//   Spread inward (like water flooding a room).
//   Whenever you hit an edge, stop - you cannot cross a wall.
//   Everything you reached = background -> set alpha to 0 (transparent).
//   Everything you never reached = inside the subject -> keep it.

import { ImageState } from “./types”;

// removeBackground
// edgeThreshold: edges with magnitude above this are treated as walls.
export function removeBackground(
state: ImageState,
edgeThreshold: number = 30
): ImageState {

const { width, height, pixels, edges } = state;

// Build a Set of edge positions for fast lookup.
// Key = “x,y” string.
const edgeSet = new Set<string>();
for (const e of edges) {
if (e.magnitude > edgeThreshold) {
edgeSet.add(e.x + “,” + e.y);
}
}

// Build a grid of all pixel alpha values.
const alphaGrid = new Map<string, number>();
for (const p of pixels) {
alphaGrid.set(p.x + “,” + p.y, p.a);
}

// Flood fill using a queue (breadth-first search).
const queue: Array<{ x: number; y: number }> = [];
const visited = new Set<string>();

// Seed the queue with every pixel on the image border.
for (let x = 0; x < width; x++) {
queue.push({ x, y: 0 });
queue.push({ x, y: height - 1 });
visited.add(x + “,0”);
visited.add(x + “,” + (height - 1));
}
for (let y = 1; y < height - 1; y++) {
queue.push({ x: 0, y });
queue.push({ x: width - 1, y });
visited.add(“0,” + y);
visited.add((width - 1) + “,” + y);
}

// Process the queue until empty.
while (queue.length > 0) {

```
const item = queue.shift();
if (!item) break;
const { x, y } = item;
const key = x + "," + y;

// If this pixel is an edge wall, stop here.
if (edgeSet.has(key)) continue;

// This pixel is reachable from outside -> background.
alphaGrid.set(key, 0);

// Check 4 direct neighbours (up, down, left, right).
const neighbours = [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 },
];

for (const n of neighbours) {
  if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
  const nKey = n.x + "," + n.y;
  if (visited.has(nKey)) continue;
  visited.add(nKey);
  queue.push(n);
}
```

}

// Rebuild the pixel array with updated alpha values.
const newPixels = pixels.map(p => ({
…p,
a: alphaGrid.get(p.x + “,” + p.y) ?? p.a,
}));

return { …state, pixels: newPixels };
}

// backgroundToCode
// Serialise only the foreground (non-transparent) pixels.
export function backgroundToCode(state: ImageState): string {

const fg = state.pixels.filter(p => p.a > 0);

const lines: string[] = [
“// CPG Foreground v1.0”,
“META width:” + state.width + “ height:” + state.height + “ foregroundPixels:” + fg.length,
“”,
];

for (const p of fg) {
lines.push(
“P “ + p.x.toString().padStart(4) + “ “ + p.y.toString().padStart(4) +
“  rgb(” + p.r + “,” + p.g + “,” + p.b + “)  a:” + p.a
);
}

return lines.join(”\n”);
}