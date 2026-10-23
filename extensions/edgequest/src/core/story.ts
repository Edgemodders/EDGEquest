// The story file: one quest in words, `<id>.quest.yaml` in a WolvenKit project. EDGEquest makes the game
// files from it (see write/make.ts); people and assistants edit only this file. Reading it checks it and
// names every problem in plain words, with where it is.
//
// A quest is a sequence of beats that can branch (agreed 2026-10-23). Each beat has its journal objective
// and its steps; the next beat follows, unless a choice in a scene says go: to another. A beat ending in
// done or failed ends the quest.
//
//   quest: Lost Shard
//   id: lost_shard
//   author: myname
//   type: side
//   description: Someone left a shard at the overlook.
//   places:
//     home: { marker: quests/minor_quest/mq055_romance_apartment/01_megabuilding/judy_megabuilding/apartment, area: "#mq000_tr_vs_apartment" }
//   beats:
//     go_home:
//       objective: Go home
//       marker: home
//       steps: [ { arrive: home }, { scene: thoughts } ]
//     sell_it:
//       objective: Sell the shard
//       steps: [ done ]
//     give_it_back:
//       objective: Return the shard
//       steps: [ done ]
//   scenes:
//     thoughts:
//       - V: Huh. Someone's been here.
//       - choice:
//           Keep it: [ { V: Mine now. }, { go: sell_it } ]
//           Give it back: [ { V: Not my business. }, { go: give_it_back } ]
//   todo:
//     - Decide what the reward is
//
// A file with a plain steps: list (before beats) still reads: a new beat starts at each objective.

import { parseDocument } from "yaml";
import { findStandIns, readChecklist, syncChecklist, TemplateDescription, type ChecklistItem } from "./checklist";

export type QuestType = "side" | "minor";

export interface Place {
  name: string;
  /** A game map marker's journal path. The quest's marker stands on the world node it stands on. */
  marker: string;
  /** A game trigger area's NodeRef ("#mq000_tr_vs_apartment"): arriving means V is inside it. Absent: the
   *  area the game's own quest uses with that marker, from the quest index. */
  area?: string;
}

/** The default place of a new quest: the map marker at V's apartment door in Megabuilding H10. */
export const DefaultPlaceMarker = "quests/minor_quest/mq055_romance_apartment/01_megabuilding/judy_megabuilding/apartment";
/** ...and V's apartment's own trigger area, from the apartment quest that runs most of the game (mq000). */
export const DefaultPlaceArea = "#mq000_tr_vs_apartment";

export type StoryStep =
  | { kind: "arrive"; place: string }
  | { kind: "wait"; seconds: number }
  | { kind: "scene"; scene: string }
  | { kind: "set"; fact: string; value: number; add: boolean }
  | { kind: "done" }
  | { kind: "failed" };

export interface Beat {
  /** The beat's name, which is also its journal objective's id. */
  name: string;
  /** The objective the journal shows during the beat: the card's title on the Storyboard. */
  objective: string;
  /** A place whose map marker the objective shows. */
  marker?: string;
  /** Its steps. done or failed, last, ends the quest. */
  steps: StoryStep[];
  /** The beat after this one when no choice says otherwise: next:, or the next beat in the list. Absent on
   *  an ending, and on a last beat that does not end the quest. */
  next?: string;
}

export type SceneItem =
  | { kind: "line"; speaker: string; text: string }
  | { kind: "choice"; options: { text: string; then: SceneItem[] }[] }
  | { kind: "set"; fact: string; value: number; add: boolean }
  /** Ends the scene and goes on to this beat. */
  | { kind: "go"; beat: string };

export interface SceneSpec {
  name: string;
  /** A phone call with this person: their name as the line speaker. Absent: V alone. */
  call?: string;
  items: SceneItem[];
}

