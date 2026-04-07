// ============================================================
// js/ui.js
// Manages all on-screen UI:
//   - HUD (health, energy, power cooldowns)
//   - Main menu / avatar creation screens
//   - Shop interface
//   - Match result screen
//   - Floating damage numbers
// ============================================================

import { SHOP_CATALOGUE, purchaseItem, earnCoins } from './economy.js';
import { DEFAULT_POWERS, createPowerFromPrompt, assignPower } from './powers.js';
import { runFullPipeline } from './pipeline.js';
import { writeCPGFile } from './cpg.js';


// ─────────────────────────────────────────────
// initUI
// Sets up all UI event listeners and wires them
// to the game engine and player data.
// ─────────────────────────────────────────────
export function initUI(gameState) {

  // Hook the HUD update function so the engine can call it every frame
  window.updateHUD    = (gs) => updateHUD(gs);
  window.showGameMessage = (msg) => showFloatingMessage(msg);
  window.showMatchResult = (result, rewards) => showMatchResultScreen(result, rewards);

  // ── Screen navigation ──
  showScreen('main-menu');  // start on the main menu

  // Main menu buttons
  document.getElementById('btn-create-avatar')?.addEventListener('click', () => showScreen('avatar-creation'));
  document.getElementById('btn-play')?.addEventListener('click', () => showScreen('mode-select'));
  document.getElementById('btn-shop')?.addEventListener('click', () => showScreen('shop'));
  document.getElementById('btn-powers')?.addEventListener('click', () => showScreen('powers'));

  // Mode select
  document.getElementById('btn-arena')?.addEventListener('click', () => {
    showScreen('game');
    import('./engine.js').then(({ startMatch }) => startMatch(gameState, 'arena1v1'));
  });
  document.getElementById('btn-survival')?.addEventListener('click', () => {
    showScreen('game');
    import('./engine.js').then(({ startMatch }) => startMatch(gameState, 'survival'));
  });

  // Avatar creation
  document.getElementById('avatar-file-input')?.addEventListener('change', (e) => {
    onAvatarImageSelected(e, gameState);
  });
  document.getElementById('btn-confirm-avatar')?.addEventListener('click', () => {
    confirmAvatarCreation(gameState);
  });

  // Shop
  buildShopUI(gameState);

  // Power assignment
  buildPowersUI(gameState);

  // AI power creation
  document.getElementById('btn-create-ai-power')?.addEventListener('click', () => {
    showAIPowerCreationDialog(gameState);
  });

  // Back buttons — all navigate to main menu
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => showScreen('main-menu'));
  });
}


// ─────────────────────────────────────────────
// showScreen
// Hides all screens and shows only the target one.
// All screens have a class of "screen".
// ─────────────────────────────────────────────
export function showScreen(screenId) {

  // Hide every screen
  document.querySelectorAll('.screen').forEach(el => {
    el.style.display = 'none';
  });

  // Show the target screen
  const target = document.getElementById(screenId);
  if (target) target.style.display = 'flex';  // flex for centered layouts
}


