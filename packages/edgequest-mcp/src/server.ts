// EDGEquest as an MCP server over stdio: Cyberpunk 2077's quests in plain words, for AI assistants such
// as Claude Code and REDagent. Every tool is the twin of a part of the extension's UI.
//
//   edgequest-mcp [--bridge <REDbridge.exe or its folder>] [--game <Cyberpunk 2077 folder>] [--dotnet-root <dir>] [--cache <dir>]
//
// Without options (or with empty ones) it finds the game and REDbridge as the extension does, from the
// VS Code settings (edgequest.*, then redcode.*). Variables: EDGEQUEST_GAME_PATH, REDBRIDGE_EXE,
// DOTNET_ROOT, EDGEQUEST_CACHE. The bridge starts only when a tool needs it. stdout is the MCP channel;
// logs go to stderr.

import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  BridgeClient, buildIndex, defaultCacheDir, findQuests, isGameFolder, isIndexCurrent, loadIndex, nonEmpty, questMarkdown, questOf, readQuestFile, readScene, resolveBridge, resolveGame,
  sceneMarkdown, usedBy, vscodeUserSettings, type QuestIndex, type SettingsReader,
} from "../../../extensions/edgequest/src/core";

declare const __VERSION__: string;

// An empty option or variable counts as unset: a Claude Code plugin passes an unset optional setting
// as an empty string, which must not hide the VS Code settings behind it.
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? nonEmpty(process.argv[i + 1]) : undefined;
};
const env = (name: string) => nonEmpty(process.env[name]);
const log = (line: string) => process.stderr.write(`[edgequest-mcp] ${line}\n`);

const fromVsCode = vscodeUserSettings();
const settings: SettingsReader = (key) =>
  key === "edgequest.gamePath" ? arg("--game") ?? env("EDGEQUEST_GAME_PATH") ?? fromVsCode(key)
  : key === "edgequest.bridgePath" ? arg("--bridge") ?? env("REDBRIDGE_EXE") ?? fromVsCode(key)
  : key === "edgequest.dotnetRoot" ? arg("--dotnet-root") ?? env("DOTNET_ROOT") ?? fromVsCode(key)
  : fromVsCode(key);
const cacheDir = arg("--cache") ?? env("EDGEQUEST_CACHE") ?? defaultCacheDir();

let bridge: BridgeClient | undefined;
let starting: Promise<BridgeClient> | undefined;

async function getBridge(): Promise<BridgeClient> {
  if (bridge?.running) return bridge;
  if (starting) return starting;
  starting = (async () => {
    const game = await resolveGame(settings, {}, true);
    if (!game || !isGameFolder(game.path)) throw new Error("No Cyberpunk 2077 folder found. Pass --game, set EDGEQUEST_GAME_PATH, or set edgequest.gamePath or redcode.gamePath in VS Code.");
    const choice = resolveBridge(settings);
    if (!choice) throw new Error("REDbridge.exe not found. Pass --bridge, set REDBRIDGE_EXE, or set edgequest.bridgePath or redcode.bridgePath in VS Code. REDcode's Install REDbridge command fetches it.");
    log(`starting ${choice.exe} for ${game.path}`);
    const b = new BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
    b.on("log", (line: string) => log(`bridge | ${line}`));
    b.on("exit", () => (bridge = undefined));
    b.start();
    const info = await b.info();
    if (!info.gameLoaded) await b.load(game.path);
    bridge = b;
    return b;
  })().finally(() => (starting = undefined));
  return starting;
}

/** The cached index; built first when there is none (about 90 seconds, once per game version). */
async function index(): Promise<QuestIndex> {
  const cached = loadIndex(cacheDir);
  if (cached) return cached;
  log("no quest index yet: building it from the game");
  return buildIndex(await getBridge(), cacheDir, (m, d, t) => t !== undefined && d !== undefined && d % 500 === 0 && log(`${m} ${d}/${t}`));
}

const text = (v: unknown): CallToolResult => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const failure = (e: unknown): CallToolResult => ({ isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });

/** A file's WolvenKit JSON: a game path through the bridge, a CR2W file on disk through the bridge, or a .json file as it is. */
async function loadJson(source: { path?: string; file?: string }): Promise<{ json: unknown; title: string }> {
  if (source.file) {
    if (!fs.existsSync(source.file)) throw new Error(`No such file: ${source.file}`);
    if (source.file.toLowerCase().endsWith(".json")) return { json: JSON.parse(fs.readFileSync(source.file, "utf8")), title: path.basename(source.file) };
    const r = await (await getBridge()).fileToJson(source.file);
    return { json: JSON.parse(r.json ?? "null"), title: path.basename(source.file) };
  }
  if (!source.path) throw new Error("Give path (a game path) or file (a file on disk).");
  const r = await (await getBridge()).toJson(source.path);
  return { json: JSON.parse(r.json ?? "null"), title: source.path };
}

const Source = {
  path: z.string().optional().describe("A game path, such as base\\quest\\side_quests\\sq030\\phases\\sq030.questphase."),
  file: z.string().optional().describe("Or a file on disk: the CR2W file, or its WolvenKit .json."),
};

