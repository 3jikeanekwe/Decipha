 // ============================================================
// js/combat.js
// Handles all combat interactions:
//   - Projectile vs entity collision
//   - Area of effect damage
//   - Status effects (burn, freeze, stun, poison, knockback)
//   - Death and respawn logic
// ============================================================

import { distance3D, applyForce, normalise3D } from './physics.js';


// ─────────────────────────────────────────────
// checkProjectileCollisions
// Tests every active projectile against every entity.
// When a hit is detected, applies damage and effects.
// ─────────────────────────────────────────────
export function checkProjectileCollisions(projectiles, entities, onHitCallback) {

  const projectilesToRemove = [];  // collect indices of spent projectiles

  for (let pi = 0; pi < projectiles.length; pi++) {
    const proj = projectiles[pi];

    for (const entity of entities) {

      // Don't let a projectile hit its own owner
      if (entity === proj.owner) continue;

      // Skip dead entities — can't damage them further
      if (entity.stats.health <= 0) continue;

      // Check if the projectile is within the entity's hitbox radius
      const dist = distance3D(proj.position, entity.physicsBody.position);
      const hitRadius = entity.hitbox ? entity.hitbox.radius : 1.5;  // default 1.5 units

      if (dist <= hitRadius) {
        // ── Hit! ──
        dealDamage(entity, proj.power, proj.owner);   // apply damage and effects

        // If it has an area of effect, damage nearby entities too
        if (proj.power.aoeRadius > 0) {
          createAreaEffect(proj.position, proj.power, entities, proj.owner);
        }

        // Notify the callback (used by renderer to spawn hit effects)
        if (onHitCallback) {
          onHitCallback({ projectile: proj, target: entity });
        }

        projectilesToRemove.push(pi);  // projectile is spent after hitting
        break;  // one projectile can only hit one target (first hit wins)
      }
    }
  }

  // Remove spent projectiles (reverse order to keep indices valid)
  for (let i = projectilesToRemove.length - 1; i >= 0; i--) {
    projectiles.splice(projectilesToRemove[i], 1);
  }
}


// ─────────────────────────────────────────────
// dealDamage
// Applies damage from a power to a target entity.
// Accounts for defence, buffs and status effects.
// ─────────────────────────────────────────────
export function dealDamage(target, power, attacker) {

  // Skip if target is already dead
  if (target.stats.health <= 0) return;

  // ── Calculate effective damage ──
  let raw = power.damage;

  // Add attacker's strength bonus (10% of strength stat per point)
  if (attacker && attacker.stats) {
    raw += attacker.stats.strength * 0.1;
  }

  // Reduce by target's defence stat
  let dealt = raw - target.stats.defence;

  // Always deal at least 1 damage (defence can never fully block)
  dealt = Math.max(1, Math.round(dealt));

  // If target has a shield buff active, halve the damage
  if (target.statusEffects) {
    const shield = target.statusEffects.find(e => e.type === 'shield');
    if (shield) dealt = Math.round(dealt * 0.5);  // 50% reduction
  }

  // ── Apply damage ──
  target.stats.health -= dealt;

  // Clamp to 0 — health can't go negative
  if (target.stats.health < 0) target.stats.health = 0;

  // ── Apply secondary (on-hit) effects ──
  if (power.onHit) {
    applyStatusEffect(target, power.onHit, power.onHitDuration || 2.0, power);
  }

  // ── Apply knockback ──
  if (power.onHit === 'knockback' && attacker) {
    // Push target away from attacker
    const dx = target.physicsBody.position.x - attacker.physicsBody.position.x;
    const dz = target.physicsBody.position.z - attacker.physicsBody.position.z;
    const dir = normalise3D({ x: dx, y: 0.3, z: dz });  // slight upward angle
    applyForce(target, dir, power.knockbackForce || 10);
  }

  if (power.onHit === 'pull' && attacker) {
    // Pull target toward attacker
    const dx = attacker.physicsBody.position.x - target.physicsBody.position.x;
    const dz = attacker.physicsBody.position.z - target.physicsBody.position.z;
    const dir = normalise3D({ x: dx, y: 0, z: dz });  // toward attacker
    applyForce(target, dir, power.knockbackForce || 8);
  }

  // ── Check for death ──
  if (target.stats.health <= 0) {
    onEntityDeath(target, attacker);
  }

  // Return how much damage was actually dealt (useful for UI)
  return dealt;
}


