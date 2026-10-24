# EDGE<span class="y">quest</span> docs

EDGEquest is the EDGE quest maker for Cyberpunk 2077, a VS Code extension with an MCP server: read the game's quests in plain words, and write new ones, with their steps, choices, dialogue and journal entries, or ask an assistant to do it.

| Document | What it covers |
|---|---|
| [Design](design.html) | The mission, the decisions, what quest data is made of, what EDGEquest owns and what the other EDGE tools do, its shape, the MCP server, the phases, open questions. Draft 0.2, agreed 2026-10-21 |
| [Quest formats](design/formats.html) | The game's quest files, how one id ties a spoken line together, how a mod adds a quest through ArchiveXL, what must agree across files, two quest mods studied |
| [Tests](testing.html) | Every test run on the dev PC, with its result |
| [Dev setup](dev-setup.html) | What a PC needs to work on EDGEquest, and how to build, test and package it |
| [Changelog](https://github.com/Edgemodders/EDGEquest/blob/main/CHANGELOG.md) | What changed, newest first; the release notes come from it |
| [REDcode docs](https://edgemodders.github.io/REDcode/) | The editor extension and the bridge EDGEquest builds on |
| [REDnode docs](https://edgemodders.github.io/REDnode/) | The running game, and the game API reference |

## Roadmap status

As of 2026-10-24. Nothing is released yet; [Dev setup](dev-setup.html) section 5 builds it from source.

| Phase | Status |
|---|---|
| Q0 Design | Done 2026-10-21 |
| Q1 Read | Built 2026-10-21; the owner's hand test passed the same day (one fault, fixed). Q1's own test (a modder follows a side quest on the quest page alone) is still open |
| Q2 Write | Plan agreed 2026-10-21; being built. The template quest plays in the game from start to end (in-game test 4, 2026-10-22). The checklist added 2026-10-22. Beats, the Storyboard and voice prompts agreed 2026-10-23; beats built, and a choice branches the quest to either ending in the game (test 5, 2026-10-23). The Storyboard and voice prompts built 2026-10-23; make on save, New Quest, the Project Quests view and MCP `quest_new`, `quest_edit`, `quest_make` built 2026-10-24. The owner's hand tests passed. Next: phone calls, Copy Scene, a story-file reference page |
| Q3 Try it | Not started |
| Q4 Voice, sound and world | Started: music and sound in beats and scenes built 2026-10-24, with EDGEwave's sound events; in-game test 6 to come. Voice in the game waits for EDGEwave's `.wem` route; places and people for EDGEbuilder |
| Q5 Ship | Not started |
| Q6 The assistant builds it all | Agreed as a direction 2026-10-22; after Q5 |

Source code and issues: [github.com/Edgemodders/EDGEquest](https://github.com/Edgemodders/EDGEquest)
