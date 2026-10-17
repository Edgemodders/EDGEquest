# EDGE<span class="y">quest</span> design

EDGEquest writes new quests for Cyberpunk 2077. It is a VS Code extension in the EDGE family, with an MCP server. A modder describes a quest: who gives it, what V does, what people say, what choices there are, and how it ends. EDGEquest turns that into the game's own quest data: the quest graph, its phases, dialogue scenes, journal entries and facts. It also reads the game's quests, so a modder can learn from them, copy them, or hook into them. Or the modder asks REDagent or Claude: "add a side gig where Wakako sends V to collect a debt".

**Status: draft 0.1, a starting brief.** Written on 2026-10-16 by the REDcode session that scaffolded this repo. It holds what was checked against the game that day, the family's boundaries as they stand, and the questions to settle. It is not agreed decisions: everything marked *open* or *unverified* is for EDGEquest's own first session to settle with the owner. That session replaces this page, section by section, with the real design. Next: Q0.

## Mission

EDGE brings modding to everyone, especially non-coders: easy, fun and fast. A quest today is several graph files, dialogue scenes with lines and choices, journal entries, facts that tie them together, localized text, voice, and the places and people in the world. They must all agree with each other, and the tools for them are hard to learn. EDGEquest's job is that a modder thinks in story, not in node types.

| Rule | In practice |
|---|---|
| Start from the story | "V meets Wakako, takes the job, chooses to pay or to fight" before `questPhaseNodeDefinition` and sockets |
| Plain words first, details one click away | A quest reads as steps and choices. The graph and the raw nodes are one click away |
| Learn from the game | Any game quest opens read-only, explained in the same plain words |
| Everything the UI does, an assistant can do | Each feature ships in the UI and the MCP server together |
| Try it in seconds | One action packs, deploys, and starts or jumps to a step in the running game |

## What quest data is made of

Checked on 2026-10-16 against the installed game, with Phantom Liberty, through `redcode-mcp` and REDbridge 0.10.0: `archive_list` over all 583,798 game files, `cr2w_read` on sample files. The class and field names are the game's own.

