// Quests and scenes as plain-words Markdown, for the MCP tools and for copying from the quest page.
// The page itself draws from the same data (describeNode, summarize, readScene).

import { describeNode, summarize, type StepInfo } from "./describe";
import { flowOrder, type QuestFile, type QuestGraph } from "./graph";
import { sceneOrder, type SceneFile } from "./scene";

export interface Step extends StepInfo {
  id: number;
  type: string;
  /** Where each output leads: "socket -> node id (input socket)". */
  next: { socket: string; node: number; input: string }[];
  /** An inline phase's own steps. */
  inner?: Step[];
}

/** A graph's steps in reading order, inline phases nested, deletion markers left out. */
export function steps(graph: QuestGraph, handles: Map<string, unknown>): Step[] {
  return flowOrder(graph)
    .map((n) => {
      const info = describeNode(n, handles as Map<string, never>, graph.edges.filter((e) => e.to.node === n.id));
      return {
        ...info,
        id: n.id,
        type: n.type,
        next: graph.edges.filter((e) => e.from.node === n.id).map((e) => ({ socket: e.from.socket, node: e.to.node, input: e.to.socket })),
        inner: n.inner ? steps(n.inner, handles) : undefined,
      };
    })
    .filter((s) => s.kind !== "hidden");
}

const plainInput = (s: string) => !s || s === "In" || /^In\d*$/.test(s);

function stepLines(list: Step[], indent: string, out: string[]): void {
  for (const s of list) {
    const next = s.next.map((n) => `${s.next.length > 1 || (s.next[0] && s.next[0].socket !== "Out") ? `${n.socket} ` : ""}→ ${n.node}${plainInput(n.input) ? "" : ` (${n.input})`}`);
    out.push(`${indent}- **${s.id}** ${s.text}${next.length ? `  ${next.join(", ")}` : ""}`);
    if (s.inner) stepLines(s.inner, indent + "  ", out);
  }
}

/** A .quest or .questphase in plain words. `limit` caps the steps listed (the summary is always whole). */
export function questMarkdown(title: string, file: QuestFile, limit = 400): string {
  const list = steps(file.graph, file.handles);
  const sum = summarize(file.graph, file.handles);
  const count = (l: Step[]): number => l.reduce((a, s) => a + 1 + (s.inner ? count(s.inner) : 0), 0);
  const total = count(list);
  const out: string[] = [`# ${title}`, "", `${file.type === "questQuestResource" ? "Quest" : "Phase"} with ${total} steps. Each step: its id, what it does, and where it leads.`, ""];
  const shown: string[] = [];
  stepLines(list, "", shown);
  out.push(...shown.slice(0, limit));
  if (shown.length > limit) out.push(`- … ${shown.length - limit} more lines`);
  if (sum.facts.length) {
    out.push("", "## Facts");
    for (const f of sum.facts) out.push(`- \`${f.name}\`${f.sets.length ? `: set ${f.sets.join(", ")}` : ""}${f.tests.length ? `${f.sets.length ? ";" : ":"} tested ${f.tests.join(", ")}` : ""}`);
  }
  if (sum.journal.length) {
    out.push("", "## Journal");
    for (const j of sum.journal) out.push(`- ${j.kind} \`${j.path}\`${j.states.length ? `: ${j.states.join(", ").toLowerCase()}` : ""}`);
  }
  if (sum.scenes.length) out.push("", "## Scenes", ...sum.scenes.map((s) => `- \`${s}\``));
  if (sum.phases.length) out.push("", "## Phases it plays", ...sum.phases.map((s) => `- \`${s}\``));
  if (sum.refs.length) out.push("", "## Places, people and objects (NodeRefs)", sum.refs.map((r) => `\`${r}\``).join(", "));
  return out.join("\n");
}

/** A scene in plain words: who is in it, then its steps with lines and choices. */
export function sceneMarkdown(title: string, scene: SceneFile, limit = 600): string {
  const out: string[] = [
    `# ${title}`,
    "",
    `People: ${scene.actors.map((a) => a.name + (a.player ? " (the player)" : "")).join(", ") || "none"}. ${scene.lines.length} lines, ${scene.options.length} choice options${scene.missingText ? `, ${scene.missingText} lines without text in this scene` : ""}.`,
    `Entry points: ${scene.entries.map((e) => `${e.name} (${e.node})`).join(", ") || "none"}. Exit points: ${scene.exits.map((e) => `${e.name} (${e.node})`).join(", ") || "none"}.`,
    "",
  ];
  const body: string[] = [];
  for (const s of sceneOrder(scene)) {
    const next = s.kind === "choice" ? "" : s.next.map((n) => `→ ${n.to.join(", ")}`).join(" ");
    body.push(`- **${s.id}** ${s.text}${next ? `  ${next}` : ""}`);
    for (const l of s.lines ?? []) body.push(`  - ${l.speaker}${l.addressee && l.addressee !== l.speaker ? ` (to ${l.addressee})` : ""}: ${l.text || `(no text, id ${l.stringId})`}`);
    for (const o of s.options ?? []) body.push(`  - choice: ${o.text || `(no text, id ${o.stringId})`}${o.condition ? ` [${o.condition}]` : ""} → ${o.to.join(", ") || "nowhere"}`);
  }
  out.push(...body.slice(0, limit));
  if (body.length > limit) out.push(`- … ${body.length - limit} more lines`);
  return out.join("\n");
}
