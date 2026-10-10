'use strict';
/* Kelana Pustaka — game cozy jualan buku keliling (vanilla JS, canvas 1280x720 + lapisan DOM) */
(() => {
const W = 1280, H = 720;
const SAVE_KEY = 'kelana_pustaka_v1', SET_KEY = 'kelana_pustaka_set';
const stage = document.getElementById('stage');
const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const ui = document.getElementById('ui');

const G = { t: 0, scale: 1, rs: 1, scene: null, sceneName: '', token: 0, paused: false,
  set: { anim: true, big: false }, prev: 'map', city: null, keys: {}, joy: { x: 0, y: 0 }, dlgAdvance: null };
let DATA = null, SAVE = null;
const BOOKS = {}, CITY = {}, OLEH = {}, UPG = {};

/* ---------- util ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sub = s => String(s).replace(/\{nama\}/g, SAVE ? SAVE.nama : 'Kamu');
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function hashHue(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }

/* ---------- DOM helper ---------- */
function mk(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  (parent || ui).appendChild(e);
  return e;
}
function btn(text, cls, fn, parent) {
  const b = mk('button', 'btn pe ' + (cls || ''), parent, text);
  b.addEventListener('click', ev => { ev.stopPropagation(); fn(ev); });
  return b;
}
function toast(txt) { const t = mk('div', 'toast np', ui, esc(txt)); setTimeout(() => t.remove(), 2400); }
function modal(builder) {
  const wrap = mk('div', 'catch dim pe', ui);
  const p = mk('div', 'panel modal pe', wrap);
  builder(p, () => wrap.remove());
  return wrap;
}

/* ---------- simpan ---------- */
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* abaikan */ } }
function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1 && s.nama) return s; } catch (e) { /* abaikan */ } return null; }
function saveSet() { try { localStorage.setItem(SET_KEY, JSON.stringify(G.set)); } catch (e) { /* abaikan */ } }
function loadSet() { try { const s = JSON.parse(localStorage.getItem(SET_KEY)); if (s) Object.assign(G.set, s); } catch (e) { /* abaikan */ } stage.classList.toggle('big', !!G.set.big); }
function newGame(nama, karakter) {
  SAVE = { v: 1, nama, karakter, uang: 0, buku: {}, koleksi: [], oleh: [], upgrade: [], misi: {}, kota: {}, introSelesai: false, pos: null, lastCity: null };
  persist();
}

/* ---------- ekonomi ---------- */
function stockTotal() { return Object.values(SAVE.buku).reduce((a, b) => a + b, 0); }
function stockGenre() {
  const o = {}; for (const k in DATA.genre) o[k] = 0;
  for (const t in SAVE.buku) { const b = BOOKS[t]; if (b) o[b.genre] += SAVE.buku[t]; }
  return o;
}
function bonusMult() {
  const titles = Object.keys(SAVE.buku).filter(t => SAVE.buku[t] > 0).length;
  const genres = Object.values(stockGenre()).filter(v => v > 0).length;
  let m = 1 + 0.02 * titles + 0.04 * genres;
  SAVE.oleh.forEach(id => { if (OLEH[id]) m += OLEH[id].bonus || 0; });
  SAVE.upgrade.forEach(id => { if (UPG[id]) m += UPG[id].bonus || 0; });
  return m;
}
function extraCustomers() { return SAVE.upgrade.reduce((a, id) => a + ((UPG[id] && UPG[id].pelanggan) || 0), 0); }
function missionState(C) { return SAVE.misi[C.id] || (SAVE.misi[C.id] = { selesai: [], petunjuk: null }); }
function activeMission(C) { const ms = missionState(C); return C.misi.find(m => !ms.selesai.includes(m.id)) || null; }
function giveOleh(id) { if (SAVE.oleh.includes(id) || !OLEH[id]) return; SAVE.oleh.push(id); toast('Oleh-oleh baru: ' + OLEH[id].nama + '!'); persist(); }
function playerInfo() { return DATA.karakter.find(k => k.id === SAVE.karakter) || DATA.karakter[0]; }

/* ---------- aset gambar ---------- */
const IMG = {};
const EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const isBg = n => /^(pembuka_latar|peta_indonesia|campervan_dalam)$|_latar$/.test(n);

function loadOne(name) {
  return new Promise(res => {
    let i = 0;
    const next = () => {
      if (i >= EXTS.length) { IMG[name] = { ok: false }; res(); return; }
      const im = new Image();
      im.onload = () => { try { IMG[name] = isBg(name) ? { ok: true, src: im, w: im.naturalWidth, h: im.naturalHeight } : cutout(im); } catch (e) { IMG[name] = { ok: true, src: im, w: im.naturalWidth, h: im.naturalHeight }; } res(); };
      im.onerror = () => { i++; next(); };
      im.src = 'assets/' + name + '.' + EXTS[i];
    };
    next();
  });
}

