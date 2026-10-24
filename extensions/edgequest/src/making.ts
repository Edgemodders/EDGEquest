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

export class QuestMaker implements vscode.Disposable {
  readonly diagnostics = vscode.languages.createDiagnosticCollection("edgequest");
  private readonly busy = new Map<string, { again: boolean }>();
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

  constructor(private readonly host: MakerHost) {}

  dispose(): void {
    this.diagnostics.dispose();
    this.status.dispose();
  }

  /** Makes the quest of a story file; one make per file at a time, a save during one makes again after it. */
  async make(uri: vscode.Uri, asked = false): Promise<MakeResult | undefined> {
    const key = uri.fsPath.toLowerCase();
    const running = this.busy.get(key);
    if (running) { running.again = true; return undefined; }
    this.busy.set(key, { again: false });
    try {
      let result: MakeResult | undefined;
      do {
        this.busy.get(key)!.again = false;
        result = await this.makeOnce(uri, asked);
      } while (this.busy.get(key)!.again);
      return result;
    } finally {
      this.busy.delete(key);
    }
  }

  private async makeOnce(uri: vscode.Uri, asked: boolean): Promise<MakeResult | undefined> {
    const file = uri.fsPath, project = path.dirname(file), name = path.basename(file);
    if (!isProject(project)) {
      this.diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), "EDGEquest makes a quest from a story file at the top of a WolvenKit project (beside its .cpmodproj). This one is not, so nothing is made.", vscode.DiagnosticSeverity.Information)]);
      if (asked) void vscode.window.showWarningMessage(`${name} is not at the top of a WolvenKit project, so EDGEquest cannot make its quest.`);
      return undefined;
    }
    this.status.text = `$(sync~spin) EDGEquest: making ${name}`;
    this.status.show();
    try {
      const result = await makeQuest(project, file, await this.host.bridge(), { index: this.host.index() });
      this.report(uri, result, asked);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.host.log(`Make ${name}: ${msg}`);
      void vscode.window.showErrorMessage(`EDGEquest could not make ${name}: ${msg}`);
      return undefined;
    } finally {
      this.status.hide();
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
    const name = path.basename(uri.fsPath);
    if (r.problems.length) {
      const msg = `EDGEquest: ${name} has ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}; ${r.files.some((f) => f.result === "written") ? "the rest was made" : "nothing was made"}. See the Problems panel.`;
      if (asked) void vscode.window.showWarningMessage(msg, "Show Problems").then((p) => p && vscode.commands.executeCommand("workbench.actions.view.problems"));
      else vscode.window.setStatusBarMessage(`$(warning) ${msg}`, 8000);
      return;
    }
    const written = r.files.filter((f) => f.result === "written" || f.result === "removed").length;
    const open = r.checklist.filter((i) => !i.done).length;
    const msg = `EDGEquest: ${name} made${written ? ` (${written} file${written === 1 ? "" : "s"} changed)` : ", no changes"}${open ? `; ${open} on the checklist` : ""}.`;
    this.host.log(msg);
    if (asked) void vscode.window.showInformationMessage(msg);
    else vscode.window.setStatusBarMessage(`$(check) ${msg}`, 6000);
  }
}
