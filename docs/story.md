# The story file

A quest in EDGEquest is one file in your WolvenKit project: `<id>.quest.yaml`, the **story file**. You write the quest in story words: its beats, places, scenes, lines and choices. EDGEquest makes the game's quest files from it each time you save. The **Storyboard** edits the same file as cards, and every change it makes goes into the file, your comments kept.

This page describes everything a story file can hold. [Getting started](guide.html) walks through making and playing one.

## A whole quest

```yaml
quest: Something at the Door      # the title the journal shows
id: door_mystery                   # names the files and starts every fact
author: yourname                   # your modder name: files go in mod\yourname\door_mystery
type: side                         # side or minor
description: Go home and see what happens.

places:
  home:
    marker: quests/minor_quest/mq055_romance_apartment/01_megabuilding/judy_megabuilding/apartment
    area: "#mq000_tr_vs_apartment"

beats:
  go_home:
    objective: Go to your apartment
    marker: home
    steps:
      - arrive: home
  at_home:
    objective: You're home
    steps:
      - music: mus_q104_drone_flight_01_START
      - scene: at_the_door
  look_closer:
    objective: Look at the door
    steps:
      - wait: 3
      - music: mus_q104_drone_flight_02_STOP
      - done
  go_inside:
    objective: Get some rest
    steps:
      - music: mus_q104_drone_flight_02_STOP
      - failed

scenes:
  at_the_door:
    - V: Home. Something feels different.
    - V: Was the door always this color?
    - choice:
        Look closer:
          - V: Huh. Same as ever.
          - set: looked
          - sound: sa_airdrop_package_land
          - go: look_closer
        Go inside:
          - V: Long day. Not now.
          - go: go_inside
        Pay the doorman:
          pay: 500
          then: []
```

This quest starts as soon as a save loads. Its first objective, "Go to your apartment", shows in the journal with a map marker on V's door. When V gets there, the music starts and V thinks aloud, then picks one of three options. "Look closer" ends the quest as succeeded, "Go inside" as failed.

## The quest

| Key | What it is |
|---|---|
| `quest` | The title the journal shows |
| `id` | Lower case letters, digits and `_`, starting with a letter (`door_mystery`). It names the quest's files and starts every fact the quest sets. Keep it unique: two quests with one id overwrite each other |
| `author` | Your modder name, lower case letters, digits and `_`. The quest's files go in `mod\<author>\<id>` in the project. New Quest asks once and remembers it (setting `edgequest.author`) |
| `type` | `side` (a side job) or `minor` |
| `description` | The text the journal shows under the title |

A quest made from the template starts on load, in any save. Its first beat begins at once.

## Places

A place is a map marker the game already has. A beat's `marker:` shows it on the map and the minimap; an `arrive:` step waits until V gets there.

| Key | What it is |
|---|---|
| `marker` | The marker's path, as the game's journal names it. A game quest's page lists the places it uses, and **Find Quest** finds a quest by a place's name |
| `area` | Optional: the trigger area V must step into, by its NodeRef, in quotes because it starts with `#`. Without it, EDGEquest uses the area the game's own quest uses with that marker |

V arrives when inside the trigger area, as in the game's own quests: never by distance to the marker. The made quest switches on the world part the area belongs to.

Tested in the game: V's apartment door in Megabuilding H10, the template's place. Other markers are made the same way, but have not been tried in the game yet.

## Beats

The quest is a set of beats under `beats:`, in order. Each beat has a name (lower case letters, digits and `_`), a journal objective, and steps. The first beat starts the quest.

| Key | What it is |
|---|---|
| `objective` | The objective the journal shows while the beat runs; the card's title on the Storyboard |
| `marker` | Optional: a place whose map marker the objective shows |
| `steps` | What happens, in order (below) |
| `next` | Optional: the beat after this one. Without it, the next beat in the list follows. `next: none` stops there |

### Steps