/* hapus latar putih/krem kertas: flood-fill dari tepi, lalu potong ke isi */
function cutout(im) {
  const sc = Math.min(1, 640 / im.naturalHeight);
  const w = Math.max(1, Math.round(im.naturalWidth * sc)), h = Math.max(1, Math.round(im.naturalHeight * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), p = d.data, N = w * h;
  const removed = new Uint8Array(N), st = new Int32Array(N);
  const hasAlpha = p[3] < 200 && p[(w - 1) * 4 + 3] < 200;
  if (hasAlpha) { for (let k = 0; k < N; k++) if (p[k * 4 + 3] < 20) removed[k] = 1; }
  else {
    let br = 0, bg = 0, bb = 0;
    [0, w - 1, (h - 1) * w, N - 1].forEach(k => { br += p[k * 4]; bg += p[k * 4 + 1]; bb += p[k * 4 + 2]; });
    br /= 4; bg /= 4; bb /= 4;
    const T2 = 22 * 22; let sp = 0;
    const push = k => { if (removed[k]) return; const i = k * 4, dr = p[i] - br, dg = p[i + 1] - bg, db = p[i + 2] - bb; if (dr * dr + dg * dg + db * db < T2) { removed[k] = 1; st[sp++] = k; } };
    for (let i = 0; i < w; i++) { push(i); push((h - 1) * w + i); }
    for (let j = 0; j < h; j++) { push(j * w); push(j * w + w - 1); }
    while (sp) { const k = st[--sp], px = k % w; if (px > 0) push(k - 1); if (px < w - 1) push(k + 1); if (k >= w) push(k - w); if (k < N - w) push(k + w); }
  }
  /* buang bercak kecil yang terpisah dari gambar utama */
  const comp = new Int32Array(N), sizes = [0]; let nc = 0, sp2 = 0;
  const visit = q => { if (!removed[q] && !comp[q]) { comp[q] = nc; st[sp2++] = q; } };
  for (let s = 0; s < N; s++) {
    if (removed[s] || comp[s]) continue;
    nc++; let size = 0; comp[s] = nc; st[sp2++] = s;
    while (sp2) { const k = st[--sp2], px = k % w; size++; if (px > 0) visit(k - 1); if (px < w - 1) visit(k + 1); if (k >= w) visit(k - w); if (k < N - w) visit(k + w); }
    sizes[nc] = size;
  }
  const maxS = Math.max(0, ...sizes), minS = Math.max(30, maxS * 0.015);
  for (let k = 0; k < N; k++) if (comp[k] && sizes[comp[k]] < minS) removed[k] = 1;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let k = 0; k < N; k++) {
    const i = k * 4 + 3;
    if (removed[k]) { p[i] = 0; continue; }
    const px = k % w, py = (k / w) | 0;
    if ((px > 0 && removed[k - 1]) || (px < w - 1 && removed[k + 1]) || (py > 0 && removed[k - w]) || (py < h - 1 && removed[k + w])) p[i] = Math.min(p[i], 170);
    if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  if (maxX < 0) return { ok: true, src: im, w: im.naturalWidth, h: im.naturalHeight };
  x.putImageData(d, 0, 0);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const o = document.createElement('canvas'); o.width = bw; o.height = bh;
  o.getContext('2d').drawImage(c, minX, minY, bw, bh, 0, 0, bw, bh);
  return { ok: true, src: o, w: bw, h: bh };
}

function placeholder(c, name, x, y, w, h) {
  const hue = hashHue(name);
  c.save();
  c.fillStyle = `hsl(${hue},55%,84%)`; c.strokeStyle = `hsl(${hue},40%,38%)`; c.lineWidth = 3; c.setLineDash([9, 6]);
  c.fillRect(x, y, w, h); c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); c.setLineDash([]);
  c.fillStyle = '#4a3a2a'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const lines = name.split('_').concat(['.png']);
  const fs = clamp(Math.min(w / 8, h / (lines.length + 1)), 10, 22);
  c.font = `700 ${fs}px sans-serif`;
  lines.forEach((t, i) => c.fillText(t, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.2, w - 6));
  c.restore();
}
function drawSprite(c, name, x, fy, size, o = {}) {
  const im = IMG[name]; let w, h;
  if (im && im.ok) { if (o.byWidth) { w = size; h = size * im.h / im.w; } else { h = size; w = size * im.w / im.h; } }
  else { const asp = o.asp || 0.55; if (o.byWidth) { w = size; h = size / asp; } else { h = size; w = size * asp; } }
  c.save(); c.translate(x, fy + (o.dy || 0));
  if (o.flip) c.scale(-1, 1);
  if (o.breath && G.set.anim) c.scale(1, 1 + 0.014 * Math.sin(G.t * 2.2 + (o.ph || 0)));
  if (o.alpha != null) c.globalAlpha = o.alpha;
  if (im && im.ok) c.drawImage(im.src, -w / 2, -h, w, h); else placeholder(c, name, -w / 2, -h, w, h);
  c.restore();
  return { w, h };
}
function drawBg(c, name) {
  const im = IMG[name];
  if (im && im.ok) { const s = Math.max(W / im.w, H / im.h), dw = im.w * s, dh = im.h * s; c.drawImage(im.src, (W - dw) / 2, (H - dh) / 2, dw, dh); }
  else {
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#cfe5ea'); gr.addColorStop(0.6, '#f1e6c9'); gr.addColorStop(1, '#d8c79d');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(60,50,40,.55)'; c.font = '700 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('[ ' + name + '.png ]', W / 2, H * 0.3);
  }
}
function bookGlyph(x, col, w, h) {
  x.fillStyle = col; rr(x, w * .12, h * .06, w * .76, h * .88, Math.min(w, h) * .1); x.fill();
  x.strokeStyle = 'rgba(60,40,30,.6)'; x.lineWidth = Math.max(2, w * .04); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(w * .2, h * .3, w * .6, h * .1); x.fillRect(w * .2, h * .5, w * .45, h * .07);
}
function spriteCanvas(name, hpx, asp) {
  const im = IMG[name], k = 1.6, c = document.createElement('canvas'); let w;
  if (im && im.ok) { w = Math.round(im.w * hpx / im.h); c.width = Math.round(w * k); c.height = Math.round(hpx * k); c.getContext('2d').drawImage(im.src, 0, 0, c.width, c.height); }
  else {
    w = Math.round(hpx * (asp || 0.8)); c.width = Math.round(w * k); c.height = Math.round(hpx * k);
    const x = c.getContext('2d'), gk = Object.keys(DATA.genre).find(q => DATA.genre[q].ikon === name);
    if (gk) bookGlyph(x, DATA.genre[gk].warna, c.width, c.height); else placeholder(x, name, 0, 0, c.width, c.height);
  }
  c.style.width = w + 'px'; c.style.height = hpx + 'px';
  return c;
}
function chip(c, text, x, y) {
  c.save(); c.font = '700 22px "Baloo 2",sans-serif';
  const w = c.measureText(text).width + 26, b = Math.sin(G.t * 3 + x) * 3;
  rr(c, x - w / 2, y - 34 + b, w, 32, 11); c.fillStyle = 'rgba(251,243,225,.95)'; c.fill();
  c.lineWidth = 2.5; c.strokeStyle = '#8b6b4a'; c.stroke();
  c.fillStyle = '#4a3524'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y - 17 + b);
  c.restore();
}

/* ---------- langit: awan & burung ---------- */
function drawCloud(c, x, y, s, a) {
  c.save(); c.globalAlpha = a;
  const blobs = [[0, 0, 46], [48, -16, 40], [96, 0, 46], [48, 12, 42], [-34, 12, 30], [134, 12, 30]];
  c.fillStyle = '#e6edf2'; c.beginPath();
  blobs.forEach(([dx, dy, r]) => { c.moveTo(x + (dx + r) * s, y + (dy + 8) * s); c.arc(x + dx * s, y + (dy + 8) * s, r * s, 0, 6.2832); }); c.fill();
  c.fillStyle = '#fff'; c.beginPath();
  blobs.forEach(([dx, dy, r]) => { c.moveTo(x + (dx + r) * s, y + dy * s); c.arc(x + dx * s, y + dy * s, r * s, 0, 6.2832); }); c.fill();
  c.restore();
}
const sky = {
  clouds: [], birds: [], nb: 3,
  init() { this.clouds = []; for (let i = 0; i < 8; i++) this.clouds.push({ x: rnd(0, W + 700), fy: Math.random(), s: rnd(0.7, 1.5), v: rnd(5, 14), a: rnd(0.4, 0.7) }); },
  update(dt) {
    if (!G.set.anim) { this.birds.length = 0; return; }
    this.clouds.forEach(c => c.x += c.v * dt);
    this.nb -= dt;
    if (this.nb <= 0) {
      this.nb = rnd(5, 13);
      const dir = Math.random() < 0.5 ? 1 : -1, y = rnd(50, 230), v = dir * rnd(90, 140), x = dir > 0 ? -40 : W + 40;
      this.birds.push({ x, y, v, ph: rnd(0, 6), s: rnd(0.8, 1.3), a: rnd(0, 6) });
      if (Math.random() < 0.5) this.birds.push({ x: x - dir * 55, y: y + rnd(10, 30), v, ph: rnd(0, 6), s: 0.8, a: rnd(0, 6) });
    }
    this.birds.forEach(b => { b.x += b.v * dt; b.a += dt; });
    this.birds = this.birds.filter(b => b.x > -120 && b.x < W + 120);
  },
  draw(c, o = {}) {
    const f = o.f || 0, cx = (o.camX || 0) * f, cy = (o.camY || 0) * f, sp = o.spanY || 300, al = o.alpha == null ? 1 : o.alpha;
    const rx = W + 700, ry = sp + 300;
    for (const cl of this.clouds) {
      const x = ((cl.x - cx) % rx + rx) % rx - 350;
      const y = f ? (((cl.fy * sp - cy) % ry + ry) % ry - 150) : (20 + cl.fy * (sp - 20));
      drawCloud(c, x, y, cl.s, cl.a * al);
    }
  },
  drawBirds(c) {
    for (const b of this.birds) {
      const y = b.y + Math.sin(b.a * 1.5) * 12, f = Math.sin(G.t * 9 + b.ph), s = b.s;
      c.strokeStyle = 'rgba(55,60,75,.85)'; c.lineWidth = 3 * s; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(b.x - 16 * s, y - 8 * s * f - 2);
      c.quadraticCurveTo(b.x - 7 * s, y - 6 * s * f - 6 * s, b.x, y);
      c.quadraticCurveTo(b.x + 7 * s, y - 6 * s * f - 6 * s, b.x + 16 * s, y - 8 * s * f - 2);
      c.stroke();
    }
  }
};

