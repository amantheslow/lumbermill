# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Heartwood Mill: a browser forest factory-builder made as a tribute to BWDev's *Lumbermill*. All code and art are original, and every sprite and sound is generated at runtime, so there are no asset files. `README.md` describes the game, the story and the controls for players.

## Running and checking

There is no build step, package manager, linter or test suite. It is plain HTML with classic `<script>` tags.

- Serve locally with `python3 -m http.server 8000`, then open http://localhost:8000. Opening `index.html` directly also works, but autosave is stored per origin.
- Syntax-check a script with `node --check js/sim.js`.
- To verify behaviour, drive the page with Playwright, which is preinstalled in cloud sessions (`require('playwright')`). The game exposes everything as globals, so tests can call `simStep`, `G`, `placeBuilding` and so on from `page.evaluate`. Keep test scripts outside the repo.
  - Headless rendering is slow, so the real-time loop crawls even at 4x. Advance time by looping `simStep(0.05)` inside `page.evaluate` instead of waiting for frames.
  - To click a tile, compute its screen position from the camera, the same way `screenToWorld` does (`R.cam` plus `R.cv` size). `R.ox` and `R.oy` only update when a frame renders.
  - Page errors are worth capturing (`page.on('pageerror')`). `frame()` schedules its next frame first so one error can't stop the loop, which means errors no longer surface as a frozen game.
- The game is published as a claude.ai Artifact from `index.html`, with a `files` map covering every `js/*.js` file and the `downloads` capability (used for save files). `index.html` therefore has no `<!doctype>`, `<html>`, `<head>` or `<body>`, because the publisher wraps the page. Its inline charset and viewport metas exist only for local use.
- Artifact CSP: external stylesheets only from Google Fonts, with no other remote assets. Don't add CDN images or fonts.

## Architecture

The scripts in `js/` load in order: core, audio, art, sim, render, ui, story, save, main. They share one global scope, with no modules. Top-level `const` and `function` declarations are visible across files. Load order only matters for code that runs at parse time, since most cross-file calls happen at runtime.

- **core.js:** constants (`MAP` = 72×72 tiles, 2:1 isometric with `HTW`/`HTH`), seeded RNG (`rand`, `ri`, `rf`, `pick`, `chance`), value noise, `isoX`/`isoY`/`screenToTile`, colour packing (`C()` gives packed ABGR uint32), and `PixBuf`, a small rasteriser used to draw all the pixel art.
- **art.js:** `bakeArt()` builds every sprite once at boot into `ART`. Sprites are `{cv, ax, ay}`, where `ax, ay` is the anchor: the tile centre for trees and workers, or the footprint's top corner for buildings. Trees are baked per season (`ART.seasons[0..3]`, each with normal, sick and fog variants). Winter buildings are a second bake with the `SNOW` flag set (`ART.bWinter`), plus `winterOf()` for snow caps. Toolbar and chip icons are data URLs in `ART.icons`.
- **sim.js:** all game state lives in the global `G`, created by `blankState()` and filled by `newGame(seed)`. It holds the tile grids (`tiles`, `reveal`, `occ`, `stump`, `plantMark` as typed arrays), the `tree[]` grid plus the `trees` list, `belt[]` plus `belts`, buildings (`buildings` plus the `bmap` id lookup), workers, the economy, research, letters and contracts. Static definitions sit at the top: `BDEF`, `RECIPES`, `ITEMS`, `RESEARCH`, `PERSONALITIES`, seasons.
  - **Time:** `simStep(dt)` is a fixed 0.05 s step, run `G.speed` times per frame. `MIN_PER_SEC = 20`, so a day lasts 72 s at 1x. A season is 12 days.
  - **Daily events:** `newDay()` handles the forest lifecycle, wages, market and events.
  - **Staff:** workers run a state machine (`idle → think() → walk → arrive() → act → finishAct()`) with A* in `findPath`. Needs and fire come first, then role work.
  - **Factory:** machines take items through `accepts`/`receive` and output with `pushOut` onto adjacent belts pointing away. Any building with `recipes` in its `BDEF` is a production machine (input from `RECIPES`, tuning level `b.lvl` scaling speed and power through `MK_SPEED`/`MK_POWER`). A building with `cap` is a buffer that queues items in `b.out` (splitter, sorter, storehouse). The sorter uses `b.dir` and `b.filter`, set with R before placing (`UI.beltDir`). `water: true` buildings must touch water (`touchesWater`). Power networks are rebuilt by `recomputePower` whenever `G.powerDirty` is set, with `isPole`/`isSource` deciding a building's part; pylons link to each other at `BDEF.pylon.link`.
  - **Progression:** the mill's rank comes from total sales (`RANKS`, `rankOf()`). `G.rank` is the last rank announced, and `rankUp()` in story.js sends the letter, the bonus and the rank's commission (`COMMISSIONS`, which reuse the story-contract path). Research entries carry `rank` and `req` (a string or an array), checked by `researchOpen()`.
  - **Work bases:** lumberjacks and arborists work within `G.policy.chopRadius` of the office or near any Logging Camp (`nearBase`).
