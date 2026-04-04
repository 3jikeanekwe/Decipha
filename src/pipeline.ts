// ============================================================
// pipeline.ts
// The main entry point that chains all stages together.
//
// Each stage is a pure function:
//   input state → output state (nothing mutated)
//
// You can run all stages in one call, or stop at any stage
// to inspect or export the intermediate result.
// ============================================================

import { ImageState }                         from “./types”;
import { readPixelsFromImage, pixelsToCode }  from “./pixelReader”;
import { detectEdges, edgesToCode }           from “./edgeDetector”;
import { removeBackground, backgroundToCode } from “./backgroundRemover”;
import { assignDepth, buildMesh, meshToCode, meshToOBJ } from “./depthMapper”;

// ─────────────────────────────────────────────
// PipelineOptions
//
// All settings in one object so callers can tune behaviour
// without touching the code.
// ─────────────────────────────────────────────
export interface PipelineOptions {
edgeThreshold:       number; // 0–255, lower = more edges detected
backgroundThreshold: number; // 0–255, higher = only strong edges act as walls
zScale:              number; // how tall the 3D extrusion is (pixels)
}

// Sensible defaults if the caller doesn’t supply options.
const DEFAULT_OPTIONS: PipelineOptions = {
edgeThreshold:       30,
backgroundThreshold: 30,
zScale:              50,
};

// ─────────────────────────────────────────────
// runPipeline
//
// Runs all four stages in sequence on an <img> element.
// Returns the final ImageState and a map of code outputs
// so you can inspect or download results at any stage.
// ─────────────────────────────────────────────
export function runPipeline(
img:     HTMLImageElement,
options: Partial<PipelineOptions> = {}
): {
state:    ImageState;
outputs:  Record<string, string>; // stage name → code text
} {

// Merge caller options with defaults.
// The spread means any option not supplied falls back to DEFAULT_OPTIONS.
const opts: PipelineOptions = { …DEFAULT_OPTIONS, …options };

// ── Stage 1: Read pixels ──
// The canvas reads every pixel from the image into our Pixel format.
console.log(”[1/4] Reading pixels…”);
let state = readPixelsFromImage(img);
const pixelCode = pixelsToCode(state);
console.log(`  → ${state.pixels.length} pixels read (${state.width}×${state.height})`);

// ── Stage 2: Edge detection ──
// Run Sobel on the pixel grid to find boundaries.
console.log(”[2/4] Detecting edges…”);
state = detectEdges(state, opts.edgeThreshold);
const edgeCode = edgesToCode(state);
console.log(`  → ${state.edges.length} edge pixels found`);

// ── Stage 3: Background removal ──
// Flood-fill from the borders to find and erase the background.
console.log(”[3/4] Removing background…”);
state = removeBackground(state, opts.backgroundThreshold);
const fgCode = backgroundToCode(state);
const fgCount = state.pixels.filter(p => p.a > 0).length;
console.log(`  → ${fgCount} foreground pixels kept`);

// ── Stage 4: Build 3D mesh ──
// Assign depth values then triangulate into a mesh.
console.log(”[4/4] Building 3D mesh…”);
state = assignDepth(state);
const mesh = buildMesh(state, opts.zScale);
// Attach the mesh to the state so callers can access it.
state = { …state, mesh };
const meshCode = meshToCode(mesh);
const objCode  = meshToOBJ(mesh);
console.log(`  → ${mesh.points.length} vertices, ${mesh.triangles.length} triangles`);

console.log(“Pipeline complete.”);

return {
state,
outputs: {
pixels:     pixelCode,  // raw RGBA per pixel
edges:      edgeCode,   // edge positions, magnitude, angle
foreground: fgCode,     // background-removed pixels
mesh:       meshCode,   // CPG mesh format
obj:        objCode,    // Wavefront OBJ for Blender / Three.js
},
};
}

// ─────────────────────────────────────────────
// downloadText
//
// Utility: trigger a file download in the browser.
// Pass the text content and a filename.
// ─────────────────────────────────────────────
export function downloadText(content: string, filename: string): void {

// Create a Blob (binary large object) from the text string.
const blob = new Blob([content], { type: “text/plain” });

// Create a temporary URL pointing to the blob.
const url = URL.createObjectURL(blob);

// Create an invisible <a> tag and click it to trigger download.
const a = document.createElement(“a”);
a.href     = url;
a.download = filename;
a.click();

// Clean up the temporary URL — it’s no longer needed.
URL.revokeObjectURL(url);
}