/* ---------- input ---------- */
function inputVec() {
  const k = G.keys;
  let x = (k.arrowright || k.d ? 1 : 0) - (k.arrowleft || k.a ? 1 : 0);
  let y = (k.arrowdown || k.s ? 1 : 0) - (k.arrowup || k.w ? 1 : 0);
  if (!x && !y) { x = G.joy.x; y = G.joy.y; if (Math.hypot(x, y) < 0.15) { x = 0; y = 0; } }
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  return { x, y };
}
function joystick() {
  const j = mk('div', 'joy pe', ui), k = mk('div', 'knob', j), R = 58; let pid = null;
  const upd = e => {
    const r = j.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / G.scale, dy = (e.clientY - (r.top + r.height / 2)) / G.scale;
    const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    k.style.transform = `translate(${dx}px,${dy}px)`; G.joy.x = dx / R; G.joy.y = dy / R;
  };
  const end = () => { pid = null; k.style.transform = 'translate(0,0)'; G.joy.x = 0; G.joy.y = 0; };
  j.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; j.setPointerCapture(pid); upd(e); });
  j.addEventListener('pointermove', e => { if (e.pointerId === pid) upd(e); });
  j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
}
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); G.keys[k] = true;
  if ((k === ' ' || k === 'enter') && G.dlgAdvance) { G.dlgAdvance(); e.preventDefault(); return; }
  if (k === 'enter' && G.sceneName === 'map' && SCENES.map.near) SCENES.map.enterCity();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
addEventListener('keyup', e => { G.keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { G.keys = {}; });
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
  if (G.scene && G.scene.tap && !G.paused) G.scene.tap(x, y);
});

/* ---------- dialog ---------- */
function dialog(lines) {
  const tok = G.token;
  return new Promise(resolve => {
    let i = 0, typing = false, full = '', pos = 0, timer = null, locked = false;
    const catcher = mk('div', 'catch cd pe', ui);
    const box = mk('div', 'dlg pe', ui);
    const nameEl = mk('div', 'dlg-name', box), textEl = mk('div', 'dlg-text', box), nx = mk('div', 'dlg-next', box, '▼'), chW = mk('div', 'dlg-choices', box);
    const cur = () => { const L = lines[i]; return typeof L === 'string' ? { text: L } : L; };
    function finish(val) { clearInterval(timer); G.dlgAdvance = null; catcher.remove(); box.remove(); resolve(val); }
    function afterType(o) {
      if (o.choices) { locked = true; o.choices.forEach((c, k) => btn(c, 'sm', () => finish(k), chW)); }
      else nx.style.visibility = 'visible';
    }
    function show() {
      const o = cur(), who = o.who === '{nama}' ? SAVE.nama : (o.who || '');
      nameEl.textContent = who; nameEl.style.display = who ? 'block' : 'none';
      box.classList.toggle('narr', !who);
      full = sub(o.text); pos = 0; typing = true; textEl.textContent = ''; nx.style.visibility = 'hidden'; chW.innerHTML = '';
      clearInterval(timer);
      timer = setInterval(() => {
        if (tok !== G.token) { finish(); return; }
        pos += 2; textEl.textContent = full.slice(0, pos);
        if (pos >= full.length) { typing = false; clearInterval(timer); afterType(o); }
      }, 28);
    }
    function advance() {
      if (locked) return;
      if (typing) { clearInterval(timer); typing = false; textEl.textContent = full; afterType(cur()); return; }
      i++; if (i >= lines.length) finish(); else show();
    }
    G.dlgAdvance = advance;
    catcher.addEventListener('click', advance); box.addEventListener('click', advance);
    show();
  });
}

function showLetter() {
  return new Promise(res => {
    const wrap = mk('div', 'catch dim pe', ui), p = mk('div', 'letter pe', wrap), L = DATA.surat;
    mk('h3', '', p, esc(L.judul));
    L.isi.forEach(t => mk('p', '', p, esc(sub(t))));
    mk('div', 'ttd', p, esc(L.ttd));
    mk('div', 'keyrow', p, '🔑 Sebuah kunci tua ikut terselip di dalam amplop.');
    btn('Simpan surat dan kunci', '', () => { wrap.remove(); res(); }, p);
  });
}

/* ---------- HUD, jeda, pengaturan ---------- */
function hud(extra) {
  const h = mk('div', 'hud', ui);
  mk('div', 'coin pe', h, '<i></i><b id="coinv">' + SAVE.uang + '</b>');
  btn('Jeda', 'sm sec', showPause, h);
  let r = null;
  if (extra && extra.length) { r = mk('div', 'hudr', ui); extra.forEach(e => btn(e.t, 'sm', e.fn, r)); }
  return { h, r };
}
function setCoins() { const e = document.getElementById('coinv'); if (e) e.textContent = SAVE.uang; }
function showPause() {
  if (G.paused) return;
  G.paused = true;
  modal((p, close) => {
    mk('h2', '', p, 'Jeda');
    btn('Lanjut', '', () => { G.paused = false; close(); }, p);
    btn('Pengaturan', 'sec', openSettings, p);
    btn('Simpan dan menu utama', 'sec', () => { G.paused = false; persist(); go('title'); }, p);
  });
}
function openSettings() {
  modal((p, close) => {
    mk('h2', '', p, 'Pengaturan');
    const lab = () => 'Awan dan burung: ' + (G.set.anim ? 'hidup' : 'mati');
    const b1 = btn(lab(), 'sec sm', () => { G.set.anim = !G.set.anim; saveSet(); b1.textContent = lab(); }, p);
    const lab2 = () => 'Ukuran teks: ' + (G.set.big ? 'besar' : 'normal');
    const b2 = btn(lab2(), 'sec sm', () => { G.set.big = !G.set.big; stage.classList.toggle('big', G.set.big); saveSet(); b2.textContent = lab2(); }, p);
    btn('Layar penuh', 'sec sm', () => { const d = document.documentElement; try { if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen(); } catch (e) { /* abaikan */ } }, p);
    btn('Hapus semua progres', 'sec sm', () => {
      if (confirm('Hapus semua progres? Ini tidak bisa dibatalkan.')) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* abaikan */ } SAVE = null; go('title'); }
    }, p);
    btn('Tutup', '', close, p);
  });
}
function openCredits() {
  modal((p, close) => {
    mk('h2', '', p, 'Kredit');
    mk('p', '', p, 'Kelana Pustaka dibuat dengan cinta untuk Indonesia.<br>Ilustrasi gouache: karya pembuat game.<br>Cerita, dialog, dan kode: orisinal.');
    mk('p', '', p, '<small>Pola mekanik terinspirasi game “A Tiny Bookshop”. Semua cerita, teks, dan seni di sini dibuat sendiri.</small>');
    btn('Tutup', '', close, p);
  });
}

