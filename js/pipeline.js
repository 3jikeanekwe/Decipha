// ============================================================
// js/pipeline.js
// Converts an uploaded image into a 3D mesh + CPG data.
// This is the core of the avatar creation system.
// ============================================================


// ─────────────────────────────────────────────
// STEP 1 — readPixels
// Draw the image onto a hidden canvas then extract
// every pixel's RGBA values as a flat array.
// ─────────────────────────────────────────────
export function readPixels(imgElement) {

  const canvas = document.createElement('canvas');  // off-screen canvas, never shown
  const MAX    = 256;                                // max dimension — larger = slower but more detail

  // Calculate scaled dimensions keeping aspect ratio
  let w = imgElement.naturalWidth;   // actual image width in pixels
  let h = imgElement.naturalHeight;  // actual image height in pixels

  // If image is larger than MAX, scale it down proportionally
  if (w > MAX || h > MAX) {
    const ratio = Math.min(MAX / w, MAX / h);  // find the smaller ratio
    w = Math.round(w * ratio);                 // scale width
    h = Math.round(h * ratio);                 // scale height
  }

  canvas.width  = w;  // set canvas to scaled size
  canvas.height = h;

  const ctx = canvas.getContext('2d');  // get 2D drawing context
  ctx.drawImage(imgElement, 0, 0, w, h);  // draw image scaled into canvas

  // getImageData returns a flat byte array: [R,G,B,A, R,G,B,A, ...]
  const imageData = ctx.getImageData(0, 0, w, h);
  const raw       = imageData.data;  // Uint8ClampedArray, values 0-255

  const pixels = [];  // we'll fill this with pixel objects

  for (let y = 0; y < h; y++) {       // loop every row
    for (let x = 0; x < w; x++) {     // loop every column
      const i = (y * w + x) * 4;      // byte index: each pixel is 4 bytes

      pixels.push({
        x,                // column position
        y,                // row position
        r: raw[i],        // red channel   0-255
        g: raw[i + 1],    // green channel 0-255
        b: raw[i + 2],    // blue channel  0-255
        a: raw[i + 3],    // alpha channel 0=transparent 255=opaque
      });
    }
  }

  // Return dimensions + pixel array for use by later stages
  return { width: w, height: h, pixels };
}


// ─────────────────────────────────────────────
// STEP 2 — detectEdges
// Sobel operator: finds where brightness changes sharply.
// Returns an array of edge pixels with magnitude and angle.
// ─────────────────────────────────────────────

// Helper: perceived brightness of a colour, 0-255
// These weights match how the human eye sees colour
function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function detectEdges(pixels, width, height, threshold = 30) {

  // Build a flat brightness grid for fast neighbour lookups
  // Index formula: y * width + x
  const grid = new Float32Array(width * height);
  for (const p of pixels) {
    grid[p.y * width + p.x] = luminance(p.r, p.g, p.b);
  }

  // Helper: get brightness at (x, y), returns 0 if out of bounds
  const g = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return grid[y * width + x];
  };

  const edges = [];  // will hold all detected edge pixels

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {

      // ── Horizontal Sobel kernel ── finds vertical edges
      // This multiplies the 3x3 neighbourhood by kernel weights and sums
      const Gx =
        -1 * g(x-1, y-1)  +  0 * g(x, y-1)  +  1 * g(x+1, y-1) +
        -2 * g(x-1, y)    +  0 * g(x, y)    +  2 * g(x+1, y)   +
        -1 * g(x-1, y+1)  +  0 * g(x, y+1)  +  1 * g(x+1, y+1);

      // ── Vertical Sobel kernel ── finds horizontal edges
      const Gy =
        -1 * g(x-1, y-1)  + -2 * g(x, y-1)  + -1 * g(x+1, y-1) +
         0 * g(x-1, y)    +  0 * g(x, y)    +  0 * g(x+1, y)   +
         1 * g(x-1, y+1)  +  2 * g(x, y+1)  +  1 * g(x+1, y+1);

      // Combined edge strength: Pythagorean theorem
      const magnitude = Math.sqrt(Gx * Gx + Gy * Gy);

      if (magnitude > threshold) {
        // atan2 gives the direction the edge runs, in radians
        const angle = Math.atan2(Gy, Gx);
        edges.push({ x, y, magnitude, angle });
      }
    }
  }

  return edges;
}


