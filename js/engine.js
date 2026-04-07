// ============================================================
// js/engine.js
// The main game loop. Connects physics, combat, AI,
// powers, renderer and UI into one running system.
// ============================================================

import { updatePhysics, moveEntity, jumpEntity, spawnProjectile,
         updateProjectiles, createPhysicsBody } from './physics.js';
import { checkProjectileCollisions, createAreaEffect, dealDamage,
         updateStatusEffects, respawnEntity, onEntityDeath } from './combat.js';
import { tickCooldowns, tickEnergyRegen, usePower } from './powers.js';
import { updateAI } from './ai.js';
import { buildCharacterMesh, syncEntityMeshes, spawnProjectileVisual,
         syncProjectileVisuals, spawnHitEffect, updateEffects,
         updateCamera, renderFrame } from './renderer.js';
import { earnCoins, calculateMatchRewards, applyMatchRewards, REWARDS } from './economy.js';


// ─────────────────────────────────────────────
// createGameState
// The single source of truth for the running game.
// Everything that can change at runtime lives here.
// ─────────────────────────────────────────────
export function createGameState() {
  return {
    // ── Entities ──
    players:     [],   // player-controlled avatars
    enemies:     [],   // AI-controlled characters
    projectiles: [],   // active projectiles in flight

    // ── Match info ──
    matchMode:   null,  // 'arena1v1', 'survival', 'powerhunt'
    matchActive: false, // whether a match is in progress
    matchTimer:  0,     // seconds elapsed in match
    matchResult: null,  // filled when match ends

    // ── Input state ──
    // Tracks which keys are currently held down
    keys: {
      w: false, a: false, s: false, d: false,   // movement
      space: false,                               // jump
      q: false, e: false, r: false,              // power slots 1-3
      f: false, g: false, h: false,              // power slots 4-6 (if unlocked)
    },

    // Mouse state
    mouse: {
      x: 0, y: 0,           // screen position
      worldX: 0, worldZ: 0, // projected world position (for aiming)
      clicked: false,
    },

    // ── Timing ──
    lastFrameTime: 0,   // timestamp of last frame (for deltaTime calculation)
    deltaTime:     0,   // seconds since last frame

    // ── Spawn points ──
    spawnPoints: [
      { x: -10, y: 0, z: 0 },  // player 1 starts here
      { x:  10, y: 0, z: 0 },  // player 2 / enemies start here
    ],

    // ── Renderer state (set by init) ──
    rendererState: null,
  };
}


// ─────────────────────────────────────────────
// initEngine
// Called once on startup. Sets up everything.
// ─────────────────────────────────────────────
export function initEngine(canvas, gameState) {

  // Import renderer dynamically so we can pass the canvas
  import('./renderer.js').then(({ createRenderer }) => {
    gameState.rendererState = createRenderer(canvas);
  });

  // ── Keyboard input listeners ──
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'w')     gameState.keys.w     = true;
    if (k === 'a')     gameState.keys.a     = true;
    if (k === 's')     gameState.keys.s     = true;
    if (k === 'd')     gameState.keys.d     = true;
    if (k === ' ')     gameState.keys.space = true;
    if (k === 'q')     gameState.keys.q     = true;
    if (k === 'e')     gameState.keys.e     = true;
    if (k === 'r')     gameState.keys.r     = true;
    if (k === 'f')     gameState.keys.f     = true;
    if (k === 'g')     gameState.keys.g     = true;
    if (k === 'h')     gameState.keys.h     = true;
  });

  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'w')     gameState.keys.w     = false;
    if (k === 'a')     gameState.keys.a     = false;
    if (k === 's')     gameState.keys.s     = false;
    if (k === 'd')     gameState.keys.d     = false;
    if (k === ' ')     gameState.keys.space = false;
    if (k === 'q')     gameState.keys.q     = false;
    if (k === 'e')     gameState.keys.e     = false;
    if (k === 'r')     gameState.keys.r     = false;
    if (k === 'f')     gameState.keys.f     = false;
    if (k === 'g')     gameState.keys.g     = false;
    if (k === 'h')     gameState.keys.h     = false;
  });

  // ── Mouse input ──
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    gameState.mouse.x = e.clientX - rect.left;   // position within canvas
    gameState.mouse.y = e.clientY - rect.top;
    // World position calculated each frame using raycasting (see readInput)
  });

  canvas.addEventListener('click', e => {
    gameState.mouse.clicked = true;  // flag picked up in readInput
  });

  // Start the animation loop
  requestAnimationFrame(ts => gameLoop(ts, gameState));
}


