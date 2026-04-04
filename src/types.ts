// ============================================================
// types.ts
// All shared data structures used across the pipeline.
// Defining them here means every other file imports from
// one place — no duplication, no confusion about shapes.
// ============================================================

// A single pixel read from the image.
// x, y  = position in the image grid (top-left is 0,0)
// r,g,b = colour channels, each 0–255
// a     = alpha (transparency), 0 = invisible, 255 = fully opaque
export interface Pixel {
x: number;
y: number;
r: number;
g: number;
b: number;
a: number;
}

// The result of running Sobel edge detection on one pixel.
// magnitude = how strong the edge is at this point (0 = flat, high = sharp boundary)
// angle     = the direction the edge runs, in radians (-π to π)
export interface EdgePixel {
x: number;
y: number;
magnitude: number;
angle: number;
}

// A pixel that has been given a depth (Z) value.
// z = 0.0 means far away / background
// z = 1.0 means close / foreground
export interface DepthPixel extends Pixel {
z: number;
}

// A point in 3D space.
// This is what a DepthPixel becomes once we assign real coordinates.
export interface Point3D {
x: number;
y: number;
z: number;
r: number; // keep colour so the mesh can be textured
g: number;
b: number;
}

// One triangle in the 3D mesh.
// a, b, c are indices into a Point3D array — not the points themselves.
// Storing indices keeps the mesh compact and lets points be shared.
export interface Triangle {
a: number;
b: number;
c: number;
}

// The finished 3D mesh — a list of points and a list of triangles.
export interface Mesh {
points:    Point3D[];
triangles: Triangle[];
}

// The full image state at any stage of the pipeline.
// Every stage receives this and returns a new one (nothing is mutated).
export interface ImageState {
width:       number;          // pixel width of the original image
height:      number;          // pixel height
pixels:      Pixel[];         // all pixels, row by row, left to right
edges:       EdgePixel[];     // filled after edge detection step
depthPixels: DepthPixel[];    // filled after depth step
mesh:        Mesh | null;     // filled after 3D step
}