/* ---------- pindah scene ---------- */
const SCENES = {};
function go(name, arg) {
  if (G.scene && G.scene.exit) G.scene.exit();
  G.token++; G.paused = false; G.dlgAdvance = null; G.joy.x = G.joy.y = 0;
  ui.innerHTML = '';
  G.scene = SCENES[name]; G.sceneName = name;
  G.scene.enter(arg);
}
function openVan(from) { G.prev = from; go('van'); }

/* =========================================================
   SCENE: LAYAR PEMBUKA
   ========================================================= */
SCENES.title = {
  enter() {
    mk('div', 'title np', ui, '<small>Lapak Buku Keliling</small><h1>Kelana<br>Pustaka</h1>');
    const m = mk('div', 'menu', ui);
    if (SAVE) btn('Lanjutkan', '', () => go(SAVE.introSelesai ? 'map' : 'story'), m);
    btn('Mulai Main', SAVE ? 'sec' : '', () => {
      if (!SAVE) { go('char'); return; }
      modal((p, close) => {
        mk('h2', '', p, 'Mulai dari awal?');
        mk('p', '', p, 'Progres lama akan terhapus.');
        btn('Ya, mulai baru', '', () => { close(); go('char'); }, p);
        btn('Batal', 'sec', close, p);
      });
    }, m);
    btn('Pengaturan', 'sec', openSettings, m);
    btn('Kredit', 'sec', openCredits, m);
  },
  update(dt) { sky.update(dt); },
  draw(c) {
    drawBg(c, 'pembuka_latar');
    sky.draw(c, { spanY: 300, alpha: 0.8 });
    drawSprite(c, 'campervan', 270, 692, 430, { byWidth: true, breath: true });
    sky.drawBirds(c);
  }
};

/* =========================================================
   SCENE: PILIH KARAKTER
   ========================================================= */
SCENES.char = {
  enter() {
    this.sel = 0;
    const wrap = mk('div', 'csel', ui);
    mk('h2', 'np', wrap, 'Pilih Penjual Bukumu');
    btn('Kembali', 'sm sec back', () => go('title'), wrap);
    const row = mk('div', 'cards', wrap), cards = [];
    DATA.karakter.forEach((k, i) => {
      const c = mk('div', 'ccard pe' + (i === 0 ? ' sel' : ''), row), img = mk('div', 'cimg', c);
      img.appendChild(spriteCanvas(k.id, Math.round(300 * k.tinggi), 0.5));
      mk('div', 'cn', c, esc(k.nama));
      c.addEventListener('click', () => { this.sel = i; cards.forEach((q, j) => q.classList.toggle('sel', j === i)); });
      cards.push(c);
    });
    const bar = mk('div', 'cbar', wrap);
    const inp = mk('input', 'pe', bar); inp.maxLength = 14; inp.placeholder = 'Tulis namamu…'; inp.autocomplete = 'off';
    btn('Berangkat!', '', () => {
      const n = inp.value.trim();
      if (!n) { toast('Isi namamu dulu, ya!'); inp.focus(); return; }
      newGame(n, DATA.karakter[this.sel].id); go('story');
    }, bar);
  },
  update(dt) { sky.update(dt); },
  draw(c) {
    drawBg(c, 'pembuka_latar');
    c.fillStyle = 'rgba(70,55,40,.28)'; c.fillRect(0, 0, W, H);
    sky.draw(c, { spanY: 300, alpha: 0.5 });
    sky.drawBirds(c);
  }
};

/* =========================================================
   SCENE: CERITA PEMBUKA
   ========================================================= */
SCENES.story = {
  enter() {
    this.show = [];
    const r = mk('div', 'hudr', ui);
    btn('Lewati', 'sm sec', () => { SAVE.introSelesai = true; persist(); go('map'); }, r);
    this.run();
  },
  async run() {
    const tok = G.token;
    for (const sc of DATA.cerita) {
      if (tok !== G.token) return;
      if (sc.surat) { this.show = ['pemain']; await showLetter(); }
      else { this.show = sc.tampil; await dialog(sc.baris); }
    }
    if (tok !== G.token) return;
    SAVE.introSelesai = true; persist(); go('map');
  },
  update(dt) { sky.update(dt); },
  draw(c) {
    drawBg(c, 'pembuka_latar');
    sky.draw(c, { spanY: 300, alpha: 0.7 });
    const s = this.show, pi = playerInfo();
    if (s.includes('van')) drawSprite(c, 'campervan', 900, 560, 520, { byWidth: true, breath: true });
    if (s.includes('tetangga')) drawSprite(c, 'pembeli_1', 900, 548, 300 * 0.93, { breath: true, flip: true, ph: 1 });
    if (s.includes('pemain')) drawSprite(c, SAVE.karakter, 360, 548, 300 * pi.tinggi, { breath: true });
    sky.drawBirds(c);
  }
};

/* =========================================================
   SCENE: PETA DUNIA
   ========================================================= */
