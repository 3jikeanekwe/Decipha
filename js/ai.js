// ============================================================
// js/ai.js
// Controls enemy/NPC behaviour using a behaviour tree.
// A behaviour tree checks rules in priority order —
// the first matching rule wins.
// ============================================================

import { distance3D, normalise3D, moveEntity, jumpEntity } from './physics.js';
import { usePower } from './powers.js';


// ─────────────────────────────────────────────
// createAIController
// Returns an AI state object attached to an entity.
// ─────────────────────────────────────────────
export function createAIController(config = {}) {
  return {
    // How often the AI recalculates its decision (seconds)
    // More frequent = smarter but more CPU
    thinkInterval:    config.thinkInterval ?? 0.3,
    thinkTimer:       0,        // counts up to thinkInterval

    // Current high-level goal
    state:            'idle',   // idle / chase / attack / flee / patrol

    // The target entity this AI is focused on
    target:           null,

    // Last known position of the target (used when line-of-sight is lost)
    lastKnownTargetPos: null,

    // Wander destination for idle patrol
    wanderTarget:     null,
    wanderTimer:      0,        // how long to wander before picking new destination

    // Aggro range — how close a player must get before AI notices them
    aggroRange:       20,

    // Attack range — how close before AI uses melee
    meleeRange:       2.5,

    // Retreat range — AI stays this far if it has ranged powers
    preferredRange:   12,

    // Difficulty: 'easy' 'medium' 'hard'
    // Higher difficulty = faster reactions, better power selection, less mistakes
    difficulty:       config.difficulty ?? 'medium',
  };
}


// ─────────────────────────────────────────────
// updateAI
// Main AI update function — runs the behaviour tree.
// Call every frame with deltaTime.
// ─────────────────────────────────────────────
export function updateAI(entity, players, deltaTime) {

  const ai = entity.aiController;
  if (!ai) return;         // not an AI entity — skip
  if (entity.isDead) return;  // dead — no thinking

  // ── Throttle AI decisions ──
  // We don't need to recalculate every single frame
  ai.thinkTimer += deltaTime;
  if (ai.thinkTimer < ai.thinkInterval) return;  // not time to think yet
  ai.thinkTimer = 0;  // reset timer

  // ── Find the nearest player ──
  const nearestPlayer = findNearestPlayer(entity, players);
  if (!nearestPlayer) {
    // No players found — just idle
    behaviourIdle(entity, ai, deltaTime);
    return;
  }

  const distToPlayer = distance3D(
    entity.physicsBody.position,
    nearestPlayer.physicsBody.position
  );

  // Track last known position (useful if player teleports out of range)
  ai.lastKnownTargetPos = { ...nearestPlayer.physicsBody.position };
  ai.target = nearestPlayer;

  // ──────────────────────────────────────────
  // BEHAVIOUR TREE
  // Rules checked top to bottom — first match wins
  // ──────────────────────────────────────────

  // Rule 1: Flee when health is critically low
  if (entity.stats.health < entity.stats.maxHealth * 0.2) {
    behaviourFlee(entity, ai, nearestPlayer);
    ai.state = 'flee';
    return;
  }

  // Rule 2: Use a power if player is within range and a power is ready
  if (distToPlayer < ai.aggroRange) {
    const readyPower = selectBestPower(entity, nearestPlayer);
    if (readyPower !== null) {
      behaviourUsePower(entity, ai, nearestPlayer, readyPower);
      ai.state = 'attack';
      return;
    }
  }

  // Rule 3: Melee attack if very close
  if (distToPlayer < ai.meleeRange) {
    behaviourMelee(entity, ai, nearestPlayer);
    ai.state = 'attack';
    return;
  }

  // Rule 4: Chase if within aggro range
  if (distToPlayer < ai.aggroRange) {
    behaviourChase(entity, ai, nearestPlayer);
    ai.state = 'chase';
    return;
  }

  // Rule 5: Default — idle patrol
  behaviourIdle(entity, ai, deltaTime);
  ai.state = 'idle';
}


// ─────────────────────────────────────────────
// behaviourChase
// Move toward the player at a proportion of full speed.
// ─────────────────────────────────────────────
function behaviourChase(entity, ai, target) {

  const myPos     = entity.physicsBody.position;
  const targetPos = target.physicsBody.position;

  // Direction from self to target
  const dx = targetPos.x - myPos.x;
  const dz = targetPos.z - myPos.z;
  const dir = normalise3D({ x: dx, y: 0, z: dz });

  // Move at 70% of max speed — leaves room for acceleration feel
  const speed = entity.stats.speed * 0.7;
  moveEntity(entity, dir, speed);

  entity.facing = dir;   // update facing direction for animations

  // Occasionally jump to look less robotic
  if (Math.random() < 0.05) {  // 5% chance per think cycle
    jumpEntity(entity, entity.stats.jumpForce);
  }
}


