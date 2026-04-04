// ============================================================
// pixelReader.ts
// Stage 1 — Read every pixel out of an image and store it
// in your own custom format (not XML, not SVG).
//
// The browser gives us raw bytes via the Canvas API.
// We turn those bytes into structured Pixel objects,
// and then into a plain-text code format you own entirely.
// ============================================================

import { Pixel, ImageState } from “./types”;

// ─────────────────────────────────────────────
// readPixelsFromImage
//
// Takes an HTMLImageElement (a loaded <img> tag) and
// returns a fully populated ImageState with every pixel read.
//
// How it works:
//   1. Create an off-screen canvas the same size as the image.
//   2. Draw the image onto that canvas.
//   3. Call getImageData() — the browser hands us a flat byte array:
//      [R, G, B, A,  R, G, B, A,  R, G, B, A, …]
//      Four bytes per pixel, left-to-right, top-to-bottom.
//   4. Loop through every group of 4 bytes and build a Pixel object.
// ─────────────────────────────────────────────
export function readPixelsFromImage(img: HTMLImageElement): ImageState {

// Create a canvas element in memory — it never appears on screen.
const canvas = document.createElement(“canvas”);

// Match the canvas size exactly to the image so no scaling happens.
canvas.width  = img.naturalWidth;   // naturalWidth = actual pixel width, not CSS width
canvas.height = img.naturalHeight;

// Get a 2D drawing context — this is what lets us draw and read pixels.
const ctx = canvas.getContext(“2d”);
if (!ctx) throw new Error(“Could not get 2D context from canvas”);

// Draw the image at position (0, 0) — top-left corner, no scaling.
ctx.drawImage(img, 0, 0);

// getImageData returns an ImageData object.
// .data is a Uint8ClampedArray — values are clamped to 0–255 automatically.
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const raw       = imageData.data; // the flat [R,G,B,A, R,G,B,A, …] array

const width  = canvas.width;
const height = canvas.height;

// We’ll collect every pixel here.
const pixels: Pixel[] = [];

// Loop over every row (y) and every column (x).
for (let y = 0; y < height; y++) {
for (let x = 0; x < width; x++) {

```
  // The flat array stores pixels row by row.
  // To find pixel (x, y), skip y full rows, then x pixels,
  // then multiply by 4 because each pixel is 4 bytes (RGBA).
  const i = (y * width + x) * 4;

  pixels.push({
    x,
    y,
    r: raw[i],       // red   channel
    g: raw[i + 1],   // green channel
    b: raw[i + 2],   // blue  channel
    a: raw[i + 3],   // alpha channel
  });
}
```

}

// Return the initial ImageState.
// edges / depthPixels / mesh are empty for now — later stages fill them.
return {
width,
height,
pixels,
edges:       [],
depthPixels: [],
mesh:        null,
};
}

// ─────────────────────────────────────────────
// pixelsToCode
//
// Converts the pixel array into your custom text format.
// This is NOT XML and NOT SVG.
// You define the syntax — here we use a simple line-based format:
//
//   P <x> <y> rgb(<r>,<g>,<b>) a:<alpha>
//
// One line per pixel. Readable, parseable, yours.
// You can change this format to anything you want —
// this is just a starting point to show the idea.
// ─────────────────────────────────────────────
export function pixelsToCode(state: ImageState): string {

// Header — metadata so anyone reading the file knows what it is.
const lines: string[] = [
`// CPG (Custom Pixel Graphics) v1.0`,
`// ${new Date().toISOString()}`,
`META width:${state.width} height:${state.height} pixels:${state.pixels.length}`,
``,  // blank line for readability
];

// One line per pixel.
for (const p of state.pixels) {
// padStart keeps numbers aligned so the file is easier to read.
const x = p.x.toString().padStart(4, “ “);
const y = p.y.toString().padStart(4, “ “);
lines.push(`P ${x} ${y}  rgb(${p.r},${p.g},${p.b})  a:${p.a}`);
}

// Join all lines with newline characters into one big string.
return lines.join(”\n”);
}

// ─────────────────────────────────────────────
// codeToPixels
//
// The reverse: parse the text format back into Pixel objects.
// This lets you store the code in a file and reload it later
// without keeping the original image around.
// ─────────────────────────────────────────────
export function codeToPixels(code: string): Pixel[] {
const pixels: Pixel[] = [];

// Split the text into lines and handle each one.
for (const line of code.split(”\n”)) {

```
// Only process lines that start with "P " — skip headers and blanks.
if (!line.startsWith("P ")) continue;

// Example line: "P    0    0  rgb(255,120,30)  a:255"
// We pull out the numbers with a regular expression.
const match = line.match(
  /P\s+(\d+)\s+(\d+)\s+rgb\((\d+),(\d+),(\d+)\)\s+a:(\d+)/
);

if (!match) continue; // skip malformed lines

pixels.push({
  x: parseInt(match[1]),
  y: parseInt(match[2]),
  r: parseInt(match[3]),
  g: parseInt(match[4]),
  b: parseInt(match[5]),
  a: parseInt(match[6]),
});
```

}

return pixels;
}
