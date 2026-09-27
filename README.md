# Gridlock

A browser sliding-block puzzle. Slide cars and trucks along their lanes until the red car can drive out of the exit on the right.

## Play

Play online at https://mymymy.github.io/gridlock/ or open `index.html` in a browser. There’s no build step and no dependencies.

- 60 levels: ten each at Beginner, Intermediate, Advanced, Expert, Grand Master and Legend.
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
| `tools/generate.js` | Makes `js/levels.js`. Explores every position reachable from a layout and picks one at a chosen distance from a solution. Easy levels come from random layouts; hard ones from hill climbing (add, remove or move a vehicle, keep the change if the puzzle gets no easier). Legend levels come from `tools/hard-boards.txt`. Takes up to 10 minutes. |
| `tools/search.js` | A longer hunt for very hard boards. Scores each layout by its hardest puzzle over every position the vehicles can take, climbs by adding and removing vehicles, and saves every puzzle of 42 moves or more to `tools/hard-boards.txt`. Runs on one core for as long as you ask. |
| `tools/bundle.js` | Inlines everything into a single `dist/index.html`. |

A board is a 36-character string read row by row: `.` is empty, `A` is the red car and other letters are vehicles.

## Deployment

Every push to `main` runs the tests and publishes the game to GitHub Pages (`.github/workflows/pages.yml`).

## Scripts

```sh
npm test              # solver tests and a minimum-moves check on every level
npm run generate      # regenerate levels (optional seed: npm run generate -- 7)
npm run search -- 600 # hunt for very hard boards for 600 seconds
npm run bundle        # write dist/index.html
```

## Next steps

- Harder still. Legend tops out at 49 moves. Every 6 × 6 board has been checked, and the hardest needs 51.
- Walls (fixed blocks). With one wall the hardest board needs 60 moves.
- Hand-picked difficulty tiers and a larger set of levels.
