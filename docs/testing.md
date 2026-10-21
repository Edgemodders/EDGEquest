# EDGE<span class="y">quest</span> tests

Every test run on the dev PC, with its result. A test is recorded when it is first run, and its result again each time it runs. Game: Cyberpunk 2077 with Phantom Liberty at `E:\SteamLibrary\steamapps\common\Cyberpunk 2077`, read through REDbridge 0.10.0 (WolvenKit 9.1.0), 57 archives.

## Automated

| Test | How | Result |
|---|---|---|
| Smoke | `npm run smoke`: game and bridge found from the settings; 4,571 quest and phase files listed; the root quest plays `cyberpunk2077.questphase`; `sq030.questphase` reads with its inline phases (480 nodes) and uses facts, journal entries and scenes; it reads in plain words; `sq030_01_dam_meetup.scene` has 59 lines, 13 options in its choices, the player, and text for 50 lines; the quest index matches the game, finds "pyramid song" and says who plays `sq030.questphase` | **2026-10-21: 14 of 14 passed** |

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
| Q1 Read in the development host | F5. Open the EDGEquest activity bar icon: Game Quests lists `base\quest`, `ep1\quest` and the open world folders, folders titled with their quest (sq030 shows "Pyramid Song" once the index is built). Open `base\quest\side_quests\sq030\phases\sq030.questphase`: the page lists the steps in words, with facts, journal, scenes and phases at the side; a phase or scene link opens it, Back returns, Raw opens it in REDcode. Find Quest (search icon): "pyramid song", "wakako", a fact name. Check Quest Mod (checklist icon) on a mod `.archive` | Pending |
| A modder follows a game quest from start to end without opening a raw file (Q1's test) | Pick a side quest, follow it from its phase through its scenes on the quest page alone | Pending |
