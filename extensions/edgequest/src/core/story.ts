// The story file: one quest in words, `<id>.quest.yaml` in a WolvenKit project. EDGEquest makes the game
// files from it (see write/make.ts); people and assistants edit only this file. Reading it checks it and
// names every problem in plain words, with where it is.
//
//   quest: Lost Shard
//   id: lost_shard
//   author: myname
//   type: side
//   description: Someone left a shard at the overlook.
//   places:
//     home: { marker: quests/minor_quest/mq055_romance_apartment/01_megabuilding/judy_megabuilding/apartment, area: "#mq000_tr_vs_apartment" }
//   steps:
//     - objective: Go home
//       marker: home
//     - arrive: home
//     - scene: thoughts
//     - done
//   scenes:
//     thoughts:
//       - V: Huh. Someone's been here.
//       - choice:
//           Take the shard: [ { V: Mine now. }, { set: took } ]
//           Leave it: [ { V: Not my business. } ]
//   todo:
//     - Decide what the reward is

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
  | { kind: "objective"; id: string; text: string; marker?: string }
  | { kind: "arrive"; place: string }
  | { kind: "wait"; seconds: number }
  | { kind: "scene"; scene: string }
  | { kind: "set"; fact: string; value: number; add: boolean }
  | { kind: "done" }
  | { kind: "failed" };

export type SceneItem =
  | { kind: "line"; speaker: string; text: string }
  | { kind: "choice"; options: { text: string; then: SceneItem[] }[] }
  | { kind: "set"; fact: string; value: number; add: boolean };

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
  steps: StoryStep[];
  scenes: Map<string, SceneSpec>;
  /** The checklist: what is left for the modder (see checklist.ts). */
  todo: ChecklistItem[];
}

export interface StoryProblem {
  /** Where: "steps 3", "scenes thoughts 2", "id". */
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
const Speakers = new Set(["V"]);

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
  const readItems = (list: unknown, path: (string | number)[], at: string, speakers: Set<string>): SceneItem[] => {
    const items: SceneItem[] = [];
    if (!Array.isArray(list)) { add(path, at, "A scene is a list of lines (V: text), choices and facts to set."); return items; }
    list.forEach((it, i) => {
      const p = [...path, i], where = `${at} ${i + 1}`;
      if (!it || typeof it !== "object" || Array.isArray(it)) { add(p, where, `"${String(it)}" is not a line. Write a line as V: text.`); return; }
      const o = it as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length === 1 && keys[0] === "choice") {
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

  // Steps.
  const steps: StoryStep[] = [];
  const rawSteps = raw.steps;
  let objectives = 0;
  if (!Array.isArray(rawSteps) || !rawSteps.length) add(["steps"], "steps", "The quest needs steps: at least one objective.");
  else rawSteps.forEach((s, i) => {
    const p = ["steps", i], where = `steps ${i + 1}`;
    if (s === "done" || s === "failed") { steps.push({ kind: s }); return; }
    if (!s || typeof s !== "object" || Array.isArray(s)) { add(p, where, `"${String(s)}" is not a step. Steps: objective, arrive, wait, scene, set, done, failed.`); return; }
    const o = s as Record<string, unknown>;
    if ("objective" in o) {
      objectives++;
      const oid = o.id === undefined ? String(objectives).padStart(2, "0") : String(o.id);
      if (!/^[a-z0-9_]+$/.test(oid)) add([...p, "id"], where, `The objective id "${oid}" must be lower case letters, digits and _.`);
      const marker = o.marker === undefined ? undefined : String(o.marker);
      if (marker !== undefined && !places.has(marker)) add([...p, "marker"], where, `The marker "${marker}" is not one of the places (${[...places.keys()].join(", ") || "none yet"}).`);
      steps.push({ kind: "objective", id: oid, text: String(o.objective ?? "").trim(), marker });
      if (!String(o.objective ?? "").trim()) add(p, where, "The objective's text is empty.");
    } else if ("arrive" in o) {
      const place = String(o.arrive);
      if (!places.has(place)) add([...p, "arrive"], where, `"${place}" is not one of the places (${[...places.keys()].join(", ") || "none yet"}).`);
      // Arriving is V inside the place's trigger area; a distance did not fire in the game (test 2, 2026-10-22).
      if (o.within !== undefined) add([...p, "within"], where, `arrive no longer takes within: V arrives by entering the place's trigger area (the place's area:).`);
      steps.push({ kind: "arrive", place });
    } else if ("wait" in o) {
      const seconds = Number(o.wait);
      if (!(seconds > 0)) add([...p, "wait"], where, "wait is a number of seconds, more than 0.");
      steps.push({ kind: "wait", seconds });
    } else if ("scene" in o) {
      const scene = String(o.scene);
      if (!scenes.has(scene)) add([...p, "scene"], where, `"${scene}" is not one of the scenes (${[...scenes.keys()].join(", ") || "none yet"}).`);
      steps.push({ kind: "scene", scene });
    } else if ("set" in o) {
      const f = readFact(o.set);
      if (!f) add(p, where, "set names a fact, optionally with a value: set: took, or set: { fact: took, to: 2 }, or set: { fact: count, add: 1 }.");
      else steps.push({ kind: "set", ...f });
    } else add(p, where, `Unknown step ${Object.keys(o).join(", ")}. Steps: objective, arrive, wait, scene, set, done, failed.`);
  });
  if (rawSteps && Array.isArray(rawSteps) && !objectives) add(["steps"], "steps", "The quest needs at least one objective, or it never shows in the journal.");
  const ids = steps.filter((s) => s.kind === "objective").map((s) => (s as { id: string }).id);
  for (const d of ids.filter((x, i) => ids.indexOf(x) !== i)) add(["steps"], "steps", `Two objectives have the id "${d}".`);

  const todo = readChecklist(raw.todo);
  for (const p of todo.problems) add(["todo"], p.at, p.message);

  for (const k of Object.keys(raw)) if (!["quest", "id", "author", "type", "description", "places", "steps", "scenes", "todo"].includes(k)) add([k], k, `Unknown key "${k}". Keys: quest, id, author, type, description, places, steps, scenes, todo.`);

  if (problems.length) return { problems };
  const story: Story = { title, id, author, type, description: str("description") || undefined, places, steps, scenes, todo: todo.items };
  // Facts named without the quest's prefix get it.
  for (const s of steps) if (s.kind === "set") s.fact = factName(story, s.fact);
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

steps:
  - objective: ${o.objective || "Go to the place"}
    marker: ${place}
  - arrive: ${place}
  - scene: arrival
  - objective: Think it over
  - wait: 3
  - done

scenes:
  arrival:
    - V: Here it is.
    - choice:
        Look around:
          - V: Nothing. Just the wind.
          - set: looked
        Leave:
          - V: Not worth it.
    - V: Time to go.
`;
}