export interface Story {
  title: string;
  id: string;
  author: string;
  type: QuestType;
  description?: string;
  places: Map<string, Place>;
  /** In order; the first starts the quest. */
  beats: Beat[];
  scenes: Map<string, SceneSpec>;
  /** The checklist: what is left for the modder (see checklist.ts). */
  todo: ChecklistItem[];
}

export interface StoryProblem {
  /** Where: "beats go_home 2", "scenes thoughts 2", "id". */
  at: string;
  message: string;
  /** 1-based line in the file, when known. */
  line?: number;
}

export interface StoryRead {
  story?: Story;
  problems: StoryProblem[];
}

const Name = /^[a-z][a-z0-9_]*$/;
/** A beat's name is its objective's id: older files numbered them ("01"). */
const BeatName = /^[a-z0-9_]+$/;
const Speakers = new Set(["V"]);

/** The beats a scene can go to, in the order its go: items name them. */
export function sceneGoes(spec: SceneSpec): string[] {
  const found: string[] = [];
  const walk = (items: SceneItem[]) => items.forEach((it) => {
    if (it.kind === "go" && !found.includes(it.beat)) found.push(it.beat);
    if (it.kind === "choice") it.options.forEach((o) => walk(o.then));
  });
  walk(spec.items);
  return found;
}

/** Every way through these scene items ends in a go:, so nothing after the scene happens in its beat. */
export function alwaysGoes(items: SceneItem[]): boolean {
  return items.some((it) => it.kind === "go" || (it.kind === "choice" && it.options.every((o) => alwaysGoes(o.then))));
}

/** A quest's own fact: the quest id is its prefix. A name with "game:" in front is the game's own fact. */
export function factName(story: { id: string }, name: string): string {
  if (name.startsWith("game:")) return name.slice(5);
  return name.startsWith(story.id + "_") ? name : `${story.id}_${name}`;
}

