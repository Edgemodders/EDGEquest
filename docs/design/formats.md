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

## Tools that already edit quests

WolvenKit edits `.questphase` and `.scene` as node graphs (since 8.12.1, reworked in 8.17.0): add and connect nodes, a scene editor with a timeline, dialogue import from JSON (9.0.0), copying game lip sync. It has no undo yet. Whether it opens `.quest` as a graph is *unverified*. EDGEquest's place next to it: the story layer, checks across files, and assistants; raw graph editing stays in WolvenKit and REDcode's CR2W editor.

## Sources and credits

ArchiveXL by psiberx (source, release notes, `QuestBaseScope.xl`); WolvenKit and its wiki; the Cyberpunk 2077 modding wiki (quest guides on facts, sockets, text messages, holocalls, Johnny scenes, custom voice lines, lip sync, shards, communities, NodeRefs); RedHotTools by psiberx; Audioware docs; the authors of the two studied mods.
