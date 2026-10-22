// quest_check: a quest mod's files checked against each other and against the game, in plain words.
// The rules are the "What must agree across files" table on docs/design/formats.md, plus what the two
// studied mods did wrong. A mod comes as a WolvenKit project, a folder of extracted files, or a mod
// .archive with its .xl beside it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { BridgeClient } from "./bridgeClient";
import { summarize } from "./describe";
import { readQuestFile, value, type Json, type QuestGraph } from "./graph";
import { readJournal, worldRefs, type JournalRead, type QuestIndex } from "./questIndex";
import { readScene } from "./scene";
import { fnv1a64 } from "./write/wk";

export type Level = "error" | "warning" | "info";

export interface Finding {
  level: Level;
  /** A short stable code, such as "journal-missing". */
  code: string;
  message: string;
  /** The game path of the mod file it is about. */
  file?: string;
}

export interface ModFiles {
  /** Where the mod came from, in words. */
  source: string;
  /** Game path (backslashes, as the game writes it) -> file on disk. */
  files: Map<string, string>;
  /** The .xl files: their path and text. */
  xl: { file: string; text: string }[];
}

const key = (p: string) => p.toLowerCase().replace(/\//g, "\\");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * A mod from a folder: a WolvenKit project (with a .cpmodproj: files under source/archive, .xl under
 * source/resources), a folder of extracted files (game paths relative to it), or a game folder's
 * archive/pc/mod layout is not supported here (use the .archive).
 */
export function modFromFolder(dir: string): ModFiles {
  const project = fs.readdirSync(dir).some((n) => n.toLowerCase().endsWith(".cpmodproj"));
  const archiveDir = project ? path.join(dir, "source", "archive") : dir;
  const files = new Map<string, string>();
  const xl: ModFiles["xl"] = [];
  for (const f of fs.existsSync(archiveDir) ? walk(archiveDir) : []) {
    if (f.toLowerCase().endsWith(".xl")) continue;
    files.set(path.relative(archiveDir, f).replace(/\//g, "\\"), f);
  }
  const xlDirs = project ? [path.join(dir, "source", "resources")] : [dir];
  for (const d of xlDirs) for (const f of fs.existsSync(d) ? walk(d) : []) if (f.toLowerCase().endsWith(".xl")) xl.push({ file: f, text: fs.readFileSync(f, "utf8") });
  return { source: project ? `the WolvenKit project ${dir}` : `the folder ${dir}`, files, xl };
}

/** A mod from its .archive: its files extracted to a temporary folder, and the .xl files beside it whose name starts with the archive's. */
export async function modFromArchive(bridge: BridgeClient, archive: string): Promise<ModFiles> {
  const info = await bridge.openMod(archive);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgequest-check-"));
  const items = info.items.filter((i) => i.name && !/^\d+$/.test(i.name)).map((i) => ({ path: i.name, outFile: path.join(tmp, i.name) }));
  const result = await bridge.extractFromMod(archive, items);
  const files = new Map<string, string>();
  for (const i of items) if (fs.existsSync(i.outFile)) files.set(i.path, i.outFile);
  const dir = path.dirname(archive);
  const stem = path.basename(archive).replace(/\.archive$/i, "").toLowerCase();
  const xl = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".xl") && n.toLowerCase().startsWith(stem)).map((n) => ({ file: path.join(dir, n), text: fs.readFileSync(path.join(dir, n), "utf8") }));
  const unnamed = info.items.length - items.length;
  const mod: ModFiles = { source: `the mod archive ${archive}`, files, xl };
  if (result.failed.length || unnamed) (mod as ModFiles & { notes?: string[] }).notes = [...result.failed.map((f) => `could not extract ${f}`), ...(unnamed ? [`${unnamed} files have no known name (hash only) and were skipped`] : [])];
  return mod;
}

// ---- the .xl ------------------------------------------------------------------------------------

interface XlPhase { path?: string; parent?: string; input?: { node?: number[]; socket?: string }; connection?: { node?: number[]; socket?: string }; output?: { node?: number[]; socket?: string }; intercept?: boolean }