export function readStory(text: string): StoryRead {
  const problems: StoryProblem[] = [];
  const doc = parseDocument(text);
  const lineOf = (offset?: number) => (offset === undefined ? undefined : text.slice(0, offset).split("\n").length);
  for (const e of doc.errors) problems.push({ at: "file", message: `The file is not valid YAML: ${e.message.split("\n")[0]}`, line: lineOf(e.pos?.[0]) });
  if (doc.errors.length) return { problems };

  // Line numbers: find a node by its path in the document.
  const lineAt = (path: (string | number)[]) => {
    const node = doc.getIn(path, true) as { range?: [number, number, number] } | undefined;
    return lineOf(node?.range?.[0]);
  };
  const add = (path: (string | number)[], at: string, message: string) => problems.push({ at, message, line: lineAt(path) });

  const raw = doc.toJS() as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return { problems: [{ at: "file", message: "The file is empty. It needs at least quest, id, author and steps." }] };

  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : raw[k] === undefined ? "" : String(raw[k]));
  const title = str("quest");
  const id = str("id");
  const author = str("author");
  const type = (str("type") || "side") as QuestType;
  if (!title) add(["quest"], "quest", "The quest needs a title: quest: Lost Shard");
  if (!Name.test(id)) add(["id"], "id", `The id "${id}" must be lower case letters, digits and _, starting with a letter, for example lost_shard. It names the files and starts every fact.`);
  if (!Name.test(author)) add(["author"], "author", `The author "${author}" must be lower case letters, digits and _. The files go in a folder of that name.`);
  if (type !== "side" && type !== "minor") add(["type"], "type", `type is "side" or "minor" (where the quest shows in the journal), not "${type}".`);

  // Places.
  const places = new Map<string, Place>();
  const rawPlaces = (raw.places ?? {}) as Record<string, unknown>;
  if (typeof rawPlaces !== "object" || Array.isArray(rawPlaces)) add(["places"], "places", "places is a list of names, each with marker: <a game map marker>.");
  else for (const [name, v] of Object.entries(rawPlaces)) {
    const p = (v ?? {}) as Record<string, unknown>;
    const area = p.area === undefined ? undefined : String(p.area).trim();
    if (area !== undefined && !/^[#$]/.test(area)) add(["places", name, "area"], `places ${name}`, `The area "${area}" is not a NodeRef. A trigger area's NodeRef starts with #, for example ${DefaultPlaceArea} (in quotes: YAML reads # as a comment).`);
    if (typeof p.marker === "string" && p.marker.trim()) places.set(name, { name, marker: p.marker.trim(), area: area || undefined });
    // A bare world position does not work in the game: a quest's marker and arrival need a world node (in-game test 2026-10-22).
    else if (p.at !== undefined) add(["places", name, "at"], `places ${name}`, `The place "${name}" has at: [x, y, z], which the game cannot use yet: a quest's map marker and arrival need a world node. Use marker: <a game map marker's journal path> near where you want it (Find Quest finds them).`);
    else add(["places", name], `places ${name}`, `The place "${name}" needs marker: <a game map marker's journal path>, for example ${DefaultPlaceMarker} (V's apartment door).`);
  }

  // Scenes (read before steps so steps can refer to them).
  const scenes = new Map<string, SceneSpec>();
  const rawScenes = (raw.scenes ?? {}) as Record<string, unknown>;
  const goes: { beat: string; path: (string | number)[]; at: string }[] = []; // checked once the beats are read
  const readItems = (list: unknown, path: (string | number)[], at: string, speakers: Set<string>): SceneItem[] => {
    const items: SceneItem[] = [];
    if (!Array.isArray(list)) { add(path, at, "A scene is a list of lines (V: text), choices, facts to set and go: <beat>."); return items; }
    list.forEach((it, i) => {
      const p = [...path, i], where = `${at} ${i + 1}`;
      if (!it || typeof it !== "object" || Array.isArray(it)) { add(p, where, `"${String(it)}" is not a line. Write a line as V: text.`); return; }
      const o = it as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length === 1 && keys[0] === "go") {
        const beat = String(o.go ?? "").trim();
        goes.push({ beat, path: [...p, "go"], at: where });
        if (i < list.length - 1) add(p, where, `go: ends the scene and goes on to the beat ${beat}, so it comes last in its list.`);
        items.push({ kind: "go", beat });
      } else if (keys.length === 1 && keys[0] === "choice") {
        const opts = o.choice as Record<string, unknown>;
        if (!opts || typeof opts !== "object" || Array.isArray(opts) || !Object.keys(opts).length) { add(p, where, "A choice lists its options, each with what follows: choice: { Take it: [ ... ], Leave it: [ ... ] }"); return; }
        items.push({ kind: "choice", options: Object.entries(opts).map(([text, then], j) => ({ text, then: then == null ? [] : readItems(then, [...p, "choice", text], `${where} option ${j + 1}`, speakers) })) });
      } else if (keys.length === 1 && keys[0] === "set") {
        const f = readFact(o.set);
        if (!f) add(p, where, "set names a fact, optionally with a value: set: took, or set: { fact: took, to: 2 }, or set: { fact: count, add: 1 }.");
        else items.push({ kind: "set", ...f });
      } else if (keys.length === 1) {
        const speaker = keys[0];
        if (!speakers.has(speaker)) { add(p, where, `"${speaker}" cannot speak in this scene. Speakers here: ${[...speakers].join(", ")}.`); return; }
        items.push({ kind: "line", speaker, text: String(o[speaker] ?? "").trim() });
        if (!String(o[speaker] ?? "").trim()) add(p, where, `${speaker}'s line is empty.`);
      } else add(p, where, `One line per item: ${keys.join(", ")} are in one item.`);
    });
    return items;
  };
  if (typeof rawScenes !== "object" || Array.isArray(rawScenes)) add(["scenes"], "scenes", "scenes is a list of names, each with its lines.");
  else for (const [name, v] of Object.entries(rawScenes)) {
    if (!Name.test(name)) add(["scenes", name], `scenes ${name}`, `The scene name "${name}" must be lower case letters, digits and _.`);
    if (Array.isArray(v)) scenes.set(name, { name, items: readItems(v, ["scenes", name], `scenes ${name}`, Speakers) });
    else if (v && typeof v === "object" && typeof (v as Record<string, unknown>).call === "string") {
      const call = String((v as Record<string, unknown>).call);
      scenes.set(name, { name, call, items: readItems((v as Record<string, unknown>).lines, ["scenes", name, "lines"], `scenes ${name}`, new Set(["V", call])) });
    } else add(["scenes", name], `scenes ${name}`, `The scene "${name}" is a list of lines, or call: <who> with lines: for a phone call.`);
  }

  // Beats, or the older steps: list read as beats.
  const StepKinds = "arrive, wait, scene, set, done, failed";
  const readStep = (s: unknown, p: (string | number)[], where: string): StoryStep | undefined => {
    if (s === "done" || s === "failed") return { kind: s };
    if (!s || typeof s !== "object" || Array.isArray(s)) { add(p, where, `"${String(s)}" is not a step. Steps: ${StepKinds}.`); return undefined; }
    const o = s as Record<string, unknown>;
    if ("arrive" in o) {
      const place = String(o.arrive);
      if (!places.has(place)) add([...p, "arrive"], where, `"${place}" is not one of the places (${[...places.keys()].join(", ") || "none yet"}).`);
      // Arriving is V inside the place's trigger area; a distance did not fire in the game (test 2, 2026-10-22).
      if (o.within !== undefined) add([...p, "within"], where, `arrive no longer takes within: V arrives by entering the place's trigger area (the place's area:).`);
      return { kind: "arrive", place };
    }
    if ("wait" in o) {
      const seconds = Number(o.wait);
      if (!(seconds > 0)) add([...p, "wait"], where, "wait is a number of seconds, more than 0.");
      return { kind: "wait", seconds };
    }
    if ("scene" in o) {
      const scene = String(o.scene);
      if (!scenes.has(scene)) add([...p, "scene"], where, `"${scene}" is not one of the scenes (${[...scenes.keys()].join(", ") || "none yet"}).`);
      return { kind: "scene", scene };
    }
    if ("set" in o) {
      const f = readFact(o.set);
      if (!f) { add(p, where, "set names a fact, optionally with a value: set: took, or set: { fact: took, to: 2 }, or set: { fact: count, add: 1 }."); return undefined; }
      return { kind: "set", ...f };
    }
    add(p, where, "objective" in o ? "A beat has one objective, under its name. Start a new beat for the next objective." : `Unknown step ${Object.keys(o).join(", ")}. Steps: ${StepKinds}.`);
    return undefined;
  };
  const checkMarker = (marker: string | undefined, p: (string | number)[], where: string) => {
    if (marker !== undefined && !places.has(marker)) add(p, where, `The marker "${marker}" is not one of the places (${[...places.keys()].join(", ") || "none yet"}).`);
  };
  const beats: Beat[] = [];
  const explicitNext = new Map<Beat, { name: string; path: (string | number)[] }>();
  const beatPath = new Map<Beat, (string | number)[]>();
  if (raw.beats !== undefined && raw.steps !== undefined) add(["steps"], "steps", "A story has beats: or steps:, not both. Move the steps into beats.");
  else if (raw.beats !== undefined) {
    const rawBeats = raw.beats as Record<string, unknown>;
    if (!rawBeats || typeof rawBeats !== "object" || Array.isArray(rawBeats) || !Object.keys(rawBeats).length) add(["beats"], "beats", "beats names the quest's beats, each with its objective and steps: beats: { go_home: { objective: Go home, steps: [ { arrive: home } ] } }");
    else for (const [name, v] of Object.entries(rawBeats)) {
      const p = ["beats", name], where = `beats ${name}`;
      if (!BeatName.test(name)) add(p, where, `The beat name "${name}" must be lower case letters, digits and _.`);
      if (!v || typeof v !== "object" || Array.isArray(v)) { add(p, where, `The beat ${name} needs its objective: ${name}: { objective: Go home, steps: [ ... ] }`); continue; }
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) if (!["objective", "marker", "steps", "next"].includes(k)) add([...p, k], where, `Unknown key "${k}" in a beat. Keys: objective, marker, steps, next.`);
      const objective = String(o.objective ?? "").trim();
      if (!objective) add(p, where, `The beat ${name} needs its objective, the line the journal shows: objective: Go home`);
      const marker = o.marker === undefined ? undefined : String(o.marker);
      checkMarker(marker, [...p, "marker"], where);
      const beat: Beat = { name, objective, marker, steps: [] };
      if (o.steps !== undefined && o.steps !== null && !Array.isArray(o.steps)) add([...p, "steps"], where, "steps is a list: steps: [ { arrive: home }, done ]");
      else (o.steps as unknown[] | undefined)?.forEach((s, i) => { const st = readStep(s, [...p, "steps", i], `${where} ${i + 1}`); if (st) beat.steps.push(st); });
      if (o.next !== undefined) explicitNext.set(beat, { name: String(o.next), path: [...p, "next"] });
      beatPath.set(beat, p);
      beats.push(beat);
    }
  } else if (raw.steps !== undefined) {
    const rawSteps = raw.steps;
    let current: Beat | undefined;
    if (!Array.isArray(rawSteps) || !rawSteps.length) add(["steps"], "steps", "The quest needs steps: at least one objective.");
    else rawSteps.forEach((s, i) => {
      const p = ["steps", i], where = `steps ${i + 1}`;
      if (s && typeof s === "object" && !Array.isArray(s) && "objective" in s) {
        const o = s as Record<string, unknown>;
        const name = o.id === undefined ? String(beats.length + 1).padStart(2, "0") : String(o.id);
        if (!BeatName.test(name)) add([...p, "id"], where, `The objective id "${name}" must be lower case letters, digits and _.`);
        const marker = o.marker === undefined ? undefined : String(o.marker);
        checkMarker(marker, [...p, "marker"], where);
        current = { name, objective: String(o.objective ?? "").trim(), marker, steps: [] };
        if (!current.objective) add(p, where, "The objective's text is empty.");
        beatPath.set(current, ["steps"]);
        beats.push(current);
        return;
      }
      const st = readStep(s, p, where);
      if (!st) return;
      if (!current) add(p, where, "Start the steps with an objective: the journal needs one before anything happens.");
      else current.steps.push(st);
    });
    if (Array.isArray(rawSteps) && rawSteps.length && !beats.length) add(["steps"], "steps", "The quest needs at least one objective, or it never shows in the journal.");
  } else add([], "beats", "The quest needs beats: at least one, with its objective. beats: { go_home: { objective: Go home, steps: [ ... ] } }");

  const beatNames = beats.map((b) => b.name);
  for (const d of beatNames.filter((x, i) => beatNames.indexOf(x) !== i)) add(["beats"], "beats", `Two beats (objectives) are named "${d}".`);
  const known = (name: string) => beatNames.includes(name);
  const beatList = () => beatNames.join(", ") || "none yet";
  beats.forEach((b, i) => {
    const ending = b.steps.findIndex((s) => s.kind === "done" || s.kind === "failed");
    if (ending >= 0 && ending < b.steps.length - 1) add(beatPath.get(b)!, `beats ${b.name}`, `${b.steps[ending].kind} ends the quest, so it is the beat ${b.name}'s last step.`);
    const next = explicitNext.get(b);
    if (ending >= 0) { if (next) add(next.path, `beats ${b.name}`, `The beat ${b.name} ends the quest (${b.steps[ending].kind}), so it has no next.`); return; }
    if (next && !known(next.name)) add(next.path, `beats ${b.name}`, `next: "${next.name}" is not one of the beats (${beatList()}).`);
    b.next = next?.name ?? beats[i + 1]?.name;
  });
  for (const g of goes) if (!known(g.beat)) add(g.path, g.at, `go: "${g.beat}" is not one of the beats (${beatList()}).`);

  const todo = readChecklist(raw.todo);
  for (const p of todo.problems) add(["todo"], p.at, p.message);

  for (const k of Object.keys(raw)) if (!["quest", "id", "author", "type", "description", "places", "beats", "steps", "scenes", "todo"].includes(k)) add([k], k, `Unknown key "${k}". Keys: quest, id, author, type, description, places, beats, scenes, todo.`);

  if (problems.length) return { problems };
  const story: Story = { title, id, author, type, description: str("description") || undefined, places, beats, scenes, todo: todo.items };
  // Facts named without the quest's prefix get it.
  for (const b of beats) for (const s of b.steps) if (s.kind === "set") s.fact = factName(story, s.fact);
  const prefix = (items: SceneItem[]) => items.forEach((it) => {
    if (it.kind === "set") it.fact = factName(story, it.fact);
    if (it.kind === "choice") it.options.forEach((o) => prefix(o.then));
  });
  for (const sc of scenes.values()) prefix(sc.items);
  return { story, problems };
}

