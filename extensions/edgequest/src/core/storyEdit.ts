// Edits to a story file in story words: add a beat, rename one, delete one, send a choice to a beat, say how
// a line is spoken, tick a checklist item. Each takes the file's text and gives the new text, with the
// comments kept. The Storyboard and the MCP tools use them, so an edit means the same in both.

import { isMap, isScalar, isSeq, parseDocument, Pair, Scalar, YAMLMap, YAMLSeq, type Document } from "yaml";
import type { SceneItem, Story } from "./story";
import { sceneItemsPath } from "./voice";

export class StoryEditError extends Error {}

type Path = (string | number)[];
const out = (doc: Document) => doc.toString({ lineWidth: 0 });
const parse = (text: string) => {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new StoryEditError(`The story file is not valid YAML: ${doc.errors[0].message.split("\n")[0]}`);
  return doc;
};
const beatsOf = (doc: Document): YAMLMap => {
  const beats = doc.get("beats", true);
  if (isMap(beats)) return beats;
  if (doc.has("steps")) throw new StoryEditError("This story lists steps: from before beats. Convert it to beats first.");
  throw new StoryEditError("The story has no beats: yet.");
};
const keyOf = (p: Pair) => String(isScalar(p.key) ? p.key.value : p.key);

/** A beat name from its objective: "Find the shard" -> find_the_shard, unique among the names given. */
export function beatNameFor(objective: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = objective.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).slice(0, 4).join("_") || "beat";
  let name = /^[a-z]/.test(base) ? base : `beat_${base}`;
  for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
  return name;
}

/** Turns a steps: list into beats:, a beat per objective, in the same place in the file. */
export function convertToBeats(text: string): string {
  const doc = parse(text);
  const steps = doc.get("steps", true);
  if (!isSeq(steps)) throw new StoryEditError("The story has no steps: list to convert.");
  const beats = new YAMLMap();
  let current: YAMLMap | undefined;
  let count = 0;
  for (const it of steps.items) {
    if (isMap(it) && it.has("objective")) {
      count++;
      const name = it.has("id") ? String(it.get("id")) : String(count).padStart(2, "0");
      current = new YAMLMap();
      current.set("objective", it.get("objective", true));
      if (it.has("marker")) current.set("marker", it.get("marker", true));
      current.set("steps", new YAMLSeq());
      beats.set(name, current);
      continue;
    }
    if (!current) throw new StoryEditError("The steps start with something other than an objective, so there is no beat to put it in.");
    (current.get("steps", true) as unknown as YAMLSeq).items.push(it);
  }
  const root = doc.contents as YAMLMap;
  const pair = root.items.find((p) => keyOf(p) === "steps")!;
  pair.key = new Scalar("beats");
  pair.value = beats;
  return out(doc);
}

const endsQuest = (beat: unknown): boolean => {
  const steps = isMap(beat) ? beat.get("steps", true) : undefined;
  const last = isSeq(steps) ? steps.items[steps.items.length - 1] : undefined;
  return isScalar(last) && (last.value === "done" || last.value === "failed");
};

/** Adds a beat after another, where it follows that beat (as the next in the list); or, with no `after`, at
 *  the end, where nothing leads to it yet: the last beat keeps going nowhere (next: none), so adding a beat
 *  never changes where the story goes. */
export function addBeat(text: string, objective: string, after?: string): { text: string; name: string } {
  const doc = parse(text);
  const beats = beatsOf(doc);
  if (!objective.trim()) throw new StoryEditError("A beat needs its objective.");
  const name = beatNameFor(objective, beats.items.map(keyOf));
  const value = new YAMLMap();
  value.set("objective", objective.trim());
  value.set("steps", new YAMLSeq());
  const at = after === undefined ? beats.items.length : beats.items.findIndex((p) => keyOf(p) === after) + 1;
  if (after !== undefined && at === 0) throw new StoryEditError(`There is no beat ${after}.`);
  const last = beats.items[beats.items.length - 1]?.value;
  if (after === undefined && isMap(last) && !last.has("next") && !endsQuest(last)) last.set("next", "none");
  beats.items.splice(at, 0, new Pair(new Scalar(name), value));
  return { text: out(doc), name };
}

/** What happens after a beat when no choice says otherwise: the beat after it in the list ("follow"), another
 *  beat, nothing ("none": the quest stays open), or the quest ends ("done", "failed": the beat's last step). */
export function setThen(text: string, beat: string, then: string): string {
  const doc = parse(text);
  const beats = beatsOf(doc);
  const b = beats.get(beat, true);
  if (!isMap(b)) throw new StoryEditError(`There is no beat ${beat}.`);
  if (!["follow", "none", "done", "failed"].includes(then) && !beats.has(then)) throw new StoryEditError(`There is no beat ${then}.`);
  const found: unknown = b.get("steps", true);
  const steps = isSeq(found) ? found : new YAMLSeq();
  if (!isSeq(found)) b.set("steps", steps);
  if (endsQuest(b)) steps.items.pop();
  b.delete("next");
  if (then === "done" || then === "failed") steps.items.push(new Scalar(then));
  else if (then !== "follow") b.set("next", then);
  return out(doc);
}