interface XlConfig {
  phases: (XlPhase & { file: string })[];
  journals: { path: string; file: string }[];
  /** kind (onscreens, subtitles, vomaps, lipmaps) -> language -> paths */
  localization: { kind: string; language: string; path: string; file: string }[];
  blocks: { path: string; file: string }[];
  scopes: Set<string>;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);

function readXl(mod: ModFiles, findings: Finding[]): XlConfig {
  const cfg: XlConfig = { phases: [], journals: [], localization: [], blocks: [], scopes: new Set() };
  for (const { file, text } of mod.xl) {
    let y: Json;
    try {
      y = parseYaml(text) ?? {};
    } catch (e) {
      findings.push({ level: "error", code: "xl-invalid", message: `${path.basename(file)} is not valid YAML, so ArchiveXL ignores all of it: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` });
      continue;
    }
    for (const p of y?.quest?.phases ?? []) cfg.phases.push({ ...p, file });
    for (const j of list(y?.journal)) cfg.journals.push({ path: j, file });
    for (const kind of ["onscreens", "subtitles", "vomaps", "lipmaps"]) {
      const m = y?.localization?.[kind];
      if (m && typeof m === "object") for (const [language, v] of Object.entries(m)) for (const p of list(v)) cfg.localization.push({ kind, language, path: p, file });
    }
    for (const b of list(y?.streaming?.blocks)) cfg.blocks.push({ path: b, file });
    for (const k of Object.keys(y?.resource?.scope ?? {})) cfg.scopes.add(k.toLowerCase());
  }
  return cfg;
}

// ---- the check ---------------------------------------------------------------------------------

/** The scope ArchiveXL ships in QuestBaseScope.xl: the base game's and Phantom Liberty's root quests. */
const BaseScopes = new Set(["cyberpunk2077.quest"]);

export interface CheckResult {
  findings: Finding[];
  /** What was read, in counts. */
  read: Record<string, number>;
}

/**
 * Checks a quest mod. `index` (the game's quest index) adds the game-side checks: journal paths and
 * game facts. Without the bridge, only the mod's own .json files and the .xl are read.
 */
