(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  let W = 0, H = 0, dpr = 1;
  let running = false, paused = false, last = 0, score = 0;
  let best = Number(localStorage.getItem('neon-dodger-best') || 0);
  let spawnClock = 0, speed = 220, elapsed = 0;
  let moveDir = 0;
  let player = { x: 0, y: 0, w: 30, h: 30, vx: 0 };
  let obstacles = [];
  let particles = [];

  bestEl.textContent = best;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.y = H - 58;
    player.x = Math.min(Math.max(player.x || W / 2, 20), W - 20);
  }
  window.addEventListener('resize', resize);
  resize();

  function reset() {
    score = 0; elapsed = 0; spawnClock = 0; speed = 220;
    obstacles = []; particles = [];
    player.x = W / 2; player.y = H - 58; player.vx = 0;
    scoreEl.textContent = '0';
  }

  function start() {
    reset();
    running = true; paused = false; last = performance.now();
    overlay.style.display = 'none';
    pauseBtn.textContent = 'Ⅱ';
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    if (score > best) {
      best = score;
      localStorage.setItem('neon-dodger-best', String(best));
      bestEl.textContent = best;
    }
    overlayTitle.textContent = 'GAME OVER';
    overlayText.textContent = `최종 점수 ${score.toLocaleString()} · 최고 점수 ${best.toLocaleString()}`;
    startBtn.textContent = '다시 시작';
    overlay.style.display = 'grid';
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    pauseBtn.textContent = paused ? '▶' : 'Ⅱ';
    if (!paused) { last = performance.now(); requestAnimationFrame(loop); }
  }

  function spawn() {
    const size = 18 + Math.random() * 28;
    const margin = 18;
    obstacles.push({
      x: margin + Math.random() * (W - size - margin * 2),
      y: -size - 10,
      w: size,
      h: size,
      vy: speed * (0.82 + Math.random() * 0.5),
      spin: (Math.random() - .5) * 4,
      angle: Math.random() * Math.PI
    });
  }

  function burst(x, y, n = 20) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 50 + Math.random() * 180;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .45 + Math.random() * .5, max: .9, r: 1 + Math.random() * 3 });
    }
  }

  function collide(a, b) {
    return a.x - a.w / 2 < b.x + b.w &&
           a.x + a.w / 2 > b.x &&
           a.y - a.h / 2 < b.y + b.h &&
           a.y + a.h / 2 > b.y;
  }

  function update(dt) {
    elapsed += dt;
    speed = 220 + elapsed * 13;
    score = Math.floor(elapsed * 10);
    scoreEl.textContent = score.toLocaleString();

    player.vx += moveDir * 1700 * dt;
    if (moveDir === 0) player.vx *= Math.pow(.02, dt);
    player.vx = Math.max(-520, Math.min(520, player.vx));
    player.x += player.vx * dt;
    player.x = Math.max(player.w / 2 + 6, Math.min(W - player.w / 2 - 6, player.x));

    spawnClock -= dt;
    const interval = Math.max(.2, .62 - elapsed * .007);
    if (spawnClock <= 0) { spawn(); spawnClock = interval; if (Math.random() < Math.min(.32, elapsed / 70)) spawn(); }

    for (const o of obstacles) { o.y += o.vy * dt; o.angle += o.spin * dt; }
    obstacles = obstacles.filter(o => o.y < H + 80);

    for (const o of obstacles) {
      if (collide(player, o)) {
        burst(player.x, player.y, 34);
        endGame();
        return;
      }
    }

    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 170 * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
  }

  function drawBackground() {
    ctx.fillStyle = '#060914';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(105,233,255,.07)';
    ctx.lineWidth = 1;
    const step = 44;
    const offset = (elapsed * 18) % step;
    for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -step + offset; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const g = ctx.createRadialGradient(W / 2, H * .7, 10, W / 2, H * .7, Math.max(W, H) * .7);
    g.addColorStop(0, 'rgba(105,233,255,.09)'); g.addColorStop(1, 'rgba(105,233,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.vx * .0009);
    ctx.shadowBlur = 22; ctx.shadowColor = '#69e9ff';
    ctx.fillStyle = '#69e9ff';
    ctx.beginPath();
    ctx.roundRect(-player.w / 2, -player.h / 2, player.w, player.h, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#07111e';
    ctx.beginPath(); ctx.arc(0, -2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.save();
      ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
      ctx.rotate(o.angle);
      ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(255,110,135,.45)';
      ctx.fillStyle = '#ff6e87';
      ctx.fillRect(-o.w/2, -o.h/2, o.w, o.h);
      ctx.fillStyle = 'rgba(6,9,20,.5)';
      ctx.fillRect(-o.w/5, -o.h/2, Math.max(2,o.w/8), o.h);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = '#69e9ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPaused() {
    if (!paused) return;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#f8fafc'; ctx.textAlign = 'center'; ctx.font = '800 26px system-ui';
    ctx.fillText('PAUSED', W/2, H/2);
  }

  function draw() {
    drawBackground(); drawObstacles(); drawPlayer(); drawParticles(); drawPaused();
  }

  function loop(now) {
    if (!running) { draw(); return; }
    if (paused) { draw(); return; }
    const dt = Math.min(.035, (now - last) / 1000 || .016);
    last = now;
    update(dt);
    draw();
    if (running) requestAnimationFrame(loop);
  }

  function setDir(value) { moveDir = value; }

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','a','A'].includes(e.key)) { e.preventDefault(); setDir(-1); }
    if (['ArrowRight','d','D'].includes(e.key)) { e.preventDefault(); setDir(1); }
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
    if (e.key === 'Enter' && !running) start();
  });
  window.addEventListener('keyup', (e) => {
    if (['ArrowLeft','a','A','ArrowRight','d','D'].includes(e.key)) setDir(0);
  });

  document.querySelectorAll('.controls button[data-dir]').forEach(btn => {
    const dir = Number(btn.dataset.dir);
    btn.addEventListener('pointerdown', e => { e.preventDefault(); setDir(dir); });
    btn.addEventListener('pointerup', () => setDir(0));
    btn.addEventListener('pointercancel', () => setDir(0));
    btn.addEventListener('pointerleave', () => setDir(0));
  });

  let touchX = null;
  canvas.addEventListener('pointerdown', e => { touchX = e.clientX; });
  canvas.addEventListener('pointermove', e => {
    if (touchX == null || !running || paused) return;
    const dx = e.clientX - touchX;
    if (Math.abs(dx) > 5) { setDir(dx > 0 ? 1 : -1); touchX = e.clientX; }
  });
  canvas.addEventListener('pointerup', () => { touchX = null; setDir(0); });
  canvas.addEventListener('pointercancel', () => { touchX = null; setDir(0); });

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', togglePause);
  draw();
})();