// ─────────────────────────────────────────────
// createAreaEffect
// Damages all entities within aoeRadius of a position.
// Called when an area power is used or a projectile explodes.
// ─────────────────────────────────────────────
export function createAreaEffect(centre, power, entities, attacker) {

  for (const entity of entities) {

    if (entity === attacker) continue;        // don't damage yourself with your own AOE
    if (entity.stats.health <= 0) continue;  // skip dead entities

    const dist = distance3D(centre, entity.physicsBody.position);

    if (dist <= power.aoeRadius) {
      // Damage falls off with distance: full damage at centre, less at edge
      const falloff = 1 - (dist / power.aoeRadius);  // 1.0 at centre, 0.0 at edge

      // Create a modified power with reduced damage based on distance
      const scaledPower = { ...power, damage: Math.round(power.damage * falloff) };
      dealDamage(entity, scaledPower, attacker);
    }
  }
}


// ─────────────────────────────────────────────
// applyStatusEffect
// Applies a timed effect to an entity.
// Effects are stored in entity.statusEffects array.
// ─────────────────────────────────────────────
export function applyStatusEffect(entity, effectType, duration, power = {}) {

  // Initialise the status effects array if it doesn't exist yet
  if (!entity.statusEffects) entity.statusEffects = [];

  // Remove any existing effect of the same type before adding the new one
  // (refreshes duration rather than stacking duplicates)
  entity.statusEffects = entity.statusEffects.filter(e => e.type !== effectType);

  // Add the new status effect
  entity.statusEffects.push({
    type:      effectType,  // 'burn', 'freeze', 'stun', 'poison', 'shield', 'pull'
    remaining: duration,    // seconds left
    tickTimer: 0,           // used for effects that apply damage per second
    power,                  // reference to the power that caused it (for damage calc)
  });

  // ── Immediate effects applied on start ──

  if (effectType === 'freeze') {
    entity.physicsBody.speedMultiplier = 0;  // can't move while frozen
    entity.canAct = false;                   // can't use powers
    // Visual: entity turns blue — handled by renderer watching statusEffects
  }

  if (effectType === 'stun') {
    entity.canAct = false;          // can't use powers or attack
    // Movement is still technically allowed for stun (just can't act)
  }

  if (effectType === 'shield') {
    entity.physicsBody.speedMultiplier = 1.0;  // shield doesn't affect movement
    // Damage reduction is handled in dealDamage by checking for this effect
  }
}


// ─────────────────────────────────────────────
// updateStatusEffects
// Ticks all status effect timers down.
// Applies damage-over-time effects.
// Removes expired effects and restores entity state.
// Call every frame with deltaTime.
// ─────────────────────────────────────────────
export function updateStatusEffects(entities, deltaTime) {

  for (const entity of entities) {

    if (!entity.statusEffects || entity.statusEffects.length === 0) continue;

    const expired = [];  // effects to remove this frame

    for (const effect of entity.statusEffects) {

      effect.remaining -= deltaTime;  // count down the timer

      // ── Damage over time effects ──

      if (effect.type === 'burn') {
        effect.tickTimer += deltaTime;
        // Deal 5 fire damage every 0.5 seconds
        if (effect.tickTimer >= 0.5) {
          entity.stats.health -= 5;
          if (entity.stats.health < 0) entity.stats.health = 0;
          effect.tickTimer = 0;  // reset tick timer
          if (entity.stats.health <= 0) onEntityDeath(entity, null);
        }
      }

      if (effect.type === 'poison') {
        effect.tickTimer += deltaTime;
        // Deal 3 poison damage every 1 second
        if (effect.tickTimer >= 1.0) {
          entity.stats.health -= 3;
          if (entity.stats.health < 0) entity.stats.health = 0;
          effect.tickTimer = 0;
          if (entity.stats.health <= 0) onEntityDeath(entity, null);
        }
      }

      // ── Check expiry ──
      if (effect.remaining <= 0) {
        expired.push(effect);  // mark for removal
      }
    }

    // ── Remove expired effects and restore entity state ──
    for (const effect of expired) {

      // Restore frozen/stunned state when the effect expires
      if (effect.type === 'freeze') {
        entity.physicsBody.speedMultiplier = 1.0;  // restore full movement
        entity.canAct = true;
      }
      if (effect.type === 'stun') {
        entity.canAct = true;  // can act again
      }

      // Remove from array
      entity.statusEffects = entity.statusEffects.filter(e => e !== effect);
    }
  }
}


