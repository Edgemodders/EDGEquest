# Getting started

EDGEquest is the EDGE quest maker for Cyberpunk 2077, a VS Code extension. You read the game's quests in plain words, and you write your own as a story: EDGEquest makes the game's quest files from it. This page takes you from installing it to playing your first quest.

## What you need

| What | Why |
|---|---|
| Windows 10 or 11, 64-bit, and Cyberpunk 2077 2.5 | The game EDGEquest reads and writes for |
| [VS Code](https://code.visualstudio.com/) 1.70 or later (or VSCodium, or EDGEkit) | EDGEquest is an extension for it |
| [REDcode for Cyberpunk 2077](https://marketplace.visualstudio.com/items?itemName=edgemodders.redcode-cyberpunk) | Finds the game, installs REDbridge (0.11.0 or later) and the .NET 10 runtime, makes the WolvenKit project, and packs and installs your quest |
| [ArchiveXL](https://www.nexusmods.com/cyberpunk2077/mods/4198) in the game | Adds your quest's phase, journal and texts to the game |
| Optional: [EDGEwave](https://marketplace.visualstudio.com/items?itemName=edgemodders.edgewave) | Finds, plays and makes sounds for your quest |
| Optional: [REDnode](https://github.com/Edgemodders/REDnode) | Plays music cues in the running game, so you can hear them from the picker |

## Install

1. Install REDcode, and let it find the game and download REDbridge.
2. Install EDGEquest: in VS Code's Extensions view (Ctrl+Shift+X), search for **EDGEquest** and click Install. Or download it from [Nexus Mods](https://www.nexusmods.com/cyberpunk2077/mods/35750), extract it, and in the Extensions view choose **...**, **Install from VSIX...** and pick the `.vsix`.
3. Click the EDGEquest icon in the activity bar. The first time, EDGEquest builds its quest index from your game in the background (about a minute and a half; the status bar shows it), and again when the game updates.

EDGEquest uses REDcode's game folder and REDbridge. When REDcode is not running, it finds them itself (settings `edgequest.gamePath`, `edgequest.bridgePath`).

## Read a game quest

- **Game Quests** lists every quest, phase and scene in the game, in folders titled with their quest's name.
- **Find Quest...** searches by in-game title ("Pyramid Song"), file name, fact, journal entry, person or place.
- A **quest page** shows a quest or phase as numbered steps in plain words: what starts it, what it waits for, the facts it sets and tests, its journal entries, and the scenes and phases it plays, which are links.
- A **scene page** shows who is in the scene, each line with its speaker and text, and each choice and where it leads.
- A step's links (→ 12) jump to the step they lead to. The steps you follow gather in a **trail** under the page's header, which stays in view: click a crumb, or **← Step**, to go back to where you clicked from.
- **Raw** opens the file in REDcode's editor, when you want the nodes themselves.

Reading a quest you know is the quickest way to learn how the game builds quests, and where its places, music cues and facts are.

## Write your first quest

1. In REDcode, make a WolvenKit project (**REDcode: New Project**), or open one.
2. Run **EDGEquest: New Quest...**. Give a title and an id (lower case, such as `door_mystery`), and the first time, your modder name.
3. EDGEquest writes `door_mystery.quest.yaml` at the top of the project from its template, opens it on the **Storyboard**, and makes the quest's game files.

The template already plays: its objective sends V to the apartment door in Megabuilding H10, and when V gets there a short scene plays with a choice that leads to one of two endings.

**On the Storyboard**, each card is a beat, titled with its journal objective. Arrows show where each choice leads. Click a card for its page:
- change a line's words or an option's text in place;
- add lines, choices, sounds and steps with the add rows and **+ Step**;
- send a choice to another beat, and make an option yellow or white, or give it a lifepath, an attribute check or a payment;
- add a beat, rename one, or delete it.

Every change goes into the story file. **Open YAML** shows the text, which you can edit directly. [The story file](story.html) describes everything it can hold.

**Saving makes the quest** (or **EDGEquest: Make Quest**). Problems show in the Problems panel at their line. While a story file is in front, the status bar says when it was last made and what is left on its checklist.

## Play it

1. In REDcode, **Pack and Install** the project.
2. Start the game and load a save from **before** you installed the quest.
3. The quest's objective shows in the journal. Follow its marker.

To change it, edit the story, save, pack and install again, and load the save again. If something does not work, **EDGEquest: Check Quest Mod...** on the project names what is wrong, and **EDGEquest: Show Log** shows what EDGEquest did.

## Good to know

- **Keep test quests apart.** Every quest made from the template starts on load and waits at the same door. Two quests installed together both play there, their choices merged into one list. Move an old test quest's story file out of the project (and delete its made files) before you test a new one.
- **Music needs a stop.** A `_START` cue plays until its `_STOP`: stop it in each ending.
- **Your own sounds** need REDcode's `redcode.pack.redmod` setting, and a game restart after installing. See [Music and sound](story.html#music-and-sound).
- **Checks scale with V's level.** A `hard` check can ask for 20, the top of the scale. Use `easy` or `medium` for checks most players can pass.

## For assistants

[edgequest-mcp](https://www.npmjs.com/package/@edgemodders/edgequest-mcp) gives AI assistants such as Claude Code the same quest maker. With Claude Code:

```
claude mcp add edgequest -- npx -y @edgemodders/edgequest-mcp
```

Then ask it, for example, to start a side quest where V finds something odd at the apartment door. It writes the story file, makes the quest, and works through the checklist; you watch the Storyboard change.