// ─────────────────────────────────────────────
// spawnEntity
// Adds a character (player or enemy) to the game world.
// Creates its physics body and Three.js mesh.
// ─────────────────────────────────────────────
export function spawnEntity(gameState, entityData, spawnPoint, isPlayer) {

  // Create a physics body at the spawn point
  entityData.physicsBody = createPhysicsBody({
    x:           spawnPoint.x,
    y:           spawnPoint.y,
    z:           spawnPoint.z,
    mass:        entityData.avatarData?.physics.mass    ?? 70,
    friction:    entityData.avatarData?.physics.friction ?? 0.6,
    drag:        entityData.avatarData?.physics.drag     ?? 0.15,
    bounciness:  entityData.avatarData?.physics.bounciness ?? 0.05,
    canFly:      entityData.avatarData?.physics.canFly  ?? false,
  });

  entityData.isPlayer     = isPlayer;
  entityData.isDead       = false;
  entityData.canAct       = true;
  entityData.statusEffects = [];
  entityData.facing       = { x: 0, y: 0, z: -1 };  // face forward

  // Build the visual mesh in Three.js (if renderer is ready)
  if (gameState.rendererState && entityData.avatarData) {
    buildCharacterMesh(gameState.rendererState, entityData);
  }

  // Add to the appropriate array
  if (isPlayer) {
    gameState.players.push(entityData);
  } else {
    gameState.enemies.push(entityData);
  }

  return entityData;
}


// ─────────────────────────────────────────────
// startMatch
// Initialises a match: spawns players, enemies, starts timers.
// ─────────────────────────────────────────────
export function startMatch(gameState, mode) {

  gameState.matchMode   = mode;
  gameState.matchActive = true;
  gameState.matchTimer  = 0;
  gameState.matchResult = null;

  // Reset positions to spawn points
  gameState.players.forEach((player, i) => {
    const sp = gameState.spawnPoints[i] || gameState.spawnPoints[0];
    respawnEntity(player, sp);  // full heal + move to spawn
  });

  // Spawn waves of enemies for survival mode
  if (mode === 'survival') {
    spawnEnemyWave(gameState, 1);  // wave 1 at start
  }

  // Spawn one enemy for 1v1 arena
  if (mode === 'arena1v1') {
    import('./ai.js').then(({ createEnemy }) => {
      const enemy = createEnemy({ level: gameState.players[0]?.stats.level ?? 1 });
      enemy.avatarData = createSimpleAvatarData(enemy);  // placeholder mesh
      spawnEntity(gameState, enemy, gameState.spawnPoints[1], false);
    });
  }
}


// ─────────────────────────────────────────────
// gameLoop
// The main update function. Called by requestAnimationFrame.
// Runs every frame (~60fps). All systems update here.
// ─────────────────────────────────────────────
function gameLoop(timestamp, gameState) {

  // Schedule next frame FIRST — this keeps the loop running even if something errors
  requestAnimationFrame(ts => gameLoop(ts, gameState));

  // ── Calculate deltaTime ──
  // deltaTime = seconds since last frame
  // Clamped to 0.05 max (50ms) to prevent huge jumps after tab switch/lag
  gameState.deltaTime = Math.min((timestamp - (gameState.lastFrameTime || timestamp)) / 1000, 0.05);
  gameState.lastFrameTime = timestamp;

  const dt = gameState.deltaTime;  // shorthand

  if (!gameState.rendererState) return;  // renderer not ready yet

  // ── Read player input ──
  readInput(gameState);

  if (gameState.matchActive) {

    gameState.matchTimer += dt;  // count match time

    const allEntities = [...gameState.players, ...gameState.enemies];

    // ── Update physics for all entities ──
    updatePhysics(allEntities, dt);

    // ── Move and expire projectiles ──
    updateProjectiles(gameState.projectiles, dt);

    // ── Check projectile hits ──
    checkProjectileCollisions(
      gameState.projectiles,
      allEntities,
      (hitEvent) => {
        // Spawn visual hit effect at impact position
        spawnHitEffect(
          gameState.rendererState,
          hitEvent.projectile.position,
          hitEvent.projectile.power.colour
        );
      }
    );

    // ── Update status effects (burn, freeze, etc.) ──
    updateStatusEffects(allEntities, dt);

    // ── Update power cooldowns and energy regen ──
    for (const entity of allEntities) {
      tickCooldowns(entity, dt);
      tickEnergyRegen(entity, dt);
    }

    // ── Run AI for all enemies ──
    for (const enemy of gameState.enemies) {
      if (!enemy.isDead) {
        updateAI(enemy, gameState.players, dt);

        // If AI fired a power, spawn its projectile
        if (enemy._pendingAction) {
          handlePowerAction(gameState, enemy._pendingAction);
          enemy._pendingAction = null;
        }
      }
    }

    // ── Check match end conditions ──
    checkMatchEnd(gameState);

    // ── Handle respawns (after 3 second death timer) ──
    for (const entity of allEntities) {
      if (entity.isDead && entity.deathTime) {
        const deadFor = (Date.now() - entity.deathTime) / 1000;  // seconds since death
        if (deadFor >= 3.0) {  // respawn after 3 seconds
          const sp = gameState.spawnPoints[0];
          respawnEntity(entity, sp);
        }
      }
    }
  }

  // ── Sync Three.js meshes to physics positions ──
  const allForRender = [...gameState.players, ...gameState.enemies];
  syncEntityMeshes(gameState.rendererState, allForRender);
  syncProjectileVisuals(gameState.rendererState, gameState.projectiles);

  // ── Update visual effects (explosions, rings, particles) ──
  updateEffects(gameState.rendererState, dt);

  // ── Move camera to follow player ──
  if (gameState.players[0]) {
    updateCamera(gameState.rendererState.camera, gameState.players[0], dt);
  }

  // ── Render the scene ──
  renderFrame(gameState.rendererState);

  // ── Update HUD ──
  if (window.updateHUD) window.updateHUD(gameState);  // UI module hooks in here
}


