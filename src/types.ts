// types.ts
// All shared data structures used across the pipeline.

// A single pixel read from the image.
// x, y  = position in the image grid (top-left is 0,0)
// r,g,b = colour channels, each 0-255
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
// magnitude = how strong the edge is (0 = flat, high = sharp boundary)
// angle     = the direction the edge runs, in radians (-PI to PI)
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
export interface Point3D {
x: number;
y: number;
z: number;
r: number;
g: number;
b: number;
}

// One triangle in the 3D mesh.
// a, b, c are indices into a Point3D array.
export interface Triangle {
a: number;
b: number;
c: number;
}

// The finished 3D mesh.
export interface Mesh {
points: Point3D[];
triangles: Triangle[];
}

// The full image state at any stage of the pipeline.
export interface ImageState {
width: number;
height: number;
pixels: Pixel[];
edges: EdgePixel[];
depthPixels: DepthPixel[];
mesh: Mesh | null;
}