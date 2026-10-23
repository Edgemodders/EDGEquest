// The Storyboard: a story's beats as cards and the arrows between them (agreed 2026-10-23). A card is a
// beat, titled with its journal objective; an arrow is the beat that follows, or the beat a choice goes
// to, labelled with that choice. The VS Code Storyboard draws this; quest_describe gives it in words.

import { alwaysGoes, type Beat, type SceneItem, type Story, type StoryStep } from "./story";
import type { ChecklistItem } from "./checklist";

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
    const end = c.ending ? ` The quest ${c.ending === "succeeded" ? "succeeds" : "fails"} here.` : "";
    const note = c.unreached ? " Nothing leads here yet." : "";
    out.push(`${i + 1}. **${c.objective}** (${c.beat}): ${c.steps.join(", ") || "no steps"}.${end}${note}`);
    for (const a of board.arrows.filter((x) => x.from === c.beat)) out.push(`   - ${a.choice ? `"${a.choice}" → ` : "then → "}${title(a.to)} (${a.to})`);
  });
  return out.join("\n");
}
