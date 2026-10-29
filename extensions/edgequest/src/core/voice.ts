// Voice for a story's lines (agreed 2026-10-23). A line can say how it is spoken, for a text-to-speech
// service, and EDGEwave makes its takes:
//
//   - V: Here it is.
//     voice:
//       id: k7f2                                   # written by EDGEquest once, so a take stays on its line
//       direction: Quiet, unsure, thinking aloud.  # plain words
//       say: "[quietly] Here it is."               # as spoken, with ElevenLabs v3 square-bracket tags
//
// Tags are not standard across services; EDGEquest stores this one form and EDGEwave converts it. EDGEwave
// records what it made in source/raw/edgewave/voice/<quest>/voice.json (the EDGEwave #5 contract, confirmed
// 2026-10-23); a line's take is current when its text, say and direction match the story's.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { isMap, isScalar, isSeq, parseDocument, type Document } from "yaml";
import type { SceneItem, SceneSpec, Story } from "./story";
import { stableId } from "./write/wk";

export interface LineVoice {
  /** Short and stable: the line's locstring id comes from it. */
  id?: string;
  /** How it is spoken, in plain words. */
  direction?: string;
  /** The line as spoken, with inline delivery tags ([softly], [sighs]). Absent: the text is spoken. */
  say?: string;
}

/** A scene line's locstring id (decimal): from its voice id once it has one, so a take stays on its line when
 *  lines are inserted before it; until then from its place in the scene. */
export function lineKey(story: { id: string }, scene: string, place: string, voiceId?: string): string {
  return stableId(`edgequest/${story.id}/${scene}/${voiceId ? `voice/${voiceId}` : `${place}/line`}`);
}

export interface StoryLine {
  /** The locstring id: EDGEwave's line id. */
  id: string;
  scene: string;
  speaker: string;
  text: string;
  voice?: LineVoice;
  /** Where the line is in the story file, for edits: ["scenes", "arrival", 2, "choice", "Leave", 0]. */
  path: (string | number)[];
}

/** Where a scene's items are in the story file: a phone call keeps them under lines:. */
export const sceneItemsPath = (spec: SceneSpec): (string | number)[] => (spec.call ? ["scenes", spec.name, "lines"] : ["scenes", spec.name]);

/** A scene's lines in order, with the ids the scene writer gives them (the same walk). */
export function sceneLines(story: { id: string }, spec: SceneSpec): StoryLine[] {
  const out: StoryLine[] = [];
  const walk = (items: SceneItem[], place: string, at: (string | number)[]) => items.forEach((it, i) => {
    if (it.kind === "line") out.push({ id: lineKey(story, spec.name, `${place}/${i}`, it.voice?.id), scene: spec.name, speaker: it.speaker, text: it.text, voice: it.voice, path: [...at, i] });
    if (it.kind === "choice") it.options.forEach((o, j) => walk(o.then, `${place}/${i}/${j}`, [...at, i, "choice", o.text, ...(o.map ? ["then"] : [])]));
  });
  walk(spec.items, "main", sceneItemsPath(spec));
  return out;
}

export const storyLines = (story: Story): StoryLine[] => [...story.scenes.values()].flatMap((s) => sceneLines(story, s));

/** A line says how it is spoken. */
export const hasPrompt = (l: StoryLine) => !!(l.voice?.direction || l.voice?.say);

// ---- EDGEwave's record ------------------------------------------------------------------------------

export interface VoiceTake {
  scene?: string;
  speaker?: string;
  text?: string;
  say?: string;
  direction?: string;
  female?: string;
  male?: string;
}

export interface VoiceRecord {
  quest?: string;
  voices?: Record<string, unknown>;
  lines: Record<string, VoiceTake>;
}

export const voiceFile = (project: string, quest: string) => path.join(project, "source", "raw", "edgewave", "voice", quest, "voice.json");

