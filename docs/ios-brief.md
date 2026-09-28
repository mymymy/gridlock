# Gridlock for iOS: brief

Build a native iOS version of Gridlock, the sliding-car puzzle at
https://github.com/mymymy/gridlock (live at https://mymymy.github.io/gridlock/).
The web version is the reference for rules, levels, look and feel: clone it
alongside and read it rather than guessing.

## How to work

- New repo, `gridlock-ios`, next to the web one. Swift and SwiftUI, no
  third-party dependencies unless there's a strong reason.
- Generate the Xcode project from a text spec (XcodeGen, `project.yml`) so it
  diffs cleanly, or use a plain Xcode project if that proves simpler.
- Put the game logic in a Swift package (`GridlockCore`) with no UI imports,
  and test it with `swift test`. The app target depends on it.
- Build and run in the Simulator yourself (`xcodebuild`, `xcrun simctl`) and
  look at screenshots before calling anything done.
- Target the current iOS and the one before. iPhone first, portrait only;
  iPad can come later.
- British English in all text. Curly quotes and apostrophes. Spaced en dashes
  ( – ). No exclamation marks in game messages.
- Commit in small, working steps with clear messages. Don't publish anything
  (TestFlight, App Store) without asking.

## Milestones

1. **Core** (`GridlockCore`): board model, solver, levels, progress. Tests
   prove the solver agrees with every level's `minMoves`.
2. **Board**: draw the grid and vehicles, drag to slide, move counting, undo,
   reset, win detection with the red car driving out.
3. **Game**: level list grouped by tier, result panel with the praise
   messages, hints, the level-change wipe, saved progress.
4. **Polish**: haptics, VoiceOver, dark mode, app icon, launch screen.
5. **Shipping** (ask first): StoreKit, privacy details, App Store assets.

## Rules (from `js/solver.js`)

- 6×6 grid. Board string: 36 characters, row by row. `.` is empty, `A` is the
  red car (always horizontal, on row 3, index 2), other letters are vehicles
  of length 2 or 3, horizontal or vertical by their cell layout.
- A vehicle slides along its own lane only. Sliding any distance counts as
  one move, and sliding the same vehicle again straight after is still the
  same move (merge consecutive moves of one vehicle, dropping it if it ends
  where it started).
- Solved when the red car's left edge reaches column 5 (index 4); it then
  drives out through the exit on the right of row 3.
- The solver is a breadth-first search over positions; hints show the first
  move of a shortest route from the current position.

## Levels (from `js/levels.js`)

90 levels, each `{ board, minMoves }`, fifteen per tier. Ship them as a bundled
JSON file generated from `js/levels.js` (a small script is fine), and test
that every one solves in exactly `minMoves`. Level 90 is the hardest possible
6×6 board (51 moves), from Michael Fogleman's database
(github.com/fogleman/rush, MIT licence): keep the credit in the app's
acknowledgements.

Tiers by `minMoves`, with their colours:

| Tier | Moves | Colour |
| --- | --- | --- |
| Beginner | up to 7 | #2e9f78 |
| Intermediate | 8–14 | #e3a52a (dark text on it) |
| Advanced | 15–21 | #3b7bd6 |
| Expert | 22–34 | #d6312a |
| Master | 35–41 | #8a68cf |
| Grand Master | 42+ | #e0368a |

## Look and feel (see `style.css`, `js/vehicles.js`, `js/game.js`)

- Palette: tarmac board #3a3f47 (dark mode #2c3036) with a darker rim;
  road-marking yellow #f0c02e for the exit dashes; red car #d6312a.
  Vehicle colours in order: blue #3b7bd6, green #2e9f78, orange #e38d2a,
  purple #8a68cf, pink #de6a9d, teal #33a4b6, tan #b48a4c, olive #78a03c,
  indigo #4b5ea8, yellow #e8c547, sage #5d8e8a, plum #9c5a9a.
- Vehicles are top-down cars and lorries, as if moulded from one piece of
  coloured plastic: detail is only lighter or darker tones of the body
  colour. Cars have a raised roof with windows sloping down to the body;
  lorries have a raised, ribbed container and a cab. Roofs and containers
  shift slightly with the vehicle's position on the board, as if seen by a
  camera above the centre, and the body shows side walls in the same
  direction. Keep rounded corners consistent (nothing square poking past a
  rounded edge). Port the shapes from `js/vehicles.js` (Canvas or Shapes).
- Title 'Gridlock' in Megazoid italic with a 'Mexican wave' animation: each
  letter rises to reveal a coloured extrusion (other tier colours), all hold
  briefly, then sink left to right, each faster than the last. The result
  panel's headline does the same on a loop with a pause between waves.
- Level change: a panel in the new level's tier colour wipes up from the
  bottom, the big level number (Megazoid italic, 'LEVEL' above it) holds for
  250 ms, then the panel lifts off the top with echoes in the other tier
  colours trailing it.
- Result messages: copy the `PRAISE` lists from `js/game.js` exactly,
  including hand-set line breaks. Solves that used a hint don't count
  towards the best score.
- Level tiles show the number; solved ones fill with the tier colour, and a
  small star marks a solve in the minimum number of moves.
- Fonts: Megazoid (DJR) for display, Special Gothic (Google Fonts, OFL) for
  everything else, wide cut for labels and buttons. **The Megazoid licence
  covers the web only**: use it for development, but flag that an app
  licence is needed from DJR before release. Font files are in `fonts/`.

## Platform features

- Haptics: a light tap when a vehicle settles, a nudge when it's pushed
  against something, a success pattern on a win (UIKit feedback generators or
  SwiftUI `sensoryFeedback`).
- VoiceOver: each vehicle is an adjustable element named by colour and type
  ('blue car', 'green lorry', numbered if a colour repeats) whose value is its
  position ('row 1, columns B to C'; columns A–F, rows 1–6). Swipe up and down
  slides it; announce blocked moves, undos and wins. Hints name the vehicle
  and target. The web version's wording in `js/game.js` is the model.
- Respect Reduce Motion: skip the wipe and wave animations.
- Progress (best moves per level, keyed by board string, and the current
  level) in UserDefaults or SwiftData. No accounts, no tracking, no ads.

## Daily puzzle

`js/daily.js` holds two years of daily puzzles from 28 September 2026, as
`[board, minMoves]`; the day's puzzle is the one at (days since `start`, in
local time) modulo the list length. Difficulty rises Monday to Sunday.
Bundle it like the levels. A 'Today's puzzle' tile sits above the level list
(date, tier, solved or not, and a streak of consecutive days once it reaches
two); playing it uses the level wipe with 'Daily' and the day of the month,
and 'Back to the levels' returns to the level you were on. A solve counts
towards the streak even with hints, but only hint-free solves set a best.
`js/game.js` (`dailyFor`, `streak`, `renderDaily`) is the reference.

## Not yet

No sound, no sharing, no ads. The price model (99p, or free with a one-off
unlock) is undecided: leave StoreKit until asked.
