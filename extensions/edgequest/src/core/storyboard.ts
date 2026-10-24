// The Storyboard: a story's beats as cards and the arrows between them (agreed 2026-10-23). A card is a
// beat, titled with its journal objective; an arrow is the beat that follows, or the beat a choice goes
// to, labelled with that choice. The VS Code Storyboard draws this; quest_describe gives it in words.

import * as path from "path";
import { alwaysGoes, readStory, storyChecklist, type Beat, type SceneItem, type Story, type StoryStep } from "./story";
import type { ChecklistItem } from "./checklist";
import { readVoiceRecord, sceneItemsPath, sceneLines, takeStatus, type StoryLine, type TakeStatus } from "./voice";

export interface BoardCard {
  beat: string;
  objective: string;
  /** done or failed: the quest ends with this beat. */
  ending?: "succeeded" | "failed";
  /** Its steps in words: "arrive at home", "scene thoughts". */
  steps: string[];
  /** The scenes it plays, and how many lines they have. */
  scenes: string[];
  lines: number;
  /** Open checklist items about its scenes. */
  open: number;
  /** No arrow leads here and it is not the first beat. */
  unreached?: boolean;
}

export interface BoardArrow {
  from: string;
  to: string;
  /** The choice that leads there ("Keep it"); absent when the beat simply follows. */
  choice?: string;
  /** The scene the choice is in. */
  scene?: string;
}

export interface Board {
  cards: BoardCard[];
  arrows: BoardArrow[];
}

const stepWords = (s: StoryStep): string => {
  switch (s.kind) {
    case "arrive": return `arrive at ${s.place}`;
    case "wait": return `wait ${s.seconds} s`;
    case "scene": return `scene ${s.scene}`;
    case "set": return `${s.add ? "add" : "set"} ${s.fact}${s.add ? ` ${s.value}` : s.value !== 1 ? ` to ${s.value}` : ""}`;
    case "done": return "the quest succeeds";
    case "failed": return "the quest fails";
  }
};

/** The go: items in scene items, each with the choice that leads to it (the innermost option's text). */
function goesWithChoice(items: SceneItem[], choice?: string): { beat: string; choice?: string }[] {
  const out: { beat: string; choice?: string }[] = [];
  for (const it of items) {
    if (it.kind === "go") out.push({ beat: it.beat, choice });
    if (it.kind === "choice") for (const o of it.options) out.push(...goesWithChoice(o.then, o.text));
  }
  return out;
}

const countLines = (items: SceneItem[]): number =>
  items.reduce((n, it) => n + (it.kind === "line" ? 1 : it.kind === "choice" ? it.options.reduce((m, o) => m + countLines(o.then), 0) : 0), 0);

export function storyboard(story: Story, checklist: ChecklistItem[] = []): Board {
  const cards: BoardCard[] = [], arrows: BoardArrow[] = [];
  for (const b of story.beats) {
    const card: BoardCard = { beat: b.name, objective: b.objective, steps: [], scenes: [], lines: 0, open: 0 };
    let cut = false;
    for (const s of b.steps) {
      if (cut) break;
      card.steps.push(stepWords(s));
      if (s.kind === "done") card.ending = "succeeded";
      if (s.kind === "failed") card.ending = "failed";
      if (s.kind !== "scene") continue;
      const spec = story.scenes.get(s.scene);
      card.scenes.push(s.scene);
      if (!spec) continue;
      card.lines += countLines(spec.items);
      card.open += checklist.filter((i) => !i.done && i.found?.endsWith(`/${s.scene}`)).length;
      for (const g of goesWithChoice(spec.items)) arrows.push({ from: b.name, to: g.beat, choice: g.choice, scene: s.scene });
      cut = alwaysGoes(spec.items);
    }
    if (!cut && !card.ending && b.next) arrows.push({ from: b.name, to: b.next });
    cards.push(card);
  }
  const reached = new Set(arrows.map((a) => a.to));
  cards.forEach((c, i) => { if (i > 0 && !reached.has(c.beat)) c.unreached = true; });
  return { cards, arrows };
}

