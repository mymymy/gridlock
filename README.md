# Gridlock

A browser sliding-block puzzle. Slide cars and trucks along their lanes until the red car can drive out of the exit on the right.

## Play

Play online at https://mymymy.github.io/gridlock/ or open `index.html` in a browser. There’s no build step and no dependencies.

- 50 levels: ten each at Beginner, Intermediate, Advanced, Expert and Grand Master.
- Drag a vehicle to slide it. Keyboard: Tab to a vehicle, then use the arrow keys.
- Sliding the same vehicle twice in a row counts as one move.
- **Hint** shows the next move on a shortest route from where you are.
- **Undo** (or Ctrl/Cmd+Z) and **Reset** work as you’d expect.
- Your best score for each level is saved in this browser. Solves that used a hint don’t count towards your best.

## How it works

| File | What it does |
| --- | --- |
| `js/solver.js` | Board model and breadth-first solver. Works in the browser and Node. |
| `js/levels.js` | The levels, each with the fewest moves that solve it. Generated. |
| `js/vehicles.js` | Top-down car and truck artwork, drawn as single-colour moulded plastic. |
| `js/game.js` | Rendering, drag and keyboard input, move counting, hints, progress. |
| `tools/generate.js` | Makes `js/levels.js`. Explores every position reachable from a layout and picks one at a chosen distance from a solution. Easy levels come from random layouts; hard ones from hill climbing (add, remove or move a vehicle, keep the change if the puzzle gets no easier). Takes up to 10 minutes. |
| `tools/bundle.js` | Inlines everything into a single `dist/index.html`. |

A board is a 36-character string read row by row: `.` is empty, `A` is the red car and other letters are vehicles.

## Deployment

Every push to `main` runs the tests and publishes the game to GitHub Pages (`.github/workflows/pages.yml`).

## Scripts

```sh
npm test              # solver tests and a minimum-moves check on every level
npm run generate      # regenerate levels (optional seed: npm run generate -- 7)
npm run bundle        # write dist/index.html
```

## Next steps

- Harder still. The hardest known position on a 6 × 6 board needs 51 moves; the generator currently tops out around 44 in its time budget.
- Hand-picked difficulty tiers and a larger set of levels.
- Walls (fixed blocks), as in some expansion packs.
