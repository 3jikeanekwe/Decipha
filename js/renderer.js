// ============================================================
// js/renderer.js
// All Three.js setup and per-frame rendering.
// Manages the scene, camera, lights, character meshes,
// projectile visuals and hit effects.
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


// ─────────────────────────────────────────────
// createRenderer
// Sets up the entire Three.js environment.
// Call once at startup. Returns the renderer object
// containing everything needed to draw the scene.
// ─────────────────────────────────────────────
export function createRenderer(canvas) {

  // ── WebGL Renderer ──
  // Uses the GPU to draw via WebGL.
  // antialias: smooths jagged edges
  // alpha: allows transparent background
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);   // sharp on retina screens
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.shadowMap.enabled = true;                 // enable real-time shadows
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap; // soft shadow edges
  renderer.outputColorSpace   = THREE.SRGBColorSpace; // correct colour display
  renderer.toneMapping        = THREE.ACESFilmicToneMapping; // cinematic contrast
  renderer.toneMappingExposure = 1.2;               // slightly bright exposure

  // ── Scene ──
  // Root container — everything renderable lives here
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1a);     // dark blue-black sky
  scene.fog        = new THREE.FogExp2(0x0a0f1a, 0.008); // fog fades distant objects

  // ── Camera ──
  // PerspectiveCamera: 75° FOV, updated aspect on resize
  const camera = new THREE.PerspectiveCamera(
    75,                                              // field of view in degrees
    canvas.clientWidth / canvas.clientHeight,        // aspect ratio
    0.1,                                             // near clip plane (min render distance)
    500                                              // far clip plane (max render distance)
  );
  camera.position.set(0, 15, 30);   // start above and behind player
  camera.lookAt(0, 0, 0);           // look at world origin

  // ── Lights ──

  // Ambient: fills everything equally — no shadows, just base brightness
  const ambient = new THREE.AmbientLight(0x334466, 0.6);  // cool blue-dark
  scene.add(ambient);

  // Main directional light (the "sun")
  const sun = new THREE.DirectionalLight(0xfff0cc, 1.4);  // warm white
  sun.position.set(30, 60, 40);      // above and to the side
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); // high-res shadow map
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far  = 200;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
  sun.shadow.camera.right = sun.shadow.camera.top   = 60;
  scene.add(sun);

  // Fill light: dim, opposite side — prevents completely black shadows
  const fill = new THREE.DirectionalLight(0x4466aa, 0.4);  // cool blue fill
  fill.position.set(-30, 20, -40);
  scene.add(fill);

  // ── Ground plane ──
  const groundGeo = new THREE.PlaneGeometry(200, 200);  // 200x200 unit arena
  const groundMat = new THREE.MeshStandardMaterial({
    color:     0x1a2a1a,   // dark green-grey
    roughness: 0.9,        // rough — not shiny
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;  // rotate flat (PlaneGeometry is vertical by default)
  ground.receiveShadow = true;         // ground receives shadows from characters
  scene.add(ground);

  // ── Grid overlay on ground ──
  // Gives a game-arena feel
  const grid = new THREE.GridHelper(200, 40, 0x2a4a2a, 0x1a2a1a);
  grid.position.y = 0.01;  // slightly above ground to prevent Z-fighting
  scene.add(grid);

  // ── Resize handler ──
  const onResize = () => {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();  // must call after changing aspect
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  };
  new ResizeObserver(onResize).observe(canvas);

  // ── Maps: entity ID → Three.js group ──
  // We store all mesh objects here so we can update/remove them
  const entityMeshes     = new Map();  // avatar/enemy meshes
  const projectileMeshes = new Map();  // projectile spheres/beams
  const effectMeshes     = [];         // timed visual effects (explosions, particles)

  return { renderer, scene, camera, entityMeshes, projectileMeshes, effectMeshes };
}


// ─────────────────────────────────────────────
// buildCharacterMesh
// Converts a CPG mesh (points + triangles) into a
// Three.js mesh and adds it to the scene.
// ─────────────────────────────────────────────
export function buildCharacterMesh(rendererState, entity) {

  const { scene, entityMeshes } = rendererState;
  const { points, triangles }   = entity.avatarData.mesh;

  // ── Find bounding box to centre the mesh ──
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity,
      minZ=Infinity, maxZ=-Infinity;

  for (const p of points) {
    if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x;
    if (p.y<minY) minY=p.y; if (p.y>maxY) maxY=p.y;
    if (p.z<minZ) minZ=p.z; if (p.z>maxZ) maxZ=p.z;
  }

  const cx    = (minX+maxX)/2;  // centre X
  const cy    = (minY+maxY)/2;  // centre Y
  const cz    = (minZ+maxZ)/2;  // centre Z
  const span  = Math.max(maxX-minX, maxY-minY);
  const scale = span > 0 ? 3 / span : 1;  // normalise to ~3 units tall

  // ── Fill typed arrays for GPU ──
  const positions = new Float32Array(points.length * 3);  // x,y,z per vertex
  const colors    = new Float32Array(points.length * 3);  // r,g,b per vertex (0-1)
  const indices   = new Uint32Array(triangles.length * 3); // triangle indices

  points.forEach((p, i) => {
    positions[i*3]     = (p.x - cx) * scale;   // centre and scale X
    positions[i*3 + 1] = -(p.y - cy) * scale;  // flip Y (image Y goes down, 3D goes up)
    positions[i*3 + 2] = (p.z - cz) * scale;   // centre Z

    colors[i*3]     = p.r / 255;  // convert 0-255 to 0-1 (WebGL range)
    colors[i*3 + 1] = p.g / 255;
    colors[i*3 + 2] = p.b / 255;
  });

  triangles.forEach((t, i) => {
    indices[i*3]     = t.a;  // first vertex index of triangle
    indices[i*3 + 1] = t.b;  // second
    indices[i*3 + 2] = t.c;  // third
  });

  // ── Create Three.js geometry ──
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();  // calculates face normals for lighting

  // ── Create material ──
  // vertexColors: uses per-vertex colour array instead of flat colour
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,   // use colours from buffer
    roughness:    0.7,
    metalness:    0.05,
    side:         THREE.DoubleSide,  // render both sides of each triangle
  });

  // ── Create Three.js Mesh ── (geometry + material = renderable object)
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow    = true;  // this character casts shadows on others
  mesh.receiveShadow = true;  // this character receives shadows

  // ── Wrap in Group ── (allows adding glow ring, health bar, etc. as children)
  const group = new THREE.Group();
  group.add(mesh);

  // Add a subtle glow ring at the feet to indicate the character's position
  const ringGeo = new THREE.RingGeometry(0.4, 0.7, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color:       entity.isPlayer ? 0x00ff88 : 0xff3333,  // green for player, red for enemy
    transparent: true,
    opacity:     0.4,
    side:        THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;   // flat on the ground
  ring.position.y  = 0.02;          // just above ground
  group.add(ring);

  scene.add(group);
  entityMeshes.set(entity.id, group);  // store reference for updates

  return group;
}


