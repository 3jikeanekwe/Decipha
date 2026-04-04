// ============================================================
// edgeDetector.ts
// Stage 2 — Find every edge in the image using the Sobel operator.
//
// An “edge” is a place where colour changes sharply.
// We measure that sharpness by comparing each pixel’s brightness
// to the 8 pixels surrounding it using a maths formula.
//
// Output: an EdgePixel for every pixel that is “edgy enough”,
// including the magnitude (strength) and angle (direction).
// ============================================================

import { Pixel, EdgePixel, ImageState } from “./types”;

// ─────────────────────────────────────────────
// luminance
//
// Converts an RGB colour to a single brightness number (0–255).
// This is the standard human-perception weighting:
//   green contributes most (we see it strongly),
//   red a bit less, blue the least.
// We need one number per pixel to compare brightness differences.
// ─────────────────────────────────────────────
function luminance(r: number, g: number, b: number): number {
return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ─────────────────────────────────────────────
// detectEdges
//
// The Sobel operator — the standard formula for edge detection.
//
// For each pixel we look at the 3×3 grid of pixels around it.
// We apply two “kernels” (small grids of weights):
//
//   Horizontal kernel (detects vertical edges):
//   [ -1,  0, +1 ]
//   [ -2,  0, +2 ]
//   [ -1,  0, +1 ]
//
//   Vertical kernel (detects horizontal edges):
//   [ -1, -2, -1 ]
//   [  0,  0,  0 ]
//   [ +1, +2, +1 ]
//
// Multiply each neighbour’s brightness by its kernel weight,
// add them up → you get Gx (horizontal gradient) and Gy (vertical).
//
// magnitude = √(Gx² + Gy²)  — how strong the edge is
// angle     = atan2(Gy, Gx) — which direction the edge runs
//
// threshold: only keep pixels where magnitude > this value.
// Lower threshold = more edges detected (noisier).
// Higher threshold = only strong, clear edges.
// ─────────────────────────────────────────────
export function detectEdges(state: ImageState, threshold: number = 30): ImageState {

const { pixels, width, height } = state;

// Build a 2D lookup so we can fetch pixel (x, y) by position.
// A flat Map keyed by “x,y” is simpler than a 2D array here.
const grid = new Map<string, number>(); // key → luminance value

for (const p of pixels) {
grid.set(`${p.x},${p.y}`, luminance(p.r, p.g, p.b));
}

// Helper: get the brightness of pixel at (x, y).
// If (x, y) is outside the image, return 0 — treat the border as black.
const lum = (x: number, y: number): number => {
if (x < 0 || x >= width || y < 0 || y >= height) return 0;
return grid.get(`${x},${y}`) ?? 0;
};

const edges: EdgePixel[] = [];

// Loop over every pixel in the image.
for (let y = 0; y < height; y++) {
for (let x = 0; x < width; x++) {

```
  // ── Apply the horizontal Sobel kernel ──
  // We multiply each of the 8 neighbours (and the centre)
  // by its kernel weight and sum up.
  // The centre weight is 0 in both kernels, so we skip it.
  const gx =
    -1 * lum(x - 1, y - 1) +  0 * lum(x, y - 1) +  1 * lum(x + 1, y - 1) +
    -2 * lum(x - 1, y)     +  0 * lum(x, y)      +  2 * lum(x + 1, y)     +
    -1 * lum(x - 1, y + 1) +  0 * lum(x, y + 1) +  1 * lum(x + 1, y + 1);

  // ── Apply the vertical Sobel kernel ──
  const gy =
    -1 * lum(x - 1, y - 1) + -2 * lum(x, y - 1) + -1 * lum(x + 1, y - 1) +
     0 * lum(x - 1, y)     +  0 * lum(x, y)      +  0 * lum(x + 1, y)     +
     1 * lum(x - 1, y + 1) +  2 * lum(x, y + 1) +  1 * lum(x + 1, y + 1);

  // ── Combine the two gradients ──
  // Pythagorean theorem: the total gradient strength.
  const magnitude = Math.sqrt(gx * gx + gy * gy);

  // ── Threshold check ──
  // Only record this pixel as an edge if it's strong enough.
  if (magnitude > threshold) {

    // atan2 gives the angle in radians from -π to +π.
    // This tells us which direction the boundary runs at this point.
    const angle = Math.atan2(gy, gx);

    edges.push({ x, y, magnitude, angle });
  }
}
```

}

// Return a new state with the edges field filled in.
// We never modify the input — every stage returns a fresh object.
return { …state, edges };
}

// ─────────────────────────────────────────────
// edgesToCode
//
// Serialise the edge results into your custom code format.
// Each edge line contains position, magnitude, angle,
// and a human-readable direction arrow.
// ─────────────────────────────────────────────
export function edgesToCode(state: ImageState): string {

const lines: string[] = [
`// CPG Edge Map v1.0`,
`META width:${state.width} height:${state.height} edgeCount:${state.edges.length}`,
``,
];

for (const e of state.edges) {

```
// Convert the radian angle to degrees for readability (0–360).
const degrees = ((e.angle * 180) / Math.PI + 360) % 360;

// A simple arrow character shows the edge direction at a glance.
const arrow =
  degrees < 45  ? "→" :
  degrees < 135 ? "↓" :
  degrees < 225 ? "←" :
  degrees < 315 ? "↑" : "→";

const mag = e.magnitude.toFixed(2).padStart(7, " ");
const deg = degrees.toFixed(1).padStart(6, " ");

lines.push(
  `E ${e.x.toString().padStart(4)} ${e.y.toString().padStart(4)}  mag:${mag}  angle:${deg}°  ${arrow}`
);
```

}

return lines.join(”\n”);
}
