// Rush Hour game: rendering, dragging, move counting, hints and progress.
(function () {
  'use strict';

  const RH = window.RushHour;
  const LEVELS = window.RUSH_HOUR_LEVELS;
  const UNIT = 100 / RH.SIZE; // one cell as a percentage of the grid
  const STORE_KEY = 'rush-hour-progress-v1';

  const $ = (id) => document.getElementById(id);
  const gridEl = $('grid');

  let level = 0;
  let vehicles = [];
  let pos = [];
  let startPos = [];
  let history = []; // [{ vehicle, from, to }]
  let els = [];
  let solved = false;
  let hint = null; // { vehicle, to, ghost }
  let hintsUsed = 0;
  let drag = null;
  let progress = load();

  // ---- Storage (per-browser convenience only; the game works without it) ----
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || { best: {}, level: 0 };
    } catch (e) {
      return { best: {}, level: 0 };
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch (e) { /* storage unavailable */ }
  }

  function tier(minMoves) {
    if (minMoves <= 7) return { name: 'Beginner', cls: 't1' };
    if (minMoves <= 14) return { name: 'Intermediate', cls: 't2' };
    if (minMoves <= 21) return { name: 'Advanced', cls: 't3' };
    if (minMoves <= 34) return { name: 'Expert', cls: 't4' };
    return { name: 'Grand Master', cls: 't5' };
  }

  // ---- Level setup ----
  function startLevel(n) {
    level = Math.max(0, Math.min(LEVELS.length - 1, n));
    progress.level = level;
    save();
    const parsed = RH.parse(LEVELS[level].board);
    vehicles = parsed.vehicles;
    pos = parsed.pos;
    startPos = pos.slice();
    history = [];
    solved = false;
    hintsUsed = 0;
    clearHint();
    $('win').hidden = true;
    buildVehicles();
    updateHud();
    renderCards();
    setHelp('Drag a vehicle along its lane. Get the red car to the exit.');
  }

  function buildVehicles() {
    gridEl.textContent = '';
    els = vehicles.map((v, i) => {
      const el = document.createElement('div');
      el.className = 'vehicle ' + (v.horiz ? 'h' : 'v') + (v.len === 3 ? ' truck' : '') + (i === 0 ? ' red' : '');
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', vehicleLabel(i));
      if (i > 0) el.style.setProperty('--c', `var(--v${((i - 1) % 12) + 1})`);
      el.innerHTML = '<div class="body"></div>';
      el.addEventListener('pointerdown', (e) => onPointerDown(e, i));
      el.addEventListener('keydown', (e) => onKey(e, i));
      gridEl.appendChild(el);
      place(i, pos[i], el);
      return el;
    });
  }

  function vehicleLabel(i) {
    const v = vehicles[i];
    const kind = i === 0 ? 'Red car' : v.len === 3 ? 'Truck' : 'Car';
    const dir = v.horiz ? 'left and right' : 'up and down';
    return `${kind}, moves ${dir}. Use arrow keys to slide.`;
  }

  function box(v, p) {
    return v.horiz
      ? { left: p * UNIT, top: v.fixed * UNIT, width: v.len * UNIT, height: UNIT }
      : { left: v.fixed * UNIT, top: p * UNIT, width: UNIT, height: v.len * UNIT };
  }

  function place(i, p, el) {
    el = el || els[i];
    const b = box(vehicles[i], p);
    el.style.left = b.left + '%';
    el.style.top = b.top + '%';
    el.style.width = b.width + '%';
    el.style.height = b.height + '%';
  }

  // ---- Moves ----
  // Sliding the same vehicle twice in a row counts as one move, as on the real board.
  function commit(i, p) {
    if (p === pos[i]) {
      place(i, p);
      return;
    }
    const from = pos[i];
    pos[i] = p;
    const last = history[history.length - 1];
    if (last && last.vehicle === i) {
      last.to = p;
      if (last.from === last.to) history.pop();
    } else {
      history.push({ vehicle: i, from, to: p });
    }
    place(i, p);
    clearHint();
    updateHud();
    if (RH.isSolved(pos)) win();
  }

  function undo() {
    if (solved || !history.length) return;
    const m = history.pop();
    pos[m.vehicle] = m.from;
    place(m.vehicle, m.from);
    clearHint();
    updateHud();
  }

  function reset() {
    if (!history.length && !solved) return;
    startLevel(level);
  }

  // ---- Input ----
  function onPointerDown(e, i) {
    if (solved || drag) return;
    e.preventDefault();
    const el = els[i];
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    const [lo, hi] = RH.range(vehicles, pos, i);
    drag = {
      i,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: pos[i],
      lo,
      hi,
      cell: gridEl.clientWidth / RH.SIZE,
      at: pos[i],
    };
    el.classList.add('dragging');
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const v = vehicles[drag.i];
    const delta = (v.horiz ? e.clientX - drag.x : e.clientY - drag.y) / drag.cell;
    drag.at = Math.max(drag.lo, Math.min(drag.hi, drag.start + delta));
    place(drag.i, drag.at);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { i, at } = drag;
    const el = els[i];
    el.classList.remove('dragging');
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    drag = null;
    commit(i, Math.round(at));
  }

  function onKey(e, i) {
    if (solved) return;
    const v = vehicles[i];
    const step = {
      ArrowLeft: v.horiz ? -1 : 0,
      ArrowRight: v.horiz ? 1 : 0,
      ArrowUp: v.horiz ? 0 : -1,
      ArrowDown: v.horiz ? 0 : 1,
    }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    if (!step) return;
    const [lo, hi] = RH.range(vehicles, pos, i);
    const p = pos[i] + step;
    if (p >= lo && p <= hi) commit(i, p);
  }

  // ---- Hints ----
  function showHint() {
    if (solved) return;
    clearHint();
    const solution = RH.solve(vehicles, pos);
    if (!solution) {
      setHelp('No way out from here. Undo a few moves or reset the card.');
      return;
    }
    const m = solution[0];
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    place(m.vehicle, m.to, ghost);
    gridEl.appendChild(ghost);
    els[m.vehicle].classList.add('hint');
    hint = { vehicle: m.vehicle, ghost };
    hintsUsed++;
    setHelp('Slide the flashing vehicle to the dashed outline.');
  }

  function clearHint() {
    if (!hint) return;
    els[hint.vehicle] && els[hint.vehicle].classList.remove('hint');
    hint.ghost.remove();
    hint = null;
    setHelp('');
  }

  // ---- Winning ----
  function win() {
    solved = true;
    const moves = history.length;
    const shortest = LEVELS[level].minMoves;
    const key = LEVELS[level].board;
    const prev = progress.best[key];
    if (!hintsUsed && (!prev || moves < prev)) progress.best[key] = moves;
    save();

    const red = els[0];
    red.classList.add('leaving');
    red.style.left = RH.SIZE * UNIT + 4 + '%';

    let text =
      moves === shortest
        ? `You solved it in ${moves} moves. That’s the shortest possible route.`
        : `You solved it in ${moves} moves. The shortest route takes ${shortest}.`;
    if (hintsUsed) text += ` You used ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}, so this won’t count as your best.`;
    $('win-body').textContent = text;
    const last = level === LEVELS.length - 1;
    $('win-next').textContent = last ? 'Back to card 1' : 'Next card';

    setTimeout(() => {
      $('win').hidden = false;
      $('win-next').focus({ preventScroll: true });
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560);
    updateHud();
    renderCards();
  }

  // ---- HUD ----
  function updateHud() {
    const L = LEVELS[level];
    const t = tier(L.minMoves);
    $('card-name').textContent = `Card ${level + 1} of ${LEVELS.length}`;
    $('tier').textContent = t.name;
    $('moves').textContent = history.length;
    const best = progress.best[L.board];
    $('best').textContent = best ? best : '–';
    $('best').classList.toggle('under', !!best && best <= L.minMoves);
    $('undo').disabled = solved || !history.length;
    $('reset').disabled = !solved && !history.length;
    $('hint').disabled = solved;
  }

  function setHelp(text) {
    $('help').textContent = text;
  }

  function renderCards() {
    const list = $('card-list');
    list.textContent = '';
    LEVELS.forEach((L, n) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card-btn ' + tier(L.minMoves).cls;
      const best = progress.best[L.board];
      if (best) b.classList.add('done');
      if (n === level) b.setAttribute('aria-current', 'true');
      b.innerHTML = `<span class="n">${n + 1}</span><span class="p">${best ? '✓ ' + best : '&nbsp;'}</span>`;
      b.setAttribute('aria-label', `Card ${n + 1}, ${tier(L.minMoves).name}${best ? `, best ${best} moves` : ''}`);
      b.addEventListener('click', () => startLevel(n));
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  $('undo').addEventListener('click', undo);
  $('reset').addEventListener('click', reset);
  $('hint').addEventListener('click', showHint);
  $('win-next').addEventListener('click', () => startLevel(level === LEVELS.length - 1 ? 0 : level + 1));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  });

  startLevel(progress.level || 0);
})();
