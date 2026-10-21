// EDGEquest's extension, Q1 Read: the Game Quests view, the quest index, Find Quest, and the quest page.
// Finds the game and REDbridge as EDGEmat does, uses REDcode's running bridge when REDcode is active
// with the same game, and builds the quest index from the user's game in the background.

import * as vscode from "vscode";
import { BridgeClient, buildIndex, checkMarkdown, checkQuestMod, defaultCacheDir, modFromArchive, modFromFolder, findQuests, isGameFolder, isIndexCurrent, listGameFiles, loadIndex, resolveBridge, resolveGame, type GameChoice, type QuestIndex } from "./core";
import { QuestPages } from "./questPage";
import { QuestTree } from "./questTree";

/** The parts of REDcode's API (version 1, docs/api.md) EDGEquest uses. */
interface REDcodeApi {
  readonly apiVersion: 1;
  bridge(): BridgeClient | undefined;
  gamePath(): string | undefined;
}

/** The part of EDGEdeck's API (version 1) EDGEquest uses. */
interface EDGEdeckApi {
  readonly apiVersion: 1;
  gamePath(): string;
}

type State = "noGame" | "noBridge" | "loading" | "ready" | "error";

let output: vscode.OutputChannel;
let tree: QuestTree;
let view: vscode.TreeView<unknown>;
let pages: QuestPages;
let ownBridge: BridgeClient | undefined;
let ownBridgeGame: string | undefined;
let index: QuestIndex | undefined;
let loading: Promise<void> | undefined;
let indexing: Promise<void> | undefined;
const cacheDir = defaultCacheDir();

const log = (line: string) => output.appendLine(`${new Date().toISOString().slice(11, 19)} ${line}`);
const setState = (state: State) => void vscode.commands.executeCommand("setContext", "edgequest.state", state);

function settings(key: string): string | undefined {
  const [section, name] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
  const v = vscode.workspace.getConfiguration(section).get<string>(name, "");
  return v && v.trim() ? v.trim() : undefined;
}

/** An extension's API, only when the extension is already active (activating another extension here could race a reload). */
function activeApi<T extends { apiVersion: number }>(id: string): T | undefined {
  const ext = vscode.extensions.getExtension<T>(id);
  const api = ext?.isActive ? ext.exports : undefined;
  return api?.apiVersion === 1 ? api : undefined;
}
const redcode = () => activeApi<REDcodeApi>("edgemodders.redcode-cyberpunk");
const edgedeck = () => activeApi<EDGEdeckApi>("edgemodders.edgedeck");

function findGame(search: boolean): Promise<GameChoice | undefined> {
  return resolveGame(settings, { redcodeGamePath: () => redcode()?.gamePath(), edgedeckGamePath: () => edgedeck()?.gamePath() }, search);
}

/** REDcode's running bridge when it reads the same game; otherwise EDGEquest's own, started once. */
async function getBridge(game: GameChoice): Promise<BridgeClient | undefined> {
  const rc = redcode();
  const shared = rc?.bridge();
  if (shared?.running && rc?.gamePath()?.toLowerCase() === game.path.toLowerCase()) return shared;
  if (ownBridge?.running && ownBridgeGame === game.path) return ownBridge;
  ownBridge?.stop();
  const choice = resolveBridge(settings);
  if (!choice) return undefined;
  log(`Starting REDbridge from ${choice.exe} (${choice.from}) for ${game.path}`);
  const b = new BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
  b.on("log", (line: string) => output.appendLine(`  bridge | ${line}`));
  b.on("exit", (code: number | null) => log(`REDbridge exited (${code}); it restarts when needed`));
  b.on("error", (e: Error) => log(`REDbridge could not start: ${e.message}`));
  b.start();
  const info = await b.info();
  if (!info.gameLoaded) await b.load(game.path);
  log(`REDbridge ${info.version}, WolvenKit ${info.wolvenKit}`);
  ownBridge = b;
  ownBridgeGame = game.path;
  return b;
}

async function bridgeNow(): Promise<BridgeClient> {
  const game = await findGame(false);
  if (!game) throw new Error("No Cyberpunk 2077 folder is set.");
  const b = await getBridge(game);
  if (!b) throw new Error("REDbridge was not found.");
  return b;
}

/** Lists the game's quest files in the view, then checks the index and builds it in the background when needed. */
function refresh(rebuild = false): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    index = loadIndex(cacheDir);
    tree.setIndex(index);
    const game = await findGame(true);
    if (!game) return setState("noGame");
    let bridge: BridgeClient | undefined;
    try {
      bridge = await getBridge(game);
    } catch (e) {
      log(`REDbridge failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!bridge) return setState("noBridge");
    setState("loading");
    try {
      const files = await listGameFiles(bridge, ".quest", ".questphase", ".scene");
      tree.setFiles(files);
      log(`${files.length} quest, phase and scene files in ${game.path} (${game.from})`);
      setState("ready");
    } catch (e) {
      log(`Listing the game's quests failed: ${e instanceof Error ? e.message : String(e)}`);
      return setState("error");
    }
    if (rebuild || !index || !(await isIndexCurrent(index, bridge))) void buildIndexNow(bridge, rebuild ? "Rebuilding" : index ? "The game changed: rebuilding" : "Building");
  })().finally(() => (loading = undefined));
  return loading;
}