// ─────────────────────────────────────────────
// updateHUD
// Called every frame to keep the HUD in sync with game state.
// Updates health bars, energy bars, cooldown indicators.
// ─────────────────────────────────────────────
function updateHUD(gameState) {

  const player = gameState.players[0];
  if (!player) return;

  // ── Health bar ──
  const healthPct = (player.stats.health / player.stats.maxHealth) * 100;
  const healthBar = document.getElementById('health-bar-fill');
  if (healthBar) {
    healthBar.style.width = `${healthPct}%`;
    // Change colour based on health level
    healthBar.style.background =
      healthPct > 60 ? '#00ff88' :  // green above 60%
      healthPct > 30 ? '#ffaa00' :  // orange 30-60%
      '#ff3333';                      // red below 30%
  }

  // Show health as a number
  const healthText = document.getElementById('health-text');
  if (healthText) healthText.textContent = `${Math.ceil(player.stats.health)} / ${player.stats.maxHealth}`;

  // ── Energy bar ──
  const energyPct = (player.stats.energy / player.stats.maxEnergy) * 100;
  const energyBar = document.getElementById('energy-bar-fill');
  if (energyBar) energyBar.style.width = `${energyPct}%`;

  const energyText = document.getElementById('energy-text');
  if (energyText) energyText.textContent = `${Math.floor(player.stats.energy)} / ${player.stats.maxEnergy}`;

  // ── Power slots ──
  player.powers.forEach((power, i) => {
    const slot = document.getElementById(`power-slot-${i}`);
    if (!slot) return;  // slot element doesn't exist in DOM

    if (!power) {
      slot.className     = 'power-slot empty';
      slot.style.opacity = '0.3';
      return;
    }

    const ready = power.cooldownLeft === 0 && player.stats.energy >= power.energyCost;

    slot.className = `power-slot ${ready ? 'ready' : 'cooling'}`;

    // Show the cooldown timer
    const cdEl = slot.querySelector('.cooldown');
    if (cdEl) {
      if (power.cooldownLeft > 0) {
        cdEl.textContent = power.cooldownLeft.toFixed(1);  // e.g. "1.4"
        cdEl.style.display = 'block';
      } else {
        cdEl.style.display = 'none';  // hide when ready
      }
    }

    // Cooldown overlay fills from top as CD expires
    const overlay = slot.querySelector('.cd-overlay');
    if (overlay) {
      const cdPct = power.cooldown > 0 ? (power.cooldownLeft / power.cooldown) * 100 : 0;
      overlay.style.height = `${cdPct}%`;  // overlay covers the icon proportionally
    }
  });

  // ── Coins display ──
  const coinsEl = document.getElementById('hud-coins');
  if (coinsEl && player.wallet) coinsEl.textContent = `⬡ ${player.wallet.coins}`;

  // ── Match timer ──
  const timerEl = document.getElementById('match-timer');
  if (timerEl && gameState.matchActive) {
    const mins = Math.floor(gameState.matchTimer / 60);
    const secs = Math.floor(gameState.matchTimer % 60);
    timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;  // "2:05"
  }

  // ── Level indicator ──
  const levelEl = document.getElementById('player-level');
  if (levelEl) levelEl.textContent = `Lv.${player.stats.level}`;
}


// ─────────────────────────────────────────────
// onAvatarImageSelected
// Called when the user picks an image file for avatar creation.
// Shows a preview and triggers the pipeline.
// ─────────────────────────────────────────────
function onAvatarImageSelected(event, gameState) {

  const file = event.target.files[0];  // get the selected file
  if (!file) return;

  const img = new Image();
  img.onload = () => {

    // Show preview in the creation screen
    const preview = document.getElementById('avatar-preview-img');
    if (preview) {
      preview.src     = img.src;
      preview.style.display = 'block';
    }

    // Show a loading indicator while pipeline runs
    const status = document.getElementById('avatar-status');
    if (status) status.textContent = '⚙ Analysing image…';

    // Run the pipeline on the next frame so the UI can update first
    setTimeout(() => {

      // Run the full image-to-avatar pipeline
      const avatarData = runFullPipeline(img, {
        edgeThreshold: 30,
        bgThreshold:   30,
        zScale:        50,
        avatarId:      `avatar_${Date.now()}`,
        avatarName:    document.getElementById('avatar-name-input')?.value || 'Player',
      });

      // Save to game state for confirmation
      gameState._pendingAvatar = avatarData;

      // Generate the CPG file text
      gameState._pendingCPG = writeCPGFile(avatarData);

      if (status) {
        status.textContent =
          `✓ Avatar ready — ${avatarData.mesh.points.length} vertices, ` +
          `${avatarData.mesh.triangles.length} triangles`;
      }

      // Enable the confirm button
      const confirmBtn = document.getElementById('btn-confirm-avatar');
      if (confirmBtn) confirmBtn.disabled = false;

    }, 50);  // brief delay so "Analysing…" message appears first
  };

  img.src = URL.createObjectURL(file);  // load the file into the image element
}


