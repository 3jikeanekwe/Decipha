// ============================================================
// js/physics.js
// Handles all movement, gravity, velocity, forces and
// collision resolution. Runs every frame via the game loop.
// ============================================================

const GRAVITY     = 9.8;   // downward acceleration in units/sec²
const FLOOR_Y     = 0;     // Y position of the ground plane
const TERMINAL_VEL = -40;  // maximum downward fall speed (prevents infinite acceleration)

// ─────────────────────────────────────────────
// createPhysicsBody
// Creates a physics state object for any entity
// (player, enemy, projectile, effect).
// Called once when an entity enters the world.
// ─────────────────────────────────────────────
export function createPhysicsBody(config = {}) {
  return {
    // ── Position in 3D world space ──
    position: {
      x: config.x ?? 0,   // left/right
      y: config.y ?? 0,   // up/down
      z: config.z ?? 0,   // forward/backward
    },

    // ── Velocity (units per second in each axis) ──
    velocity: {
      x: 0,
      y: 0,
      z: 0,
    },

    // ── Physics properties ──
    mass:        config.mass        ?? 70,    // affects force reactions
    friction:    config.friction    ?? 0.6,   // ground friction (0=ice, 1=sticky)
    drag:        config.drag        ?? 0.15,  // air resistance
    bounciness:  config.bounciness  ?? 0.05,  // how much they bounce on landing
    gravity:     config.gravity     ?? GRAVITY,
    canFly:      config.canFly      ?? false,  // if true, gravity is ignored
    isGrounded:  false,                         // whether touching the ground right now
    isKinematic: config.isKinematic ?? false,  // if true, moves by position only (no physics)

    // ── State flags ──
    jumpsUsed:   0,    // how many times jumped since leaving ground
    maxJumps:    2,    // allow 1 double-jump (2 total)

    // ── Speed multiplier (modified by status effects) ──
    speedMultiplier: 1.0,   // 1.0 = normal, 0 = frozen, 2.0 = haste
  };
}


// ─────────────────────────────────────────────
// updatePhysics
// Moves all entities based on their velocity,
// applies gravity, and resolves floor collision.
// Call every frame with deltaTime = seconds since last frame.
// ─────────────────────────────────────────────
export function updatePhysics(entities, deltaTime) {

  for (const entity of entities) {

    const body = entity.physicsBody;  // shorthand
    if (!body) continue;              // skip entities without physics

    if (body.isKinematic) {
      // Kinematic bodies (like platforms) move by direct position only
      continue;
    }

    // ── Apply gravity ──
    // Only applied when not grounded and not flying
    if (!body.isGrounded && !body.canFly) {
      body.velocity.y -= body.gravity * deltaTime;  // accelerate downward

      // Terminal velocity — cap how fast something can fall
      if (body.velocity.y < TERMINAL_VEL) {
        body.velocity.y = TERMINAL_VEL;
      }
    }

    // ── Apply horizontal drag (air/ground resistance) ──
    // Drag decays velocity each frame — higher drag = stops faster
    const dragFactor = body.isGrounded
      ? (1 - body.friction * deltaTime * 8)   // ground friction is stronger
      : (1 - body.drag    * deltaTime);        // air drag is weaker

    body.velocity.x *= Math.max(0, dragFactor);  // never negative (won't reverse)
    body.velocity.z *= Math.max(0, dragFactor);

    // ── Move entity by velocity ──
    body.position.x += body.velocity.x * deltaTime;  // new X = old X + speed * time
    body.position.y += body.velocity.y * deltaTime;  // new Y
    body.position.z += body.velocity.z * deltaTime;  // new Z

    // ── Floor collision ──
    if (body.position.y <= FLOOR_Y) {
      body.position.y = FLOOR_Y;            // snap to floor

      if (body.velocity.y < 0) {            // only if moving downward
        // Apply bounce: reverse y velocity and reduce by bounciness
        body.velocity.y = -body.velocity.y * body.bounciness;

        // If bounce is very small, just stop instead
        if (Math.abs(body.velocity.y) < 0.5) body.velocity.y = 0;
      }

      body.isGrounded = true;    // touching the floor
      body.jumpsUsed  = 0;       // reset jump counter when landing
    } else {
      body.isGrounded = false;   // not on the floor
    }
  }
}


// ─────────────────────────────────────────────
// moveEntity
// Apply movement input to an entity.
// Called when player presses movement keys.
// ─────────────────────────────────────────────
export function moveEntity(entity, direction, speed) {

  const body = entity.physicsBody;
  if (!body) return;

  // canAct is false when stunned — can't move
  if (entity.canAct === false) return;

  // Apply speed multiplier from status effects (freeze = 0, haste = 2)
  const effectiveSpeed = speed * body.speedMultiplier;

  // Set velocity directly — immediate response (not force-based)
  // direction is a normalised vector { x, z }
  body.velocity.x = direction.x * effectiveSpeed;
  body.velocity.z = direction.z * effectiveSpeed;
}


// ─────────────────────────────────────────────
// jumpEntity
// Applies an upward force to an entity.
// Respects double-jump limit.
// ─────────────────────────────────────────────
export function jumpEntity(entity, jumpForce) {

  const body = entity.physicsBody;
  if (!body) return false;

  // Can't jump if stunned
  if (entity.canAct === false) return false;

  // Can't jump more times than maxJumps allows
  if (body.jumpsUsed >= body.maxJumps) return false;

  body.velocity.y  = jumpForce;   // set upward velocity
  body.isGrounded  = false;       // leave the ground
  body.jumpsUsed  += 1;           // count this jump

  return true;  // jump was successful
}


