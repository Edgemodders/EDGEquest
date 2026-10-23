// The quest index: every .quest and .questphase in the user's game with the facts, journal entries,
// scenes, phases and NodeRefs it uses, plus the journal's names (quest titles, objective words). Built
// once from the game (about 90 seconds) and cached in %LOCALAPPDATA%\EDGEquest, shared by the extension
// and the MCP server; a key from the game's archive list marks it out of date after a game update.
// It is what finding a quest by a fact, a journal entry or a person needs, and what "used by" reads.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { summarize } from "./describe";
import { readQuestFile, value, type Json } from "./graph";
import { murmur3 } from "./write/wk";

export const IndexVersion = 5;

/** The game's compiled map marker positions. */
const MappinsFile = "base\\worlds\\03_night_city\\_compiled\\default\\03_night_city.mappins";

/** A world sector that belongs to a quest's prefab: it is loaded only while a running phase lists the prefab. */
const QuestSector = /\\quest_[0-9a-f]+\.streamingsector$/i;

export interface IndexedFile {
  path: string;
  kind: "quest" | "phase";
  nodes: number;
  factsSet: string[];
  factsTested: string[];
  journal: string[];
  scenes: string[];
  phases: string[];
  refs: string[];
}

export interface JournalInfo {
  kind: string;
  /** The entry's title, description or name, resolved to en-us text where the game has it. */
  text?: string;
}

/** A game map marker: where it shows, and the world node it stands on (a quest can use both). */
export interface IndexedPlace {
  /** The compiled world position [x, y, z]. */
  at: [number, number, number];
  /** The marker's NodeRef: a name ("#mq055_mp_...") or, when the name is not known, its hash. */
  node: string;
  /** The marker's offset from the node. */
  offset: [number, number, number];
  /** The trigger area the game's own quest waits for V in after showing this marker, nearest first. */
  area?: string;
}

/** A trigger area in a quest's world prefab: where a quest waits for V to arrive. */
export interface IndexedArea {
  /** The node's world position [x, y, z]. */
  at: [number, number, number];
  /** The world prefabs a phase lists so the area exists while it runs (game phases list these), outer first. */
  prefabs: string[];
}

/** A journal entry as the index reads it. A quest map pin on a world node also has its node and offset. */
export interface JournalRead {
  kind: string;
  key?: string;
  node?: string;
  offset?: [number, number, number];
  /** A quest map pin with neither a world node nor a dynamic entity: nothing places it. */
  unplaced?: boolean;
}

export interface QuestIndex {
  version: number;
  key: string;
  builtAt: string;
  seconds: number;
  files: IndexedFile[];
  journal: Record<string, JournalInfo>;
  /** Map markers on a world node that the game has a compiled position for, by journal path. */
  places: Record<string, IndexedPlace>;
  /** Trigger areas in the game's quest prefabs, by NodeRef ("#mq000_tr_vs_apartment"). */
  areas: Record<string, IndexedArea>;
  failed: string[];
}

export type Progress = (message: string, done?: number, total?: number) => void;

const indexFile = (cacheDir: string) => path.join(cacheDir, "quest-index.json");

/** A key for the game's current archives: their names and file counts. */
export async function gameKey(bridge: BridgeClient): Promise<string> {
  const archives = await bridge.archives();
  const text = archives.map((a) => `${a.name}:${a.files}`).sort().join("|");
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

export function loadIndex(cacheDir: string): QuestIndex | undefined {
  try {
    const idx = JSON.parse(fs.readFileSync(indexFile(cacheDir), "utf8")) as QuestIndex;
    return idx.version === IndexVersion ? idx : undefined;
  } catch {
    return undefined;
  }
}

export async function isIndexCurrent(idx: QuestIndex, bridge: BridgeClient): Promise<boolean> {
  return idx.key === (await gameKey(bridge));
}

/** Every game path with one of the extensions, through the archive search. */
export async function listGameFiles(bridge: BridgeClient, ...exts: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const ext of exts) {
    const r = await bridge.search(ext, 100000);
    for (const f of r.items) if (f.name.toLowerCase().endsWith(ext)) out.add(f.name);
  }
  return [...out].sort();
}

