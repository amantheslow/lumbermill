# Heartwood Mill

A playable browser demo of a forest factory-builder, made as a tribute to *Lumbermill* by BWDev. All code and art here are new: every sprite is drawn by code at load time, and nothing is copied from the original game.

Open `index.html` through any static web server (for example `python3 -m http.server`) and click **Start the mill**. The page has no build step and no dependencies.

You start small and calm: the Mill Office, one tent, a campfire, two lumberjacks, 2,000 coins, and the clock stopped. A guided walkthrough shows one instruction at a time on a coach card, with a bouncing arrow pointing at the exact button, worker, trees or map spot to use next. The interface appears piece by piece as you need it: first the map, then zoom, the Fell tool, the clock, the factory, power and conveyor tools, camp buildings, and finally the Ledger. A cleared yard by camp, with see-through outlines, shows where your first Log Drop, Sawmill, Steam Engine, Trade Depot and conveyors go. Letters, random events and machine wear stay off until the walkthrough ends. You can skip it from the card, or bring it back from the **?** button.

## The story

After the walkthrough (Chapter 1), the story runs over five more chapters, each with its own goals:

2. **Making a Name.** Sell planks, fill a contract and hire a mechanic.
3. **The Fernhollow Bridge.** The nearby town lost its bridge in a flood and needs 60 planks. Its mayor also asks about Edda Rowan, who ran the mill forty years ago.
4. **Grindstone's Offer.** The rival mill offers a truce. Refuse, and your crew cheers but price cuts come twice as often. Accept, and the price cuts stop but Grindstone takes a tenth of your depot sales. The letter opens itself and waits for your answer.
5. **The Dry Summer.** A fire breaks out in the forest. Burning trees light their neighbours, and every free hand rushes to douse them, faster with a well nearby. Unchecked, a fire can take dozens of trees. From now on, summers can bring fire.
6. **Heartwood.** Furnish Fernhollow's new town hall with 12 tables, grow the forest past its original cover, and find the rest of Edda's journal. Finishing earns the Heartwood Award, then free play.

Edda's journal is six pages hidden in the old ranger station, under the Ancient Oak, and lying loose in the forest. Read in order, they tell how the first mill was lost, and your story echoes hers. The **Story** tab in the Mill Ledger lists the chapters and the pages you've found.

## What's in the demo

- **Living forest.** A procedurally generated island of spruce, pine, maple and birch. Trees grow from sapling to old age, seed new saplings nearby, die and fall, and catch blight that spreads. A fog of war hides the woods until your staff or a survey crew explore them, and five secrets are hidden in the forest.
- **Seasons.** A year is four 12-day seasons. Spring is fresh green with flowers and fast growth. Summer is deep green, with blight spreading faster in the heat. Autumn turns the maples orange and the birches gold, with falling leaves. Winter brings snow, bare trees, snow-covered roofs and an icy lake edge. Trees barely grow in winter and seed only in spring and summer. Logs sell for more in winter, and a campfire matters more to a cold crew.
- **Staff with personalities.** Lumberjacks fell trees, mechanics repair machines and arborists treat blight, replant stumps and explore. Staff gain experience and level up, working faster but expecting better pay. Each worker has a random look, level, personality, pay and needs (energy, hydration, bladder), plus a mood made of pay, morale and colleagues. Workers who stay unhappy go rogue: they slack off, steal from the cash box or quit.
- **Factory and logistics.** Log Drop → conveyor → Sawmill → Workshop (crates, chairs, tables) → Trade Depot. Conveyors are animated, turn corners, and machines wear out and break down.
- **Minimap.** Shows the explored island, buildings, staff and secrets you've found. Click or drag on it to move the view, and use the button in its corner to hide it.
- **Power.** Steam engines burn logs and solar arrays work by day. Power poles carry power to machines.
- **Business.** Market prices drift over time, and a rival mill undercuts you. Companies offer trade contracts, which you can negotiate once you've researched Advanced Trade. Letters arrive from the Forestry Board, your ledger and your customers.
- **Forest health.** The board fines a mill that strips its forest, so you have to balance felling against replanting.
- **Sound.** Every sound is synthesised in the browser, with no audio files: axes, falling trees, saws, steam engines, the campfire, coins, birds by day and crickets at night. Sounds come from where they happen on screen. N or the speaker button turns sound off.
- **Research.** Nine unlocks, including carpentry, campsite comforts, new sapling species, faster conveyors, reinforced machines, solar and advanced trade.

## Saving

There are two kinds of save, and they work together:

- **Autosave.** The game saves itself in your browser at the end of every in-game day and whenever you leave the page. Next time, choose **Continue** on the title screen. Starting a new mill asks you to confirm, because it replaces the autosave. If the browser blocks storage (some private windows), autosave is off and the Save tab says so.
- **Save files.** Open the Mill Ledger (M), go to the **Save** tab and choose **Save to file**, or press Ctrl+S (Cmd+S on a Mac). This writes the whole mill to a `.json` file you can keep as a backup or move to another browser or device. Load it with **Load a save file** on the title screen or **Load from file** in the Save tab.

Saving to a file also refreshes the autosave, and loading a file makes it the new autosave, so Continue always picks up the mill you last played. Loading checks the file first, and if it is damaged or isn't a save, your current game is left as it was.

## Controls

| Action | Input |
| --- | --- |
| Pan | Drag the map, WASD or the arrow keys, or click the minimap. The house button returns to the mill |
| Zoom | Mouse wheel (about two notches per step), pinch, the + and − buttons, or Q / E |
| Place a building | Choose it from Camp, Factory or Power, then click. Hold Shift to place several |
| What's this? | Hover over anything with Select on |
| All controls | The **?** button |
| Tools | Toolbar at the bottom left. Keys: 1 camp, 2 factory, 3 power, C conveyor, F fell, P plant, T path, B bulldoze, X survey |
| Rotate a conveyor | R |
| Mill Ledger (staff, hiring, research, trade, letters, policies) | M |
| Pause | Space |
| Save to file | Ctrl+S / Cmd+S |
| Sound on or off | N |
| Cancel | Esc or right-click |

## Code layout

| File | Contents |
| --- | --- |
| `js/core.js` | RNG, noise, isometric maths, a small pixel rasteriser |
| `js/audio.js` | Synthesised sound effects and ambience (Web Audio) |
| `js/art.js` | Procedural pixel art for trees, buildings, workers, conveyors, items and icons |
| `js/sim.js` | World generation, forest lifecycle, buildings, conveyors, power, staff AI and the economy |
| `js/render.js` | Isometric renderer: cached ground, depth-sorted sprites, day/night lighting |
| `js/ui.js` | HUD, inspector, the Mill Ledger, and mouse, touch and keyboard input |
| `js/story.js` | Chapters, Edda's journal, letters that ask for an answer, forest fires and the ending |
| `js/save.js` | Save files: writes the mill to JSON and checks and restores it on load |
| `js/main.js` | Boot, title screen and the main loop |
