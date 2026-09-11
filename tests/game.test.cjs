const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Run the real engine in an isolated DOM stub, with access restricted to tests.
function game() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { style: {}, dataset: {}, hidden: false, innerHTML: '', textContent: '',
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
        setAttribute() {}, addEventListener() {}, focus() {}, pause() {},
        getBoundingClientRect: () => ({ width: 1000, height: 620 }),
        getContext: () => ({ setTransform() {} }) });
    }
    return elements.get(id);
  };
  const context = vm.createContext({ console, Math, Set, Image: class {},
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {}, body: element('body') },
    window: { addEventListener() {} }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {} },
    ResizeObserver: class { observe() {} }, requestAnimationFrame() {}, devicePixelRatio: 1 });
  const source = fs.readFileSync(require.resolve('../magia.js'), 'utf8').replace('  resize(); updateHud(); requestAnimationFrame(frame);', '  globalThis.run = source => eval(source); resize(); updateHud(); requestAnimationFrame(frame);');
  vm.runInContext(source, context);
  context.run("start(); spawnRemaining = 1; spawnTimer = 100; player.cooldown = 100;");
  return code => context.run(code);
}

test('boss encounters exist only on waves 10 and 100 and block progression', () => {
  const run = game();
  for (const wave of [9, 11, 99, 101]) assert.equal(run(`wave = ${wave}; beginWave(); boss === null && spawnRemaining > 0`), true);
  for (const wave of [10, 100]) {
    assert.equal(run(`wave = ${wave}; beginWave(); boss !== null && spawnRemaining === 0`), true);
    assert.equal(run('update(.04); waveDelay'), 0);
    assert.equal(run(`boss.elite === ${wave === 100}`), true);
    assert.equal(run('boss.hp'), wave === 10 ? 180 : 1400);
    assert.equal(run(`boss.y = 150; damageBoss(boss.maxHp); update(.01); update(2.6); wave`), wave + 1);
  }
});

test('boss uses spread attacks, enrages, survives contact and takes projectile damage', () => {
  const run = game();
  run('wave = 10; beginWave(); boss.y = 150; boss.shot = 0; updateBoss(0);');
  assert.equal(run('enemyBullets.length'), 3);
  assert.equal(run('damageBoss(90); updateBoss(0); boss.enraged'), true);
  assert.equal(run('boss.shot = 0; enemyBullets = []; updateBoss(0); enemyBullets.length'), 5);
  assert.equal(run('player.x = boss.x; player.y = boss.y; player.invulnerable = 0; updateBoss(0); boss.hp === 90 && lives === 2'), true);
  assert.equal(run('bullets = [{x: boss.x, y: boss.y, damage: 7}]; updateBoss(0); boss.hp'), 83);
});

test('Nanobots repair and protect differently per ship', () => {
  const run = game();
  assert.equal(run("lives = 1; collectItem('repair'); lives === 3 && effects.repair === 2"), true);
  assert.equal(run("collectItem('repair'); score"), 50);
  assert.equal(run("selected = 'spectre'; effects = {}; lives = 1; collectItem('repair'); lives === 2 && effects.phase === 4"), true);
});

test('Arsenal gives Vanguard twin cannons and Spectre spread', () => {
  const run = game();
  assert.equal(run("collectItem('arsenal'); bullets = []; fire(ships[selected]); bullets.length === 2 && bullets.every(b => b.damage === 3) && bullets[0].x !== bullets[1].x"), true);
  assert.equal(run("selected = 'spectre'; bullets = []; fire(ships[selected]); bullets.length === 3 && bullets[0].vx < 0 && bullets[2].vx > 0 && bullets.every(b => b.damage === 1)"), true);
});

test('Propulsor changes fire rate or player speed and hostile time', () => {
  const run = game();
  assert.equal(run("collectItem('drive'); player.cooldown = 0; update(0); player.cooldown"), .19 * .55);
  run("selected = 'spectre'; effects = {}; collectItem('drive'); player.x = 100; keys.add('d'); enemyBullets = [{x:0,y:0,vx:100,vy:100}]; update(.1);");
  assert.equal(run('player.x'), 100 + 440 * 1.55 * .1);
  assert.equal(run('Math.round(enemyBullets[0].x * 10) / 10'), 5.5);
});

