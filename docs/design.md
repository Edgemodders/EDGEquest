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
| Music and sound | **A beat or a scene can play music and sounds by event name.** In the story file, a beat step `{ music: <event> }` or `{ sound: <event> }`, and a scene item `{ sound: <event> }`; EDGEquest writes them as the game does: a phase's `questAudioNodeDefinition` with `questAudioEventNodeType` (`isMusic` for music), and a scene's `scnAudioEvent`. Game quests post their music as cues per quest (`mus_q001_v_meets_dex_01_START_...` to `..._05_STOP_end_silent`), so a story names the cue to start and the one to stop. On the Storyboard, + Step and the scene's add row get Music and Sound, with a picker and Play (a music cue plays in the running game, through EDGEwave and REDnode, since music is in the game's sound banks; the owner agreed 2026-11-03 that this is enough, as music is event driven, so no offline music player is asked of EDGEwave); an assistant finds events with EDGEwave's MCP `sound_events` and writes the steps with `quest_edit`. Finding, hearing and making sounds is EDGEwave's (request [EDGEwave #7](https://github.com/Edgemodders/EDGEwave/issues/7)); without it a name is typed by hand and the checklist names EDGEwave. Agreed with the owner 2026-10-24, in Q4; **built 2026-10-24** (EDGEwave's API was ready the same day), in-game test 6 to come. EDGEquest reads the game's event names itself (`eventsmetadata.json`, names only, in its cache folder) for the checklist; searching, hearing and making stay EDGEwave's |
| Kinds of choice options | **An option can be yellow or white, and can carry a lifepath, an attribute check or a payment**, as the game's are (agreed 2026-10-29). Yellow is a flag the writer sets in the game (`QuestImportant`, on about half of 2,722 sampled options), not something the engine works out; grey (already chosen) is the engine's. EDGEquest works it out: an option that goes to a beat or sets a fact is yellow, the rest white, and `main: yes` or `no` says otherwise. The blue tag in front of an option is its blueline condition: `lifepath: corpo` (or `nomad`, `streetkid`; also written as the option's quest condition, so another lifepath does not see it), `check: { body: hard }` (body, intelligence, reflexes, tech, cool; easy, medium, hard or impossible, a number that grows with V's level through the game's `DeviceContentAssignment.Autoscaling`; V's score is the attribute plus its skill-check bonus, at most 20), or `pay: 500` (eddies) or `pay: medium` (a price for V's level), taken on choosing it. An option with a kind is a map with its items under `then:`; one kind per option, and every choice keeps one option open to everyone. On the beat page, a colour and a condition picker per option; MCP `quest_edit` `setOption`. Game scenes read back with their tags ("[Corpo]", "[Body, hard]") and yellow. A fixed check number ("Body 12") would need a TweakXL record per quest, so later if wanted; a choice hub (white options that come back to the choice) after that. Details: [formats](design/formats.html#choice-options) |
| Happenings | **Scripted moments in the city that are not a quest**, such as something that happens as V comes near, are called *happenings*. EDGEquest makes them with the same quest engine (story file, Storyboard, make, checklist, MCP), because the game makes its own the same way: every random happening in Night City is a quest phase with no journal entry. EDGEbuilder builds the stage: the place, the props and the people. *Scene* keeps meaning a dialogue or performance file in EDGEquest, and EDGEbuilder keeps its own scenes (prop sets); the owner is fine with the word in both. Direction agreed with the owner 2026-11-02. **Agreed 2026-11-03:** their own file kind, `<name>.happening.yaml`; H1 comes right after Q2; a happening can also be started by a REDnode package, and can happen around V rather than at a place. The rest is a proposal, in [Happenings](#happenings) |
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
| Reading and writing any game file | REDbridge 0.11.0 (`cr2w.*`, `archive.*`), a separate process | Enough for Q1 and Q2. **Game 2.5:** REDbridge 0.10.0 did not read every 2.5 file ([REDbridge #10](https://github.com/Edgemodders/REDbridge/issues/10), closed); 0.11.0 (2026-10-26, WolvenKit 10.0.0-beta.1) reads them, and no longer reads 2.31's sectors. Its sectors give no node paths, so the index names trigger areas from the streaming block and the nodes' `debugName` (formats, trigger areas). **EDGEquest targets game 2.5 from 2026-10-27**. A file too big to come back as one JSON string (the prologue montage's 313 MB quest sector) is read through `cr2w.toJson`'s `outFile` | Its own bridge client, or REDcode's running bridge |
| Subtitles, voice-over maps, line lengths | REDbridge `loc.*` | **Answered 2026-10-23:** `loc.lines`, `loc.searchLines`, `loc.projectLinesFiles`, `loc.newLinesFile` on REDbridge's main (c8f88ec), in the release after 0.10.0. Game voice-over maps only; a project's own map is not read | Requested in [REDbridge #9](https://github.com/Edgemodders/REDbridge/issues/9), closed. To use: game lines in `quest_check`, and Find Quest by a line of dialogue |
| Raw edits of any file | REDcode's CR2W editor (`redcode.cr2w`) | Opens `.quest`, `.questphase`, `.scene`. **Answered 2026-10-23**, on REDcode's main (39706a0), released in 0.10.4: `.journal` too, and `REDcodeApi.openFile(target, node)` opens a file at a node (check `typeof api.openFile`); the graph views are agreed to be EDGEquest's | Opens files there through `vscode.openWith`, or `openFile` at the node with REDcode 0.10.4 and later. **Requested:** `.journal` too, and the graph editors REDcode once planned for C6 move here ([REDcode #12](https://github.com/Edgemodders/REDcode/issues/12)) |
| The project, packing, Pack and Try | REDcode 0.10.2, `REDcodeApi` version 1 (`project`, `pack`, `packAndTry`) | Ready | Calls it |
| Onscreen texts (LocKeys) | REDcode's LocKeys view, REDbridge `loc.*` | Ready | Uses them |
| Deploying | EDGEdeck (`EDGEdeckApi` 1, `@edgemodders/edgedeck-mcp`) | Ready | Through REDcode's install or EDGEdeck's API |
| The running game: facts, the journal, starting a phase, moving V | REDnode | **Answered 2026-10-23:** REDnode 0.32.0 has `quests.fact/facts/setFact`, `quests.watch`, `journal.entry/setState/track/tracked`, `game.player.teleport`, and MCP `game_facts`, `game_journal`, `game_facts_set`, `game_journal_set`, `game_teleport`; its in-game test passed the same day. Not available: starting a phase or jumping to a node (no game call found; setting the facts a phase waits for is the route) | Requested in [REDnode #15](https://github.com/Edgemodders/REDnode/issues/15), closed. Q3 Try it builds on it |
| Calling REDnode packages' functions from a quest (Q7), and the player's say over it | REDnode (services, `quests.watch`, roles, the Tools Manager) | Calls need nothing new. **The player's say** (the owner, 2026-10-29): a switch for calls from mods beside the one for assistants, with grants per calling package declared in its manifest and allowed in the Mod Manager, so a player can keep a tool such as a file system one for REDagent alone. Requested in [REDnode #22](https://github.com/Edgemodders/REDnode/issues/22), open | EDGEquest's made package lists its calls and treats a refusal as a failed call |
| Voice for new lines | EDGEwave | Released 0.1.0: Speak Line (ElevenLabs, opt-in) makes a WAV. **Built on EDGEwave's main 2026-10-24, not released yet:** the Voice Lines panel, `EDGEwaveApi` 1 (`voiceLines`, `voiceStatus`) and MCP `voice_lines`, `voice_status`, `voice_voices`. The `.wem` route is EDGEwave's next step | **Request:** voice a list of lines, and a `.wem` route ([EDGEwave #5](https://github.com/Edgemodders/EDGEwave/issues/5)); followed up 2026-10-22: the checklist's voice items, and MCP tools for Q6. **EDGEwave proposed a contract 2026-10-23** (Voice Lines panel, `voiceLines`/`voiceStatus` API 1, MCP `voice_lines`, `voice_status`, `voice_voices`; WAVs and `voice.json` under `source/raw/edgewave/voice/<quest>/`; `.wem` through the modder's Wwise). **EDGEquest confirmed it the same day** ([comment](https://github.com/Edgemodders/EDGEwave/issues/5#issuecomment-6376843821)), adding `say` and `direction` per line, stale when any of text, `say` or `direction` changed, one-line redo, and `voices` in the status. Lines are unvoiced in the game until the `.wem` route exists |
| Music and sound effects: finding events, hearing them, making new ones | EDGEwave (A3 puts a WAV into the game for an event through REDmod custom sounds; it plays sounds in the running game through REDnode) | `soundEvents`, `playEvent` and `customSound` in `EDGEwaveApi` 1, on EDGEwave's main since 2026-10-24 (not released yet) | **Request** filed 2026-10-24: `soundEvents` (with a music flag), `playEvent`, `customSound` (a new event name a quest can post), in its API and MCP ([EDGEwave #7](https://github.com/Edgemodders/EDGEwave/issues/7)). **Answered the same day:** built on EDGEwave's main (f510fb4), not released yet; MCP `sound_events`, `sound_custom`; music cues play only in the running game, through REDnode ([REDnode #17](https://github.com/Edgemodders/REDnode/issues/17), EDGEwave's request); custom music is a 2D sound on the effects slider (REDmod has no music type). Whether a quest node posts a new event name is EDGEquest's test 6. **Request** filed 2026-10-25 from test 6: `playEvent` plays at once without opening the Hear tab (`show: false`) ([EDGEwave #8](https://github.com/Edgemodders/EDGEwave/issues/8)). **Answered 2026-10-26:** built on EDGEwave's main (5099baf), Windows only (a hidden player), `stopSound()`; `soundEvents` and `playEvent` take `project` and list the project's own sounds first. The picker uses all of it. What EDGEwave needs from REDnode for it is EDGEwave's call. EDGEquest writes the quest's audio nodes |
| Places and people: spots, trigger areas, map markers, NPC spawns | EDGEbuilder 0.3.4 | Places meshes, entities and lights with NodeRefs. Markers and areas not planned. NPCs that stand where they were placed are agreed (EDGEbuilder's B3c, 2026-10-23) through REDnode's planned `world.load`, which loads EDGEbuilder's scene files for any package (REDnode's H2c, not built yet) | **Request:** quest places ([EDGEbuilder #3](https://github.com/Edgemodders/EDGEbuilder/issues/3)); followed up 2026-10-22: the checklist, MCP tools for Q6, and what the in-game tests found about markers and trigger areas. Until then, quests use places the game already has. **A happening's stage** (proposed 2026-11-02, see [Happenings](#happenings)): props shown only while it runs, people from a community at AI spots, and an empty crowd area, beyond B4c; **asked on #3 on 2026-11-03** ([comment](https://github.com/Edgemodders/EDGEbuilder/issues/3#issuecomment-6604135073)), needed for H2 |
| Watching a game animation before using it (Q8, the Animations direction) | REDcode's mesh viewer (offline), REDnode (live, on a spawned character) | REDcode lists animations on a rig as a deferred later step; REDnode spawns characters (H2c) but plays no animation on them | **Requests** filed 2026-11-03: an animation on its rig in the mesh viewer with `REDcodeApi.openAnimation` ([REDcode #21](https://github.com/Edgemodders/REDcode/issues/21)), and `world.playAnimation` / `world.useWorkspot` with MCP `world_animate` ([REDnode #39](https://github.com/Edgemodders/REDnode/issues/39)). EDGEquest's Animation picker calls them |
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
| **Q2 Write** | A new quest from a template: one phase under the root quest, facts, a journal entry with an objective, a short unvoiced scene with a choice, the `.xl`. Copy a game scene and clean it. **Agreed 2026-10-21:** the story file (see Decisions) and the game files made from it; New Quest (a short form) and the template: the quest starts on load, the objective shows with a map marker at a spot the game already has (a NodeRef), and the scene plays when V enters the area there. The first scene is V alone with a choice, then a phone call with a game character, so nobody needs placing before Q4. Copy Scene from a game scene's page; a Project Quests view; MCP `quest_new` and `quest_edit` on the same story file; `quest_check` runs on every write. **The checklist** (agreed 2026-10-22, see Decisions): the `todo:` section, the items EDGEquest finds (lines with no voice; text left as the template wrote it), the modder's own, `quest_checklist`, a Checklist section on the quest page and in the Project Quests view. **Beats, the Storyboard and voice prompts** (agreed 2026-10-23, see Decisions): `beats:` with `go:` from choices, the Storyboard as the story file's main editor with beat pages, `voice:` on each line with its status from EDGEwave's `voice.json`, and Generate or Regenerate once EDGEwave's API and MCP exist (Speak Line until then). **Kinds of choice options** (agreed 2026-10-29): yellow or white, lifepath, attribute check, payment | A new quest shows in the journal and its scene plays, in the game, in a save made before the mod was installed |
| **Q3 Try it** | Pack, deploy, start the quest or jump to a step, watch its facts live (REDnode) | A change shows in the running game without a restart, or the reason it cannot |
| **Q4 Voice, sound and world** | Voiced lines in the game: the voice-over map and `.wem` paths from EDGEwave's `voice.json`; music and sounds by event name in beats and scenes (Decisions, Music and sound), picked, heard and made through EDGEwave; places and people from EDGEbuilder. Checklist items for voice, places and people tick themselves once the voice files and placed spots exist | A quest with a voiced NPC standing where the modder placed them |
| **Q5 Ship** | Docs, the MCP package on npm, Open VSX and Marketplace, EDGEkit and EDGEchat entries | A non-coder makes a small quest from the docs alone |
| **Q6 The assistant builds it all** | The AI writing a quest works through its checklist with the other EDGE tools' MCP servers: voice from EDGEwave, places and people from EDGEbuilder, items and props from EDGEfab. Each item is the hand-off, and ticks when that tool is done. Agreed as a direction 2026-10-22; planned after Q5 | A quest described in a few sentences ends with an empty checklist and every line voiced |
| **Q7 Mods' tools** (agreed 2026-10-29) | A quest calls REDnode packages' functions: a `tool:` step in a beat, `tool:` items in a scene and in a choice's option, later `when:` (see [Mods' tools in a quest](#mods-tools-in-a-quest)). The made runtime package, the Tool picker, MCP `quest_tools`, checklist and `quest_check` items. Built after Q3, which brings REDnode into EDGEquest | A choice in a scene starts a REDnode package's function in the game, and a beat waits for one to finish before it goes on |
| **Q8 Happenings** (direction agreed 2026-11-02) | Scripted moments in the city that are not a quest, made like quests (see [Happenings](#happenings)): H1 at a game place with V alone, started by its conditions or by a REDnode package, right after Q2 (agreed 2026-11-03); H2 a stage from EDGEbuilder, with props and people; H3 groups that take turns, and quests that switch happenings on and off; H4 around V, with people and vehicles arriving wherever V is | Walking past a place, V sees a happening appear out of sight, play and clear away, and it comes back the next day |

<a id="mods-tools-in-a-quest-proposed"></a>

## Mods' tools in a quest

Asked for by the owner on 2026-10-29: a quest runs code from REDnode packages, such as a mod that plays a custom voice-over or starts a holocall when the quest reaches a point. **Agreed with the owner on 2026-10-29:** built after Q3, a package per quest, and the player's say through [REDnode #22](https://github.com/Edgemodders/REDnode/issues/22). Checked the same day against REDnode 0.44.0's docs and the game's scenes.

**What REDnode already has**, all passed in game: a package's service functions, callable by any other package through `service.connect(id)` (SV1); the ones marked `@tool` offered to assistants and switched in the Tools Manager (SV3); roles, `use("voice")`, for whichever package provides one (#20, REDnode 0.44.0); and `quests.watch`, which hears a fact change at once (Q-A, REDnode 0.32.0, EDGEquest's #15). A quest file cannot call JavaScript, but it can set a fact, and a REDnode package can hear it. **So the first version needs nothing new from REDnode.**

| Part | Proposal |
|---|---|
| Where calls go | **A step like any other**, so there is no separate lifecycle: first in a beat's steps runs as the beat starts, last before its ending or `next` runs as it ends, and after a `wait` or `arrive` when that is met. In a scene, between lines (as `sound:` is) and in a choice's option, several in a row, before its `go:` |
| The story file | `- tool: holocall.start` with `with: { caller: judy }` for the arguments by name, and `wait: true` to wait until it returns (the default goes on at once). The name is `<package>.<function>`, or `<role>.<function>` for a role such as `voice.speak` |
| Later: on a condition | `when:` on a beat: a condition (a fact, V in an area) and the calls to make when it is met while the beat runs, made as a branch of the phase beside the beat's steps |
| What make writes | The phase: a fact node that sets the call's fact (`<prefix>_call_<n>`), and with `wait`, a fact condition on its done fact. A scene: the same fact node inside a `scnQuestNode`, as game scenes set facts mid-scene (64 of 186 sampled). And a small **REDnode package for the quest**, made into the project under `source/resources/red4ext/plugins/REDnode/apps/<quest>/`: its manifest `requires` the packages it calls, its Node mod watches the call facts, calls each function through `service.connect` or `use`, and sets the done fact (or a failed value, logged in the Mod log) |
| A package per quest (agreed) | The quest mod carries everything it needs, with nothing else to install but REDnode and the packages it calls; the Mod Manager names a missing one. One shared EDGEquest runtime is the other choice: less copied code, one more thing to install |
| Picking a tool | Storyboard **+ Step > Tool**, and **+ Tool** in a scene and an option: installed packages' functions from their `service.json` (the game's apps folder and REDnode's development folders), with their descriptions and a field per parameter from the schema. MCP `quest_tools` lists the same for an assistant |
| The checklist and `quest_check` | An item "Needs REDnode and `<package>` (version)" with the quest's dependencies. A warning when a called package or function is not installed, when arguments do not fit its schema, and on `wait: true` (without REDnode, the quest would wait forever) |
| The player's say | **Decided by the owner 2026-10-29:** a player can stop mods (a quest among them) from calling a tool they keep for an assistant, such as a file system tool for REDagent alone. Today the Tools Manager switches tools for assistants only, so this is [REDnode #22](https://github.com/Edgemodders/REDnode/issues/22): a switch for mods beside it, and grants per calling package. The quest's package lists its calls in its manifest (`calls`), so the player allows them in the Mod Manager when it is switched on, never mid-scene; a refused call counts as failed, logged in the Mod log, and the quest goes on |

**Still to settle:** how the picker reads a package that ships no `service.json` (a request to REDnode for its descriptors without the game running); whether `wait:` gets a time limit; whether REDcode's pack copies a REDnode package from `source/resources/` (*unverified*); a tool's result steering a branch (facts hold whole numbers only).

## Happenings

Asked for by the owner on 2026-11-02: scripted moments in the city that may or may not belong to a quest, such as something that happens as V comes near. **Direction agreed the same day:** they are called happenings; EDGEquest makes them with its quest engine, and EDGEbuilder builds the stage. The rest of this section is a **proposal**, checked against the game's city scenes on game 2.5 ([formats](design/formats.html#city-scenes-how-the-game-stages-happenings-study-2026-11-02)).

**What the game does.** Every random happening in Night City is a quest phase with no journal entry, so the player never sees a quest. The game calls them city scenes: about 90 templates (a vending machine being refilled, a street performer, a highway patrol), copied into a phase per district at their places. Most have no `.scene` at all (4 of about 90 do). The phase sets the stage up while V is out of sight: it switches on a prop variant, clears the crowd from the spot and switches on a community (the people, their looks, how many, by day or night, at which spots). It notices when V is close and looks at one of its people, then waits some game hours, waits until V has gone, and clears everything away. Within a district's group only one shows at a time, and they take turns.

**Words.** A *happening* is the whole thing. A *scene* stays the game's word for a dialogue or performance file, as in quests; most happenings need none. A happening's place is its *stage*, which names an EDGEbuilder scene (EDGEbuilder's prop sets keep that name).

| Part | Proposal |
|---|---|
| The story file (agreed 2026-11-03) | `<name>.happening.yaml` beside the quests: the story file's format without a journal. `happening:` (its name), `prefix:`, `stage:`, `appears:`, `beats:` (with no objectives), `repeat:`, `todo:`. The Project Quests view lists happenings under their own heading, and they open on the Storyboard |
| `stage:` | Where it happens and what is there: an EDGEbuilder scene by name (its props, people, spots and areas, baked into the happening's quest prefab), or a game place (`area:`, a trigger area, as quests use today) |
| `appears:` | When it may show: `near:` (the area V must be in for it to be considered, like the game's district area), `time: day` or `night`, `after:` and `until:` (facts, such as a quest done), and `chance:` per visit. **Always out of sight:** it sets itself up only while V is outside the stage's area, as the game's do |
| Started by a script (asked 2026-11-03) | `appears: { called: yes }`: the happening waits for its start fact (`<prefix>_start`) as well as the rest of `appears:`. Anything that can set a fact starts it: a quest beat, or a REDnode package through `quests.setFact` (REDnode 0.32.0), so logic a quest cannot express (V's health running low, a mod's own event) starts a happening. With Q7, the happening's made package also offers `start` and `stop` as service functions, so packages and assistants call it by name. A quest file cannot run code, so the logic itself lives in the REDnode package |
| Around V (asked 2026-11-03) | `stage: around V` instead of a place: nothing is placed in the world beforehand, and people and vehicles **arrive** near V wherever V is. A step `{ arrive: { vehicle: <record>, people: [<records>], distance: 20-60 } }`, made as the game's quests make chases: `questDynamicVehicleSpawn_NodeType` with a `DynamicVehicleData` record per arrival, added through TweakXL (so such a happening needs TweakXL). An AV flying in and dropping people, as MaxTac does, is the police system's `RequestAVSpawn` with a vehicle record that lists its passengers; a quest node for it is not found, so it is a REDnode call (Q7), with a TweakXL copy of the record for a new look and new passengers (a Trauma Team AV from `Vehicle.max_tac_av`). Details and what is unverified: [formats](design/formats.html#arrivals-near-v-maxtac-and-dynamic-spawns-study-2026-11-03) |
| Repurposing a game moment (asked 2026-11-03, a direction) | **Copy a game moment into a mod and change it**, then start it from a REDnode package. The moment can be any of three things: a scene (it brings its own cast, cars on splines, synced animations, people getting out of vehicles, effects and sounds), a happening (a city scene's phase), or a system arrival (the police system's AV with its passengers, a TweakDB record). EDGEquest copies it into the project with the leftovers cleaned out (Q2's Copy Scene, widened), then shows what can be swapped in story words: the people's character records and looks, the vehicles, the lines, the sounds, the place. A swap of a record or a look is written as a TweakXL copy, never an edit of the game's record. MCP gets the same. Planned with Q8 H4; the details come when a real mod needs them (the owner's Trauma Team arrival is the first) |
| Animations (asked 2026-11-03, a direction) | **Use the game's animations in a happening or a scene, and see them before using them.** The game keeps them in animation sets that scenes play on their actors, synced sets that move people and a vehicle or prop together (the prologue's Trauma Team landing, its medics and their pack), and workspots that loop idles. *Pick:* an Animation picker searches them by name and by the scenes that use them ("trauma" finds the prologue rescue and its 20 or so animations), with each one's length and rig (male, female, an AV); the quest index learns which scene uses which. *Use:* scene items `anim:` (an actor plays one) and `workspot:` (an actor loops one), and a synced set played by the cast together; make writes the scene's animation sets and events. *See:* EDGEquest does not grow its own 3D viewer. Offline, REDcode's mesh viewer plays an animation on its rig (REDcode's design lists it as a later step); live, REDnode plays it on a character spawned beside V (EDGEbuilder B3c's NPCs). Both requested 2026-11-03: [REDcode #21](https://github.com/Edgemodders/REDcode/issues/21) and [REDnode #39](https://github.com/Edgemodders/REDnode/issues/39). New animations are EDGEfab's (F7b). Whether the arrival can play around V depends on where a scene can be placed (formats, Arrivals near V) |
| `beats:` | What happens, as beats with steps, as in a quest: `scene:`, `wait:`, `music:` and `sound:`, `set:`, and Q7's `tool:`. Two waits of its own: `seen` (V in the area and looking at one of its people, as the game's) and `gone` (V outside the area) |
| `repeat:` | `once`, or `{ every: 24h }` of game time (the default). After it, the happening clears away once V is outside the area, and may appear again |
| Quests and happenings | A quest beat can switch a happening on or off (**+ Step › Happening**: a fact its `appears:` reads), and a happening's beat can start a quest that waits for it, as street stories turn an encounter into a job. To the game they are the same kind of file |
| What make writes | A phase under the root quest (ArchiveXL `quest.phases` with parent `cyberpunk2077.quest`, as for quests) that loops: wait for `appears:` and for V outside the area; switch on the prop variant, clear the crowd, switch on the people and wait until they have spawned; the beats; the wait from `repeat:`; wait until V is outside; switch it all off; begin again. The stage's prefab goes in `phasePrefabs`, as for quest places. It ends at the point of no return, as the game's city scenes do, unless `until:` says otherwise |
| MCP | `quest_new`, `quest_edit`, `quest_make` and `quest_describe` take happening files too. `quest_index` marks the game's city scenes as happenings, so a modder can open one and learn from it |
| Trying it live | EDGEbuilder's scenes, people included, already load in the running game through REDnode's `world.load` (EDGEbuilder B3c). Trying a happening live comes with Q3 |

What EDGEbuilder would build for a stage (asked on [EDGEbuilder #3](https://github.com/Edgemodders/EDGEbuilder/issues/3#issuecomment-6604135073) on 2026-11-03):

| Stage part | In the game | EDGEbuilder today |
|---|---|---|
| The stage's area, and `near:` | Trigger area nodes in a quest prefab | B4c Quest places |
| A spot where V plays a scene | A scene marker | B4c's spots |
| Props shown only while it runs | A prefab with variants | Not planned |
| People: who, how many, their looks, day or night, where they stand and what they do | A `.community`, and AI spots with markings and workspots | Not planned for v1 |

| Step | Builds | Needs |
|---|---|---|
| H1 | The happening file, at a game place with V alone: `appears:` (`called:` too), `repeat:`, sounds and a V-only scene when V arrives, the Storyboard and MCP | Nothing new; right after Q2 (agreed 2026-11-03) |
| H2 | A stage from EDGEbuilder: props on and off, people at spots, `seen` | EDGEbuilder's stage (B4c and the parts above) |
| H3 | Groups (one of several happenings shows at a time, and they take turns) and quests that switch happenings | H2 |
| H4 | Around V: `arrive:` with vehicles and people near V; an AV arrival through REDnode | TweakXL records; REDnode and Q7 for an AV |

**Still to settle:** the exact words under `appears:`; whether `chance:` uses the game's randomizer node (11 in Little China's phase).

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
| Whether a fact a phase or scene sets reaches a REDnode package's `quests.watch` quickly enough for a tool to feel part of the scene | Q7 |
| Whether "V looks at" (`questCameraFocus_ConditionType`) works on a mod's people | Q8 H2 |
| Whether a mod's own quest prefab with prop variants and a community bakes through REDbridge's `sector.build` and loads from `phasePrefabs` | Q8 H2, with EDGEbuilder |
| Whether a phase that loops for the whole game adds anything to a save each time round | Q8 H1 |
| Whether `questDynamicVehicleSpawn_NodeType` with a mod's own `DynamicVehicleData` record brings vehicles and people near V, and whether it can bring an AV | Q8 H4 |
| Whether the police system's `RequestAVSpawn`, called through REDnode outside a police chase, flies an AV in and drops its passengers, and whether they then act as police | Q8 H4 |
| Whether a scene can play around V with no marker placed in the world (a tag on V or a spawned entity, `Entity` markers, `Player` placement), so the prologue's Trauma Team landing can play anywhere | Q8 H4 |

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