function drawPin(c, ct, x, y, near) {
  const b = Math.sin(G.t * 2.4 + ct.map.x * 50) * 4;
  c.save(); c.translate(x, y + b);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(0, 4 - b, 16, 6, 0, 0, 6.3); c.fill();
  c.fillStyle = near ? '#ff8f6b' : '#e2674a'; c.strokeStyle = '#7a3b2a'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-30, -34, -26, -66, 0, -66); c.bezierCurveTo(26, -66, 30, -34, 0, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(0, -44, 11, 0, 6.3); c.fill();
  c.font = '800 26px "Baloo 2",sans-serif'; const tw = c.measureText(ct.nama).width;
  rr(c, -tw / 2 - 12, -112, tw + 24, 38, 12); c.fillStyle = 'rgba(251,243,225,.96)'; c.fill(); c.strokeStyle = '#8b6b4a'; c.lineWidth = 2.5; c.stroke();
  c.fillStyle = '#4a3524'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ct.nama, 0, -92);
  if (near) { c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 4; c.setLineDash([10, 8]); c.beginPath(); c.arc(0, -b, 60 + Math.sin(G.t * 4) * 4, 0, 6.3); c.stroke(); }
  c.restore();
}
SCENES.map = {
  enter() {
    const Pm = DATA.peta; this.WW = Pm.lebarDunia; this.WH = Pm.tinggiDunia;
    this.van = SAVE.pos ? { x: SAVE.pos.x, y: SAVE.pos.y } : { x: Pm.mulai.x * this.WW, y: Pm.mulai.y * this.WH };
    this.vx = 0; this.vy = 0; this.face = 1; this.target = null; this.near = null; this.cam = { x: 0, y: 0 };
    this.camTo(true, 0);
    hud([{ t: 'Van', fn: () => { SAVE.pos = { x: this.van.x, y: this.van.y }; persist(); openVan('map'); } }]);
    joystick();
    this.eb = btn('', 'enter', () => this.enterCity(), ui); this.eb.style.display = 'none';
    const info = mk('div', 'mhint np', ui, 'Setir pakai joystick, atau ketuk peta. Dekati pin kota.');
    setTimeout(() => info.remove(), 7000);
    if (!SAVE.hintFeri) { SAVE.hintFeri = true; persist(); setTimeout(() => toast('Tenang, van ini bisa nyeberang laut. Kata Mbah, ada feri gaib.'), 1200); }
  },
  camTo(snap, dt) {
    const tx = clamp(this.van.x - W / 2, 0, this.WW - W), ty = clamp(this.van.y - H / 2, 0, this.WH - H);
    if (snap) { this.cam.x = tx; this.cam.y = ty; } else { const k = Math.min(1, dt * 5); this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; }
  },
  enterCity() {
    if (!this.near) return;
    SAVE.pos = { x: this.van.x, y: this.van.y }; G.city = this.near.id; SAVE.lastCity = G.city; persist();
    go('city');
  },
  update(dt) {
    sky.update(dt);
    if (G.paused) return;
    const iv = inputVec(); let ax = iv.x, ay = iv.y;
    if (ax || ay) this.target = null;
    else if (this.target) {
      const dx = this.target.x - this.van.x, dy = this.target.y - this.van.y, d = Math.hypot(dx, dy);
      if (d < 12) this.target = null; else { const s = Math.min(1, d / 90); ax = dx / d * s; ay = dy / d * s; }
    }
    const sp = 430, k = Math.min(1, dt * 6);
    this.vx += (ax * sp - this.vx) * k; this.vy += (ay * sp - this.vy) * k;
    this.van.x = clamp(this.van.x + this.vx * dt, 80, this.WW - 80);
    this.van.y = clamp(this.van.y + this.vy * dt, 80, this.WH - 80);
    if (Math.abs(this.vx) > 25) this.face = this.vx > 0 ? 1 : -1;
    this.camTo(false, dt);
    let best = null, bd = 130;
    DATA.kota.forEach(c => { const d = Math.hypot(c.map.x * this.WW - this.van.x, c.map.y * this.WH - this.van.y); if (d < bd) { bd = d; best = c; } });
    if (best !== this.near) {
      this.near = best;
      if (best) { this.eb.textContent = 'Masuk ' + best.nama; this.eb.style.display = 'block'; } else this.eb.style.display = 'none';
    }
  },
  tap(x, y) {
    const wx = this.cam.x + x, wy = this.cam.y + y;
    for (const ct of DATA.kota) {
      const px = ct.map.x * this.WW, py = ct.map.y * this.WH;
      if (Math.hypot(wx - px, wy - (py - 50)) < 60) {
        if (this.near === ct) { this.enterCity(); return; }
        this.target = { x: px, y: py + 5 }; return;
      }
    }
    this.target = { x: wx, y: wy };
  },
  draw(c) {
    const im = IMG.peta_indonesia, cx = this.cam.x, cy = this.cam.y;
    if (im && im.ok) c.drawImage(im.src, cx / this.WW * im.w, cy / this.WH * im.h, W / this.WW * im.w, H / this.WH * im.h, 0, 0, W, H);
    else {
      c.fillStyle = '#9fd0dc'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
      for (let gx = -(cx % 200); gx < W; gx += 200) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); }
      for (let gy = -(cy % 200); gy < H; gy += 200) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }
      c.fillStyle = 'rgba(60,50,40,.6)'; c.font = '700 30px sans-serif'; c.textAlign = 'center'; c.fillText('[ peta_indonesia.png ]', W / 2, 80);
    }
    sky.draw(c, { f: 1.2, camX: cx, camY: cy, spanY: H, alpha: 0.5 });
    DATA.kota.forEach(ct => {
      const x = ct.map.x * this.WW - cx, y = ct.map.y * this.WH - cy;
      if (x < -150 || x > W + 150 || y < -50 || y > H + 150) return;
      drawPin(c, ct, x, y, this.near === ct);
    });
    if (this.target) {
      const tx = this.target.x - cx, ty = this.target.y - cy;
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4; c.setLineDash([8, 6]); c.beginPath(); c.arc(tx, ty, 16 + Math.sin(G.t * 6) * 3, 0, 6.3); c.stroke(); c.setLineDash([]);
    }
    const vx = this.van.x - cx, vy = this.van.y - cy, mv = Math.min(1, Math.hypot(this.vx, this.vy) / 200);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(vx, vy + 2, 78, 11, 0, 0, 6.3); c.fill();
    drawSprite(c, 'campervan', vx, vy, 170, { byWidth: true, flip: this.face < 0, dy: Math.sin(G.t * 16) * 2 * mv });
    sky.drawBirds(c);
  }
};

/* =========================================================
   MISI & NPC
   ========================================================= */