// ─────────────────────────────────────────────
// syncEntityMeshes
// Called every frame — moves all Three.js groups
// to match the physics simulation positions.
// ─────────────────────────────────────────────
export function syncEntityMeshes(rendererState, entities) {

  for (const entity of entities) {

    const group = rendererState.entityMeshes.get(entity.id);
    if (!group) continue;  // mesh not yet created — skip

    const pos = entity.physicsBody.position;

    // Move the Three.js group to match the physics body position
    group.position.x = pos.x;
    group.position.y = pos.y;  // Y = height
    group.position.z = pos.z;

    // ── Rotate to face the movement direction ──
    if (entity.facing) {
      const angle = Math.atan2(entity.facing.x, entity.facing.z);  // yaw angle
      group.rotation.y = angle;
    }

    // ── Update colour tint based on status effects ──
    const mesh = group.children[0];  // first child is always the character mesh
    if (mesh && mesh.isMesh) {
      let tint = null;

      if (entity.statusEffects) {
        if (entity.statusEffects.some(e => e.type === 'freeze'))  tint = 0x88ccff;  // blue ice
        if (entity.statusEffects.some(e => e.type === 'burn'))    tint = 0xff4400;  // orange fire
        if (entity.statusEffects.some(e => e.type === 'stun'))    tint = 0xffff00;  // yellow
        if (entity.statusEffects.some(e => e.type === 'poison'))  tint = 0x44ff44;  // green
        if (entity.statusEffects.some(e => e.type === 'shield'))  tint = 0xffff88;  // gold
      }

      if (tint) {
        mesh.material.emissive.setHex(tint);   // add a colour glow
        mesh.material.emissiveIntensity = 0.4;  // subtle, not blinding
      } else {
        mesh.material.emissiveIntensity = 0;   // no glow when no effect
      }

      // Flash white briefly when dead
      if (entity.isDead) {
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.emissiveIntensity = 0.8;
        mesh.material.opacity   = 0.3;  // fade out dead entities
        mesh.material.transparent = true;
      }
    }
  }
}


// ─────────────────────────────────────────────
// spawnProjectileVisual
// Creates a small glowing sphere/beam for a projectile.
// ─────────────────────────────────────────────
export function spawnProjectileVisual(rendererState, projectile) {

  const { scene, projectileMeshes } = rendererState;
  const colour = projectile.power.colour;  // use power's assigned colour
  const threeColour = new THREE.Color(colour.r/255, colour.g/255, colour.b/255);

  let geo, mat;

  if (projectile.power.shape === 'sphere' || !projectile.power.shape) {
    // Sphere projectile
    geo = new THREE.SphereGeometry(0.3, 8, 8);  // radius 0.3, low poly for perf
    mat = new THREE.MeshBasicMaterial({ color: threeColour });  // bright, no lighting needed
  } else if (projectile.power.shape === 'beam') {
    // Beam: thin elongated cylinder pointing forward
    geo = new THREE.CylinderGeometry(0.1, 0.1, 2.0, 6);  // thin cylinder
    mat = new THREE.MeshBasicMaterial({ color: threeColour });
  } else {
    geo = new THREE.SphereGeometry(0.3, 8, 8);
    mat = new THREE.MeshBasicMaterial({ color: threeColour });
  }

  // Add a point light inside the projectile so it glows on nearby surfaces
  const light = new THREE.PointLight(threeColour, 2.0, 6);  // intensity 2, radius 6
  const mesh  = new THREE.Mesh(geo, mat);

  const group = new THREE.Group();
  group.add(mesh);
  group.add(light);

  group.position.copy(projectile.position);  // start at projectile's physics position

  scene.add(group);
  projectileMeshes.set(projectile.id, group);
}


