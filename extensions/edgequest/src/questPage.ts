// The quest page: one .quest, .questphase or .scene in plain words, read-only. One tab reused as the
// modder clicks around, as Explorer's preview does. Phases and scenes it plays are links; "Raw" opens
// the file in REDcode's CR2W editor.

import * as vscode from "vscode";
import { questOf, readQuestFile, readScene, sceneOrder, steps, summarize, usedBy, type QuestIndex, type SceneFile, type Step } from "./core";

export interface PageHost {
  /** The file's WolvenKit JSON, by game path (or a file on disk: a quest EDGEquest made in a project). */
  json(gamePath: string): Promise<unknown>;
  /** The file on disk a path stands for, when it is a project's own file rather than the game's. */
  local?(gamePath: string): string | undefined;
  index(): QuestIndex | undefined;
  log(line: string): void;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nonce = () => Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");

const KindIcon: Record<string, string> = {
  start: "▶", end: "■", wait: "⏳", if: "◆", fact: "#", journal: "📓", scene: "💬", phase: "▣", flow: "⋈",
  people: "👤", world: "🌐", player: "V", phone: "✉", reward: "★", save: "💾", other: "·", section: "💬", choice: "◆", quest: "·",
};

export class QuestPages {
  private panel: vscode.WebviewPanel | undefined;
  private current: string | undefined;
  private history: string[] = [];

  constructor(private readonly host: PageHost) {}

