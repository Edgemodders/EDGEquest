// The Project Quests view: the quests in the open WolvenKit projects, each with its beats and its checklist,
// and New Quest. A project is REDcode's open project or a workspace folder holding a .cpmodproj; its story
// files are the *.quest.yaml at its top, beside the .cpmodproj, where make looks for them.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { isProject, readStory, storyboard, storyChecklist, storyTemplate, beatNameFor, type ChecklistItem } from "./core";

type Node =
  | { kind: "project"; dir: string }
  | { kind: "story"; file: string }
  | { kind: "beats"; file: string }
  | { kind: "beat"; file: string; name: string; objective: string; ending?: string; unreached?: boolean }
  | { kind: "checklist"; file: string; items: ChecklistItem[] }
  | { kind: "item"; file: string; item: ChecklistItem }
  | { kind: "problems"; file: string; count: number };

const storiesIn = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".quest.yaml")).sort().map((n) => path.join(dir, n));
  } catch {
    return [];
  }
};

export class ProjectTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly redcodeProject: () => string | undefined) {}

  /** The projects shown: REDcode's open one first, then workspace folders that are WolvenKit projects. */
  projects(): string[] {
    const out: string[] = [];
    const rc = this.redcodeProject();
    if (rc && isProject(rc)) out.push(rc);
    for (const f of vscode.workspace.workspaceFolders ?? []) if (isProject(f.uri.fsPath) && !out.some((d) => d.toLowerCase() === f.uri.fsPath.toLowerCase())) out.push(f.uri.fsPath);
    return out;
  }

  refresh(): void {
    const projects = this.projects();
    void vscode.commands.executeCommand("setContext", "edgequest.projectState", !projects.length ? "noProject" : projects.some((p) => storiesIn(p).length) ? "ready" : "empty");
    this.changed.fire(undefined);
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      const projects = this.projects();
      return projects.length === 1 ? storiesIn(projects[0]).map((file) => ({ kind: "story", file })) : projects.map((dir) => ({ kind: "project", dir }));
    }
    if (node.kind === "project") return storiesIn(node.dir).map((file) => ({ kind: "story", file }));
    if (node.kind === "story") {
      let text = "";
      try { text = fs.readFileSync(node.file, "utf8"); } catch { return []; }
      const read = readStory(text);
      const list = storyChecklist(text, path.dirname(node.file)).items;
      const out: Node[] = [];
      if (!read.story) out.push({ kind: "problems", file: node.file, count: read.problems.length });
      else out.push({ kind: "beats", file: node.file });
      if (list.length) out.push({ kind: "checklist", file: node.file, items: list });
      return out;
    }
    if (node.kind === "beats") {
      const story = readStory(fs.readFileSync(node.file, "utf8")).story;
      if (!story) return [];
      return storyboard(story).cards.map((c) => ({ kind: "beat", file: node.file, name: c.beat, objective: c.objective, ending: c.ending, unreached: c.unreached }));
    }
    if (node.kind === "checklist") return [...node.items.filter((i) => !i.done), ...node.items.filter((i) => i.done)].map((item) => ({ kind: "item", file: node.file, item }));
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const open = (file: string): vscode.Command => ({ command: "vscode.openWith", title: "Open Storyboard", arguments: [vscode.Uri.file(file), "edgequest.storyboard"] });
    switch (node.kind) {
      case "project": {
        const t = new vscode.TreeItem(path.basename(node.dir), vscode.TreeItemCollapsibleState.Expanded);
        t.iconPath = new vscode.ThemeIcon("folder");
        t.tooltip = node.dir;
        return t;
      }
      case "story": {
        let title = path.basename(node.file), desc = "";
        try {
          const text = fs.readFileSync(node.file, "utf8");
          const read = readStory(text);
          if (read.story) title = read.story.title;
          const items = storyChecklist(text, path.dirname(node.file)).items;
          const left = items.filter((i) => !i.done).length;
          desc = read.story ? (left ? `${left} to do` : "nothing to do") : `${read.problems.length} problem${read.problems.length === 1 ? "" : "s"}`;
        } catch { /* unreadable: shown by name */ }
        const t = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.Collapsed);
        t.description = desc;
        t.tooltip = node.file;
        t.iconPath = new vscode.ThemeIcon("book");
        t.contextValue = "story";
        t.resourceUri = vscode.Uri.file(node.file);
        t.command = open(node.file);
        return t;
      }
      case "beats": {
        const t = new vscode.TreeItem("Beats", vscode.TreeItemCollapsibleState.Collapsed);
        t.iconPath = new vscode.ThemeIcon("type-hierarchy");
        return t;
      }
      case "beat": {
        const t = new vscode.TreeItem(node.objective, vscode.TreeItemCollapsibleState.None);
        t.description = node.ending ? `${node.name} · quest ${node.ending}` : node.unreached ? `${node.name} · nothing leads here` : node.name;
        t.iconPath = new vscode.ThemeIcon(node.ending === "failed" ? "error" : node.ending ? "pass" : "circle-outline");
        t.command = open(node.file);
        return t;
      }
      case "checklist": {
        const left = node.items.filter((i) => !i.done).length;
        const t = new vscode.TreeItem("Checklist", left ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        t.description = `${left} open, ${node.items.length - left} done`;
        t.iconPath = new vscode.ThemeIcon("checklist");
        return t;
      }
      case "item": {
        const t = new vscode.TreeItem(node.item.do, vscode.TreeItemCollapsibleState.None);
        t.description = node.item.tool;
        t.tooltip = `${node.item.do}${node.item.tool ? `\nCan be done with ${node.item.tool}.` : ""}${node.item.done ? "\nDone." : ""}`;
        t.iconPath = new vscode.ThemeIcon(node.item.done ? "pass-filled" : "circle-large-outline");
        t.command = open(node.file);
        return t;
      }
      case "problems": {
        const t = new vscode.TreeItem(`${node.count} problem${node.count === 1 ? "" : "s"} in the story file`, vscode.TreeItemCollapsibleState.None);
        t.iconPath = new vscode.ThemeIcon("warning");
        t.command = { command: "workbench.actions.view.problems", title: "Show Problems" };
        return t;
      }
    }
  }
}