/** A story file's checklist as the next make would leave it, without writing anything: the items written in
 *  todo: plus the stand-ins found now. A story file with problems gives only what todo: says. */
export function storyChecklist(text: string): { items: ChecklistItem[]; problems: StoryProblem[]; current: boolean } {
  const read = readStory(text);
  if (!read.story) {
    let raw: unknown;
    try { raw = (parseDocument(text).toJS() as Record<string, unknown> | null)?.todo; } catch { raw = undefined; }
    return { items: readChecklist(raw).items, problems: read.problems, current: false };
  }
  return { items: syncChecklist(text, findStandIns(read.story)).items, problems: [], current: true };
}

function readFact(v: unknown): { fact: string; value: number; add: boolean } | undefined {
  if (typeof v === "string" && v.trim()) return { fact: v.trim(), value: 1, add: false };
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.fact !== "string" || !o.fact.trim()) return undefined;
    if (o.add !== undefined) return Number.isFinite(Number(o.add)) ? { fact: o.fact.trim(), value: Number(o.add), add: true } : undefined;
    const to = o.to === undefined ? 1 : Number(o.to);
    return Number.isFinite(to) ? { fact: o.fact.trim(), value: to, add: false } : undefined;
  }
  return undefined;
}

/** A new story file's text: the template New Quest starts from. */
export function storyTemplate(o: { title: string; id: string; author: string; type?: QuestType; objective?: string; place?: string; placeName?: string }): string {
  const place = o.placeName || "spot";
  const marker = o.place || `${DefaultPlaceMarker}   # V's apartment door; any game map marker works`;
  // The default marker's own area is a romance quest's; V's apartment quest has the same room as an area.
  const area = o.place ? "" : `\n    area: "${DefaultPlaceArea}"   # V arrives inside this; leave it out to use the marker's own`;
  return `# EDGEquest story file. EDGEquest makes the game files from it: edit this file, not those.
quest: ${o.title}
id: ${o.id}
author: ${o.author}
type: ${o.type ?? "side"}
description: ${TemplateDescription}

places:
  ${place}:
    marker: ${marker}${area}

beats:                    # the quest's beats in order; a choice can go: to another
  arrive:
    objective: ${o.objective || "Go to the place"}
    marker: ${place}
    steps:
      - arrive: ${place}
      - scene: arrival      # the choice in it picks the next beat
  look:
    objective: Look around
    steps:
      - wait: 3
      - done              # an ending
  leave:
    objective: Think it over
    steps:
      - wait: 3
      - done              # the other ending

scenes:
  arrival:
    - V: Here it is.
    - choice:
        Look around:
          - V: Let's see what's here.
          - set: looked
          - go: look
        Leave:
          - V: Not worth it.
          - go: leave
`;
}