// ─────────────────────────────────────────────
// applyForce
// Pushes an entity in a direction with a given magnitude.
// Used by knockback effects and explosions.
// ─────────────────────────────────────────────
export function applyForce(entity, direction, magnitude) {

  const body = entity.physicsBody;
  if (!body) return;

  // Force = magnitude / mass — heavier objects are pushed less
  const force = magnitude / body.mass;

  body.velocity.x += direction.x * force;
  body.velocity.y += direction.y * force;  // can knock upward too
  body.velocity.z += direction.z * force;
}


// ─────────────────────────────────────────────
// teleportEntity
// Instantly moves an entity to a new position.
// Used by the Dash power and respawn.
// ─────────────────────────────────────────────
export function teleportEntity(entity, targetPosition) {

  const body = entity.physicsBody;
  if (!body) return;

  // Copy target position (don't modify the original object)
  body.position.x = targetPosition.x;
  body.position.y = targetPosition.y;
  body.position.z = targetPosition.z;

  // Zero out velocity after teleport — no momentum carry
  body.velocity.x = 0;
  body.velocity.y = 0;
  body.velocity.z = 0;
}


// ─────────────────────────────────────────────
// dashEntity
// Moves an entity forward by a distance instantly.
// "Forward" is the direction they're currently facing.
// ─────────────────────────────────────────────
export function dashEntity(entity, distance) {

  const body    = entity.physicsBody;
  const facing  = entity.facing || { x: 0, z: -1 };  // default facing forward

  // Move directly in the facing direction
  body.position.x += facing.x * distance;
  body.position.z += facing.z * distance;

  // Apply a burst of velocity in the dash direction for visual flair
  body.velocity.x = facing.x * 20;  // briefly move fast before drag stops it
  body.velocity.z = facing.z * 20;
}


// ─────────────────────────────────────────────
// distance3D
// Returns the Euclidean distance between two 3D positions.
// Used all over the codebase for range checks.
// ─────────────────────────────────────────────
export function distance3D(posA, posB) {
  const dx = posA.x - posB.x;  // difference in X
  const dy = posA.y - posB.y;  // difference in Y
  const dz = posA.z - posB.z;  // difference in Z
  return Math.sqrt(dx * dx + dy * dy + dz * dz);  // Pythagorean theorem in 3D
}


// ─────────────────────────────────────────────
// normalise3D
// Returns a direction vector scaled to length 1.
// Used when we want "toward X" without caring about distance.
// ─────────────────────────────────────────────
export function normalise3D(vec) {
  const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };  // zero vector — return as-is

  return {
    x: vec.x / len,   // divide each component by the length
    y: vec.y / len,
    z: vec.z / len,
  };
}


// ─────────────────────────────────────────────
// updateProjectiles
// Moves all active projectiles and removes ones
// that have travelled past their max range or lifetime.
// ─────────────────────────────────────────────
export function updateProjectiles(projectiles, deltaTime) {

  const toRemove = [];  // collect indices to remove after the loop

  for (let i = 0; i < projectiles.length; i++) {
    const proj = projectiles[i];

    // Move projectile along its direction by its speed
    proj.position.x += proj.direction.x * proj.power.speed * deltaTime;
    proj.position.y += proj.direction.y * proj.power.speed * deltaTime;
    proj.position.z += proj.direction.z * proj.power.speed * deltaTime;

    // Track how far it has travelled
    proj.distanceTravelled += proj.power.speed * deltaTime;

    // Remove if it has exceeded its range
    if (proj.distanceTravelled >= proj.power.range) {
      toRemove.push(i);
    }

    // Projectiles affected by gravity (optional — for arcing shots)
    if (proj.affectedByGravity) {
      proj.velocity.y -= GRAVITY * 0.3 * deltaTime;  // reduced gravity for arc
      proj.position.y += proj.velocity.y * deltaTime;
      if (proj.position.y <= FLOOR_Y) toRemove.push(i);  // hit the floor
    }
  }

  // Remove expired projectiles (in reverse order to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    projectiles.splice(toRemove[i], 1);
  }
}


// ─────────────────────────────────────────────
// spawnProjectile
// Creates a new projectile object from a power action.
// Returns the projectile to be added to the game state.
// ─────────────────────────────────────────────
export function spawnProjectile(action) {

  // Calculate direction from caster to target
  const dx = action.targetPosition.x - action.casterPosition.x;
  const dy = 0;   // projectiles travel horizontally (Y is height)
  const dz = action.targetPosition.z - action.casterPosition.z;

  const direction = normalise3D({ x: dx, y: dy, z: dz });  // unit vector toward target

  return {
    id:                `proj_${Date.now()}_${Math.random()}`,  // unique ID
    power:             action.power,                            // reference to the power
    owner:             action.casterAvatar,                    // who fired this
    position: {
      x: action.casterPosition.x,   // start at caster's position
      y: action.casterPosition.y + 1,  // slightly above ground (chest height)
      z: action.casterPosition.z,
    },
    velocity:          { x: 0, y: 0, z: 0 },   // velocity (for gravity arc)
    direction,                                    // normalised travel direction
    distanceTravelled: 0,                        // how far it's gone so far
    affectedByGravity: false,                    // most powers travel straight
    age:               0,                        // seconds since spawned
  };
}
