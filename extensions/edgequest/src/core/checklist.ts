// The quest's checklist: what is left for the modder. Where a quest uses a stand-in (a line shown as text with
// no voice; later a person nobody placed, an item that does not exist yet), EDGEquest finds it and puts it on
// the list with the EDGE tool that can do it. The AI writing the quest, or the modder, adds items of their
// own. The story file holds the list under todo:, so it travels with the project:
//
//   todo:
//     - Decide what the reward is                    # written by hand: open
//     - do: Pick a better name for the bar
//       done: true                                   # ticked by hand
//     - do: Voice the 5 lines in the scene at_the_door. Until then they show as text only.
//       found: voice/at_the_door                     # found by EDGEquest, which keeps it up to date
//       tool: EDGEwave
//
// A stand-in always keeps the quest playable: open items never stop a quest from playing (agreed 2026-10-22).

import { isMap, isScalar, isSeq, parseDocument, YAMLMap } from "yaml";
import type { SceneItem, Story } from "./story";

export interface ChecklistItem {
  /** What to do, in plain words. */
  do: string;
  done: boolean;
  /** Set on items EDGEquest found: what the item is about ("voice/<scene>"). EDGEquest adds, updates, ticks
   *  and removes these; the modder may tick one to accept the stand-in as it is. */
  found?: string;
  /** The EDGE tool that can do it. */
  tool?: string;
}

/** A stand-in EDGEquest found in a story, or a thing it found settled. */
export interface FoundItem {
  found: string;
  do: string;
  tool?: string;
  /** The thing now exists (or the text was written): the item ticks itself. */
  settled: boolean;
}

/** The template's journal description; a quest still showing it needs its own. */
export const TemplateDescription = "What the journal says about this quest.";

const countLines = (items: SceneItem[]): number =>
  items.reduce((n, it) => n + (it.kind === "line" ? 1 : it.kind === "choice" ? it.options.reduce((m, o) => m + countLines(o.then), 0) : 0), 0);

/** The stand-ins in a story. */
export function findStandIns(story: Story): FoundItem[] {
  const found: FoundItem[] = [];
  found.push({ found: "description", do: "Write the quest's description: the journal still shows the template's.", settled: story.description !== TemplateDescription });
  for (const sc of story.scenes.values()) {
    const n = countLines(sc.items);
    // Lines are unvoiced until Q4 (EDGEwave); the item then ticks itself once each line has its voice files.
    if (n) found.push({ found: `voice/${sc.name}`, do: `Voice the ${n} line${n === 1 ? "" : "s"} in the scene ${sc.name}. Until then ${n === 1 ? "it shows" : "they show"} as text only.`, tool: "EDGEwave", settled: false });
  }
  return found;
}

export interface ChecklistProblem {
  at: string;
  message: string;
}

/** Reads a todo: list (already parsed to plain values). */
export function readChecklist(raw: unknown): { items: ChecklistItem[]; problems: ChecklistProblem[] } {
  const items: ChecklistItem[] = [], problems: ChecklistProblem[] = [];
  if (raw === undefined || raw === null) return { items, problems };
  if (!Array.isArray(raw)) return { items, problems: [{ at: "todo", message: "todo is a list: - Decide what the reward is, or - { do: ..., done: true }." }] };
  raw.forEach((v, i) => {
    const at = `todo ${i + 1}`;
    if (typeof v === "string" && v.trim()) { items.push({ do: v.trim(), done: false }); return; }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const text = typeof o.do === "string" ? o.do.trim() : "";
      if (!text) { problems.push({ at, message: "A checklist item says what to do: - do: Decide what the reward is" }); return; }
      for (const k of Object.keys(o)) if (!["do", "done", "found", "tool"].includes(k)) problems.push({ at, message: `Unknown key "${k}" in a checklist item. Keys: do, done, found, tool.` });
      items.push({ do: text, done: o.done === true, found: typeof o.found === "string" ? o.found : undefined, tool: typeof o.tool === "string" ? o.tool : undefined });
      return;
    }
    problems.push({ at, message: `"${String(v)}" is not a checklist item. Write it as - Decide what the reward is.` });
  });
  return { items, problems };
}

/** The checklist after EDGEquest's findings: found items are added, updated, ticked when settled and removed
 *  when what they were about is gone; items written by hand are left as they are. Returns the story file's
 *  new text (unchanged when nothing changed; comments kept) and the items. */
export function syncChecklist(text: string, found: FoundItem[]): { text: string; items: ChecklistItem[]; changed: boolean } {
  const doc = parseDocument(text);
  let list = doc.get("todo", true);
  const wanted = new Map(found.map((f) => [f.found, f]));
  let changed = false;
  if (!isSeq(list)) {
    if (list !== undefined && list !== null && !(isScalar(list) && list.value === null)) return { text, items: [], changed: false }; // a bad todo: is reported by readStory
    if (![...wanted.values()].some((f) => !f.settled)) return { text, items: [], changed: false };
    doc.set("todo", doc.createNode([]));
    list = doc.get("todo", true);
    changed = true;
  }
  const seq = list as unknown as { items: unknown[] };
  const seen = new Set<string>();
  seq.items = seq.items.filter((node) => {
    if (!isMap(node)) return true;
    const key = node.get("found");
    if (typeof key !== "string") return true;
    const f = wanted.get(key);
    if (!f || seen.has(key)) { changed = true; return false; } // what it was about is gone (or a duplicate)
    seen.add(key);
    if (node.get("do") !== f.do && node.get("done") !== true) { node.set("do", f.do); changed = true; }
    if (f.settled && node.get("done") !== true) { node.set("done", true); changed = true; }
    if (f.tool && node.get("tool") !== f.tool) { node.set("tool", f.tool); changed = true; }
    return true;
  });
  for (const f of found) {
    if (seen.has(f.found) || f.settled) continue; // a settled thing never on the list needs no item
    const m = new YAMLMap();
    m.set("do", f.do);
    m.set("found", f.found);
    if (f.tool) m.set("tool", f.tool);
    seq.items.push(m);
    changed = true;
  }
  const next = changed ? doc.toString({ lineWidth: 0 }) : text; // no folding: one item, one line
  return { text: next, items: readChecklist(parseDocument(next).toJS()?.todo).items, changed };
}

/** The checklist in words: open items first, each with its tool. */
export function checklistMarkdown(items: ChecklistItem[]): string {
  if (!items.length) return "The checklist is empty: nothing is left for the modder.";
  const open = items.filter((i) => !i.done), done = items.filter((i) => i.done);
  const line = (i: ChecklistItem) => `- [${i.done ? "x" : " "}] ${i.do}${i.tool ? ` (${i.tool})` : ""}`;
  return [`${open.length} open, ${done.length} done.`, "", ...open.map(line), ...done.map(line)].join("\n");
}