| File | Count | What it is | Shape seen |
|---|---|---|---|
| `.quest` | 734 | A quest's top graph (`questQuestResource`) | `graph` (a `questGraphDefinition`), `phasePrefabs`, `inplacePhases`. In `mq303.quest`: start, end, three phase nodes and a switch |
| `.questphase` | 3,838 | A phase: a sub-graph of steps (`questQuestPhaseResource`) | The same fields as `.quest`. Nodes are handles; each has an `id` and `sockets`, and each socket lists its `connections`. Node types seen in one phase: input, pause condition (with a facts condition), combat, logical XOR, facts DB manager, event manager, character manager, cut control |
| `.scene` | 8,553 | A dialogue or cinematic scene (`scnSceneResource`) | `actors`, `playerActors`, `entryPoints`, `exitPoints`, `sceneGraph` (start, section, choice and quest nodes), `screenplayStore` (`lines` and choice `options`), `locStore`, `workspots`, `props`, `sceneCategoryTag` |
| `.journal` | 2 files (the base one is in two archives) | The journal (`gameJournalResource`): `base\journal\cooked_journal.journal` and `ep1\journal\cooked_journal.journal` | One root folder with nine folders: quests, metaquests, codex, contacts, tarots, briefings, points of interest, onscreens, internet sites |
| Subtitles | 3,800 JSON files in en-us | Dialogue text, per language: `<root>\localization\<language>\subtitles\...` | Separate from the onscreens texts that REDcode's LocKeys view covers |
| Voice | 102,158 `.wem` in en-us | Spoken lines, per language: `<root>\localization\<language>\vo\` | Names such as `<speaker>_<quest>_<f or m>_<id>.wem` |
| Lip sync | 7,268 `.anims` in en-us, one `en-us.lipmap` | Mouth animation per line | Scene lines name a male and a female lip-sync animation |
| Voice-over maps | 17 JSON files | `<root>\localization\common\voiceovermap*.json` | Not opened yet |

Where they live (counts of `.questphase` files): `base\open_world` 1,474, `base\quest` 1,364, `ep1\openworld` 535, `ep1\quest` 436, the rest in `base\media`, `base\gameplay` and `dlc`. One quest folder, `ep1\quest\minor_quests\mq303`, holds 183 files: 8 phases, 6 scenes, 50 entities, 79 meshes, 17 animation sets, 9 workspots, 4 communities. A quest is more than its graphs.

A scene line (`scnscreenplayDialogLine`) has a speaker, an addressee, a `locstringId` (a CRUID) and the two lip-sync names. The text itself is in the subtitle files and the scene's embedded `locStore`. How they join is *unverified*.

### Unverified, for Q0 to check

| Claim | Where it comes from |
|---|---|
| Facts are named integers in the quests system; graphs set and test them, and scripts read them through `questQuestsSystem` `GetFact` and `SetFact` | The node and condition types above, and REDnode's game reference, which lists `questQuestsSystem` with `GetFact`, `GetFactStr` and `SetFact` |
| ArchiveXL can add journal entries and inject new phases into existing quests, so a mod does not replace game files | Community practice. Read ArchiveXL's own documentation and check against a working mod |
| WolvenKit shows and edits `.questphase` and `.scene` files as graphs | Community practice. Check which WolvenKit version and what it can do, and credit it |
| How a new quest starts: hooked into an existing phase, started by a fact, by a phone call, by a place | Open. Study working quest mods (their file sets, not their code) |
| How scene lines join their subtitle text and voice files | Open |
| Which game data must agree for a quest to load: journal paths, fact names, node ids, `NodeRef` paths to people and places in the world | Open |

## What EDGEquest owns, and what it does not

EDGEquest owns the story layer, which no other EDGE tool owns, and calls the others for the rest. This split is a proposal for Q0 to confirm with the owner and the sibling designs.

| Job | Owner | EDGEquest's part |
|---|---|---|
| **The quest**: quest and phase graphs, facts, the journal entries, dialogue scenes (lines, choices, who speaks), the checks that they agree | **EDGEquest** | Its core |
| Reading and writing any game file | REDbridge (`cr2w.*`), as a separate process | Calls it. Graph-aware needs go to REDbridge as requests |
| Raw edits of any file | REDcode's CR2W editor, which already opens all these files | Opens files there for raw edits |
| The project, packing | REDcode, through `REDcodeApi` version 1 | Calls it |
| Onscreen texts (LocKeys) | REDcode's LocKeys view and REDbridge `loc.*` | Uses them. Subtitles are not covered yet: a likely REDbridge request |
| Voice for new lines (recorded, or AI voice opt-in) | EDGEwave | Hands lines over; EDGEwave makes and imports the audio |
| People and places in the world: NPC spawn points, markers, props | EDGEbuilder | References what EDGEbuilder places |
| New items as rewards, new characters' looks | EDGEfab, TweakDB through REDbridge | References them |
| Deploying | REDdeck | Through REDcode's install |
| The running game: facts, starting a step, the journal, teleporting V for a test | REDnode (game API, MCP server) | One "Try it" action that calls it |

## Shape

The same shape as EDGEmat and EDGEfab, so the family stays one pattern. Names are proposals.

| Part | What it is |
|---|---|
| `extensions/edgequest` | The VS Code extension, id `edgemodders.edgequest` (proposed). Its own **activity bar container**, icon [`tools/brand/activity.svg`](https://github.com/Edgemodders/EDGEquest/blob/main/tools/brand/activity.svg) (HUD brackets around a branching graph, one color). Views: the quests in the project, the game's quests, a quest's steps |
| `extensions/edgequest/src/core` | Everything that is not UI. **No VS Code imports**, so the MCP server bundles it |
| `packages/edgequest-mcp` | The MCP server over stdio |

| Relationship | How |
|---|---|
| REDcode | Optional but expected. `REDcodeApi` version 1 (`edgemodders.redcode-cyberpunk`): game folder, bridge, open project, pack. Never imports its code |
| REDbridge | Every game file read and write. Needs go to REDbridge as `request` issues |
| EDGEwave, EDGEbuilder, EDGEfab, REDnode, REDdeck | Through their APIs and MCP servers, when present; requests as issues |
| EDGEkit, EDGEplugin | Bundled, and taught to the assistant, once released |

## The MCP server

Intent, not plumbing. Proposed names, settled in Q0:

| Tool | Does |
|---|---|
| `quest_find` | Finds game quests by name, character, place or line of dialogue |
| `quest_describe` | A quest in plain words: its steps, choices, facts, journal entries and scenes |
| `quest_new` | Starts a new quest from a short description, or from a game quest to copy |
| `quest_check` | Checks a quest's files against each other and names what is wrong in plain words |
| `quest_try` | Packs, deploys, and starts the quest or jumps to a step in the running game |

## Phases (proposed)

For the first session to agree with the owner. Reading comes before writing, because the game's quests are the documentation.

| Phase | Builds | The test proves |
|---|---|---|
| **Q0 Design** | Study the formats above and working quest mods, settle the unverified rows, agree the boundaries and the phases. The design document is the output | The owner agrees the design |
| **Q1 Read** | Extension and MCP skeletons. Any game quest opens as steps, choices and scenes, read-only | A modder follows a game quest from start to end without opening a raw file |
| **Q2 Write** | A new quest from a template: one phase, facts, a journal entry, a short scene with a choice | A new quest shows in the journal and its scene plays, in the game |
| **Q3 Try it** | Pack, deploy, start the quest or jump to a step, watch its facts live | A change shows in the running game without a restart (unverified whether quests can reload live) |
| **Q4 Voice and world** | Lines to EDGEwave for voice, people and places from EDGEbuilder | A quest with a voiced NPC standing where the modder placed them |
| **Q5 Ship** | Docs, the MCP package, Open VSX and Marketplace, the EDGEkit bundle | A non-coder makes a small quest from the docs alone |

## Open questions

| Question | Notes |
|---|---|
| New quest or hook into an old one | A new quest needs a way to start. Hooking into the game's own phases risks conflicts with other mods |
| Which dependencies | ArchiveXL and TweakXL are likely; Codeware or redscript only if a quest needs code. Fewer is better for players |
| How much of the graph to show | Steps and choices for most people; the full node graph for experts. The game has dozens of node types |
| Scenes | Dialogue scenes are the biggest files (up to 3.3 MB). Writing new ones from scratch may be hard; copying and editing a game scene may be the first step |
| Voice | Every line needs subtitles in each language, voice per language, and lip sync. What can be left out, and what the game does without it |
| Save games | Facts and quest state live in the save. What happens when a quest mod is removed or changed |
| Live reload | Whether REDnode can reload a quest phase in the running game, or only start and jump |

## Sources

| Source | What it gave |
|---|---|
| The installed game, through `redcode-mcp` | Every count and shape in "What quest data is made of" |
| [REDnode game reference](https://edgemodders.github.io/REDnode/game/) | `questQuestsSystem`, `gameJournalManager` and the quest node types |
| [REDcode API](https://edgemodders.github.io/REDcode/api.html) | `REDcodeApi` version 1 |
| [EDGEfab design](https://edgemodders.github.io/EDGEfab/design.html) | The family's shape, copied here |
