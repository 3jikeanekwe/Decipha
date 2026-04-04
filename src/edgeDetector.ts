// edgeDetector.ts
// Stage 2 - Find every edge in the image using the Sobel operator.
//
// An “edge” is a place where colour changes sharply.
// We measure that sharpness by comparing each pixel’s brightness
// to the 8 pixels surrounding it using a maths formula.

import { EdgePixel, ImageState } from “./types”;

// luminance
// Converts an RGB colour to a single brightness number (0-255).
// Standard human-perception weighting:
//   green contributes most, red a bit less, blue the least.
function luminance(r: number, g: number, b: number): number {
return 0.299 * r + 0.587 * g + 0.114 * b;
}

// detectEdges
// The Sobel operator - the standard formula for edge detection.
//
// For each pixel we look at the 3x3 grid of pixels around it.
// We apply two kernels (small grids of weights):
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
// magnitude = sqrt(Gx*Gx + Gy*Gy)  - how strong the edge is
// angle     = atan2(Gy, Gx)         - which direction the edge runs
//
// threshold: only keep pixels where magnitude > this value.
export function detectEdges(state: ImageState, threshold: number = 30): ImageState {

const { pixels, width, height } = state;

// Build a fast lookup: key “x,y” -> luminance value
const grid = new Map<string, number>();

for (const p of pixels) {
grid.set(p.x + “,” + p.y, luminance(p.r, p.g, p.b));
}

// Helper: get brightness of pixel at (x, y).
// If (x, y) is outside the image, return 0.
const lum = (x: number, y: number): number => {
if (x < 0 || x >= width || y < 0 || y >= height) return 0;
return grid.get(x + “,” + y) ?? 0;
};

const edges: EdgePixel[] = [];

for (let y = 0; y < height; y++) {
for (let x = 0; x < width; x++) {

```
  // Apply the horizontal Sobel kernel
  const gx =
    -1 * lum(x - 1, y - 1) + 0 * lum(x, y - 1) + 1 * lum(x + 1, y - 1) +
    -2 * lum(x - 1, y)     + 0 * lum(x, y)      + 2 * lum(x + 1, y)     +
    -1 * lum(x - 1, y + 1) + 0 * lum(x, y + 1)  + 1 * lum(x + 1, y + 1);

  // Apply the vertical Sobel kernel
  const gy =
    -1 * lum(x - 1, y - 1) + -2 * lum(x, y - 1) + -1 * lum(x + 1, y - 1) +
     0 * lum(x - 1, y)     +  0 * lum(x, y)      +  0 * lum(x + 1, y)     +
     1 * lum(x - 1, y + 1) +  2 * lum(x, y + 1)  +  1 * lum(x + 1, y + 1);

  // Total gradient strength (Pythagorean theorem)
  const magnitude = Math.sqrt(gx * gx + gy * gy);

  // Only record this pixel as an edge if it is strong enough
  if (magnitude > threshold) {
    const angle = Math.atan2(gy, gx);
    edges.push({ x, y, magnitude, angle });
  }
}
```

}

return { …state, edges };
}

// edgesToCode
// Serialise the edge results into your custom code format.
export function edgesToCode(state: ImageState): string {

const lines: string[] = [
“// CPG Edge Map v1.0”,
“META width:” + state.width + “ height:” + state.height + “ edgeCount:” + state.edges.length,
“”,
];

for (const e of state.edges) {

```
// Convert radians to degrees for readability
const degrees = ((e.angle * 180) / Math.PI + 360) % 360;

const arrow =
  degrees < 45  ? "->" :
  degrees < 135 ? "v"  :
  degrees < 225 ? "<-" :
  degrees < 315 ? "^"  : "->";

const mag = e.magnitude.toFixed(2).padStart(7, " ");
const deg = degrees.toFixed(1).padStart(6, " ");

lines.push(
  "E " + e.x.toString().padStart(4) + " " + e.y.toString().padStart(4) +
  "  mag:" + mag + "  angle:" + deg + "deg  " + arrow
);
```

}

return lines.join(”\n”);
}