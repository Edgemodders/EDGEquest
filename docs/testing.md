# EDGE<span class="y">quest</span> tests

Every test run on the dev PC, with its result. A test is recorded when it is first run, and its result again each time it runs. Game: Cyberpunk 2077 with Phantom Liberty at `E:\SteamLibrary\steamapps\common\Cyberpunk 2077`, read through REDbridge 0.10.0 (WolvenKit 9.1.0), 57 archives.

## Automated

| Test | How | Result |
|---|---|---|
| Smoke | `npm run smoke`: game and bridge found from the settings; 4,571 quest and phase files listed; the root quest plays `cyberpunk2077.questphase`; `sq030.questphase` reads with its inline phases (480 nodes) and uses facts, journal entries and scenes; it reads in plain words; `sq030_01_dam_meetup.scene` has 59 lines, 13 options in its choices, the player, and text for 50 lines; the quest index matches the game, finds "pyramid song" and says who plays `sq030.questphase`; inline phases do not read as a phase file "0" (added after the hand test) | **2026-10-21: 14 of 14 passed; again with the new check, 15 of 15** |
| Smoke, writing (Q2) | Also in `npm run smoke`: the index has the game's map markers with their world nodes (V's door: `#mq055_mp_megabuilding_apartment`); the New Quest template is made in a throwaway WolvenKit project (7 files, `quest_check` clean); the index has the game's quest trigger areas and their prefabs (`#mq000_tr_vs_apartment` in `#mq000_pr_apartment`); the phase reads back as its steps, arrival V inside that area; the phase lists its prefab; the marker stands on the door's node; the scene reads back with 4 lines and a choice of 2; the `.xl`'s subtitles entry is a subtitle map; the scene's lines and options are numbered by their place; the checklist lists the template's stand-ins (the description, the scene's voice) in the story file with its comments kept, keeps hand-written items, ticks settled ones and drops what is gone, and making again leaves it as it is; a made file changed by hand is kept and the other 6 are unchanged | **2026-10-21: 20 of 20 passed. 2026-10-22, after in-game test 1: 22 of 22; after test 2: 24 of 24; after test 3: 25 of 25; with the checklist: 28 of 28** |
| The Q2 test quest, made and packed | `Projects\EDGEquest_Q2`: `eq_test.quest.yaml` made and packed to `tests\eq_test.archive` with its `.xl`; `quest_check` on the archive | **2026-10-21: 6 files, 0 errors, 0 warnings. 2026-10-22, remade after test 1: 7 files, 0 errors, 0 warnings** (the new checks find 1 error and 1 warning in the test 1 archive). **Remade after test 2 with a "You're home" objective: 7 files, 0 errors, 0 warnings. Remade after test 3 (only the scene changed): 0 errors, 0 warnings** |

## In the game (Q2)

| Test | What happened | Result |
|---|---|---|
| Test 1, 2026-10-22 (ArchiveXL 1.27.4, on the owner's laptop) | The quest showed in the tracker and the journal. The marker showed far away, labelled "shooting range", with a GPS route to it; reaching it did nothing, nor did V's apartment. ArchiveXL's log: the phase, journal and onscreens merged; `subtitles.json` "failed to load"; no line about our marker's position. Causes: a marker with no NodeRef sits at the world's origin, since the game never asks ArchiveXL where it is; the `.xl` listed a file of lines where ArchiveXL expects a subtitle map. Whether GPS arrival would fire at 10 m stays unknown. Fixed: the marker and arrival use the game marker's world node; a subtitle map names one file of lines per scene; `quest_check` finds both faults | **Failed; fixed and remade** |
| Test 2, 2026-10-22 | The marker showed at V's door, in the tracker, on the minimap and with a GPS route. Reaching the apartment did nothing; the marker stayed. Cause: V's distance to the marker's node never passed. That node is a map spot with no entity, and game quests wait for V in trigger areas, which live in quest prefab sectors loaded only while a phase lists the prefab. Fixed: arrival is V inside a trigger area, and the phase lists its prefab; the index knows 10,221 areas; `quest_check` warns when a phase waits in an area whose prefab no phase in the mod lists | **Marker passed; arrival failed; fixed and remade** |
| Test 3, 2026-10-22 | Arriving at V's apartment fired: the tracker moved on to "You're home" and the scene started. The choice showed with no text, and choosing the first option crashed the game (access violation; no script in the stack). Cause: the scene numbered its lines and options with one shared counter (options 514 and 770 in a list of two). The game finds a line or option by its id, which is its place in its list (line k is k*256+1, option k is k*256+2), as in every game scene sampled. Fixed: separate counters; `quest_check` finds misnumbered items and choice options that name a missing item (the test 3 archive gets the error) | **Arrival passed; choice failed (crash); fixed and remade** |
| Test 4, 2026-10-22 | The remade quest from a save before the mod: marker, arrival, the scene with its choice, then "Think it over" and the quest's end. The owner reported that it worked, with no faults | **Passed: the template quest plays from start to end** |

## Census and reader checks (Q1, 2026-10-21)

| Check | Result |
|---|---|
| Every `.quest` and `.questphase` in the game through the graph reader | 4,571 files, 0 failures, 410,194 nodes, 453,787 edges, 15,977 inline phases, 80 s. 60 node classes; the top 25 are 92.5% of nodes. 250 node subtypes and 111 condition kinds; about 45 and 30 of them cover 95% |
| Quest index build | 4,571 files, 38,622 journal entries (10,177 with en-us text), 83 s, 0 failures, 10.6 MB |
| The Judy mod's phase (Nexus 7833) in plain words | Reads as its story, matching the hand study of 2026-10-17 |

## quest_check on the Judy mod (Nexus 7833 v3.1.2, its `.archive` and `.xl`)

**2026-10-21: every fault known from the hand study was found**, plus two the hand study missed.

| Expected (hand study) | Found |
|---|---|
| Replaces the game's `mq000_03_secret_room.json` subtitles | Yes, as an error |
| Writes the game's own facts | Yes: 5 facts |
| 48 leftover texts from a copied scene | Yes: 24 in each of its two scenes |
| Nothing in the mod starts its slot phase | Yes, as "never started" |
| Hand-picked onscreens keys | Yes, as a note |
| New: two journal paths the `_re` phase uses that its journal does not have (one skips a folder level, one does not exist) | Checked by hand in the mod's files: both real |

A false alarm found on the way (a phase node's unconnected output socket) was fixed by checking only connected sockets.

## By hand (the owner)

| Test | Steps | Result |
|---|---|---|
| Q1 Read in the development host | F5. Open the EDGEquest activity bar icon: Game Quests lists `base\quest`, `ep1\quest` and the open world folders, folders titled with their quest (sq030 shows "Pyramid Song" once the index is built). Open `base\quest\side_quests\sq030\phases\sq030.questphase`: the page lists the steps in words, with facts, journal, scenes and phases at the side; a phase or scene link opens it, Back returns, Raw opens it in REDcode. Find Quest (search icon): "pyramid song", "wakako", a fact name. Check Quest Mod (checklist icon) on a mod `.archive` | **2026-10-21: passed**, one fault: an inline phase read as "Phase 0" with a link to a file "0". The game stores an empty file link as the hash 0; it now reads as no link, and the index version went to 2 so the cache rebuilds. Fixed the same day |
| A modder follows a game quest from start to end without opening a raw file (Q1's test) | Pick a side quest, follow it from its phase through its scenes on the quest page alone | Pending |
