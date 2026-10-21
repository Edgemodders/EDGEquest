// Reads a .scene (WolvenKit JSON) into its people, lines, choices and flow. Sections hold dialogue
// line events that name a screenplay line; a line names its speaker and its text id (locstringId,
// the subtitle stringId). A choice lists options, and its output socket (0, i) leads on from option i.
// Quest nodes inside a scene are ordinary quest nodes, described by describe.ts.
//
// Text: the scene's own locStore holds the text per locale (checked on sq030_01_dam_meetup: 60 of its
// 64 en_us lines equal the en-us subtitles). Subtitles passed in by the caller win over it.

import { describeCondition, describeNode, type StepInfo } from "./describe";
import { deref, value, type Json, type QuestNode } from "./graph";

export interface SceneActor { id: number; name: string; player: boolean }

export interface SceneLine {
  /** The screenplay item id. */
  id: number;
  speaker: string;
  addressee?: string;
  /** The subtitle stringId (decimal). */
  stringId: string;
  text: string;
}

export interface SceneOption {
  id: number;
  stringId: string;
  text: string;
  /** "only if ...", when the option has a quest condition. */
  condition?: string;
  to: number[];
}

export type SceneNodeKind = "start" | "end" | "section" | "choice" | "quest" | "flow" | "other";

export interface SceneStep {
  id: number;
  type: string;
  kind: SceneNodeKind;
  /** One line in plain words. */
  text: string;
  lines?: SceneLine[];
  options?: SceneOption[];
  /** Where each output leads: socket label and node ids. */
  next: { socket: string; to: number[] }[];
  /** For a quest node: what it does, with the facts, journal entries and refs it uses. */
  info?: StepInfo;
}

export interface SceneFile {
  actors: SceneActor[];
  entries: { name: string; node: number }[];
  exits: { name: string; node: number }[];
  steps: SceneStep[];
  lines: SceneLine[];
  options: SceneOption[];
  /** Lines without text in the scene or the subtitles passed in. */
  missingText: number;
}

const str = (x: Json): string => {
  const v = value(x);
  return v === undefined || v === null || v === "None" ? "" : String(v);
};

/** The scene's own text for each stringId: en_us first, then any locale. */
function embeddedText(locStore: Json): Map<string, string> {
  const payload = new Map<string, string>();
  for (const p of locStore?.vpEntries ?? []) payload.set(String(p.variantId?.ruid), String(p.content ?? ""));
  const byLocale = new Map<string, Map<string, string>>();
  for (const d of locStore?.vdEntries ?? []) {
    const loc = String(d.localeId ?? "");
    const id = String(d.locstringId?.ruid);
    const text = payload.get(String(d.variantId?.ruid));
    if (text === undefined) continue;
    if (!byLocale.has(loc)) byLocale.set(loc, new Map());
    const m = byLocale.get(loc)!;
    if (!m.has(id)) m.set(id, text);
  }
  const out = new Map<string, string>();
  const order = ["en_us", ...[...byLocale.keys()].filter((l) => l !== "en_us" && l !== "db_db"), "db_db"];
  for (const loc of order) for (const [id, text] of byLocale.get(loc) ?? []) if (!out.has(id)) out.set(id, text);
  return out;
}

function collectHandles(x: Json, into: Map<string, Json>): void {
  if (Array.isArray(x)) for (const v of x) collectHandles(v, into);
  else if (x && typeof x === "object") {
    if ("HandleId" in x && "Data" in x) into.set(String(x.HandleId), x.Data);
    for (const v of Object.values(x)) collectHandles(v, into);
  }
}

/**
 * Reads a scene. `subtitles` maps stringId to text (the female variant, or the male one when it is
 * empty) and wins over the scene's own text.
 */
