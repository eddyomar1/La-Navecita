/* ETOTU — a dependency-free orbital arcade. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('can');
  const ctx = canvas.getContext('2d');
  if (!ctx) { $('overlay-description').textContent = 'Este navegador no permite iniciar el juego. Prueba con un navegador compatible con canvas.'; $('play').disabled = true; return; }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storage = {
    get(key, fallback) { try { return localStorage.getItem(`etotu:${key}`) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(`etotu:${key}`, String(value)); } catch { /* Private browsing may disable storage. */ } }
  };
  const ships = {
    vanguard: { image: 'navec.png', speed: 350, interval: .19, damage: 2, width: 49, height: 49 },
    spectre: { image: 'navep.png', speed: 440, interval: .145, damage: 1, width: 59, height: 38 }
  };
  const items = {
    repair: { name: 'Nanobots', symbol: '+', color: '#d4f885', vanguard: ['Reparación pesada', 'Recupera 2 escudos y protege durante 2 s.', 'INSTANTÁNEO + 2 S'], spectre: ['Reparación evasiva', 'Recupera 1 escudo y activa fase durante 4 s.', 'INSTANTÁNEO + 4 S'] },
    arsenal: { name: 'Arsenal', symbol: 'W', color: '#ffbf78', vanguard: ['Cañón gemelo', 'Dos proyectiles paralelos con 3 de daño cada uno.', '10 SEGUNDOS'], spectre: ['Dispersión', 'Tres proyectiles en abanico con 1 de daño cada uno.', '10 SEGUNDOS'] },
    drive: { name: 'Propulsor', symbol: '»', color: '#80ddff', vanguard: ['Sobrecarga', 'Dispara un 82 % más rápido.', '8 SEGUNDOS'], spectre: ['Campo temporal', 'Vuela un 55 % más rápido y ralentiza enemigos y sus disparos un 45 %.', '8 SEGUNDOS'] },
    aegis: { name: 'Barrera', symbol: 'O', color: '#b8a0ff', vanguard: ['Blindaje', 'Absorbe 3 impactos antes de gastar escudo.', '10 SEGUNDOS / 3 IMPACTOS'], spectre: ['Fase', 'Atraviesa enemigos y proyectiles sin recibir daño.', '5 SEGUNDOS'] },
    core: { name: 'Núcleo', symbol: '*', color: '#ff95cd', vanguard: ['Pulso de asalto', 'Borra proyectiles hostiles e inflige 12 de daño a cada enemigo y 35 al jefe.', 'INSTANTÁNEO'], spectre: ['Dron orbital', 'Un dron te acompaña y dispara proyectiles guiados de 3 de daño.', '12 SEGUNDOS'] }
  };
  const itemTypes = Object.keys(items);
  // This relic is deliberately outside the ordinary supply/drop pool.
  const lightningItem = { name: 'Rayo sísmico', symbol: 'ϟ', color: '#72f3fa' };
  const SPECIAL = { chargeTime: 3, cooldown: 60, uses: 5, duration: 1.6, halfWidth: 90, damage: 80, bossDamage: 500 };
  const freshSpecial = () => ({ unlocked: false, uses: 0, cooldown: 0, charge: 0, needsRelease: false, beam: null, quake: 0 });
  let special = freshSpecial(), specialDropGranted = false, specialMarkup = '';
  const specialHolds = new Set();
  let effects = {}, barrierCharges = 0, droneCooldown = 0, supplyTimer = 8, supplyIndex = 0;
  let boss = null, pulseRing = null, abilityMarkup = '';
  const sprites = {};
  for (const file of ['navec.png', 'navep.png', 'alienave.png', 'alien.png', 'rayo.png']) {
    const img = new Image(); img.src = file; sprites[file] = img;
  }
  let selected = storage.get('ship', 'vanguard');
  if (!ships[selected]) selected = 'vanguard';
  let best = Math.max(0, Number(storage.get('best', '0')) || 0);
  let sound = storage.get('sound', 'off') === 'on';
  let audioContext;
  let state = 'ready', width = 1000, height = 620, lastTime = 0, elapsed = 0;
  let score = 0, wave = 1, lives = 3, enemies = [], bullets = [], enemyBullets = [], particles = [], pickups = [];
  let player = { x: 500, y: 510, cooldown: 0, invulnerable: 0 };
  let spawnTimer = 0, spawnRemaining = 0, waveDelay = 0, announceTime = 0, shake = 0;
  let pointer = null;
  const keys = new Set();
  const stars = Array.from({ length: 145 }, () => ({ x: Math.random(), y: Math.random(), size: .4 + Math.random() * 1.3, alpha: .12 + Math.random() * .65, speed: .006 + Math.random() * .02 }));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const intersects = (a, b, radius) => Math.hypot(a.x - b.x, a.y - b.y) < radius;
  const formatScore = value => String(value).padStart(6, '0');

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const oldWidth = width, oldHeight = height;
    width = bounds.width < 480 ? 600 : Math.max(1000, 360 * bounds.width / Math.max(1, bounds.height));
    height = width * bounds.height / Math.max(bounds.width, 1);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    for (const objects of [[player], boss ? [boss] : [], special.beam ? [special.beam] : [], enemies, bullets, enemyBullets, particles, pickups]) {
      for (const object of objects) { object.x *= width / oldWidth; object.y *= height / oldHeight; if (object.baseX !== undefined) object.baseX *= width / oldWidth; }
    }
  }
  new ResizeObserver(resize).observe(canvas);

  function updateHud() {
    $('score').textContent = formatScore(score);
    $('best').textContent = formatScore(Math.max(score, best));
    $('wave').innerHTML = `${String(wave).padStart(2, '0')}<span> / ∞</span>`;
    $('shield').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i >= lives ? 'lost' : ''}"></i>`).join('');
    $('shield').setAttribute('aria-label', `${lives} de 3 escudos`);
  }
  function selectShip(name) {
    if (state !== 'ready' && state !== 'ended') return;
    selected = name;
    storage.set('ship', name);
    document.querySelectorAll('[data-ship]').forEach(button => {
      const active = button.dataset.ship === name;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateItemGuide();
  }
  document.querySelectorAll('[data-ship]').forEach(button => button.addEventListener('click', () => selectShip(button.dataset.ship)));
  selectShip(selected);

  function updateItemGuide() {
    $('item-guide-title').textContent = `Equipamiento de ${selected === 'vanguard' ? 'Vanguard' : 'Spectre'}`;
    $('item-cards').innerHTML = itemTypes.map(type => {
      const item = items[type], detail = item[selected];
      return `<article class="item-card" style="--item-color:${item.color}"><span class="item-symbol" aria-hidden="true">${item.symbol}</span><h3>${item.name} · ${detail[0]}</h3><p>${detail[1]}</p><small>${detail[2]}</small></article>`;
    }).join('');
  }
  function updateAbilities() {
    const labels = { repair: 'Protección', arsenal: items.arsenal[selected][0], drive: items.drive[selected][0], aegis: items.aegis[selected][0], core: items.core[selected][0], phase: 'Fase' };
    const markup = Object.entries(effects).filter(([, time]) => time > 0).map(([type, time]) => `<span class="ability-chip" style="--item-color:${(items[type] || items.aegis).color}">${labels[type]}<b>${Math.ceil(time)} s${type === 'aegis' && selected === 'vanguard' ? ` · ${barrierCharges} cargas` : ''}</b></span>`).join('') || '<span class="ability-empty">Recoge objetos para activar las habilidades de tu nave.</span>';
    if (markup !== abilityMarkup) { $('active-abilities').innerHTML = markup; abilityMarkup = markup; }
  }
  function dropItem(x, y, type = itemTypes[Math.floor(Math.random() * itemTypes.length)]) { pickups.push({ x, y, age: 0, type }); }
  function collectItem(type) {
    if (type === 'lightning') {
      if (specialDropGranted && !special.unlocked) {
        special.unlocked = true; special.uses = SPECIAL.uses;
        announce('RAYO SÍSMICO · 5 USOS · MANTÉN R 3 S');
        burst(player.x, player.y, lightningItem.color, 26); tone(1100, .3); updateSpecialHud();
      }
      return;
    }
    const vanguard = selected === 'vanguard';
    if (type === 'repair') {
      if (lives === 3) score += 50;
      lives = Math.min(3, lives + (vanguard ? 2 : 1));
      if (vanguard) effects.repair = 2; else effects.phase = Math.max(effects.phase || 0, 4);
    } else if (type === 'arsenal') effects.arsenal = 10;
    else if (type === 'drive') effects.drive = 8;
    else if (type === 'aegis') { if (vanguard) { effects.aegis = 10; barrierCharges = 3; } else effects.phase = 5; }
    else if (type === 'core') {
      if (vanguard) {
        enemyBullets = []; pulseRing = { x: player.x, y: player.y, life: .65 };
        for (const enemy of enemies) { if (enemy.hp > 0) { enemy.hp -= 12; if (enemy.hp <= 0) destroyEnemy(enemy); } }
        damageBoss(35);
      } else { effects.core = 12; droneCooldown = 0; }
    }
    announce(`${items[type].name.toUpperCase()} · ${items[type][selected][0]}`);
    burst(player.x, player.y, items[type].color, 14); tone(850, .16); updateHud(); updateAbilities();
  }

  function cancelSpecialCharge() {
    specialHolds.clear(); special.charge = 0; special.needsRelease = false;
    updateSpecialHud();
  }
  function holdSpecial(source) {
    if (state !== 'playing' || !special.unlocked || special.uses <= 0 || special.cooldown > 0 || special.needsRelease) return;
    specialHolds.add(source);
  }
  function releaseSpecial(source) {
    specialHolds.delete(source);
    if (specialHolds.size === 0) { special.charge = 0; special.needsRelease = false; }
    updateSpecialHud();
  }
  function updateSpecialHud() {
    let status = specialDropGranted ? 'Recoge la reliquia ϟ que dejó el jefe.' : 'Consigue la reliquia del jefe de la oleada 10.';
    let label = 'Mantén 3 s';
    if (special.unlocked) {
      if (!special.uses) { status = 'Has usado las cinco descargas de esta partida.'; label = 'Agotado'; }
      else if (special.cooldown > 0) {
        const seconds = Math.ceil(special.cooldown);
        label = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        status = 'Recargando el núcleo del rayo.';
      } else if (special.charge > 0) { status = 'Cargando… soltar cancela la descarga.'; label = `${special.charge.toFixed(1)} / 3 s`; }
      else status = 'Listo. Mantén R o el botón durante 3 s.';
      if (state === 'paused') status = 'En pausa. La carga se cancela; la espera se detiene.';
      if (state === 'ended') status = 'Misión terminada. Consigue la reliquia en tu próxima partida.';
    }
    const uses = special.unlocked ? `${special.uses} / ${SPECIAL.uses} USOS` : 'BLOQUEADO';
    const markup = `${status}|${label}|${uses}|${state}`;
    if (markup !== specialMarkup) {
      $('special-status').textContent = status; $('special-uses').textContent = uses; $('special-button-text').textContent = label;
      $('special-attack').disabled = state !== 'playing' || !special.unlocked || !special.uses || special.cooldown > 0;
      specialMarkup = markup;
    }
    $('special-progress').style.width = `${special.charge / SPECIAL.chargeTime * 100}%`;
    $('special-control').classList.toggle('charging', special.charge > 0);
  }
  function fireSpecial() {
    if (state !== 'playing' || !special.unlocked || special.uses <= 0 || special.cooldown > 0 || special.charge < SPECIAL.chargeTime || special.needsRelease) return;
    special.uses--; special.cooldown = SPECIAL.cooldown; special.charge = 0; special.needsRelease = true;
    special.beam = { x: player.x, y: player.y - 20, life: SPECIAL.duration, hitTargets: new Set() };
    special.quake = reducedMotion ? 0 : SPECIAL.duration;
    player.invulnerable = Math.max(player.invulnerable, SPECIAL.duration);
    tone(65, .7, 'sawtooth', .12); tone(180, .45, 'triangle', .06);
    burst(player.x, player.y - 22, lightningItem.color, 42);
    announce(`RAYO SÍSMICO · ${special.uses} USOS RESTANTES`);
    applySpecialDamage(); updateSpecialHud();
  }
  function applySpecialDamage() {
    const beam = special.beam;
    if (!beam) return;
    const inBeam = (target, radius = 0) => Math.abs(target.x - beam.x) <= SPECIAL.halfWidth + radius && target.y >= -radius && target.y <= beam.y + radius;
    for (const enemy of enemies) {
      if (enemy.hp > 0 && inBeam(enemy, enemy.radius) && !beam.hitTargets.has(enemy)) {
        beam.hitTargets.add(enemy); enemy.hp -= SPECIAL.damage;
        if (enemy.hp <= 0) destroyEnemy(enemy);
      }
    }
    if (boss && boss.y >= 0 && inBeam(boss, boss.rx) && !beam.hitTargets.has(boss)) { beam.hitTargets.add(boss); damageBoss(SPECIAL.bossDamage); }
    enemyBullets = enemyBullets.filter(bullet => !inBeam(bullet, 5));
  }
  function updateSpecial(dt) {
    if (state !== 'playing') return;
    special.cooldown = Math.max(0, special.cooldown - dt);
    special.quake = Math.max(0, special.quake - dt);
    if (special.beam) {
      special.beam.life -= dt;
      if (special.beam.life <= 0) special.beam = null;
      else applySpecialDamage();
    }
    if (specialHolds.size > 0 && !special.needsRelease && special.unlocked && special.uses > 0 && special.cooldown === 0) {
      special.charge = Math.min(SPECIAL.chargeTime, special.charge + dt);
      if (special.charge >= SPECIAL.chargeTime) fireSpecial();
    }
    updateSpecialHud();
  }
  const specialButton = $('special-attack');
  specialButton.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); holdSpecial(`pointer:${event.pointerId}`); specialButton.setPointerCapture(event.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) specialButton.addEventListener(type, event => releaseSpecial(`pointer:${event.pointerId}`));
  specialButton.addEventListener('contextmenu', event => event.preventDefault());

  const gamePanel = $('game-panel');
  let fullscreenBusy = false;
  const isFullscreen = () => document.fullscreenElement === gamePanel || gamePanel.classList.contains('expanded');
  function syncFullscreen() {
    const active = isFullscreen();
    $('fullscreen').setAttribute('aria-pressed', String(active));
    $('fullscreen').setAttribute('aria-label', active ? 'Salir de pantalla completa' : 'Entrar en pantalla completa');
    $('fullscreen').title = `${active ? 'Salir de pantalla completa' : 'Pantalla completa'} (F)`;
    document.body.classList.toggle('game-expanded', active);
    keys.clear(); pointer = null; cancelSpecialCharge();
    requestAnimationFrame(resize);
  }
  async function toggleFullscreen() {
    if (fullscreenBusy) return;
    fullscreenBusy = true;
    try {
      if (document.fullscreenElement === gamePanel) await document.exitFullscreen();
      else if (gamePanel.classList.contains('expanded')) gamePanel.classList.remove('expanded');
      else if (gamePanel.requestFullscreen && document.fullscreenEnabled) {
        try { await gamePanel.requestFullscreen(); } catch { gamePanel.classList.add('expanded'); }
      } else gamePanel.classList.add('expanded');
    } finally { fullscreenBusy = false; syncFullscreen(); }
  }
  $('fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreen);

  function updateAudio() {
    $('sound').setAttribute('aria-pressed', String(sound));
    $('sound').setAttribute('aria-label', sound ? 'Silenciar sonido' : 'Activar sonido');
    $('sound').title = sound ? 'Silenciar sonido' : 'Activar sonido';
    $('sound-waves').setAttribute('d', sound ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 6 6m0-6-6 6');
    $('au').volume = .16;
    if (sound && state === 'playing') $('au').play().catch(() => {});
    else $('au').pause();
  }
  function unlockAudio() {
    if (!sound) return;
    try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume().catch(() => {}); } catch { /* Music can work without synthesized effects. */ }
  }
  function tone(frequency, duration = .07, type = 'sine', volume = .035) {
    if (!sound || !audioContext || audioContext.state !== 'running') return;
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * .4), audioContext.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
  }
  $('sound').addEventListener('click', () => { sound = !sound; storage.set('sound', sound ? 'on' : 'off'); unlockAudio(); updateAudio(); });
  updateAudio();

  function announce(message) { $('announcement').textContent = message; $('announcement').classList.add('visible'); announceTime = 2.2; }
  function setState(next) {
    state = next;
    keys.clear(); pointer = null; cancelSpecialCharge();
    $('arena').className = `arena ${next}${boss ? ' boss-encounter' : ''}`;
    $('overlay').hidden = next === 'playing';
    $('pause').hidden = next !== 'playing';
    $('pause-text').disabled = next !== 'playing' && next !== 'paused';
    $('pause-text').innerHTML = `<kbd>P</kbd> ${next === 'paused' ? 'Continuar' : 'Pausar'}`;
    document.querySelectorAll('[data-ship]').forEach(button => { button.disabled = next === 'playing' || next === 'paused'; });
    $('hangar-note').innerHTML = next === 'playing' || next === 'paused' ? 'Misión en curso.<br><strong>Podrás cambiar de nave al terminar.</strong>' : 'El piloto hace la diferencia.<br><strong>Tu próximo récord está ahí fuera.</strong>';
    updateAudio();
  }
  function start() {
    if (state === 'paused') { setState('playing'); canvas.focus({ preventScroll: true }); return; }
    if (state === 'playing') return;
    score = 0; wave = 1; lives = 3;
    special = freshSpecial(); specialDropGranted = false; cancelSpecialCharge();
    boss = null; effects = {}; barrierCharges = 0; droneCooldown = 0; supplyTimer = 8; supplyIndex = 0; pulseRing = null; updateAbilities();
    enemies = []; bullets = []; enemyBullets = []; particles = []; pickups = [];
    player = { x: width / 2, y: height - 90, cooldown: .15, invulnerable: 1.8 };
    shake = 0; waveDelay = 0;
    unlockAudio(); setState('playing'); updateHud(); beginWave();
    canvas.focus({ preventScroll: true });
  }
  function beginWave() {
    spawnTimer = .7; waveDelay = 0;
    if (wave === 10 || wave === 100) {
      const elite = wave === 100, maxHp = elite ? 1400 : 180;
      boss = { x: width / 2, y: -110, hp: maxHp, maxHp, elite, age: 0, shot: 2, volley: 0, enraged: false, rx: elite ? 42 : 34, ry: elite ? 66 : 54 };
      spawnRemaining = 0; supplyTimer = Math.min(supplyTimer, 3);
      announce(elite ? 'OLEADA 100 · EL MARCIANITO SUPREMO' : 'OLEADA 10 · EL MARCIANITO');
    } else { boss = null; spawnRemaining = Math.min(36, 6 + wave * 2); announce(`OLEADA ${String(wave).padStart(2, '0')} · EN POSICIÓN`); }
    $('arena').classList.toggle('boss-encounter', Boolean(boss));
    updateHud();
  }
  function togglePause() {
    if (state === 'playing') {
      setState('paused');
      $('overlay-label').textContent = 'RESPIRA. EL UNIVERSO PUEDE ESPERAR.';
      $('overlay-title').innerHTML = 'Misión en<br>pausa<span>.</span>';
      $('overlay-description').textContent = 'Tu nave está a salvo. Continúa cuando estés listo.';
      $('play-label').textContent = 'Continuar misión';
      $('launch-hint').textContent = 'PULSA P O ENTER PARA CONTINUAR';
      $('play').focus({ preventScroll: true });
    } else if (state === 'paused') start();
  }
  function finish() {
    const record = score > best;
    if (record) { best = score; storage.set('best', best); }
    effects = {}; barrierCharges = 0; updateAbilities();
    special.beam = null; special.quake = 0;
    setState('ended'); updateHud();
    $('announcement').classList.remove('visible');
    $('overlay-label').textContent = record ? 'UN NUEVO RÉCORD. TU NOMBRE ENTRE LAS ESTRELLAS.' : 'FIN DE LA TRANSMISIÓN';
    $('overlay-title').innerHTML = record ? 'Hiciste<br>historia<span>.</span>' : 'Vuelve a<br>las estrellas<span>.</span>';
    $('overlay-description').textContent = `${score.toLocaleString('es')} puntos · Oleada ${wave}. Cada viaje te lleva un poco más lejos.`;
    $('play-label').textContent = 'Volver a despegar';
    $('launch-hint').textContent = 'PULSA ENTER PARA REINTENTAR';
    $('play').focus({ preventScroll: true });
  }
  $('play').addEventListener('click', start);
  $('pause').addEventListener('click', togglePause);
  $('pause-text').addEventListener('click', togglePause);
  $('help').addEventListener('click', () => { if (state === 'playing') togglePause(); $('help-dialog').showModal(); });
  for (const id of ['close-help', 'got-it']) $(id).addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
  window.addEventListener('keydown', event => {
    if ($('help-dialog').open || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'r' || (event.target === specialButton && (key === ' ' || key === 'enter'))) {
      event.preventDefault(); if (!event.repeat) holdSpecial(`key:${key}`); return;
    }
    if (!event.repeat && key === 'f') { event.preventDefault(); toggleFullscreen(); return; }
    if (key === 'escape' && isFullscreen()) { event.preventDefault(); if (state === 'playing') togglePause(); toggleFullscreen(); return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key) && state === 'playing') { event.preventDefault(); keys.add(key); }
    if (!event.repeat && (key === 'p' || key === 'escape') && (state === 'playing' || state === 'paused')) { event.preventDefault(); togglePause(); }
    if (!event.repeat && key === 'enter' && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A') { event.preventDefault(); start(); }
  });
  window.addEventListener('keyup', event => { const key = event.key.toLowerCase(); keys.delete(key); releaseSpecial(`key:${key}`); });
  window.addEventListener('blur', () => { if (state === 'playing') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(); });
  window.addEventListener('pagehide', () => { if (score > best) storage.set('best', score); });
  function pointerPosition(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * height - (event.pointerType === 'touch' ? 45 : 0) }; }
  canvas.addEventListener('pointerdown', event => { if (state !== 'playing') return; event.preventDefault(); pointer = { ...pointerPosition(event), id: event.pointerId }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => { if (pointer && pointer.id === event.pointerId) pointer = { ...pointerPosition(event), id: event.pointerId }; });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (pointer?.id === event.pointerId) pointer = null; });

  function burst(x, y, color, amount = 16) {
    for (let i = 0; i < (reducedMotion ? 4 : amount); i++) {
      const angle = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 180;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .4, maxLife: .75, color, size: 1 + Math.random() * 3 });
    }
  }
  function hit() {
    if (player.invulnerable > 0 || effects.phase > 0 || effects.repair > 0 || state !== 'playing') return;
    if (effects.aegis > 0 && barrierCharges > 0) {
      barrierCharges--; player.invulnerable = .65;
      if (!barrierCharges) effects.aegis = 0;
      burst(player.x, player.y, items.aegis.color, 10); updateAbilities(); return;
    }
    lives--; player.invulnerable = 1.8; shake = reducedMotion ? 0 : .25;
    burst(player.x, player.y, '#d4f885', 23); tone(110, .25, 'sawtooth', .07); updateHud();
    if (lives <= 0) finish();
  }
  function spawnEnemy() {
    const heavy = wave > 1 && Math.random() < .25;
    const x = 50 + Math.random() * (width - 100);
    enemies.push({ x, baseX: x, y: -45, radius: heavy ? 27 : 20, hp: heavy ? Math.min(24, 6 + Math.floor(wave / 3)) : Math.min(12, 2 + Math.floor(wave / 4)), heavy, age: 0, speed: Math.min(145, 42 + wave * 6) * (heavy ? .65 : 1), phase: Math.random() * Math.PI * 2, shot: 1.7 + Math.random() * 2 });
  }
  function destroyEnemy(enemy) {
    score += enemy.heavy ? 250 : 100;
    burst(enemy.x, enemy.y, enemy.heavy ? '#b8a6ff' : '#7ce5d5'); tone(190, .11, 'triangle');
    if (Math.random() < .18) dropItem(enemy.x, enemy.y);
    updateHud();
  }
  function damageBoss(damage) {
    if (!boss || boss.y < 0) return;
    boss.hp -= damage;
    burst(boss.x, boss.y, '#d4f885', 4);
    if (boss.hp <= 0) {
      const reward = boss.elite ? 25000 : 3000;
      score += reward; burst(boss.x, boss.y, '#c4ff85', 55);
      if (wave === 10 && !boss.elite && !specialDropGranted) {
        specialDropGranted = true; dropItem(clamp(boss.x - 80, 35, width - 35), boss.y, 'lightning'); updateSpecialHud();
      }
      dropItem(boss.x, boss.y, 'repair'); dropItem(clamp(boss.x + 80, 25, width - 25), boss.y, 'arsenal');
      boss = null; enemyBullets = []; $('arena').classList.remove('boss-encounter');
      announce(`MARCIANITO DERROTADO · +${reward} PTS`); tone(95, .4, 'triangle'); updateHud();
    }
  }
  function bossContact(object, padding = 0) { return boss && ((object.x - boss.x) / (boss.rx + padding)) ** 2 + ((object.y - boss.y) / (boss.ry + padding)) ** 2 < 1; }
  function updateBoss(hostileDt) {
    if (!boss) return;
    boss.age += hostileDt;
    boss.y = Math.min(Math.max(170, Math.min(240, height * .3)), boss.y + 85 * hostileDt);
    boss.x = width / 2 + Math.sin(boss.age * (boss.elite ? .9 : .65)) * width * .29;
    if (!boss.enraged && boss.hp <= boss.maxHp / 2) { boss.enraged = true; announce('MARCIANITO EN FURIA · ¡ESQUIVA!'); }
    boss.shot -= hostileDt;
    if (boss.shot <= 0 && boss.y >= 100) {
      const aim = Math.atan2(player.y - boss.y, player.x - boss.x);
      const count = boss.elite ? (boss.enraged ? 9 : 7) : (boss.enraged ? 5 : 3);
      const speed = boss.elite ? 235 : 155;
      for (let i = 0; i < count; i++) { const angle = aim + (i - (count - 1) / 2) * .19; enemyBullets.push({ x: boss.x, y: boss.y + 28, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }); }
      if (boss.enraged && boss.volley % 2 === 0) {
        const count = boss.elite ? 16 : 10;
        for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2 + boss.age * .15; enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * speed * .75, vy: Math.sin(angle) * speed * .75 }); }
      }
      boss.volley++; boss.shot = boss.elite ? (boss.enraged ? .8 : 1.15) : (boss.enraged ? 1.2 : 1.8);
    }
    for (const bullet of bullets) { if (!bullet.dead && bossContact(bullet, 5)) { bullet.dead = true; damageBoss(bullet.damage); if (!boss) break; } }
    if (bossContact(player, 14)) hit();
  }
  function fire(ship) {
    const enhanced = effects.arsenal > 0;
    const angles = enhanced && selected === 'spectre' ? [-.23, 0, .23] : [0];
    const offsets = enhanced && selected === 'vanguard' ? [-12, 12] : [0];
    for (const offset of offsets) for (const angle of angles) bullets.push({ x: player.x + offset, y: player.y - 24, vx: Math.sin(angle) * 650, vy: -Math.cos(angle) * 650, damage: enhanced && selected === 'vanguard' ? 3 : ship.damage });
    tone(620, .035, 'sine', .012);
  }
  function update(dt) {
    if (announceTime > 0) { announceTime -= dt; if (announceTime <= 0) $('announcement').classList.remove('visible'); }
    for (const type of Object.keys(effects)) effects[type] = Math.max(0, effects[type] - dt);
    if (!effects.aegis) barrierCharges = 0;
    updateAbilities();
    if (pulseRing) { pulseRing.life -= dt; if (pulseRing.life <= 0) pulseRing = null; }
    shake = Math.max(0, shake - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    const ship = ships[selected], temporal = selected === 'spectre' && effects.drive > 0;
    const speed = ship.speed * (temporal ? 1.55 : 1), hostileDt = dt * (temporal ? .55 : 1);
    let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    if (dx || dy) { const length = Math.hypot(dx, dy); player.x += dx / length * speed * dt; player.y += dy / length * speed * dt; }
    else if (pointer) { dx = pointer.x - player.x; dy = pointer.y - player.y; const distance = Math.hypot(dx, dy), step = Math.min(distance, speed * 1.5 * dt); if (distance > 0) { player.x += dx / distance * step; player.y += dy / distance * step; } }
    player.x = clamp(player.x, 28, width - 28); player.y = clamp(player.y, 65, height - 38);
    player.cooldown -= dt;
    if (player.cooldown <= 0) { fire(ship); player.cooldown = ship.interval * (selected === 'vanguard' && effects.drive > 0 ? .55 : 1); }
    if (effects.core > 0 && selected === 'spectre') {
      droneCooldown -= dt;
      if (droneCooldown <= 0) { bullets.push({ x: player.x + Math.cos(elapsed * 3) * 42, y: player.y - 18, vx: 0, vy: -420, damage: 3, homing: true }); droneCooldown = .4; }
    }
    supplyTimer -= dt;
    if (supplyTimer <= 0) { dropItem(40 + Math.random() * (width - 80), 55, itemTypes[supplyIndex++ % itemTypes.length]); supplyTimer = boss ? 8 : 12; }
    spawnTimer -= dt;
    if (spawnRemaining > 0 && spawnTimer <= 0) { spawnEnemy(); spawnRemaining--; spawnTimer = Math.max(.3, 1.05 - wave * .04); }
    for (const bullet of bullets) {
      if (bullet.homing) {
        const targets = [...enemies.filter(e => e.hp > 0 && e.y > 0), ...(boss && boss.y > 0 ? [boss] : [])];
        const target = targets.reduce((closest, target) => !closest || Math.hypot(target.x - bullet.x, target.y - bullet.y) < Math.hypot(closest.x - bullet.x, closest.y - bullet.y) ? target : closest, null);
        if (target) { const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x); bullet.vx = Math.cos(angle) * 420; bullet.vy = Math.sin(angle) * 420; }
      }
      bullet.x += (bullet.vx || 0) * dt; bullet.y += (bullet.vy ?? -650) * dt;
    }
    for (const enemy of enemies) {
      enemy.age += hostileDt; enemy.y += enemy.speed * hostileDt;
      enemy.x = clamp(enemy.baseX + Math.sin(enemy.age * 1.8 + enemy.phase) * (enemy.heavy ? 65 : 38), 30, width - 30);
      enemy.shot -= hostileDt;
      if (enemy.shot <= 0 && enemy.y > 15 && enemy.y < height - 140) {
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        const speed = Math.min(265, 145 + wave * 9);
        enemyBullets.push({ x: enemy.x, y: enemy.y + 12, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
        enemy.shot = Math.max(1.1, 3.3 - wave * .12) + Math.random();
      }
      for (const bullet of bullets) {
        if (!bullet.dead && enemy.hp > 0 && intersects(bullet, enemy, enemy.radius + 5)) {
          bullet.dead = true; enemy.hp -= bullet.damage; burst(bullet.x, bullet.y, '#94e1f4', 4);
          if (enemy.hp <= 0) destroyEnemy(enemy);
        }
      }
      if (enemy.hp > 0 && intersects(player, enemy, enemy.radius + 14) && !(effects.phase > 0)) { enemy.hp = 0; burst(enemy.x, enemy.y, '#ff917a'); hit(); if (state !== 'playing') return; }
      if (enemy.y > height + 40 && enemy.hp > 0) { enemy.hp = 0; hit(); if (state !== 'playing') return; }
    }
    updateBoss(hostileDt);
    if (state !== 'playing') return;
    for (const bullet of enemyBullets) { bullet.x += bullet.vx * hostileDt; bullet.y += bullet.vy * hostileDt; if (intersects(player, bullet, 17)) { bullet.dead = true; hit(); if (state !== 'playing') return; } }
    updateSpecial(dt);
    // Iterate a snapshot: a pulse can destroy enemies and create additional drops.
    for (const orb of [...pickups]) { orb.y = orb.type === 'lightning' ? Math.min(height - 65, orb.y + 45 * dt) : orb.y + 85 * dt; orb.age += dt; if (intersects(player, orb, 33)) { orb.dead = true; collectItem(orb.type || 'repair'); } }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    enemies = enemies.filter(e => e.hp > 0);
    bullets = bullets.filter(b => !b.dead && b.y > -20 && b.y < height + 25 && b.x > -25 && b.x < width + 25);
    enemyBullets = enemyBullets.filter(b => !b.dead && b.y < height + 20 && b.y > -30 && b.x > -20 && b.x < width + 20);
    pickups = pickups.filter(p => !p.dead && p.y < height + 20);
    particles = particles.filter(p => p.life > 0);
    if (spawnRemaining === 0 && enemies.length === 0 && !boss) {
      if (waveDelay === 0) { waveDelay = 2.5; score += wave * 150; updateHud(); announce(`SECTOR DESPEJADO · +${wave * 150} PTS`); }
      waveDelay -= dt;
      if (waveDelay <= 0) { wave++; enemyBullets = []; beginWave(); }
    }
  }

  // The backdrop is rendered once per resize; stars and flight effects animate separately.
  let backdrop, backdropWidth = 0, backdropHeight = 0;
  function createBackdrop() {
    backdrop = document.createElement('canvas'); backdrop.width = canvas.width; backdrop.height = canvas.height;
    const c = backdrop.getContext('2d'); c.scale(canvas.width / width, canvas.height / height);
    c.fillStyle = '#080e1e'; c.fillRect(0, 0, width, height);
    const glow = c.createRadialGradient(width * .76, height * .34, 0, width * .73, height * .3, width * .75);
    glow.addColorStop(0, '#343875'); glow.addColorStop(.3, '#1c2549'); glow.addColorStop(.65, '#0d172c'); glow.addColorStop(1, '#080e1a');
    c.fillStyle = glow; c.fillRect(0, 0, width, height);
    const px = width * .78, py = height * .4, radius = Math.min(width * .26, height * .39);
    c.save(); c.translate(px, py); c.rotate(-.4);
    c.strokeStyle = '#96a9db14'; c.lineWidth = 1;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, 0, radius * (1.45 + i * .32), radius * (.65 + i * .13), 0, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    const halo = c.createRadialGradient(px, py, radius * .85, px, py, radius * 1.16); halo.addColorStop(0, '#7775d600'); halo.addColorStop(.6, '#737eea2b'); halo.addColorStop(1, '#737eea00');
    c.fillStyle = halo; c.fillRect(px - radius * 1.2, py - radius * 1.2, radius * 2.4, radius * 2.4);
    c.save(); c.beginPath(); c.arc(px, py, radius, 0, Math.PI * 2); c.clip();
    const planet = c.createRadialGradient(px - radius * .65, py - radius * .65, 0, px + radius * .2, py + radius * .3, radius * 1.7);
    planet.addColorStop(0, '#818cb9'); planet.addColorStop(.25, '#4d578a'); planet.addColorStop(.5, '#262e54'); planet.addColorStop(.75, '#0c152b'); planet.addColorStop(1, '#080e1c');
    c.fillStyle = planet; c.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    // Fine mineral bands give the planet texture without external assets.
    for (let i = 0; i < 110; i++) { c.beginPath(); c.strokeStyle = `rgba(152,164,208,${.012 + (i % 4) * .005})`; c.lineWidth = 1 + i % 3; c.ellipse(px - radius * .25, py - radius + i * radius * .024, radius * 1.2, radius * .23, -.4, 0, Math.PI * 2); c.stroke(); }
    const shadow = c.createLinearGradient(px - radius, py - radius, px + radius * .7, py + radius * .7); shadow.addColorStop(0, '#050d1900'); shadow.addColorStop(.6, '#060d1955'); shadow.addColorStop(1, '#060d19ed'); c.fillStyle = shadow; c.fillRect(px - radius, py - radius, radius * 2, radius * 2); c.restore();
    c.strokeStyle = '#9cb0cf08'; c.lineWidth = .7;
    for (let x = 0; x < width; x += 65) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, height); c.stroke(); }
    for (let y = 0; y < height; y += 65) { c.beginPath(); c.moveTo(0, y); c.lineTo(width, y); c.stroke(); }
    const vignette = c.createLinearGradient(0, height * .55, 0, height); vignette.addColorStop(0, '#050b1700'); vignette.addColorStop(1, '#050b17cb'); c.fillStyle = vignette; c.fillRect(0, 0, width, height);
    backdropWidth = canvas.width; backdropHeight = canvas.height;
  }
  function drawShip(x, y, ship, size = 1, preview = false) {
    ctx.save(); ctx.translate(x, y);
    if (preview) ctx.rotate(-.34);
    const flame = (reducedMotion ? 22 : 19 + Math.sin(elapsed * 35) * 7) * size;
    const trail = ctx.createLinearGradient(0, 15 * size, 0, 15 * size + flame * 2.4); trail.addColorStop(0, '#b5f4ffbb'); trail.addColorStop(.28, '#568efa77'); trail.addColorStop(1, '#468aff00');
    ctx.fillStyle = trail; ctx.beginPath(); ctx.moveTo(-7 * size, 13 * size); ctx.lineTo(0, 15 * size + flame * 2.4); ctx.lineTo(7 * size, 13 * size); ctx.closePath(); ctx.fill();
    const img = sprites[ship.image];
    if (img.complete && img.naturalWidth) ctx.drawImage(img, -ship.width * size / 2, -ship.height * size / 2, ship.width * size, ship.height * size);
    else { ctx.fillStyle = '#9ad7f4'; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(20, 20); ctx.lineTo(0, 12); ctx.lineTo(-20, 20); ctx.fill(); }
    ctx.restore();
  }
  function renderBoss(cameraX = 0, cameraY = 0) {
    const visible = Boolean(boss && state !== 'ready' && state !== 'ended');
    $('boss-hud').hidden = !visible;
    // An actual image element preserves the original GIF animation (canvas does not).
    const animated = visible && state === 'playing' && !reducedMotion;
    $('boss-sprite').hidden = !animated;
    if (!visible) return;
    const imageWidth = boss.elite ? 340 : 280, imageHeight = imageWidth * 267 / 400;
    $('boss-sprite').style.left = `${(boss.x + cameraX) / width * 100}%`;
    $('boss-sprite').style.top = `${(boss.y + cameraY) / height * 100}%`;
    $('boss-sprite').style.width = `${imageWidth / width * 100}%`;
    $('boss-sprite').style.height = `${imageHeight / height * 100}%`;
    const percent = Math.max(0, Math.ceil(boss.hp / boss.maxHp * 100));
    $('boss-name').textContent = `${boss.elite ? 'MARCIANITO SUPREMO' : 'EL MARCIANITO'}${boss.enraged ? ' · FURIA' : ''}`;
    $('boss-health-text').textContent = `${Math.max(0, boss.hp)} / ${boss.maxHp}`;
    $('boss-health').setAttribute('aria-valuenow', percent);
    $('boss-health-fill').style.width = `${percent}%`;
    const img = $('boss-sprite');
    if ((!animated || !img.complete || !img.naturalWidth) && visible) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      if (img.complete && img.naturalWidth) ctx.drawImage(img, boss.x - imageWidth / 2, boss.y - imageHeight / 2, imageWidth, imageHeight);
      else { ctx.fillStyle = '#d4f885'; ctx.beginPath(); ctx.ellipse(boss.x, boss.y, boss.rx, boss.ry, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
  function renderSpecial() {
    if (special.charge > 0) {
      const progress = special.charge / SPECIAL.chargeTime;
      ctx.save(); ctx.translate(player.x, player.y - 28);
      ctx.strokeStyle = '#72f3fa'; ctx.lineWidth = 2 + progress * 2;
      ctx.beginPath(); ctx.arc(0, 0, 12 + progress * 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
      ctx.fillStyle = `rgba(114,243,250,${progress * .6})`; ctx.beginPath(); ctx.arc(0, 0, 5 + progress * 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    const beam = special.beam;
    if (!beam) return;
    ctx.save();
    const alpha = Math.min(1, beam.life / .35), spread = SPECIAL.halfWidth;
    ctx.globalAlpha = alpha;
    const glow = ctx.createLinearGradient(beam.x - spread, 0, beam.x + spread, 0);
    glow.addColorStop(0, '#39def600'); glow.addColorStop(.35, '#39def655'); glow.addColorStop(.5, '#cbffffaa'); glow.addColorStop(.65, '#39def655'); glow.addColorStop(1, '#39def600');
    ctx.fillStyle = glow; ctx.fillRect(beam.x - spread, 0, spread * 2, beam.y);
    const img = sprites['rayo.png'];
    ctx.globalCompositeOperation = 'screen'; ctx.shadowColor = '#39eafa'; ctx.shadowBlur = reducedMotion ? 8 : 23;
    if (img.complete && img.naturalWidth) ctx.drawImage(img, beam.x - spread, 0, spread * 2, Math.max(1, beam.y));
    else { ctx.fillStyle = '#b6ffff'; ctx.fillRect(beam.x - 12, 0, 24, beam.y); }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c4ffff'; ctx.beginPath(); ctx.ellipse(beam.x, beam.y, 32, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#72f3fa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(beam.x, beam.y, 55, 20, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function render() {
    if (!backdrop || backdropWidth !== canvas.width || backdropHeight !== canvas.height) createBackdrop();
    const magnitude = state === 'playing' && !reducedMotion ? Math.max(shake > 0 ? 4 : 0, 16 * special.quake / SPECIAL.duration) : 0;
    const cameraX = Math.sin(elapsed * 73) * magnitude, cameraY = Math.cos(elapsed * 91) * magnitude * .7;
    ctx.clearRect(0, 0, width, height); ctx.save(); ctx.translate(cameraX, cameraY);
    ctx.drawImage(backdrop, -18, -18, width + 36, height + 36);
    for (const star of stars) { ctx.globalAlpha = star.alpha; ctx.fillStyle = '#c0cde9'; ctx.fillRect(star.x * width, star.y * height, star.size, star.size); }
    ctx.globalAlpha = 1;
    renderBoss(cameraX, cameraY);
    if (state === 'ready') {
      const x = width * .77, y = height * .66 + (reducedMotion ? 0 : Math.sin(elapsed * 1.4) * 7);
      ctx.save(); ctx.strokeStyle = '#adc3de1c'; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.ellipse(x, y + 15, 104, 42, -.35, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      drawShip(x, y, ships[selected], width < 700 ? 1.5 : 2.3, true);
      ctx.restore(); return;
    }
    ctx.save();
    for (const bullet of bullets) { ctx.fillStyle = bullet.homing ? '#ff95cd' : '#d4f885'; ctx.shadowBlur = 9; ctx.shadowColor = ctx.fillStyle; ctx.fillRect(bullet.x - 2, bullet.y - 10, bullet.homing ? 6 : 4, bullet.homing ? 10 : 18); }
    ctx.shadowBlur = 0;
    for (const enemy of enemies) {
      const img = sprites['alienave.png'];
      if (img.complete && img.naturalWidth) { ctx.save(); if (enemy.heavy) ctx.filter = 'hue-rotate(85deg)'; ctx.drawImage(img, enemy.x - enemy.radius, enemy.y - enemy.radius * .7, enemy.radius * 2, enemy.radius * 1.4); ctx.restore(); }
      else { ctx.fillStyle = '#ac99ef'; ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y, enemy.radius, enemy.radius * .55, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const bullet of enemyBullets) { ctx.fillStyle = '#ff998d'; ctx.shadowBlur = 10; ctx.shadowColor = '#ff706c'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
    for (const orb of pickups) {
      const item = orb.type === 'lightning' ? lightningItem : items[orb.type || 'repair'];
      ctx.save(); ctx.translate(orb.x, orb.y); if (orb.type === 'lightning') ctx.scale(1.5, 1.5); ctx.fillStyle = `${item.color}22`; ctx.strokeStyle = item.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(19, 0); ctx.lineTo(0, 19); ctx.lineTo(-19, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = item.color; ctx.font = 'bold 17px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(item.symbol, 0, 1); ctx.restore();
    }
    if (pulseRing) { ctx.save(); ctx.strokeStyle = '#ff95cd'; ctx.globalAlpha = pulseRing.life / .65; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pulseRing.x, pulseRing.y, (1 - pulseRing.life / .65) * Math.max(width, height), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (lives > 0) {
      ctx.globalAlpha = effects.phase > 0 ? .45 : player.invulnerable > 0 && Math.floor(elapsed * 10) % 2 && !reducedMotion ? .45 : 1;
      drawShip(player.x, player.y, ships[selected]); ctx.globalAlpha = 1;
      if (player.invulnerable > 0 || effects.phase > 0 || effects.aegis > 0 || effects.repair > 0) { ctx.strokeStyle = effects.phase > 0 || effects.aegis > 0 ? '#b8a0ffbb' : '#d4f88577'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(player.x, player.y, 35, 0, Math.PI * 2); ctx.stroke(); }
      if (effects.drive > 0 && selected === 'spectre') { ctx.strokeStyle = '#80ddff33'; ctx.beginPath(); ctx.arc(player.x, player.y, 64, 0, Math.PI * 2); ctx.stroke(); }
      if (effects.core > 0 && selected === 'spectre') { ctx.fillStyle = '#ff95cd'; ctx.beginPath(); ctx.arc(player.x + Math.cos(elapsed * 3) * 42, player.y - 18, 7, 0, Math.PI * 2); ctx.fill(); }
    }
    renderSpecial();
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
    ctx.globalAlpha = 1; ctx.restore(); ctx.restore();
  }
  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000 || 0, .04); lastTime = time;
    if (state === 'playing' || state === 'ready') {
      elapsed += dt;
      if (!reducedMotion) for (const star of stars) star.y = (star.y + dt * star.speed * (state === 'playing' ? 2 : .35)) % 1;
    }
    if (state === 'playing') update(dt);
    render(); requestAnimationFrame(frame);
  }
  updateSpecialHud();
  resize(); updateHud(); requestAnimationFrame(frame);
})();
