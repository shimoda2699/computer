/* PC組み立てチャレンジ  本体 */
(function () {
  'use strict';
  const { CONFIG, PARTS, TRAY, TARGETS, TROUBLES } = window.PCGAME;
  const W = 1200, H = 720;
  const LED_NAMES = ['CPU', 'DRAM', 'VGA', 'BOOT'];
  const TAB_NAMES = { body: '本体パーツ', cable: 'ケーブル', periph: '周辺機器' };
  const T = Object.fromEntries(TARGETS.map((t) => [t.id, t]));

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const placedLayer = $('#placedLayer');
  const cableLayer = $('#cableLayer');
  const targetLayer = $('#targetLayer');
  const screen = $('#screen');
  const cardsEl = $('#cards');
  const tabsEl = $('#tabs');
  const obsEl = $('#obs');
  const logEl = $('#log');
  const hintBtn = $('#hintBtn');
  const hintText = $('#hintText');
  const powerBtn = $('#powerBtn');
  const psuBtn = $('#psuSwitch');

  let S = fresh();
  let audioCtx = null;
  let soundOn = true;
  let drag = null;
  let ticker = null;

  function fresh() {
    const inv = {};
    for (const [k, p] of Object.entries(PARTS)) inv[k] = p.count || 1;
    return {
      started: false, done: false, group: '', guide: true,
      t0: 0, tEnd: null,
      pen: { fail: 0, miss: 0, hint: 0 },
      tries: 0, powered: false, busy: false,
      placed: {}, inv, rejected: {},
      psuOn: false, selected: null, tab: 'body',
      log: [], seen: [], last: null, hintUsed: false, msgs: []
    };
  }

  /* ---------------- 幾何 ---------------- */
  const pct = (v, total) => (v / total * 100) + '%';
  function setRect(el, r) {
    el.style.left = pct(r[0], W); el.style.top = pct(r[1], H);
    el.style.width = pct(r[2], W); el.style.height = pct(r[3], H);
  }
  function toStage(cx, cy) {
    const b = stage.getBoundingClientRect();
    return {
      x: (cx - b.left) / b.width * W,
      y: (cy - b.top) / b.height * H,
      inside: cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom
    };
  }
  const inR = (r, x, y, pad = 0) => x >= r[0] - pad && x <= r[0] + r[2] + pad && y >= r[1] - pad && y <= r[1] + r[3] + pad;
  const area = (r) => r[2] * r[3];
  const occ = (id) => !!S.placed[id];
  const ready = (t) => (t.needs || []).every(occ);
  const dropRect = (t) => t.drop || t.r;
  const padOf = (t) => (Math.min(t.r[2], t.r[3]) < 32 ? 10 : 0);

  /* ---------------- 表示ユーティリティ ---------------- */
  let toastTimer = 0;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
  }
  function fmt(sec, tenths) {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    if (tenths) return m + ':' + s.toFixed(1).padStart(4, '0');
    return m + ':' + String(Math.floor(s)).padStart(2, '0');
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const elapsed = () => (S.started ? ((S.tEnd ?? performance.now()) - S.t0) / 1000 : 0);
  const penaltySec = () => S.pen.fail * CONFIG.fail + S.pen.miss * CONFIG.miss + S.pen.hint * CONFIG.hint;

  function updateHud() {
    $('#hudGroup').textContent = S.group || '—';
    $('#hudTime').textContent = fmt(elapsed());
    $('#hudPen').textContent = '+' + penaltySec() + '秒';
    $('#hudTries').textContent = S.tries + '回';
    powerBtn.disabled = !S.started || S.busy || S.done;
    powerBtn.classList.toggle('on', S.powered);
    $('#powerLabel').textContent = S.powered ? '電源を切る' : '電源ON';
    psuBtn.setAttribute('aria-pressed', String(S.psuOn));
    psuBtn.title = '電源ユニットのスイッチ：' + (S.psuOn ? 'ON' : 'OFF');
  }

  /* ---------------- 部品箱 ---------------- */
  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const key of Object.keys(TRAY)) {
      const left = TRAY[key].filter((pid) => S.inv[pid] > 0 && !S.rejected[pid]).length;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(S.tab === key));
      b.innerHTML = esc(TAB_NAMES[key]) + '<small>' + left + '</small>';
      b.addEventListener('click', () => { S.tab = key; renderTray(); });
      tabsEl.appendChild(b);
    }
  }
  function renderTray() {
    renderTabs();
    cardsEl.innerHTML = '';
    for (const pid of TRAY[S.tab]) {
      const p = PARTS[pid];
      const n = S.inv[pid];
      const rej = !!S.rejected[pid];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card' + (S.selected === pid ? ' selected' : '') + (rej ? ' rejected' : '');
      b.dataset.pid = pid;
      b.disabled = n <= 0 || rej;
      b.title = p.desc || p.spec;
      b.innerHTML =
        '<span class="thumb"><img src="' + (p.thumb || p.img) + '" alt=""></span>' +
        '<span class="nm">' + esc(p.name) + '</span>' +
        '<span class="sp">' + esc(p.spec) + '</span>' +
        ((p.count || 1) > 1 ? '<span class="cnt">×' + n + '</span>' : '') +
        (rej ? '<span class="stamp"><span>合わない</span></span>' : '');
      cardsEl.appendChild(b);
    }
    const anyLeft = TRAY[S.tab].some((pid) => S.inv[pid] > 0 && !S.rejected[pid]);
    if (!anyLeft) {
      const p = document.createElement('p');
      p.className = 'tray-empty';
      p.textContent = 'このタブの部品はすべて使いました。';
      cardsEl.appendChild(p);
    }
  }

  /* ---------------- 作業台の描画 ---------------- */
  function renderPlaced() {
    placedLayer.innerHTML = '';
    for (const [tid, pid] of Object.entries(S.placed)) {
      const p = PARTS[pid];
      if (p.cable) continue;
      const t = T[tid];
      const img = document.createElement('img');
      img.src = p.img; img.alt = p.name; img.className = 'pp pp-' + p.type;
      setRect(img, t.img || t.r);
      img.style.zIndex = p.z || 1;
      placedLayer.appendChild(img);
      if (p.type === 'cooler') {
        const f = document.createElement('img');
        f.src = 'images/fan-blades.svg'; f.alt = ''; f.className = 'fan';
        setRect(f, t.r);
        f.style.zIndex = (p.z || 1) + 1;
        placedLayer.appendChild(f);
      }
    }
    $('#boardLeds').hidden = !occ('mobo');
    if (!occ('monitor')) clearScreen();
  }
  function hdmiPath(t) {
    const x = t.r[0] + t.r[2] / 2, y = t.r[1] + t.r[3] / 2;
    const endY = occ('monitor') ? 332 : 610;
    return `M${x} ${y} L4 ${y} L4 714 L975 714 L975 ${endY}`;
  }
  function renderCables() {
    let s = '';
    for (const [tid, pid] of Object.entries(S.placed)) {
      const p = PARTS[pid];
      if (!p.cable) continue;
      const t = T[tid];
      const d = p.type === 'hdmi' ? hdmiPath(t) : t.path;
      if (d) {
        s += `<path d="${d}" fill="none" stroke="#0b0d0f" stroke-width="${p.w + 3}" stroke-linejoin="round" stroke-linecap="round"/>`;
        s += `<path d="${d}" fill="none" stroke="${p.color}" stroke-width="${p.w}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      s += plug(t.r, p);
      if (t.plug2) s += plug(t.plug2, p);
      if (p.type === 'hdmi') s += plug(occ('monitor') ? [965, 322, 20, 12] : [965, 604, 20, 12], p);
    }
    cableLayer.innerHTML = s;
  }
  const plug = (r, p) => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="2" fill="${p.plug}" stroke="${p.type === 'c24' || p.type === 'c8' ? '#7d8790' : p.color}" stroke-width="2"/>`;

  function renderStage() { renderPlaced(); renderCables(); }

  /* ---------------- 取り付け場所の表示 ---------------- */
  function showTargets(pid) {
    targetLayer.innerHTML = '';
    if (!pid) return;
    const type = PARTS[pid].type;
    for (const t of TARGETS) {
      if (t.accepts !== type || !ready(t) || occ(t.id)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbox' + (S.guide ? '' : ' quiet');
      b.setAttribute('aria-label', t.label + 'に取り付ける');
      b.innerHTML = '<span>' + esc(t.label) + '</span>';
      setRect(b, t.r);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const c = t.r;
        tryPlace(pid, c[0] + c[2] / 2, c[1] + c[3] / 2);
        clearSelection();
      });
      targetLayer.appendChild(b);
    }
  }

  /* ---------------- 取り付け・取り外し ---------------- */
  function canEdit() {
    if (!S.started || S.done) return false;
    if (S.powered || S.busy) { toast('電源を切ってから作業しましょう（感電・故障の危険があります）', 'bad'); return false; }
    return true;
  }
  function addMiss(msg) {
    S.pen.miss++;
    toast(msg + `（+${CONFIG.miss}秒）`, 'bad');
    updateHud();
  }
  function tryPlace(pid, x, y) {
    if (!canEdit()) return false;
    const part = PARTS[pid];
    if (!(S.inv[pid] > 0) || S.rejected[pid]) return false;
    const cands = TARGETS.filter((t) => ready(t) && inR(dropRect(t), x, y, padOf(t)))
      .sort((a, b) => area(a.r) - area(b.r));
    const match = cands.filter((t) => t.accepts === part.type);
    if (match.length) {
      const free = match.find((t) => !occ(t.id));
      if (!free) { toast('そこにはもう取り付けてあります'); return false; }
      if (part.decoy) {
        S.rejected[pid] = true;
        addMiss(part.decoy);
        renderTray();
        return false;
      }
      S.placed[free.id] = pid;
      S.inv[pid]--;
      toast(part.name + 'を取り付けました', 'ok');
      afterChange();
      return true;
    }
    const top = cands[0];
    if (top && !occ(top.id)) { addMiss(`「${part.name}」は${top.label}には取り付けられません`); return false; }
    toast(cands.length ? 'ここには取り付けられません' : '取り付ける場所の上に置いてください');
    return false;
  }
  function removeAt(x, y) {
    if (!S.started || S.done) return;
    const hits = Object.keys(S.placed).map((id) => T[id]).filter((t) => {
      const p = PARTS[S.placed[t.id]];
      return p.cable ? inR(t.r, x, y, 8) || (t.plug2 && inR(t.plug2, x, y, 8)) : inR(t.img || t.r, x, y);
    });
    if (!hits.length) return;
    if (!canEdit()) return;
    const zOf = (t) => { const p = PARTS[S.placed[t.id]]; return p.cable ? 50 : (p.z || 1); };
    hits.sort((a, b) => zOf(b) - zOf(a) || area(a.r) - area(b.r));
    const t = hits[0];
    const deps = TARGETS.filter((o) => occ(o.id) && (o.needs || []).includes(t.id));
    if (deps.length) {
      const names = [...new Set(deps.map((o) => PARTS[S.placed[o.id]].name))];
      toast('先に「' + names.join('」「') + '」を外してください');
      return;
    }
    const pid = S.placed[t.id];
    delete S.placed[t.id];
    S.inv[pid]++;
    toast(PARTS[pid].name + 'を外しました');
    afterChange();
  }
  function afterChange() {
    renderStage();
    renderTray();
    updateHud();
  }

  /* ---------------- 選択とドラッグ ---------------- */
  function select(pid) {
    S.selected = pid;
    stage.classList.toggle('selecting', !!pid);
    showTargets(pid);
    renderTray();
    if (pid) toast('「' + PARTS[pid].name + '」を選びました。置き場所をクリックしてください（Escでやめる）');
  }
  function clearSelection() {
    if (!S.selected) return;
    S.selected = null;
    stage.classList.remove('selecting');
    showTargets(null);
    renderTray();
  }

  cardsEl.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.card');
    if (!c || c.disabled || e.button > 0) return;
    if (!S.started || S.done) return;
    drag = { pid: c.dataset.pid, x0: e.clientX, y0: e.clientY, on: false, ghost: null, card: c };
    try { c.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
      if (!canEdit()) { drag = null; return; }
      drag.on = true;
      const g = document.createElement('img');
      const p = PARTS[drag.pid];
      g.src = p.thumb || p.img; g.className = 'ghost-img'; g.alt = '';
      document.body.appendChild(g);
      drag.ghost = g;
      S.selected = null;
      stage.classList.remove('selecting');
      showTargets(drag.pid);
    }
    if (drag.on) { drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px'; }
  });
  document.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.on) {
      d.ghost.remove();
      showTargets(null);
      const p = toStage(e.clientX, e.clientY);
      if (p.inside) tryPlace(d.pid, p.x, p.y);
      renderTray();
    } else if (S.selected === d.pid) {
      clearSelection();
    } else if (canEdit()) {
      select(d.pid);
    }
  });
  document.addEventListener('pointercancel', () => {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null; showTargets(S.selected);
  });
  // キーボード操作（Enter/Space）で選択
  cardsEl.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const c = e.target.closest('.card');
    if (!c || c.disabled) return;
    if (S.selected === c.dataset.pid) clearSelection();
    else if (canEdit()) {
      select(c.dataset.pid);
      const first = targetLayer.querySelector('.tbox');
      if (first) first.focus();
    }
  });
  stage.addEventListener('click', (e) => {
    if (e.target.closest('.psu-switch, .screen, .tbox')) return;
    const p = toStage(e.clientX, e.clientY);
    if (S.selected) {
      const pid = S.selected;
      clearSelection();
      tryPlace(pid, p.x, p.y);
    } else {
      removeAt(p.x, p.y);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearSelection(); closeZoom(); }
  });

  /* ---------------- 電源ユニットのスイッチ ---------------- */
  psuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!S.started || S.done || S.busy) return;
    S.psuOn = !S.psuOn;
    if (!S.psuOn && S.powered) powerOff();
    toast('電源ユニットのスイッチを' + (S.psuOn ? '「｜」（ON）' : '「○」（OFF）') + 'にしました');
    updateHud();
  });

  /* ---------------- 音 ---------------- */
  function beep(pattern) {
    if (!soundOn) return Promise.resolve();
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      let t = audioCtx.currentTime + 0.05;
      let total = 0;
      for (const [on, off] of pattern) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square'; o.frequency.value = 1000;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
        g.gain.setValueAtTime(0.06, t + on / 1000 - 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + on / 1000);
        o.connect(g).connect(audioCtx.destination);
        o.start(t); o.stop(t + on / 1000 + 0.02);
        t += (on + off) / 1000;
        total += on + off;
      }
      return sleep(total + 100);
    } catch (_) {
      return Promise.resolve();
    }
  }
  $('#soundBtn').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
    e.currentTarget.textContent = soundOn ? '音 ON' : '音 OFF';
  });

  /* ---------------- 診断 ---------------- */
  function memInfo() {
    const ids = ['mem1', 'mem2', 'mem3', 'mem4'].filter(occ);
    const chans = new Set(ids.map((id) => T[id].ch));
    return { count: ids.length, dual: chans.size >= 2 };
  }
  function diagnose() {
    const mem = memInfo();
    const disp = !occ('monitor') ? 'none' : occ('hdmi_gpu') ? 'gpu' : occ('hdmi_mb') ? 'mobo' : 'nocable';
    const d = { disp, mem, power: false, led: null, beep: null, code: null, post: false };
    if (!S.psuOn) d.code = 'NO_PSU_SW';
    else if (!occ('mobo')) d.code = 'NO_MOBO';
    else if (!occ('fp')) d.code = 'NO_FP';
    else if (!occ('c24')) d.code = 'NO_24';
    if (d.code) { d.hint = d.code; d.visible = false; d.success = false; return d; }
    d.power = true;
    if (!occ('cpu')) { d.code = 'NO_CPU'; d.led = 0; }
    else if (!occ('c8')) { d.code = 'NO_8'; d.led = 0; }
    else if (mem.count === 0) { d.code = 'NO_MEM'; d.led = 1; d.beep = 'mem'; }
    else if (!occ('pcie')) { d.code = 'NO_GPU'; d.led = 2; d.beep = 'vga'; }
    else if (!occ('cpcie')) { d.code = 'GPU_PWR'; d.led = 2; }
    else {
      d.post = true;
      d.beep = 'ok';
      if (!occ('cooler')) d.code = 'NO_COOLER';
      else if (!occ('kb')) d.code = 'NO_KB';
      else if (!occ('m2')) { d.code = 'NO_BOOT'; d.led = 3; }
      else if (!occ('mouse')) d.code = 'NO_MOUSE';
      else d.code = 'OK';
    }
    d.visible = disp === 'gpu' && (d.post || d.code === 'GPU_PWR');
    const dispCode = { none: 'NO_MONITOR', nocable: 'NO_CABLE', mobo: 'WRONG_PORT' }[disp] || null;
    d.hint = d.code;
    if (['NO_KB', 'NO_BOOT', 'NO_MOUSE', 'OK'].includes(d.code) && !d.visible) d.hint = dispCode;
    d.success = d.code === 'OK' && d.visible;
    return d;
  }

  /* ---------------- 画面 ---------------- */
  function clearScreen() { screen.innerHTML = ''; screen.hidden = true; }
  function setScreen(html) {
    if (!occ('monitor')) return;
    screen.innerHTML = html; screen.hidden = false;
    syncZoom();
  }
  function osd(kind) {
    const m = kind === 'cable' ? 'Check Signal Cable' : 'No Signal';
    setScreen(`<div class="osd"><b>${m}</b><span>HDMI 1</span></div>`);
    S.msgs.push(m);
  }
  let pre = null;
  function startPost() {
    setScreen('<pre class="post"></pre>');
    pre = screen.querySelector('pre');
  }
  async function typeLines(lines, cls, delay = 80) {
    for (const line of lines) {
      if (!pre || !pre.isConnected) return;
      const span = document.createElement('span');
      if (cls) span.className = cls;
      span.textContent = line + '\n';
      pre.appendChild(span);
      if (cls && line) S.msgs.push(line);
      syncZoom();
      await sleep(delay);
    }
  }
  function blinkLast() {
    if (!pre || !pre.lastChild) return;
    pre.lastChild.textContent = pre.lastChild.textContent.replace(/\n$/, '');
    pre.lastChild.classList.add('cursor-blink');
    syncZoom();
  }
  function postInfo(d) {
    const sata = occ('hdd') && occ('satad') && occ('satap');
    const usb = [occ('kb') ? 'Keyboard' : null, occ('mouse') ? 'Mouse' : null].filter(Boolean).join(', ') || 'No Device';
    return [
      'GB-790 ATX BIOS  Ver. 1.02',
      'Copyright (C) 2026 Gakushu Boards',
      '',
      'CPU      : 8-Core Processor @ 3.60GHz',
      `Memory   : ${d.mem.count * 16384}MB DDR5-4800 (${d.mem.dual ? 'Dual' : 'Single'} Channel)`,
      `M.2_1    : ${occ('m2') ? 'NVMe SSD 1TB' : 'Not Present'}`,
      `SATA 1   : ${sata ? 'HDD 2TB' : 'Not Present'}`,
      `USB      : ${usb}`,
      `CPU Fan  : ${occ('cooler') ? '1250 RPM' : '---- RPM'}`,
      ''
    ];
  }
  function syncZoom() {
    if ($('#zoomModal').hidden) return;
    $('#zoomScreen').innerHTML = screen.innerHTML;
  }
  screen.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!screen.innerHTML) return;
    $('#zoomScreen').innerHTML = screen.innerHTML;
    $('#zoomModal').hidden = false;
    $('#zoomClose').focus();
  });
  function closeZoom() { $('#zoomModal').hidden = true; }
  $('#zoomClose').addEventListener('click', closeZoom);
  $('#zoomModal').addEventListener('click', (e) => { if (e.target.id === 'zoomModal') closeZoom(); });

  /* ---------------- 電源ON/OFF ---------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function setFans(on) { stage.classList.toggle('fans-on', on); }
  function setCaseLed(on) { $('#caseLed').classList.toggle('on', on); }
  function setLed(i) {
    document.querySelectorAll('[data-led]').forEach((x) => x.classList.toggle('on', +x.dataset.led === i));
  }

  powerBtn.addEventListener('click', () => {
    if (!S.started || S.busy || S.done) return;
    if (S.powered) powerOff(); else powerOn();
  });

  async function powerOn() {
    clearSelection();
    S.powered = true; S.busy = true; S.tries++; S.msgs = []; S.hintUsed = false;
    hintBtn.disabled = true; hintText.hidden = true;
    obsEl.textContent = '電源ボタンを押しました…';
    updateHud();
    const d = diagnose();
    S.last = d;
    try { await runSequence(d); } finally { S.busy = false; }
    finishAttempt(d);
  }

  async function runSequence(d) {
    await sleep(500);
    if (!d.power) {
      if (d.disp === 'nocable') osd('cable');
      else if (d.disp !== 'none') osd('nosignal');
      await sleep(1000);
      return;
    }
    setFans(true); setCaseLed(true);
    await sleep(300);
    for (let i = 0; i < 4; i++) {
      setLed(i);
      await sleep(320);
      if (d.led === i && i < 3) break;
    }
    if (d.led === null || d.led === 3) setLed(null);
    if (d.beep === 'mem') await beep([[700, 300], [700, 300], [700, 300]]);
    else if (d.beep === 'vga') await beep([[700, 250], [150, 150], [150, 150], [150, 150]]);
    else if (d.beep === 'ok') await beep([[120, 200]]);

    if (!d.visible) {
      if (d.disp === 'nocable') osd('cable');
      else if (d.disp !== 'none') osd('nosignal');
      if (d.code === 'NO_COOLER') {
        await sleep(3200);
        shutdown(d);
      } else {
        if (d.code === 'NO_BOOT') setLed(3);
        await sleep(900);
      }
      return;
    }
    if (d.code === 'GPU_PWR') {
      const msg = ['Graphics card power cable is not connected.', 'Please power down and connect the PCIe power cable(s) for this graphics card.'];
      setScreen('<div class="center-msg">' + msg.map(esc).join('<br><br>') + '</div>');
      S.msgs.push(msg.join(' '));
      await sleep(900);
      return;
    }
    startPost();
    await typeLines(postInfo(d));
    if (d.code === 'NO_COOLER') {
      await typeLines(['CPU Fan Error!', 'Press F1 to Run SETUP'], 'err', 120);
      await sleep(2200);
      await typeLines(['', 'WARNING: CPU Over Temperature!', 'System is shutting down...'], 'warn', 200);
      await sleep(1500);
      shutdown(d);
      return;
    }
    if (d.code === 'NO_KB') {
      await typeLines(['Keyboard error or no keyboard present', 'Press F1 to Run SETUP'], 'err', 120);
      blinkLast();
      return;
    }
    if (d.code === 'NO_BOOT') {
      await typeLines(['Reboot and Select proper Boot device', 'or Insert Boot Media in selected Boot device and press a key'], 'err', 120);
      blinkLast();
      setLed(3);
      return;
    }
    await typeLines(['Booting from NVMe SSD...']);
    await sleep(900);
    setScreen('<div class="os boot"><div class="logo">Manabi OS</div><div class="spinner"></div></div>');
    await sleep(1800);
    if (d.code === 'NO_MOUSE') {
      setScreen('<div class="os desk"><div class="win warn"><div class="bar">Device Check</div><p>No pointing device detected.<br>Connect a mouse to continue.</p></div><div class="taskbar"></div></div>');
      S.msgs.push('No pointing device detected. Connect a mouse to continue.');
      return;
    }
    setScreen('<div class="os desk"><div class="win"><div class="bar">Welcome</div><p>Setup complete.<br>All devices are working properly.</p></div><div class="taskbar"></div><div class="pointer"></div></div>');
    S.msgs.push('Setup complete.');
  }

  function shutdown(d) {
    setFans(false); setCaseLed(false); setLed(null);
    if (d.disp === 'nocable') osd('cable');
    else if (d.disp !== 'none') osd('nosignal');
  }

  function powerOff() {
    S.powered = false;
    setFans(false); setCaseLed(false); setLed(null);
    clearScreen();
    closeZoom();
    if (S.last && !S.last.success) obsEl.textContent += '　→ 電源を切りました。部品を見直して、もう一度電源を入れてみよう。';
    updateHud();
  }

  function observe(d) {
    const s = [];
    if (!d.power) {
      s.push('電源ボタンを押しても、ファンは回らず、ランプも点かない。まったく反応がない。');
    } else {
      s.push('ファンが回り始めた。');
      if (d.led !== null && d.led < 3) s.push(`マザーボードの診断ランプ「${LED_NAMES[d.led]}」が点灯したままになっている。`);
      if (d.beep === 'mem') s.push('長いビープ音が3回鳴った。');
      if (d.beep === 'vga') s.push('ビープ音が「長1回・短3回」鳴った。');
      if (d.beep === 'ok') s.push('「ピッ」と短いビープ音が1回鳴った。');
      if (d.code === 'NO_BOOT') s.push('診断ランプ「BOOT」が点灯している。');
      if (d.code === 'NO_COOLER') s.push('数秒後、突然電源が切れてファンが止まった。');
    }
    if (d.disp === 'none') s.push('モニターがないので、画面は確認できない。');
    else if (d.disp === 'nocable') s.push('モニターには「Check Signal Cable」と表示されている。');
    else if (!d.visible) s.push('モニターには「No Signal」と表示されている。');
    else if (d.success) s.push('モニターにデスクトップ画面が表示された！');
    else if (d.code === 'NO_COOLER') s.push('電源が切れる前に、画面に英語のメッセージが出ていた（記録を確認しよう）。');
    else s.push('モニターに英語のメッセージが表示された。画面をよく読もう（画面をクリックすると拡大）。');
    return s.join('');
  }

  function finishAttempt(d) {
    const obs = observe(d);
    obsEl.textContent = obs;
    const msgs = [...new Set(S.msgs)];
    S.log.push({ n: S.tries, at: elapsed(), ok: d.success, msgs, code: d.hint });
    if (d.success) {
      S.done = true;
      S.tEnd = performance.now();
      hintBtn.disabled = true;
      celebrate();
      renderLog();
      updateHud();
      setTimeout(showResult, 2600);
      return;
    }
    S.pen.fail++;
    if (d.hint && !S.seen.includes(d.hint)) S.seen.push(d.hint);
    hintBtn.disabled = false;
    hintBtn.textContent = `ヒントを見る（+${CONFIG.hint}秒）`;
    renderLog();
    updateHud();
    toast(`うまく起動しませんでした（+${CONFIG.fail}秒）。状況をよく観察しよう`, 'bad');
  }

  hintBtn.addEventListener('click', () => {
    if (!S.last || S.last.success || S.hintUsed) return;
    S.hintUsed = true;
    S.pen.hint++;
    const tr = TROUBLES[S.last.hint];
    hintText.textContent = tr ? tr.hint : '';
    hintText.hidden = false;
    hintBtn.disabled = true;
    updateHud();
  });

  function renderLog() {
    if (!S.log.length) { logEl.innerHTML = '<li class="empty">まだ電源を入れていません。</li>'; return; }
    logEl.innerHTML = S.log.slice().reverse().map((e) =>
      `<li value="${e.n}"><span class="when">${fmt(e.at)}</span>` +
      (e.ok ? '<span class="res-ok">起動成功！</span>' : '<span class="res-ng">起動せず</span>') +
      (e.msgs.length ? e.msgs.map((m) => `<span class="en">${esc(m)}</span>`).join('') : '<span class="en">（画面表示なし）</span>') +
      '</li>').join('');
  }

  function celebrate() {
    const colors = ['#d9480f', '#ffd43b', '#2b8a3e', '#1c7ed6', '#ae3ec9'];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('span');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 0.8) + 's';
      c.style.animationDuration = (2.4 + Math.random() * 1.6) + 's';
      stage.appendChild(c);
      setTimeout(() => c.remove(), 5000);
    }
    if (soundOn) beep([[100, 60], [100, 60], [260, 0]]);
  }

  /* ---------------- 結果 ---------------- */
  function hddBonus() { return occ('hdd') && occ('satap') && occ('satad'); }
  function showResult() {
    const work = elapsed();
    const bonus = hddBonus() ? CONFIG.hddBonus : 0;
    const total = work + penaltySec() - bonus;
    $('#resGroup').textContent = S.group;
    $('#resTime').textContent = fmt(total, true);
    const rows = [
      ['作業時間', fmt(work, true)],
      [`起動しなかった電源投入 ${S.pen.fail}回 × ${CONFIG.fail}秒`, '+' + S.pen.fail * CONFIG.fail + '秒'],
      [`取り付けミス ${S.pen.miss}回 × ${CONFIG.miss}秒`, '+' + S.pen.miss * CONFIG.miss + '秒'],
      [`ヒント ${S.pen.hint}回 × ${CONFIG.hint}秒`, '+' + S.pen.hint * CONFIG.hint + '秒'],
      ['HDDボーナス（ケーブルまで正しく接続）', bonus ? '−' + bonus + '秒' : 'なし']
    ];
    $('#resTable').innerHTML = rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('') +
      `<tr class="total"><td>記録タイム</td><td>${fmt(total, true)}</td></tr>`;
    $('#resTroubles').innerHTML = S.seen.length
      ? S.seen.map((code) => {
          const tr = TROUBLES[code];
          return `<li><b>${esc(tr.title)}</b><span class="en">${esc(tr.en)}</span>${esc(tr.hint)}</li>`;
        }).join('')
      : '<li class="none">トラブルなしで一発起動！</li>';
    const copy = [S.group, fmt(total, true), '作業' + fmt(work, true), '失敗' + S.pen.fail, 'ミス' + S.pen.miss, 'ヒント' + S.pen.hint, 'HDD' + (bonus ? 'あり' : 'なし'), S.guide ? 'ガイドあり' : 'ガイドなし'].join('\t');
    $('#copyArea').value = copy;
    $('#copyArea').hidden = true;
    $('#resultModal').hidden = false;
    $('#againBtn').focus();
  }
  $('#copyBtn').addEventListener('click', () => {
    const text = $('#copyArea').value;
    const fallback = () => { const a = $('#copyArea'); a.hidden = false; a.focus(); a.select(); toast('表示された記録を選択してコピーしてください'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('記録をコピーしました（表計算ソフトに貼り付けできます）', 'ok'), fallback);
    } else fallback();
  });
  $('#againBtn').addEventListener('click', () => { $('#resultModal').hidden = true; openStart(); });

  /* ---------------- スタート ---------------- */
  function openStart() {
    $('#penTable').innerHTML =
      `<tr><td>電源を入れて起動しなかった</td><td>+${CONFIG.fail}秒</td></tr>` +
      `<tr><td>違う場所・合わない部品を取り付けようとした</td><td>+${CONFIG.miss}秒</td></tr>` +
      `<tr><td>ヒントを見た</td><td>+${CONFIG.hint}秒</td></tr>` +
      `<tr><td>HDDもケーブルまで正しくつないで完成（ボーナス）</td><td>−${CONFIG.hddBonus}秒</td></tr>`;
    $('#cancelStart').hidden = !(S.started && !S.done);
    $('#groupName').value = S.group || '';
    $('#startModal').hidden = false;
    $('#groupName').focus();
  }
  $('#restartBtn').addEventListener('click', openStart);
  $('#cancelStart').addEventListener('click', () => { $('#startModal').hidden = true; });
  $('#startForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#groupName').value.trim();
    if (!name) { $('#groupName').focus(); return; }
    const guide = $('#modeGuide').checked;
    S = fresh();
    S.group = name; S.guide = guide; S.started = true; S.t0 = performance.now();
    setFans(false); setCaseLed(false); setLed(null); clearScreen();
    obsEl.textContent = 'まずはマザーボードをケースに置こう。部品の仕様（ソケットやメモリの種類）にも注目。';
    hintBtn.disabled = true; hintBtn.textContent = 'ヒントを見る'; hintText.hidden = true;
    $('#startModal').hidden = true;
    renderAll();
    clearInterval(ticker);
    ticker = setInterval(updateHud, 250);
  });

  function renderAll() {
    renderStage();
    renderTray();
    renderLog();
    updateHud();
  }

  // テストや授業準備用：コンソールから状態を確認できるようにする
  window.PCGAME_DEBUG = {
    state: () => S,
    placeAt: (pid, tid) => { const r = T[tid].r; return tryPlace(pid, r[0] + r[2] / 2, r[1] + r[3] / 2); }
  };

  renderAll();
  openStart();
})();