/** New Quest: a story file from the template in a WolvenKit project, opened on the Storyboard. */
export async function newQuest(tree: ProjectTree, author: () => string | undefined): Promise<void> {
  const projects = tree.projects();
  let project = projects[0];
  if (projects.length > 1) {
    const pick = await vscode.window.showQuickPick(projects.map((d) => ({ label: path.basename(d), description: d, dir: d })), { title: "New Quest: which project?" });
    if (!pick) return;
    project = pick.dir;
  }
  if (!project) {
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: "New Quest: a WolvenKit project folder (the one holding its .cpmodproj)" });
    project = picked?.[0]?.fsPath ?? "";
    if (!project) return;
    if (!isProject(project)) return void vscode.window.showErrorMessage(`${project} is not a WolvenKit project: it has no .cpmodproj. Make one in REDcode or WolvenKit first.`);
  }
  const title = await vscode.window.showInputBox({ title: "New Quest (1/2): its title", prompt: "The name the journal shows", placeHolder: "Lost Shard", validateInput: (v) => (v.trim() ? undefined : "The quest needs a title.") });
  if (!title) return;
  const taken = storiesIn(project).map((f) => path.basename(f).replace(/\.quest\.yaml$/i, ""));
  const id = await vscode.window.showInputBox({
    title: "New Quest (2/2): its id",
    prompt: "Names its files and starts its facts: lower case letters, digits and _",
    value: beatNameFor(title, taken),
    validateInput: (v) => (!/^[a-z][a-z0-9_]*$/.test(v) ? "Lower case letters, digits and _, starting with a letter." : taken.includes(v) ? "The project already has a quest with this id." : undefined),
  });
  if (!id) return;
  let who = author();
  if (!who) {
    const guess = os.userInfo().username.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "") || "modder";
    who = await vscode.window.showInputBox({ title: "Your modder name", prompt: "Lower case: the quest's files go in mod\\<name>\\<id>. Kept in the setting edgequest.author.", value: guess, validateInput: (v) => (/^[a-z][a-z0-9_]*$/.test(v) ? undefined : "Lower case letters, digits and _, starting with a letter.") });
    if (!who) return;
    await vscode.workspace.getConfiguration("edgequest").update("author", who, vscode.ConfigurationTarget.Global);
  }
  const file = path.join(project, `${id}.quest.yaml`);
  fs.writeFileSync(file, storyTemplate({ title: title.trim(), id, author: who }), "utf8");
  tree.refresh();
  await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(file), "edgequest.storyboard");
  void vscode.window.showInformationMessage(`${title.trim()} starts from the template: a place, a scene with a choice and two endings. Its game files are being made; saving makes them again.`);
  await vscode.commands.executeCommand("edgequest.make", vscode.Uri.file(file));
  tree.refresh();
}