// ─────────────────────────────────────────────
// STEP 3 — removeBackground
// Flood-fill from the image borders inward.
// Any pixel reachable without crossing an edge = background.
// ─────────────────────────────────────────────
export function removeBackground(pixels, edges, width, height, threshold = 30) {

  // Build a set of edge positions for O(1) lookup
  const edgeSet = new Set();
  for (const e of edges) {
    if (e.magnitude > threshold) edgeSet.add(`${e.x},${e.y}`);
  }

  // Copy alpha values into a map so we can modify them
  const alphaMap = new Map();
  for (const p of pixels) alphaMap.set(`${p.x},${p.y}`, p.a);

  // Flood fill setup — visited tracks pixels we've already processed
  const visited = new Set();
  const queue   = [];  // array used as a FIFO queue

  // Seed the queue with all border pixels (all 4 edges of the image)
  for (let x = 0; x < width; x++) {
    queue.push([x, 0]);             // top row
    queue.push([x, height - 1]);    // bottom row
    visited.add(`${x},0`);
    visited.add(`${x},${height-1}`);
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push([0, y]);             // left column
    queue.push([width - 1, y]);     // right column
    visited.add(`0,${y}`);
    visited.add(`${width-1},${y}`);
  }

  // Process queue: spread outward until hitting an edge
  while (queue.length > 0) {
    const [x, y] = queue.shift();  // take from front (breadth-first)
    const key    = `${x},${y}`;

    if (edgeSet.has(key)) continue;  // hit a wall — stop spreading here

    alphaMap.set(key, 0);  // reachable from outside = background = transparent

    // Check 4 neighbours (not diagonal — prevents corner leaking)
    for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;  // out of bounds
      const nk = `${nx},${ny}`;
      if (!visited.has(nk)) {
        visited.add(nk);    // mark as visited before queuing to avoid duplicates
        queue.push([nx, ny]);
      }
    }
  }

  // Rebuild pixel array with updated alpha values
  return pixels.map(p => ({ ...p, a: alphaMap.get(`${p.x},${p.y}`) ?? p.a }));
}


// ─────────────────────────────────────────────
// STEP 4 — segmentBody
// Analyses the foreground silhouette to find
// where the head, torso, arms and legs are.
// Uses bounding box proportions as heuristics.
// ─────────────────────────────────────────────
export function segmentBody(fgPixels) {

  // Find the bounding box of all non-transparent pixels
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const p of fgPixels) {
    if (p.a === 0) continue;            // skip background pixels
    if (p.x < minX) minX = p.x;        // track leftmost foreground pixel
    if (p.x > maxX) maxX = p.x;        // track rightmost
    if (p.y < minY) minY = p.y;        // track topmost
    if (p.y > maxY) maxY = p.y;        // track bottommost
  }

  const totalH = maxY - minY;   // total height of the silhouette
  const totalW = maxX - minX;   // total width
  const cx     = (minX + maxX) / 2;  // horizontal centre

  // Divide the silhouette into body regions using typical human proportions
  return {
    HEAD: {
      yMin: minY,
      yMax: minY + totalH * 0.15,     // top 15% = head
      xMin: cx - totalW * 0.2,        // centred, narrower than torso
      xMax: cx + totalW * 0.2,
    },
    TORSO: {
      yMin: minY + totalH * 0.15,     // 15-50% = torso
      yMax: minY + totalH * 0.50,
      xMin: cx - totalW * 0.3,
      xMax: cx + totalW * 0.3,
    },
    ARM_LEFT: {
      yMin: minY + totalH * 0.15,     // same vertical range as torso
      yMax: minY + totalH * 0.55,
      xMin: minX,                     // left edge to centre
      xMax: cx - totalW * 0.15,
    },
    ARM_RIGHT: {
      yMin: minY + totalH * 0.15,
      yMax: minY + totalH * 0.55,
      xMin: cx + totalW * 0.15,       // centre to right edge
      xMax: maxX,
    },
    LEGS: {
      yMin: minY + totalH * 0.50,     // bottom 50% = legs
      yMax: maxY,
      xMin: cx - totalW * 0.25,
      xMax: cx + totalW * 0.25,
    },
  };
}


