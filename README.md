# Heartwood Mill

A playable browser demo of a forest factory-builder, made as a tribute to *Lumbermill* by BWDev. All code and art here are new: every sprite is drawn by code at load time, and nothing is copied from the original game.

Open `index.html` through any static web server (for example `python3 -m http.server`) and click **Start the mill**. The page has no build step and no dependencies.

## What's in the demo

- **Living forest.** A procedurally generated island of spruce, pine, maple and birch. Trees grow from sapling to old age, seed new saplings nearby, die and fall, and catch blight that spreads. A fog of war hides the woods until your staff or a survey crew explore them, and five secrets are hidden in the forest.
- **Staff with personalities.** Lumberjacks fell trees, mechanics repair machines and arborists treat blight, replant stumps and explore. Each worker has a random look, level, personality, pay and needs (energy, hydration, bladder), plus a mood made of pay, morale and colleagues. Workers who stay unhappy go rogue: they slack off, steal from the cash box or quit.
- **Factory and logistics.** Log Drop → conveyor → Sawmill → Workshop (crates, chairs, tables) → Trade Depot. Conveyors are animated, and machines wear out and break down.
- **Power.** Steam engines burn logs and solar arrays work by day. Power poles carry power to machines.
- **Business.** Market prices drift over time, and a rival mill undercuts you. Companies offer trade contracts, which you can negotiate once you've researched Advanced Trade. Letters arrive from the Forestry Board, your ledger and your customers.
- **Forest health.** The board fines a mill that strips its forest, so you have to balance felling against replanting.
- **Research.** Nine unlocks, including carpentry, campsite comforts, new sapling species, faster conveyors, reinforced machines, solar and advanced trade.

## Controls

| Action | Input |
| --- | --- |
| Pan | Drag the map, WASD or the arrow keys |
| Zoom | Mouse wheel, pinch, or Q / E |
| Tools | Toolbar at the bottom left. Keys: 1 camp, 2 factory, 3 power, C conveyor, F fell, P plant, T path, B bulldoze, X survey |
| Rotate a conveyor | R |
| Mill Ledger (staff, hiring, research, trade, letters, policies) | M |
| Pause | Space |
| Cancel | Esc or right-click |

## Code layout

| File | Contents |
| --- | --- |
| `js/core.js` | RNG, noise, isometric maths, a small pixel rasteriser |
| `js/art.js` | Procedural pixel art for trees, buildings, workers, conveyors, items and icons |
| `js/sim.js` | World generation, forest lifecycle, buildings, conveyors, power, staff AI and the economy |
| `js/render.js` | Isometric renderer: cached ground, depth-sorted sprites, day/night lighting |
| `js/ui.js` | HUD, inspector, the Mill Ledger, and mouse, touch and keyboard input |
| `js/main.js` | Boot, title screen and the main loop |
