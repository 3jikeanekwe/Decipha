// ============================================================
// js/economy.js
// All in-game currency, shop logic, purchasing and saving.
// ============================================================

import { SHOP_POWERS, balancePower, createPowerFromPrompt } from './powers.js';


// ─────────────────────────────────────────────
// SHOP CATALOGUE
// Everything that can be purchased.
// Organised into categories for UI display.
// ─────────────────────────────────────────────
export const SHOP_CATALOGUE = {

  // ── Extra power slots ──
  slots: [
    { id: 'slot_4', name: '4th Power Slot', description: 'Unlock a 4th power slot (mapped to F key)', cost: 500,  type: 'slot', slotCount: 4 },
    { id: 'slot_5', name: '5th Power Slot', description: 'Unlock a 5th power slot (mapped to G key)', cost: 1000, type: 'slot', slotCount: 5, requires: 'slot_4' },
    { id: 'slot_6', name: '6th Power Slot', description: 'Unlock a 6th power slot (mapped to H key)', cost: 2000, type: 'slot', slotCount: 6, requires: 'slot_5' },
  ],

  // ── Pre-made powers ──
  powers: SHOP_POWERS,  // imported from powers.js

  // ── AI power creation ──
  services: [
    { id: 'ai_power', name: 'Create Custom Power', description: 'Use AI to generate a unique power from your description.', cost: 200, type: 'service' },
  ],

  // ── Cosmetic skins ──
  cosmetics: [
    { id: 'skin_gold',   name: 'Golden Skin',  description: 'Your character glows gold.',  cost: 150, type: 'cosmetic', colour: { r: 255, g: 200, b: 50 } },
    { id: 'skin_neon',   name: 'Neon Skin',    description: 'Bright neon outline effect.', cost: 150, type: 'cosmetic', colour: { r: 0,   g: 255, b: 200 } },
    { id: 'skin_shadow', name: 'Shadow Skin',  description: 'Dark silhouette appearance.', cost: 150, type: 'cosmetic', colour: { r: 20,  g: 20,  b: 40  } },
    { id: 'skin_fire',   name: 'Flame Skin',   description: 'Your character is on fire.',  cost: 250, type: 'cosmetic', colour: { r: 255, g: 80,  b: 0   } },
    { id: 'skin_ice',    name: 'Frost Skin',   description: 'Icy crystalline appearance.', cost: 250, type: 'cosmetic', colour: { r: 150, g: 220, b: 255 } },
  ],
};


// ─────────────────────────────────────────────
// createWallet
// Returns a fresh wallet object for a new player.
// ─────────────────────────────────────────────
export function createWallet() {
  return {
    coins:              0,   // earnable in-game through play
    gems:               0,   // premium currency (future: purchased)
    transactions:       [],  // history of purchases for record-keeping
    unlockedItemIds:    [],  // IDs of everything already purchased
  };
}


// ─────────────────────────────────────────────
// purchaseItem
// Handles a player buying something from the shop.
// Validates they have enough coins and haven't bought it already.
// Returns a result object with success/error.
// ─────────────────────────────────────────────
export function purchaseItem(player, item) {

  // ── Guard: already owned? ──
  if (player.wallet.unlockedItemIds.includes(item.id)) {
    return { error: 'Already purchased' };
  }

  // ── Guard: enough coins? ──
  if (player.wallet.coins < item.cost) {
    return {
      error:   `Not enough coins`,
      need:    item.cost,
      have:    player.wallet.coins,
      deficit: item.cost - player.wallet.coins,  // how many more coins needed
    };
  }

  // ── Guard: prerequisite items ──
  if (item.requires && !player.wallet.unlockedItemIds.includes(item.requires)) {
    return { error: `You need to purchase '${item.requires}' first` };
  }

  // ── Deduct coins ──
  player.wallet.coins -= item.cost;

  // ── Record purchase ──
  player.wallet.unlockedItemIds.push(item.id);
  player.wallet.transactions.push({
    itemId:     item.id,
    itemName:   item.name,
    cost:       item.cost,
    timestamp:  Date.now(),
  });

  // ── Apply the item effect ──
  let effect = null;

  if (item.type === 'slot') {
    // Unlock an extra power slot
    while (player.powers.length < item.slotCount) {
      player.powers.push(null);  // add an empty slot
    }
    effect = { type: 'slot_unlocked', slotCount: item.slotCount };
  }

  if (item.type === 'power') {
    // Add power to player's unlocked powers library
    if (!player.unlockedPowers) player.unlockedPowers = [];
    const powerCopy = { ...item, unlocked: true };  // mark as unlocked
    player.unlockedPowers.push(powerCopy);
    effect = { type: 'power_unlocked', power: powerCopy };
  }

  if (item.type === 'service' && item.id === 'ai_power') {
    // Return a flag telling the UI to open the AI power creation dialog
    effect = { type: 'open_ai_power_creation' };
  }

  if (item.type === 'cosmetic') {
    // Add cosmetic to inventory
    if (!player.cosmetics) player.cosmetics = [];
    player.cosmetics.push({ ...item });
    effect = { type: 'cosmetic_unlocked', cosmetic: item };
  }

  return { success: true, effect, coinsRemaining: player.wallet.coins };
}