// ─────────────────────────────────────────────
// STEP 5 — getDominantColour
// Finds the most common colour within a body region.
// Used to extract skin/clothing colours per region.
// ─────────────────────────────────────────────
export function getDominantColour(fgPixels, region) {

  // Collect all foreground pixels that fall inside the region bounds
  const regionPixels = fgPixels.filter(p =>
    p.a > 0 &&           // not transparent
    p.x >= region.xMin &&
    p.x <= region.xMax &&
    p.y >= region.yMin &&
    p.y <= region.yMax
  );

  if (regionPixels.length === 0) return { r: 128, g: 128, b: 128 };  // grey fallback

  // Average the colour across all pixels in this region
  // This is a simple but effective dominant colour extraction
  let rSum = 0, gSum = 0, bSum = 0;
  for (const p of regionPixels) {
    rSum += p.r;  // accumulate each channel
    gSum += p.g;
    bSum += p.b;
  }
  const n = regionPixels.length;
  return {
    r: Math.round(rSum / n),   // average red
    g: Math.round(gSum / n),   // average green
    b: Math.round(bSum / n),   // average blue
  };
}


// ─────────────────────────────────────────────
// STEP 6 — buildMesh
// Assigns depth (Z) to each pixel then triangulates
// them into a 3D surface mesh.
// ─────────────────────────────────────────────
export function buildMesh(fgPixels, edges, width, height, zScale = 50) {

  // ── Normalise edge magnitudes to 0-1 ──
  let maxMag = 0;
  for (const e of edges) if (e.magnitude > maxMag) maxMag = e.magnitude;

  // Build a flat lookup for edge strength at each pixel position
  const edgeMag = new Float32Array(width * height);  // default 0
  for (const e of edges) edgeMag[e.y * width + e.x] = e.magnitude / (maxMag || 1);

  // ── Assign Z depth to every pixel ──
  // Brighter = closer (higher Z), edges = rim = lower Z
  const depthPixels = fgPixels.map(p => {
    if (p.a === 0) return { ...p, z: 0 };  // background stays at Z=0

    const brightness  = luminance(p.r, p.g, p.b) / 255;  // normalised 0-1
    const edgeStr     = edgeMag[p.y * width + p.x];       // edge strength 0-1
    const edgeInverse = 1 - edgeStr;                       // invert: strong edge = low Z

    // Z formula: brightness drives 60%, edge inverse drives 40%
    const z = brightness * 0.6 + edgeInverse * 0.4;
    return { ...p, z };
  });

  // ── Build index map: "x,y" → array index ──
  // We need this to look up neighbours when building triangles
  const indexMap = new Map();
  depthPixels.forEach((p, i) => indexMap.set(`${p.x},${p.y}`, i));

  // ── Build vertex (point) list ──
  const points = depthPixels.map(p => ({
    x: p.x,
    y: p.y,
    z: p.z * zScale,   // multiply Z so depth is visible in 3D
    r: p.r,            // keep original colour
    g: p.g,
    b: p.b,
    a: p.a,
    bone: null,        // will be assigned by skeleton binding
  }));

  // ── Build triangle list ──
  // Connect each pixel to its right and bottom neighbours: 2 triangles per cell
  const triangles = [];

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {

      // Four corners of the current grid cell
      const iA = indexMap.get(`${x},${y}`);           // top-left
      const iB = indexMap.get(`${x+1},${y}`);         // top-right
      const iC = indexMap.get(`${x},${y+1}`);         // bottom-left
      const iD = indexMap.get(`${x+1},${y+1}`);       // bottom-right

      // Skip if any corner index is missing
      if (iA === undefined || iB === undefined ||
          iC === undefined || iD === undefined) continue;

      // Skip cells where all 4 corners are background (transparent)
      if (points[iA].a === 0 && points[iB].a === 0 &&
          points[iC].a === 0 && points[iD].a === 0) continue;

      // Upper triangle: top-left, top-right, bottom-left
      triangles.push({ a: iA, b: iB, c: iC });

      // Lower triangle: top-right, bottom-right, bottom-left
      triangles.push({ a: iB, b: iD, c: iC });
    }
  }

  return { points, triangles };
}