| Step | What it does |
|---|---|
| `arrive: <place>` | Waits until V is inside the place's trigger area |
| `scene: <scene>` | Plays one of the story's scenes, and waits until it ends |
| `wait: <seconds>` | Waits that long |
| `set: <fact>` | Sets one of the quest's facts (see [Facts](#facts)) |
| `music: <cue>` | Starts or stops one of the game's music cues (see [Music and sound](#music-and-sound)) |
| `sound: <event>` | Plays a sound event on V |
| `done` | Ends the quest, succeeded. Last in its beat |
| `failed` | Ends the quest, failed. Last in its beat |

A beat that ends with `done` or `failed` is an **ending**. A quest can have several, and branches can join again before them.

## Scenes

Scenes are listed under `scenes:` by name. A scene is a list of items, played in order:

| Item | What it is |
|---|---|
| `V: <text>` | A line V says. It shows as a subtitle; until it is voiced, it plays as text |
| `choice:` | A choice: options the player picks from (below) |
| `set: <fact>` | Sets a fact at this point of the scene |
| `sound: <event>` | Plays a sound event on V between lines |
| `go: <beat>` | Ends the scene and sends the quest to that beat. Last in its list |

In this preview, V is alone in scenes. People standing in a scene and phone calls are coming.

### How a line is spoken

A line can say how it is spoken, for voicing it later with EDGEwave:

```yaml
    - V: Here it is.
      voice:
        direction: Quiet and a little unsure, thinking aloud.
        say: "[quietly] Here it is."
```

`direction` is plain words for a voice actor or a text-to-speech service. `say` is the line with ElevenLabs v3 tags in square brackets (`[softly]`, `[sighs]`); EDGEwave converts them for other services. EDGEquest adds the line's `id` itself when it makes the quest: leave it as it is, since a voice take is kept by it.

### Choices

A choice is a list of options, each with its text and what follows. The short form lists the items under the option:

```yaml
    - choice:
        Look closer:
          - V: Huh. Same as ever.
          - go: look_closer
```

The long form gives the option a kind, with its items under `then:`:

```yaml
        Pay the doorman:
          pay: 500
          then:
            - V: Keep the change.
            - go: look_closer
```

An option with nothing after it (`then: []`) ends the scene, and the beat goes on with its next step.

| Key | What it does | In the game |
|---|---|---|
| `main: yes` or `main: no` | Yellow or white. Without it, an option that goes to a beat or sets a fact is yellow, as the game marks options that move the story on | Yellow text, or white |
| `lifepath: corpo`, `nomad` or `streetkid` | Only a V with that lifepath sees the option | The lifepath's tag in front of it |
| `check: { <attribute>: <difficulty> }` | V needs the attribute at that level. Attributes: `body`, `intelligence`, `reflexes`, `tech` (Technical Ability), `cool`. Difficulties: `easy`, `medium`, `hard`, `impossible` | The attribute's tag. Passed, it shows V's value (`15`), and the option can be chosen. Failed, it shows V's value over the number needed (`15 / 20`), and the option is dimmed and locked |
| `pay: <eddies>` or `pay: <difficulty>` | V pays on choosing it: that many eddies, or a price that grows with V's level | The price's tag; locked when V has too little. Choosing it takes the money |

One kind per option. Every choice keeps at least one option open to everyone, so no V is ever stuck.

The difficulty's number grows with V's level: at a high level, `hard` can ask for 20, the top of the attribute scale. For a check most players can pass, use `easy` or `medium`.

A failed check in a dialogue looks different from a failed check on an object. In a dialogue, the option is dimmed and only its tag shows the fail colour. On a door or a container (Force Open), the whole prompt turns red.

## Facts

A fact is a number the game keeps in the save. Quests use them to remember what happened.

| Written | What it does |
|---|---|
| `set: looked` | Sets the quest's fact `looked` to 1 |
| `set: { fact: looked, to: 2 }` | Sets it to 2 |
| `set: { fact: visits, add: 1 }` | Adds 1 to it |