async function talkNPC(C, tok) {
  const st = SAVE.kota[C.id] || (SAVE.kota[C.id] = {}), N = C.npc;
  if (!st.sapa) {
    st.sapa = true; persist();
    await dialog(N.sapaan); if (tok !== G.token) return;
    (C.oleh_oleh || []).filter(o => o.dari === 'npc').forEach(o => giveOleh(o.id));
  }
  const act = activeMission(C), ms = missionState(C);
  if (!act) { await dialog(N.semua); return; }
  if (ms.petunjuk !== act.id) { ms.petunjuk = act.id; persist(); await dialog(act.petunjuk); }
  else await dialog([{ who: N.nama, text: pick(N.ulang) }, { who: N.nama, text: act.ringkas }]);
}
function openPicker(C, act) {
  return new Promise(res => {
    const covers = ['#f3c9a6', '#bcd9b8', '#c9c0e3', '#f0dea0'];
    const choices = shuffle([act.buku.judul].concat(act.pilihan));
    const wrap = mk('div', 'catch dim pe', ui), p = mk('div', 'panel picker pe', wrap);
    mk('h2', '', p, esc(C.lokasi.nama));
    mk('div', 'clue', p, 'Petunjuk: ' + esc(act.ringkas));
    const msg = mk('div', 'msg', p), row = mk('div', 'pickrow', p);
    choices.forEach((t, i) => {
      const card = mk('div', 'bookcover pe', row, '<span>' + esc(t) + '</span>');
      card.style.background = covers[i % covers.length];
      card.addEventListener('click', e => {
        e.stopPropagation();
        if (t === act.buku.judul) { wrap.remove(); res(true); }
        else { msg.textContent = act.salah; card.classList.add('off'); row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
      });
    });
    btn('Nanti dulu', 'sm sec', () => { wrap.remove(); res(false); }, p);
  });
}
async function visitLoc(C, tok) {
  const st = SAVE.kota[C.id] || (SAVE.kota[C.id] = {}), L = C.lokasi, ms = missionState(C), act = activeMission(C);
  if (!act) { await dialog(L.kosong); return; }
  if (ms.petunjuk !== act.id) { await dialog(L.belum); return; }
  if (!st.lokasi) { st.lokasi = true; persist(); await dialog(L.sambutan); } else await dialog(L.kembali);
  if (tok !== G.token) return;
  const ok = await openPicker(C, act);
  if (tok !== G.token || !ok) return;
  await completeMission(C, act, tok);
}
async function completeMission(C, act, tok) {
  const ms = missionState(C), j = act.buku.judul, n = act.salinan || 3;
  ms.selesai.push(act.id); ms.petunjuk = null;
  SAVE.buku[j] = (SAVE.buku[j] || 0) + n;
  if (!SAVE.koleksi.includes(j)) SAVE.koleksi.push(j);
  (C.oleh_oleh || []).filter(o => o.dari === 'misi:' + act.id).forEach(o => giveOleh(o.id));
  persist();
  await dialog(act.selesai); if (tok !== G.token) return;
  toast('+' + n + ' buku: ' + j);
  const r = await dialog([{ who: '', text: 'Rakmu sudah terisi. Mau buka lapak sekarang?', choices: ['Buka lapak!', 'Nanti dulu'] }]);
  if (tok !== G.token) return;
  if (r === 0) go('sell');
}
async function openStall(C, tok) {
  if (stockTotal() === 0) { await dialog([{ who: '', text: 'Rak vanmu masih kosong. Cari buku lewat misi dulu, atau kulakan di dalam van kalau sudah punya koleksi.' }]); return; }
  go('sell');
}

/* =========================================================
   SCENE: JELAJAH KOTA
   ========================================================= */
SCENES.city = {
  enter() {
    const C = CITY[G.city]; this.C = C;
    hud([{ t: 'Peta', fn: () => go('map') }, { t: 'Van', fn: () => openVan('city') }]);
    joystick();
    this.px = 560; this.face = 1; this.target = null; this.pending = null; this.busy = false; this.moving = false;
    this.ground = 640; this.vanX = 210; this.npcX = C.npc.x * W; this.locX = C.lokasi.x * W;
    const tip = mk('div', 'tip np', ui, 'Ketuk warga, bangunan, atau van.'); setTimeout(() => tip.remove(), 6000);
    const st = SAVE.kota[C.id] || (SAVE.kota[C.id] = {});
    if (!st.datang) { st.datang = true; persist(); this.busy = true; dialog(C.datang).then(() => { this.busy = false; }); }
  },
  async interact(type) {
    this.busy = true; const tok = G.token;
    try {
      if (type === 'npc') await talkNPC(this.C, tok);
      else if (type === 'loc') await visitLoc(this.C, tok);
      else if (type === 'van') await openStall(this.C, tok);
    } catch (e) { console.error(e); }
    if (tok === G.token) this.busy = false;
  },
  goTo(tx, type, off) {
    const t = clamp(tx + (this.px < tx ? -off : off), 90, W - 90);
    if (Math.abs(t - this.px) < 8) { this.target = null; this.interact(type); return; }
    this.target = t; this.pending = type;
  },
  tap(x, y) {
    if (G.paused || this.busy) return;
    const C = this.C, gy = this.ground, nh = 300 * C.npc.tinggi, lh = H * C.lokasi.tinggi;
    if (Math.abs(x - this.npcX) < 90 && y > gy - nh && y < gy + 20) return this.goTo(this.npcX, 'npc', 110);
    if (Math.abs(x - this.locX) < lh && y > 612 - lh && y < 640) return this.goTo(this.locX, 'loc', 0);
    if (x < this.vanX + 190 && y > 400 && y < gy + 20) return this.goTo(this.vanX + 240, 'van', 0);
    this.target = clamp(x, 90, W - 90); this.pending = null;
  },
  update(dt) {
    sky.update(dt);
    if (G.paused || this.busy) { this.moving = false; return; }
    const iv = inputVec(); let ax = Math.abs(iv.x) > 0.12 ? iv.x : 0, moving = false;
    if (ax) { this.target = null; this.pending = null; this.px += ax * 320 * dt; this.face = ax > 0 ? 1 : -1; moving = true; }
    else if (this.target != null) {
      const d = this.target - this.px;
      if (Math.abs(d) < 6) { this.target = null; if (this.pending) { const p = this.pending; this.pending = null; this.interact(p); } }
      else { this.px += Math.sign(d) * Math.min(Math.abs(d), 320 * dt); this.face = d > 0 ? 1 : -1; moving = true; }
    }
    this.px = clamp(this.px, 90, W - 90); this.moving = moving;
  },
  draw(c) {
    const C = this.C, pi = playerInfo(), gy = this.ground;
    drawBg(c, C.latar);
    sky.draw(c, { spanY: 260, alpha: 0.8 });
    drawSprite(c, C.lokasi.gambar, this.locX, 612, H * C.lokasi.tinggi, { asp: 1.9 });
    drawSprite(c, 'campervan', this.vanX, 650, 360, { byWidth: true, breath: true });
    drawSprite(c, C.npc.gambar, this.npcX, gy, 300 * C.npc.tinggi, { breath: true, ph: 2, flip: this.px < this.npcX });
    drawSprite(c, SAVE.karakter, this.px, gy + 8, 300 * pi.tinggi, { breath: !this.moving, flip: this.face < 0, dy: this.moving ? -Math.abs(Math.sin(G.t * 10)) * 6 : 0 });
    c.font = '700 20px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(60,45,30,.85)'; c.fillText(SAVE.nama, this.px, gy + 8 - 300 * pi.tinggi - 6);
    if (!this.busy) {
      chip(c, C.npc.nama, this.npcX, gy - 300 * C.npc.tinggi - 6);
      chip(c, C.lokasi.nama, this.locX, 612 - H * C.lokasi.tinggi - 4);
      chip(c, 'Van dan Lapak', this.vanX, 650 - 215);
    }
    sky.drawBirds(c);
  }
};

/* =========================================================
   SCENE: JUALAN (menebak keinginan pembeli)
   ========================================================= */
function drawHeart(c, x, y, s, a) {
  c.save(); c.globalAlpha = a; c.fillStyle = '#e2556f'; c.translate(x, y); c.scale(s, s);
  c.beginPath(); c.moveTo(0, 6); c.bezierCurveTo(-14, -4, -8, -16, 0, -8); c.bezierCurveTo(8, -16, 14, -4, 0, 6); c.fill(); c.restore();
}
function drawTable(c, x, y, w) {
  c.save();
  c.fillStyle = '#e9a8a0'; c.strokeStyle = '#8b5a4a'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(x + 6, y + 14); c.lineTo(x + w - 6, y + 14); c.lineTo(x + w - 14, y + 70); c.lineTo(x + 14, y + 70); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.6)';
  for (let i = 0; i < 6; i++) c.fillRect(x + 22 + i * (w - 44) / 6, y + 18, (w - 44) / 12, 48);
  c.fillStyle = '#c79a6b'; c.strokeStyle = '#7a5c3e'; rr(c, x, y, w, 16, 6); c.fill(); c.stroke();
  c.fillStyle = '#9a7248'; c.fillRect(x + 20, y + 70, 10, 24); c.fillRect(x + w - 30, y + 70, 10, 24);
  c.restore();
}
SCENES.sell = {
  enter() {
    if (stockTotal() === 0) { toast('Rak kosong. Cari buku atau kulakan dulu.'); go('city'); return; }
    this.C = CITY[G.city]; this.over = false;
    const hh = hud();
    btn('Tutup Lapak', 'sm sec', () => this.finish(), hh.h);
    this.info = mk('div', 'chip', hh.h);
    this.n = 6 + extraCustomers(); this.done = 0; this.earned = 0; this.sold = 0;
    this.cust = null; this.phase = 'gap'; this.timer = 0.8; this.floats = []; this.bub = null;
    this.panel = mk('div', 'spanel', ui); this.tray = mk('div', 'tray pe', ui);
    this.buildPanel(); this.buildTray(); this.updInfo();
  },
  updInfo() { this.info.textContent = 'Pembeli ' + Math.min(this.done + (this.cust ? 1 : 0), this.n) + '/' + this.n + ' · Bonus ×' + bonusMult().toFixed(2); },
  buildPanel() {
    const p = this.panel, sg = stockGenre(); p.innerHTML = '';
    const h4 = mk('h4', '', p); h4.appendChild(spriteCanvas('buku_tumpuk', 30, 1)); h4.insertAdjacentHTML('beforeend', 'Stok Buku');
    Object.keys(DATA.genre).forEach(k => {
      const gd = DATA.genre[k], row = mk('div', 'grow' + (sg[k] ? '' : ' zero'), p);
      row.style.setProperty('--col', gd.warna);
      row.appendChild(spriteCanvas(gd.ikon, 32, 0.8));
      row.insertAdjacentHTML('beforeend', '<span>' + esc(gd.nama) + '</span><b>' + sg[k] + '</b>');
    });
  },
  buildTray() {
    const old = this.tray.scrollLeft; this.tray.innerHTML = '';
    SAVE.koleksi.filter(t => SAVE.buku[t] > 0).forEach(t => {
      const b = BOOKS[t], gd = DATA.genre[b.genre], d = mk('div', 'bk pe', this.tray);
      d.style.setProperty('--col', gd.warna);
      d.appendChild(spriteCanvas(gd.ikon, 56, 0.8));
      mk('div', 'bt', d, esc(t)); mk('b', 'cnt', d, '×' + SAVE.buku[t]);
      d.addEventListener('click', e => { e.stopPropagation(); this.pickBook(t); });
    });
    this.tray.scrollLeft = old;
  },
  spawn() {
    const sg = stockGenre(), avail = Object.keys(sg).filter(k => sg[k] > 0);
    const groups = Object.keys(DATA.selera).filter(gr => DATA.selera[gr].some(x => avail.includes(x)));
    const gr = pick(groups), type = pick(DATA.pembeli.filter(p => p.grup === gr));
    const genre = pick(DATA.selera[gr].filter(x => avail.includes(x)));
    const side = Math.random() < 0.5 ? 'left' : 'right', standX = side === 'left' ? 330 : 600;
    this.cust = { type, genre, side, standX, x: side === 'left' ? -130 : 1170, tries: 0, ph: rnd(0, 6), flip: side === 'right', mood: '', req: pick(DATA.genre[genre].permintaan) };
    this.phase = 'in'; this.updInfo();
  },
  showBubble(text, withSkip) {
    this.hideBubble();
    const cu = this.cust, left = clamp(cu.standX - 170, 16, 720);
    const b = mk('div', 'bubble pe', ui); b.style.left = left + 'px'; b.style.top = '118px'; b.style.setProperty('--tx', clamp(cu.standX - left - 14, 24, 290) + 'px');
    mk('div', '', b, esc(text));
    if (withSkip) btn('Lewati', 'xs sec', () => this.skip(), b);
    this.bub = b;
  },
  hideBubble() { if (this.bub) { this.bub.remove(); this.bub = null; } },
  pickBook(t) {
    if (this.phase !== 'ask' || !(SAVE.buku[t] > 0)) return;
    const cu = this.cust, b = BOOKS[t];
    if (b.genre === cu.genre) this.pay(t, cu.tries === 0 ? 1.5 : 1.2, cu.tries === 0 ? 'happy' : 'ok2');
    else if (cu.tries === 0) { cu.tries = 1; this.showBubble('Hmm, bukan yang itu deh… ' + DATA.genre[cu.genre].petunjuk2 + ' Coba lagi, ya?', true); }
    else this.pay(t, 1, 'ok');
  },
  pay(t, mult, mood) {
    const b = BOOKS[t], price = Math.round(b.harga * bonusMult() * mult), cu = this.cust;
    SAVE.buku[t]--; SAVE.uang += price; this.earned += price; this.sold++;
    persist(); setCoins(); this.buildTray(); this.buildPanel(); this.updInfo();
    this.phase = 'react'; this.timer = 2; cu.mood = mood;
    this.floats.push({ txt: '+' + price, x: cu.x, y: 596 - 270 * cu.type.tinggi - 10, t: 0 });
    this.showBubble(pick(DATA.reaksi[mood]), false);
  },
  skip() {
    if (this.phase !== 'ask') return;
    this.phase = 'react'; this.timer = 1.4; this.cust.mood = 'skip';
    this.showBubble(pick(DATA.reaksi.skip), false);
  },
  finish() {
    if (this.over) return; this.over = true; this.hideBubble(); this.phase = 'done';
    modal((p, close) => {
      mk('h2', '', p, 'Lapak Tutup!');
      mk('p', '', p, 'Terjual <b>' + this.sold + '</b> buku<br>Pendapatan sesi ini: <b>' + this.earned + '</b> koin');
      if (stockTotal() > 0) btn('Lanjut jualan', '', () => { close(); go('sell'); }, p);
      else mk('p', '', p, '<small>Rak sudah kosong. Kulakan di van, atau cari buku baru lewat misi.</small>');
      btn('Kembali ke kota', 'sec', () => { close(); go('city'); }, p);
      btn('Ke dalam van', 'sec', () => { close(); openVan('city'); }, p);
    });
  },
  update(dt) {
    sky.update(dt);
    if (G.paused || this.over) return;
    this.floats = this.floats.filter(f => (f.t += dt) < 1.6);
    const cu = this.cust;
    if (this.phase === 'gap') {
      this.timer -= dt;
      if (this.timer <= 0) { if (this.done >= this.n || stockTotal() === 0) this.finish(); else this.spawn(); }
    } else if (this.phase === 'in') {
      const d = cu.standX - cu.x, dir = Math.sign(d); cu.flip = dir < 0;
      if (Math.abs(d) < 5) { cu.flip = cu.side === 'right'; this.phase = 'ask'; this.showBubble(cu.req, true); }
      else cu.x += dir * Math.min(Math.abs(d), 260 * dt);
    } else if (this.phase === 'react') {
      this.timer -= dt; if (this.timer <= 0) { this.phase = 'out'; this.hideBubble(); }
    } else if (this.phase === 'out') {
      const dir = cu.side === 'left' ? -1 : 1; cu.flip = dir < 0; cu.x += dir * 300 * dt;
      if (cu.x < -160 || cu.x > W + 200) { this.cust = null; this.done++; this.phase = 'gap'; this.timer = 0.5; this.updInfo(); }
    }
  },
  draw(c) {
    drawBg(c, this.C.latar);
    sky.draw(c, { spanY: 260, alpha: 0.8 });
    drawSprite(c, 'campervan', 430, 590, 560, { byWidth: true, breath: true });
    drawTable(c, 740, 556, 300);
    const items = SAVE.oleh.slice(0, 6);
    items.forEach((id, i) => {
      const row = i < 3 ? 0 : 1, idx = i % 3, cnt = Math.min(3, items.length - row * 3);
      const x = 740 + 150 + (idx - (cnt - 1) / 2) * 92, y = row === 0 ? 556 : 544, hh = row === 0 ? 60 : 54;
      if (row === 0) drawSprite(c, OLEH[id].gambar, x, y, hh, { asp: 1.2 });
    });
    items.forEach((id, i) => { if (i >= 3) { const idx = i % 3, cnt = Math.min(3, items.length - 3); drawSprite(c, OLEH[id].gambar, 740 + 150 + (idx - (cnt - 1) / 2) * 92, 544, 54, { asp: 1.2 }); } });
    const cu = this.cust;
    if (cu) {
      const mv = this.phase === 'in' || this.phase === 'out';
      drawSprite(c, cu.type.id, cu.x, 596, 270 * cu.type.tinggi, { breath: !mv, flip: cu.flip, ph: cu.ph, dy: mv ? -Math.abs(Math.sin(G.t * 9)) * 6 : 0 });
      if (this.phase === 'react' && (cu.mood === 'happy' || cu.mood === 'ok2')) {
        for (let i = 0; i < 3; i++) { const tt = (G.t * 0.9 + i / 3) % 1; drawHeart(c, cu.x + (i - 1) * 34, 596 - 270 * cu.type.tinggi - 30 - tt * 50, 0.9 + i * 0.1, 1 - tt); }
      }
    }
    this.floats.forEach(f => {
      c.save(); c.globalAlpha = 1 - f.t / 1.6; c.font = '800 44px "Baloo 2",sans-serif'; c.textAlign = 'center';
      c.lineWidth = 6; c.strokeStyle = '#7a5210'; c.strokeText(f.txt, f.x, f.y - f.t * 60); c.fillStyle = '#ffd95a'; c.fillText(f.txt, f.x, f.y - f.t * 60); c.restore();
    });
    sky.drawBirds(c);
  },
  exit() { this.hideBubble(); }
};

