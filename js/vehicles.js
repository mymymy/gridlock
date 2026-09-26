// Top-down artwork for cars and trucks, drawn as if moulded from one piece
// of coloured plastic: details are only lighter or darker tones laid over
// the vehicle's own colour. Drawn facing right; vertical vehicles are
// rotated to face down.
(function () {
  'use strict';

  const dark = (a) => `fill="#000" fill-opacity="${a}"`;
  const light = (a) => `fill="#fff" fill-opacity="${a}"`;
  const line = (x1, y1, x2, y2, a, w) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity="${a}" stroke-width="${w || 2}" stroke-linecap="round"/>`;
  const glint = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-opacity="0.22" stroke-width="2" stroke-linecap="round"/>`;

  // 200 x 100 units, front at the right.
  const CAR = [
    // Boot line and tail lights
    line(30, 18, 30, 82, 0.14),
    `<rect x="5" y="10" width="8" height="16" rx="3" ${dark(0.32)}/>`,
    `<rect x="5" y="74" width="8" height="16" rx="3" ${dark(0.32)}/>`,
    // Glasshouse: rear window, side windows, windscreen
    `<polygon points="40,14 58,21 58,79 40,86" ${dark(0.36)}/>`,
    `<polygon points="42,12 58,19 116,19 140,11" ${dark(0.22)}/>`,
    `<polygon points="42,88 58,81 116,81 140,89" ${dark(0.22)}/>`,
    `<polygon points="116,21 140,12 140,88 116,79" ${dark(0.4)}/>`,
    glint(124, 26, 133, 22),
    // Raised roof panel
    `<rect x="58" y="21" width="58" height="58" rx="9" ${light(0.14)} stroke="#000" stroke-opacity="0.16" stroke-width="2"/>`,
    glint(66, 28, 104, 28),
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

  // 300 x 100 units, cab at the right.
  function truck() {
    const parts = [
      // Cargo box with moulded ribs
      `<rect x="6" y="6" width="196" height="88" rx="6" ${light(0.1)} stroke="#000" stroke-opacity="0.2" stroke-width="2"/>`,
      `<rect x="8" y="8" width="5" height="14" rx="2" ${dark(0.34)}/>`,
      `<rect x="8" y="78" width="5" height="14" rx="2" ${dark(0.34)}/>`,
    ];
    for (let x = 30; x <= 180; x += 25) {
      parts.push(line(x, 12, x, 88, 0.16, 3), glint(x + 3, 12, x + 3, 88));
    }
    parts.push(
      // Gap between box and cab
      `<rect x="204" y="10" width="6" height="80" rx="2" ${dark(0.38)}/>`,
      // Cab roof, side windows, windscreen
      `<rect x="214" y="16" width="32" height="68" rx="7" ${light(0.16)} stroke="#000" stroke-opacity="0.15" stroke-width="2"/>`,
      `<polygon points="216,10 246,10 262,6 262,12 246,16 216,16" ${dark(0.22)}/>`,
      `<polygon points="216,90 246,90 262,94 262,88 246,84 216,84" ${dark(0.22)}/>`,
      `<polygon points="246,17 262,11 262,89 246,83" ${dark(0.42)}/>`,
      glint(252, 22, 258, 19),
      `<ellipse cx="244" cy="4" rx="6" ry="3" ${dark(0.3)}/>`,
      `<ellipse cx="244" cy="96" rx="6" ry="3" ${dark(0.3)}/>`,
      // Bonnet, headlights, grille
      line(264, 28, 286, 33, 0.18),
      line(264, 72, 286, 67, 0.18),
      `<rect x="282" y="10" width="11" height="15" rx="4" ${light(0.28)}/>`,
      `<rect x="282" y="75" width="11" height="15" rx="4" ${light(0.28)}/>`,
      `<rect x="294" y="30" width="3" height="40" rx="1.5" ${dark(0.3)}/>`
    );
    return parts.join('');
  }
  const TRUCK = truck();

  window.vehicleArt = function (v) {
    const len = v.len * 100;
    const art = v.len === 3 ? TRUCK : CAR;
    const box = v.horiz ? `0 0 ${len} 100` : `0 0 100 ${len}`;
    const inner = v.horiz ? art : `<g transform="translate(100 0) rotate(90)">${art}</g>`;
    return `<svg class="art" viewBox="${box}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
  };
})();