/** EDGEwave's voice.json for a quest, or undefined when there is none yet. */
export function readVoiceRecord(project: string, quest: string): VoiceRecord | undefined {
  try {
    const j = JSON.parse(fs.readFileSync(voiceFile(project, quest), "utf8"));
    return j && j.edgewave === "voice" && j.lines && typeof j.lines === "object" ? j : undefined;
  } catch {
    return undefined;
  }
}

/** none: no take yet; made: a take of the line as it is; stale: a take of what the line said before. */
export type TakeStatus = "none" | "made" | "stale";

export function takeStatus(line: StoryLine, record?: VoiceRecord): TakeStatus {
  const t = record?.lines[line.id];
  if (!t || !(t.female || t.male)) return "none";
  const same = t.text === line.text && (t.say ?? "") === (line.voice?.say ?? "") && (t.direction ?? "") === (line.voice?.direction ?? "");
  return same ? "made" : "stale";
}

/** Lines as EDGEwave's voice_lines and voiceLines take them. `both` is left to EDGEwave's default: two takes
 *  for V, one for anyone else. */
export function edgewaveLines(lines: StoryLine[]): { id: string; scene: string; speaker: string; text: string; say?: string; direction?: string }[] {
  return lines.map((l) => ({ id: l.id, scene: l.scene, speaker: l.speaker, text: l.text, ...(l.voice?.say ? { say: l.voice.say } : {}), ...(l.voice?.direction ? { direction: l.voice.direction } : {}) }));
}

/** Where EDGEwave puts the .wem files: beside the quest's other files. */
export const voiceArchiveDir = (story: { author: string; id: string }) => `mod\\${story.author}\\${story.id}\\vo`;

// ---- ids ----------------------------------------------------------------------------------------------

const Reserved = new Set(["null", "true"]);
function newId(used: Set<string>): string {
  for (;;) {
    const b = crypto.randomBytes(4);
    // A letter first, so YAML never reads it as a number.
    const id = String.fromCharCode(97 + (b[0] % 26)) + [...b.subarray(1)].map((x) => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("");
    if (!used.has(id) && !Reserved.has(id)) { used.add(id); return id; }
  }
}

/** Gives every voice: block in a story file an id where it has none, keeping the file's comments. A line with
 *  no voice: keeps its place-based id until it gets one; everyLine gives those a voice: { id } too, as before
 *  voicing (a take must stay on its line). */
export function assignVoiceIds(text: string, everyLine = false): { text: string; added: number } {
  const doc = parseDocument(text);
  const scenes = doc.get("scenes", true);
  if (!isMap(scenes)) return { text, added: 0 };
  type Visit = (line: { has(k: string): boolean; get(k: string, keep: true): unknown; set(k: string, v: unknown): void }) => void;
  const walk = (list: unknown, visit: Visit) => {
    if (!isSeq(list)) return;
    for (const it of list.items) {
      if (!isMap(it)) continue;
      const choice = it.get("choice", true);
      if (isMap(choice)) { for (const p of choice.items) walk(isMap(p.value) ? p.value.get("then", true) : p.value, visit); continue; }
      if (it.has("voice") || (everyLine && !it.has("set") && !it.has("go"))) visit(it);
    }
  };
  const lists = scenes.items.map((p) => (isMap(p.value) ? p.value.get("lines", true) : p.value));
  const used = new Set<string>();
  for (const l of lists) walk(l, (line) => { const v = line.get("voice", true); if (isMap(v) && v.has("id")) used.add(String(v.get("id"))); });
  let added = 0;
  const give = (d: Document) => (line: Parameters<Visit>[0]) => {
    const v = line.get("voice", true);
    if (isMap(v)) {
      if (v.has("id")) return;
      v.items.unshift(d.createPair("id", newId(used)) as never);
    } else if (v === undefined || v === null || (isScalar(v) && (v.value === null || v.value === ""))) line.set("voice", d.createNode({ id: newId(used) }));
    else return; // not a voice block: readStory names it
    added++;
  };
  for (const l of lists) walk(l, give(doc));
  return added ? { text: doc.toString({ lineWidth: 0 }), added } : { text, added: 0 };
}
