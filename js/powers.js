// ============================================================
// js/powers.js
// Everything related to powers:
//   - Default starter powers
//   - Power catalogue for the shop
//   - Using a power in combat
//   - AI-assisted power creation from a text prompt
//   - Balancing algorithm
// ============================================================


// ─────────────────────────────────────────────
// ELEMENT COLOURS
// Maps each element name to an RGB colour used
// for visual effects, projectiles and UI
// ─────────────────────────────────────────────
export const ELEMENT_COLOURS = {
  fire:      { r: 255, g: 80,  b: 0   },   // orange-red
  water:     { r: 0,   g: 150, b: 255 },   // bright blue
  earth:     { r: 100, g: 60,  b: 20  },   // brown
  wind:      { r: 200, g: 255, b: 200 },   // light green
  lightning: { r: 255, g: 255, b: 0   },   // yellow
  dark:      { r: 80,  g: 0,   b: 120 },   // deep purple
  light:     { r: 255, g: 255, b: 200 },   // warm white
  none:      { r: 200, g: 200, b: 255 },   // pale blue-white
};


// ─────────────────────────────────────────────
// DEFAULT STARTER POWERS
// Every new player gets these 3 for free.
// Balanced for level 1 — not too strong, not useless.
// ─────────────────────────────────────────────
export const DEFAULT_POWERS = [

  {
    id:            'strike',           // unique identifier
    name:          'Strike',           // display name shown in UI
    description:   'A fast energy blast that knocks enemies back.',
    type:          'projectile',       // spawns a moving projectile
    element:       'none',             // no elemental type
    slot:          1,                  // assigned to Q key by default
    energyCost:    10,                 // energy drained per use
    cooldown:      0.5,                // seconds before can use again
    cooldownLeft:  0,                  // current cooldown timer (0 = ready)
    damage:        15,                 // base damage before defence reduction
    healing:       0,                  // HP restored (0 = no healing)
    range:         30,                 // max travel distance in world units
    aoeRadius:     0,                  // area of effect (0 = single target)
    duration:      0,                  // effect duration in seconds (0 = instant)
    speed:         40,                 // projectile travel speed
    shape:         'sphere',           // visual shape of projectile/effect
    colour:        ELEMENT_COLOURS.none,
    onHit:         'knockback',        // secondary effect applied on hit
    onHitDuration: 0.3,                // how long the secondary effect lasts
    knockbackForce: 8,                 // force applied on knockback
    sound:         'whoosh',           // sound effect key
    animation:     'punch',            // animation key to play
    cost:          0,                  // 0 = free starter power
    unlocked:      true,               // already unlocked for new players
  },

  {
    id:            'shield',
    name:          'Shield',
    description:   'Surrounds you with a protective barrier for 5 seconds.',
    type:          'buff',             // applies an effect to self
    element:       'light',
    slot:          2,
    energyCost:    25,
    cooldown:      8.0,
    cooldownLeft:  0,
    damage:        0,
    healing:       0,
    range:         0,                  // no range — self-cast
    aoeRadius:     0,
    duration:      5.0,                // barrier lasts 5 seconds
    speed:         0,
    shape:         'ring',             // ring of light appears around player
    colour:        ELEMENT_COLOURS.light,
    onHit:         null,
    onHitDuration: 0,
    effect:        'reduceDamage',     // special effect applied to caster
    effectValue:   0.5,                // 50% damage reduction
    sound:         'shield_up',
    animation:     'raise_arms',
    cost:          0,
    unlocked:      true,
  },

  {
    id:            'dash',
    name:          'Dash',
    description:   'Teleports you forward 15 units, damaging anything in your path.',
    type:          'movement',         // moves the character
    element:       'wind',
    slot:          3,
    energyCost:    15,
    cooldown:      3.0,
    cooldownLeft:  0,
    damage:        5,                  // minor damage to anything you pass through
    healing:       0,
    range:         15,                 // distance of the dash
    aoeRadius:     1,                  // small width — things directly in path
    duration:      0.2,               // very fast movement
    speed:         80,                 // very fast
    shape:         'wave',             // trailing wave effect
    colour:        ELEMENT_COLOURS.wind,
    onHit:         null,
    onHitDuration: 0,
    effect:        'teleportForward',  // actually moves the character
    effectValue:   15,                 // 15 units forward
    sound:         'woosh_fast',
    animation:     'dash',
    cost:          0,
    unlocked:      true,
  },
];


