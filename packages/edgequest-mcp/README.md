# @edgemodders/edgequest-mcp

Cyberpunk 2077 quest tools for AI assistants, over the Model Context Protocol (MCP). An assistant such as Claude Code gets the same quest maker as [EDGEquest](https://github.com/Edgemodders/EDGEquest), the EDGE quest maker for Visual Studio Code. It can:
- read the game's quests and dialogue scenes in plain words, and find them by title, fact, journal entry, person or place
- check a quest mod's files against each other and against the game
- start a new quest as a story file, change it in story words, and make the quest's game files from it
- read what is left to do on a quest's checklist, and its spoken lines for voicing with EDGEwave

The server starts [REDbridge](https://github.com/Edgemodders/REDbridge), which runs [WolvenKit](https://github.com/WolvenKit/WolvenKit)'s libraries, and talks to it over stdio. Nothing links WolvenKit into this package, so it stays MIT.

## What you need

- Windows, and Cyberpunk 2077 2.5 installed.
- REDbridge 0.11.0 or later. REDcode's **Install REDbridge** command fetches it, or you can unzip a [REDbridge release](https://github.com/Edgemodders/REDbridge/releases) anywhere.
- The .NET 10 runtime: `winget install Microsoft.DotNet.Runtime.10`.
- Node.js 20 or newer.
- ArchiveXL in the game, for the quests you make.

## Setup

Register it with Claude Code:

```
claude mcp add edgequest -- npx -y @edgemodders/edgequest-mcp
```

Any other MCP client takes the same command: `npx -y @edgemodders/edgequest-mcp`.

The server needs REDbridge.exe and the game folder. It looks for them in order: the command line, then the environment, then the VS Code settings EDGEquest and REDcode use. So on a machine where REDcode or EDGEquest is set up, it needs no configuration.

| Setting | Command line | Environment | VS Code setting |
|---|---|---|---|
| Game folder | `--game <path>` | `EDGEQUEST_GAME_PATH` | `edgequest.gamePath`, then `redcode.gamePath` |
| REDbridge.exe, or the folder containing it | `--bridge <path>` | `REDBRIDGE_EXE` | `edgequest.bridgePath`, then `redcode.bridgePath` |
| Per-user .NET runtime | `--dotnet-root <path>` | `DOTNET_ROOT` | `edgequest.dotnetRoot`, then `redcode.dotnetRoot` |
| The quest index's folder | `--cache <path>` | `EDGEQUEST_CACHE` | (EDGEquest's own) |

## Tools

| Tool | What it does |
|---|---|
| `quest_index` | The quest index, built from your own game: every quest and phase with the facts, journal entries, scenes, phases, people and places it uses. Build it once (about a minute and a half); it says when the game changed |
| `quest_find` | Finds quests and phases by words: a title, a file name, a fact, a journal entry, a scene, a person or a place |
| `quest_describe` | A `.quest` or `.questphase` in plain words: every step in reading order, with where it leads, and the facts, journal entries, scenes and phases it uses. Also a story file |
| `quest_scene` | A `.scene` in plain words: who is in it, each line with its speaker and text, each choice with its options and where each leads |
| `quest_check` | Checks a quest mod's files against each other and the game, in plain words |
| `quest_new` | Starts a quest in a WolvenKit project: writes its story file (`<id>.quest.yaml`) from the template or from text you give |
| `quest_edit` | Changes a story file in story words: beats, what follows a beat, a choice's beat, an option's kind (yellow, white, lifepath, check, payment), steps, lines, sounds and music |
| `quest_make` | Makes the quest's game files from its story file (phase, journal, scenes, texts, `.archive.xl`) and checks them |
| `quest_checklist` | What is left for the modder: the stand-ins in a quest, with the EDGE tool that can do each |
| `quest_voice` | A story's spoken lines with how each is spoken and its take's status in EDGEwave |

Then pack and install the quest with REDcode or EDGEdeck.

## Docs and license

Docs: https://edgemodders.github.io/EDGEquest/. MIT licensed. Bundled packages keep their own licenses (`ThirdPartyNotices.txt`). Not affiliated with CD Projekt RED.