// ─────────────────────────────────────────────
// STEP 7 — generateSkeleton
// Places bones at the centre of each detected
// body region to create an auto-rigged skeleton.
// ─────────────────────────────────────────────
export function generateSkeleton(regions) {

  // Helper: get the centre point of a region
  const centre = (reg) => ({
    x: (reg.xMin + reg.xMax) / 2,
    y: (reg.yMin + reg.yMax) / 2,
    z: 0,  // bones start at Z=0, mesh deformation adds depth
  });

  // Helper: get the top centre of a region
  const topCentre = (reg) => ({
    x: (reg.xMin + reg.xMax) / 2,
    y: reg.yMin,
    z: 0,
  });

  // Helper: get the bottom centre of a region
  const bottomCentre = (reg) => ({
    x: (reg.xMin + reg.xMax) / 2,
    y: reg.yMax,
    z: 0,
  });

  // Return the bone hierarchy — each bone knows its parent
  return [
    { name: 'root',        parent: null,        position: bottomCentre(regions.TORSO) },
    { name: 'spine',       parent: 'root',      position: centre(regions.TORSO) },
    { name: 'chest',       parent: 'spine',     position: topCentre(regions.TORSO) },
    { name: 'head',        parent: 'chest',     position: centre(regions.HEAD) },
    { name: 'arm_left',    parent: 'chest',     position: centre(regions.ARM_LEFT) },
    { name: 'hand_left',   parent: 'arm_left',  position: bottomCentre(regions.ARM_LEFT) },
    { name: 'arm_right',   parent: 'chest',     position: centre(regions.ARM_RIGHT) },
    { name: 'hand_right',  parent: 'arm_right', position: bottomCentre(regions.ARM_RIGHT) },
    { name: 'leg_left',    parent: 'root',      position: {
        x: (regions.LEGS.xMin + centre(regions.LEGS).x) / 2,  // left half of legs
        y: centre(regions.LEGS).y,
        z: 0,
      }
    },
    { name: 'foot_left',   parent: 'leg_left',  position: {
        x: (regions.LEGS.xMin + centre(regions.LEGS).x) / 2,
        y: regions.LEGS.yMax,
        z: 0,
      }
    },
    { name: 'leg_right',   parent: 'root',      position: {
        x: (centre(regions.LEGS).x + regions.LEGS.xMax) / 2,  // right half of legs
        y: centre(regions.LEGS).y,
        z: 0,
      }
    },
    { name: 'foot_right',  parent: 'leg_right', position: {
        x: (centre(regions.LEGS).x + regions.LEGS.xMax) / 2,
        y: regions.LEGS.yMax,
        z: 0,
      }
    },
  ];
}


// ─────────────────────────────────────────────
// bindMeshToSkeleton
// Assigns each vertex to its nearest bone.
// This is called "skinning" in 3D animation.
// ─────────────────────────────────────────────
export function bindMeshToSkeleton(points, bones) {

  for (const point of points) {

    let nearestBone     = null;   // name of the closest bone
    let nearestDistance = Infinity;

    for (const bone of bones) {
      // Euclidean distance from vertex to bone position
      const dx = point.x - bone.position.x;
      const dy = point.y - bone.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);  // 2D distance (Z ignored for binding)

      if (dist < nearestDistance) {
        nearestDistance = dist;       // update closest found so far
        nearestBone     = bone.name;  // remember its name
      }
    }

    point.bone   = nearestBone;   // assign this vertex to the nearest bone
    point.weight = 1.0;           // full influence (simple single-bone skinning)
  }
}


