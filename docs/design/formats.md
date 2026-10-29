# Quest <span class="y">formats</span>

**Status: agreed with the owner on 2026-10-21** (written 2026-10-17 in Q0). What a quest is made of in the game files, how mods add one, and what must agree across files. Checked against the installed game (2.3x with Phantom Liberty) through `redcode-mcp` (REDbridge 0.10.0, WolvenKit 9.1.0), ArchiveXL's source and release notes, the community wiki, and two published quest mods (their file sets and behavior only). Anything not checked is marked *unverified*.

## The files

| File | Count in the game | What it is |
|---|---|---|
| `.quest` | 734 | A quest's top graph (`questQuestResource`). The game's root is `base\quest\cyberpunk2077.quest`; Phantom Liberty adds `ep1\quest\ep1_standalone.quest` (and a second file, `cyberpunk2077_ep1_standalone.quest`) |
| `.questphase` | 3,838 | A phase: a graph of nodes joined socket to socket (`questQuestPhaseResource`). Phases nest: a phase node points at another phase file |
| `.scene` | 8,553 | A dialogue or cinematic scene (`scnSceneResource`): actors, a scene graph (sections, choices, hubs, quest nodes inside the scene), the screenplay (lines and choice options) |
| `.journal` | 2 | The journal tree: quests, contacts and phone messages, codex, shards (onscreens), points of interest and more. Root `gameJournalRootFolderEntry`, nine folders |
| Onscreens `.json` | per language | Short texts by LocKey: journal titles, objectives, text messages (`localizationPersistenceOnScreenEntry`: `primaryKey`, `secondaryKey`, female and male text) |
| Subtitles `.json` | 3,800 in en-us | Spoken-line text by `stringId` (`localizationPersistenceSubtitleEntry`) |
| Voice-over maps | `voiceovermap.json` and `_1` per language (32,767 + 30,184 entries in en-us) | `stringId` to the female and male `.wem` file |
| Line lengths | `stringidvariantlengthsreport.json` per language | `stringId` to the female and male line length in seconds |
| Voice `.wem` | 102,158 in en-us | Named `<speaker>_<quest>_f_<id in hex>.wem` |
| Lip sync | `.anims` per scene and speaker, `<language>.lipmap` | Animation names `f_<ID IN HEX>` and `m_<ID IN HEX>` |
| World data | `.streamingblock`, `.streamingsector` | People, spots, trigger areas and markers a quest refers to by NodeRef |

## One id ties a spoken line together

Checked on `sq030_01_dam_meetup.scene`: for 50 of its 59 lines, the line's `locstringId` is also the subtitle `stringId`, the voice-over map `stringId` and the line-length `stringId`; the `.wem` name and both lip-sync names carry the same id in hex. Choice options use the same `locstringId` to subtitle join (13 of 14). Why 9 lines have no entries is *unverified* (likely unvoiced or unused lines).

## How a mod adds a quest

Through ArchiveXL's `.xl` file, without replacing game files. ArchiveXL documents these keys in its source and release notes rather than its README.

| Need | `.xl` key | Since | Notes |
|---|---|---|---|
| Start a new quest | `quest.phases`: `path`, `parent` | 1.9.0; parent a `.quest` from 1.15.0 | A phase whose parent is a `.quest` starts once per save, also in existing saves. ArchiveXL remembers that in a fact. Parent `cyberpunk2077.quest` is a scope covering the base game and Phantom Liberty roots (1.22.0) |
| Hook into a game phase | `quest.phases` with `input`, `output`, `intercept` | 1.9.0 | Input and output are node-id paths plus a socket. Conflicts with other mods hooking the same place are possible |
| Journal entries | `journal` | 1.4.0 | A partial journal tree, merged by path. Its root id must match the game's |
| Texts | `localization.onscreens` | 1.x | Merged by `secondaryKey` |
| Subtitles, voice, lip sync | `localization.subtitles`, `vomaps`, `lipmaps` | 1.4.3 | One file per language. No key for line lengths (Audioware fills that with a script); whether new lines need one is *unverified* |
| World data | `streaming.blocks` | 1.4.0 | A quest sector with trigger areas, spots and markers; communities from 1.17.0 |
| Scenes, facts | none | | A scene is reached by path from a phase; facts are set and tested by nodes |

