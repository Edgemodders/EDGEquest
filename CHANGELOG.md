# Changelog

What changed in EDGEquest, newest first. Add a line under **Unreleased** in the commit that makes the change: one change per bullet, under **New**, **Changed**, **Fixed** or **Other**, written for players and modders. Before a release, rename **Unreleased** to `<version> (<YYYY-MM-DD>)` and start a new empty **Unreleased** above it. Use full URLs for links: the same text goes to GitHub, the stores and Nexus.

## Unreleased

**New**

- Game Quests view: every quest, phase and scene in the game, folders titled with their quest's name.
- Quest page: a quest or phase as numbered steps in plain words, with its facts, journal entries, scenes, phases, people and places; phases and scenes it plays are links; Raw opens the file in REDcode.
- Scene page: who is in a scene, each line with its speaker and text, each choice and where it leads.
- Find Quest: search the game's quests by in-game title, file name, fact, journal entry, person or place.
- Check Quest Mod: checks a quest mod's `.archive`, WolvenKit project or extracted files and names what is wrong in plain words.
- MCP server `edgequest`: `quest_index`, `quest_find`, `quest_describe`, `quest_scene` and `quest_check`.
- The story file: a quest in words (`<id>.quest.yaml`) with its objectives, places, steps and scenes. EDGEquest makes the quest's game files from it in a WolvenKit project: the phase, the journal, the scenes, the text files and the `.archive.xl`, checked with `quest_check`. A made file you changed by hand is kept, not overwritten.
- Places are map markers the game already has; the quest index now knows 4,394 of them by name (game 2.5), with the world spot each stands on. A new quest's marker stands on the same spot.
- "arrive" waits until V is inside the place's trigger area, as the game's own quests do. The quest index knows the game's 10,795 quest trigger areas; a place names one with `area:`, or gets the one the game's own quest uses with its marker. The made phase switches on the world prefab the area belongs to.
- The quest checklist: what is left for the modder. Where a quest uses a stand-in, such as a line shown as text with no voice or the template's description, making the quest puts an item under `todo:` in the story file, with the EDGE tool that can do it, and keeps it up to date; the item ticks itself once the thing is done. Items you or an assistant write under `todo:` are kept as they are; `done: true` ticks one. Open items never stop the quest from playing.
- MCP `quest_checklist`: a story file's or a project's checklist.
- Beats: a story file is a sequence of beats under `beats:`, each with its journal objective and steps. A choice in a scene can `go:` to another beat, so a quest branches, and branches can join again; a beat ending in `done` or `failed` is an ending. EDGEquest makes the branch from the scene's own exits, as the game's quests do; you never handle facts for it. Story files with a `steps:` list still work.
- The Storyboard: a story file opens as a board of its beats. Each card is a beat titled with its journal objective, with arrows to the beats that follow, labelled with the choice that leads there; endings show whether the quest succeeds or fails. Click a card for its page: its steps, its scenes' lines and choices, and how each line is spoken. Add, rename and delete beats, send a choice to a beat, write a line's voice prompt and tick the checklist there; every change goes into the story file, comments kept, and Open YAML shows the text. Generate voices a line or a scene through EDGEwave once EDGEwave can be asked; until then it copies the line for EDGEwave's Speak Line.
- New Quest: asks a title and an id (and once, your modder name), writes the story file from the template at the top of the WolvenKit project, opens it on the Storyboard and makes its game files.
- Project Quests view: the quests in REDcode's open project or in workspace folders that are WolvenKit projects, each with how much is left to do, its beats, and its checklist; a click opens the Storyboard, and Make Quest and Made Files are on each quest.
- Saving a story file makes its quest (setting `edgequest.makeOnSave`, on by default): the story's problems and Check Quest Mod's findings show in the Problems panel at their lines, and while a story file is in front, the status bar keeps how its last make went: made at what time and how much is on the checklist, or how many problems; a click shows the problems or the made files. **EDGEquest: Make Quest** and the Storyboard's Make button do it on demand.
- Made Files: the game files made from a story, from the Storyboard or the command palette; a phase or scene opens in plain words on the quest page, its scenes are links, and Raw opens the file in REDcode.
- Edit scenes and steps on the beat's page: add lines and choices at the end of any scene or option, add options to a choice, change a line's words (or its speaker in a phone call) and an option's text in place, move each up or down and delete it; a choice's `go:` stays last. Add, move and delete a beat's steps: arrive, play a scene (or a new one), wait, set a fact, or end the quest. `quest_edit` does the same with insert, move, remove and addScene.
- The Storyboard pans and zooms: drag the board to move it, the mouse wheel zooms around the pointer, and buttons in its corner zoom in, out, to fit the story and to actual size. Drag the line under the board to make it taller or shorter; double-click the line to fit the board to the story. The beat's page scrolls on its own below.
- Voice prompts: a line can say how it is spoken, for text-to-speech, under `voice:` with `direction` (plain words) and `say` (the line as spoken, with ElevenLabs v3 tags such as `[softly]`). Making the quest gives each `voice:` an `id`, so a voice take stays on its line when lines are added before it. New quests show one.
- The checklist asks for voice prompts where lines have none, and counts the lines with a current voice take from EDGEwave's record; a line changed since its take counts as not voiced.
- MCP `quest_new`, `quest_edit` and `quest_make`: an assistant starts a quest (from the template or from a story file it wrote), changes it in story words as the Storyboard does (add, rename or delete a beat, send a choice to a beat, a line's voice prompt, a checklist tick, or any value by its path), and makes its game files. Each answers with the quest's beats, its problems and what is left on its checklist.
- MCP `quest_voice`: a story's lines with their voice prompts and take status, ready to pass to EDGEwave; `prepare` gives every line a voice id first.
- `quest_describe` on a story file gives its beats in words: each beat's objective and steps, and where it goes on to, with the choice that leads there.
- Check Quest Mod warns when a phase waits for V in a game trigger area whose world prefab nothing in the mod switches on.
- Check Quest Mod finds scene lines and options whose id is not their place in the list, and choice options that name an option the scene does not have: both leave a choice without text and can crash the game.
- Making a quest again removes the files it made before and no longer needs, unless you changed them by hand.
- Check Quest Mod finds a subtitles entry in the `.xl` that is not a subtitle map, subtitle files nothing loads, and map markers that would show at the world's origin.
- The quest page says who and what a distance check measures between.
- Storyboard: each beat page says what follows the beat when no choice goes elsewhere (the grey arrow): the next beat in the list, another beat, nothing (`next: none`, the quest stays open), or an ending. + Beat at the top adds an unlinked beat at the end, so adding a beat never changes where the story goes; + Beat after still puts it in the chain.
- Storyboard: Layout lays the board out afresh and fits it in view, reading the story and its voice takes again. The layout keeps the beats a choice leads to together, in the choice's order, beside the beat they come from.
- Music and sound: a beat can start or stop one of the game's music cues (`music:`) and play a sound on V (`sound:`); a scene can play a sound between its lines. EDGEquest makes them as the game's own quests do. On the Storyboard, + Step has Music and Sound and every scene list has + Sound; with EDGEwave installed you search the project's own sounds and the game's sound events and play them first, at once from the list, without it you type the name. A name that is neither one of the game's sound events nor one of the project's custom sounds (made with EDGEwave) gets a checklist item.
- Quest pages read the game's music and sound nodes in plain words ("Play music mus_q104_drone_flight_01_START").
- Kinds of choice options: an option that goes on to a beat or sets a fact shows yellow, as the game marks options that move the story on, and `main: yes` or `no` says otherwise. An option can be for one lifepath (`lifepath: corpo`), check an attribute (`check: { body: hard }`, a level that grows with V's) or cost eddies (`pay: 500`, or `pay: medium` for a price that grows with V's level); the game shows its blue tag in front of it. The beat page has a colour and a condition picker on each option, and `quest_edit` has `setOption`. Game scenes show their options' tags and which are yellow.

**Fixed**

- On game 2.5 the quest index found no trigger areas, so a new quest's arrival had none to wait in. With REDbridge 0.11.0 it finds 10,795, each with the world prefab that loads it. EDGEquest now works with game 2.5 and REDbridge 0.11.0 or later; REDbridge 0.11.0 no longer reads game 2.31's world files.
- A made quest's map marker showed far away at the world's origin: it now stands on the place's world spot.
- A made quest's scene lines had no text: the `.xl` now lists a subtitle map, which names one subtitle file per scene.
- Reaching a made quest's place did nothing: V's distance to a map marker's spot never counts, and the game's trigger areas exist only while their quest's world prefab is on.
- A made scene's choice showed no text, and choosing an option crashed the game: lines and options are now numbered by their place in their own lists, as the game expects.

- Check Quest Mod counted one onscreen text too many when texts use only a string key.