// ─────────────────────────────────────────────
// readInput
// Translates held keys into entity actions.
// ─────────────────────────────────────────────
function readInput(gameState) {

  const player = gameState.players[0];  // local player is always index 0
  if (!player || !player.physicsBody) return;
  if (player.isDead) return;
  if (player.canAct === false) return;  // stunned — ignore all input

  const keys = gameState.keys;

  // ── Movement direction ──
  // Build a direction vector from WASD keys
  let dx = 0, dz = 0;
  if (keys.w) dz -= 1;  // forward  (negative Z in Three.js)
  if (keys.s) dz += 1;  // backward
  if (keys.a) dx -= 1;  // left
  if (keys.d) dx += 1;  // right

  if (dx !== 0 || dz !== 0) {
    // Normalise diagonal movement so you don't go faster at 45 degrees
    const len = Math.sqrt(dx * dx + dz * dz);
    const dir = { x: dx / len, y: 0, z: dz / len };

    moveEntity(player, dir, player.stats.speed);
    player.facing = dir;  // update facing for camera and AI
  }

  // ── Jump ──
  if (keys.space && !gameState._prevKeys?.space) {
    // Rising edge detection — only trigger on the frame the key is first pressed
    const jumped = jumpEntity(player, player.stats.jumpForce);
    // if (jumped) playSound('jump');
  }

  // ── Powers ──
  // Map keys to slot indices
  const powerKeys = [
    { key: 'q', slot: 0 },
    { key: 'e', slot: 1 },
    { key: 'r', slot: 2 },
    { key: 'f', slot: 3 },
    { key: 'g', slot: 4 },
    { key: 'h', slot: 5 },
  ];

  for (const { key, slot } of powerKeys) {
    // Rising edge: fire only on key press, not hold
    if (keys[key] && !gameState._prevKeys?.[key]) {
      const target = {  // aim at mouse world position or forward
        x: gameState.mouse.worldX || player.physicsBody.position.x + player.facing.x * 20,
        y: player.physicsBody.position.y,
        z: gameState.mouse.worldZ || player.physicsBody.position.z + player.facing.z * 20,
      };

      const result = usePower(player, slot, target);

      if (result.success) {
        handlePowerAction(gameState, result);  // spawn projectile / apply effect
      } else if (result.error) {
        if (window.showGameMessage) window.showGameMessage(result.error);  // show to player
      }
    }
  }

  // Store previous key state for rising-edge detection on next frame
  gameState._prevKeys = { ...keys };
}


// ─────────────────────────────────────────────
// handlePowerAction
// Executes the visual/physics side of a power being used.
// Called for both player and AI power uses.
// ─────────────────────────────────────────────
function handlePowerAction(gameState, action) {

  const power = action.power;

  if (power.type === 'projectile') {
    // Create projectile physics object
    const proj = spawnProjectile(action);

    // Add to active projectiles list
    gameState.projectiles.push(proj);

    // Create its visual mesh
    spawnProjectileVisual(gameState.rendererState, proj);
  }

  if (power.type === 'area') {
    // Instant area damage — no projectile, just an effect
    const allEntities = [...gameState.players, ...gameState.enemies];
    createAreaEffect(action.casterPosition, power, allEntities, action.casterAvatar);

    // Visual ring effect at cast position
    spawnHitEffect(gameState.rendererState, action.casterPosition, power.colour);
  }

  if (power.type === 'movement' && power.effect === 'teleportForward') {
    import('./physics.js').then(({ dashEntity }) => {
      dashEntity(action.casterAvatar, power.effectValue ?? 15);
    });
  }
}