New voice needs `.wem` files made with Wwise 2023.1.14 (the wiki calls this version a hard requirement). New lip-sync animation cannot be made from new audio; WolvenKit can copy a game line's animation. V has no lip sync.

## What must agree across files

This is what `quest_check` will test.

| Link | Both ends | Status |
|---|---|---|
| Phase injection | `.xl` path and parent exist; input and output node paths and sockets exist in the parent | ArchiveXL source |
| Phase node and child phase | The child's input and output socket names match the phase node's sockets | Wiki guide |
| Journal | A node's journal path (`realPath`, `className`, `fileEntryIndex`) points at an entry in a loaded journal | Seen in both studied mods |
| Texts | Every LocKey a journal entry uses exists in the onscreens file of each shipped language | Seen; wiki |
| Dialogue | Each line and option id has a subtitle entry; voiced lines also a voice-over map entry and lip sync | Checked in the game |
| Scene actors | Section events use performer ids (`actorId × 256 + 1`), lines use actor ids, debug symbols list them | Wiki stub, *unverified* |
| Facts | Same name in every node that sets or tests it; unique per mod; writes to the game's own facts flagged | Seen in a mod |
| World | Every NodeRef a phase or scene uses is registered by a loaded sector; the phase's prefab ref matches the block's | Seen in a mod |
| Images | `imageId` and avatar ids exist as TweakDB records | Wiki guide, *unverified* |

## Two quest mods studied

| | A Judy side quest (Californication, Nexus 7833) | Jobs of Night City: Trauma Team (Nexus 7427) |
|---|---|---|
| Approach | The game's own quest files | A CyberScript datapack: JSON missions run by a CET mod |
| Files | 10: three phases, two scenes, a journal, onscreens, a subtitle file, a world sector | 50 JSON scripts, 69 WAV voice lines (Audioware), a vehicle and workspots |
| How it starts | Fills slot 3 of a separate quest framework by the same author (not studied yet) | CyberScript's own triggers |
| People | Reuses Judy's spawn entries and game animations | Spawns NPCs at runtime |
| Scene | A game scene copied and edited | CyberScript's dialogue UI |
| What to avoid | Replaces a whole game subtitle file (conflicts, English only); hand-picked text keys; writes the game's own facts | Depends on a framework that may be broken on the current game (owner) |

## Saves and live reload

| Question | What is known | Status |
|---|---|---|
| Are facts saved? | Yes; an unset fact reads 0 | Wiki |
| A new quest after removing and reinstalling the mod | ArchiveXL's start fact stays in the save, so the quest does not start again | ArchiveXL source; effect inferred |
| A save whose running phase file is gone | No source | *Unverified* |
| Reloading archives in a running game | RedHotTools reloads archives and asks ArchiveXL to reload; WolvenKit has a hot reload button | RedHotTools source |
| A running phase or scene picking up changes | Not documented; reloading then loading an earlier save should work | *Unverified* |

## Places, map markers and arriving (Q2 study, 2026-10-21)

What a new quest needs to send V somewhere, checked against the game files, the Judy mod and ArchiveXL's journal source.