test('Barrera absorbs three hits for Vanguard and grants phase to Spectre', () => {
  const run = game();
  run("collectItem('aegis'); for(let i=0;i<3;i++){player.invulnerable=0;hit();}");
  assert.equal(run('lives === 3 && barrierCharges === 0 && effects.aegis === 0'), true);
  assert.equal(run('player.invulnerable = 0; hit(); lives'), 2);
  assert.equal(run("selected = 'spectre'; collectItem('aegis'); player.invulnerable = 0; hit(); lives === 2 && effects.phase === 5"), true);
});

test('Núcleo pulse damages enemies and boss; Spectre drone fires guided shots', () => {
  const run = game();
  run("wave = 10; beginWave(); boss.y = 150; enemies = [{x:50,y:50,hp:10,heavy:false}]; enemyBullets = [{x:10,y:10}]; collectItem('core');");
  assert.equal(run('boss.hp === 145 && enemies[0].hp <= 0 && enemyBullets.length === 0 && score === 100'), true);
  assert.equal(run("selected = 'spectre'; collectItem('core'); bullets = []; update(0); effects.core === 12 && bullets.some(b => b.homing && b.damage === 3)"), true);
});

test('supplies cycle through all five items and contact activates the pickup', () => {
  const run = game();
  for (let i = 0; i < 5; i++) {
    assert.equal(run(`supplyTimer = 0; update(0); pickups.at(-1).type === itemTypes[${i}]`), true);
  }
  assert.equal(run("pickups = [{x:player.x,y:player.y,age:0,type:'arsenal'}]; update(0); effects.arsenal === 10 && pickups.length === 0"), true);
});

test('effects expire, refresh without stacking, and reset on restart', () => {
  const run = game();
  assert.equal(run("collectItem('arsenal'); update(3); effects.arsenal"), 7);
  assert.equal(run("collectItem('arsenal'); effects.arsenal"), 10);
  assert.equal(run('update(11); effects.arsenal'), 0);
  run("wave = 100; beginWave(); collectItem('aegis'); finish(); start();");
  assert.equal(run('boss === null && Object.keys(effects).length === 0 && barrierCharges === 0 && wave === 1 && score === 0 && lives === 3 && pickups.length === 0'), true);
});

function unlockRelic(run) {
  run("wave = 10; beginWave(); boss.y = 150; damageBoss(180); const relic = pickups.find(p => p.type === 'lightning'); player.x = relic.x; player.y = relic.y; update(0); enemies = []; bullets = []; pickups = []; spawnRemaining = 1; spawnTimer = 100;");
}

test('lightning relic is exclusive to boss 10, requires pickup and never joins normal supplies', () => {
  const run = game();
  assert.equal(run("itemTypes.includes('lightning')"), false);
  assert.equal(run("holdSpecial('key:r'); updateSpecial(3); special.uses === 0 && special.beam === null"), true);
  run('wave = 100; beginWave(); boss.y = 150; damageBoss(1400);');
  assert.equal(run("pickups.some(p => p.type === 'lightning')"), false);
  run('wave = 10; beginWave(); boss.y = 150; damageBoss(180);');
  assert.equal(run("pickups.filter(p => p.type === 'lightning').length === 1 && !special.unlocked"), true);
  run("const relic = pickups.find(p => p.type === 'lightning'); player.x = relic.x; player.y = relic.y; update(0);");
  assert.equal(run('special.unlocked && special.uses === 5 && special.cooldown === 0'), true);
  run('wave = 10; beginWave(); boss.y = 150; damageBoss(180);');
  assert.equal(run("pickups.some(p => p.type === 'lightning')"), false);
});

test('lightning requires a continuous three-second hold and releasing cancels without consuming', () => {
  const run = game(); unlockRelic(run);
  run("holdSpecial('key:r'); updateSpecial(2.9);");
  assert.equal(run('special.uses === 5 && !special.beam && special.charge === 2.9'), true);
  run("releaseSpecial('key:r'); updateSpecial(.2);");
  assert.equal(run('special.uses === 5 && special.charge === 0'), true);
  run("holdSpecial('key:r'); updateSpecial(3);");
  assert.equal(run('special.uses === 4 && special.cooldown === 60 && special.beam !== null && special.quake > 0'), true);
});

