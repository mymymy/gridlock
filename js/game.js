// Gridlock game: rendering, dragging, move counting, hints and progress.
(function () {
  'use strict';

  const Solver = window.Solver;
  const LEVELS = window.GRIDLOCK_LEVELS;
  const UNIT = 100 / Solver.SIZE; // one cell as a percentage of the grid
  const STORE_KEY = 'gridlock-progress-v1';
  const OLD_STORE_KEY = 'rush-hour-progress-v1';

  const $ = (id) => document.getElementById(id);
  const gridEl = $('grid');

  let level = 0; // the level in the list; the daily puzzle doesn't change it
  let puzzle = null; // what's on the board: { board, minMoves, daily?, date? }
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
      // Carry over progress saved under the key used before the rename.
      const saved = localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY);
      return JSON.parse(saved) || { best: {}, level: 0 };
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
    { name: 'Master', cls: 't5', upTo: 41 },
    { name: 'Grand Master', cls: 't6', upTo: Infinity },
  ];
  const tier = (minMoves) => TIERS.find((t) => minMoves <= t.upTo);

  // ---- Daily puzzle ----
  // The same puzzle for everyone each day, from js/daily.js. Days count from
  // the file's start in local time; after the last puzzle they repeat.
  const DAILY = window.GRIDLOCK_DAILY;
  const dayKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const longDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  function dailyFor(date) {
    const [y, m, d] = DAILY.start.split('-').map(Number);
    const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000);
    const count = DAILY.puzzles.length;
    const [board, minMoves] = DAILY.puzzles[((days % count) + count) % count];
    return { board, minMoves, daily: dayKey(date), date };
  }
  // Days in a row with the daily puzzle solved, up to today (or yesterday,
  // if today's isn't done yet).
  function streak() {
    const done = progress.daily || {};
    const d = new Date();
    if (!done[dayKey(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    for (; done[dayKey(d)]; d.setDate(d.getDate() - 1)) n++;
    return n;
  }

  // ---- Level setup ----
  function startLevel(n) {
    level = Math.max(0, Math.min(LEVELS.length - 1, n));
    progress.level = level;
    save();
    startPuzzle(LEVELS[level]);
  }
  const startDaily = () => startPuzzle(dailyFor(new Date()));

  function startPuzzle(p) {
    puzzle = p;
    const parsed = Solver.parse(puzzle.board);
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
    $('board').setAttribute(
      'aria-label',
      `${puzzle.daily ? `Daily puzzle for ${longDate(puzzle.date)}` : `Level ${level + 1}`}, ${tier(puzzle.minMoves).name}. ${vehicles.length} vehicles. ` +
        'Columns A to F run left to right and rows 1 to 6 top to bottom. The exit is on the right of row 3. ' +
        'Tab to a vehicle to hear where it is, then use the arrow keys, or swipe up and down, to slide it.'
    );
  }

  // Each vehicle holds an invisible slider over its whole body. Screen
  // readers treat it as something to slide (arrow keys, or swipe up and
  // down on a phone) and read out where the vehicle is; drags go to the
  // vehicle itself.
  function buildVehicles() {
    gridEl.textContent = '';
    const names = vehicleNames();
    els = vehicles.map((v, i) => {
      const el = document.createElement('div');
      el.className = 'vehicle ' + (v.horiz ? 'h' : 'v') + (v.len === 3 ? ' truck' : '') + (i === 0 ? ' red' : '');
      if (i > 0) el.style.setProperty('--c', `var(--v${((i - 1) % 12) + 1})`);
      el.innerHTML = '<div class="body"></div><input class="lane" type="range" step="1">';
      const lane = el.lastChild;
      lane.min = 0;
      lane.max = Solver.SIZE - v.len;
      lane.setAttribute('aria-label', `${names[i]}, ${v.horiz ? 'across' : 'up and down'}`);
      lane.addEventListener('input', () => onSlide(i));
      lane.addEventListener('keydown', (e) => onLaneKey(e, i));
      el.addEventListener('pointerdown', (e) => onPointerDown(e, i));
      gridEl.appendChild(el);
      place(i, pos[i], el);
      return el;
    });
    vehicles.forEach((v, i) => sync(i));
  }

  // Spoken names: 'red car', then each vehicle's colour, numbered when a
  // colour comes round again.
  const COLOUR_NAMES = ['blue', 'green', 'orange', 'purple', 'pink', 'teal', 'tan', 'olive', 'indigo', 'yellow', 'sage', 'plum'];
  function vehicleNames() {
    const seen = {};
    return vehicles.map((v, i) => {
      const name = i === 0 ? 'red car' : `${COLOUR_NAMES[(i - 1) % 12]} ${v.len === 3 ? 'lorry' : 'car'}`;
      seen[name] = (seen[name] || 0) + 1;
      return seen[name] > 1 ? `${name} ${seen[name]}` : name;
    });
  }
  const capitalise = (text) => text[0].toUpperCase() + text.slice(1);

  // Where a vehicle sits, in columns A to F and rows 1 to 6.
  function where(i, p) {
    const v = vehicles[i];
    const col = (c) => 'ABCDEF'[c];
    return v.horiz
      ? `row ${v.fixed + 1}, columns ${col(p)} to ${col(p + v.len - 1)}`
      : `column ${col(v.fixed)}, rows ${p + 1} to ${p + v.len}`;
  }

  // A slider's value runs the way its arrow keys do: up is higher, so an
  // up-and-down vehicle's value counts from the bottom.
  const toValue = (i, p) => (vehicles[i].horiz ? p : Solver.SIZE - vehicles[i].len - p);
  function sync(i) {
    const lane = els[i].querySelector('.lane');
    lane.value = toValue(i, pos[i]);
    lane.setAttribute('aria-valuetext', where(i, pos[i]));
    lane.disabled = solved;
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
    const half = Solver.SIZE / 2;
    const cx = v.horiz ? p + v.len / 2 : v.fixed + 0.5;
    const cy = v.horiz ? v.fixed + 0.5 : p + v.len / 2;
    const height = (gridEl.clientWidth / Solver.SIZE) * 0.1;
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
  // Sliding the same vehicle twice in a row counts as one move.
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
    sync(i);
    clearHint();
    updateHud();
    if (Solver.isSolved(pos)) win();
    else haptic.tap();
  }

  function undo() {
    if (solved || !history.length) return;
    const m = history.pop();
    pos[m.vehicle] = m.from;
    place(m.vehicle, m.from);
    sync(m.vehicle);
    clearHint();
    updateHud();
    announce(`Undone. ${capitalise(vehicleNames()[m.vehicle])} back to ${where(m.vehicle, m.from)}.`);
  }

  function reset() {
    if (!history.length && !solved) return;
    startPuzzle(puzzle);
  }

  // ---- Input ----
  function onPointerDown(e, i) {
    if (solved || drag) return;
    e.preventDefault();
    const el = els[i];
    el.setPointerCapture(e.pointerId);
    const [lo, hi] = Solver.range(vehicles, pos, i);
    drag = {
      i,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: pos[i],
      lo,
      hi,
      cell: gridEl.clientWidth / Solver.SIZE,
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
    const wanted = drag.start + delta;
    drag.at = Math.max(drag.lo, Math.min(drag.hi, wanted));
    place(drag.i, drag.at);
    // A nudge when the vehicle is pushed up against something.
    const pushing = wanted < drag.lo - 0.1 || wanted > drag.hi + 0.1;
    if (pushing && !drag.pushing) haptic.bump();
    drag.pushing = pushing;
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

  // Arrow keys across a vehicle's lane do nothing; along it, the slider
  // moves as usual and onSlide takes over.
  function onLaneKey(e, i) {
    const across = vehicles[i].horiz ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (across.includes(e.key)) e.preventDefault();
  }

  // The slider moved (key, swipe or screen reader): slide as far towards
  // it as the lane allows.
  function onSlide(i) {
    if (solved) return;
    const v = vehicles[i];
    const lane = els[i].querySelector('.lane');
    const wanted = toValue(i, Number(lane.value)); // same sum both ways
    const [lo, hi] = Solver.range(vehicles, pos, i);
    const p = Math.max(lo, Math.min(hi, wanted));
    if (p === pos[i]) {
      sync(i);
      haptic.bump();
      const way = v.horiz ? (wanted > p ? 'right' : 'left') : wanted > p ? 'down' : 'up';
      announce(`Blocked. The ${vehicleNames()[i]} can’t move ${way}.`);
      return;
    }
    commit(i, p);
  }

  // ---- Hints ----
  function showHint() {
    if (solved) return;
    clearHint();
    const solution = Solver.solve(vehicles, pos);
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
    setHelp(`Hint: slide the ${vehicleNames()[m.vehicle]} to ${where(m.vehicle, m.to)}, the dashed outline.`);
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

  // Keep the success headline waving while the result panel is open: once
  // every letter has sunk, pause, then go again.
  const WAVE_PAUSE = 1200;
  let sunk = 0;
  let waveTimer = null;
  $('win-title').addEventListener('animationend', (e) => {
    const el = e.currentTarget;
    if (e.animationName !== 'letter-sink' || ++sunk < el.children.length) return;
    sunk = 0;
    clearTimeout(waveTimer);
    waveTimer = setTimeout(() => {
      if (!$('win').hidden) replay(el);
    }, WAVE_PAUSE);
  });
  function startWinWave() {
    clearTimeout(waveTimer);
    sunk = 0;
    replay($('win-title'));
  }

  // Wave letters: the face takes the current level's colour, so the
  // extrusions cycle through the other level colours.
  function waveColours() {
    const current = tier(puzzle.minMoves).cls.slice(1);
    return TIERS.map((t) => t.cls.slice(1)).filter((k) => k !== current).map((k) => `var(--tier${k})`);
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
    const shortest = puzzle.minMoves;
    const key = puzzle.board;
    const prev = progress.best[key];
    if (!hintsUsed && (!prev || moves < prev)) progress.best[key] = moves;
    // A daily puzzle counts towards the streak however it was solved.
    if (puzzle.daily) (progress.daily = progress.daily || {})[puzzle.daily] = true;
    save();

    vehicles.forEach((v, i) => sync(i));
    haptic.win();
    const red = els[0];
    red.classList.add('leaving');
    red.style.left = Solver.SIZE * UNIT + 4 + '%';

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
    $('win-next').textContent = puzzle.daily ? 'Back to the levels' : last ? 'Back to level 1' : 'Next level';

    announce(`${$('win-title').dataset.text}. ${text.replace(/\n/g, ' ')}`);
    setTimeout(() => {
      $('win').hidden = false;
      startWinWave();
      $('win-next').focus({ preventScroll: true });
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560);
    updateHud();
    renderCards();
  }

  // ---- HUD ----
  function updateHud() {
    const L = puzzle;
    const t = tier(L.minMoves);
    document.documentElement.style.setProperty('--level-ink', `var(--${t.cls.replace('t', 'tier')}-ink)`);
    paintWave(document.querySelector('.brand-word'));
    $('card-name').textContent = L.daily ? 'Today’s puzzle' : `Level ${level + 1} of ${LEVELS.length}`;
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

  // Say something to screen reader users without moving focus. Clearing
  // first means the same words are read again if they repeat.
  function announce(text) {
    const el = $('announce');
    el.textContent = '';
    requestAnimationFrame(() => (el.textContent = text));
  }

  // Haptics: a tap when a vehicle settles, a nudge when it's pushed into
  // something, a buzz for a win. Android has the Vibration API. iPhones
  // don't, but Safari (iOS 18 and later) gives a light tap when a switch
  // control is toggled, so a hidden one stands in.
  const haptic = (() => {
    if (navigator.vibrate) {
      return {
        tap: () => navigator.vibrate(8),
        bump: () => navigator.vibrate(18),
        win: () => navigator.vibrate([20, 70, 20, 70, 40]),
      };
    }
    if (!('switch' in HTMLInputElement.prototype)) return { tap() {}, bump() {}, win() {} };
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    label.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.appendChild(label);
    const tick = () => label.click();
    return {
      tap: tick,
      bump: tick,
      win: () => [0, 110, 220].forEach((t) => setTimeout(tick, t)),
    };
  })();

  function renderDaily() {
    const p = dailyFor(new Date());
    const t = tier(p.minMoves);
    const done = !!(progress.daily && progress.daily[p.daily]);
    const days = streak();
    const b = $('daily');
    b.className = `daily-btn ${t.cls}${done ? ' done' : ''}`;
    if (puzzle && puzzle.daily === p.daily) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
    const state = (done ? 'Solved' : 'Not solved yet') + (days > 1 ? ` · ${days}-day streak` : '');
    b.innerHTML =
      `<span class="daily-title">Today’s puzzle</span>` +
      `<span class="daily-meta">${longDate(p.date)} · ${t.name}</span>` +
      `<span class="daily-state">${state}</span>`;
  }

  function renderCards() {
    renderDaily();
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

  // Moving to a new level or the daily puzzle (from the list or the result
  // panel): a panel in the puzzle's colour wipes up the screen (the way the
  // page scrolls back). While it covers the page the puzzle loads and the
  // page returns to the board; then it lifts off the top with echoes in the
  // other level colours trailing behind it. target is a level index or 'daily'.
  let wiping = false;
  function goTo(target) {
    if (wiping) return;
    const daily = target === 'daily';
    const p = daily ? dailyFor(new Date()) : LEVELS[target];
    const arrive = () => {
      if (daily) startDaily();
      else startLevel(target);
      window.scrollTo(0, 0);
      $('board').focus({ preventScroll: true });
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !document.body.animate) {
      arrive();
      return;
    }
    wiping = true;
    const main = tier(p.minMoves).cls.slice(1);
    const echoes = TIERS.map((t) => t.cls.slice(1)).filter((k) => k !== main);
    // Echoes first so the main colour paints on top of them.
    const panels = [...echoes, main].map((k) => {
      const el = document.createElement('div');
      el.className = 'wipe';
      el.setAttribute('aria-hidden', 'true');
      el.style.background = `var(--tier${k})`;
      document.body.appendChild(el);
      return el;
    });
    const STAGGER = 25;
    const run = (el, from, to, delay, duration) =>
      el.animate([{ transform: from }, { transform: to }], {
        duration, delay, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards',
      }).finished;
    const up = 'translateY(100%)', on = 'translateY(0)', off = 'translateY(-100%)';
    const mainPanel = panels[panels.length - 1];
    mainPanel.classList.add(`t${main}`);
    // The level number sits inside the main panel but moves the opposite way,
    // so it stays still on screen while the panel reveals and hides it.
    const number = document.createElement('div');
    number.className = 'wipe-number';
    // The daily puzzle shows the date, with the month below the day.
    const month = daily && p.date.toLocaleDateString('en-GB', { month: 'long' });
    number.innerHTML = daily
      ? `<span class="wipe-label">Daily</span><span class="wipe-digits">${p.date.getDate()}</span><span class="wipe-label">${month}</span>`
      : `<span class="wipe-label">Level</span><span class="wipe-digits">${target + 1}</span>`;
    mainPanel.appendChild(number);
    const HOLD = 250; // time fully covered, to read the number
    const down = 'translateY(-100%)', under = 'translateY(100%)';
    Promise.all([run(mainPanel, up, on, 0, 260), run(number, down, on, 0, 260)])
      .then(() => {
        arrive();
        // Slip the echoes in under the main panel, then leave: the main panel
        // first, the echoes trailing after it.
        panels.slice(0, -1).forEach((el) => { el.style.transform = on; });
        return Promise.all([
          run(number, on, under, HOLD, 450),
          ...panels.map((el, i) => run(el, on, off, HOLD + (panels.length - 1 - i) * STAGGER, 450)),
        ]);
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
    if (n === level && !(puzzle && puzzle.daily)) b.setAttribute('aria-current', 'true');
    // The tile shows only the level number; fill means solved, a star means
    // solved in the fewest possible moves.
    b.innerHTML = `${perfect ? STAR : ''}<span class="n">${n + 1}</span>`;
    const state = perfect ? ', solved in the fewest moves' : best ? ', solved' : '';
    b.setAttribute('aria-label', `Level ${n + 1}, ${tier(L.minMoves).name}${state}`);
    b.addEventListener('click', () => goTo(n));
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
  // From the daily puzzle, back to the level you were on.
  $('win-next').addEventListener('click', () =>
    goTo(puzzle.daily ? level : level === LEVELS.length - 1 ? 0 : level + 1)
  );
  $('daily').addEventListener('click', () => goTo('daily'));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  });

  startLevel(progress.level || 0);
})();