// ─────────────────────────────────────────────
// behaviourFlee
// Run directly away from the target.
// ─────────────────────────────────────────────
function behaviourFlee(entity, ai, target) {

  const myPos     = entity.physicsBody.position;
  const targetPos = target.physicsBody.position;

  // Direction is reversed: away from target
  const dx = myPos.x - targetPos.x;
  const dz = myPos.z - targetPos.z;
  const dir = normalise3D({ x: dx, y: 0, z: dz });

  const speed = entity.stats.speed;  // flee at full speed
  moveEntity(entity, dir, speed);

  entity.facing = dir;
}


// ─────────────────────────────────────────────
// behaviourUsePower
// Stand still and fire the selected power at the target.
// ─────────────────────────────────────────────
function behaviourUsePower(entity, ai, target, powerSlotIndex) {

  // Stop moving to take aim (looks more intentional)
  entity.physicsBody.velocity.x = 0;
  entity.physicsBody.velocity.z = 0;

  // Face the target
  const dx = target.physicsBody.position.x - entity.physicsBody.position.x;
  const dz = target.physicsBody.position.z - entity.physicsBody.position.z;
  entity.facing = normalise3D({ x: dx, y: 0, z: dz });

  // Fire the power — target position is the player's current position
  const result = usePower(entity, powerSlotIndex, target.physicsBody.position);

  // result.success means the power was fired — the game engine handles spawning
  if (result.success && entity.onPowerUsed) {
    entity.onPowerUsed(result);  // notify game engine
  }
}


// ─────────────────────────────────────────────
// behaviourMelee
// Close-range attack — charge and push
// ─────────────────────────────────────────────
function behaviourMelee(entity, ai, target) {

  // Use the first available power (usually the melee/fast power)
  const readyPowerIndex = entity.powers.findIndex(
    p => p && p.cooldownLeft === 0 && entity.stats.energy >= p.energyCost
  );

  if (readyPowerIndex !== -1) {
    behaviourUsePower(entity, ai, target, readyPowerIndex);
  } else {
    // No powers ready — just run into them (basic melee bump)
    behaviourChase(entity, ai, target);
  }
}


// ─────────────────────────────────────────────
// behaviourIdle
// Wander around randomly when no players are in range.
// Picks a new destination every few seconds.
// ─────────────────────────────────────────────
function behaviourIdle(entity, ai, deltaTime) {

  ai.wanderTimer -= deltaTime;  // count down the wander timer

  if (ai.wanderTimer <= 0 || !ai.wanderTarget) {
    // Pick a new random wander destination nearby
    ai.wanderTarget = {
      x: entity.physicsBody.position.x + (Math.random() - 0.5) * 20,  // ±10 units
      z: entity.physicsBody.position.z + (Math.random() - 0.5) * 20,
    };
    ai.wanderTimer = 2.0 + Math.random() * 3.0;  // wander for 2-5 seconds
  }

  // Move toward the wander destination at 30% speed
  const dx  = ai.wanderTarget.x - entity.physicsBody.position.x;
  const dz  = ai.wanderTarget.z - entity.physicsBody.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 1.0) {  // only move if not already there
    const dir = { x: dx / dist, y: 0, z: dz / dist };
    moveEntity(entity, dir, entity.stats.speed * 0.3);
    entity.facing = dir;
  } else {
    // Reached destination — stop and wait for next wander
    entity.physicsBody.velocity.x = 0;
    entity.physicsBody.velocity.z = 0;
  }
}


// ─────────────────────────────────────────────
// findNearestPlayer
// Returns the closest player entity to the AI.
// ─────────────────────────────────────────────
function findNearestPlayer(entity, players) {

  let nearest = null;
  let minDist = Infinity;

  for (const player of players) {
    if (player.isDead) continue;  // ignore dead players

    const dist = distance3D(
      entity.physicsBody.position,
      player.physicsBody.position
    );

    if (dist < minDist) {
      minDist = dist;
      nearest = player;
    }
  }

  return nearest;  // null if no living players found
}