test('cooldown lasts 60 gameplay seconds and holding does not automatically repeat', () => {
  const run = game(); unlockRelic(run);
  run("holdSpecial('key:r'); updateSpecial(3); updateSpecial(59.9);");
  assert.equal(run('special.uses === 4 && special.cooldown > 0 && special.charge === 0'), true);
  run('updateSpecial(.2); updateSpecial(3);');
  assert.equal(run('special.uses === 4 && special.cooldown === 0 && special.charge === 0'), true);
  run("releaseSpecial('key:r'); holdSpecial('key:r'); updateSpecial(3);");
  assert.equal(run('special.uses === 3 && special.cooldown === 60'), true);
});

test('only five discharges are possible and the relic cannot refill them', () => {
  const run = game(); unlockRelic(run);
  for (let i = 0; i < 5; i++) {
    run("holdSpecial('key:r'); updateSpecial(3); releaseSpecial('key:r'); updateSpecial(60);");
    assert.equal(run('special.uses'), 4 - i);
  }
  run("collectItem('lightning'); holdSpecial('key:r'); updateSpecial(3);");
  assert.equal(run('special.uses === 0 && special.beam === null && special.charge === 0'), true);
});

test('beam damages aligned enemies once and clears only projectiles in its path', () => {
  const run = game(); unlockRelic(run);
  run("player.x = 500; player.y = 500; enemies = [{x:500,y:150,radius:20,hp:100,heavy:true},{x:800,y:150,radius:20,hp:100,heavy:true},{x:500,y:550,radius:20,hp:100,heavy:true}]; enemyBullets=[{x:500,y:100},{x:800,y:100}]; holdSpecial('key:r'); updateSpecial(3); applySpecialDamage();");
  assert.equal(run('enemies[0].hp === 20 && enemies[1].hp === 100 && enemies[2].hp === 100 && enemyBullets.length === 1'), true);
  assert.equal(run('enemies.push({x:500,y:150,radius:20,hp:20,heavy:false}); applySpecialDamage(); enemies[3].hp <= 0'), true);
  run('enemies = []; wave = 100; beginWave(); boss.x = 500; boss.y = 180; applySpecialDamage(); applySpecialDamage();');
  assert.equal(run('boss.hp'), 900);
});

test('pause and fullscreen cancel partial charges, pause freezes cooldown, restart removes unlock', () => {
  const run = game(); unlockRelic(run);
  run("holdSpecial('key:r'); updateSpecial(2); togglePause(); updateSpecial(20);");
  assert.equal(run('special.charge === 0 && special.uses === 5'), true);
  run("start(); holdSpecial('key:r'); updateSpecial(3); togglePause(); updateSpecial(60);");
  assert.equal(run('special.cooldown'), 60);
  run("start(); updateSpecial(60); releaseSpecial('key:r'); holdSpecial('key:r'); updateSpecial(1); syncFullscreen();");
  assert.equal(run('special.charge === 0 && specialHolds.size === 0'), true);
  run('finish(); start();');
  assert.equal(run('!special.unlocked && special.uses === 0 && !specialDropGranted && !special.beam && special.quake === 0'), true);
});

test('the exclusive relic remains collectible at the bottom across waves', () => {
  const run = game();
  run("wave = 10; beginWave(); boss.y = 150; damageBoss(180); const relic = pickups.find(p => p.type === 'lightning'); relic.y = height - 66; player.x = 28; player.y = 65; player.invulnerable = 100;");
  run('update(2);');
  assert.equal(run("pickups.some(p => p.type === 'lightning' && p.y === height - 65)"), true);
});


test('a boss entering an active beam can be hit after its off-screen entrance', () => {
  const run = game(); unlockRelic(run);
  run("player.x=500; player.y=500; holdSpecial('key:r'); updateSpecial(3); wave=100; beginWave(); boss.x=500; boss.y=-10; applySpecialDamage();");
  assert.equal(run('boss.hp === 1400 && !special.beam.hitTargets.has(boss)'), true);
  assert.equal(run('boss.y=10; applySpecialDamage(); boss.hp'), 900);
});
