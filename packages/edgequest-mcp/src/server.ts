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
  BridgeClient, buildIndex, checklistMarkdown, checkMarkdown, checkQuestMod, modFromArchive, modFromFolder, defaultCacheDir, findQuests, isGameFolder, isIndexCurrent, loadIndex, nonEmpty, questMarkdown, questOf, readQuestFile, readScene, resolveBridge, resolveGame,
  assignVoiceIds, edgewaveLines, hasPrompt, readStory, readVoiceRecord, sceneMarkdown, storyChecklist, storyLines, storyboard, storyboardMarkdown, takeStatus, usedBy,
  voiceArchiveDir, voiceFile, vscodeUserSettings, addBeat, beatNameFor, convertToBeats, deleteBeat, isProject, makeQuest, optionPath, renameObjective, setChoiceGo, setOption, setLineVoice, setPath, setThen,
  setTodoDone, storyTemplate, insertItem, moveItem, removeItem, addScene, type QuestIndex, type SettingsReader,
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
      "then the facts it sets and tests, its journal entries, the scenes and phases it plays, and the NodeRefs it uses. Also which quest it belongs to and which files play it, from the index when built. " +
      "For a story file (file: <id>.quest.yaml), its beats instead: the Storyboard in words, each beat with its objective and steps and where it goes on to, with the choice that leads there.",
    inputSchema: { ...Source, limit: z.number().int().min(20).max(5000).default(400).describe("The most step lines to list.") },
  },
  async ({ path: p, file, limit }) => {
    try {
      if (file?.toLowerCase().endsWith(".quest.yaml")) {
        const read = readStory(fs.readFileSync(file, "utf8"));
        if (!read.story) return text(`The story file has problems:\n${read.problems.map((x) => `- ${x.line ? `line ${x.line}, ` : ""}${x.at}: ${x.message}`).join("\n")}`);
        const list = storyChecklist(fs.readFileSync(file, "utf8"), path.dirname(file), cacheDir).items;
        return text(`# ${read.story.title}\n\n${storyboardMarkdown(read.story, storyboard(read.story, list))}`);
      }
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

server.registerTool(
  "quest_check",
  {
    description:
      "Check a quest mod's files against each other and against the game, in plain words: the .xl entries (phases, journal, texts, world blocks) and the files they need, " +
      "how each phase starts, child phases' sockets, files that replace the game's own, journal entries and their texts, onscreens keys that clash with the game's, " +
      "scene lines without subtitles, leftovers from a copied scene, and the game's own facts the mod sets. Give archive (a mod .archive with its .xl beside it) or folder " +
      "(a WolvenKit project, or a folder of extracted files laid out by game path). Uses the quest index for the game-side checks.",
    inputSchema: {
      archive: z.string().optional().describe("A mod .archive, such as <game>\\archive\\pc\\mod\\MyQuest.archive; its .xl files beside it are read too."),
      folder: z.string().optional().describe("Or a WolvenKit project folder (with its .cpmodproj), or a folder of extracted files."),
    },
  },
  async ({ archive, folder }) => {
    try {
      if (!archive && !folder) throw new Error("Give archive (a mod .archive) or folder (a WolvenKit project or extracted files).");
      const target = (archive ?? folder)!;
      if (!fs.existsSync(target)) throw new Error(`No such ${archive ? "file" : "folder"}: ${target}`);
      const b = await getBridge();
      const mod = archive ? await modFromArchive(b, archive) : modFromFolder(folder!);
      const result = await checkQuestMod(mod, b, await index());
      return text(checkMarkdown(path.basename(target), result));
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "quest_checklist",
  {
    description:
      "What is left for the modder in a quest made from a story file (<id>.quest.yaml): its checklist. Where the quest uses a stand-in (a line shown as text with no voice, " +
      "the template's description), EDGEquest puts an item on the list with the EDGE tool that can do it; items written under todo: in the story file are listed too. " +
      "To add an item, write it under todo: in the story file (- Decide what the reward is); to tick one, give it done: true. Making the quest keeps the found items up to date " +
      "in the file. Open items never stop the quest from playing. Give story (a .quest.yaml) or project (a WolvenKit project: every story file at its top).",
    inputSchema: {
      story: z.string().optional().describe("A story file, <project>\\<id>.quest.yaml."),
      project: z.string().optional().describe("Or a WolvenKit project folder: lists the checklist of every story file at its top."),
    },
  },
  async ({ story, project }) => {
    try {
      if (!story && !project) throw new Error("Give story (a .quest.yaml) or project (a WolvenKit project folder).");
      const files = story ? [story] : fs.readdirSync(project!).filter((n) => n.toLowerCase().endsWith(".quest.yaml")).map((n) => path.join(project!, n));
      if (!files.length) return text(`No story files (*.quest.yaml) at the top of ${project}.`);
      const parts: string[] = [];
      for (const f of files) {
        if (!fs.existsSync(f)) throw new Error(`No such file: ${f}`);
        const c = storyChecklist(fs.readFileSync(f, "utf8"), path.dirname(f), cacheDir);
        parts.push(`## ${path.basename(f)}\n\n${checklistMarkdown(c.items)}` +
          (c.current ? "" : `\n\nThe story file has ${c.problems.length} problem(s), so the stand-ins in it were not looked for: ${c.problems.slice(0, 5).map((p) => `${p.at}: ${p.message}`).join(" ")}`));
      }
      return text(parts.join("\n\n"));
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "quest_voice",
  {
    description:
      "A story file's spoken lines, each with how it is spoken (voice: direction, and say with ElevenLabs v3 [tags]) and its take's status from EDGEwave's voice.json: none, made, or stale (the line changed since). " +
      "Gives the lines in the shape EDGEwave's voice_lines takes, with the project, quest and archiveDir to pass it; voice_lines with redo and one line regenerates that line. " +
      "A line's id is stable only once it has a voice id: prepare: true writes one into every line of the story file first (comments kept). Make the quest after voicing so the checklist updates.",
    inputSchema: {
      story: z.string().describe("A story file, <project>\\<id>.quest.yaml."),
      scene: z.string().optional().describe("Only this scene's lines."),
      prepare: z.boolean().default(false).describe("Write a voice id into every line that has none, so takes stay on their lines."),
    },
  },
  async ({ story: file, scene, prepare }) => {
    try {
      let src = fs.readFileSync(file, "utf8");
      if (prepare) {
        const ids = assignVoiceIds(src, true);
        if (ids.added) { src = ids.text; fs.writeFileSync(file, src, "utf8"); }
      }
      const read = readStory(src);
      if (!read.story) return text(`The story file has problems:\n${read.problems.map((x) => `- ${x.line ? `line ${x.line}, ` : ""}${x.at}: ${x.message}`).join("\n")}`);
      const project = path.dirname(file);
      const record = readVoiceRecord(project, read.story.id);
      let lines = storyLines(read.story);
      if (scene) {
        if (!read.story.scenes.has(scene)) throw new Error(`No scene "${scene}" in the story. Scenes: ${[...read.story.scenes.keys()].join(", ")}.`);
        lines = lines.filter((l) => l.scene === scene);
      }
      const status = lines.map((l) => takeStatus(l, record));
      return text({
        quest: read.story.id,
        project,
        archiveDir: voiceArchiveDir(read.story),
        voiceFile: record ? voiceFile(project, read.story.id) : "none yet",
        summary: `${lines.length} lines: ${status.filter((s) => s === "made").length} with a current take, ${status.filter((s) => s === "stale").length} changed since their take, ${status.filter((s) => s === "none").length} with none; ${lines.filter((l) => !hasPrompt(l)).length} without a voice prompt; ${lines.filter((l) => !l.voice?.id).length} without a stable id.`,
        lines: edgewaveLines(lines).map((l, k) => ({ ...l, status: status[k], stable: !!lines[k].voice?.id, path: lines[k].path })),
      });
    } catch (e) {
      return failure(e);
    }
  },
);

/** A story file after a change: its problems with their lines, its beats in words, what is left to do. */
function storySummary(file: string): string {
  const src = fs.readFileSync(file, "utf8");
  const read = readStory(src);
  const list = storyChecklist(src, path.dirname(file), cacheDir);
  const open = list.items.filter((i) => !i.done);
  const parts = [`Story file: ${file}`];
  if (!read.story) parts.push(`${read.problems.length} problem(s); fix them, the quest cannot be made until then:\n${read.problems.map((x) => `- ${x.line ? `line ${x.line}, ` : ""}${x.at}: ${x.message}`).join("\n")}`);
  else parts.push(`# ${read.story.title}\n\n${storyboardMarkdown(read.story, storyboard(read.story, list.items))}`);
  parts.push(open.length ? `Open on the checklist (${open.length}):\n${open.map((i) => `- ${i.do}${i.tool ? ` (${i.tool})` : ""}`).join("\n")}` : "The checklist has nothing open.");
  return parts.join("\n\n");
}

/** Makes a story's game files and says what happened. */
async function makeStory(file: string): Promise<string> {
  const r = await makeQuest(path.dirname(file), file, await getBridge(), { index: loadIndex(cacheDir), cacheDir });
  const lines = [
    r.problems.length ? `Not made: ${r.problems.length} problem(s):\n${r.problems.map((x) => `- ${x.line ? `line ${x.line}, ` : ""}${x.at}: ${x.message}`).join("\n")}` : `Made: ${r.files.map((f) => `${f.file} (${f.result})`).join(", ")}.`,
    ...r.findings.filter((f) => f.level !== "info").map((f) => `- quest_check ${f.level}: ${f.message}`),
    r.storyUpdated ? "The story file was updated (voice ids, checklist)." : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const StoryFormat =
  "A story file (<project>\\<id>.quest.yaml) holds: quest (title), id, author, type (side or minor), description, places (name: { marker: <a game map marker's journal path>, area: \"#<trigger area>\" }), " +
  "beats (name: { objective, marker?, steps: [ { arrive: <place> } | { wait: <seconds> } | { scene: <name> } | { set: <fact> } | { music: <music cue event> } | { sound: <sound event> } | done | failed ], next? }), " +
  "scenes (name: [ { V: <line>, voice?: { direction, say } } | { choice: { <option text>: [ ...items, { go: <beat> } ] | { main?: yes|no, lifepath?: corpo|nomad|streetkid, check?: { body|intelligence|reflexes|tech|cool: easy|medium|hard|impossible }, pay?: <eddies>|<difficulty>, then: [ ...items ] } } } | { set: <fact> } | { sound: <sound event> } ]) and todo (the checklist). " +
  "Beats run in order (next: <beat> goes elsewhere, next: none stops there); a choice's go: sends the quest to another beat; done or failed, last in a beat, ends the quest. An option that goes to a beat or sets a fact shows yellow, as the game marks options that move the story on; main: says otherwise. lifepath (only that lifepath sees it), check (locked below the level) and pay (taken on choosing) put the game's blue tag in front of it, one per option, and every choice keeps one option open to all. A line's voice says how it is spoken: direction in plain words, say with ElevenLabs v3 tags ([softly], [sighs]). " +
  "music starts or stops one of the game's music cues (mus_<quest>_..._START, then its _STOP); sound plays a game sound event on V, or a custom sound made with EDGEwave (edgewave_<name>). EDGEwave's MCP tools sound_events and sound_custom find and make them; a name that is neither the game's nor the project's gets a checklist item.";

server.registerTool(
  "quest_new",
  {
    description:
      "Starts a new quest in a WolvenKit project: writes its story file (<project>\\<id>.quest.yaml), from EDGEquest's template (a place, a scene with a choice, two endings) or from the text you give, " +
      "and returns it with its beats, its problems and what is left on its checklist. Then change it with quest_edit, or write the file directly, and make its game files with quest_make. " + StoryFormat,
    inputSchema: {
      project: z.string().describe("The WolvenKit project folder (the one holding its .cpmodproj)."),
      title: z.string().describe("The quest's title, as the journal shows it."),
      id: z.string().optional().describe("Lower case letters, digits and _: names its files and starts its facts. Default: from the title."),
      author: z.string().describe("The modder's name, lower case: the files go in mod\\<author>\\<id>."),
      text: z.string().optional().describe("The whole story file to write instead of the template, for a quest written from a description."),
      make: z.boolean().default(false).describe("Make the game files right away."),
    },
  },
  async ({ project, title, id, author, text: given, make }) => {
    try {
      if (!isProject(project)) throw new Error(`${project} is not a WolvenKit project (no .cpmodproj).`);
      const taken = fs.readdirSync(project).filter((n) => n.toLowerCase().endsWith(".quest.yaml")).map((n) => n.replace(/\.quest\.yaml$/i, ""));
      const qid = id ?? beatNameFor(title, taken);
      if (!/^[a-z][a-z0-9_]*$/.test(qid)) throw new Error(`The id "${qid}" must be lower case letters, digits and _, starting with a letter.`);
      if (!/^[a-z][a-z0-9_]*$/.test(author)) throw new Error(`The author "${author}" must be lower case letters, digits and _, starting with a letter.`);
      const file = path.join(project, `${qid}.quest.yaml`);
      if (fs.existsSync(file)) throw new Error(`${file} exists already: change it with quest_edit.`);
      fs.writeFileSync(file, given ?? storyTemplate({ title, id: qid, author }), "utf8");
      const made = make ? `\n\n${await makeStory(file)}` : "";
      return text(`${storySummary(file)}${made}\n\nThe file as written:\n\n\`\`\`yaml\n${fs.readFileSync(file, "utf8")}\`\`\``);
    } catch (e) {
      return failure(e);
    }
  },
);

const Edit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addBeat"), objective: z.string(), after: z.string().optional().describe("The beat it follows; default: the end, where nothing leads to it yet.") }),
  z.object({ op: z.literal("setThen"), beat: z.string(), then: z.string().describe("What follows the beat when no choice says otherwise: another beat's name, \"follow\" (the next beat in the list), \"none\" (the quest stays open), \"done\" or \"failed\" (the quest ends).") }),
  z.object({ op: z.literal("renameObjective"), beat: z.string(), objective: z.string() }),
  z.object({ op: z.literal("deleteBeat"), beat: z.string() }),
  z.object({ op: z.literal("setGo"), scene: z.string(), option: z.string().describe("The option's text."), beat: z.string().optional().describe("The beat it goes on to; absent: the scene goes on after the choice.") }),
  z.object({
    op: z.literal("setOption"), scene: z.string(), option: z.string().describe("The option's text."),
    main: z.boolean().nullable().optional().describe("true: yellow (moves the story on); false: white; null: worked out (yellow when it goes to a beat or sets a fact)."),
    lifepath: z.enum(["corpo", "nomad", "streetkid"]).optional().describe("Only V with this lifepath sees it."),
    check: z.object({ attribute: z.enum(["body", "intelligence", "reflexes", "tech", "cool"]), difficulty: z.enum(["easy", "medium", "hard", "impossible"]) }).optional().describe("V needs the attribute at this difficulty (scaled to V's level), or it shows locked."),
    pay: z.union([z.number().int().positive(), z.enum(["easy", "medium", "hard", "impossible"])]).optional().describe("Eddies, or a difficulty's price for V's level, taken on choosing it."),
    open: z.boolean().optional().describe("true: no lifepath, check or pay; anyone can pick it."),
  }),
  z.object({ op: z.literal("setVoice"), line: z.array(z.union([z.string(), z.number()])).optional().describe("The line's path, from quest_voice."), lineId: z.string().optional().describe("Or the line's id, from quest_voice."), direction: z.string().optional(), say: z.string().optional() }),
  z.object({ op: z.literal("setTodo"), index: z.number().int().describe("The item's place in todo:, from 0."), done: z.boolean() }),
  z.object({ op: z.literal("convertToBeats") }),
  z.object({ op: z.literal("insert"), list: z.array(z.union([z.string(), z.number()])).describe("A list's path: a scene [\"scenes\", \"arrival\"], an option's [\"scenes\", \"arrival\", 1, \"choice\", \"Leave\"], or a beat's steps [\"beats\", \"go_home\", \"steps\"]."), index: z.number().int().describe("Its place; past the end adds it last (before a go:)."), value: z.unknown().describe("{ V: \"Hi.\" }, { choice: { \"Yes\": [], \"No\": [] } }, { wait: 3 }, \"done\"...") }),
  z.object({ op: z.literal("move"), list: z.array(z.union([z.string(), z.number()])), from: z.number().int(), to: z.number().int() }),
  z.object({ op: z.literal("remove"), list: z.array(z.union([z.string(), z.number()])), index: z.number().int() }),
  z.object({ op: z.literal("addScene"), name: z.string(), firstLine: z.string().optional() }),
  z.object({ op: z.literal("set"), path: z.array(z.union([z.string(), z.number()])).describe("Where, such as [\"beats\", \"go_home\", \"steps\"] or [\"scenes\", \"arrival\"]."), value: z.unknown().describe("Plain JSON; absent removes it.") }),
]);

server.registerTool(
  "quest_edit",
  {
    description:
      "Changes a story file in story words, as the Storyboard does: add, rename or delete a beat, say what follows a beat (setThen), send a choice to a beat (setGo), make an option yellow or white or give it a lifepath, attribute check or payment (setOption), say how a line is spoken (setVoice), tick a checklist item, " +
      "add, move or remove lines, choices and steps in their lists, add a scene, convert an old steps: list to beats, or set any value by its path. The edits apply in order and the file is written once, comments kept; an edit that cannot apply stops them all. " +
      "Returns the beats, the problems and what is left on the checklist. " + StoryFormat,
    inputSchema: {
      story: z.string().describe("A story file, <project>\\<id>.quest.yaml."),
      edits: z.array(Edit).min(1),
      make: z.boolean().default(false).describe("Make the game files after the edits, when the story has no problems."),
    },
  },
  async ({ story: file, edits, make }) => {
    try {
      let src = fs.readFileSync(file, "utf8");
      const notes: string[] = [];
      for (const [k, e] of edits.entries()) {
        try {
          switch (e.op) {
            case "addBeat": { const r = addBeat(src, e.objective, e.after); src = r.text; notes.push(`Added the beat ${r.name}.`); break; }
            case "setThen": src = setThen(src, e.beat, e.then); break;
            case "renameObjective": src = renameObjective(src, e.beat, e.objective); break;
            case "deleteBeat": src = deleteBeat(src, e.beat); break;
            case "setGo": {
              const s = readStory(src).story;
              const at = s && optionPath(s, e.scene, e.option);
              if (!at) throw new Error(`No option "${e.option}" in the scene ${e.scene} (or the story has problems to fix first).`);
              src = setChoiceGo(src, at, e.beat);
              break;
            }
            case "setOption": {
              const s = readStory(src).story;
              const at = s && optionPath(s, e.scene, e.option);
              if (!at) throw new Error(`No option "${e.option}" in the scene ${e.scene} (or the story has problems to fix first).`);
              src = setOption(src, at, { main: e.main, lifepath: e.lifepath, check: e.check, pay: e.pay, condition: e.open ? null : undefined });
              break;
            }
            case "setVoice": {
              let at = e.line;
              if (!at && e.lineId) { const s = readStory(src).story; at = s ? storyLines(s).find((l) => l.id === e.lineId)?.path : undefined; }
              if (!at) throw new Error("Give the line's path or id, from quest_voice.");
              src = setLineVoice(src, at, { direction: e.direction, say: e.say });
              break;
            }
            case "setTodo": src = setTodoDone(src, e.index, e.done); break;
            case "convertToBeats": src = convertToBeats(src); break;
            case "insert": src = insertItem(src, e.list, e.index, e.value); break;
            case "move": src = moveItem(src, e.list, e.from, e.to); break;
            case "remove": src = removeItem(src, e.list, e.index); break;
            case "addScene": src = addScene(src, e.name, e.firstLine); break;
            case "set": src = setPath(src, e.path, e.value); break;
          }
        } catch (err) {
          throw new Error(`Edit ${k + 1} (${e.op}) did not apply, so nothing was written: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      fs.writeFileSync(file, src, "utf8");
      const made = make && readStory(src).story ? `\n\n${await makeStory(file)}` : "";
      return text(`${notes.length ? notes.join(" ") + "\n\n" : ""}${storySummary(file)}${made}`);
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "quest_make",
  {
    description:
      "Makes a quest's game files from its story file in its WolvenKit project (the phase, journal, scenes, texts and .archive.xl), checks them with quest_check, and updates the story's checklist. " +
      "A made file changed by hand is kept, not overwritten. Pack and try it with REDcode or EDGEdeck afterwards.",
    inputSchema: { story: z.string().describe("A story file, <project>\\<id>.quest.yaml.") },
  },
  async ({ story: file }) => {
    try {
      return text(`${await makeStory(file)}\n\n${storySummary(file)}`);
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