export function readScene(json: Json, subtitles?: Map<string, string>): SceneFile {
  const root = json?.Data?.RootChunk ?? json;
  const h = new Map<string, Json>();
  collectHandles(root, h);
  const text = embeddedText(root.locStore);
  const textOf = (id: string) => subtitles?.get(id) ?? text.get(id) ?? "";

  const actors: SceneActor[] = [
    ...(root.actors ?? []).map((a: Json) => ({ id: Number(a.actorId?.id), name: str(a.actorName) || `actor ${a.actorId?.id}`, player: false })),
    ...(root.playerActors ?? []).map((a: Json) => ({ id: Number(a.actorId?.id), name: str(a.playerName) || "V", player: true })),
  ];
  const actorName = (x: Json) => {
    const id = Number(x?.id);
    return actors.find((a) => a.id === id)?.name ?? (id === 4294967295 ? "" : `actor ${id}`);
  };

  const store = root.screenplayStore ?? {};
  const lines: SceneLine[] = (store.lines ?? []).map((l: Json) => {
    const stringId = String(l.locstringId?.ruid ?? "");
    return { id: Number(l.itemId?.id), speaker: actorName(l.speaker), addressee: actorName(l.addressee) || undefined, stringId, text: textOf(stringId) };
  });
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const optionText = new Map<number, { stringId: string; text: string }>();
  for (const o of store.options ?? []) {
    const stringId = String(o.locstringId?.ruid ?? "");
    optionText.set(Number(o.itemId?.id), { stringId, text: textOf(stringId) });
  }

  const allOptions: SceneOption[] = [];
  const steps: SceneStep[] = [];
  for (const entry of root.sceneGraph?.Data?.graph ?? root.sceneGraph?.graph ?? []) {
    const d = deref(entry, h);
    if (!d?.$type) continue;
    const id = Number(d.nodeId?.id);
    const sockets: { name: number; ordinal: number; to: number[] }[] = (d.outputSockets ?? []).map((s: Json) => ({
      name: Number(s.stamp?.name ?? 0),
      ordinal: Number(s.stamp?.ordinal ?? 0),
      to: (s.destinations ?? []).map((x: Json) => Number(x.nodeId?.id)),
    }));
    const next = sockets.filter((s) => s.to.length).map((s) => ({ socket: `${s.name}.${s.ordinal}`, to: s.to }));
    const step: SceneStep = { id, type: d.$type, kind: "other", text: "", next };
    switch (d.$type) {
      case "scnStartNode": step.kind = "start"; step.text = "Start"; break;
      case "scnEndNode": step.kind = "end"; step.text = str(d.type) === "Terminating" ? "End" : "End (continue)"; break;
      case "scnSectionNode": {
        step.kind = "section";
        step.lines = (d.events ?? [])
          .map((e: Json) => deref(e, h))
          .filter((e: Json) => e?.$type === "scnDialogLineEvent")
          .sort((a: Json, b: Json) => Number(a.startTime ?? 0) - Number(b.startTime ?? 0))
          .map((e: Json) => lineById.get(Number(e.screenplayLineId?.id)))
          .filter(Boolean);
        step.text = step.lines!.length ? `${step.lines!.length} line${step.lines!.length === 1 ? "" : "s"}` : "Section (no lines)";
        break;
      }
      case "scnChoiceNode": {
        step.kind = "choice";
        step.options = (d.options ?? []).map((o: Json, i: number) => {
          const oid = Number(o.screenplayOptionId?.id);
          const t = optionText.get(oid) ?? { stringId: "", text: "" };
          const cond = o.questCondition ? describeCondition(o.questCondition, h) : undefined;
          return { id: oid, stringId: t.stringId, text: t.text, condition: cond && cond !== "?" ? `only if ${cond}` : undefined, to: sockets.find((s) => s.name === 0 && s.ordinal === i)?.to ?? [] };
        });
        allOptions.push(...step.options!);
        step.text = `Choice of ${step.options!.length}`;
        break;
      }
      case "scnQuestNode": {
        step.kind = "quest";
        const q = deref(d.questNode, h);
        if (q) {
          const node: QuestNode = { id, type: String(q.$type), data: q, sockets: [] };
          step.info = describeNode(node, h);
          step.text = step.info.text;
        }
        break;
      }
      case "scnHubNode": step.kind = "flow"; step.text = "Join"; break;
      case "scnAndNode": step.kind = "flow"; step.text = "When all have arrived"; break;
      case "scnXorNode": step.kind = "flow"; step.text = "Only the first"; break;
      case "scnRandomizerNode": step.kind = "flow"; step.text = "Pick one at random"; break;
      case "scnCutControlNode": step.kind = "flow"; step.text = "Stop the other branches"; break;
      default: step.text = d.$type.replace(/^scn/, "").replace(/Node$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
    }
    steps.push(step);
  }

  const point = (p: Json) => ({ name: str(p.name), node: Number(p.nodeId?.id) });
  return {
    actors,
    entries: (root.entryPoints ?? []).map(point),
    exits: (root.exitPoints ?? []).map(point),
    steps,
    lines,
    options: allOptions,
    missingText: lines.filter((l) => !l.text).length,
  };
}

/** The scene's steps in reading order, from its entry points along the outputs. */
export function sceneOrder(scene: SceneFile): SceneStep[] {
  const byId = new Map(scene.steps.map((s) => [s.id, s]));
  const order: SceneStep[] = [];
  const seen = new Set<number>();
  const queue = scene.entries.map((e) => e.node);
  if (!queue.length) queue.push(...scene.steps.filter((s) => s.kind === "start").map((s) => s.id));
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const s = byId.get(id);
    if (!s) continue;
    order.push(s);
    for (const n of s.next) for (const t of n.to) if (!seen.has(t)) queue.push(t);
  }
  for (const s of scene.steps) if (!seen.has(s.id)) order.push(s);
  return order;
}
