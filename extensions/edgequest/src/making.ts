// Making a quest from its story file in VS Code: on save (edgequest.makeOnSave) or with Make Quest. The
// story file's problems and quest_check's findings go to the Problems panel; the made files are listed by
// Made Files, which opens each in plain words.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { isProject, makeQuest, type BridgeClient, type MakeResult, type QuestIndex } from "./core";

export interface MakerHost {
  bridge(): Promise<BridgeClient>;
  index(): QuestIndex | undefined;
  log(line: string): void;
}

export const isStoryFile = (uri: vscode.Uri) => uri.scheme === "file" && uri.fsPath.toLowerCase().endsWith(".quest.yaml");

/** The made files of a story, from the list make keeps in the project (.edgequest/<id>.made.json). */
export function madeFiles(storyFile: string, id: string): string[] {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(path.dirname(storyFile), ".edgequest", `${id}.made.json`), "utf8")) as { files: Record<string, string> };
    return Object.keys(m.files).map((rel) => path.join(path.dirname(storyFile), rel));
  } catch {
    return [];
  }
}

/** What the status bar item says about a story file: its last make. */
interface Shown {
  text: string;
  tooltip: string;
  problems: boolean;
}

export class QuestMaker implements vscode.Disposable {
  readonly diagnostics = vscode.languages.createDiagnosticCollection("edgequest");
  private readonly busy = new Map<string, { again: boolean }>();
  private readonly last = new Map<string, Shown>();
  // Stays while a story file's tab is in front, saying how its last make went (a passing message was easy to
  // miss: owner's test of 2026-10-24). A click shows the problems, or the made files.
  private readonly status = vscode.window.createStatusBarItem("edgequest.make", vscode.StatusBarAlignment.Left, 100);
  private readonly subs: vscode.Disposable[] = [];

  constructor(private readonly host: MakerHost) {
    this.status.name = "EDGEquest: the quest's last make";
    this.subs.push(vscode.window.tabGroups.onDidChangeTabs(() => this.update()), vscode.window.onDidChangeActiveTextEditor(() => this.update()));
    this.update();
  }

  dispose(): void {
    this.diagnostics.dispose();
    this.status.dispose();
    this.subs.forEach((s) => s.dispose());
  }

  /** The story file in front: a text editor's or a Storyboard's. */
  private activeStory(): vscode.Uri | undefined {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { uri?: vscode.Uri } | undefined;
    if (tab?.uri && isStoryFile(tab.uri)) return tab.uri;
    const editor = vscode.window.activeTextEditor?.document.uri;
    return editor && isStoryFile(editor) ? editor : undefined;
  }

  private update(): void {
    const uri = this.activeStory();
    if (!uri) return this.status.hide();
    const key = uri.fsPath.toLowerCase();
    const name = path.basename(uri.fsPath);
    const shown = this.last.get(key);
    if (this.busy.has(key)) {
      this.status.text = `$(sync~spin) EDGEquest: making ${name}`;
      this.status.tooltip = "Making the quest's game files from the story file.";
      this.status.command = undefined;
      this.status.backgroundColor = undefined;
    } else if (shown) {
      this.status.text = shown.text;
      this.status.tooltip = shown.tooltip;
      this.status.command = shown.problems ? "workbench.actions.view.problems" : { command: "edgequest.madeFiles", title: "Made Files", arguments: [uri] };
      this.status.backgroundColor = shown.problems ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    } else {
      this.status.text = `$(run) EDGEquest: make ${name}`;
      this.status.tooltip = "Not made since VS Code started. Saving the story file makes its game files; or click to make them now.";
      this.status.command = { command: "edgequest.make", title: "Make Quest", arguments: [uri] };
      this.status.backgroundColor = undefined;
    }
    this.status.show();
  }

