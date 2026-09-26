// Gridlock game: rendering, dragging, move counting, hints and progress.
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

  // Difficulty levels by fewest moves to solve. Limits match tools/generate.js.
  const TIERS = [
    { name: 'Beginner', cls: 't1', upTo: 7 },
    { name: 'Intermediate', cls: 't2', upTo: 14 },
    { name: 'Advanced', cls: 't3', upTo: 21 },
    { name: 'Expert', cls: 't4', upTo: 34 },
    { name: 'Grand Master', cls: 't5', upTo: Infinity },
  ];
  const tier = (minMoves) => TIERS.find((t) => minMoves <= t.upTo);

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
    if (el.classList.contains('vehicle')) shade(i, p, el.firstChild);
  }

  // Fake 3D, as seen by a camera above the middle of the board: the roof
  // shifts away from the centre and stacked shadows fill in the side walls
  // down to the vehicle's footprint.
  const LAYERS = 6;
  const ROOF_SHIFT = 18; // largest roof shift, in hundredths of a cell
  function shade(i, p, body) {
    const v = vehicles[i];
    const half = RH.SIZE / 2;
    const cx = v.horiz ? p + v.len / 2 : v.fixed + 0.5;
    const cy = v.horiz ? v.fixed + 0.5 : p + v.len / 2;
    const height = (gridEl.clientWidth / RH.SIZE) * 0.1;
    const dx = ((cx - half) / half) * height;
    const dy = ((cy - half) / half) * height;
    const walls = [];
    for (let k = 1; k <= LAYERS; k++) {
      walls.push(`${(-dx * k) / LAYERS}px ${(-dy * k) / LAYERS}px 0 var(--side)`);
    }
    body.style.transform = `translate(${dx}px, ${dy}px)`;

    // The cabin roof sits higher than the body, so it shifts further. The
    // artwork faces right; vertical vehicles are drawn rotated to face down.
    const sx = ((cx - half) / half) * ROOF_SHIFT;
    const sy = ((cy - half) / half) * ROOF_SHIFT;
    const ox = Math.round((v.horiz ? sx : sy) * 2) / 2;
    const oy = Math.round((v.horiz ? sy : -sx) * 2) / 2;
    const key = ox + ',' + oy;
    if (body.dataset.roof !== key) {
      body.dataset.roof = key;
      body.innerHTML = window.vehicleArt(v, ox, oy);
    }
    body.style.boxShadow = [
      'inset 0 -3px 0 rgba(0, 0, 0, 0.18)',
      'inset 0 2px 0 rgba(255, 255, 255, 0.3)',
      ...walls,
      `${-dx + 2}px ${-dy + 4}px 6px rgba(0, 0, 0, 0.5)`,
    ].join(', ');
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
      setHelp('No way out from here. Undo a few moves or reset the level.');
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
  // Result messages. {n} is the player's moves, {s} the shortest route,
  // {d} how many more moves the player took than needed.
  // Each body is what happened, then an aside; \n marks a hand-set line break.
  const PRAISE = {
    shortest: {
      titles: ['Flawless', 'Textbook', 'Perfect', 'Show-off', 'Spotless'],
      bodies: [
        ['Out in {n} moves, the fewest possible.', 'Not a single wasted wiggle.'],
        ['You did it in {n}, dead on the minimum.', 'The traffic warden is weeping with joy.'],
        ['{n} moves.', 'That’s the shortest route there is.'],
        ['{n} moves, and not one more.', 'Are you sure you’re not a satnav?'],
        ['Shortest possible route: {n} moves.', 'Yours: also {n}. Nicely done.'],
      ],
    },
    longer: {
      titles: ['Well done', 'Road clear', 'Beep beep', 'You’re out', 'Freedom', 'Nailed it'],
      bodies: [
        ['You got out in {n} moves.', 'It can be done in just {s},\nif you fancy another go.'],
        ['Free at last, in {n} moves.', 'The scenic route, mind:\nit can be done in {s}.'],
        ['Escaped in {n} moves.', 'A tidier driver could do it in {s}.\nJust saying.'],
        ['You made it in {n} moves.', 'The shortest route takes {s},\nbut who’s counting? (We are.)'],
        ['{n} moves and the red car is away.', 'Rumour has it {s} moves would do.'],
        ['Out in {n}.', 'The queue behind you is grateful.\nThe shortest route takes {s}.'],
        ['You got out in {n} moves.', 'That’s {d} more than you needed.\nThe red car forgives you.'],
        ['{n} moves. Free at last.', 'Only {d} more than you needed.'],
      ],
    },
  };
  const lastPick = {};

  // Random item, never the same as last time for this list.
  function pick(list, name) {
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === lastPick[name]) i = (i + 1) % list.length;
    lastPick[name] = i;
    return list[i];
  }

  // Restart an element's CSS wave animation.
  function replay(el) {
    el.classList.remove('animate');
    void el.offsetWidth;
    el.classList.add('animate');
  }

  // Wave letters: the face takes the current level's colour, so the
  // extrusions cycle through the other four level colours.
  function waveColours() {
    const current = tier(LEVELS[level].minMoves).cls.slice(1);
    return ['1', '2', '3', '4', '5'].filter((k) => k !== current).map((k) => `var(--tier${k})`);
  }
  function paintWave(el) {
    const colours = waveColours();
    [...el.children].forEach((span, i) => span.style.setProperty('--c', colours[i % colours.length]));
  }

  // Fill a .wave element with one span per character.
  function setWave(el, text) {
    el.dataset.text = text;
    el.style.setProperty('--n', text.length);
    el.textContent = '';
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      span.style.setProperty('--i', i);
      el.appendChild(span);
    });
    paintWave(el);
  }

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

    const kind = moves === shortest ? 'shortest' : 'longer';
    const fill = (line) =>
      line.replace(/\{n\}/g, moves).replace(/\{s\}/g, shortest).replace(/\{d\}/g, moves - shortest);
    let text = pick(PRAISE[kind].bodies, kind + '-body').map(fill).join('\n');
    if (hintsUsed) {
      text += `\nYou had ${hintsUsed === 1 ? 'a little nudge' : 'a few nudges'} from the hints,\nso this one doesn’t go on your record.`;
    }
    setWave($('win-title'), pick(PRAISE[kind].titles, kind + '-title'));
    $('win-title-text').textContent = $('win-title').dataset.text;
    $('win-body').textContent = text;
    const last = level === LEVELS.length - 1;
    $('win-next').textContent = last ? 'Back to level 1' : 'Next level';

    setTimeout(() => {
      $('win').hidden = false;
      replay($('win-title'));
      $('win-next').focus({ preventScroll: true });
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560);
    updateHud();
    renderCards();
  }

  // ---- HUD ----
  function updateHud() {
    const L = LEVELS[level];
    const t = tier(L.minMoves);
    document.documentElement.style.setProperty('--level-ink', `var(--${t.cls.replace('t', 'tier')}-ink)`);
    paintWave(document.querySelector('.brand-word'));
    $('card-name').textContent = `Level ${level + 1} of ${LEVELS.length}`;
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
    const groups = $('card-groups');
    groups.textContent = '';
    for (const t of TIERS) {
      const members = LEVELS.map((L, n) => n).filter((n) => tier(LEVELS[n].minMoves) === t);
      if (!members.length) continue;
      const solved = members.filter((n) => progress.best[LEVELS[n].board]).length;
      const group = document.createElement('section');
      group.className = 'card-group';
      group.innerHTML = `<h3><span>${t.name}</span><span class="count">${solved} of ${members.length} solved</span></h3>`;
      const list = document.createElement('ol');
      list.className = 'card-list';
      members.forEach((n) => list.appendChild(cardButton(n)));
      group.appendChild(list);
      groups.appendChild(group);
    }
  }

  const STAR = '<svg class="star" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50.0,5.0 62.3,36.0 95.7,38.2 70.0,59.5 78.2,91.8 50.0,74.0 21.8,91.8 30.0,59.5 4.3,38.2 37.7,36.0" stroke-linejoin="round"/></svg>';

  // Choosing a level from the list: a panel in the level's colour wipes up
  // the screen (the way the page scrolls back). While it covers the page the
  // level loads and the page returns to the board; then it lifts off the top
  // with echoes in the other four level colours trailing behind it.
  let wiping = false;
  function goToLevel(n) {
    if (wiping) return;
    const arrive = () => {
      startLevel(n);
      window.scrollTo(0, 0);
      $('board').focus({ preventScroll: true });
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !document.body.animate) {
      arrive();
      return;
    }
    wiping = true;
    const main = tier(LEVELS[n].minMoves).cls.slice(1);
    const echoes = ['1', '2', '3', '4', '5'].filter((k) => k !== main);
    // Echoes first so the main colour paints on top of them.
    const panels = [...echoes, main].map((k) => {
      const el = document.createElement('div');
      el.className = 'wipe';
      el.style.background = `var(--tier${k})`;
      document.body.appendChild(el);
      return el;
    });
    const STAGGER = 10;
    const run = (el, from, to, delay, duration) =>
      el.animate([{ transform: from }, { transform: to }], {
        duration, delay, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards',
      }).finished;
    const up = 'translateY(100%)', on = 'translateY(0)', off = 'translateY(-100%)';
    const mainPanel = panels[panels.length - 1];
    run(mainPanel, up, on, 0, 260)
      .then(() => {
        arrive();
        // Slip the echoes in under the main panel, then leave: the main panel
        // first, the echoes trailing after it.
        panels.slice(0, -1).forEach((el) => { el.style.transform = on; });
        return Promise.all(panels.map((el, i) => run(el, on, off, (panels.length - 1 - i) * STAGGER, 300)));
      })
      .finally(() => {
        panels.forEach((el) => el.remove());
        wiping = false;
      });
  }

  function cardButton(n) {
    const L = LEVELS[n];
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card-btn ' + tier(L.minMoves).cls;
    const best = progress.best[L.board];
    const perfect = best && best <= L.minMoves;
    if (best) b.classList.add('done');
    if (perfect) b.classList.add('perfect');
    if (n === level) b.setAttribute('aria-current', 'true');
    // The tile shows only the level number; fill means solved, a star means
    // solved in the fewest possible moves.
    b.innerHTML = `${perfect ? STAR : ''}<span class="n">${n + 1}</span>`;
    const state = perfect ? ', solved in the fewest moves' : best ? ', solved' : '';
    b.setAttribute('aria-label', `Level ${n + 1}, ${tier(L.minMoves).name}${state}`);
    b.addEventListener('click', () => goToLevel(n));
    li.appendChild(b);
    return li;
  }


  window.addEventListener('resize', () => els.forEach((el, i) => place(i, pos[i])));

  // Title intro; tap the title to play it again.
  const brand = document.querySelector('.brand');
  brand.addEventListener('click', () => replay(brand));
  replay(brand);

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