const JournalText = ["title", "description", "name"];

/** Every journal entry by path ("quests/main_quest/...") with its kind and LocKey, from one .journal's JSON. */
export function readJournal(json: Json, into: Map<string, JournalRead>): void {
  const root = json?.Data?.RootChunk?.entry ?? json?.entry;
  const walk = (x: Json, prefix: string) => {
    const d = x?.Data;
    if (!d?.$type) return;
    const id = String(d.id ?? "");
    const p = id ? (prefix ? `${prefix}/${id}` : id) : prefix;
    if (p) {
      let key: string | undefined;
      for (const f of JournalText) {
        const v = d[f]?.value ?? value(d[f]);
        if (typeof v === "string" && v && v !== "None") { key = v; break; }
      }
      if (!into.has(p) || key) {
        const e: JournalRead = { kind: String(d.$type).replace(/^gameJournal/, ""), key };
        const ref = d.$type === "gameJournalQuestMapPin" ? String(d.reference?.reference?.$value ?? "0") : "0";
        const dynamic = value(d.reference?.dynamicEntityUniqueName);
        if (ref !== "0" && (!dynamic || dynamic === "None")) {
          e.node = ref;
          e.offset = [Number(d.offset?.X ?? 0), Number(d.offset?.Y ?? 0), Number(d.offset?.Z ?? 0)];
        } else if (d.$type === "gameJournalQuestMapPin" && (!dynamic || dynamic === "None")) e.unplaced = true;
        into.set(p, e);
      }
    }
    for (const c of d.entries ?? []) walk(c, p);
  };
  walk(root, "");
}

/** The world prefabs a quest file lists (its own and its inline phases'), and the trigger areas it waits for V in. */
export function worldRefs(json: Json): { prefabs: string[]; triggers: string[] } {
  const prefabs = new Set<string>(), triggers = new Set<string>();
  const walk = (x: Json) => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== "object") return;
    if (x.$type === "questQuestPrefabEntry") { const r = value(x.prefabNodeRef); if (typeof r === "string" && r !== "0") prefabs.add(r); }
    if (x.$type === "questTriggerCondition" && Number(x.isPlayerActivator) === 1) { const r = value(x.triggerAreaRef); if (typeof r === "string" && r !== "0") triggers.add(r); }
    for (const v of Object.values(x)) walk(v as Json);
  };
  walk(json);
  return { prefabs: [...prefabs], triggers: [...triggers] };
}

/**
 * Every trigger area in the game's quest prefab sectors, by NodeRef. A node's path names the prefabs it sits
 * in ("$/.../#mq000_pr_apartment/#mq000_tr_vs_apartment"); the ones game phases list are what a new phase
 * lists, or the outermost when none is.
 */
