# Gridlock

A browser sliding-block puzzle. Slide cars and trucks along their lanes until the red car can drive out of the exit on the right.

## Play

Play online at https://mymymy.github.io/gridlock/ or open `index.html` in a browser. There’s no build step and no dependencies.

- 90 levels: fifteen each at Beginner, Intermediate, Advanced, Expert, Master and Grand Master.
- A daily puzzle, the same for everyone each day. It gets harder through the week, from 8–10 moves on Mondays to 30–34 on Sundays, and counts your streak of days in a row.
- Drag a vehicle to slide it. Keyboard: Tab to a vehicle, then use the arrow keys.
- Sliding the same vehicle twice in a row counts as one move.
- **Hint** shows the next move on a shortest route from where you are.
- **Undo** (or Ctrl/Cmd+Z) and **Reset** work as you’d expect.
- Your best score for each level is saved in this browser. Solves that used a hint don’t count towards your best.
- Install it as an app: on iPhone, Share → Add to Home Screen; on Android, Install app. It works offline once opened.
- Haptics: a tap when a vehicle settles, a nudge when you push into something, a buzz when you win. Android uses the Vibration API; iPhones (iOS 18+) get a light tap from a hidden switch control, as Safari has no Vibration API.
- Screen readers: each vehicle is a slider named by colour and type (‘blue car, across’) that reads out where it is (‘row 1, columns B to C’). Arrow keys or swipes up and down slide it; blocked moves, hints, undos and wins are announced.

## How it works

| File | What it does |
| --- | --- |
| `js/solver.js` | Board model and breadth-first solver. Works in the browser and Node. |
| `js/levels.js` | The levels, each with the fewest moves that solve it. Generated. |
| `js/daily.js` | Two years of daily puzzles from 28 September 2026, each with its fewest moves. Generated. |
| `js/vehicles.js` | Top-down car and truck artwork, drawn as single-colour moulded plastic. |
| `js/game.js` | Rendering, drag and keyboard input, move counting, hints, progress. |
| `tools/generate.js` | Makes `js/levels.js`. Explores every position reachable from a layout and picks one at a chosen distance from a solution. Easy levels come from random layouts; hard ones from hill climbing (add, remove or move a vehicle, keep the change if the puzzle gets no easier). Expert, Master and Grand Master levels mostly come from `tools/hard-boards.txt`. Takes up to 10 minutes. |
| `tools/search.js` | A longer hunt for very hard boards. Scores each layout by its hardest puzzle over every position the vehicles can take, climbs by adding and removing vehicles, and saves every puzzle of 42 moves or more (or a lower threshold you give it) to `tools/hard-boards.txt`. Runs on one core for as long as you ask. |
| `tools/daily.js` | Makes `js/daily.js`. Easier days come from random layouts, harder ones from a pool made by `tools/search.js` with a low threshold; each is checked with the solver and none repeats a level or another day. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install. The deploy stamps each release into the service worker so installed copies update. `tools/icons.js` renders the icons: a close-up of level 1’s red car. |
| `tools/bundle.js` | Inlines everything into a single `dist/index.html`. |

A board is a 36-character string read row by row: `.` is empty, `A` is the red car and other letters are vehicles.

## Deployment

Every push to `main` runs the tests and publishes the game to GitHub Pages (`.github/workflows/pages.yml`).

## Scripts

```sh
npm test              # solver tests and a minimum-moves check on every level
npm run generate      # regenerate levels (optional seed: npm run generate -- 7)
npm run search -- 600 # hunt for very hard boards for 600 seconds
node tools/search.js 300 77 18 pool.txt && node tools/daily.js pool.txt  # remake the daily puzzles
npm run bundle        # write dist/index.html
```

## Next steps

- More Grand Master levels near the top. Every 6 × 6 board has been checked and the hardest needs 51 moves; level 90 is that board, from [Michael Fogleman’s Rush Hour database](https://www.michaelfogleman.com/rush/) ([code](https://github.com/fogleman/rush), MIT licence). Our own search has reached 49.
- Walls (fixed blocks). With one wall the hardest board needs 60 moves.
- Hand-picked difficulty tiers and a larger set of levels.