// ─────────────────────────────────────────────
// SHOP POWER CATALOGUE
// Powers available for purchase with in-game coins.
// ─────────────────────────────────────────────
export const SHOP_POWERS = [
  {
    id:            'inferno_blast',
    name:          'Inferno Blast',
    description:   'A massive fireball that explodes on impact, burning enemies.',
    type:          'projectile',
    element:       'fire',
    energyCost:    30,
    cooldown:      4.0,
    cooldownLeft:  0,
    damage:        45,
    aoeRadius:     4,
    speed:         25,
    shape:         'sphere',
    colour:        ELEMENT_COLOURS.fire,
    onHit:         'burn',
    onHitDuration: 3.0,               // burns for 3 seconds (5 dmg/sec)
    sound:         'fire_blast',
    animation:     'throw',
    cost:          300,               // costs 300 coins
    unlocked:      false,
  },
  {
    id:            'thunder_strike',
    name:          'Thunder Strike',
    description:   'A lightning bolt that stuns the target.',
    type:          'projectile',
    element:       'lightning',
    energyCost:    28,
    cooldown:      3.5,
    cooldownLeft:  0,
    damage:        35,
    aoeRadius:     2,
    speed:         60,                // lightning is fast
    shape:         'beam',
    colour:        ELEMENT_COLOURS.lightning,
    onHit:         'stun',
    onHitDuration: 2.0,               // stuns for 2 seconds
    sound:         'thunder',
    animation:     'point',
    cost:          300,
    unlocked:      false,
  },
  {
    id:            'void_pull',
    name:          'Void Pull',
    description:   'A dark gravity well that pulls nearby enemies toward you.',
    type:          'area',
    element:       'dark',
    energyCost:    35,
    cooldown:      6.0,
    cooldownLeft:  0,
    damage:        20,
    aoeRadius:     8,                 // large radius
    duration:      1.5,               // lasts 1.5 seconds
    speed:         0,
    shape:         'pillar',
    colour:        ELEMENT_COLOURS.dark,
    onHit:         'pull',            // pulls enemies toward centre
    onHitDuration: 1.5,
    sound:         'dark_hum',
    animation:     'hands_down',
    cost:          400,
    unlocked:      false,
  },
  {
    id:            'healing_wave',
    name:          'Healing Wave',
    description:   'Sends out a wave that restores 40 HP to yourself.',
    type:          'buff',
    element:       'light',
    energyCost:    40,
    cooldown:      10.0,
    cooldownLeft:  0,
    damage:        0,
    healing:       40,                // restores 40 HP
    aoeRadius:     0,
    duration:      0,
    shape:         'wave',
    colour:        ELEMENT_COLOURS.light,
    onHit:         null,
    sound:         'heal',
    animation:     'meditate',
    cost:          350,
    unlocked:      false,
  },
  {
    id:            'ice_age',
    name:          'Ice Age',
    description:   'Freezes all enemies within range for 3 seconds.',
    type:          'area',
    element:       'water',
    energyCost:    50,
    cooldown:      15.0,              // long cooldown — very powerful
    cooldownLeft:  0,
    damage:        25,
    aoeRadius:     12,                // huge area
    duration:      3.0,               // freeze lasts 3 seconds
    shape:         'ring',
    colour:        ELEMENT_COLOURS.water,
    onHit:         'freeze',
    onHitDuration: 3.0,
    sound:         'freeze',
    animation:     'spread_arms',
    cost:          500,
    unlocked:      false,
  },
];