// ─────────────────────────────────────────────
// checkMatchEnd
// Tests win/loss conditions each frame.
// ─────────────────────────────────────────────
function checkMatchEnd(gameState) {

  if (!gameState.matchActive) return;

  const mode = gameState.matchMode;

  if (mode === 'arena1v1') {
    const playerDead = gameState.players.every(p => p.isDead);
    const enemyDead  = gameState.enemies.every(e => e.isDead);

    if (playerDead) endMatch(gameState, 'enemy');
    if (enemyDead)  endMatch(gameState, 'player');
  }

  if (mode === 'survival') {
    const playerDead = gameState.players.every(p => p.isDead);
    if (playerDead) endMatch(gameState, 'enemy');

    // All enemies cleared — spawn next wave
    if (gameState.enemies.every(e => e.isDead)) {
      const wave = Math.floor(gameState.matchTimer / 30) + 1;  // new wave every 30s
      spawnEnemyWave(gameState, wave);
      earnCoins(gameState.players[0], REWARDS.SURVIVE_WAVE, 'wave_cleared');
    }
  }
}


// ─────────────────────────────────────────────
// endMatch
// Called when the match is over. Awards rewards.
// ─────────────────────────────────────────────
function endMatch(gameState, winner) {

  gameState.matchActive = false;

  const matchResult = {
    winner,
    duration: gameState.matchTimer,
    players:  gameState.players.map(p => ({
      avatar:      p,
      isWinner:    winner === 'player',
      kills:       p.killCount        ?? 0,
      totalDamage: p.totalDamageDealt ?? 0,
    })),
  };

  gameState.matchResult = matchResult;

  // Calculate and apply rewards
  const rewards = calculateMatchRewards(matchResult);
  applyMatchRewards(rewards);

  // Notify UI to show end screen
  if (window.showMatchResult) window.showMatchResult(matchResult, rewards);
}


// ─────────────────────────────────────────────
// spawnEnemyWave
// Spawns enemies for survival mode. Harder each wave.
// ─────────────────────────────────────────────
function spawnEnemyWave(gameState, waveNumber) {

  const enemyCount = 2 + waveNumber;  // more enemies per wave
  const enemyLevel = Math.max(1, waveNumber);  // enemies level up each wave

  for (let i = 0; i < enemyCount; i++) {
    import('./ai.js').then(({ createEnemy }) => {
      const enemy = createEnemy({
        level:      enemyLevel,
        difficulty: waveNumber > 3 ? 'hard' : waveNumber > 1 ? 'medium' : 'easy',
      });
      enemy.avatarData = createSimpleAvatarData(enemy);

      // Spread enemies around the arena edge
      const angle = (i / enemyCount) * Math.PI * 2;  // evenly spaced around a circle
      const sp    = { x: Math.cos(angle) * 18, y: 0, z: Math.sin(angle) * 18 };
      spawnEntity(gameState, enemy, sp, false);
    });
  }
}


// ─────────────────────────────────────────────
// createSimpleAvatarData
// Creates a basic geometric avatar for enemies
// that don't have an image-generated CPG mesh.
// Uses a simple box mesh as a placeholder.
// ─────────────────────────────────────────────
function createSimpleAvatarData(enemy) {
  // Build a minimal mesh — just a few triangles forming a rough humanoid box
  // This is used until the full CPG pipeline is run on an actual image
  const points = [
    // Torso corners (simple box)
    { x: -0.5, y: 0,   z: -0.2, r: 200, g: 50, b: 50, a: 255 },
    { x:  0.5, y: 0,   z: -0.2, r: 200, g: 50, b: 50, a: 255 },
    { x: -0.5, y: 2.0, z: -0.2, r: 180, g: 40, b: 40, a: 255 },
    { x:  0.5, y: 2.0, z: -0.2, r: 180, g: 40, b: 40, a: 255 },
    // Head
    { x: -0.25, y: 2.0, z: -0.1, r: 220, g: 160, b: 120, a: 255 },
    { x:  0.25, y: 2.0, z: -0.1, r: 220, g: 160, b: 120, a: 255 },
    { x: -0.25, y: 2.6, z: -0.1, r: 220, g: 160, b: 120, a: 255 },
    { x:  0.25, y: 2.6, z: -0.1, r: 220, g: 160, b: 120, a: 255 },
  ];
  const triangles = [
    { a:0, b:1, c:2 }, { a:1, b:3, c:2 },  // torso face
    { a:4, b:5, c:6 }, { a:5, b:7, c:6 },  // head face
  ];
  return {
    id:   enemy.id,
    name: enemy.name,
    mesh: { points, triangles },
    physics: { mass:70, friction:0.6, drag:0.15, bounciness:0.05, canFly:false },
    skin: { base:{r:200,g:50,b:50}, roughness:0.7, metalness:0, colourMode:'texture' },
    skeleton: [],
    hitbox:   { type:'capsule', radius:0.6, height:2.6, offsetY:1.3 },
    stats:    enemy.stats,
    powers:   enemy.powers,
  };
}
