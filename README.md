# Rush Hour

A browser prototype of the Rush Hour sliding-block puzzle. Slide cars and trucks along their lanes until the red car can drive out of the exit on the right.

## Play

Play online at https://mymymy.github.io/rush-hour/ or open `index.html` in a browser. There’s no build step and no dependencies.

- Drag a vehicle to slide it. Keyboard: Tab to a vehicle, then use the arrow keys.
- Sliding the same vehicle twice in a row counts as one move, as on the real board.
- **Hint** shows the next move on a shortest route from where you are.
- **Undo** (or Ctrl/Cmd+Z) and **Reset** work as you’d expect.
- Your best score for each card is saved in this browser. Solves that used a hint don’t count towards your best.

## How it works

| File | What it does |
| --- | --- |
| `js/solver.js` | Board model and breadth-first solver. Works in the browser and Node. |
| `js/levels.js` | The challenge cards, each with its par (minimum moves). Generated. |
| `js/game.js` | Rendering, drag and keyboard input, move counting, hints, progress. |
| `tools/generate.js` | Makes `js/levels.js`: random layouts, explores every reachable position, picks positions at a chosen distance from a solution. |
| `tools/bundle.js` | Inlines everything into a single `dist/index.html`. |

A board is a 36-character string read row by row: `.` is empty, `A` is the red car and other letters are vehicles.

## Deployment

Every push to `main` runs the tests and publishes the game to GitHub Pages (`.github/workflows/pages.yml`).

## Scripts

```sh
npm test              # solver tests and a par check on every level
npm run generate      # regenerate levels (optional seed: npm run generate -- 7)
npm run bundle        # write dist/index.html
```

## Next steps

- Harder cards. Random layouts rarely give par above 26. A hill-climbing generator (mutate the hardest layout found so far) should reach the 40–50 move range.
- Hand-picked difficulty tiers and a larger card set.
- Walls (fixed blocks), as in some expansion packs.