// ─────────────────────────────────────────────
// earnCoins
// Awards coins to a player with a reason for logging.
// Shows a floating text notification.
// ─────────────────────────────────────────────
export function earnCoins(player, amount, reason) {

  player.wallet.coins += amount;  // add coins to wallet

  // Log the earning for match history/stats
  player.wallet.transactions.push({
    type:      'earn',
    amount,
    reason,
    timestamp: Date.now(),
  });

  // Notify game for floating text "+100 coins" effect
  if (player.onEarnCoins) player.onEarnCoins(amount, reason);

  return player.wallet.coins;  // return new total
}


// ─────────────────────────────────────────────
// REWARD SCHEDULE
// How many coins players earn for different actions.
// ─────────────────────────────────────────────
export const REWARDS = {
  WIN_MATCH:          100,  // win a 1v1 or team match
  LOSE_MATCH:          20,  // participate — no reward for nothing
  KILL_ENEMY:          10,  // per enemy killed
  SURVIVE_WAVE:        50,  // complete a survival wave
  FIRST_DAILY_MATCH:   25,  // bonus for first match of the day
  LEVEL_UP:           200,  // level up milestone
  COMPLETE_MISSION:    50,  // daily/weekly missions
  DEAL_1000_DAMAGE:    30,  // damage milestone per match
};


// ─────────────────────────────────────────────
// calculateMatchRewards
// At the end of a match, calculates what everyone earns.
// Returns an array of reward objects per player.
// ─────────────────────────────────────────────
export function calculateMatchRewards(matchResult) {

  const rewards = [];  // one entry per player

  for (const playerResult of matchResult.players) {

    const player = playerResult.avatar;
    let coins    = 0;
    let xp       = 0;
    const bonuses = [];  // list of bonus reasons for UI display

    // Base reward for participating
    coins += REWARDS.LOSE_MATCH;
    xp    += 30;

    // Win bonus
    if (playerResult.isWinner) {
      coins += REWARDS.WIN_MATCH;
      xp    += 100;
      bonuses.push({ label: 'Victory!',       coins: REWARDS.WIN_MATCH, xp: 100 });
    }

    // Kill bonuses
    if (playerResult.kills > 0) {
      const killCoins = playerResult.kills * REWARDS.KILL_ENEMY;
      coins += killCoins;
      xp    += playerResult.kills * 15;
      bonuses.push({ label: `${playerResult.kills} Kill(s)`, coins: killCoins, xp: playerResult.kills * 15 });
    }

    // Damage milestone
    if (playerResult.totalDamage >= 1000) {
      coins += REWARDS.DEAL_1000_DAMAGE;
      bonuses.push({ label: '1000 Damage!', coins: REWARDS.DEAL_1000_DAMAGE, xp: 20 });
    }

    // Check first daily match bonus
    const today     = new Date().toDateString();  // "Mon Jan 01 2025"
    const lastMatch = player.lastMatchDate;
    if (lastMatch !== today) {
      coins += REWARDS.FIRST_DAILY_MATCH;
      player.lastMatchDate = today;  // update the last match date
      bonuses.push({ label: 'First Match Today!', coins: REWARDS.FIRST_DAILY_MATCH, xp: 10 });
    }

    rewards.push({ player, coins, xp, bonuses });
  }

  return rewards;
}


// ─────────────────────────────────────────────
// applyMatchRewards
// Actually gives out the calculated rewards.
// Call after calculateMatchRewards.
// ─────────────────────────────────────────────
export function applyMatchRewards(rewards) {

  for (const reward of rewards) {
    earnCoins(reward.player, reward.coins, 'match_end');
    // XP is awarded through combat.js addExperience
    // (it's called when kills happen during the match)
  }
}