// ─────────────────────────────────────────────
// confirmAvatarCreation
// Called when the user clicks "Create Avatar".
// Assigns default powers and saves the avatar.
// ─────────────────────────────────────────────
function confirmAvatarCreation(gameState) {

  const avatarData = gameState._pendingAvatar;
  if (!avatarData) return;

  // ── Assign the 3 default starter powers ──
  avatarData.powers = new Array(3).fill(null);  // 3 empty slots
  DEFAULT_POWERS.forEach((power, i) => {
    avatarData.powers[i] = { ...power };  // copy power (not reference) into slot
  });

  // ── Create wallet ──
  avatarData.wallet = { coins: 0, gems: 0, transactions: [], unlockedItemIds: [] };

  // ── Save avatar data ──
  saveAvatarToStorage(avatarData);

  // ── Add player to game state ──
  gameState.localPlayer = avatarData;
  gameState.players     = [avatarData];

  // ── Navigate to main menu ──
  showScreen('main-menu');

  // Show coins earned for first avatar creation
  setTimeout(() => showFloatingMessage('✓ Avatar created! +0 coins to start. Win matches to earn coins!'), 300);
}


// ─────────────────────────────────────────────
// buildShopUI
// Populates the shop screen with all purchasable items.
// ─────────────────────────────────────────────
function buildShopUI(gameState) {

  const container = document.getElementById('shop-items');
  if (!container) return;

  container.innerHTML = '';  // clear any existing items

  // Helper: create a shop item card
  const makeCard = (item) => {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-item-name">${item.name}</div>
      <div class="shop-item-desc">${item.description}</div>
      <div class="shop-item-cost">⬡ ${item.cost} coins</div>
      <button class="shop-buy-btn" data-id="${item.id}">PURCHASE</button>
    `;

    // Buy button handler
    card.querySelector('.shop-buy-btn').addEventListener('click', () => {
      const player = gameState.localPlayer;
      if (!player) { showFloatingMessage('Create an avatar first!'); return; }

      const result = purchaseItem(player, item);  // attempt purchase

      if (result.success) {
        showFloatingMessage(`✓ ${item.name} purchased!`);
        saveAvatarToStorage(player);  // persist the purchase
        buildShopUI(gameState);       // rebuild to update "already owned" states

        if (result.effect?.type === 'open_ai_power_creation') {
          showAIPowerCreationDialog(gameState);
        }
      } else {
        showFloatingMessage(`✗ ${result.error}`);
      }
    });

    // Grey out if already owned
    const player = gameState.localPlayer;
    if (player?.wallet.unlockedItemIds.includes(item.id)) {
      card.querySelector('.shop-buy-btn').textContent = 'OWNED';
      card.querySelector('.shop-buy-btn').disabled    = true;
      card.style.opacity = '0.5';
    }

    return card;
  };

  // ── Render each category ──

  const makeSection = (title) => {
    const h = document.createElement('div');
    h.className   = 'shop-section-title';
    h.textContent = title;
    container.appendChild(h);
  };

  makeSection('⬡ POWER SLOTS');
  SHOP_CATALOGUE.slots.forEach(item => container.appendChild(makeCard(item)));

  makeSection('⚡ POWERS');
  SHOP_CATALOGUE.powers.forEach(item => container.appendChild(makeCard(item)));

  makeSection('✨ AI CREATION');
  SHOP_CATALOGUE.services.forEach(item => container.appendChild(makeCard(item)));

  makeSection('🎨 COSMETICS');
  SHOP_CATALOGUE.cosmetics.forEach(item => container.appendChild(makeCard(item)));
}


// ─────────────────────────────────────────────
// buildPowersUI
// Shows the player's power slots and lets them
// drag/click powers into slots.
// ─────────────────────────────────────────────
function buildPowersUI(gameState) {

  const container = document.getElementById('powers-loadout');
  if (!container) return;

  const player = gameState.localPlayer;
  if (!player) { container.innerHTML = '<p>Create an avatar first.</p>'; return; }

  container.innerHTML = '';

  // ── Slot display ──
  const slotsEl = document.createElement('div');
  slotsEl.className = 'power-slots-row';

  player.powers.forEach((power, i) => {
    const slot = document.createElement('div');
    slot.className   = 'power-slot-loadout';
    slot.textContent = power ? power.name : `EMPTY (${['Q','E','R','F','G','H'][i]})`;
    slot.dataset.slot = i;
    slotsEl.appendChild(slot);
  });

  container.appendChild(slotsEl);

  // ── Unlocked powers list ──
  const listTitle = document.createElement('div');
  listTitle.className   = 'section-title';
  listTitle.textContent = 'YOUR POWERS — click to assign to a slot';
  container.appendChild(listTitle);

  const allPowers = [
    ...DEFAULT_POWERS,
    ...(player.unlockedPowers ?? []),
  ].filter(p => p.unlocked);  // only show unlocked powers

  allPowers.forEach(power => {
    const row = document.createElement('div');
    row.className = 'power-row';
    row.innerHTML = `
      <span class="power-name">${power.name}</span>
      <span class="power-type">[${power.type}]</span>
      <span class="power-dmg">DMG: ${power.damage}</span>
      <span class="power-cost">⚡ ${power.energyCost}</span>
      <span class="power-cd">CD: ${power.cooldown}s</span>
    `;

    row.addEventListener('click', () => {
      // Prompt which slot to assign to
      const slotStr = prompt(`Assign "${power.name}" to which slot? (1-${player.powers.length})`);
      const slotNum = parseInt(slotStr) - 1;  // convert 1-based to 0-based
      if (isNaN(slotNum)) return;

      const result = assignPower(player, power, slotNum);
      if (result.success) {
        showFloatingMessage(`✓ ${power.name} assigned to slot ${slotNum + 1}`);
        saveAvatarToStorage(player);
        buildPowersUI(gameState);  // rebuild to show updated loadout
      } else {
        showFloatingMessage(`✗ ${result.error}`);
      }
    });

    container.appendChild(row);
  });
}


// ─────────────────────────────────────────────
// showAIPowerCreationDialog
// Opens a dialog where the player types a description
// and the AI generates a power from it.
// ─────────────────────────────────────────────
function showAIPowerCreationDialog(gameState) {

  const dialog = document.getElementById('ai-power-dialog');
  if (!dialog) return;

  dialog.style.display = 'flex';

  const input  = dialog.querySelector('#ai-power-input');
  const btn    = dialog.querySelector('#btn-generate-power');
  const result = dialog.querySelector('#ai-power-result');
  const close  = dialog.querySelector('#btn-close-dialog');

  if (close) close.addEventListener('click', () => { dialog.style.display = 'none'; });

  if (btn) btn.addEventListener('click', () => {
    const prompt = input?.value?.trim();
    if (!prompt) { showFloatingMessage('Describe your power first!'); return; }

    const player = gameState.localPlayer;
    if (!player) return;

    result.textContent = '⚙ Creating power…';

    // Generate the power from the text prompt
    const newPower = createPowerFromPrompt(prompt, player.stats.level);
    newPower.unlocked = true;  // custom powers are immediately available

    result.innerHTML = `
      <div class="power-preview">
        <div><b>${newPower.name}</b></div>
        <div>${newPower.description}</div>
        <div>Type: ${newPower.type} | Element: ${newPower.element}</div>
        <div>Damage: ${newPower.damage} | Energy: ${newPower.energyCost} | CD: ${newPower.cooldown}s</div>
        ${newPower.onHit ? `<div>Effect: ${newPower.onHit} for ${newPower.onHitDuration}s</div>` : ''}
      </div>
      <button id="btn-keep-power">KEEP THIS POWER</button>
    `;

    document.getElementById('btn-keep-power')?.addEventListener('click', () => {
      if (!player.unlockedPowers) player.unlockedPowers = [];
      player.unlockedPowers.push(newPower);
      saveAvatarToStorage(player);
      dialog.style.display = 'none';
      showFloatingMessage(`✓ "${newPower.name}" added to your powers!`);
      buildPowersUI(gameState);
    });
  });
}


// ─────────────────────────────────────────────
// showMatchResultScreen
// Displays the end-of-match results and rewards.
// ─────────────────────────────────────────────
function showMatchResultScreen(matchResult, rewards) {

  const screen = document.getElementById('match-result-screen');
  if (!screen) return;

  screen.style.display = 'flex';

  const winnerEl = document.getElementById('match-winner-text');
  if (winnerEl) {
    winnerEl.textContent = matchResult.winner === 'player' ? '🏆 VICTORY!' : '💀 DEFEATED';
    winnerEl.style.color = matchResult.winner === 'player' ? '#00ff88' : '#ff3333';
  }

  const rewardsEl = document.getElementById('match-rewards-list');
  if (rewardsEl && rewards[0]) {
    const r = rewards[0];  // local player is index 0
    rewardsEl.innerHTML = r.bonuses.map(b =>
      `<div class="reward-row"><span>${b.label}</span><span>+${b.coins} coins / +${b.xp} XP</span></div>`
    ).join('');
  }

  // Continue button — back to main menu
  document.getElementById('btn-continue-after-match')?.addEventListener('click', () => {
    screen.style.display = 'none';
    showScreen('main-menu');
  });
}


// ─────────────────────────────────────────────
// showFloatingMessage
// Shows a brief notification message at the top of the screen.
// Fades out automatically after 2.5 seconds.
// ─────────────────────────────────────────────
export function showFloatingMessage(text) {

  const container = document.getElementById('floating-messages');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className   = 'floating-msg';
  msg.textContent = text;

  container.appendChild(msg);

  // Animate in
  requestAnimationFrame(() => msg.classList.add('visible'));

  // Remove after 2.5 seconds
  setTimeout(() => {
    msg.classList.remove('visible');
    setTimeout(() => msg.remove(), 400);  // wait for fade animation
  }, 2500);
}


// ─────────────────────────────────────────────
// saveAvatarToStorage
// Persists avatar data to localStorage.
// Called after any change (purchase, level up, etc.)
// ─────────────────────────────────────────────
export function saveAvatarToStorage(avatarData) {
  // We don't save the full mesh (too big) — just game data
  const saveData = {
    id:            avatarData.id,
    name:          avatarData.name,
    stats:         avatarData.stats,
    powers:        avatarData.powers,
    unlockedPowers: avatarData.unlockedPowers || [],
    wallet:        avatarData.wallet,
    cosmetics:     avatarData.cosmetics || [],
    lastMatchDate: avatarData.lastMatchDate || null,
  };
  localStorage.setItem(`cpg_avatar_${avatarData.id}`, JSON.stringify(saveData));
  localStorage.setItem('cpg_last_avatar_id', avatarData.id);  // remember which avatar to load
}


// ─────────────────────────────────────────────
// loadAvatarFromStorage
// Restores saved avatar data from localStorage.
// Returns null if no save found.
// ─────────────────────────────────────────────
export function loadAvatarFromStorage() {
  const lastId = localStorage.getItem('cpg_last_avatar_id');
  if (!lastId) return null;  // no save found

  const raw = localStorage.getItem(`cpg_avatar_${lastId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);  // parse the JSON string back to an object
  } catch (err) {
    console.error('Failed to load avatar save:', err);
    return null;
  }
}
