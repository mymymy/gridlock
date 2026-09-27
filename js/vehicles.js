// Top-down artwork for cars and trucks, drawn as if moulded from one piece
// of coloured plastic: details are only lighter or darker tones laid over
// the vehicle's own colour. Drawn facing right; vertical vehicles are
// rotated to face down.
//
// The cabin roof and the lorry's container stand above the body, so their
// tops are drawn shifted by (ox, oy) to match the camera's view, with
// windows or walls stretching down to the body. game.js works out the
// shift from the vehicle's position.
(function () {
  'use strict';

  const dark = (a) => `fill="#000" fill-opacity="${a}"`;
  const light = (a) => `fill="#fff" fill-opacity="${a}"`;
  const line = (x1, y1, x2, y2, a, w) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity="${a}" stroke-width="${w || 2}" stroke-linecap="round"/>`;
  const glint = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-opacity="0.22" stroke-width="2" stroke-linecap="round"/>`;

  const pt = (x, y) => `${+x.toFixed(1)},${+y.toFixed(1)}`;

  // Sloping walls from the body-level outline b up to a raised top at
  // (x1, y1)-(x2, y2) whose corners are rounded by rx. The walls are clipped
  // to b with its corners rounded by rb, and the seams between them meet the
  // top at the middle of its rounded corners, so no square corner pokes out
  // past a rounded one. A faint underlay fills the slivers the seams leave,
  // and each wall's own shade is reduced to allow for it.
  let clipCount = 0;
  const UNDERLAY = 0.2;
  const over = (a) => +(1 - (1 - a) / (1 - UNDERLAY)).toFixed(3);
  function walls(b, x1, y1, x2, y2, rx, rb, shade) {
    const k = rx * (1 - Math.SQRT1_2);
    const B = [pt(b.x1, b.y1), pt(b.x2, b.y1), pt(b.x2, b.y2), pt(b.x1, b.y2)];
    const R = [pt(x1 + k, y1 + k), pt(x2 - k, y1 + k), pt(x2 - k, y2 - k), pt(x1 + k, y2 - k)];
    const id = 'walls' + ++clipCount;
    const box = `x="${b.x1}" y="${b.y1}" width="${b.x2 - b.x1}" height="${b.y2 - b.y1}" rx="${rb}"`;
    return [
      `<clipPath id="${id}"><rect ${box}/></clipPath>`,
      `<g clip-path="url(#${id})">`,
      `<rect ${box} ${dark(UNDERLAY)}/>`,
      `<polygon points="${B[0]} ${R[0]} ${R[3]} ${B[3]}" ${dark(over(shade.rear))}/>`,
      `<polygon points="${B[0]} ${B[1]} ${R[1]} ${R[0]}" ${dark(over(shade.side))}/>`,
      `<polygon points="${B[3]} ${B[2]} ${R[2]} ${R[3]}" ${dark(over(shade.side))}/>`,
      `<polygon points="${R[1]} ${B[1]} ${B[2]} ${R[2]}" ${dark(over(shade.front))}/>`,
      '</g>',
    ].join('');
  }

  // Glasshouse from the body-level outline b to the roof r, shifted by (ox, oy).
  function cabin(b, r, ox, oy, rearShade) {
    // Keep the roof inside the body outline so the windows never fold over.
    ox = Math.max(b.x1 - r.x1 + 3, Math.min(b.x2 - r.x2 - 3, ox));
    oy = Math.max(b.y1 - r.y1 + 3, Math.min(b.y2 - r.y2 - 3, oy));
    const x1 = r.x1 + ox, x2 = r.x2 + ox, y1 = r.y1 + oy, y2 = r.y2 + oy;
    // Windscreen glint: a short stroke across the middle of the windscreen.
    const gx = (x2 + b.x2) / 2, gy = y1 + 6;
    return [
      walls(b, x1, y1, x2, y2, r.rx, b.rx, { rear: rearShade, side: 0.22, front: 0.4 }),
      glint(gx - 4, gy + 3, gx + 4, gy),
      `<rect x="${+x1.toFixed(1)}" y="${+y1.toFixed(1)}" width="${r.x2 - r.x1}" height="${r.y2 - r.y1}" rx="${r.rx}" ${light(0.14)} stroke="#000" stroke-opacity="0.16" stroke-width="2"/>`,
      glint(x1 + 8, y1 + 7, x2 - 12, y1 + 7),
    ].join('');
  }

  // 200 x 100 units, front at the right.
  const car = (ox, oy) => [
    // Boot line and tail lights
    line(30, 18, 30, 82, 0.14),
    `<rect x="5" y="10" width="8" height="16" rx="3" ${dark(0.32)}/>`,
    `<rect x="5" y="74" width="8" height="16" rx="3" ${dark(0.32)}/>`,
    // Rear window, side windows, windscreen and raised roof
    cabin({ x1: 38, x2: 142, y1: 8, y2: 92, rx: 8 }, { x1: 62, x2: 112, y1: 27, y2: 73, rx: 9 }, ox, oy, 0.36),
    // Wing mirrors
    `<ellipse cx="130" cy="5" rx="6" ry="3" ${dark(0.3)}/>`,
    `<ellipse cx="130" cy="95" rx="6" ry="3" ${dark(0.3)}/>`,
    // Bonnet creases, headlights, grille
    line(142, 26, 184, 32, 0.18),
    line(142, 74, 184, 68, 0.18),
    `<rect x="180" y="10" width="12" height="16" rx="4" ${light(0.28)}/>`,
    `<rect x="180" y="74" width="12" height="16" rx="4" ${light(0.28)}/>`,
    `<rect x="193" y="34" width="3" height="32" rx="1.5" ${dark(0.28)}/>`,
  ].join('');

  // Container from the deck outline b up to its top face r, shifted by (ox, oy),
  // with moulded ribs across the top and down both long sides.
  function container(b, r, ox, oy) {
    // The top may reach the deck edge but never past it.
    ox = Math.max(b.x1 - r.x1, Math.min(b.x2 - r.x2, ox));
    oy = Math.max(b.y1 - r.y1, Math.min(b.y2 - r.y2, oy));
    const x1 = r.x1 + ox, x2 = r.x2 + ox, y1 = r.y1 + oy, y2 = r.y2 + oy;
    const parts = [
      walls(b, x1, y1, x2, y2, r.rx, b.rx, { rear: 0.34, side: 0.22, front: 0.3 }),
      `<rect x="${+x1.toFixed(1)}" y="${+y1.toFixed(1)}" width="${r.x2 - r.x1}" height="${r.y2 - r.y1}" rx="${r.rx}" ${light(0.14)} stroke="#000" stroke-opacity="0.18" stroke-width="2"/>`,
    ];
    // A rib at fraction t along the container meets the deck at the matching
    // point, so it runs down the side walls at the same slant as the ends.
    for (let t = 0.14; t < 0.9; t += 0.145) {
      const tx = x1 + (x2 - x1) * t, bx = b.x1 + (b.x2 - b.x1) * t;
      parts.push(
        line(tx, y1 + 4, tx, y2 - 4, 0.16, 3), glint(tx + 3, y1 + 4, tx + 3, y2 - 4),
        line(tx, y1, bx, b.y1, 0.14, 2), line(tx, y2, bx, b.y2, 0.14, 2)
      );
    }
    return parts.join('');
  }

  // 300 x 100 units, cab at the right.
  const truck = (ox, oy) => [
    // Tail lights on the deck, then the raised container
    `<rect x="8" y="8" width="5" height="14" rx="2" ${dark(0.34)}/>`,
    `<rect x="8" y="78" width="5" height="14" rx="2" ${dark(0.34)}/>`,
    container({ x1: 6, x2: 202, y1: 6, y2: 94, rx: 12 }, { x1: 18, x2: 192, y1: 17, y2: 83, rx: 5 }, ox, oy),
    // Gap between container and cab
    `<rect x="204" y="10" width="6" height="80" rx="2" ${dark(0.38)}/>`,
    // Cab: back wall, side windows, windscreen and roof
    cabin({ x1: 212, x2: 264, y1: 8, y2: 92, rx: 8 }, { x1: 222, x2: 244, y1: 26, y2: 74, rx: 7 }, ox, oy, 0.3),
    `<ellipse cx="244" cy="4" rx="6" ry="3" ${dark(0.3)}/>`,
    `<ellipse cx="244" cy="96" rx="6" ry="3" ${dark(0.3)}/>`,
    // Bonnet, headlights, grille
    line(264, 28, 286, 33, 0.18),
    line(264, 72, 286, 67, 0.18),
    `<rect x="282" y="10" width="11" height="15" rx="4" ${light(0.28)}/>`,
    `<rect x="282" y="75" width="11" height="15" rx="4" ${light(0.28)}/>`,
    `<rect x="294" y="30" width="3" height="40" rx="1.5" ${dark(0.3)}/>`,
  ].join('');

  // ox, oy: roof shift in the vehicle's own units (100 = one cell), facing right.
  window.vehicleArt = function (v, ox, oy) {
    const len = v.len * 100;
    const art = v.len === 3 ? truck(ox || 0, oy || 0) : car(ox || 0, oy || 0);
    const box = v.horiz ? `0 0 ${len} 100` : `0 0 100 ${len}`;
    const inner = v.horiz ? art : `<g transform="translate(100 0) rotate(90)">${art}</g>`;
    return `<svg class="art" viewBox="${box}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
  };
})();