// ─────────────────────────────────────────────
// usePower
// Called every time a player activates a power slot.
// Returns an action object describing what should happen,
// or an error string if the power can't be used.
// ─────────────────────────────────────────────
export function usePower(avatar, slotIndex, targetPosition) {

  const power = avatar.powers[slotIndex];  // get power in this slot

  if (!power) return { error: 'No power in this slot' };  // slot is empty

  if (avatar.stats.energy < power.energyCost) {
    return { error: 'Not enough energy' };  // not enough energy to use it
  }

  if (power.cooldownLeft > 0) {
    return { error: `Power cooling down: ${power.cooldownLeft.toFixed(1)}s` };
  }

  // ── Deduct energy ──
  avatar.stats.energy -= power.energyCost;
  // Clamp energy to 0 minimum (shouldn't go negative)
  if (avatar.stats.energy < 0) avatar.stats.energy = 0;

  // ── Start cooldown ──
  power.cooldownLeft = power.cooldown;  // set the countdown timer

  // ── Apply healing immediately if it's a buff-type heal ──
  if (power.healing > 0) {
    avatar.stats.health = Math.min(
      avatar.stats.maxHealth,            // don't exceed max health
      avatar.stats.health + power.healing
    );
  }

  // Return an action object the game engine will execute
  return {
    success:        true,
    power:          power,
    casterPosition: { ...avatar.position },  // copy position, not reference
    targetPosition: targetPosition,
    casterAvatar:   avatar,
  };
}


// ─────────────────────────────────────────────
// tickCooldowns
// Call this every frame with deltaTime (seconds since last frame).
// Counts down all power cooldown timers.
// ─────────────────────────────────────────────
export function tickCooldowns(avatar, deltaTime) {
  for (const power of avatar.powers) {
    if (!power) continue;                      // skip empty slots
    if (power.cooldownLeft > 0) {
      power.cooldownLeft -= deltaTime;         // count down
      if (power.cooldownLeft < 0) power.cooldownLeft = 0;  // clamp to 0
    }
  }
}


// ─────────────────────────────────────────────
// tickEnergyRegen
// Energy slowly regenerates over time.
// Call every frame with deltaTime.
// ─────────────────────────────────────────────
export function tickEnergyRegen(avatar, deltaTime) {
  const REGEN_RATE = 8;  // 8 energy points per second regeneration

  if (avatar.stats.energy < avatar.stats.maxEnergy) {
    avatar.stats.energy += REGEN_RATE * deltaTime;  // add regenerated energy
    // Clamp to max — don't overflow
    if (avatar.stats.energy > avatar.stats.maxEnergy) {
      avatar.stats.energy = avatar.stats.maxEnergy;
    }
  }
}


