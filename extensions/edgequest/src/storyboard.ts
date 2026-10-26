// The Storyboard: the main editor of a story file (<id>.quest.yaml), agreed 2026-10-23. The quest's beats
// as cards titled with their objectives, arrows to the beats that follow (labelled with the choice that
// leads there), and a page per beat with its steps, scenes, lines and how each line is spoken. Every edit
// is a change to the story file's text (comments kept), so undo, save and the YAML stay the source; the
// YAML is one click away.

import * as path from "path";
import * as vscode from "vscode";
import {
  setPath, addBeat, addOption, addScene, assignVoiceIds, boardModel, convertToBeats, deleteBeat, edgewaveLines, insertItem, moveItem, moveOption, readStory, removeItem, removeOption,
  renameObjective, renameOption, sceneLines, setChoiceGo, setLine, setLineVoice, setThen, setTodoDone,
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
  | { type: "then"; beat: string; then: string }
  | { type: "voice"; line: Path; direction: string; say: string }
  | { type: "todo"; index: number; done: boolean }
  | { type: "convert" }
  | { type: "generate"; scene: string; line?: Path }
  | { type: "make" }
  | { type: "made" }
  | { type: "insert"; list: Path; index: number; what: "line" | "choice"; speaker?: string }
  | { type: "move"; list: Path; from: number; to: number }
  | { type: "remove"; list: Path; index: number; what: string }
  | { type: "line"; line: Path; speaker?: string; text?: string }
  | { type: "addOption"; choice: Path }
  | { type: "renameOption"; choice: Path; option: string; to: string }
  | { type: "moveOption"; choice: Path; option: string; by: number }
  | { type: "removeOption"; choice: Path; option: string }
  | { type: "addStep"; beat: string }
  | { type: "addSound"; list: Path; index: number }
  | { type: "editSound"; at: Path; kind: "music" | "sound"; event: string }
  | { type: "moveStep"; beat: string; from: number; to: number }
  | { type: "removeStep"; beat: string; index: number };

/** The part of EDGEwave's API (version 1: the EDGEwave #5 and #7 contracts) EDGEquest uses. */
interface EDGEwaveApi {
  readonly apiVersion: 1;
  voiceLines(o: { quest: string; lines: ReturnType<typeof edgewaveLines>; archiveDir?: string; project?: string }): Promise<unknown>;
  /** The project's own sounds (with `project`), then the game's events. */
  soundEvents?(o: { query?: string; music?: boolean; quest?: boolean; limit?: number; project?: string }): Promise<{ name: string; loops: boolean; min: number; max: number; tags: string[]; music: boolean; quest: boolean; project?: { type: string; file?: string }; replaces?: boolean }[]>;
  /** `show: false` plays at once with no tab (EDGEwave #8, Windows); otherwise the Hear panel. */
  playEvent?(o: { name: string; project?: string; show?: boolean }): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Stops what playEvent plays with show: false. Not in builds before EDGEwave #8. */
  stopSound?(): Promise<void> | void;
}

/** EDGEwave's API when it is installed and can be asked; undefined otherwise. */
async function edgewave(): Promise<EDGEwaveApi | undefined> {
  const ext = vscode.extensions.getExtension<EDGEwaveApi>("edgemodders.edgewave");
  if (!ext) return undefined;
  const api = ext.isActive ? ext.exports : await ext.activate().then((a) => a, () => undefined);
  return api?.apiVersion === 1 ? api : undefined;
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
      case "then": return this.edit(document, (t) => setThen(t, m.beat, m.then));
      case "voice": return this.edit(document, (t) => setLineVoice(t, m.line, { direction: m.direction, say: m.say }));
      case "todo": return this.edit(document, (t) => setTodoDone(t, m.index, m.done));
      case "convert": return this.edit(document, convertToBeats);
      case "generate": return this.generate(document, m.scene, m.line);
      case "make": return void vscode.commands.executeCommand("edgequest.make", document.uri);
      case "made": return void vscode.commands.executeCommand("edgequest.madeFiles", document.uri);
      case "insert": {
        if (m.what === "line") {
          const words = await vscode.window.showInputBox({ title: "New line", prompt: `What ${m.speaker ?? "V"} says` });
          if (!words) return;
          return this.edit(document, (t) => insertItem(t, m.list, m.index, { [m.speaker ?? "V"]: words }));
        }
        const first = await vscode.window.showInputBox({ title: "New choice (1/2)", prompt: "The first option, as the player sees it", placeHolder: "Take the shard" });
        if (!first) return;
        const second = await vscode.window.showInputBox({ title: "New choice (2/2)", prompt: "The second option (more can be added after)", placeHolder: "Leave it" });
        const options: Record<string, unknown[]> = { [first.trim()]: [] };
        if (second?.trim() && second.trim() !== first.trim()) options[second.trim()] = [];
        return this.edit(document, (t) => insertItem(t, m.list, m.index, { choice: options }));
      }
      case "move": return this.edit(document, (t) => moveItem(t, m.list, m.from, m.to));
      case "remove": {
        if (m.what === "choice") {
          const ok = await vscode.window.showWarningMessage("Delete this choice, with its options and everything in them?", { modal: true }, "Delete");
          if (ok !== "Delete") return;
        }
        return this.edit(document, (t) => removeItem(t, m.list, m.index));
      }
      case "line": return this.edit(document, (t) => setLine(t, m.line, { speaker: m.speaker, text: m.text }));
      case "addOption": {
        const option = await vscode.window.showInputBox({ title: "New option", prompt: "As the player sees it" });
        if (!option) return;
        return this.edit(document, (t) => addOption(t, m.choice, option));
      }
      case "renameOption": return this.edit(document, (t) => renameOption(t, m.choice, m.option, m.to));
      case "moveOption": return this.edit(document, (t) => moveOption(t, m.choice, m.option, m.by));
      case "removeOption": {
        const ok = await vscode.window.showWarningMessage(`Delete the option "${m.option}", with everything in it?`, { modal: true }, "Delete");
        if (ok !== "Delete") return;
        return this.edit(document, (t) => removeOption(t, m.choice, m.option));
      }
      case "addStep": return this.addStep(document, m.beat);
      case "addSound": {
        const event = await pickSound("sound", path.dirname(document.uri.fsPath));
        if (!event) return;
        return this.edit(document, (t) => insertItem(t, m.list, m.index, { sound: event }));
      }
      case "editSound": {
        const event = await pickSound(m.kind, path.dirname(document.uri.fsPath), m.event);
        if (!event || event === m.event) return;
        return this.edit(document, (t) => setPath(t, [...m.at, m.kind], event));
      }
      case "moveStep": return this.edit(document, (t) => moveItem(t, ["beats", m.beat, "steps"], m.from, m.to));
      case "removeStep": return this.edit(document, (t) => removeItem(t, ["beats", m.beat, "steps"], m.index));
    }
  }

  /** Adds a step to a beat, asking what kind; a new step goes before the beat's ending, if it has one. */
  private async addStep(document: vscode.TextDocument, beat: string): Promise<void> {
    const story = readStory(document.getText()).story;
    const b = story?.beats.find((x) => x.name === beat);
    if (!story || !b) throw new StoryEditError("Fix the story file's problems first: they are listed above the beat's page.");
    const ending = b.steps.findIndex((s) => s.kind === "done" || s.kind === "failed");
    const kinds: (vscode.QuickPickItem & { step: string })[] = [
      { label: "$(location) Arrive at a place", detail: "Waits until V is inside the place's trigger area", step: "arrive" },
      { label: "$(comment-discussion) Play a scene", detail: "Lines and choices, here or in a new scene", step: "scene" },
      { label: "$(watch) Wait", detail: "A number of seconds", step: "wait" },
      { label: "$(symbol-variable) Set a fact", detail: "Remember something for later; the quest's id is put in front", step: "set" },
      { label: "$(music) Music", detail: "Start or stop a music cue: the game's own, by name (a cue's _STOP ends it)", step: "music" },
      { label: "$(unmute) Sound", detail: "Play a sound on V: one of the game's, or a custom sound made with EDGEwave", step: "sound" },
      ...(ending < 0 ? [{ label: "$(pass) The quest succeeds", detail: "Ends the quest here", step: "done" }, { label: "$(error) The quest fails", detail: "Ends the quest here", step: "failed" }] : []),
    ];
    const pick = await vscode.window.showQuickPick(kinds, { title: `New step in ${b.objective}` });
    if (!pick) return;
    let step: unknown, scene: string | undefined;
    switch (pick.step) {
      case "arrive": {
        const places = [...story.places.keys()];
        if (!places.length) throw new StoryEditError("The story has no places yet: add one under places: in the YAML (a game map marker), then arrive there.");
        const place = places.length === 1 ? places[0] : await vscode.window.showQuickPick(places, { title: "Arrive where?" });
        if (!place) return;
        step = { arrive: place };
        break;
      }
      case "scene": {
        const NewScene = "$(add) New scene...";
        const chosen = await vscode.window.showQuickPick([NewScene, ...story.scenes.keys()], { title: "Which scene?" });
        if (!chosen) return;
        if (chosen === NewScene) {
          const name = await vscode.window.showInputBox({ title: "New scene", prompt: "Its name: lower case letters, digits and _", validateInput: (v) => (/^[a-z][a-z0-9_]*$/.test(v) ? story.scenes.has(v) ? "There is a scene with this name already." : undefined : "Lower case letters, digits and _, starting with a letter.") });
          if (!name) return;
          scene = name;
          step = { scene: name };
        } else step = { scene: chosen };
        break;
      }
      case "wait": {
        const s = await vscode.window.showInputBox({ title: "Wait", prompt: "Seconds", value: "3", validateInput: (v) => (Number(v) > 0 ? undefined : "A number of seconds, more than 0.") });
        if (!s) return;
        step = { wait: Number(s) };
        break;
      }
      case "set": {
        const fact = await vscode.window.showInputBox({ title: "Set a fact", prompt: "Its name: lower case letters, digits and _", validateInput: (v) => (/^[a-z][a-z0-9_]*$/.test(v) ? undefined : "Lower case letters, digits and _, starting with a letter.") });
        if (!fact) return;
        step = { set: fact };
        break;
      }
      case "music":
      case "sound": {
        const event = await pickSound(pick.step, path.dirname(document.uri.fsPath));
        if (!event) return;
        step = { [pick.step]: event };
        break;
      }
      default: step = pick.step;
    }
    const at = ending >= 0 ? ending : b.steps.length;
    return this.edit(document, (t) => insertItem(scene ? addScene(t, scene) : t, ["beats", beat, "steps"], at, step));
  }

  /** Voices a scene's lines, or one, through EDGEwave. A take is kept by the line's id, so every line gets a
   *  voice id first. */
  private async generate(document: vscode.TextDocument, scene: string, line?: Path): Promise<void> {
    if (!vscode.extensions.getExtension("edgemodders.edgewave")) {
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
    const api = await edgewave();
    if (typeof api?.voiceLines === "function") {
      if (document.isDirty) await document.save();
      await api.voiceLines({ quest: story.id, lines: edgewaveLines(lines), archiveDir: voiceArchiveDir(story), project: path.dirname(document.uri.fsPath) });
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

const EventName = /^[A-Za-z0-9_]+$/;

/** Picks a music cue or a sound event: the project's own sounds and the game's, through EDGEwave, with Play
 *  on each; without EDGEwave, by typing its name. */
async function pickSound(kind: "music" | "sound", project: string, current?: string): Promise<string | undefined> {
  const typeIt = () => vscode.window.showInputBox({
    title: kind === "music" ? "Music cue" : "Sound", value: current,
    prompt: kind === "music" ? "A music cue's event name, such as mus_q104_drone_flight_01_START (its _STOP ends it)" : "A sound event's name, such as sa_airdrop_package_land, or edgewave_<name> for a custom sound from EDGEwave",
    validateInput: (v) => (EventName.test(v.trim()) ? undefined : "Letters, digits and _."),
  }).then((v) => v?.trim());
  const api = await edgewave();
  if (!api?.soundEvents) return typeIt();
  const play: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("play"), tooltip: "Play" };
  const TypeName = "$(edit) Type a name...";
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
  qp.title = kind === "music" ? "Music cue (game events from EDGEwave)" : "Sound (this project's and the game's, from EDGEwave)";
  qp.placeholder = kind === "music" ? "Search: q104 drone, start, stop..." : "Search: door, alarm, airdrop...";
  qp.matchOnDescription = true;
  // Play plays at once; where EDGEwave can only show its Hear panel, the list stays open while it plays,
  // until a sound is picked or Esc.
  qp.ignoreFocusOut = true;
  qp.value = current ?? "";
  let seq = 0;
  const search = async (q: string) => {
    const mine = ++seq;
    qp.busy = true;
    const found = await api.soundEvents!({ query: q, music: kind === "music" ? true : undefined, quest: !q && kind === "sound" ? true : undefined, limit: 200, project }).catch(() => []);
    if (mine !== seq) return;
    qp.busy = false;
    const secs = (e: { min: number; max: number }) => (e.max ? `${e.min === e.max ? e.max.toFixed(1) : `${e.min.toFixed(1)}–${e.max.toFixed(1)}`} s` : "");
    qp.items = [
      ...found.map((e) => ({
        label: e.name,
        description: [e.project ? (e.replaces ? "this project's, in place of the game's" : "this project's sound") : "", e.loops ? "loops" : "", secs(e), e.music && kind === "sound" ? "music" : ""].filter(Boolean).join(" · "),
        detail: e.tags.join(", ") || undefined, buttons: kind === "sound" || e.project ? [play] : [],
      })),
      { label: TypeName, alwaysShow: true, description: "a name not listed" },
    ];
  };
  let timer: NodeJS.Timeout | undefined;
  qp.onDidChangeValue((v) => { clearTimeout(timer); timer = setTimeout(() => void search(v), 200); });
  qp.onDidTriggerItemButton(async (e) => {
    let r = await api.playEvent?.({ name: e.item.label, project, show: false });
    // Builds before EDGEwave #8 ignore show and open the Hear panel; away from Windows, ask for the panel.
    if (r && !r.ok && process.platform !== "win32") r = await api.playEvent?.({ name: e.item.label, project });
    if (r && !r.ok) void vscode.window.showInformationMessage(r.reason);
  });
  void search(qp.value);
  const chosen = await new Promise<string | undefined>((resolve) => {
    qp.onDidAccept(() => { resolve(qp.selectedItems[0]?.label); qp.hide(); });
    qp.onDidHide(() => resolve(undefined));
    qp.show();
  });
  qp.dispose();
  void Promise.resolve(api.stopSound?.()).catch(() => undefined);
  return chosen === TypeName ? typeIt() : chosen;
}
