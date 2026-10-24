// The Storyboard: the main editor of a story file (<id>.quest.yaml), agreed 2026-10-23. The quest's beats
// as cards titled with their objectives, arrows to the beats that follow (labelled with the choice that
// leads there), and a page per beat with its steps, scenes, lines and how each line is spoken. Every edit
// is a change to the story file's text (comments kept), so undo, save and the YAML stay the source; the
// YAML is one click away.

import * as path from "path";
import * as vscode from "vscode";
import {
  addBeat, assignVoiceIds, boardModel, convertToBeats, deleteBeat, edgewaveLines, readStory, renameObjective, sceneLines, setChoiceGo, setLineVoice, setTodoDone,
  voiceArchiveDir, StoryEditError,
} from "./core";

type Path = (string | number)[];

type Message =
  | { type: "ready" }
  | { type: "yaml"; line?: number }
  | { type: "addBeat"; after?: string }
  | { type: "rename"; beat: string }
  | { type: "delete"; beat: string }
  | { type: "go"; option: Path; beat?: string }
  | { type: "voice"; line: Path; direction: string; say: string }
  | { type: "todo"; index: number; done: boolean }
  | { type: "convert" }
  | { type: "generate"; scene: string; line?: Path }
  | { type: "make" }
  | { type: "made" };

/** The part of EDGEwave's API (version 1, the EDGEwave #5 contract) EDGEquest uses. */
interface EDGEwaveApi {
  readonly apiVersion: 1;
  voiceLines(o: { quest: string; lines: ReturnType<typeof edgewaveLines>; archiveDir?: string }): Promise<unknown>;
}

export class StoryboardEditor implements vscode.CustomTextEditorProvider {
  static readonly viewType = "edgequest.storyboard";

  constructor(private readonly context: vscode.ExtensionContext, private readonly log: (line: string) => void) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    panel.webview.html = this.html(panel.webview, media);
    const post = () => {
      try {
        void panel.webview.postMessage({ type: "model", model: boardModel(document.getText(), document.uri.fsPath) });
      } catch (e) {
        this.log(`Storyboard: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    let timer: NodeJS.Timeout | undefined;
    const later = () => { clearTimeout(timer); timer = setTimeout(post, 200); };
    // EDGEwave's record changes the lines' take status.
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(document.uri.fsPath), "source/raw/edgewave/voice/**/voice.json"));
    const subs = [
      vscode.workspace.onDidChangeTextDocument((e) => { if (e.document.uri.toString() === document.uri.toString()) later(); }),
      watcher, watcher.onDidChange(later), watcher.onDidCreate(later), watcher.onDidDelete(later),
    ];
    panel.onDidDispose(() => subs.forEach((s) => s.dispose()));
    panel.webview.onDidReceiveMessage((m: Message) => void this.handle(m, document, post).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (!(e instanceof StoryEditError)) this.log(`Storyboard: ${msg}`);
      void vscode.window.showWarningMessage(msg);
    }));
  }

  private async edit(document: vscode.TextDocument, change: (text: string) => string): Promise<void> {
    const next = change(document.getText());
    if (next === document.getText()) return;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), next);
    await vscode.workspace.applyEdit(edit);
  }

  private async handle(m: Message, document: vscode.TextDocument, post: () => void): Promise<void> {
    switch (m.type) {
      case "ready": return post();
      case "yaml": {
        const editor = await vscode.window.showTextDocument(document.uri, { viewColumn: vscode.ViewColumn.Beside, preview: false });
        if (m.line) {
          const at = new vscode.Position(Math.max(0, m.line - 1), 0);
          editor.selection = new vscode.Selection(at, at);
          editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenter);
        }
        return;
      }
      case "addBeat": {
        const objective = await vscode.window.showInputBox({ title: "New beat", prompt: "Its objective: what the journal tells the player to do", placeHolder: "Find out who left the shard" });
        if (!objective) return;
        return this.edit(document, (t) => addBeat(t, objective, m.after).text);
      }
      case "rename": {
        const current = readStory(document.getText()).story?.beats.find((b) => b.name === m.beat)?.objective;
        const objective = await vscode.window.showInputBox({ title: `Objective of ${m.beat}`, value: current, prompt: "What the journal tells the player to do" });
        if (!objective) return;
        return this.edit(document, (t) => renameObjective(t, m.beat, objective));
      }
      case "delete": {
        const ok = await vscode.window.showWarningMessage(`Delete the beat ${m.beat}? Anything that goes on to it will need another beat.`, { modal: true }, "Delete");
        if (ok !== "Delete") return;
        return this.edit(document, (t) => deleteBeat(t, m.beat));
      }
      case "go": return this.edit(document, (t) => setChoiceGo(t, m.option, m.beat || undefined));
      case "voice": return this.edit(document, (t) => setLineVoice(t, m.line, { direction: m.direction, say: m.say }));
      case "todo": return this.edit(document, (t) => setTodoDone(t, m.index, m.done));
      case "convert": return this.edit(document, convertToBeats);
      case "generate": return this.generate(document, m.scene, m.line);
      case "make": return void vscode.commands.executeCommand("edgequest.make", document.uri);
      case "made": return void vscode.commands.executeCommand("edgequest.madeFiles", document.uri);
    }
  }

  /** Voices a scene's lines, or one, through EDGEwave. A take is kept by the line's id, so every line gets a
   *  voice id first. */
  private async generate(document: vscode.TextDocument, scene: string, line?: Path): Promise<void> {
    const ext = vscode.extensions.getExtension<EDGEwaveApi>("edgemodders.edgewave");
    if (!ext) {
      const pick = await vscode.window.showInformationMessage("Voice takes come from EDGEwave, the EDGE sound studio (edgemodders.edgewave). Install it to voice lines.", "Show EDGEwave");
      if (pick) void vscode.commands.executeCommand("workbench.extensions.search", "edgemodders.edgewave");
      return;
    }
    await this.edit(document, (t) => assignVoiceIds(t, true).text);
    const story = readStory(document.getText()).story;
    const spec = story?.scenes.get(scene);
    if (!story || !spec) throw new StoryEditError("Fix the story file's problems first: they are listed at the top of the Storyboard.");
    let lines = sceneLines(story, spec);
    if (line) lines = lines.filter((l) => JSON.stringify(l.path) === JSON.stringify(line));
    if (!lines.length) return;
    const api = ext.isActive ? ext.exports : await ext.activate();
    if (api?.apiVersion === 1 && typeof api.voiceLines === "function") {
      if (document.isDirty) await document.save();
      await api.voiceLines({ quest: story.id, lines: edgewaveLines(lines), archiveDir: voiceArchiveDir(story) });
      return;
    }
    // EDGEwave cannot be asked yet (EDGEwave #5): hand the line over by hand.
    const l = lines[0];
    await vscode.env.clipboard.writeText(l.voice?.say ?? l.text);
    void vscode.window.showInformationMessage(
      `This EDGEwave cannot voice lines for EDGEquest yet (its Voice Lines is coming). ${lines.length === 1 ? "The line is" : `The first of ${lines.length} lines is`} copied, as spoken: paste it into EDGEwave's Speak Line to hear it.`,
    );
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
    const css = webview.asWebviewUri(vscode.Uri.joinPath(media, "storyboard.css"));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(media, "storyboard.js"));
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head>
<body><div id="app"><p class="muted">Reading the story…</p></div>
<script nonce="${nonce}" src="${js}"></script></body></html>`;
  }
}