  async open(gamePath: string, fromLink = false): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("edgequest.page", "Quest", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, enableFindWidget: true });
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.history = [];
      });
      this.panel.webview.onDidReceiveMessage((m: { open?: string; raw?: string; back?: boolean; copy?: string }) => {
        if (m.open) void this.open(m.open, true);
        else if (m.back && this.history.length) void this.open(this.history.pop()!, false);
        else if (m.raw) void openRaw(this.host.local?.(m.raw) ?? m.raw);
        else if (m.copy) void vscode.env.clipboard.writeText(m.copy).then(() => vscode.window.setStatusBarMessage(`Copied ${m.copy}`, 2000));
      });
    }
    if (fromLink && this.current && this.current !== gamePath) this.history.push(this.current);
    this.current = gamePath;
    const name = gamePath.slice(gamePath.lastIndexOf("\\") + 1);
    this.panel.title = name;
    this.panel.webview.html = this.frame(`<p class="muted">Reading ${esc(gamePath)}…</p>`);
    this.panel.reveal(undefined, true);
    try {
      const json = await this.host.json(gamePath);
      const body = gamePath.toLowerCase().endsWith(".scene") ? this.scenePage(gamePath, readScene(json)) : this.questPage(gamePath, json);
      if (this.current === gamePath && this.panel) this.panel.webview.html = this.frame(body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.host.log(`${gamePath}: ${msg}`);
      if (this.panel) this.panel.webview.html = this.frame(`<p class="error">Could not read ${esc(gamePath)}: ${esc(msg)}</p>`);
    }
  }

  private header(gamePath: string, kind: string, extra = ""): string {
    const idx = this.host.index();
    const entry = idx?.files.find((f) => f.path.toLowerCase() === gamePath.toLowerCase());
    const quest = idx && entry ? questOf(idx, entry) : undefined;
    const parents = idx ? usedBy(idx, gamePath) : [];
    return `<header>
      <div class="kind">${esc(kind)}${quest?.title ? ` · <b>${esc(quest.title)}</b>` : ""}</div>
      <h1>${esc(gamePath.slice(gamePath.lastIndexOf("\\") + 1))}</h1>
      <div class="path">${esc(gamePath)}</div>
      <div class="actions">${this.history.length ? `<button data-back="1">← Back</button>` : ""}<button data-raw="${esc(gamePath)}">Raw</button><button data-copy="${esc(gamePath)}">Copy path</button></div>
      ${extra}
      ${parents.length ? `<div class="used">Played by: ${parents.slice(0, 12).map((f) => link(f.path)).join(", ")}${parents.length > 12 ? ` and ${parents.length - 12} more` : ""}</div>` : ""}
    </header>`;
  }

  private questPage(gamePath: string, json: unknown): string {
    const q = readQuestFile(json);
    const list = steps(q.graph, q.handles);
    const sum = summarize(q.graph, q.handles);
    const idx = this.host.index();
    const journalText = (p: string) => idx?.journal[p]?.text;
    const rows: string[] = [];
    const render = (l: Step[], depth: number) => {
      for (const s of l) {
        let text = esc(s.text);
        if (s.phase) text = text.replace(esc(s.phase.slice(s.phase.lastIndexOf("\\") + 1).replace(/\.questphase$/, "")), link(s.phase, s.phase.slice(s.phase.lastIndexOf("\\") + 1).replace(/\.questphase$/, "")));
        if (s.scene) text = text.replace(esc(s.scene.slice(s.scene.lastIndexOf("\\") + 1).replace(/\.scene$/, "")), link(s.scene, s.scene.slice(s.scene.lastIndexOf("\\") + 1).replace(/\.scene$/, "")));
        const words = s.journal.map((j) => journalText(j.path)).filter(Boolean);
        const next = s.next.map((n) => `<a class="goto" data-node="${n.node}">${n.socket !== "Out" || s.next.length > 1 ? `${esc(n.socket)} ` : ""}→ ${n.node}${/^In\d*$/.test(n.input) ? "" : ` <span class="muted">(${esc(n.input)})</span>`}</a>`);
        rows.push(`<div class="step k-${s.kind}" id="n${s.id}" style="margin-left:${depth * 1.5}em">
          <span class="icon">${KindIcon[s.kind] ?? "·"}</span><span class="id">${s.id}</span>
          <span class="text">${text}${words.length ? `<span class="words"> “${words.map((w) => esc(w!)).join("”, “")}”</span>` : ""}</span>
          ${next.length ? `<span class="next">${next.join(" ")}</span>` : ""}</div>`);
        if (s.inner) render(s.inner, depth + 1);
      }
    };
    render(list, 0);
    const side: string[] = [];
    if (sum.facts.length) side.push(`<h2>Facts</h2><ul>${sum.facts.map((f) => `<li><code>${esc(f.name)}</code>${f.sets.length ? ` set ${esc(f.sets.join(", "))}` : ""}${f.tests.length ? ` tested ${esc(f.tests.join(", "))}` : ""}</li>`).join("")}</ul>`);
    if (sum.journal.length) side.push(`<h2>Journal</h2><ul>${sum.journal.map((j) => `<li>${esc(j.kind)} <code>${esc(j.path)}</code>${journalText(j.path) ? ` “${esc(journalText(j.path)!)}”` : ""}${j.states.length ? ` <span class="muted">${esc(j.states.join(", ").toLowerCase())}</span>` : ""}</li>`).join("")}</ul>`);
    if (sum.scenes.length) side.push(`<h2>Scenes</h2><ul>${sum.scenes.map((s) => `<li>${link(s)}</li>`).join("")}</ul>`);
    if (sum.phases.length) side.push(`<h2>Phases it plays</h2><ul>${sum.phases.map((s) => `<li>${link(s)}</li>`).join("")}</ul>`);
    if (sum.refs.length) side.push(`<h2>People, places, objects</h2><p class="refs">${sum.refs.map((r) => `<code>${esc(r)}</code>`).join(" ")}</p>`);
    const kind = q.type === "questQuestResource" ? "Quest" : "Phase";
    return `${this.header(gamePath, kind)}<main><section class="steps">${rows.join("") || '<p class="muted">No steps.</p>'}</section><aside>${side.join("")}</aside></main>`;
  }

  private scenePage(gamePath: string, scene: SceneFile): string {
    const rows: string[] = [];
    for (const s of sceneOrder(scene)) {
      const next = s.kind === "choice" ? "" : s.next.map((n) => n.to.map((t) => `<a class="goto" data-node="${t}">→ ${t}</a>`).join(" ")).join(" ");
      rows.push(`<div class="step k-${s.kind}" id="n${s.id}"><span class="icon">${KindIcon[s.kind] ?? "·"}</span><span class="id">${s.id}</span><span class="text">${esc(s.text)}</span>${next ? `<span class="next">${next}</span>` : ""}</div>`);
      for (const l of s.lines ?? []) rows.push(`<div class="line"><b>${esc(l.speaker)}</b>${l.addressee && l.addressee !== l.speaker ? ` <span class="muted">to ${esc(l.addressee)}</span>` : ""}: ${l.text ? esc(l.text) : `<span class="muted">(no text, ${esc(l.stringId)})</span>`}</div>`);
      for (const o of s.options ?? []) rows.push(`<div class="line option${o.main ? " main" : ""}"${o.main ? ' title="Yellow: moves the story on"' : ""}>◆ ${o.tag ? `<span class="tag">[${esc(o.tag)}]</span> ` : ""}${o.text ? esc(o.text) : `<span class="muted">(no text, ${esc(o.stringId)})</span>`}${o.condition ? ` <span class="muted">[${esc(o.condition)}]</span>` : ""} ${o.to.map((t) => `<a class="goto" data-node="${t}">→ ${t}</a>`).join(" ")}</div>`);
    }
    const extra = `<div class="people">People: ${scene.actors.map((a) => esc(a.name) + (a.player ? " <span class=\"muted\">(player)</span>" : "")).join(", ") || "none"} · ${scene.lines.length} lines · ${scene.options.length} options${scene.missingText ? ` · ${scene.missingText} without text` : ""}<br>Entry points: ${scene.entries.map((e) => `<a class="goto" data-node="${e.node}">${esc(e.name)}</a>`).join(", ") || "none"} · Exit points: ${scene.exits.map((e) => `<a class="goto" data-node="${e.node}">${esc(e.name)}</a>`).join(", ") || "none"}</div>`;
    return `${this.header(gamePath, "Scene", extra)}<main class="one"><section class="steps">${rows.join("")}</section></main>`;
  }

  private frame(body: string): string {
    const n = nonce();
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0 1.2em 2em; }
  header { position: sticky; top: 0; background: var(--vscode-editor-background); padding: .8em 0 .6em; border-bottom: 1px solid var(--vscode-panel-border); z-index: 1; }
  h1 { font-size: 1.4em; margin: .1em 0; } h2 { font-size: 1em; text-transform: uppercase; letter-spacing: .08em; color: var(--vscode-textLink-foreground); margin: 1.2em 0 .4em; }
  .kind { color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: .08em; font-size: .85em; }
  .path, .muted, .used, .people { color: var(--vscode-descriptionForeground); }
  .path { font-family: var(--vscode-editor-font-family); font-size: .9em; }
  .actions { margin: .5em 0; } button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: .25em .8em; margin-right: .4em; cursor: pointer; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  main { display: grid; grid-template-columns: minmax(0, 3fr) minmax(16em, 1.2fr); gap: 2em; margin-top: 1em; } main.one { grid-template-columns: 1fr; }
  .step { padding: .3em .4em; border-left: 3px solid transparent; display: flex; gap: .6em; align-items: baseline; flex-wrap: wrap; }
  .step:target, .step.hl { background: var(--vscode-editor-findMatchHighlightBackground); }
  .icon { width: 1.4em; text-align: center; } .id { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); min-width: 3em; }
  .text { flex: 1 1 24em; } .next { color: var(--vscode-descriptionForeground); font-size: .92em; } .words { color: var(--vscode-textPreformat-foreground); }
  .k-wait { border-left-color: #c9a227; } .k-if { border-left-color: #c94f6d; } .k-fact { border-left-color: #6d9fc9; } .k-journal { border-left-color: #8ac926; }
  .k-scene, .k-section, .k-choice { border-left-color: #b56dc9; } .k-phase { border-left-color: #f0f0f0; } .k-start, .k-end { border-left-color: #fcee0a; }
  .line { margin: .1em 0 .1em 5.5em; padding: .15em .5em; border-left: 1px solid var(--vscode-panel-border); } .option { color: var(--vscode-textLink-foreground); } .option.main { color: var(--vscode-charts-yellow, #fcee0a); } .option .tag { color: var(--vscode-charts-blue, #4fc1ff); }
  a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; } a:hover { text-decoration: underline; }
  code { font-family: var(--vscode-editor-font-family); font-size: .92em; } aside ul { padding-left: 1.1em; } aside li { margin: .2em 0; word-break: break-word; } .refs code { display: inline-block; margin: 0 .4em .2em 0; }
  .error { color: var(--vscode-errorForeground); }
</style></head><body>${body}
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-open],[data-raw],[data-back],[data-copy],[data-node]");
    if (!t) return;
    if (t.dataset.open) vscode.postMessage({ open: t.dataset.open });
    else if (t.dataset.raw) vscode.postMessage({ raw: t.dataset.raw });
    else if (t.dataset.back) vscode.postMessage({ back: true });
    else if (t.dataset.copy) vscode.postMessage({ copy: t.dataset.copy });
    else if (t.dataset.node) {
      const el = document.getElementById("n" + t.dataset.node);
      if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 1500); }
    }
  });
</script></body></html>`;
  }
}

function link(gamePath: string, label?: string): string {
  return `<a data-open="${esc(gamePath)}" title="${esc(gamePath)}">${esc(label ?? gamePath.slice(gamePath.lastIndexOf("\\") + 1))}</a>`;
}

/** Opens a game file in REDcode's CR2W editor, read-only; a file on disk (a project's) opens as itself. */
export async function openRaw(gamePath: string): Promise<void> {
  if (!vscode.extensions.getExtension("edgemodders.redcode-cyberpunk")) {
    void vscode.window.showInformationMessage("Raw files open in REDcode's CR2W editor. Install REDcode (edgemodders.redcode-cyberpunk) to see the raw nodes.");
    return;
  }
  const uri = /^[a-z]:[\\/]/i.test(gamePath) ? vscode.Uri.file(gamePath) : vscode.Uri.from({ scheme: "redcode-game", path: "/" + gamePath.replace(/\\/g, "/") });
  await vscode.commands.executeCommand("vscode.openWith", uri, "redcode.cr2w");
}
