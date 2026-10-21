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

export const IndexVersion = 3;

/** The game's compiled map marker positions. */
const MappinsFile = "base\\worlds\\03_night_city\\_compiled\\default\\03_night_city.mappins";

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

export interface QuestIndex {
  version: number;
  key: string;
  builtAt: string;
  seconds: number;
  files: IndexedFile[];
  journal: Record<string, JournalInfo>;
  /** Map markers the game has a compiled position for: journal path -> [x, y, z]. */
  places: Record<string, [number, number, number]>;
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
export function readJournal(json: Json, into: Map<string, { kind: string; key?: string }>): void {
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
      if (!into.has(p) || key) into.set(p, { kind: String(d.$type).replace(/^gameJournal/, ""), key });
    }
    for (const c of d.entries ?? []) walk(c, p);
  };
  walk(root, "");
}

/** Builds the index from the game and writes it to the cache. */
export async function buildIndex(bridge: BridgeClient, cacheDir: string, progress: Progress = () => undefined): Promise<QuestIndex> {
  const t0 = Date.now();
  const failed: string[] = [];
  progress("Reading the game's file lists");
  const key = await gameKey(bridge);
  const paths = await listGameFiles(bridge, ".quest", ".questphase");
  const files: IndexedFile[] = [];
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    try {
      const r = await bridge.toJson(p);
      const q = readQuestFile(JSON.parse(r.json ?? "null"));
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
  const entries = new Map<string, { kind: string; key?: string }>();
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
  const places: Record<string, [number, number, number]> = {};
  try {
    // The game keys compiled marker positions by the journal path's Murmur3 hash.
    const byHash = new Map<number, string>();
    for (const p of Object.keys(journal)) if (/MapPin|Mappin/.test(journal[p].kind)) byHash.set(murmur3(p), p);
    const res = JSON.parse((await bridge.toJson(MappinsFile)).json ?? "{}").Data.RootChunk;
    for (const d of res.cookedData ?? []) {
      const p = byHash.get(Number(d.journalPathHash));
      if (p && d.position) places[p] = [d.position.X, d.position.Y, d.position.Z].map((n: number) => Math.round(n * 100) / 100) as [number, number, number];
    }
  } catch (e) {
    failed.push(`map markers: ${e instanceof Error ? e.message : String(e)}`);
  }

  const idx: QuestIndex = { version: IndexVersion, key, builtAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), files, journal, places, failed };
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
