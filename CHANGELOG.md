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
- Places are map markers the game already has; the quest index now knows 4,266 of them by name, with the world spot each stands on. A new quest's marker stands on the same spot, and "arrive" waits until V is within that many metres of it.
- Making a quest again removes the files it made before and no longer needs, unless you changed them by hand.
- Check Quest Mod finds a subtitles entry in the `.xl` that is not a subtitle map, subtitle files nothing loads, and map markers that would show at the world's origin.
- The quest page says who and what a distance check measures between.

**Fixed**

- A made quest's map marker showed far away at the world's origin: it now stands on the place's world spot.
- A made quest's scene lines had no text: the `.xl` now lists a subtitle map, which names one subtitle file per scene.

- Check Quest Mod counted one onscreen text too many when texts use only a string key.