export function renameObjective(text: string, beat: string, objective: string): string {
  const doc = parse(text);
  const b = beatsOf(doc).get(beat, true);
  if (!isMap(b)) throw new StoryEditError(`There is no beat ${beat}.`);
  if (!objective.trim()) throw new StoryEditError("A beat needs its objective.");
  b.set("objective", objective.trim());
  return out(doc);
}

/** Removes a beat. Whatever went on to it (go:, next:) is left for the modder to point elsewhere: the story
 *  file's problems name each one. */
export function deleteBeat(text: string, beat: string): string {
  const doc = parse(text);
  const beats = beatsOf(doc);
  if (!beats.has(beat)) throw new StoryEditError(`There is no beat ${beat}.`);
  if (beats.items.length === 1) throw new StoryEditError("A quest needs at least one beat.");
  beats.delete(beat);
  return out(doc);
}

/** Where a choice's option goes on to: a beat, or nowhere (the scene goes on after the choice). `option` is
 *  the option's path in the file: ["scenes", "arrival", 1, "choice", "Leave"]. */
export function setChoiceGo(text: string, option: Path, beat: string | undefined): string {
  const doc = parse(text);
  const choice = doc.getIn(option.slice(0, -1), true);
  const key = String(option[option.length - 1]);
  if (!isMap(choice) || !choice.has(key)) throw new StoryEditError(`There is no option "${key}" there.`);
  const found: unknown = choice.get(key, true);
  const seq = isSeq(found) ? found : new YAMLSeq();
  if (!isSeq(found)) choice.set(key, seq);
  seq.items = seq.items.filter((it) => !(isMap(it) && it.has("go")));
  if (beat) {
    const go = new YAMLMap();
    go.set("go", beat);
    seq.items.push(go);
  }
  return out(doc);
}

/** How a line is spoken. An empty field is removed; a voice: left with only its id keeps it. */
export function setLineVoice(text: string, line: Path, voice: { direction?: string; say?: string }): string {
  const doc = parse(text);
  const item = doc.getIn(line, true);
  if (!isMap(item)) throw new StoryEditError("There is no line there.");
  const found: unknown = item.get("voice", true);
  const map = isMap(found) ? found : new YAMLMap();
  if (!isMap(found)) item.set("voice", map);
  for (const k of ["direction", "say"] as const) {
    const value = voice[k]?.trim();
    if (value === undefined) continue;
    if (value) map.set(k, value);
    else map.delete(k);
  }
  if (!map.items.length) item.delete("voice");
  return out(doc);
}

/** Sets any value by its path in the story file (["beats", "go_home", "steps"]), or removes it when the value
 *  is undefined: for what the named edits do not cover. The result is checked like any story file. */
export function setPath(text: string, at: Path, value: unknown): string {
  const doc = parse(text);
  if (!at.length) throw new StoryEditError("Give the path of what to set, such as [\"beats\", \"go_home\", \"steps\"].");
  if (value === undefined) doc.deleteIn(at);
  else doc.setIn(at, doc.createNode(value));
  return out(doc);
}

/** Where a choice's option is in the story file, by the scene and the option's text (the first, at any depth). */
export function optionPath(story: Story, scene: string, option: string): Path | undefined {
  const spec = story.scenes.get(scene);
  if (!spec) return undefined;
  const find = (items: SceneItem[], at: Path): Path | undefined => {
    for (const [i, it] of items.entries()) {
      if (it.kind !== "choice") continue;
      for (const o of it.options) {
        if (o.text === option) return [...at, i, "choice", o.text];
        const deeper = find(o.then, [...at, i, "choice", o.text]);
        if (deeper) return deeper;
      }
    }
    return undefined;
  };
  return find(spec.items, sceneItemsPath(spec));
}

// ---- lists: a scene's items, an option's items, a beat's steps --------------------------------------

const isGo = (it: unknown) => isMap(it) && it.has("go");

/** The list at a path, made when it is missing or empty (`steps:` with nothing after it). */
function listAt(doc: Document, at: Path): YAMLSeq {
  const found: unknown = doc.getIn(at, true);
  if (isSeq(found)) return found;
  if (found !== undefined && found !== null && !(isScalar(found) && (found.value === null || found.value === ""))) throw new StoryEditError("There is no list there.");
  const seq = new YAMLSeq();
  doc.setIn(at, seq);
  return seq;
}

/** Adds an item to a list at a place (the end when the place is past it). A go: stays last: nothing is put
 *  after it. `value` is plain: { V: "Hi." }, { choice: { "Yes": [], "No": [] } }, { wait: 3 }, "done". */
export function insertItem(text: string, list: Path, index: number, value: unknown): string {
  const doc = parse(text);
  const seq = listAt(doc, list);
  const go = seq.items.findIndex(isGo);
  let at = Math.max(0, Math.min(index, seq.items.length));
  if (go >= 0 && at > go) at = go;
  seq.items.splice(at, 0, doc.createNode(value));
  return out(doc);
}