// ─────────────────────────────────────────────
// createPowerFromPrompt
// AI-assisted power creation.
// Takes a plain English description and returns
// a balanced power object.
// ─────────────────────────────────────────────
export function createPowerFromPrompt(prompt, playerLevel) {

  const lower = prompt.toLowerCase();  // normalise to lowercase for matching

  // ── Detect element from keywords ──
  let element = 'none';
  if (/fire|flame|burn|inferno|blaze/.test(lower))       element = 'fire';
  else if (/ice|freeze|frost|cold|cryo/.test(lower))     element = 'water';
  else if (/lightning|shock|thunder|electric/.test(lower)) element = 'lightning';
  else if (/dark|shadow|void|black|death/.test(lower))   element = 'dark';
  else if (/light|holy|divine|radiant|heal/.test(lower)) element = 'light';
  else if (/wind|air|gust|storm|tornado/.test(lower))    element = 'wind';
  else if (/earth|rock|stone|ground|lava/.test(lower))   element = 'earth';

  // ── Detect power type from action words ──
  let type = 'projectile';  // default to projectile if unclear
  if (/shoot|blast|throw|fire|launch|hurl/.test(lower))  type = 'projectile';
  else if (/explode|aoe|wave|pulse|area|surround/.test(lower)) type = 'area';
  else if (/shield|protect|absorb|block|guard/.test(lower))    type = 'buff';
  else if (/dash|teleport|blink|fly|speed|rush/.test(lower))   type = 'movement';
  else if (/heal|restore|regenerate|cure/.test(lower))          type = 'buff';

  // ── Detect secondary effect ──
  let onHit = null;
  if (/burn|fire|flame/.test(lower))   onHit = 'burn';
  else if (/freeze|ice|frost/.test(lower)) onHit = 'freeze';
  else if (/stun|paralyze|shock/.test(lower)) onHit = 'stun';
  else if (/poison|toxic|venom/.test(lower))  onHit = 'poison';
  else if (/knock|push|blast back/.test(lower)) onHit = 'knockback';
  else if (/pull|drag|attract/.test(lower)) onHit = 'pull';

  // ── Extract any numbers mentioned ──
  const numbers = [...lower.matchAll(/\d+/g)].map(m => parseInt(m[0]));
  // e.g. "deals 50 damage for 3 seconds" → [50, 3]

  // ── Extract duration if mentioned ──
  let duration = 0;
  const durationMatch = lower.match(/(\d+)\s*second/);
  if (durationMatch) duration = parseInt(durationMatch[1]);

  // ── Build base stats from type ──
  const baseDamageByType = {
    projectile: 30,
    area:       40,
    buff:       0,
    movement:   10,
  };

  let damage  = baseDamageByType[type] || 25;
  let healing = 0;

  // If any large numbers were mentioned, use as damage
  for (const n of numbers) {
    if (n >= 10 && n <= 200) { damage = n; break; }
  }

  // Detect healing power
  if (/heal|restore|cure/.test(lower)) {
    healing = Math.max(20, damage);  // healing amount is at least 20
    damage  = 0;                      // healing powers don't deal damage
    type    = 'buff';
  }

  // ── Detect shape from keywords ──
  let shape = 'sphere';  // default shape
  if (/beam|ray|laser/.test(lower))   shape = 'beam';
  else if (/wave|sweep/.test(lower))  shape = 'wave';
  else if (/ring|circle/.test(lower)) shape = 'ring';
  else if (/cone|spread/.test(lower)) shape = 'cone';
  else if (/pillar|column/.test(lower)) shape = 'pillar';

  // ── Build the power object ──
  const power = {
    id:            `custom_${Date.now()}`,      // unique ID based on timestamp
    name:          generatePowerName(element, type, onHit),  // auto-generate name
    description:   prompt,                       // use the original prompt as description
    type,
    element,
    energyCost:    20 + Math.floor(damage / 4),  // energy scales with power strength
    cooldown:      1.0 + damage / 20,            // stronger powers have longer cooldowns
    cooldownLeft:  0,
    damage,
    healing,
    range:         type === 'area' ? 0 : 30,     // area powers don't need a range
    aoeRadius:     type === 'area' ? 5 : (shape === 'cone' ? 3 : 0),
    duration,
    speed:         type === 'projectile' ? 35 : 0,
    shape,
    colour:        ELEMENT_COLOURS[element] || ELEMENT_COLOURS.none,
    onHit,
    onHitDuration: duration > 0 ? duration : (onHit ? 2.0 : 0),
    knockbackForce: onHit === 'knockback' ? 10 : 0,
    sound:         `${element}_${type}`,         // sound key constructed from element + type
    animation:     type === 'projectile' ? 'throw' : type === 'buff' ? 'meditate' : 'spread_arms',
    cost:          200,                           // base cost for custom powers
    unlocked:      false,                         // must be purchased to use
    isCustom:      true,                          // flag as AI-created
  };

  // ── Balance the power for the player's level ──
  return balancePower(power, playerLevel);
}


