// pipeline.ts
// The main entry point that chains all stages together.
//
// Each stage is a pure function: input state -> output state.
// You can run all stages in one call, or stop at any stage.

import { ImageState } from “./types”;
import { readPixelsFromImage, pixelsToCode } from “./pixelReader”;
import { detectEdges, edgesToCode } from “./edgeDetector”;
import { removeBackground, backgroundToCode } from “./backgroundRemover”;
import { assignDepth, buildMesh, meshToCode, meshToOBJ } from “./depthMapper”;

// PipelineOptions - all settings in one object.
export interface PipelineOptions {
edgeThreshold: number;       // 0-255, lower = more edges detected
backgroundThreshold: number; // 0-255, higher = only strong edges are walls
zScale: number;              // how tall the 3D extrusion is (pixels)
}

const DEFAULT_OPTIONS: PipelineOptions = {
edgeThreshold: 30,
backgroundThreshold: 30,
zScale: 50,
};

// runPipeline
// Runs all four stages in sequence on an <img> element.
// Returns the final ImageState and a map of code outputs.
export function runPipeline(
img: HTMLImageElement,
options: Partial<PipelineOptions> = {}
): {
state: ImageState;
outputs: Record<string, string>;
} {

// Merge caller options with defaults.
const opts: PipelineOptions = { …DEFAULT_OPTIONS, …options };

// Stage 1: Read pixels
console.log(”[1/4] Reading pixels…”);
let state = readPixelsFromImage(img);
const pixelCode = pixelsToCode(state);
console.log(”  -> “ + state.pixels.length + “ pixels read (” + state.width + “x” + state.height + “)”);

// Stage 2: Edge detection
console.log(”[2/4] Detecting edges…”);
state = detectEdges(state, opts.edgeThreshold);
const edgeCode = edgesToCode(state);
console.log(”  -> “ + state.edges.length + “ edge pixels found”);

// Stage 3: Background removal
console.log(”[3/4] Removing background…”);
state = removeBackground(state, opts.backgroundThreshold);
const fgCode = backgroundToCode(state);
const fgCount = state.pixels.filter(p => p.a > 0).length;
console.log(”  -> “ + fgCount + “ foreground pixels kept”);

// Stage 4: Build 3D mesh
console.log(”[4/4] Building 3D mesh…”);
state = assignDepth(state);
const mesh = buildMesh(state, opts.zScale);
state = { …state, mesh };
const meshCode = meshToCode(mesh);
const objCode  = meshToOBJ(mesh);
console.log(”  -> “ + mesh.points.length + “ vertices, “ + mesh.triangles.length + “ triangles”);

console.log(“Pipeline complete.”);

return {
state,
outputs: {
pixels:     pixelCode,
edges:      edgeCode,
foreground: fgCode,
mesh:       meshCode,
obj:        objCode,
},
};
}

// downloadText
// Triggers a file download in the browser.
export function downloadText(content: string, filename: string): void {
const blob = new Blob([content], { type: “text/plain” });
const url  = URL.createObjectURL(blob);
const a    = document.createElement(“a”);
a.href     = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
}