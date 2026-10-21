# EDGE<span class="y">quest</span> design

EDGEquest writes new quests for Cyberpunk 2077. It is a VS Code extension in the EDGE family, with an MCP server. A modder describes a quest: who gives it, what V does, what people say, what choices there are, and how it ends. EDGEquest turns that into the game's own quest data: the quest graph, its phases, dialogue scenes, journal entries and facts. It also reads the game's quests, so a modder can learn from them, copy them, or hook into them. Or the modder asks REDagent or Claude: "add a side gig where Wakako sends V to collect a debt".

**Status: draft 0.2, agreed with the owner on 2026-10-21.** Q0 replaced the starting brief (draft 0.1, 2026-10-16) with what was checked against the game, ArchiveXL, the community wiki and two quest mods; the details are on [Quest formats](design/formats.html). Q1 Read built on 2026-10-21 ([Tests](testing.html)); the owner's hand test is next.

## Mission

EDGE brings modding to everyone, especially non-coders: easy, fun and fast. A quest today is several graph files, dialogue scenes with lines and choices, journal entries, facts that tie them together, localized text, voice, and the places and people in the world. They must all agree with each other, and the tools for them are hard to learn. EDGEquest's job is that a modder thinks in story, not in node types.

| Rule | In practice |
|---|---|
| Start from the story | "V meets Wakako, takes the job, chooses to pay or to fight" before `questPhaseNodeDefinition` and sockets |
| Plain words first, details one click away | A quest reads as steps and choices. The graph and the raw nodes are one click away |
| Learn from the game | Any game quest opens read-only, explained in the same plain words |
| Everything the UI does, an assistant can do | Each feature ships in the UI and the MCP server together |
| Try it in seconds | One action packs, deploys, and starts or jumps to a step in the running game |
| The best tool even with AI switched off | No network calls or telemetry until an assistant or an AI service the user chose connects |

## Decisions

Agreed in Q0 with the owner.

| Question | Decision |
|---|---|
| What EDGEquest writes | **The game's own quest files first** (`.quest`, `.questphase`, `.scene`, `.journal`, the localization JSON), added through ArchiveXL so no game file is replaced. Quests run by REDnode come later. CyberScript is studied for what quests need, never targeted: it is broken in places on the current game |
| How a new quest starts | A new phase under the game's root quest (ArchiveXL `quest.phases` with parent `cyberpunk2077.quest`), which starts once per save, also in an existing save. Hooking into a game phase (`input`, `output`) is supported for experts, with a conflict warning |
| Dependencies | ArchiveXL, always. TweakXL only when a quest adds records (images, items). Codeware or redscript only when a quest needs code. Fewer is better for players |
| Scenes | A new scene starts from a template EDGEquest makes, or a copy of a game scene with the leftovers cleaned out (the Judy mod shipped 48 unused text entries from its copied scene) |
| Texts | Every journal title, objective and line gets new keys in the mod's own onscreens and subtitle files, made by EDGEquest. A mod never overrides a whole game localization file (the Judy mod did, and lost every other language) |
| Facts | A quest's own facts carry its prefix. Writing a game fact is allowed and always flagged, because it changes the base game's story |
| Raw graphs | WolvenKit already edits phases and scenes as node graphs. EDGEquest's graph view is for reading and for the story layer; raw edits open in REDcode's CR2W editor or WolvenKit |

## What quest data is made of

The full account, with counts, the ArchiveXL keys and sources, is on [Quest formats](design/formats.html). In short:

| Part | Files |
|---|---|
| The quest and its phases | `.quest` (734 in the game), `.questphase` (3,838): graphs of nodes joined socket to socket. The game's root is `base\quest\cyberpunk2077.quest` |
| Dialogue | `.scene` (8,553): actors, a scene graph, the screenplay's lines and choice options |
| The journal | `.journal`: quests, objectives, contacts and messages, codex, shards, points of interest |
| Text and voice | Onscreens (journal texts), subtitles (spoken lines), voice-over maps, line lengths, `.wem`, lip sync. One id ties a spoken line together across all of them |
| The world | `.streamingblock` and `.streamingsector`: the spots, areas and markers a quest refers to by NodeRef |