// ─────────────────────────────────────────────
// generatePowerName
// Constructs a power name from element + type + effect.
// This generates interesting names like "Cryo Burst" or "Void Pulse".
// ─────────────────────────────────────────────
function generatePowerName(element, type, onHit) {

  // Prefix words per element
  const prefixes = {
    fire:      ['Inferno', 'Flame', 'Blazing', 'Pyro', 'Ember'],
    water:     ['Cryo', 'Frost', 'Glacial', 'Arctic', 'Hydro'],
    lightning: ['Thunder', 'Volt', 'Shock', 'Storm', 'Arc'],
    dark:      ['Void', 'Shadow', 'Oblivion', 'Dusk', 'Null'],
    light:     ['Radiant', 'Solar', 'Divine', 'Lunar', 'Holy'],
    wind:      ['Gale', 'Tempest', 'Breeze', 'Cyclone', 'Zephyr'],
    earth:     ['Stone', 'Terra', 'Granite', 'Boulder', 'Quake'],
    none:      ['Force', 'Energy', 'Pulse', 'Impact', 'Power'],
  };

  // Suffix words per type
  const suffixes = {
    projectile: ['Bolt', 'Shot', 'Blast', 'Strike', 'Missile'],
    area:       ['Burst', 'Nova', 'Wave', 'Surge', 'Explosion'],
    buff:       ['Aura', 'Ward', 'Veil', 'Shell', 'Barrier'],
    movement:   ['Rush', 'Dash', 'Lunge', 'Surge', 'Leap'],
  };

  const pArr = prefixes[element] || prefixes.none;
  const sArr = suffixes[type]    || suffixes.projectile;

  // Pick randomly from each array to create variety
  const prefix = pArr[Math.floor(Math.random() * pArr.length)];
  const suffix = sArr[Math.floor(Math.random() * sArr.length)];

  return `${prefix} ${suffix}`;  // e.g. "Cryo Burst", "Void Strike"
}


// ─────────────────────────────────────────────
// balancePower
// Clamps all power stats to level-appropriate ranges.
// Prevents creating overpowered or useless powers.
// ─────────────────────────────────────────────
export function balancePower(power, playerLevel) {

  // Maximum damage scales with level: level 1 = 35 max, level 10 = 80 max
  const maxDamage    = 20 + playerLevel * 6;
  const minDamage    = 5;
  const maxEnergy    = 60;
  const minCooldown  = 0.3;              // no power can fire faster than 0.3s
  const maxCooldown  = 20.0;
  const maxAoeRadius = 10;
  const maxHeal      = playerLevel * 10; // max heal scales with level

  // Clamp is a helper: keeps a value between min and max
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  power.damage     = clamp(power.damage,     minDamage,   maxDamage);
  power.healing    = clamp(power.healing,    0,           maxHeal);
  power.energyCost = clamp(power.energyCost, 5,           maxEnergy);
  power.cooldown   = clamp(power.cooldown,   minCooldown, maxCooldown);
  power.aoeRadius  = clamp(power.aoeRadius,  0,           maxAoeRadius);

  // High damage costs more energy and has longer cooldown (balance)
  if (power.damage > maxDamage * 0.7) {
    power.energyCost = Math.round(power.energyCost * 1.4);  // 40% more costly
    power.cooldown   = parseFloat((power.cooldown * 1.4).toFixed(1));  // 40% longer CD
  }

  // Area powers have higher cost than single-target powers
  if (power.type === 'area' && power.aoeRadius > 5) {
    power.energyCost = Math.round(power.energyCost * 1.2);
  }

  return power;
}


// ─────────────────────────────────────────────
// assignPower
// Puts a power into a specific slot on an avatar.
// Validates the slot exists and the power is unlocked.
// ─────────────────────────────────────────────
export function assignPower(avatar, power, slotIndex) {

  if (slotIndex >= avatar.powers.length) {
    return { error: 'Slot not unlocked — purchase more slots in the shop' };
  }

  if (!power.unlocked) {
    return { error: 'Power not unlocked — purchase it in the shop first' };
  }

  avatar.powers[slotIndex] = power;   // assign the power to the slot
  return { success: true };
}