/* =========================================================
   SCENE: DALAM VAN (kulakan & dekorasi)
   ========================================================= */
SCENES.van = {
  enter() {
    this.tab = 'kulak';
    const hh = hud();
    const r = mk('div', 'hudr', ui); btn('Kembali', 'sm', () => go(G.prev), r);
    this.panel = mk('div', 'vpanel pe', ui);
    this.render();
  },
  render() {
    const p = this.panel, old = p.querySelector('.vlist'), sc = old ? old.scrollTop : 0;
    p.innerHTML = '';
    const tabs = mk('div', 'tabs', p);
    btn('Kulakan', 'sm' + (this.tab === 'kulak' ? '' : ' sec'), () => { this.tab = 'kulak'; this.render(); }, tabs);
    btn('Dekorasi', 'sm' + (this.tab === 'dek' ? '' : ' sec'), () => { this.tab = 'dek'; this.render(); }, tabs);
    const list = mk('div', 'vlist', p);
    if (this.tab === 'kulak') {
      mk('div', 'vnote', list, 'Beli lagi buku yang sudah kamu temukan lewat misi. Harga kulak setengah harga jual.');
      if (!SAVE.koleksi.length) mk('div', 'vempty', list, 'Belum ada buku. Selesaikan misi di kota dulu, ya.');
      SAVE.koleksi.forEach(t => {
        const b = BOOKS[t], gd = DATA.genre[b.genre], cost = Math.ceil(b.harga * 0.5), row = mk('div', 'vrow', list);
        row.style.setProperty('--col', gd.warna);
        row.appendChild(spriteCanvas(gd.ikon, 40, 0.8));
        mk('div', 'vt', row, '<b>' + esc(t) + '</b><small>' + esc(gd.nama) + ' · stok ' + (SAVE.buku[t] || 0) + '</small>');
        const bx = mk('div', 'vb', row);
        btn('+1 · ' + cost, 'xs', () => this.buy(t, 1, cost), bx);
        btn('+3 · ' + cost * 3, 'xs', () => this.buy(t, 3, cost * 3), bx);
      });
    } else {
      DATA.upgrade.forEach(u => {
        const has = SAVE.upgrade.includes(u.id), row = mk('div', 'vrow', list);
        mk('div', 'vt', row, '<b>' + esc(u.nama) + '</b><small>' + esc(u.desk) + '</small>');
        const bx = mk('div', 'vb', row);
        if (has) mk('b', '', bx, '✓ Terpasang'); else btn('Beli · ' + u.harga, 'xs', () => this.buyUp(u), bx);
      });
    }
    list.scrollTop = sc;
  },
  buy(t, n, total) {
    if (SAVE.uang < total) { toast('Koinmu belum cukup.'); return; }
    SAVE.uang -= total; SAVE.buku[t] = (SAVE.buku[t] || 0) + n; persist(); setCoins(); this.render();
  },
  buyUp(u) {
    if (SAVE.uang < u.harga) { toast('Koinmu belum cukup.'); return; }
    SAVE.uang -= u.harga; SAVE.upgrade.push(u.id); persist(); setCoins(); toast(u.nama + ' terpasang!'); this.render();
  },
  update(dt) { sky.update(dt); },
  draw(c) {
    drawBg(c, 'pembuka_latar');
    c.fillStyle = 'rgba(251,243,225,.65)'; c.fillRect(0, 0, W, H);
    const im = IMG.campervan_dalam, w = 720;
    if (im && im.ok) {
      const h = w * im.h / im.w; c.save(); c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 18; c.drawImage(im.src, 24, 150, w, h); c.restore();
    } else placeholder(c, 'campervan_dalam', 24, 150, w, 400);
    c.fillStyle = '#5a3e28'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = '800 46px "Baloo 2",sans-serif'; c.fillText('Dalam Van', 30, 124);
    c.font = '600 24px "Baloo 2",sans-serif';
    c.fillText('Bonus penjualan sekarang: ×' + bonusMult().toFixed(2), 30, 604);
    const dek = SAVE.upgrade.map(id => UPG[id].nama).join(', ');
    c.font = '600 20px "Baloo 2",sans-serif'; c.fillText(dek ? 'Terpasang: ' + dek : 'Belum ada dekorasi terpasang.', 30, 638, 710);
  }
};