export async function checkQuestMod(mod: ModFiles, bridge: BridgeClient | undefined, index: QuestIndex | undefined): Promise<CheckResult> {
  const findings: Finding[] = [];
  const add = (level: Level, code: string, message: string, file?: string) => findings.push({ level, code, message, file });
  for (const n of (mod as ModFiles & { notes?: string[] }).notes ?? []) add("info", "read", n);
  const has = (p: string) => [...mod.files.keys()].some((k) => key(k) === key(p));
  const byExt = (ext: string) => [...mod.files.keys()].filter((k) => k.toLowerCase().endsWith(ext));
  const jsonCache = new Map<string, Json>();
  const json = async (gamePath: string): Promise<Json> => {
    if (jsonCache.has(gamePath)) return jsonCache.get(gamePath);
    const file = mod.files.get(gamePath)!;
    let j: Json;
    const text = fs.readFileSync(file);
    // a WolvenKit JSON export starts with "{"; a CR2W file starts with "CR2W"
    if (text.subarray(0, 4).toString("latin1") === "CR2W") {
      if (!bridge) throw new Error("reading CR2W files needs REDbridge");
      j = JSON.parse((await bridge.fileToJson(file)).json ?? "null");
    } else j = JSON.parse(text.toString("utf8"));
    jsonCache.set(gamePath, j);
    return j;
  };
  const gameHas = async (p: string): Promise<boolean | undefined> => {
    if (!bridge) return undefined;
    const name = p.slice(p.lastIndexOf("\\") + 1);
    const r = await bridge.search(name, 200);
    return r.items.some((i) => key(i.name) === key(p));
  };
  const exists = async (p: string) => has(p) || (await gameHas(p)) === true;

  const phases = byExt(".questphase"), quests = byExt(".quest"), scenes = byExt(".scene"), journals = byExt(".journal"), blocks = byExt(".streamingblock"), jsons = byExt(".json");
  const read: Record<string, number> = { files: mod.files.size, xl: mod.xl.length, quests: quests.length, phases: phases.length, scenes: scenes.length, journals: journals.length };
  if (!mod.files.size) add("error", "empty", `No files found in ${mod.source}.`);
  if (!mod.xl.length) add("warning", "xl-none", "No .xl file was found, so ArchiveXL loads nothing from this mod: no new phases, journal entries, texts or world data. A quest mod needs one beside its .archive (in a WolvenKit project, under source/resources).");
  const xl = readXl(mod, findings);

  // 1. Every .xl entry points at a file in the mod, and the files that need an entry have one.
  for (const j of xl.journals) if (!has(j.path)) add("error", "xl-file-missing", `The .xl loads the journal ${j.path}, which is not in the mod.`, j.path);
  for (const l of xl.localization) if (!has(l.path)) add("error", "xl-file-missing", `The .xl loads ${l.kind} for ${l.language} from ${l.path}, which is not in the mod.`, l.path);
  for (const b of xl.blocks) if (!has(b.path)) add("error", "xl-file-missing", `The .xl loads the world block ${b.path}, which is not in the mod.`, b.path);
  for (const j of journals) if (!xl.journals.some((x) => key(x.path) === key(j))) add("error", "journal-not-loaded", `${j} is in the mod but no .xl lists it under journal:, so the game never sees its entries.`, j);
  for (const b of blocks) if (!xl.blocks.some((x) => key(x.path) === key(b))) add("error", "block-not-loaded", `${b} is in the mod but no .xl lists it under streaming: blocks:, so its places and people do not exist in the game.`, b);

  // 2. Files that replace the game's own (same path). Localization files are the worst case.
  if (bridge) {
    for (const f of mod.files.keys()) {
      if (!/\.(json|questphase|quest|scene|journal)$/i.test(f)) continue;
      if (await gameHas(f)) {
        const loc = /\\localization\\/i.test(f);
        add(loc ? "error" : "warning", "replaces-game-file",
          loc
            ? `${f} replaces the game's own file of that name. Every other mod that adds to it is lost, and only this language changes. Put new entries in the mod's own file and list it in the .xl under localization: instead.`
            : `${f} replaces the game's own file. That conflicts with any other mod touching it and with game updates. Prefer adding a new file through ArchiveXL (quest: phases: for a phase).`, f);
      }
    }
  }

  // 3. Phases: how each one starts.
  const played = new Set<string>();
  const phaseFiles = new Map<string, { graph: QuestGraph; handles: Map<string, Json> }>();
  for (const p of [...quests, ...phases]) {
    try {
      const q = readQuestFile(await json(p));
      phaseFiles.set(p, { graph: q.graph, handles: q.handles });
      for (const c of summarize(q.graph, q.handles).phases) played.add(key(c));
    } catch (e) {
      add("error", "unreadable", `${p} could not be read: ${e instanceof Error ? e.message : String(e)}`, p);
    }
  }
  for (const x of xl.phases) {
    const p = String(x.path ?? "");
    const parent = String(x.parent ?? "");
    if (!p) { add("error", "xl-phase", `A quest: phases: entry in ${path.basename(x.file)} has no path.`); continue; }
    if (!has(p)) add("error", "xl-phase-missing", `The .xl adds the phase ${p}, which is not in the mod.`, p);
    else played.add(key(p));
    if (!parent) add("error", "xl-phase", `The phase ${p} has no parent in the .xl, so ArchiveXL does not know where to add it.`, p);
    else if (!BaseScopes.has(parent.toLowerCase()) && !xl.scopes.has(parent.toLowerCase()) && !(await exists(parent))) add("error", "xl-parent-missing", `The phase ${p} is added to ${parent}, which is not in the game or the mod. ArchiveXL skips it.`, p);
    else if (BaseScopes.has(parent.toLowerCase()) || /\.quest$/i.test(parent)) add("info", "starts", `${p} starts once per save from ${parent} (also in existing saves).`, p);
    if (x.input?.node || x.connection?.node || x.output?.node) add("info", "hooks", `${p} hooks into ${parent}${x.intercept ? ", intercepting the link" : ""}. Another mod hooking the same place can conflict. The node ids are not checked yet.`, p);
  }
  for (const p of phases) {
    if (played.has(key(p))) continue;
    if (index?.files.some((f) => f.phases.some((c) => key(c) === key(p)))) continue;
    add("warning", "never-started", `Nothing in this mod or the game plays ${p}: no .xl quest: phases: entry and no phase node names it. It never runs unless another mod starts it.`, p);
  }

  // 4. Child phases and scenes a phase plays exist; a child phase's inputs and outputs match the phase node's sockets.
  for (const [p, q] of phaseFiles) {
    const visit = async (g: QuestGraph) => {
      for (const n of g.nodes) {
        const res = value(n.data.phaseResource);
        const scene = value(n.data.sceneFile);
        for (const target of [res, scene].filter((t): t is string => typeof t === "string" && !!t)) {
          if (!(await exists(target))) add("error", "missing-file", `${p} node ${n.id} plays ${target}, which is not in the mod${bridge ? " or the game" : ""}.`, p);
        }
        if (typeof res === "string" && has(res)) {
          const child = phaseFiles.get([...phaseFiles.keys()].find((k) => key(k) === key(res))!);
          if (child) {
            const ins = child.graph.nodes.filter((c) => c.type === "questInputNodeDefinition").map((c) => String(value(c.data.socketName)));
            const outs = child.graph.nodes.filter((c) => c.type === "questOutputNodeDefinition").map((c) => String(value(c.data.socketName)));
            // only the sockets something is connected to matter
            const nodeIns = [...new Set(g.edges.filter((e) => e.to.node === n.id).map((e) => e.to.socket))];
            const nodeOuts = [...new Set(g.edges.filter((e) => e.from.node === n.id).map((e) => e.from.socket))];
            for (const s of nodeIns) if (!ins.includes(s)) add("error", "socket-mismatch", `${p} node ${n.id} enters ${res} through "${s}", but that phase has no input named "${s}" (it has ${ins.join(", ") || "none"}).`, p);
            for (const s of nodeOuts) if (!outs.includes(s)) add("warning", "socket-mismatch", `${p} node ${n.id} waits for ${res} to leave through "${s}", but that phase has no output named "${s}" (it has ${outs.join(", ") || "none"}).`, p);
          }
        }
        if (n.inner) await visit(n.inner);
      }
    };
    await visit(q.graph);
  }

  // 4b. Trigger areas a phase waits for V in that live in a game quest's prefab: they exist only while a phase
  // lists that prefab (in-game test 2026-10-22). Checked against the index's areas.
  if (index?.areas) {
    const listed = new Set<string>();
    const waits: [string, string][] = [];
    for (const p of phaseFiles.keys()) {
      const w = worldRefs(await json(p));
      w.prefabs.forEach((x) => listed.add(x));
      for (const t of w.triggers) waits.push([p, t]);
    }
    for (const [p, t] of waits) {
      const a = index.areas[t];
      if (a && !a.prefabs.some((x) => listed.has(x))) add("warning", "area-not-loaded", `${p} waits for V inside ${t}, which is in the game's world prefab ${a.prefabs.join(", ")}. That prefab exists only while a phase lists it, and no phase in this mod does, so V may never arrive. List it in the phase's phasePrefabs.`, p);
    }
  }

  // 5. The mod's journal: its root, its entries and their texts.
  const modJournal = new Map<string, JournalRead>();
  for (const j of journals) {
    try {
      const jj = await json(j);
      const rootId = jj?.Data?.RootChunk?.entry?.Data?.id;
      if (rootId !== undefined && String(rootId) !== "") add("error", "journal-root", `${j} has root id "${rootId}"; ArchiveXL merges a journal only when its root id equals the game's, which is empty.`, j);
      readJournal(jj, modJournal);
    } catch (e) {
      add("error", "unreadable", `${j} could not be read: ${e instanceof Error ? e.message : String(e)}`, j);
    }
  }
  read.journalEntries = modJournal.size;
  const unplaced = [...modJournal].filter(([, e]) => e.unplaced).map(([p]) => p);
  if (unplaced.length) add("warning", "marker-no-node", `${unplaced.length} map marker${unplaced.length === 1 ? " has" : "s have"} no world node (${unplaced.slice(0, 3).join(", ")}${unplaced.length > 3 ? "…" : ""}). The game does not ask ArchiveXL where such a marker is, so it shows at the world's origin (0, 0, 0), far from where it should be. Put it on a world node: a game map marker's NodeRef, with an offset if needed.`);

  // the mod's texts: onscreens and subtitles files listed in the .xl, or any localization json in the mod
  const onscreens = new Map<string, { file: string; primary: string; secondary: string }>();
  const subtitles = new Map<string, string>();
  const subtitleFiles = new Set<string>();
  const subtitleMaps = new Map<string, string[]>(); // map file -> the subtitle files it names
  let onscreenEntries = 0;
  for (const f of jsons) {
    try {
      const d = (await json(f))?.Data?.RootChunk?.root?.Data;
      if (d?.$type === "localizationPersistenceSubtitleEntries") subtitleFiles.add(key(f));
      if (d?.$type === "localizationPersistenceSubtitleMap") subtitleMaps.set(f, (d.entries ?? []).map((e: Json) => String(value(e.subtitleFile) ?? "")).filter((p: string) => p));
      if (d?.$type === "localizationPersistenceOnScreenEntries") for (const e of d.entries ?? []) {
        const primary = String(e.primaryKey ?? "0"), secondary = String(e.secondaryKey ?? "");
        const entry = { file: f, primary, secondary };
        onscreenEntries++;
        // Primary key 0: ArchiveXL makes the key from the secondary key's FNV1a64 hash.
        onscreens.set(`LocKey#${primary === "0" && secondary ? fnv1a64(secondary) : primary}`, entry);
        if (secondary) onscreens.set(secondary, entry);
      } else if (d?.$type === "localizationPersistenceSubtitleEntries") for (const e of d.entries ?? []) subtitles.set(String(e.stringId), f);
    } catch {
      // not a localization file
    }
  }
  read.onscreens = onscreenEntries;
  read.subtitles = subtitles.size;

  // subtitles: ArchiveXL loads each .xl subtitles entry as a map of subtitle files, the way the game's
  // own subtitles.json is; a file of lines listed there directly fails to load (in-game test 2026-10-22).
  for (const l of xl.localization.filter((x) => x.kind === "subtitles" && has(x.path))) {
    if (subtitleFiles.has(key(l.path))) add("error", "subtitles-not-map", `The .xl lists ${l.path} under subtitles, but it is a file of lines. ArchiveXL expects a subtitle map there (localizationPersistenceSubtitleMap) naming the files of lines, so it fails to load and the lines show no text.`, l.path);
  }
  const listed = new Set<string>();
  for (const [m, targets] of subtitleMaps) {
    for (const t of targets) {
      listed.add(key(t));
      if (!(await exists(t))) add("error", "missing-file", `The subtitle map ${m} names ${t}, which is not in the mod${bridge ? " or the game" : ""}.`, m);
    }
    if (!xl.localization.some((x) => x.kind === "subtitles" && key(x.path) === key(m))) add("warning", "subtitles-not-loaded", `${m} is a subtitle map, but no .xl lists it under localization: subtitles:, so its lines show no text.`, m);
  }
  for (const f of subtitleFiles) if (!listed.has(f) && !xl.localization.some((x) => x.kind === "subtitles" && key(x.path) === f)) add("warning", "subtitles-not-loaded", `${[...mod.files.keys()].find((k) => key(k) === f)} has subtitle lines, but no subtitle map names it, so they show no text.`);

  // texts a mod journal entry uses: in the mod's onscreens, or the game's
  const missingKeys: string[] = [];
  const toResolve: string[] = [];
  for (const [p, e] of modJournal) if (e.key && !onscreens.has(e.key)) toResolve.push(e.key);
  if (toResolve.length && bridge) {
    const got = await bridge.locGet([...new Set(toResolve)], "en-us").catch(() => ({} as Record<string, unknown>));
    for (const k of new Set(toResolve)) if (!got[k]) missingKeys.push(k);
  }
  if (missingKeys.length) add("error", "text-missing", `${missingKeys.length} journal text key${missingKeys.length === 1 ? "" : "s"} have no text in the mod's onscreens or the game: ${missingKeys.slice(0, 8).join(", ")}${missingKeys.length > 8 ? "…" : ""}. The journal shows them blank.`);

  // onscreens primary keys picked by hand can collide with the game's
  if (bridge && onscreens.size) {
    const primaries = [...new Set([...onscreens.values()].map((e) => e.primary).filter((k) => k !== "0"))];
    const got = await bridge.locGet(primaries.map((k) => `LocKey#${k}`), "en-us").catch(() => ({} as Record<string, { source?: string } | null>));
    const clashes = primaries.filter((k) => { const g = (got as Record<string, { source?: string } | null>)[`LocKey#${k}`]; return g && g.source !== "project"; });
    if (clashes.length) add("warning", "key-clash", `${clashes.length} onscreens primary key${clashes.length === 1 ? "" : "s"} are also game keys (${clashes.slice(0, 6).join(", ")}${clashes.length > 6 ? "…" : ""}), so one text hides the other. Use 0 and a unique secondary key, and let ArchiveXL make the number.`);
    const small = primaries.filter((k) => Number(k) > 0 && Number(k) < 10_000_000);
    if (small.length && !clashes.length) add("info", "key-picked", `${small.length} onscreens primary keys look picked by hand (${small.slice(0, 4).join(", ")}…). Another mod may pick the same; a unique secondary key is safer.`);
  }

  // 6. Journal paths the phases and scenes use exist in the mod's journal or the game's.
  const used = new Map<string, string>(); // journal path -> first file using it
  const facts = new Map<string, { set: boolean; tested: boolean; file: string }>();
  for (const [p, q] of phaseFiles) {
    const s = summarize(q.graph, q.handles);
    for (const j of s.journal) if (j.path && !used.has(j.path)) used.set(j.path, p);
    for (const f of s.facts) {
      const e = facts.get(f.name) ?? { set: false, tested: false, file: p };
      e.set ||= f.sets.length > 0;
      e.tested ||= f.tests.length > 0;
      facts.set(f.name, e);
    }
  }
  for (const sc of scenes) {
    try {
      const raw = await json(sc);
      const scene = readScene(raw);
      read.lines = (read.lines ?? 0) + scene.lines.length;
      // lines and options without a subtitle entry in the mod (game lines are not checked until REDbridge has subtitles in loc.*)
      const noSub = [...scene.lines.map((l) => l.stringId), ...scene.options.map((o) => o.stringId)].filter((id) => id && id !== "0" && !subtitles.has(id));
      if (noSub.length) add("info", "subtitle-unknown", `${sc}: ${noSub.length} line${noSub.length === 1 ? "" : "s"} or options have no subtitle entry in this mod. Fine when they reuse game lines; a new line without one shows no subtitle. (Game subtitles are not checked yet.)`, sc);
      // leftovers from a copied scene: embedded texts no line or option uses
      const root = raw?.Data?.RootChunk ?? raw;
      const usedIds = new Set([...scene.lines.map((l) => l.stringId), ...scene.options.map((o) => o.stringId)]);
      const stored = new Set<string>((root.locStore?.vdEntries ?? []).map((d: Json) => String(d.locstringId?.ruid)));
      const leftover = [...stored].filter((id) => !usedIds.has(id)).length;
      if (leftover) add("warning", "scene-leftovers", `${sc} keeps ${leftover} embedded text${leftover === 1 ? "" : "s"} that no line or option uses, probably left from a copied game scene. Harmless in the game, but it ships game text in the mod.`, sc);
      // the game finds a line or option by its id, which is its place in the list: line k is k*256+1, option k is k*256+2
      const store = root.screenplayStore ?? {};
      const misplaced = [
        ...(store.lines ?? []).filter((l: Json, k: number) => l?.itemId?.id !== k * 256 + 1),
        ...(store.options ?? []).filter((o: Json, k: number) => o?.itemId?.id !== k * 256 + 2),
      ].length;
      if (misplaced) add("error", "scene-item-ids", `${sc}: ${misplaced} line${misplaced === 1 ? "" : "s"} or options have an id that is not their place in the list (line k is k*256+1, option k is k*256+2). The game finds them by that id: choices show no text and choosing one can crash the game.`, sc);
      const optionIds = new Set((store.options ?? []).map((o: Json) => o?.itemId?.id));
      const missing = (root.sceneGraph?.Data?.graph ?? []).flatMap((h: Json) => (h?.Data?.$type === "scnChoiceNode" ? h.Data.options ?? [] : [])).filter((o: Json) => !optionIds.has(o?.screenplayOptionId?.id)).length;
      if (missing) add("error", "choice-option-missing", `${sc}: ${missing} choice option${missing === 1 ? "" : "s"} name a screenplay option the scene does not have. The choice shows no text and choosing it can crash the game.`, sc);
      // journal paths and facts used by the scene's own quest nodes
      for (const st of scene.steps) {
        for (const j of st.info?.journal ?? []) if (j.path && !used.has(j.path)) used.set(j.path, sc);
        for (const f of st.info?.facts ?? []) {
          const e = facts.get(f.name) ?? { set: false, tested: false, file: sc };
          e.set ||= !!f.set;
          e.tested ||= !!f.test;
          facts.set(f.name, e);
        }
      }
    } catch (e) {
      add("error", "unreadable", `${sc} could not be read: ${e instanceof Error ? e.message : String(e)}`, sc);
    }
  }
  let missingJournal = 0;
  for (const [j, file] of used) {
    if (modJournal.has(j)) continue;
    if (index) {
      if (!index.journal[j]) {
        missingJournal++;
        if (missingJournal <= 10) add("error", "journal-missing", `${file} uses the journal entry ${j}, which is in neither this mod's journal nor the game's. The node does nothing.`, file);
      }
    }
  }
  if (missingJournal > 10) add("error", "journal-missing", `${missingJournal - 10} more journal entries are missing.`);
  if (!index && used.size) add("info", "no-index", "Journal paths and facts were checked against the mod only: build EDGEquest's quest index to check them against the game too.");

  // 7. Facts: the game's own facts that the mod sets, and facts tested but never set.
  if (index) {
    const gameSets = new Set<string>(), gameUses = new Set<string>();
    for (const f of index.files) {
      for (const n of f.factsSet) gameSets.add(n);
      for (const n of [...f.factsSet, ...f.factsTested]) gameUses.add(n);
    }
    const writesGame = [...facts.entries()].filter(([n, e]) => e.set && gameUses.has(n)).map(([n]) => n);
    if (writesGame.length) add("warning", "writes-game-fact", `The mod sets ${writesGame.length} of the game's own fact${writesGame.length === 1 ? "" : "s"}: ${writesGame.join(", ")}. That changes the base game's story and stays in the save, also after the mod is removed.`);
    const neverSet = [...facts.entries()].filter(([n, e]) => e.tested && !e.set && !gameSets.has(n)).map(([n]) => n);
    if (neverSet.length) add("info", "fact-never-set", `${neverSet.length} fact${neverSet.length === 1 ? " is" : "s are"} tested but set by neither this mod nor the game's quest and phase files: ${neverSet.join(", ")}. A game scene, a script or another mod may set ${neverSet.length === 1 ? "it" : "them"} (scenes and scripts are not searched yet); if nothing does, the wait never ends.`);
  }
  read.facts = facts.size;

  return { findings: findings.sort((a, b) => order(a.level) - order(b.level)), read };
}

const order = (l: Level) => (l === "error" ? 0 : l === "warning" ? 1 : 2);

/** Findings as Markdown. */
export function checkMarkdown(title: string, r: CheckResult): string {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of r.findings) counts[f.level]++;
  const out = [`# Check: ${title}`, "", `Read ${Object.entries(r.read).map(([k, v]) => `${v} ${k}`).join(", ")}.`, `${counts.error} error${counts.error === 1 ? "" : "s"}, ${counts.warning} warning${counts.warning === 1 ? "" : "s"}, ${counts.info} note${counts.info === 1 ? "" : "s"}.`, ""];
  for (const f of r.findings) out.push(`- **${f.level}** (${f.code}) ${f.message}`);
  if (!r.findings.length) out.push("No problems found.");
  return out.join("\n");
}