- **render.js:** the world draws 1:1 in art pixels onto a small canvas (`R.cv`), and CSS scales it up by `R.cam.s`, using a fixed set of zoom levels from `zoomLevels()`. A separate full-resolution overlay canvas carries text.
  - **Ground cache:** the ground is cached per pixel and only redrawn for regions marked with `markDirty()`/`G.dirty`. A season change triggers a full redraw.
  - **Draw order:** objects are depth-sorted by `x + y`, with building centres used as their key.
  - **Overlays:** night lighting, weather and the tutorial's map markers (`drawTutorial`) are drawn here too.
- **ui.js:** the DOM interface: HUD, toolbar, the inspector, the Mill Ledger panel (`renderPanel` tabs), input, the minimap, and the walkthrough's coach card and pointer.
  - **Rendering:** panels re-render from template strings about four times a second in `uiTick`, skipping any element whose cached `_html` hasn't changed.
  - **Clicks:** a delegated handler, `onAction`, dispatches on `data-act` attributes.
  - **Confirmations:** two-click confirms use `askConfirm(key)` and `confirming(key)`, because a re-render replaces the buttons.
- **story.js:** `CHAPTERS` (2 to 6; chapter 1 is the walkthrough), mill ranks and their `COMMISSIONS`, `JOURNAL` pages, letters with choices (`letter(..., extra)` with `choices`, answered by `answerLetter`), story contracts (`c.story`), forest fire (`igniteForest`, `updateFire`, staff douse via `thinkFire` in sim.js) and `endStory`. `checkStory()` runs every sim step.
- **save.js:** `serializeGame()` and `restoreGame()`, which treats the file as untrusted. Every field is type-checked and clamped, enums are allow-listed, and the old `G` is restored on any failure. Older save formats must keep loading, with defaults inferred, as the existing story and tutorial fields already do. Autosave goes to `localStorage` (once per in-game day and on `pagehide`), and file saves go through the `downloads` capability inside claude.ai, falling back to a plain download link elsewhere.
- **main.js:** boot (`bakeArt`, `newGame`, `initRender`, `buildHud`), the title screen with Continue, New and Load, `afterLoad`, and the `frame()` loop.

## Cross-cutting rules

- **New buildings** need a `BDEF` entry (with `cat`: camp, factory, logi or power), a sprite in `bakeArt()` keyed by the same id, and, if locked, a `RESEARCH` entry named by `req`. New goods need an `ITEMS` entry and a case in `spriteItem()`, and should be added to `unlockedItems()` so offers and the sorter list them.
- **New state needs save support.** Anything added to `G` has to be added to both `serializeGame()` and the validated `restoreGame()`, with sensible defaults for saves that lack it.
- **The tutorial is data.** `setupGoals()` in sim.js holds the walkthrough as ordered `tut: true` steps with `test`. Optional fields: `info` (Next button, acknowledged through `G.tutor.ack`), `reveal` (which interface parts appear: see `REVEAL_PARTS`/`ALL_TOOLS` in ui.js), `target`, `cards`, `tab` and `inner` (what the arrow points at), and `marker` (map marker). `YARD` gives offsets for the starter factory on the yard cleared by `chooseYard()`.
- **Quiet mode.** While `tutorialActive()` is true, non-error toasts, letter sounds, random events (blight, rival price cuts, season letters), machine wear and seeding into the yard are all suppressed. New random events or notifications should respect it too.
- **Sound.** `sfx(name, tileX, tileY)` is safe to call from anywhere. It does nothing until the player has interacted with the page, and it fades or pans by on-screen position.
- **Text in the DOM.** Anything that ends up in HTML must go through `esc()`. Names, letters and company names can come from save files.
- **Cleared tiles.** Clearing a tile that might hold a building or tree means calling `removeTree`, adjusting `G.occ`, and calling `markDirty` so the ground cache redraws.