| Question | Finding | Status |
|---|---|---|
| Where a map marker's position comes from | `base\worlds\03_night_city\_compiled\default\03_night_city.mappins` (`gameMappinResource`): 4,337 compiled positions, plus 41 GPS and 5 multi-position entries. Each is keyed by the **journal path's hash** (Murmur3, seed `0x5EEDBA5E`, of the full path), not by a NodeRef. 4,266 of them match a journal path in the game, so every game marker has a known name, quest and world position | Checked in the game |
| A new quest's marker | Has no compiled position. ArchiveXL fills it in when the game asks, from the NodeRef in `reference`: that node's transform plus `offset`. ArchiveXL's source also reads "no NodeRef: `offset` is the world position", but **in the game a marker with no NodeRef shows at the world's origin**: the game never asks ArchiveXL (no "Cooked mappin" line in its log), and ArchiveXL has already cleared the offset. The game's own static markers all stand on a node (3,257 compiled, 44 without a node and without a compiled position) | In-game test 2026-10-22 (ArchiveXL 1.27.4) |
| What EDGEquest does | A place is a game map marker. The quest index keeps each marker's NodeRef and offset (`#mq055_mp_megabuilding_apartment`, `0 0 0.5` at V's door); the new marker uses both. **The marker showed at V's door, with its GPS route**, so ArchiveXL resolves the node while V is far away (it reads the node's transform from the world's static data) | In-game test 2, 2026-10-22 |
| V's distance to a node (`questDistanceComparison`) | `questObjectDistance`: a `questUniversalRef` with `refLocalPlayer` 1, and `nodeRef2`, compared with a `questValueDistance`: 2,130 uses with V, 399 to a node a marker also uses. The ones looked at measure to **entities** (the vehicle offers' `_mp` nodes are `worldEntityNode`s: the cars); the rest are *unchecked*. V's door marker node is in no quest sector: a map spot with no entity. **V within 10 m of it never fired.** Not used | In-game test 2, 2026-10-22; the world sectors |
| How game quests wait for V at a place | V inside a trigger area: `questTriggerCondition` with `isPlayerActivator` 1, `type` `IsInside` (or `Entered`), `triggerAreaRef` the area's NodeRef. mq055 shows the door marker, then waits until V is inside `#mq055_tr_megabuilding_apartment`. The Judy mod does the same with its own area | The game, the Judy mod |
| Where trigger areas live | In **quest prefab sectors** (`quest_*.streamingsector`: 2,404 in Night City, 381 in Dogtown, 2 in the main menu). A node's path names its prefabs: `$/.../#mq000_pr_apartment/#mq000_tr_vs_apartment`. Such a sector is loaded only while a running phase lists the prefab in `phasePrefabs` (`questQuestPrefabEntry`). 10,221 trigger areas; game phases list the outer prefab (503 aliases) or an inner one (541). **Game 2.5 through REDbridge 0.11.0 (2026-10-27):** a sector's node entries (`worldCompiledNodeInstanceSetupInfo`) no longer carry the path, only `globalNodeId.hash`: FNV-1a 64 of the full path with every `#` left out. The streaming block's descriptor names the sector's prefab (`questPrefabNodeRef`, `$/.../#mq000_pr_apartment`), and a trigger node's `debugName` gives its alias (`{mq000_tr_vs_apartment}`; copies `{mws_wat_03_tr_start_}_003` for `#mws_wat_03_tr_start_003`, though some real aliases keep a doubled `_`). The hash checks a name only for a node right in its prefab (7,733 of 12,310). 10,795 areas; 5,702 of the 5,723 that game phases wait in are found. Where no phase lists a prefab on the path, the index gives the sector's own prefab (*inferred*: it is what loads the sector) | The game's world |
| What EDGEquest does to arrive | Waits until V is inside the place's trigger area, and **lists the area's prefab in the phase's `phasePrefabs`**, as the Judy mod lists `#dlc6_apart_judy_apartment`. The area is the place's `area:`, or the one the game's own quest waits in after showing that marker (2,417 of the 4,266 markers have one). The template uses V's apartment quest's `#mq000_tr_vs_apartment` (prefab `#mq000_pr_apartment`, which also holds a stash scene object) rather than the romance quest's (its prefab also holds a bottle) | Q2 test 3 |
| GPS distance to a marker (`questMappinGPSComparison`) | Needs no node, only the marker. The game uses it only at 1,000 m and more (courier timers). **It did not fire at 10 m** in test 1, though the marker there was at the origin, so the test was not fair to it. Not used | In-game test 2026-10-22 |
| Subtitles through ArchiveXL | An `.xl` `localization: subtitles:` entry is loaded as a **subtitle map** (`localizationPersistenceSubtitleMap`: entries of `subtitleFile` and `subtitleGroup`), like the game's `base\localization\en-us\subtitles\subtitles.json` (3,538 entries, group `quest` for quest scenes, files named after their scene). A file of lines listed there directly fails to load ("Resource … failed to load" in ArchiveXL's log). Game scenes keep only `db_db` text in `locStore`; the text players see comes from the subtitle files | In-game test 2026-10-22, ArchiveXL source, the game |
| Game NodeRefs from a quest's own prefab | A phase lists its world prefabs (`phasePrefabs`, for example `#mq026_pr_smuggler`); its trigger areas and spots live there. They are in quest prefab sectors (above). Whether another phase listing the prefab brings them in while their own quest is not running is *unverified* | Q2 test 3 |
| The Judy mod's places | Its own sector, added through `streaming.blocks`: a trigger area, two AI spots and a static marker, NodeRefs under a game prefab's path. Its markers point at those NodeRefs with a 0.5 m height offset | Seen in the mod |
| `fileEntryIndex` in a journal path | The position in the path of the entry that owns the file: the quest (`quests/minor_quest/mq026_conspiracy/...` is 2; the Judy mod's `quests/main_quest/prologue/nq_californication` is 3) or the contact (`contacts/judy/...` is 1). Default -1 | Seen in the game and a mod |
| A scene's place | `sceneLocation` is a `scnWorldMarker`: a NodeRef (5,036 scene nodes in the game) or a tag. **The tag `around_player` (156 uses) plays the scene wherever V is**, so a scene with V alone or a phone call needs no place | Checked in the game |

## The smallest scenes (Q2 study, 2026-10-21)

A scan of the game's 4,627 `.scene` files (4 failed to read): 102 have V as the only actor, 96 of them with a choice. The smallest with lines and a choice is `mq017_streetkid_chicken_test.scene` (2 lines, 4 options); the smallest phone call is `courier_sandbox_holocall_ambush.scene` (5 lines). What a scene with V alone holds:

| Part | Content |
|---|---|
| Actors | `playerActors`: one `scnPlayerActorDef`, `findInContext`, contextual name `Player`, record `Character.Player_Puppet_Base`. `actors` is empty |
| Graph | `scnStartNode` → `scnSectionNode` (dialogue line events) → `scnChoiceNode` → … → `scnEndNode`. Node ids are small numbers; an output socket is `(name, ordinal)`, and a choice's option *i* leaves from socket `(0, i)` |
| Lines | A section's `scnDialogLineEvent` has `screenplayLineId`, `startTime` and `duration` in ms, `voParams` (`Vo_Context_Quest`, `Vo_Expression_Spoken`). A screenplay item's id is its place in its own list: line k is `k*256+1`, option k is `k*256+2` (all 9,591 lines and 1,897 options in 141 sampled quest scenes, 2026-10-22). The game finds an item by that id: in-game test 3 numbered lines and options with one shared counter, so the options pointed past the end of their list; the choice showed no text and choosing it crashed the game |
| Text | `screenplayStore` lines and options point at a `locstringId`; `locStore` maps it per locale (`db_db`, `en_us`, …) to a variant and its text |
| Performers | `debugSymbols` lists each performer: V's `#player` is performer id 1 for actor id 0, so **performer = actorId × 256 + 1 holds** |
| Entry and exit | `entryPoints` `Start 0` and `exitPoints` `End 0`, which become the phase's scene node sockets. **A scene branches its quest by its exits:** each exit point names an `scnEndNode`, and the quest's scene node has an output socket of the same name. 375 of 392 scene nodes in 300 side and minor quest phases have several outputs (2026-10-23); `mq000_03_secret_room.scene` has exits `try_get_inside`, `whats_this`, `dont_believe` and `End 3`. End nodes are `Terminating` or `NonTerminating`. EDGEquest makes a `go_<beat>` exit per beat a choice goes on to |
| Other | Empty workspots, props, effects; an `interruptionScenarios` default; `resouresReferences` lists the lip sync anim set; `sceneCategoryTag` (`minorQuests`, `other`, …) |
| A phone call | The caller is a `scnActorDef` (`spawnSet`); their lines have `isHolocallSpeaker` 1 and `Vo_Expression_Phone`. How the phase opens the call and shows the caller's portrait is the next study |

### Choice options

How the game marks an option, from 2,722 options in 579 sampled scenes and the game's scripts (`questCondition.swift`, `rpgManager.swift`), 2026-10-29, game 2.5:

| Part | Content |
|---|---|
| Colour | `scnChoiceNodeOption.type` is a `gameinteractionsChoiceTypeWrapper` whose `properties` are bits of `gameinteractionsChoiceType`: `QuestImportant` 1 (yellow), `Blueline` 256, `Pay` 512 (`AlreadyRead` 2 is set by the engine as an option is chosen). 1,433 options had 1, 1,147 had 0, 72 had 257, 68 had 256 |
| Blue tag | `bluelineCondition`: a `questStatsCondition` with `questLifePath_ConditionType` (`LifePath_ScriptConditionType`, `lifePathId` `LifePaths.Corporate`, `.Nomad`, `.StreetKid`) or `questBuild_ConditionType` (`Build_ScriptConditionType`: `buildId` `PlayerBuilds.Solo` (Body), `.Netrunner` (Intelligence), `.Techie` (Technical Ability), `.Reflexes`, `.Cool`; `difficulty` an `EGameplayChallengeLevel`; `comparisonType` `CO_GreaterEq`, or `CO_Lesser` for the option shown to V below it; `questAssignment` a content assignment whose power level picks the number from the `attribute_checks` curves); or a `questPaymentCondition` with `PaymentFixedAmount_ScriptConditionType` (`payAmount`) or `PaymentBalanced_ScriptConditionType` (`difficulty`, `questAssignment`), `payWhenSucceded` 1 takes the money. Both `entityRef`s are a `questUniversalRef` with `refLocalPlayer` 1. The dialogue UI shows a failed blueline with its fail background |
| Showing it | `questCondition` hides an option when false: 489 options, mostly fact tests. Some lifepath options repeat the lifepath test there (`sq012_07a_conclusions.scene`) |
| Other | `iconTagIds` (`ChoiceCaptionParts.SitIcon`, `JackInIcon`, …) for action options; `isSingleChoice` (157); `timedParams` (timed choices, rare); `gameplayAction` (`Interactions.Inspect`) |

EDGEquest writes yellow from the story (worked out or `main:`), a lifepath as both blueline and quest condition, a check with `DeviceContentAssignment.Autoscaling` (power level `Character.ScaleToPlayerLevel`), a payment with `Pay` set too. *Unverified until in-game test 8:* that another lifepath's option is hidden, that a failed check or payment shows locked, and that paying takes the money.

## Music and sound in quests (Q4 study, 2026-10-24)

A sample of 300 of the 3,837 quest phases and 150 of the 4,627 scenes, read through REDbridge on game 2.31:

| Where | Class | Fields | Seen |
|---|---|---|---|
| Phase | `questAudioNodeDefinition`, type `questAudioEventNodeType` | `event`, `isMusic`, `musicEvents`, `events`, `switches`, `params`, `objectRef`, `isPlayer`, `emitter` | 143 nodes in 36 phases |
| Phase | type `questAudioMixNodeType` | `mixSignpost` | 144 |
| Phase | types `questAudioSwitchNodeType` (`switch`, `isMusic`), `questAudioMusicSyncNodeType` | | 2 and 1 |
| Scene | `scnAudioEvent` | `audioEventName`, `emitterName`, `ambientUniqueName`, performer | in 24 of the 150 scenes |

Music is posted as cue events per quest: `mus_q001_v_meets_dex_01_START_intro_dialogue_choice`, `..._02_take_the_chip` to `..._05_STOP_end_silent`; `mus_q104_drone_flight_01_START` and `_02_STOP`. Sound events are names such as `sa_airdrop_package_land`; scene events are mostly a performer's foley (`q004_sc_06_v_stands_up`). The two switches seen set `radio_station`. *Unverified:* whether a cue plays well outside its quest, and what the mix signposts do.

## Tools that already edit quests

WolvenKit edits `.questphase` and `.scene` as node graphs (since 8.12.1, reworked in 8.17.0): add and connect nodes, a scene editor with a timeline, dialogue import from JSON (9.0.0), copying game lip sync. It has no undo yet. Whether it opens `.quest` as a graph is *unverified*. EDGEquest's place next to it: the story layer, checks across files, and assistants; raw graph editing stays in WolvenKit and REDcode's CR2W editor.

## Sources and credits

ArchiveXL by psiberx (source, release notes, `QuestBaseScope.xl`); WolvenKit and its wiki; the Cyberpunk 2077 modding wiki (quest guides on facts, sockets, text messages, holocalls, Johnny scenes, custom voice lines, lip sync, shards, communities, NodeRefs); RedHotTools by psiberx; Audioware docs; the authors of the two studied mods.