// ─────────────────────────────────────────────
// selectBestPower
// Picks the power slot index that is most effective right now.
// Returns null if no power is ready.
// ─────────────────────────────────────────────
function selectBestPower(entity, target) {

  let bestIndex = null;
  let bestScore = -Infinity;

  entity.powers.forEach((power, index) => {

    if (!power) return;  // empty slot

    // Skip if on cooldown or not enough energy
    if (power.cooldownLeft > 0) return;
    if (entity.stats.energy < power.energyCost) return;

    // ── Score this power ──
    let score = power.damage;  // base score is damage

    // Prefer high-damage AoE when target is close
    const dist = distance3D(entity.physicsBody.position, target.physicsBody.position);
    if (power.type === 'area' && dist < power.aoeRadius * 1.5) score += 20;

    // Prefer powers that exploit existing status effects
    if (target.statusEffects) {
      // Don't apply the same element twice — not effective
      const hasBurn    = target.statusEffects.some(e => e.type === 'burn');
      const hasFreeze  = target.statusEffects.some(e => e.type === 'freeze');
      if (power.onHit === 'burn'   && hasBurn)   score -= 15;  // already burning
      if (power.onHit === 'freeze' && hasFreeze) score -= 15;  // already frozen
    }

    // Easy AI makes more mistakes — add random noise to score
    if (entity.aiController.difficulty === 'easy') {
      score += (Math.random() - 0.5) * 30;  // random ±15
    }

    // Hard AI plans ahead — prefers combos
    if (entity.aiController.difficulty === 'hard') {
      // Hard AI prefers to stun then deal damage
      const targetIsStunned = target.statusEffects?.some(e => e.type === 'stun');
      if (targetIsStunned) score += 30;  // bonus when target can't dodge
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;  // null if no power is usable
}


// ─────────────────────────────────────────────
// createEnemy
// Constructs a basic enemy entity from a config.
// ─────────────────────────────────────────────
export function createEnemy(config = {}) {

  const level = config.level ?? 1;

  // Enemy stats scale with level
  const maxHealth = 60 + level * 15;
  const strength  = 6  + level * 2;
  const defence   = 2  + level;
  const speed     = 3.5 + level * 0.2;

  return {
    id:       `enemy_${Date.now()}_${Math.random()}`,
    name:     config.name ?? `Enemy Lv.${level}`,
    isPlayer: false,    // flag: this is an AI entity
    isDead:   false,

    stats: {
      health:     maxHealth,
      maxHealth,
      energy:     80,
      maxEnergy:  80,
      speed,
      jumpForce:  6.0,
      strength,
      defence,
      level,
      experience: 0,
    },

    // Enemies start with 2 basic powers
    powers: [
      { ...config.power1 ?? defaultEnemyPower(level, 0) },
      { ...config.power2 ?? defaultEnemyPower(level, 1) },
      null,  // third slot empty
    ],

    hitbox: {
      type:    'capsule',
      radius:  1.2,
      height:  2.0,
      offsetY: 1.0,
    },

    physicsBody: null,  // set by game engine when entity is spawned
    statusEffects: [],
    canAct:  true,
    facing:  { x: 0, y: 0, z: -1 },   // default: facing forward

    aiController: createAIController({ difficulty: config.difficulty ?? 'medium' }),
    wallet: { coins: 0 },  // enemies don't have wallets — placeholder
  };
}


// ─────────────────────────────────────────────
// defaultEnemyPower
// Creates a simple power for enemies.
// ─────────────────────────────────────────────
function defaultEnemyPower(level, slot) {
  // Enemies get progressively stronger powers per level
  if (slot === 0) {
    // Slot 0: fast projectile attack
    return {
      id:            `enemy_strike_lv${level}`,
      name:          'Enemy Strike',
      type:          'projectile',
      element:       'none',
      energyCost:    8,
      cooldown:      1.0,
      cooldownLeft:  0,
      damage:        10 + level * 3,   // scales with level
      aoeRadius:     0,
      speed:         35,
      shape:         'sphere',
      colour:        { r: 200, g: 50, b: 50 },  // red — enemy colour
      onHit:         null,
      onHitDuration: 0,
      knockbackForce: 0,
      sound:         'enemy_attack',
      animation:     'throw',
      unlocked:      true,
    };
  } else {
    // Slot 1: area stun for higher-level enemies
    return {
      id:            `enemy_slam_lv${level}`,
      name:          'Ground Slam',
      type:          'area',
      element:       'earth',
      energyCost:    20,
      cooldown:      4.0,
      cooldownLeft:  0,
      damage:        8 + level * 2,
      aoeRadius:     3,
      speed:         0,
      shape:         'ring',
      colour:        { r: 150, g: 80, b: 20 },
      onHit:         level >= 3 ? 'stun' : null,  // stun only at level 3+
      onHitDuration: 1.5,
      knockbackForce: 5,
      sound:         'slam',
      animation:     'slam',
      unlocked:      true,
    };
  }
}
