// The Game Quests view: the game's quest folders with their quests, phases and scenes. A folder shows the
// journal quest its phases belong to, in words, once the index is built.

import * as vscode from "vscode";
import { questOf, type QuestIndex } from "./core";

/** The folders a quest lives under, first in the tree. Other folders holding quest files follow. */
const Roots = ["base\\quest", "ep1\\quest", "base\\open_world", "ep1\\openworld"];

export interface FolderNode {
  kind: "folder";
  path: string;
  name: string;
  folders: Map<string, FolderNode>;
  files: string[];
}
export interface FileNode {
  kind: "file";
  path: string;
}
export type TreeNode = FolderNode | FileNode;

const folder = (path: string, name: string): FolderNode => ({ kind: "folder", path, name, folders: new Map(), files: [] });

export class QuestTree implements vscode.TreeDataProvider<TreeNode> {
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private root = folder("", "");
  private titles = new Map<string, string>();

  /** Sets the game's quest files (game paths of .quest, .questphase and .scene). */
  setFiles(paths: string[]): void {
    this.root = folder("", "");
    for (const p of paths) {
      const parts = p.split("\\");
      let at = this.root;
      for (let i = 0; i < parts.length - 1; i++) {
        const sub = parts.slice(0, i + 1).join("\\");
        if (!at.folders.has(parts[i])) at.folders.set(parts[i], folder(sub, parts[i]));
        at = at.folders.get(parts[i])!;
      }
      at.files.push(p);
    }
    this.changed.fire(undefined);
  }

  /** Folder titles from the index: the journal quest most of a folder's phases belong to. */
  setIndex(idx: QuestIndex | undefined): void {
    this.titles.clear();
    if (idx) {
      const votes = new Map<string, Map<string, number>>();
      for (const f of idx.files) {
        const title = questOf(idx, f)?.title;
        if (!title) continue;
        const dir = f.path.slice(0, f.path.lastIndexOf("\\"));
        // vote for the file's folder and, when it is a phases or scenes folder, its parent
        for (const d of [dir, dir.replace(/\\(phases|scenes|quest|definitions)$/, "")]) {
          if (!votes.has(d)) votes.set(d, new Map());
          const m = votes.get(d)!;
          m.set(title, (m.get(title) ?? 0) + 1);
        }
      }
      for (const [d, m] of votes) this.titles.set(d, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    }
    this.changed.fire(undefined);
  }

  getTreeItem(n: TreeNode): vscode.TreeItem {
    if (n.kind === "folder") {
      const item = new vscode.TreeItem(n.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = this.titles.get(n.path);
      item.tooltip = n.path;
      item.iconPath = new vscode.ThemeIcon("folder");
      item.contextValue = "folder";
      return item;
    }
    const name = n.path.slice(n.path.lastIndexOf("\\") + 1);
    const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
    item.tooltip = n.path;
    const ext = name.slice(name.lastIndexOf("."));
    item.iconPath = new vscode.ThemeIcon(ext === ".scene" ? "comment-discussion" : ext === ".quest" ? "milestone" : "type-hierarchy");
    item.contextValue = ext.slice(1);
    item.command = { command: "edgequest.open", title: "Open", arguments: [n.path] };
    return item;
  }

  getChildren(n?: TreeNode): TreeNode[] {
    if (!n) {
      // the known quest roots first, as single entries ("base\quest"), then everything else by top folder
      const out: TreeNode[] = [];
      for (const r of Roots) {
        const f = this.find(r);
        if (f) out.push({ ...f, name: r });
      }
      for (const top of [...this.root.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        for (const sub of [...top.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
          if (!Roots.includes(sub.path)) out.push({ ...sub, name: sub.path });
        }
      }
      return out;
    }
    if (n.kind === "file") return [];
    return [
      ...[...n.folders.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ...n.files.slice().sort().map((path) => ({ kind: "file" as const, path })),
    ];
  }

  private find(path: string): FolderNode | undefined {
    let at: FolderNode | undefined = this.root;
    for (const part of path.split("\\")) at = at?.folders.get(part);
    return at;
  }
}