/** Moves an item in its list, by one or to a place. A go: does not move, and nothing moves below it. */
export function moveItem(text: string, list: Path, from: number, to: number): string {
  const doc = parse(text);
  const seq = listAt(doc, list);
  if (from < 0 || from >= seq.items.length || to < 0 || to >= seq.items.length || from === to) return text;
  if (isGo(seq.items[from]) || isGo(seq.items[to])) throw new StoryEditError("go: ends its list, so it stays last.");
  const [it] = seq.items.splice(from, 1);
  seq.items.splice(to, 0, it);
  return out(doc);
}

export function removeItem(text: string, list: Path, index: number): string {
  const doc = parse(text);
  const seq = listAt(doc, list);
  if (index < 0 || index >= seq.items.length) throw new StoryEditError("There is no such item.");
  seq.items.splice(index, 1);
  return out(doc);
}

/** A line's speaker or text; its voice: and anything else on it are kept. */
export function setLine(text: string, line: Path, change: { speaker?: string; text?: string }): string {
  const doc = parse(text);
  const item = doc.getIn(line, true);
  if (!isMap(item)) throw new StoryEditError("There is no line there.");
  const pair = item.items.find((p) => !["voice", "choice", "set", "go"].includes(keyOf(p)));
  if (!pair) throw new StoryEditError("There is no line there.");
  if (change.speaker !== undefined && change.speaker.trim()) pair.key = new Scalar(change.speaker.trim());
  if (change.text !== undefined) {
    if (!change.text.trim()) throw new StoryEditError("A line needs its words. Delete it instead.");
    pair.value = new Scalar(change.text.trim());
  }
  return out(doc);
}

/** A choice's options (`choice` is the path of the choice item's choice: map). */
function optionsAt(doc: Document, choice: Path): YAMLMap {
  const map = doc.getIn(choice, true);
  if (!isMap(map)) throw new StoryEditError("There is no choice there.");
  return map;
}

export function addOption(text: string, choice: Path, option: string): string {
  const doc = parse(text);
  const map = optionsAt(doc, choice);
  const name = option.trim();
  if (!name) throw new StoryEditError("An option needs its text.");
  if (map.items.some((p) => keyOf(p) === name)) throw new StoryEditError(`The choice has an option "${name}" already.`);
  map.items.push(new Pair(new Scalar(name), new YAMLSeq()));
  return out(doc);
}

export function renameOption(text: string, choice: Path, option: string, to: string): string {
  const doc = parse(text);
  const map = optionsAt(doc, choice);
  const name = to.trim();
  if (!name) throw new StoryEditError("An option needs its text.");
  if (name !== option && map.items.some((p) => keyOf(p) === name)) throw new StoryEditError(`The choice has an option "${name}" already.`);
  const pair = map.items.find((p) => keyOf(p) === option);
  if (!pair) throw new StoryEditError(`There is no option "${option}".`);
  pair.key = new Scalar(name);
  return out(doc);
}

export function moveOption(text: string, choice: Path, option: string, by: number): string {
  const doc = parse(text);
  const map = optionsAt(doc, choice);
  const from = map.items.findIndex((p) => keyOf(p) === option), to = from + by;
  if (from < 0 || to < 0 || to >= map.items.length) return text;
  const [pair] = map.items.splice(from, 1);
  map.items.splice(to, 0, pair);
  return out(doc);
}

export function removeOption(text: string, choice: Path, option: string): string {
  const doc = parse(text);
  const map = optionsAt(doc, choice);
  if (map.items.length <= 1) throw new StoryEditError("A choice needs at least one option: delete the choice instead.");
  if (!map.items.some((p) => keyOf(p) === option)) throw new StoryEditError(`There is no option "${option}".`);
  map.delete(option);
  return out(doc);
}

/** Adds a scene with V alone and one line to start from. */
export function addScene(text: string, name: string, firstLine = "..."): string {
  const doc = parse(text);
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new StoryEditError(`The scene name "${name}" must be lower case letters, digits and _, starting with a letter.`);
  if (doc.hasIn(["scenes", name])) throw new StoryEditError(`There is a scene ${name} already.`);
  if (!isMap(doc.get("scenes", true))) doc.set("scenes", new YAMLMap());
  doc.setIn(["scenes", name], doc.createNode([{ V: firstLine }]));
  return out(doc);
}

/** Ticks a checklist item (or unticks it), by its place in todo:. */
export function setTodoDone(text: string, index: number, done: boolean): string {
  const doc = parse(text);
  const todo = doc.get("todo", true);
  if (!isSeq(todo) || index < 0 || index >= todo.items.length) throw new StoryEditError("There is no such checklist item.");
  const it = todo.items[index];
  if (isMap(it)) {
    if (done) it.set("done", true);
    else it.delete("done");
  } else if (done) {
    const m = new YAMLMap();
    m.set("do", isScalar(it) ? it.value : String(it));
    m.set("done", true);
    todo.items[index] = m;
  }
  return out(doc);
}