/* =========================================================
   BOOT
   ========================================================= */
function resize() {
  G.scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(-50%,-50%) scale(${G.scale})`;
  G.rs = clamp(G.scale * (window.devicePixelRatio || 1), 1, 2);
  cv.width = Math.round(W * G.rs); cv.height = Math.round(H * G.rs);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; G.t += dt;
  g.setTransform(G.rs, 0, 0, G.rs, 0, 0); g.clearRect(0, 0, W, H);
  try { if (G.scene) { if (G.scene.update) G.scene.update(dt); if (G.scene.draw) G.scene.draw(g); } }
  catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}

async function boot() {
  const ld = document.getElementById('loading');
  resize();
  try { DATA = await (await fetch('cities.json')).json(); }
  catch (e) { ld.innerHTML = 'Gagal memuat cities.json.<br><small>Buka lewat server (GitHub Pages atau <code>python -m http.server</code>), bukan langsung dari file.</small>'; return; }
  DATA.kota.forEach(c => {
    CITY[c.id] = c;
    (c.oleh_oleh || []).forEach(o => { OLEH[o.id] = o; });
    c.misi.forEach(m => { BOOKS[m.buku.judul] = Object.assign({ kota: c.id }, m.buku); });
  });
  DATA.upgrade.forEach(u => { UPG[u.id] = u; });
  const names = new Set(['campervan', 'campervan_dalam', 'pembuka_latar', 'peta_indonesia', 'buku_tumpuk']);
  Object.values(DATA.genre).forEach(x => names.add(x.ikon));
  DATA.karakter.forEach(x => names.add(x.id));
  DATA.pembeli.forEach(x => names.add(x.id));
  DATA.kota.forEach(c => { names.add(c.latar); names.add(c.npc.gambar); names.add(c.lokasi.gambar); (c.oleh_oleh || []).forEach(o => names.add(o.gambar)); });
  const list = Array.from(names); let n = 0;
  await Promise.all(list.map(nm => loadOne(nm).then(() => { n++; ld.textContent = 'Memuat gambar ' + n + '/' + list.length + '…'; })));
  const missing = list.filter(nm => !IMG[nm] || !IMG[nm].ok);
  if (missing.length) console.info('Aset belum ada (pakai placeholder):', missing.join(', '));
  loadSet(); sky.init(); SAVE = loadSave();
  ld.remove();
  go('title');
  requestAnimationFrame(frame);
}
boot();
})();
