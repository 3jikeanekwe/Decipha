// pixelReader.ts
// Stage 1 - Read every pixel out of an image and store it
// in your own custom format (not XML, not SVG).

import { Pixel, ImageState } from “./types”;

// readPixelsFromImage
// Takes an HTMLImageElement and returns a fully populated ImageState.
// Steps:
//   1. Create an off-screen canvas the same size as the image.
//   2. Draw the image onto that canvas.
//   3. Call getImageData() to get a flat byte array: [R,G,B,A, R,G,B,A, …]
//   4. Loop through every group of 4 bytes and build a Pixel object.
export function readPixelsFromImage(img: HTMLImageElement): ImageState {

// Create a canvas element in memory - never appears on screen.
const canvas = document.createElement(“canvas”);

// Match the canvas size exactly to the image.
canvas.width  = img.naturalWidth;
canvas.height = img.naturalHeight;

// Get a 2D drawing context.
const ctx = canvas.getContext(“2d”);
if (!ctx) throw new Error(“Could not get 2D context from canvas”);

// Draw the image at position (0, 0).
ctx.drawImage(img, 0, 0);

// getImageData returns a Uint8ClampedArray - values are clamped to 0-255.
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const raw       = imageData.data;

const width  = canvas.width;
const height = canvas.height;

const pixels: Pixel[] = [];

// Loop over every row (y) and every column (x).
for (let y = 0; y < height; y++) {
for (let x = 0; x < width; x++) {

```
  // The flat array stores pixels row by row.
  // To find pixel (x, y): skip y full rows, then x pixels,
  // then multiply by 4 because each pixel is 4 bytes (RGBA).
  const i = (y * width + x) * 4;

  pixels.push({
    x,
    y,
    r: raw[i],
    g: raw[i + 1],
    b: raw[i + 2],
    a: raw[i + 3],
  });
}
```

}

return {
width,
height,
pixels,
edges: [],
depthPixels: [],
mesh: null,
};
}

// pixelsToCode
// Converts the pixel array into your custom text format.
// Not XML and not SVG - you define the syntax.
// Format: P <x> <y> rgb(<r>,<g>,<b>) a:<alpha>
export function pixelsToCode(state: ImageState): string {

const lines: string[] = [
“// CPG (Custom Pixel Graphics) v1.0”,
“// “ + new Date().toISOString(),
“META width:” + state.width + “ height:” + state.height + “ pixels:” + state.pixels.length,
“”,
];

for (const p of state.pixels) {
const x = p.x.toString().padStart(4, “ “);
const y = p.y.toString().padStart(4, “ “);
lines.push(“P “ + x + “ “ + y + “  rgb(” + p.r + “,” + p.g + “,” + p.b + “)  a:” + p.a);
}

return lines.join(”\n”);
}

// codeToPixels
// Parses the text format back into Pixel objects.
export function codeToPixels(code: string): Pixel[] {
const pixels: Pixel[] = [];

for (const line of code.split(”\n”)) {

```
// Only process lines that start with "P "
if (!line.startsWith("P ")) continue;

// Example line: "P    0    0  rgb(255,120,30)  a:255"
const match = line.match(
  /P\s+(\d+)\s+(\d+)\s+rgb\((\d+),(\d+),(\d+)\)\s+a:(\d+)/
);

if (!match) continue;

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