The links between them are the [table of what must agree](design/formats.html#what-must-agree-across-files). It is what `quest_check` tests.

## What EDGEquest owns, and what it does not

EDGEquest owns the story layer, which no other EDGE tool owns, and calls the others for the rest. Checked against the sibling repos on 2026-10-21.

| Job | Owner | Today | EDGEquest's part |
|---|---|---|---|
| **The quest**: quest and phase graphs, facts, journal entries, dialogue scenes, the checks that they agree, and the graph views for `.quest`, `.questphase` and `.scene` | **EDGEquest** | | Its core |
| Reading and writing any game file | REDbridge 0.10.0 (`cr2w.*`, `archive.*`), a separate process | Enough for Q1 and Q2 | Its own bridge client, or REDcode's running bridge |
| Subtitles, voice-over maps, line lengths | REDbridge `loc.*` | Onscreens only | **Request:** the same for spoken lines ([REDbridge #9](https://github.com/Edgemodders/REDbridge/issues/9)) |
| Raw edits of any file | REDcode's CR2W editor (`redcode.cr2w`) | Opens `.quest`, `.questphase`, `.scene`, not `.journal` | Opens files there through `vscode.openWith`. **Request:** `.journal` too, and the graph editors REDcode once planned for C6 move here ([REDcode #12](https://github.com/Edgemodders/REDcode/issues/12)) |
| The project, packing, Pack and Try | REDcode 0.10.2, `REDcodeApi` version 1 (`project`, `pack`, `packAndTry`) | Ready | Calls it |
| Onscreen texts (LocKeys) | REDcode's LocKeys view, REDbridge `loc.*` | Ready | Uses them |
| Deploying | EDGEdeck (`EDGEdeckApi` 1, `@edgemodders/edgedeck-mcp`) | Ready | Through REDcode's install or EDGEdeck's API |
| The running game: facts, the journal, starting a phase, moving V | REDnode | Only the raw `api_call`; `archives_reload` swaps archives live | **Request:** quest calls and MCP tools ([REDnode #15](https://github.com/Edgemodders/REDnode/issues/15)) |
| Voice for new lines | EDGEwave 0.1.0 | Speak Line (ElevenLabs, opt-in) makes a WAV; no API, no MCP, no `.wem` | **Request:** voice a list of lines, and a `.wem` route ([EDGEwave #5](https://github.com/Edgemodders/EDGEwave/issues/5)). Until then, lines are unvoiced |
| Places and people: spots, trigger areas, map markers, NPC spawns | EDGEbuilder 0.3.4 | Places meshes, entities and lights with NodeRefs; markers, areas and NPC spawns not planned | **Request:** quest places ([EDGEbuilder #3](https://github.com/Edgemodders/EDGEbuilder/issues/3)). Until then, quests use places the game already has |
| New items as rewards | EDGEfab (design only), TweakXL | | References their records |
| Shipping to assistants | EDGEchat (the Claude Code plugin), EDGEkit | | Asks to be listed once released |

## Shape

The same shape as EDGEmat, so the family stays one pattern.

| Part | What it is |
|---|---|
| `extensions/edgequest` | The VS Code extension, id `edgemodders.edgequest`. Its own **activity bar container**, icon [`tools/brand/activity.svg`](https://github.com/Edgemodders/EDGEquest/blob/main/tools/brand/activity.svg). Views: the game's quests, the quests in the project. A quest page for one quest |
| `extensions/edgequest/src/core` | Everything that is not UI: the bridge client (copied from REDcode, MIT), reading graphs, describing nodes in plain words, the checks. **No VS Code imports**, so the MCP server bundles it |
| `packages/edgequest-mcp` | The MCP server over stdio, `@edgemodders/edgequest-mcp` |

| Relationship | How |
|---|---|
| REDcode | Optional but expected. `REDcodeApi` version 1, taken only once REDcode is active: game folder, bridge, project, pack. Never imports its code |
| Settings | `edgequest.gamePath`, `edgequest.bridgePath`, `edgequest.dotnetRoot`, each falling back to the `redcode.*` setting |
| The other tools | Through their APIs and MCP servers when present; needs as `request` issues |

## The MCP server

The same conventions as `edgemat-mcp` and `redcode-mcp`, so EDGEchat lists it like the others.

| Part | Convention |
|---|---|
| Server | Name `edgequest`, stdio. stdout is the MCP channel; logs go to stderr as `[edgequest-mcp]` |
| Build | One file, `dist/server.cjs`, bundled by esbuild with the core and the MCP SDK; Node 20 or newer; MIT |
| Settings | `--game`, `--bridge`, `--dotnet-root`; then `EDGEQUEST_GAME_PATH`, `REDBRIDGE_EXE`, `DOTNET_ROOT`; then the VS Code settings, `edgequest.*` before `redcode.*`. **An empty value counts as unset**, because a Claude Code plugin passes an unset option as an empty string |
| Bridge | Started on the first tool that needs it |
| Errors | Returned as tool errors in plain words |
| In EDGEchat | `cmd /c npx -y @edgemodders/edgequest-mcp@<version>`, with `EDGEQUEST_GAME_PATH` and `REDBRIDGE_EXE` from the plugin's options. Asked of EDGEchat once the package is on npm |

Tools are about intent, not file plumbing:

| Tool | Does | Phase |
|---|---|---|
| `quest_find` | Finds game quests by name, folder, character, fact or line of dialogue | Q1 |
| `quest_describe` | A quest or phase in plain words: its steps, choices, facts, journal entries and scenes | Q1 |
| `quest_scene` | A scene's lines and choices with speakers and text | Q1 |
| `quest_check` | Checks a quest's files against each other, in a project or a mod archive, and names what is wrong in plain words | Q1 |
| `quest_new` | Starts a new quest from a short description, or from a game quest to copy | Q2 |
| `quest_edit` | Adds and changes steps, lines, choices, facts and journal entries | Q2 |
| `quest_try` | Packs, deploys, and starts the quest or jumps to a step in the running game | Q3 |

## Phases

Reading comes before writing, because the game's quests are the documentation. Each phase ends with a test on the dev PC.

| Phase | Builds | The test proves |
|---|---|---|
| **Q0 Design** | The formats studied, two quest mods read, the boundaries and phases agreed, requests filed | **Done 2026-10-21** |
| **Q1 Read** | Extension and MCP skeletons. The game's quests in a tree. A quest page: the phase graph read as steps, with facts, journal entries and scenes in plain words; a scene's lines and choices with their text. `quest_check` on a project or a mod archive. **Built 2026-10-21:** the quest index (every quest and phase with its facts, journal entries, scenes, phases and NodeRefs, and the journal's titles), Find Quest, the quest page with links and Raw, Check Quest Mod; MCP `quest_index`, `quest_find`, `quest_describe`, `quest_scene`, `quest_check`. `quest_check` found all the Judy mod's known faults and two new ones | A modder follows a game quest from start to end without opening a raw file. `quest_check` finds the Judy mod's known faults (**passed 2026-10-21**) |
| **Q2 Write** | A new quest from a template: one phase under the root quest, facts, a journal entry with an objective, a short unvoiced scene with a choice, the `.xl`. Copy a game scene and clean it | A new quest shows in the journal and its scene plays, in the game, in a save made before the mod was installed |
| **Q3 Try it** | Pack, deploy, start the quest or jump to a step, watch its facts live (REDnode) | A change shows in the running game without a restart, or the reason it cannot |
| **Q4 Voice and world** | Lines to EDGEwave for voice; places and people from EDGEbuilder | A quest with a voiced NPC standing where the modder placed them |
| **Q5 Ship** | Docs, the MCP package on npm, Open VSX and Marketplace, EDGEkit and EDGEchat entries | A non-coder makes a small quest from the docs alone |

## Open questions

Each is answered by a test in the phase named.

| Question | Phase |
|---|---|
| Whether an unvoiced line plays, and for how long it shows, without a line-length entry | Q2 |
| What a save does when a running phase file is gone (the mod removed) | Q2 |
| Whether a running phase or scene picks up a reloaded archive, or only a new save load does | Q3 |
| Whether REDnode can start a phase or jump to a node in the running game | Q3 |
| Scene performer ids (`actorId × 256 + 1`, from a wiki stub) | Q2 |
| How the slot framework behind the Judy mod starts quests | When the owner finds it |
| How many node types Q1 must describe in plain words | **Answered 2026-10-21:** 60 node classes, 250 subtypes, 111 condition kinds in the game; about 45 subtypes and 30 conditions cover 95%, and are described in words. The rest show their class name in words ([Tests](testing.html)) |
| Whether the index should also read the game's 8,553 scenes, so facts set in scenes count as set | Q2 |

## Sources

| Source | What it gave |
|---|---|
| The installed game, through `redcode-mcp` | Every count, shape and join on [Quest formats](design/formats.html) |
| ArchiveXL by psiberx (source and release notes) | The `.xl` keys a quest mod uses |
| The [Cyberpunk 2077 modding wiki](https://wiki.redmodding.org/) | Quest guides: facts, sockets, phone messages, holocalls, voice, lip sync |
| Two quest mods, studied for their file sets and behavior only | What a native quest mod ships, and what to avoid |
| The game's decompiled scripts ([Cyberpunk-Scripts](https://github.com/CDPR-Modding-Documentation/Cyberpunk-Scripts)) | How scripts read and set facts |
| [REDnode game reference](https://edgemodders.github.io/REDnode/game/) | `questQuestsSystem`, `gameJournalManager` |
| [REDcode API](https://edgemodders.github.io/REDcode/api.html) | `REDcodeApi` version 1 |
| [EDGEmat design](https://edgemodders.github.io/EDGEmat/design.html) | The family's shape and MCP conventions, copied here |