// ─────────────────────────────────────────────
// generatePhysics
// Creates physics properties estimated from
// the character's silhouette size and shape.
// ─────────────────────────────────────────────
export function generatePhysics(regions, width, height) {

  // Estimate mass from the silhouette area (pixels are a proxy for volume)
  const silhouetteArea = (regions.TORSO.xMax - regions.TORSO.xMin) *
                         (regions.TORSO.yMax - regions.TORSO.yMin);

  // Map area to a mass in a human-reasonable range (50-100 kg)
  const mass = 50 + Math.min(50, silhouetteArea / 20);

  // Estimate hitbox from full silhouette bounding box
  const silW = (regions.ARM_RIGHT.xMax - regions.ARM_LEFT.xMin) / width;  // normalised 0-1
  const silH = (regions.LEGS.yMax - regions.HEAD.yMin) / height;

  return {
    mass:       Math.round(mass),   // kg
    gravity:    9.8,                // standard gravity
    friction:   0.6,                // moderate ground friction
    bounciness: 0.05,               // barely any bounce — realistic characters
    drag:       0.15,               // slight air resistance
    canFly:     false,              // default: not a flying character
    canSwim:    true,               // can move in water
    hitboxRadius: silW * 0.5,       // half the normalised width
    hitboxHeight: silH,             // full normalised height
  };
}


// ─────────────────────────────────────────────
// generateDefaultStats
// All new characters start with equal base stats.
// Powers and levelling create differences later.
// ─────────────────────────────────────────────
export function generateDefaultStats() {
  return {
    health:     100,   // current health points
    maxHealth:  100,   // maximum health
    energy:     100,   // current energy (used for powers)
    maxEnergy:  100,   // maximum energy
    speed:      5.0,   // movement units per second
    jumpForce:  8.0,   // upward velocity when jumping
    strength:   10,    // attack power multiplier
    defence:    5,     // damage reduction amount
    level:      1,     // character level
    experience: 0,     // XP toward next level
  };
}


// ─────────────────────────────────────────────
// runFullPipeline
// Convenience function that chains all steps.
// Call this with an image element to get a
// complete avatar data object ready for the game.
// ─────────────────────────────────────────────
export function runFullPipeline(imgElement, options = {}) {

  // Merge user options with defaults
  const opts = {
    edgeThreshold: options.edgeThreshold ?? 30,   // sensitivity for edge detection
    bgThreshold:   options.bgThreshold   ?? 30,   // sensitivity for background removal
    zScale:        options.zScale        ?? 50,   // depth extrusion amount
    avatarId:      options.avatarId      ?? `avatar_${Date.now()}`,  // unique ID
    avatarName:    options.avatarName    ?? 'Player',               // display name
  };

  // Run each stage in sequence, passing output of each into the next
  const { width, height, pixels }  = readPixels(imgElement);
  const edges                      = detectEdges(pixels, width, height, opts.edgeThreshold);
  const fgPixels                   = removeBackground(pixels, edges, width, height, opts.bgThreshold);
  const regions                    = segmentBody(fgPixels);
  const skinColour                 = getDominantColour(fgPixels, regions.HEAD);
  const { points, triangles }      = buildMesh(fgPixels, edges, width, height, opts.zScale);
  const skeleton                   = generateSkeleton(regions);
  bindMeshToSkeleton(points, skeleton);                             // mutates points in place
  const physics                    = generatePhysics(regions, width, height);

  // Assemble the full avatar data object
  return {
    id:       opts.avatarId,
    name:     opts.avatarName,
    width,
    height,
    mesh:     { points, triangles },
    skin: {
      base:       skinColour,    // dominant head colour
      roughness:  0.7,           // slightly rough surface
      metalness:  0.0,           // non-metallic
      colourMode: 'texture',     // use original pixel colours by default
    },
    skeleton,
    physics,
    hitbox: {
      type:    'capsule',
      radius:  physics.hitboxRadius * 50,  // scale to world units
      height:  physics.hitboxHeight * 100,
      offsetY: physics.hitboxHeight * 50,  // lift hitbox so feet touch ground
    },
    stats:  generateDefaultStats(),
    powers: [],   // empty — user assigns powers in the next step
  };
}