// ─────────────────────────────────────────────
// onEntityDeath
// Called when an entity's health reaches 0.
// Triggers death animation, awards XP and coins.
// ─────────────────────────────────────────────
export function onEntityDeath(entity, killer) {

  entity.isDead = true;      // flag as dead
  entity.deathTime = Date.now();  // record when they died (for respawn timer)
  entity.canAct = false;     // can't act when dead

  // Stop all movement
  entity.physicsBody.velocity.x = 0;
  entity.physicsBody.velocity.y = 0;
  entity.physicsBody.velocity.z = 0;

  // Clear status effects on death
  entity.statusEffects = [];

  // ── Award experience and coins to killer ──
  if (killer && killer.stats) {
    const xpReward    = 25 + entity.stats.level * 5;  // more XP for harder enemies
    const coinReward  = 10 + entity.stats.level * 2;  // more coins too

    addExperience(killer, xpReward);
    killer.wallet.coins += coinReward;

    // Notify game for UI floating text
    if (killer.onKill) killer.onKill({ xp: xpReward, coins: coinReward });
  }

  // Notify entity for animations
  if (entity.onDeath) entity.onDeath();
}


// ─────────────────────────────────────────────
// respawnEntity
// Resets a dead entity back to full health at a spawn point.
// ─────────────────────────────────────────────
export function respawnEntity(entity, spawnPoint) {

  entity.isDead  = false;       // no longer dead
  entity.canAct  = true;        // can act again

  // Restore health and energy to full
  entity.stats.health = entity.stats.maxHealth;
  entity.stats.energy = entity.stats.maxEnergy;

  // Clear all status effects
  entity.statusEffects = [];

  // Teleport to spawn point
  entity.physicsBody.position.x = spawnPoint.x;
  entity.physicsBody.position.y = spawnPoint.y;
  entity.physicsBody.position.z = spawnPoint.z;

  // Zero velocity
  entity.physicsBody.velocity = { x: 0, y: 0, z: 0 };

  // Reset jump counter
  entity.physicsBody.jumpsUsed = 0;
  entity.physicsBody.isGrounded = false;

  // Reset all power cooldowns (fresh start on respawn)
  if (entity.powers) {
    for (const power of entity.powers) {
      if (power) power.cooldownLeft = 0;
    }
  }

  // Trigger respawn invincibility (2 seconds where they can't be hit)
  applyStatusEffect(entity, 'invincible', 2.0);
}


// ─────────────────────────────────────────────
// addExperience
// Adds XP to an entity and handles level-ups.
// ─────────────────────────────────────────────
export function addExperience(entity, amount) {

  if (!entity.stats) return;

  entity.stats.experience += amount;  // add the XP

  // XP required for next level: 100 × level × 1.5
  const xpNeeded = Math.floor(100 * entity.stats.level * 1.5);

  if (entity.stats.experience >= xpNeeded) {
    entity.stats.experience -= xpNeeded;  // carry over excess XP
    levelUp(entity);
  }
}


// ─────────────────────────────────────────────
// levelUp
// Increases an entity's level and improves their stats.
// Called automatically by addExperience when threshold is reached.
// ─────────────────────────────────────────────
export function levelUp(entity) {

  entity.stats.level += 1;  // increment level

  // Each level gives a permanent stat boost
  entity.stats.maxHealth  += 10;   // +10 max HP per level
  entity.stats.maxEnergy  += 5;    // +5 max energy per level
  entity.stats.strength   += 2;    // +2 strength per level
  entity.stats.defence    += 1;    // +1 defence per level
  entity.stats.speed      += 0.1;  // +0.1 speed per level

  // Refill health and energy on level up (reward)
  entity.stats.health = entity.stats.maxHealth;
  entity.stats.energy = entity.stats.maxEnergy;

  // Award level-up coins bonus
  if (entity.wallet) entity.wallet.coins += 200;

  // Notify game engine for level-up screen and sound
  if (entity.onLevelUp) entity.onLevelUp(entity.stats.level);
}
