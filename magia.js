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
  const sprites = {};
  for (const file of ['navec.png', 'navep.png', 'alienave.png', 'alien.png']) {
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
    width = bounds.width < 480 ? 600 : 1000;
    height = width * bounds.height / Math.max(bounds.width, 1);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    for (const objects of [[player], enemies, bullets, enemyBullets, particles, pickups]) {
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
  }
  document.querySelectorAll('[data-ship]').forEach(button => button.addEventListener('click', () => selectShip(button.dataset.ship)));
  selectShip(selected);

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
    keys.clear(); pointer = null;
    $('arena').className = `arena ${next}`;
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
    enemies = []; bullets = []; enemyBullets = []; particles = []; pickups = [];
    player = { x: width / 2, y: height - 90, cooldown: .15, invulnerable: 1.8 };
    shake = 0; waveDelay = 0;
    unlockAudio(); setState('playing'); updateHud(); beginWave();
    canvas.focus({ preventScroll: true });
  }
  function beginWave() { spawnRemaining = 6 + wave * 2; spawnTimer = .7; waveDelay = 0; announce(`OLEADA ${String(wave).padStart(2, '0')} · EN POSICIÓN`); updateHud(); }
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
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key) && state === 'playing') { event.preventDefault(); keys.add(key); }
    if (!event.repeat && (key === 'p' || key === 'escape') && (state === 'playing' || state === 'paused')) { event.preventDefault(); togglePause(); }
    if (!event.repeat && key === 'enter' && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A') { event.preventDefault(); start(); }
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
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
    if (player.invulnerable > 0 || state !== 'playing') return;
    lives--; player.invulnerable = 1.8; shake = reducedMotion ? 0 : .25;
    burst(player.x, player.y, '#d4f885', 23); tone(110, .25, 'sawtooth', .07); updateHud();
    if (lives <= 0) finish();
  }
  function spawnEnemy() {
    const heavy = wave > 1 && Math.random() < .25;
    const x = 50 + Math.random() * (width - 100);
    enemies.push({ x, baseX: x, y: -45, radius: heavy ? 27 : 20, hp: heavy ? 6 + Math.floor(wave / 3) : 2 + Math.floor(wave / 4), heavy, age: 0, speed: Math.min(145, 42 + wave * 6) * (heavy ? .65 : 1), phase: Math.random() * Math.PI * 2, shot: 1.7 + Math.random() * 2 });
  }
  function update(dt) {
    if (announceTime > 0) { announceTime -= dt; if (announceTime <= 0) $('announcement').classList.remove('visible'); }
    shake = Math.max(0, shake - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    const ship = ships[selected];
    let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    if (dx || dy) { const length = Math.hypot(dx, dy); player.x += dx / length * ship.speed * dt; player.y += dy / length * ship.speed * dt; }
    else if (pointer) { dx = pointer.x - player.x; dy = pointer.y - player.y; const distance = Math.hypot(dx, dy), step = Math.min(distance, ship.speed * 1.5 * dt); if (distance > 0) { player.x += dx / distance * step; player.y += dy / distance * step; } }
    player.x = clamp(player.x, 28, width - 28); player.y = clamp(player.y, 65, height - 38);
    player.cooldown -= dt;
    if (player.cooldown <= 0) { bullets.push({ x: player.x, y: player.y - 24, damage: ship.damage }); player.cooldown = ship.interval; tone(620, .035, 'sine', .012); }
    spawnTimer -= dt;
    if (spawnRemaining > 0 && spawnTimer <= 0) { spawnEnemy(); spawnRemaining--; spawnTimer = Math.max(.3, 1.05 - wave * .04); }
    for (const bullet of bullets) bullet.y -= 650 * dt;
    for (const enemy of enemies) {
      enemy.age += dt; enemy.y += enemy.speed * dt;
      enemy.x = clamp(enemy.baseX + Math.sin(enemy.age * 1.8 + enemy.phase) * (enemy.heavy ? 65 : 38), 30, width - 30);
      enemy.shot -= dt;
      if (enemy.shot <= 0 && enemy.y > 15 && enemy.y < height - 140) {
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        const speed = Math.min(265, 145 + wave * 9);
        enemyBullets.push({ x: enemy.x, y: enemy.y + 12, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
        enemy.shot = Math.max(1.1, 3.3 - wave * .12) + Math.random();
      }
      for (const bullet of bullets) {
        if (!bullet.dead && enemy.hp > 0 && intersects(bullet, enemy, enemy.radius + 5)) {
          bullet.dead = true; enemy.hp -= bullet.damage; burst(bullet.x, bullet.y, '#94e1f4', 4);
          if (enemy.hp <= 0) { score += enemy.heavy ? 250 : 100; burst(enemy.x, enemy.y, enemy.heavy ? '#b8a6ff' : '#7ce5d5'); tone(190, .11, 'triangle'); if (Math.random() < .15) pickups.push({ x: enemy.x, y: enemy.y, age: 0 }); updateHud(); }
        }
      }
      if (enemy.hp > 0 && intersects(player, enemy, enemy.radius + 14)) { enemy.hp = 0; burst(enemy.x, enemy.y, '#ff917a'); hit(); if (state !== 'playing') return; }
      if (enemy.y > height + 40 && enemy.hp > 0) { enemy.hp = 0; hit(); if (state !== 'playing') return; }
    }
    for (const bullet of enemyBullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; if (intersects(player, bullet, 17)) { bullet.dead = true; hit(); if (state !== 'playing') return; } }
    for (const orb of pickups) { orb.y += 85 * dt; orb.age += dt; if (intersects(player, orb, 33)) { orb.dead = true; if (lives < 3) { lives++; announce('ESCUDO RESTAURADO +1'); } else score += 50; burst(orb.x, orb.y, '#d4f885', 9); tone(850, .16); updateHud(); } }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    enemies = enemies.filter(e => e.hp > 0);
    bullets = bullets.filter(b => !b.dead && b.y > -20);
    enemyBullets = enemyBullets.filter(b => !b.dead && b.y < height + 20 && b.y > -30 && b.x > -20 && b.x < width + 20);
    pickups = pickups.filter(p => !p.dead && p.y < height + 20);
    particles = particles.filter(p => p.life > 0);
    if (spawnRemaining === 0 && enemies.length === 0) {
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
  function render() {
    if (!backdrop || backdropWidth !== canvas.width || backdropHeight !== canvas.height) createBackdrop();
    ctx.clearRect(0, 0, width, height); ctx.drawImage(backdrop, 0, 0, width, height);
    for (const star of stars) { ctx.globalAlpha = star.alpha; ctx.fillStyle = '#c0cde9'; ctx.fillRect(star.x * width, star.y * height, star.size, star.size); }
    ctx.globalAlpha = 1;
    if (state === 'ready') {
      const x = width * .77, y = height * .66 + (reducedMotion ? 0 : Math.sin(elapsed * 1.4) * 7);
      ctx.save(); ctx.strokeStyle = '#adc3de1c'; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.ellipse(x, y + 15, 104, 42, -.35, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      drawShip(x, y, ships[selected], width < 700 ? 1.5 : 2.3, true);
      return;
    }
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 8);
    for (const bullet of bullets) { ctx.fillStyle = '#d4f885'; ctx.shadowBlur = 9; ctx.shadowColor = '#d4f885'; ctx.fillRect(bullet.x - 2, bullet.y - 10, 4, 18); }
    ctx.shadowBlur = 0;
    for (const enemy of enemies) {
      const img = sprites['alienave.png'];
      if (img.complete && img.naturalWidth) { ctx.save(); if (enemy.heavy) ctx.filter = 'hue-rotate(85deg)'; ctx.drawImage(img, enemy.x - enemy.radius, enemy.y - enemy.radius * .7, enemy.radius * 2, enemy.radius * 1.4); ctx.restore(); }
      else { ctx.fillStyle = '#ac99ef'; ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y, enemy.radius, enemy.radius * .55, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const bullet of enemyBullets) { ctx.fillStyle = '#ff998d'; ctx.shadowBlur = 10; ctx.shadowColor = '#ff706c'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
    for (const orb of pickups) { ctx.save(); ctx.translate(orb.x, orb.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#d4f88522'; ctx.strokeStyle = '#d4f885'; ctx.fillRect(-10, -10, 20, 20); ctx.strokeRect(-10, -10, 20, 20); ctx.rotate(-Math.PI / 4); ctx.fillStyle = '#d4f885'; ctx.fillRect(-5, -1, 10, 2); ctx.fillRect(-1, -5, 2, 10); ctx.restore(); }
    if (lives > 0) {
      ctx.globalAlpha = player.invulnerable > 0 && Math.floor(elapsed * 10) % 2 && !reducedMotion ? .45 : 1;
      drawShip(player.x, player.y, ships[selected]); ctx.globalAlpha = 1;
      if (player.invulnerable > 0) { ctx.strokeStyle = '#d4f88577'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(player.x, player.y, 35, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
    ctx.globalAlpha = 1; ctx.restore();
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
  resize(); updateHud(); requestAnimationFrame(frame);
})();
