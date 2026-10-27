# EDGE<span class="y">quest</span> design

EDGEquest writes new quests for Cyberpunk 2077. It is a VS Code extension in the EDGE family, with an MCP server. A modder describes a quest: who gives it, what V does, what people say, what choices there are, and how it ends. EDGEquest turns that into the game's own quest data: the quest graph, its phases, dialogue scenes, journal entries and facts. It also reads the game's quests, so a modder can learn from them, copy them, or hook into them. Or the modder asks REDagent or Claude: "add a side gig where Wakako sends V to collect a debt".

**Status: draft 0.2, agreed with the owner on 2026-10-21.** Q0 replaced the starting brief (draft 0.1, 2026-10-16) with what was checked against the game, ArchiveXL, the community wiki and two quest mods; the details are on [Quest formats](design/formats.html). Q1 Read built on 2026-10-21 and passed the owner's hand test the same day; Q2 Write is being built, and its template quest plays in the game ([Tests](testing.html)).

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
| Where a written quest lives | **A story file**, `<name>.quest.yaml` in the WolvenKit project: title, fact prefix, steps, journal entry and objectives, scenes with their lines and choices. EDGEquest makes the `.questphase`, `.journal`, `.scene`, text files and `.archive.xl` from it; people and assistants edit only the story file. A made file changed by hand (in WolvenKit or REDcode) is noticed by its hash, and EDGEquest asks before overwriting it. Agreed 2026-10-21 |
| The checklist | **A quest lists what is left for the modder.** Where a quest uses a stand-in (a line shown as text with no voice, later a person nobody placed or an item that does not exist yet), the item goes on the quest's checklist, with the EDGE tool that can do it (EDGEwave, EDGEbuilder, EDGEfab). The AI writing a quest, or the modder, adds items of their own. The story file holds it, under `todo:`, so it travels with the project and an assistant sees it on every edit. Items EDGEquest finds are added and updated by EDGEquest each time it makes the quest, and tick themselves once the thing exists; the modder ticks the rest, or a found item they accept as it is. One level of item, no "nice to have". A stand-in always keeps the quest playable: open items never stop a quest from playing or packing; packing for release names them in a warning. Agreed with the owner 2026-10-22 |
| Beats and the Storyboard | **A quest is a sequence of beats that can branch.** The story file is organised by named beats under `beats:`; each beat has its journal objective, its steps, and what comes next: the next beat in the list (or the beat `next:` names, or nothing with `next: none`), or the beat a choice names with `go:` (`Keep it: [ { V: Mine now. }, { go: sell_it } ]`). The modder never handles facts for a branch; EDGEquest makes them, or uses the scene's exits. Branches may join again; a beat ending in `done` or `failed` is an ending. A story file with a plain `steps:` list still reads, as one chain of beats split at each objective. **The Storyboard** is the story file's main editor in VS Code: a card per beat titled with its objective, arrows between them labelled with the choice that leads there, endings marked, and badges for open checklist items and voice. It lays itself out, so the story file holds no positions. Cards are edited on the board (add a beat after, add a branch from a choice, rename, delete), written back to the story file with its comments kept; a card opens its beat page, and the YAML is one click away. Assistants get the same outline in words from `quest_describe` and edit by beat name. A storyboard of a game quest waits until the game's objectives are checked to map to beats. Agreed with the owner 2026-10-23 |
| Voice prompts | **Every new line says how it is spoken**, for a text-to-speech service. The AI writing a quest fills it in for each line; the modder edits it on the beat page. In the story file, a line's `voice:` holds `direction` (plain words: "Quiet and surprised, a little hurt") and `say` (the line as spoken, with inline delivery tags in ElevenLabs v3's square-bracket form, `[softly] You... came back.`), and an `id` EDGEquest writes once, so a take stays on its line when lines are inserted. Tags are not standard across services (SSML elsewhere, plain instructions in some), so EDGEquest stores this one form and **EDGEwave converts it** per service. V's lines get two takes, female and male; other lines one. The checklist's voice item opens into its lines, each with its status (no take, take made, out of date) and Generate or Regenerate, through EDGEwave's API in VS Code or its MCP tool for an assistant; an edited line's take is out of date. A line with no `voice:` gets a checklist item to write it. Agreed with the owner 2026-10-23 |
| Music and sound | **A beat or a scene can play music and sounds by event name.** In the story file, a beat step `{ music: <event> }` or `{ sound: <event> }`, and a scene item `{ sound: <event> }`; EDGEquest writes them as the game does: a phase's `questAudioNodeDefinition` with `questAudioEventNodeType` (`isMusic` for music), and a scene's `scnAudioEvent`. Game quests post their music as cues per quest (`mus_q001_v_meets_dex_01_START_...` to `..._05_STOP_end_silent`), so a story names the cue to start and the one to stop. On the Storyboard, + Step and the scene's add row get Music and Sound, with a picker and Play; an assistant finds events with EDGEwave's MCP `sound_events` and writes the steps with `quest_edit`. Finding, hearing and making sounds is EDGEwave's (request [EDGEwave #7](https://github.com/Edgemodders/EDGEwave/issues/7)); without it a name is typed by hand and the checklist names EDGEwave. Agreed with the owner 2026-10-24, in Q4; **built 2026-10-24** (EDGEwave's API was ready the same day), in-game test 6 to come. EDGEquest reads the game's event names itself (`eventsmetadata.json`, names only, in its cache folder) for the checklist; searching, hearing and making stay EDGEwave's |
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
| Reading and writing any game file | REDbridge 0.11.0 (`cr2w.*`, `archive.*`), a separate process | Enough for Q1 and Q2. **Game 2.5:** REDbridge 0.10.0 did not read every 2.5 file ([REDbridge #10](https://github.com/Edgemodders/REDbridge/issues/10), closed); 0.11.0 (2026-10-26, WolvenKit 10.0.0-beta.1) reads them, and no longer reads 2.31's sectors. Its sectors give no node paths, so the index names trigger areas from the streaming block and the nodes' `debugName` (formats, trigger areas). **EDGEquest targets game 2.5 from 2026-10-27**; one quest sector of 2,791 does not read | Its own bridge client, or REDcode's running bridge |
| Subtitles, voice-over maps, line lengths | REDbridge `loc.*` | **Answered 2026-10-23:** `loc.lines`, `loc.searchLines`, `loc.projectLinesFiles`, `loc.newLinesFile` on REDbridge's main (c8f88ec), in the release after 0.10.0. Game voice-over maps only; a project's own map is not read | Requested in [REDbridge #9](https://github.com/Edgemodders/REDbridge/issues/9), closed. To use: game lines in `quest_check`, and Find Quest by a line of dialogue |
| Raw edits of any file | REDcode's CR2W editor (`redcode.cr2w`) | Opens `.quest`, `.questphase`, `.scene`. **Answered 2026-10-23**, on REDcode's main (39706a0), released in 0.10.4: `.journal` too, and `REDcodeApi.openFile(target, node)` opens a file at a node (check `typeof api.openFile`); the graph views are agreed to be EDGEquest's | Opens files there through `vscode.openWith`, or `openFile` at the node with REDcode 0.10.4 and later. **Requested:** `.journal` too, and the graph editors REDcode once planned for C6 move here ([REDcode #12](https://github.com/Edgemodders/REDcode/issues/12)) |
| The project, packing, Pack and Try | REDcode 0.10.2, `REDcodeApi` version 1 (`project`, `pack`, `packAndTry`) | Ready | Calls it |
| Onscreen texts (LocKeys) | REDcode's LocKeys view, REDbridge `loc.*` | Ready | Uses them |
| Deploying | EDGEdeck (`EDGEdeckApi` 1, `@edgemodders/edgedeck-mcp`) | Ready | Through REDcode's install or EDGEdeck's API |
| The running game: facts, the journal, starting a phase, moving V | REDnode | **Answered 2026-10-23:** REDnode 0.32.0 has `quests.fact/facts/setFact`, `quests.watch`, `journal.entry/setState/track/tracked`, `game.player.teleport`, and MCP `game_facts`, `game_journal`, `game_facts_set`, `game_journal_set`, `game_teleport`; its in-game test passed the same day. Not available: starting a phase or jumping to a node (no game call found; setting the facts a phase waits for is the route) | Requested in [REDnode #15](https://github.com/Edgemodders/REDnode/issues/15), closed. Q3 Try it builds on it |
| Voice for new lines | EDGEwave | Released 0.1.0: Speak Line (ElevenLabs, opt-in) makes a WAV. **Built on EDGEwave's main 2026-10-24, not released yet:** the Voice Lines panel, `EDGEwaveApi` 1 (`voiceLines`, `voiceStatus`) and MCP `voice_lines`, `voice_status`, `voice_voices`. The `.wem` route is EDGEwave's next step | **Request:** voice a list of lines, and a `.wem` route ([EDGEwave #5](https://github.com/Edgemodders/EDGEwave/issues/5)); followed up 2026-10-22: the checklist's voice items, and MCP tools for Q6. **EDGEwave proposed a contract 2026-10-23** (Voice Lines panel, `voiceLines`/`voiceStatus` API 1, MCP `voice_lines`, `voice_status`, `voice_voices`; WAVs and `voice.json` under `source/raw/edgewave/voice/<quest>/`; `.wem` through the modder's Wwise). **EDGEquest confirmed it the same day** ([comment](https://github.com/Edgemodders/EDGEwave/issues/5#issuecomment-6376843821)), adding `say` and `direction` per line, stale when any of text, `say` or `direction` changed, one-line redo, and `voices` in the status. Lines are unvoiced in the game until the `.wem` route exists |
| Music and sound effects: finding events, hearing them, making new ones | EDGEwave (A3 puts a WAV into the game for an event through REDmod custom sounds; it plays sounds in the running game through REDnode) | `soundEvents`, `playEvent` and `customSound` in `EDGEwaveApi` 1, on EDGEwave's main since 2026-10-24 (not released yet) | **Request** filed 2026-10-24: `soundEvents` (with a music flag), `playEvent`, `customSound` (a new event name a quest can post), in its API and MCP ([EDGEwave #7](https://github.com/Edgemodders/EDGEwave/issues/7)). **Answered the same day:** built on EDGEwave's main (f510fb4), not released yet; MCP `sound_events`, `sound_custom`; music cues play only in the running game, through REDnode ([REDnode #17](https://github.com/Edgemodders/REDnode/issues/17), EDGEwave's request); custom music is a 2D sound on the effects slider (REDmod has no music type). Whether a quest node posts a new event name is EDGEquest's test 6. **Request** filed 2026-10-25 from test 6: `playEvent` plays at once without opening the Hear tab (`show: false`) ([EDGEwave #8](https://github.com/Edgemodders/EDGEwave/issues/8)). **Answered 2026-10-26:** built on EDGEwave's main (5099baf), Windows only (a hidden player), `stopSound()`; `soundEvents` and `playEvent` take `project` and list the project's own sounds first. The picker uses all of it. What EDGEwave needs from REDnode for it is EDGEwave's call. EDGEquest writes the quest's audio nodes |
| Places and people: spots, trigger areas, map markers, NPC spawns | EDGEbuilder 0.3.4 | Places meshes, entities and lights with NodeRefs. Markers and areas not planned. NPCs that stand where they were placed are agreed (EDGEbuilder's B3c, 2026-10-23) through REDnode's planned `world.load`, which loads EDGEbuilder's scene files for any package (REDnode's H2c, not built yet) | **Request:** quest places ([EDGEbuilder #3](https://github.com/Edgemodders/EDGEbuilder/issues/3)); followed up 2026-10-22: the checklist, MCP tools for Q6, and what the in-game tests found about markers and trigger areas. Until then, quests use places the game already has |
| New items as rewards | EDGEfab (design only), TweakXL | | References their records |
| Shipping to assistants | EDGEchat (the Claude Code plugin), EDGEkit | | Asks to be listed once released |

## Shape

The same shape as EDGEmat, so the family stays one pattern.

| Part | What it is |
|---|---|
| `extensions/edgequest` | The VS Code extension, id `edgemodders.edgequest`. Its own **activity bar container**, icon [`tools/brand/activity.svg`](https://github.com/Edgemodders/EDGEquest/blob/main/tools/brand/activity.svg). Views: the game's quests, the quests in the project. A quest page for one quest. The Storyboard, the editor for a story file, with a page per beat |
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
| `quest_index` | EDGEquest's quest index of the user's game: every quest and phase with the facts, journal entries, scenes, phases, people and places it uses | Q1 |
| `quest_find` | Finds game quests by name, folder, character, fact or line of dialogue | Q1 |
| `quest_describe` | A quest or phase in plain words: its steps, choices, facts, journal entries and scenes. For a story file, its beats first: the Storyboard in words ("Go home → Find out who left the shard → Keep it: Sell the shard (ends) / Give it back: Return the shard (ends)") | Q1, beats Q2 |
| `quest_scene` | A scene's lines and choices with speakers and text | Q1 |
| `quest_check` | Checks a quest's files against each other, in a project or a mod archive, and names what is wrong in plain words | Q1 |
| `quest_new` | Starts a new quest in a project: the story file from the template, or from the text an assistant wrote from a description. Copying a game quest comes later | Q2 |
| `quest_edit` | Adds and changes beats, steps, lines with their voice prompts, choices and where they go, facts and journal entries, by beat name | Q2 |
| `quest_voice` | A story's lines with their voice prompts and status (no take, take made, out of date, from EDGEwave's `voice.json`), in the shape EDGEwave's `voice_lines` takes, so an assistant can voice or revoice them there | Q2 |
| `quest_checklist` | What is left for the modder: the quest's checklist, the items EDGEquest found and the ones written in the story file, each with the EDGE tool that can do it. `quest_new` and `quest_edit` return the open items too | Q2 |
| `quest_make` | Makes a story's game files in its project, checks them with `quest_check` and updates its checklist, as saving does in VS Code. `quest_new` and `quest_edit` can make too | Q2 |
| `quest_try` | Packs, deploys, and starts the quest or jumps to a step in the running game | Q3 |

## Phases

Reading comes before writing, because the game's quests are the documentation. Each phase ends with a test on the dev PC.

| Phase | Builds | The test proves |
|---|---|---|
| **Q0 Design** | The formats studied, two quest mods read, the boundaries and phases agreed, requests filed | **Done 2026-10-21** |
| **Q1 Read** | Extension and MCP skeletons. The game's quests in a tree. A quest page: the phase graph read as steps, with facts, journal entries and scenes in plain words; a scene's lines and choices with their text. `quest_check` on a project or a mod archive. **Built 2026-10-21:** the quest index (every quest and phase with its facts, journal entries, scenes, phases and NodeRefs, and the journal's titles), Find Quest, the quest page with links and Raw, Check Quest Mod; MCP `quest_index`, `quest_find`, `quest_describe`, `quest_scene`, `quest_check`. `quest_check` found all the Judy mod's known faults and two new ones | A modder follows a game quest from start to end without opening a raw file. `quest_check` finds the Judy mod's known faults (**passed 2026-10-21**) |
| **Q2 Write** | A new quest from a template: one phase under the root quest, facts, a journal entry with an objective, a short unvoiced scene with a choice, the `.xl`. Copy a game scene and clean it. **Agreed 2026-10-21:** the story file (see Decisions) and the game files made from it; New Quest (a short form) and the template: the quest starts on load, the objective shows with a map marker at a spot the game already has (a NodeRef), and the scene plays when V enters the area there. The first scene is V alone with a choice, then a phone call with a game character, so nobody needs placing before Q4. Copy Scene from a game scene's page; a Project Quests view; MCP `quest_new` and `quest_edit` on the same story file; `quest_check` runs on every write. **The checklist** (agreed 2026-10-22, see Decisions): the `todo:` section, the items EDGEquest finds (lines with no voice; text left as the template wrote it), the modder's own, `quest_checklist`, a Checklist section on the quest page and in the Project Quests view. **Beats, the Storyboard and voice prompts** (agreed 2026-10-23, see Decisions): `beats:` with `go:` from choices, the Storyboard as the story file's main editor with beat pages, `voice:` on each line with its status from EDGEwave's `voice.json`, and Generate or Regenerate once EDGEwave's API and MCP exist (Speak Line until then) | A new quest shows in the journal and its scene plays, in the game, in a save made before the mod was installed |
| **Q3 Try it** | Pack, deploy, start the quest or jump to a step, watch its facts live (REDnode) | A change shows in the running game without a restart, or the reason it cannot |
| **Q4 Voice, sound and world** | Voiced lines in the game: the voice-over map and `.wem` paths from EDGEwave's `voice.json`; music and sounds by event name in beats and scenes (Decisions, Music and sound), picked, heard and made through EDGEwave; places and people from EDGEbuilder. Checklist items for voice, places and people tick themselves once the voice files and placed spots exist | A quest with a voiced NPC standing where the modder placed them |
| **Q5 Ship** | Docs, the MCP package on npm, Open VSX and Marketplace, EDGEkit and EDGEchat entries | A non-coder makes a small quest from the docs alone |
| **Q6 The assistant builds it all** | The AI writing a quest works through its checklist with the other EDGE tools' MCP servers: voice from EDGEwave, places and people from EDGEbuilder, items and props from EDGEfab. Each item is the hand-off, and ticks when that tool is done. Agreed as a direction 2026-10-22; planned after Q5 | A quest described in a few sentences ends with an empty checklist and every line voiced |

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
| Whether the index should also read the game's 4,627 scenes, so facts set in scenes count as set | Q2 |
| Whether a choice's branch is best made with a fact or with the scene's own exits (how game quests do it) | **Answered 2026-10-23:** the scene's exits, as 375 of 392 game scene nodes do; in-game test 5 passed with both endings |
| Whether a quest's music cue plays well from another quest, or expects a music state set before it | Q4 |
| Whether a REDmod custom sound under a new event name plays when a quest phase or scene posts it (EDGEwave #7) | Q4 |
| Whether a game quest's objectives map cleanly enough to beats for a storyboard of it (several objectives are often open at once) | After Q2 |

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