// ─────────────────────────────────────────────
// syncProjectileVisuals
// Moves projectile meshes to match their physics positions.
// Removes meshes for expired projectiles.
// ─────────────────────────────────────────────
export function syncProjectileVisuals(rendererState, activeProjectiles) {

  const { scene, projectileMeshes } = rendererState;

  // Collect IDs of still-active projectiles
  const activeIds = new Set(activeProjectiles.map(p => p.id));

  // Remove visuals for expired projectiles
  for (const [id, group] of projectileMeshes.entries()) {
    if (!activeIds.has(id)) {
      scene.remove(group);            // remove from scene
      projectileMeshes.delete(id);    // remove from map
    }
  }

  // Update positions of active projectiles
  for (const proj of activeProjectiles) {
    const group = projectileMeshes.get(proj.id);
    if (group) {
      group.position.set(proj.position.x, proj.position.y, proj.position.z);
    }
  }
}


// ─────────────────────────────────────────────
// spawnHitEffect
// Creates a brief explosion/impact effect at a position.
// The effect expands and fades out over 0.5 seconds.
// ─────────────────────────────────────────────
export function spawnHitEffect(rendererState, position, colour) {

  const { scene, effectMeshes } = rendererState;
  const threeColour = new THREE.Color(colour.r/255, colour.g/255, colour.b/255);

  // Expanding ring effect
  const geo  = new THREE.RingGeometry(0.1, 0.4, 16);
  const mat  = new THREE.MeshBasicMaterial({
    color:       threeColour,
    transparent: true,
    opacity:     1.0,
    side:        THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(position.x, position.y + 1, position.z);  // at impact height
  ring.rotation.x = -Math.PI / 2;  // flat ring parallel to ground

  scene.add(ring);

  // Store with a lifetime — updated and removed in updateEffects()
  effectMeshes.push({ mesh: ring, lifetime: 0.5, age: 0, type: 'hit_ring' });
}


// ─────────────────────────────────────────────
// updateEffects
// Ages and removes timed visual effects.
// Scales/fades them over their lifetime.
// Call every frame with deltaTime.
// ─────────────────────────────────────────────
export function updateEffects(rendererState, deltaTime) {

  const { scene, effectMeshes } = rendererState;
  const toRemove = [];

  for (let i = 0; i < effectMeshes.length; i++) {
    const effect = effectMeshes[i];
    effect.age += deltaTime;

    const progress = effect.age / effect.lifetime;  // 0 = just spawned, 1 = expired

    if (effect.type === 'hit_ring') {
      effect.mesh.scale.setScalar(1 + progress * 4);    // expand outward
      effect.mesh.material.opacity = 1 - progress;      // fade out
    }

    if (progress >= 1.0) {
      scene.remove(effect.mesh);  // remove from Three.js scene
      toRemove.push(i);            // mark for removal from array
    }
  }

  // Remove expired effects (reverse to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    effectMeshes.splice(toRemove[i], 1);
  }
}


// ─────────────────────────────────────────────
// updateCamera
// Follows the player character with a smooth chase camera.
// Camera stays behind and above the player.
// ─────────────────────────────────────────────
export function updateCamera(camera, player, deltaTime) {

  if (!player || !player.physicsBody) return;

  const playerPos = player.physicsBody.position;
  const facing    = player.facing || { x: 0, z: -1 };

  // Target camera position: behind the player by 15 units, up 10 units
  const targetX = playerPos.x - facing.x * 15;
  const targetY = playerPos.y + 10;
  const targetZ = playerPos.z - facing.z * 15;

  // Smooth camera follow using linear interpolation (lerp)
  // Moves 8% of the remaining distance each frame
  const SMOOTH = 8 * deltaTime;
  camera.position.x += (targetX - camera.position.x) * SMOOTH;
  camera.position.y += (targetY - camera.position.y) * SMOOTH;
  camera.position.z += (targetZ - camera.position.z) * SMOOTH;

  // Always look at a point slightly above the player
  camera.lookAt(playerPos.x, playerPos.y + 1.5, playerPos.z);
}


// ─────────────────────────────────────────────
// renderFrame
// Draw one frame. Call at the end of every game loop tick.
// ─────────────────────────────────────────────
export function renderFrame(rendererState) {
  const { renderer, scene, camera } = rendererState;
  renderer.render(scene, camera);   // GPU draws everything in the scene
}