async function readAreas(bridge: BridgeClient, listed: Set<string>, failed: string[], progress: Progress): Promise<Record<string, IndexedArea>> {
  const sectors = new Set<string>();
  for (const b of await listGameFiles(bridge, ".streamingblock")) {
    try {
      const blk = JSON.parse((await bridge.toJson(b)).json ?? "null");
      for (const d of blk?.Data?.RootChunk?.descriptors ?? []) { const p = value(d.data?.DepotPath); if (typeof p === "string" && QuestSector.test(p)) sectors.add(p); }
    } catch (e) {
      failed.push(`${b}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const areas: Record<string, IndexedArea> = {};
  let i = 0;
  for (const s of sectors) {
    if (i++ % 200 === 0) progress("Reading the world's quest trigger areas", i, sectors.size);
    let rc: Json;
    try { rc = JSON.parse((await bridge.toJson(s)).json ?? "null")?.Data?.RootChunk; } catch (e) { failed.push(`${s}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    const nodes = rc?.nodes ?? [];
    const data: Json[] = rc?.nodeData?.Data ?? rc?.nodeData ?? [];
    for (const [k, d] of data.entries()) {
      // Since game 2.5 (2026-10-23) REDbridge 0.10.0 reads every NodeIndex as the same number, past the end of
      // the nodes; the entries then come one per node, in order (441 of 446 sectors read). *Inferred*, not
      // documented: by place, 1,136 of 1,325 trigger areas have trigger names.
      const node = nodes[d.NodeIndex] ?? (data.length === nodes.length ? nodes[k] : undefined);
      if (node?.Data?.$type !== "worldTriggerAreaNode") continue;
      const full = value(d.QuestPrefabRefHash);
      if (typeof full !== "string") continue;
      const segs = full.split("/");
      const chain = segs.slice(0, -1).filter((x) => x.startsWith("#"));
      if (!chain.length) continue;
      const prefabs = chain.filter((x) => listed.has(x));
      const at = [d.Position?.X, d.Position?.Y, d.Position?.Z].map((n) => Math.round(Number(n ?? 0) * 100) / 100) as [number, number, number];
      for (const alias of segs[segs.length - 1].split(";")) if (alias.startsWith("#") && !areas[alias]) areas[alias] = { at, prefabs: prefabs.length ? prefabs : [chain[0]] };
    }
  }
  return areas;
}

const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Builds the index from the game and writes it to the cache. */
export async function buildIndex(bridge: BridgeClient, cacheDir: string, progress: Progress = () => undefined): Promise<QuestIndex> {
  const t0 = Date.now();
  const failed: string[] = [];
  progress("Reading the game's file lists");
  const key = await gameKey(bridge);
  const paths = await listGameFiles(bridge, ".quest", ".questphase");
  const files: IndexedFile[] = [];
  const listedPrefabs = new Set<string>();
  const triggersOf = new Map<string, string[]>();
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    try {
      const r = await bridge.toJson(p);
      const raw = JSON.parse(r.json ?? "null");
      const w = worldRefs(raw);
      w.prefabs.forEach((x) => listedPrefabs.add(x));
      if (w.triggers.length) triggersOf.set(p, w.triggers);
      const q = readQuestFile(raw);
      const s = summarize(q.graph, q.handles);
      let nodes = 0;
      const count = (g: typeof q.graph) => { for (const n of g.nodes) { nodes++; if (n.inner) count(n.inner); } };
      count(q.graph);
      files.push({
        path: p,
        kind: p.endsWith(".quest") ? "quest" : "phase",
        nodes,
        factsSet: s.facts.filter((f) => f.sets.length).map((f) => f.name),
        factsTested: s.facts.filter((f) => f.tests.length).map((f) => f.name),
        journal: s.journal.map((j) => j.path),
        scenes: s.scenes,
        phases: s.phases,
        refs: s.refs,
      });
    } catch (e) {
      failed.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (i % 100 === 0) progress("Reading quests and phases", i, paths.length);
  }

  progress("Reading the journal");
  const entries = new Map<string, JournalRead>();
  for (const p of await listGameFiles(bridge, ".journal")) {
    try {
      readJournal(JSON.parse((await bridge.toJson(p)).json ?? "null"), entries);
    } catch (e) {
      failed.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  progress("Reading the journal's texts");
  const keys = [...new Set([...entries.values()].map((e) => e.key).filter((k): k is string => !!k))];
  const texts = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 500) {
    try {
      const got = await bridge.locGet(keys.slice(i, i + 500), "en-us");
      for (const [k, v] of Object.entries(got)) if (v) texts.set(k, v.female || v.male);
    } catch (e) {
      failed.push(`loc.get: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  const journal: Record<string, JournalInfo> = {};
  for (const [p, e] of entries) journal[p] = { kind: e.kind, text: e.key ? texts.get(e.key) : undefined };

  progress("Reading map marker positions");
  const places: Record<string, IndexedPlace> = {};
  try {
    // The game keys compiled marker positions by the journal path's Murmur3 hash. Only markers on a world
    // node are kept: a new quest's marker and arrival use the same node (see docs/design/formats.md).
    const byHash = new Map<number, string>();
    for (const [p, e] of entries) if (e.node) byHash.set(murmur3(p), p);
    const res = JSON.parse((await bridge.toJson(MappinsFile)).json ?? "{}").Data.RootChunk;
    for (const d of res.cookedData ?? []) {
      const p = byHash.get(Number(d.journalPathHash));
      const e = p ? entries.get(p) : undefined;
      if (p && e?.node && d.position) places[p] = { at: [d.position.X, d.position.Y, d.position.Z].map((n: number) => Math.round(n * 100) / 100) as [number, number, number], node: e.node, offset: e.offset ?? [0, 0, 0] };
    }
  } catch (e) {
    failed.push(`map markers: ${e instanceof Error ? e.message : String(e)}`);
  }

  const areas = await readAreas(bridge, listedPrefabs, failed, progress);
  // A marker's area: of the trigger areas the game's own phases wait for V in after showing it (phases that
  // use the marker's objective), the nearest to the marker. In-game test 2026-10-22: V's distance to a
  // marker's node never fired; the game's own quests wait in trigger areas.
  for (const [p, place] of Object.entries(places)) {
    const objective = p.slice(0, p.lastIndexOf("/"));
    let best: { area: string; d: number } | undefined;
    for (const f of files) {
      if (!f.journal.includes(objective) && !f.journal.includes(p)) continue;
      for (const t of triggersOf.get(f.path) ?? []) {
        const a = areas[t];
        if (!a) continue;
        const d = distance(a.at, place.at);
        if (d <= 50 && (!best || d < best.d)) best = { area: t, d };
      }
    }
    if (best) place.area = best.area;
  }

  const idx: QuestIndex = { version: IndexVersion, key, builtAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), files, journal, places, areas, failed };
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(indexFile(cacheDir), JSON.stringify(idx));
  return idx;
}

// ---- reading the index -------------------------------------------------------------------------

const norm = (p: string) => p.toLowerCase().replace(/\//g, "\\");

/** The files that play a phase (their phase nodes name it). */
export function usedBy(idx: QuestIndex, gamePath: string): IndexedFile[] {
  const p = norm(gamePath);
  return idx.files.filter((f) => f.phases.some((x) => norm(x) === p) || f.scenes.some((x) => norm(x) === p));
}

/** The journal quest a file's entries belong to, by the most entries, with its title. */
export function questOf(idx: QuestIndex, file: IndexedFile): { path: string; title?: string } | undefined {
  const counts = new Map<string, number>();
  for (const j of file.journal) {
    const parts = j.split("/");
    // the quest entry is the longest prefix of the path that the journal knows as a Quest
    for (let n = parts.length; n > 0; n--) {
      const prefix = parts.slice(0, n).join("/");
      if (idx.journal[prefix]?.kind === "Quest") {
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
        break;
      }
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  // a shared phase (default dialogs, bug fixes) touches many quests: name one only when it has most of them
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return best && best[1] * 2 > total ? { path: best[0], title: idx.journal[best[0]]?.text } : undefined;
}

export interface FindHit {
  file: IndexedFile;
  /** Why it matched, in plain words. */
  why: string[];
  quest?: { path: string; title?: string };
}

/**
 * Finds quests and phases by words: a file name or folder, a quest title, a fact, a journal path or
 * the words of an entry, a scene, a NodeRef (people and places). Every word must match somewhere.
 */
export function findQuests(idx: QuestIndex, query: string, limit = 50): FindHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: (FindHit & { score: number })[] = [];
  for (const file of idx.files) {
    const quest = questOf(idx, file);
    const fields: [string, string[]][] = [
      ["path", [file.path]],
      ["quest", quest?.title ? [quest.title] : []],
      ["fact", [...file.factsSet, ...file.factsTested]],
      ["journal", file.journal.flatMap((j) => [j, idx.journal[j]?.text ?? ""])],
      ["scene", file.scenes],
      ["ref", file.refs],
    ];
    const why = new Set<string>();
    let score = 0;
    let all = true;
    for (const w of words) {
      let found = false;
      for (const [label, values] of fields) {
        const v = values.find((x) => x.toLowerCase().includes(w));
        if (v) {
          found = true;
          why.add(label === "path" ? "name" : `${label} ${v.length > 80 ? v.slice(0, 77) + "…" : v}`);
          score += label === "path" ? 3 : label === "quest" ? 4 : 1;
        }
      }
      if (!found) { all = false; break; }
    }
    if (all) hits.push({ file, why: [...why].slice(0, 6), quest, score: score + (file.kind === "phase" ? 0 : 1) });
  }
  return hits.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path)).slice(0, limit).map(({ score: _s, ...h }) => h);
}