function buildIndexNow(bridge: BridgeClient, verb: string): Promise<void> {
  if (indexing) return indexing;
  log(`${verb} the quest index`);
  indexing = Promise.resolve(
    vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "EDGEquest: quest index" }, async (p) => {
      let last = 0;
      try {
        index = await buildIndex(bridge, cacheDir, (message, done, total) => {
          if (total && done !== undefined && done - last >= 100) {
            p.report({ message: `${message} ${done}/${total}` });
            last = done;
          } else if (!total) p.report({ message });
        });
        log(`Quest index: ${index.files.length} files, ${Object.keys(index.journal).length} journal entries, ${index.seconds} s${index.failed.length ? `, ${index.failed.length} failed` : ""}`);
        for (const f of index.failed.slice(0, 20)) log(`  failed: ${f}`);
        tree.setIndex(index);
      } catch (e) {
        log(`The quest index could not be built: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  ).finally(() => (indexing = undefined));
  return indexing;
}

async function findQuest(): Promise<void> {
  if (!index) {
    const b = await bridgeNow().catch(() => undefined);
    if (b) await buildIndexNow(b, "Building");
    if (!index) return void vscode.window.showWarningMessage("EDGEquest needs its quest index to find quests. See the log.");
  }
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { path: string }>();
  qp.placeholder = "A quest title, a file or folder name, a fact, a journal entry, a person or a place";
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.onDidChangeValue((v) => {
    qp.items = v.trim().length < 2 ? [] : findQuests(index!, v, 100).map((h) => ({
      label: h.file.path.slice(h.file.path.lastIndexOf("\\") + 1),
      description: h.quest?.title ?? "",
      detail: `${h.file.path} · ${h.why.join("; ")}`,
      path: h.file.path,
      alwaysShow: true,
    }));
  });
  qp.onDidAccept(() => {
    const item = qp.selectedItems[0];
    qp.hide();
    if (item) void pages.open(item.path);
  });
  qp.show();
}

async function checkMod(target?: vscode.Uri): Promise<void> {
  let uri = target;
  if (!uri) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: false,
      title: "A quest mod to check: its .archive (with the .xl beside it), a WolvenKit project folder, or a folder of extracted files",
      filters: { "Mod archive": ["archive"], "All files": ["*"] },
    });
    uri = picked?.[0];
  }
  if (!uri) return;
  const chosen = uri.fsPath;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `EDGEquest: checking ${chosen.slice(chosen.lastIndexOf("\\") + 1)}` }, async () => {
    try {
      const bridge = await bridgeNow();
      const mod = chosen.toLowerCase().endsWith(".archive") ? await modFromArchive(bridge, chosen) : modFromFolder(chosen);
      const result = await checkQuestMod(mod, bridge, index);
      const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: checkMarkdown(chosen.slice(chosen.lastIndexOf("\\") + 1), result) });
      await vscode.window.showTextDocument(doc, { preview: true });
      await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Check failed: ${msg}`);
      void vscode.window.showErrorMessage(`EDGEquest could not check ${chosen}: ${msg}`);
    }
  });
}

async function setGameFolder(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: "Your Cyberpunk 2077 folder (the one holding bin, archive and r6)" });
  const dir = picked?.[0]?.fsPath;
  if (!dir) return;
  if (!isGameFolder(dir)) return void vscode.window.showErrorMessage(`${dir} is not a Cyberpunk 2077 folder: it has no bin\\x64\\Cyberpunk2077.exe.`);
  await vscode.workspace.getConfiguration("edgequest").update("gamePath", dir, vscode.ConfigurationTarget.Global);
  void refresh();
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("EDGEquest");
  tree = new QuestTree();
  view = vscode.window.createTreeView("edgequest.gameQuests", { treeDataProvider: tree, showCollapseAll: true });
  pages = new QuestPages({
    json: async (gamePath) => JSON.parse((await (await bridgeNow()).toJson(gamePath)).json ?? "null"),
    index: () => index,
    log,
  });
  context.subscriptions.push(
    output,
    view,
    vscode.commands.registerCommand("edgequest.showLog", () => output.show()),
    vscode.commands.registerCommand("edgequest.refresh", () => refresh()),
    vscode.commands.registerCommand("edgequest.rebuildIndex", () => refresh(true)),
    vscode.commands.registerCommand("edgequest.setGameFolder", setGameFolder),
    vscode.commands.registerCommand("edgequest.find", findQuest),
    vscode.commands.registerCommand("edgequest.check", checkMod),
    vscode.commands.registerCommand("edgequest.open", (gamePath: string) => pages.open(gamePath)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("edgequest") || e.affectsConfiguration("redcode.gamePath") || e.affectsConfiguration("redcode.bridgePath")) void refresh();
    }),
  );
  void refresh();
}

export function deactivate(): void {
  ownBridge?.stop();
}