const server = new McpServer(
  { name: "edgequest", version: __VERSION__ },
  {
    instructions:
      "EDGEquest reads Cyberpunk 2077's quests in plain words. Start with quest_find (by quest title, file name, fact, journal entry, person or place) " +
      "to get a game path, then quest_describe for a quest or phase, and quest_scene for a dialogue scene's lines and choices. " +
      "A quest is a .quest file whose phase nodes play .questphase files; phases nest, and a phase's scene nodes play .scene files. " +
      "The game's own quests start from base\\quest\\cyberpunk2077.quest (the root) and ep1\\quest for Phantom Liberty.",
  },
);

server.registerTool(
  "quest_index",
  {
    description:
      "EDGEquest's quest index, built from the user's own game: every quest and phase with the facts, journal entries, scenes, phases and people or places it uses, and the journal's quest titles. " +
      "action 'status' says whether it exists and still matches the game; 'build' builds or rebuilds it (about 90 seconds, once per game version). quest_find builds it when missing.",
    inputSchema: { action: z.enum(["status", "build"]).default("status") },
  },
  async ({ action }) => {
    try {
      if (action === "build") {
        const idx = await buildIndex(await getBridge(), cacheDir);
        return text({ built: true, seconds: idx.seconds, files: idx.files.length, journalEntries: Object.keys(idx.journal).length, failed: idx.failed.slice(0, 20) });
      }
      const idx = loadIndex(cacheDir);
      if (!idx) return text({ exists: false, cache: cacheDir, hint: "Call quest_index with action 'build', or quest_find, which builds it." });
      const current = bridge?.running ? await isIndexCurrent(idx, bridge) : undefined;
      return text({ exists: true, builtAt: idx.builtAt, files: idx.files.length, journalEntries: Object.keys(idx.journal).length, matchesGame: current ?? "not checked (the bridge is not running)", cache: cacheDir });
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "quest_find",
  {
    description:
      "Find the game's quests and phases by words: a quest title (\"Pyramid Song\"), a file or folder name (sq030), a fact name, a journal entry's path or words, a scene, or a person or place by its NodeRef (judy). " +
      "Every word must match. Returns game paths with the quest each belongs to and why it matched; pass a path to quest_describe.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(200).default(25) },
  },
  async ({ query, limit }) => {
    try {
      const idx = await index();
      const hits = findQuests(idx, query, limit);
      if (!hits.length) return text(`Nothing matches "${query}". Try fewer words, a fact name, or part of a file name.`);
      return text(hits.map((h) => `- \`${h.file.path}\` (${h.file.kind}, ${h.file.nodes} nodes)${h.quest ? `, quest ${h.quest.title ? `"${h.quest.title}" ` : ""}\`${h.quest.path}\`` : ""}: ${h.why.join("; ")}`).join("\n"));
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "quest_describe",
  {
    description:
      "A .quest or .questphase in plain words: every step in reading order (wait until, if, set fact, journal, scene, phase, spawn and so on) with where it leads, " +
      "then the facts it sets and tests, its journal entries, the scenes and phases it plays, and the NodeRefs it uses. Also which quest it belongs to and which files play it, from the index when built.",
    inputSchema: { ...Source, limit: z.number().int().min(20).max(5000).default(400).describe("The most step lines to list.") },
  },
  async ({ path: p, file, limit }) => {
    try {
      const { json, title } = await loadJson({ path: p, file });
      const q = readQuestFile(json);
      let md = questMarkdown(title, q, limit);
      const idx = p ? loadIndex(cacheDir) : undefined;
      const entry = idx?.files.find((f) => f.path.toLowerCase() === p!.toLowerCase());
      if (idx && entry) {
        const quest = questOf(idx, entry);
        const parents = usedBy(idx, p!);
        const extra = [
          quest ? `Belongs to the journal quest ${quest.title ? `"${quest.title}" ` : ""}\`${quest.path}\`.` : "",
          parents.length ? `Played by: ${parents.slice(0, 10).map((f) => `\`${f.path}\``).join(", ")}${parents.length > 10 ? ` and ${parents.length - 10} more` : ""}.` : "",
        ].filter(Boolean);
        if (extra.length) md = md.replace(/\n\n/, `\n\n${extra.join(" ")}\n\n`);
      }
      return text(md);
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "quest_scene",
  {
    description:
      "A dialogue scene (.scene) in plain words: who is in it, its entry and exit points, then its steps in reading order with each line (speaker, to whom, text) and each choice (its options, conditions, and where each leads). " +
      "Text comes from the scene's own store (en-us where present).",
    inputSchema: { ...Source, limit: z.number().int().min(20).max(5000).default(600).describe("The most lines to list.") },
  },
  async ({ path: p, file, limit }) => {
    try {
      const { json, title } = await loadJson({ path: p, file });
      return text(sceneMarkdown(title, readScene(json), limit));
    } catch (e) {
      return failure(e);
    }
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  log(`${__VERSION__} ready (cache ${cacheDir})`);
  const stop = () => {
    bridge?.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdin.on("close", stop);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