A fact you name is the quest's own: EDGEquest puts the quest's id in front (`door_mystery_looked`), so two quests never share one by mistake. To set one of the game's own facts, write `game:` in front (`set: game:some_fact`).

## Music and sound

A quest plays music and sounds by the game's **event names**, as the game's own quests do.

| Where | Written | What it does |
|---|---|---|
| A beat's steps | `music: <cue>` | Starts or stops a music cue |
| A beat's steps | `sound: <event>` | Plays a sound event on V |
| A scene's items, or an option's | `sound: <event>` | Plays a sound event on V at that point of the scene |

**Music cues.** The game's quests post their music as cues, one per moment: a cue whose name ends in `_START` begins it, and a matching `_STOP` ends it (`mus_q104_drone_flight_01_START`, then `mus_q104_drone_flight_02_STOP`). Start the music in one beat and stop it in each ending, or it plays on after the quest. A game quest's cues work outside that quest: q104's drone cues start and stop from a new quest (in-game test 6).

**Sound events.** Any of the game's sound events, such as `sa_airdrop_package_land`. EDGEquest knows the game's event names and puts a name it does not know on the checklist.

**Your own sounds.** A sound you make with EDGEwave's **Custom Sound** is a new event called `edgewave_<name>`, and a quest plays it like any other. EDGEwave adds it to the project's `source\resources\info.json` and copies the WAV beside it. To hear it in the game:

1. Switch on REDcode's setting `redcode.pack.redmod`: custom sounds are packed only as a REDmod.
2. Pack and Install.
3. Start the game again, with `-modded` (REDcode's **Run Game** does it). The game reads custom sounds when it starts.

A story that names an `edgewave_` sound the project does not have gets a checklist item: make it with EDGEwave's Custom Sound.

**The picker.** On the Storyboard, **+ Step** has **Music** and **Sound**, and every scene's add row has **+ Sound**. Click a sound's name to pick another. With EDGEwave installed, the picker searches the project's own sounds (first) and the game's events, and **▶** plays one before you pick it: a sound plays at once in VS Code, and a music cue plays in the running game through REDnode, since music lives in the game's sound banks. Closing the picker stops it. Without EDGEwave, you type the name.

## The checklist

Under `todo:`, EDGEquest lists what in the quest is still a stand-in, each with the EDGE tool that can do it:

```yaml
todo:
  - do: Voice the 4 lines in the scene at_the_door. Until then they show as text only.
    found: voice/at_the_door
    tool: EDGEwave
```

Each make updates the list, and an item ticks itself (`done: true`) once the thing is done. Items you or an assistant write by hand are kept as they are; write `done: true` to tick one. Open items never stop the quest from playing.

## What saving makes

Saving the story file makes the quest's game files in the project (setting `edgequest.makeOnSave`; or **EDGEquest: Make Quest**):

| File | What it is |
|---|---|
| `mod\<author>\<id>\<id>.questphase` | The quest's steps, as the game's quest nodes |
| `mod\<author>\<id>\<id>.journal` | The journal entry: title, description, objectives, map markers |
| `mod\<author>\<id>\scenes\<scene>.scene` | Each scene |
| `mod\<author>\<id>\loc\en-us\...` | The texts: subtitles and on-screen texts |
| `source\resources\<id>.archive.xl` | Tells ArchiveXL to add the quest to the game |

They are checked against each other, as **Check Quest Mod** does. Problems show in the Problems panel at their line in the story file. A made file you changed by hand is kept, not overwritten. **Made Files** lists them, and opens a phase or scene in plain words.

Then **Pack and Install** with REDcode, and load a save from before you installed the quest. ArchiveXL must be installed in the game.

## Two quests in one place

Two quests can wait at the same place. When V arrives, both scenes play, and the game merges their choices into one list. One quest's options may show a moment before the other's. Seen in in-game test 8: it is not a fault, but a reason to keep test quests apart.