  /** Makes the quest of a story file; one make per file at a time, a save during one makes again after it. */
  async make(uri: vscode.Uri, asked = false): Promise<MakeResult | undefined> {
    const key = uri.fsPath.toLowerCase();
    const running = this.busy.get(key);
    if (running) { running.again = true; return undefined; }
    this.busy.set(key, { again: false });
    this.update();
    try {
      let result: MakeResult | undefined;
      do {
        this.busy.get(key)!.again = false;
        result = await this.makeOnce(uri, asked);
      } while (this.busy.get(key)!.again);
      return result;
    } finally {
      this.busy.delete(key);
      this.update();
    }
  }

  private async makeOnce(uri: vscode.Uri, asked: boolean): Promise<MakeResult | undefined> {
    const file = uri.fsPath, project = path.dirname(file), name = path.basename(file);
    if (!isProject(project)) {
      this.diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), "EDGEquest makes a quest from a story file at the top of a WolvenKit project (beside its .cpmodproj). This one is not, so nothing is made.", vscode.DiagnosticSeverity.Information)]);
      this.last.set(file.toLowerCase(), { text: "$(info) EDGEquest: not in a project", tooltip: `${name} is not at the top of a WolvenKit project (beside its .cpmodproj), so its quest is not made.`, problems: true });
      if (asked) void vscode.window.showWarningMessage(`${name} is not at the top of a WolvenKit project, so EDGEquest cannot make its quest.`);
      return undefined;
    }
    try {
      const result = await makeQuest(project, file, await this.host.bridge(), { index: this.host.index() });
      this.report(uri, result, asked);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.host.log(`Make ${name}: ${msg}`);
      this.last.set(file.toLowerCase(), { text: "$(error) EDGEquest: could not make", tooltip: `${name}: ${msg}`, problems: true });
      void vscode.window.showErrorMessage(`EDGEquest could not make ${name}: ${msg}`);
      return undefined;
    }
  }

  private report(uri: vscode.Uri, r: MakeResult, asked: boolean): void {
    const at = (line?: number) => new vscode.Range(Math.max(0, (line ?? 1) - 1), 0, Math.max(0, (line ?? 1) - 1), 1000);
    const list: vscode.Diagnostic[] = r.problems.map((p) => {
      const d = new vscode.Diagnostic(at(p.line), `${p.at}: ${p.message}`, vscode.DiagnosticSeverity.Error);
      d.source = "EDGEquest";
      return d;
    });
    for (const f of r.findings) {
      if (f.level === "info") continue;
      const d = new vscode.Diagnostic(at(1), `${f.message}${f.file ? ` (${f.file})` : ""}`, f.level === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
      d.source = "quest_check";
      d.code = f.code;
      list.push(d);
    }
    this.diagnostics.set(uri, list);
    const name = path.basename(uri.fsPath), key = uri.fsPath.toLowerCase();
    const time = new Date().toTimeString().slice(0, 5);
    if (r.problems.length) {
      const n = r.problems.length;
      const msg = `${name} has ${n} problem${n === 1 ? "" : "s"}; ${r.files.some((f) => f.result === "written") ? "the rest was made" : "nothing was made"}. See the Problems panel.`;
      this.last.set(key, { text: `$(warning) EDGEquest: ${n} problem${n === 1 ? "" : "s"}, not made`, tooltip: `${msg}\nAt ${time}. Click to show the problems.`, problems: true });
      this.host.log(msg);
      if (asked) void vscode.window.showWarningMessage(`EDGEquest: ${msg}`, "Show Problems").then((p) => p && vscode.commands.executeCommand("workbench.actions.view.problems"));
      return;
    }
    const written = r.files.filter((f) => f.result === "written" || f.result === "removed").length;
    const open = r.checklist.filter((i) => !i.done).length;
    const msg = `${name} made${written ? ` (${written} file${written === 1 ? "" : "s"} changed)` : ", no changes"}${open ? `; ${open} on the checklist` : ""}.`;
    this.last.set(key, { text: `$(check) EDGEquest: made ${time}${open ? ` · ${open} to do` : ""}`, tooltip: `${msg}\nClick for the made files.`, problems: false });
    this.host.log(msg);
    if (asked) void vscode.window.showInformationMessage(`EDGEquest: ${msg}`);
  }
}
