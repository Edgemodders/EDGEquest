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

/** Adds a beat after another (or at the end); the new beat follows it, as the next in the list. */
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
  beats.items.splice(at, 0, new Pair(new Scalar(name), value));
  return { text: out(doc), name };
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