/** The Storyboard in words, for quest_describe and assistants. */
export function storyboardMarkdown(story: Story, board = storyboard(story)): string {
  const title = (name: string) => story.beats.find((b: Beat) => b.name === name)?.objective ?? name;
  const out = [`${board.cards.length} beat${board.cards.length === 1 ? "" : "s"}, starting with ${board.cards[0]?.beat ?? "none"}.`, ""];
  board.cards.forEach((c, i) => {
    const note = c.unreached ? " Nothing leads here yet." : "";
    out.push(`${i + 1}. **${c.objective}** (${c.beat}): ${c.steps.join(", ") || "no steps"}.${note}`);
    for (const a of board.arrows.filter((x) => x.from === c.beat)) out.push(`   - ${a.choice ? `"${a.choice}" → ` : "then → "}${title(a.to)} (${a.to})`);
  });
  return out.join("\n");
}

// ---- the Storyboard's model ----------------------------------------------------------------------

const CardW = 230, CardH = 104, GapX = 130, GapY = 28, Pad = 24;

type Path = (string | number)[];
/** Where a row sits for editing: its list's path in the story file, its place there, whether it can move. */
interface Placed { list: Path; index: number; first: boolean; last: boolean }

export type BoardRow =
  | ({ kind: "line"; depth: number; speaker: string; text: string; direction?: string; say?: string; status: TakeStatus; path: Path; id: string } & Placed)
  | ({ kind: "choice"; depth: number; choice: Path } & Placed)
  | { kind: "option"; depth: number; text: string; path: Path; choice: Path; go?: string; first: boolean; last: boolean }
  | ({ kind: "set"; depth: number; words: string } & Placed)
  /** The end of a list: where a new line or choice goes. */
  | { kind: "add"; depth: number; list: Path; index: number };

/** What the Storyboard draws: the board laid out, a page per beat, the checklist. */
export interface BoardModel {
  title: string;
  id: string;
  description?: string;
  problems: { line?: number; at: string; message: string }[];
  usesSteps: boolean;
  board?: Board & { pos: Record<string, { x: number; y: number }>; width: number; height: number; cardW: number; cardH: number };
  beats: Record<string, {
    name: string; objective: string; marker?: string; next?: string;
    /** Every step, in words; those after a scene whose every way out goes elsewhere never happen. */
    steps: { words: string; index: number; first: boolean; last: boolean; never: boolean }[];
    scenes: { name: string; call?: string; speakers: string[]; rows: BoardRow[]; lines: number }[];
  }>;
  beatNames: { name: string; objective: string }[];
  checklist: { do: string; done: boolean; tool?: string }[];
  voiced: boolean;
}

/** Cards in columns: a beat sits one column right of the furthest beat earlier in the list that leads to it. */
function layOut(story: Story, board: Board): NonNullable<BoardModel["board"]> {
  const order = story.beats.map((b) => b.name);
  const col: Record<string, number> = {}, rows: number[] = [];
  const pos: Record<string, { x: number; y: number }> = {};
  order.forEach((name, i) => {
    const from = board.arrows.filter((a) => a.to === name && order.indexOf(a.from) < i && order.indexOf(a.from) >= 0).map((a) => col[a.from]);
    col[name] = from.length ? Math.max(...from) + 1 : i === 0 ? 0 : col[order[i - 1]] + 1;
    const row = (rows[col[name]] = (rows[col[name]] ?? -1) + 1);
    pos[name] = { x: Pad + col[name] * (CardW + GapX), y: Pad + 18 + row * (CardH + GapY) };
  });
  const cols = Math.max(0, ...Object.values(col)) + 1, maxRows = Math.max(1, ...rows.map((r) => r + 1));
  return { ...board, pos, width: Pad * 2 + cols * CardW + (cols - 1) * GapX, height: Pad * 2 + 18 + maxRows * CardH + (maxRows - 1) * GapY + 60, cardW: CardW, cardH: CardH };
}

function sceneRows(story: Story, name: string, record: ReturnType<typeof readVoiceRecord>): { rows: BoardRow[]; lines: number } {
  const spec = story.scenes.get(name);
  if (!spec) return { rows: [], lines: 0 };
  const lines = sceneLines(story, spec);
  const byPath = new Map(lines.map((l) => [JSON.stringify(l.path), l]));
  const rows: BoardRow[] = [];
  // Indexes are the items' places in the file's list; a go: is not a row (its option shows it) and stays last.
  const walk = (items: SceneItem[], at: Path, depth: number) => {
    const movable = items.filter((x) => x.kind !== "go").length;
    items.forEach((it, i) => {
      const p = [...at, i];
      const placed: Placed = { list: at, index: i, first: i === 0, last: i === movable - 1 };
      if (it.kind === "line") {
        const l = byPath.get(JSON.stringify(p)) as StoryLine;
        rows.push({ kind: "line", depth, speaker: it.speaker, text: it.text, direction: it.voice?.direction, say: it.voice?.say, status: takeStatus(l, record), path: p, id: l.id, ...placed });
      } else if (it.kind === "choice") {
        rows.push({ kind: "choice", depth, choice: [...p, "choice"], ...placed });
        it.options.forEach((o, j) => {
          const last = o.then[o.then.length - 1];
          rows.push({ kind: "option", depth: depth + 1, text: o.text, path: [...p, "choice", o.text], choice: [...p, "choice"], go: last?.kind === "go" ? last.beat : undefined, first: j === 0, last: j === it.options.length - 1 });
          walk(o.then, [...p, "choice", o.text], depth + 2);
        });
      } else if (it.kind === "set") rows.push({ kind: "set", depth, words: `${it.add ? "add" : "set"} ${it.fact}${it.add || it.value !== 1 ? ` ${it.value}` : ""}`, ...placed });
    });
    rows.push({ kind: "add", depth, list: at, index: movable });
  };
  walk(spec.items, sceneItemsPath(spec), 0);
  return { rows, lines: lines.length };
}

/** The Storyboard's model of a story file's text; `file` places it in its project, for EDGEwave's record. */
export function boardModel(text: string, file: string): BoardModel {
  const read = readStory(text);
  const usesSteps = /^steps:/m.test(text) && !/^beats:/m.test(text);
  const project = path.dirname(file);
  const list = storyChecklist(text, project);
  const base: BoardModel = { title: path.basename(file), id: "", problems: read.problems, usesSteps, beats: {}, beatNames: [], checklist: list.items.map((i) => ({ do: i.do, done: i.done, tool: i.tool })), voiced: false };
  const story = read.story;
  if (!story) return base;
  const record = readVoiceRecord(project, story.id);
  const board = storyboard(story, list.items);
  const beats: BoardModel["beats"] = {};
  for (const b of story.beats) {
    let never = false;
    const steps = b.steps.map((s, i) => {
      const row = { words: stepWords(s), index: i, first: i === 0, last: i === b.steps.length - 1, never };
      if (s.kind === "scene" && alwaysGoes(story.scenes.get(s.scene)?.items ?? [])) never = true;
      return row;
    });
    const scenes = [...new Set(b.steps.flatMap((s) => (s.kind === "scene" ? [s.scene] : [])))];
    beats[b.name] = {
      name: b.name, objective: b.objective, marker: b.marker, next: b.next, steps,
      scenes: scenes.map((s) => {
        const call = story.scenes.get(s)?.call;
        return { name: s, call, speakers: call ? ["V", call] : ["V"], ...sceneRows(story, s, record) };
      }),
    };
  }
  return { ...base, title: story.title, id: story.id, description: story.description, board: layOut(story, board), beats, beatNames: story.beats.map((b) => ({ name: b.name, objective: b.objective })), voiced: !!record };
}
