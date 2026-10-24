// Smoke test: EDGEquest's core against the installed game, through REDbridge. Build first (npm run build).
// Finds the game and the bridge from the VS Code settings, reads the root quest, a side quest's phase
// and one of its scenes in plain words, checks the quest index when it is built, and makes the New Quest
// template in a throwaway WolvenKit project and reads it back.
//   npm run smoke

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

let failures = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
};

const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
check(!!game, "game folder", game ? `${game.path} (${game.from})` : "not found");
const choice = core.resolveBridge(settings);
check(!!choice, "REDbridge", choice ? `${choice.exe} (${choice.from})` : "not found");
if (!game || !choice) process.exit(1);

const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.start();
try {
  let info = await bridge.info();
  if (!info.gameLoaded) info = await bridge.load(game.path);
  check(info.gameLoaded, "game loaded", `REDbridge ${info.version}, ${info.archives} archives`);

  const files = await core.listGameFiles(bridge, ".quest", ".questphase");
  check(files.length > 4000, "quest and phase files", String(files.length));

  const read = async (p) => JSON.parse((await bridge.toJson(p)).json);

  const root = core.readQuestFile(await read("base\\quest\\cyberpunk2077.quest"));
  const rootSteps = core.steps(root.graph, root.handles);
  check(rootSteps.some((s) => s.phase?.endsWith("cyberpunk2077.questphase")), "the root quest plays cyberpunk2077.questphase");

  const sq030 = core.readQuestFile(await read("base\\quest\\side_quests\\sq030\\phases\\sq030.questphase"));
  const sum = core.summarize(sq030.graph, sq030.handles);
  const all = (g) => g.nodes.reduce((a, n) => a + 1 + (n.inner ? all(n.inner) : 0), 0);
  check(all(sq030.graph) > 400, "sq030.questphase reads, inline phases included", `${all(sq030.graph)} nodes, ${sq030.graph.nodes.length} at the top`);
  check(sum.facts.length > 0 && sum.journal.length > 0 && sum.scenes.length > 0, "sq030 uses facts, journal entries and scenes", `${sum.facts.length} facts, ${sum.journal.length} journal entries, ${sum.scenes.length} scenes`);
  const md = core.questMarkdown("sq030", sq030);
  check(/Wait until|If |Set fact|Journal:/.test(md), "sq030 in plain words");
  check(!/Phase 0\b/.test(md) && !sum.phases.includes("0") && !sum.scenes.includes("0"), "inline phases do not read as a phase file \"0\"");

  const scene = core.readScene(await read("base\\quest\\side_quests\\sq030\\scenes\\sq030_01_dam_meetup.scene"));
  check(scene.lines.length === 59 && scene.options.length === 13, "sq030_01_dam_meetup lines, and options in its choices", `${scene.lines.length} lines, ${scene.options.length} options`);
  check(scene.actors.some((a) => a.player), "the scene has the player");
  check(scene.lines.filter((l) => l.text).length >= 50, "scene lines have text", `${scene.lines.length - scene.missingText} of ${scene.lines.length}`);

  const idx = core.loadIndex(core.defaultCacheDir());
  if (!idx) console.log("skip quest index: not built (the extension builds it; or the MCP tool quest_index build)");
  else {
    check(await core.isIndexCurrent(idx, bridge), "quest index matches the game", `${idx.files.length} files, built ${idx.builtAt}`);
    const hits = core.findQuests(idx, "pyramid song", 10);
    check(hits.some((h) => h.file.path.includes("sq030")), "find \"pyramid song\" finds sq030", `${hits.length} hits`);
    const parents = core.usedBy(idx, "base\\quest\\side_quests\\sq030\\phases\\sq030.questphase");
    check(parents.length > 0, "sq030.questphase is played by another file", parents.map((p) => p.path).join(", "));
    const door = idx.places?.[core.DefaultPlaceMarker];
    check(Object.keys(idx.places ?? {}).length > 3000 && door?.node === "#mq055_mp_megabuilding_apartment", "the index knows the game's map markers and their world nodes",
      `${Object.keys(idx.places ?? {}).length}; V's door: ${door?.node} at ${door?.at}`);
    const home = idx.areas?.[core.DefaultPlaceArea];
    check(Object.keys(idx.areas ?? {}).length > 5000 && !!door?.area && home?.prefabs.includes("#mq000_pr_apartment"), "the index knows the game's quest trigger areas and their prefabs",
      `${Object.keys(idx.areas ?? {}).length}; V's door marker's own area: ${door?.area}; ${core.DefaultPlaceArea} in ${home?.prefabs}`);
  }

  // Writing: the New Quest template, made in a throwaway WolvenKit project, read back.
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "edgequest-smoke-"));
  try {
    fs.writeFileSync(path.join(proj, "smoke.cpmodproj"), "<CP77Mod><Name>smoke</Name></CP77Mod>");
    const storyFile = path.join(proj, "smoke_test.quest.yaml");
    fs.writeFileSync(storyFile, core.storyTemplate({ title: "Smoke Test", id: "smoke_test", author: "edgequest" }));
    const made = await core.makeQuest(proj, storyFile, bridge, { index: idx });
    const errors = made.findings.filter((f) => f.level !== "info");
    check(!made.problems.length && made.files.filter((f) => f.result === "written").length === 7 && !errors.length, "the template makes 7 files that pass quest_check",
      [...made.problems.map((p) => p.message), ...errors.map((f) => f.message)].join("; ") || made.files.map((f) => f.file.split("/").pop()).join(", "));
    const archive = path.join(proj, "source", "archive", "mod", "edgequest", "smoke_test");
    const phaseJson = JSON.parse((await bridge.fileToJson(path.join(archive, "smoke_test.questphase"))).json);
    const words = core.questMarkdown("smoke", core.readQuestFile(phaseJson));
    check(/Wait until V is inside #mq000_tr_vs_apartment/.test(words) && /Scene arrival/.test(words) && /quest quests\/side_quest\/smoke_test becomes succeeded/.test(words), "the made phase reads back as its steps",
      words.split("\n").find((l) => /Wait until/.test(l)) ?? "");
    check(core.worldRefs(phaseJson).prefabs.join() === "#mq000_pr_apartment", "the made phase lists the area's world prefab", core.worldRefs(phaseJson).prefabs.join());
    const journal = JSON.parse((await bridge.fileToJson(path.join(archive, "smoke_test.journal"))).json);
    check(JSON.stringify(journal).includes("#mq055_mp_megabuilding_apartment"), "the made marker stands on the game marker's world node");
    const sceneJson = JSON.parse((await bridge.fileToJson(path.join(archive, "scenes", "arrival.scene"))).json);
    const scene = core.readScene(sceneJson);
    check(scene.lines.length === 3 && scene.options.length === 2 && scene.lines.every((l) => l.text), "the made scene reads back with its lines and choice", `${scene.lines.length} lines, ${scene.options.length} options`);
    // Beats: each choice leaves the scene by its own exit, and the phase's scene node has an output for each.
    const exits = sceneJson.Data.RootChunk.exitPoints.map((x) => x.name.$value).join();
    let sceneNode;
    const find = (x) => { if (Array.isArray(x)) x.forEach(find); else if (x && typeof x === "object") { if (x.$type === "questSceneNodeDefinition") sceneNode = x; Object.values(x).forEach(find); } };
    find(phaseJson);
    const outs = (sceneNode?.sockets ?? []).map((s) => s.Data).filter((d) => d?.type === "Output").map((d) => d.name.$value).join();
    check(exits === "end,go_look,go_leave" && outs === "end,go_look,go_leave", "a choice that goes on to a beat leaves the scene by its own exit, and the phase follows it", `scene exits ${exits}; phase scene outputs ${outs}`);
    const board = core.storyboard(made.story);
    const arrows = board.arrows.map((a) => `${a.from}>${a.to}${a.choice ? `:${a.choice}` : ""}`).join();
    check(arrows === "arrive>look:Look around,arrive>leave:Leave" && board.cards.filter((c) => c.ending === "succeeded").length === 2, "the storyboard has the template's beats, its branch and its two endings", arrows);
    const store = sceneJson.Data.RootChunk.screenplayStore;
    const ids = [...store.lines.map((l) => l.itemId.id), ...store.options.map((o) => o.itemId.id)];
    check(store.lines.every((l, k) => l.itemId.id === k * 256 + 1) && store.options.every((o, k) => o.itemId.id === k * 256 + 2), "the made scene's lines and options are numbered by their place, as the game's are", ids.join(", "));
    const map = JSON.parse((await bridge.fileToJson(path.join(archive, "loc", "en-us", "subtitlemap.json"))).json).Data.RootChunk.root.Data;
    check(map.$type === "localizationPersistenceSubtitleMap" && map.entries.length === 1, "the .xl's subtitles entry is a subtitle map naming the scene's lines", map.$type);
    const listed = made.checklist.map((i) => i.found ?? i.do);
    check(made.storyUpdated && listed.join() === "description,voice-prompt/arrival,voice/arrival" && /found: voice\/arrival/.test(fs.readFileSync(storyFile, "utf8")) && /^# EDGEquest story file/.test(fs.readFileSync(storyFile, "utf8")),
      "the checklist lists the template's stand-ins and the story file keeps them, comments kept", listed.join(", "));
    // A hand-written item, a ticked one, a written description, a scene gone: the list follows.
    const edited = fs.readFileSync(storyFile, "utf8").replace(/^description: .*$/m, "description: A real one.").replace(/^todo:\n/m, "todo:\n  - Decide what the reward is\n  - do: Name the bar\n    done: true\n");
    const synced = core.syncChecklist(edited, [{ found: "description", do: "x", settled: true }, { found: "voice/other", do: "Voice the 2 lines in the scene other.", tool: "EDGEwave", settled: false }]);
    check(synced.items.map((i) => `${i.found ?? i.do}${i.done ? "+" : ""}`).join() === "Decide what the reward is,Name the bar+,description+,voice/other", "the checklist keeps hand-written items, ticks settled ones and drops what is gone",
      synced.items.map((i) => `${i.found ?? i.do}${i.done ? " (done)" : ""}`).join(", "));
    // A story from before beats (a steps: list) still reads, a beat per objective; go: and next: are checked.
    const old = core.readStory("quest: Old\nid: old\nauthor: me\nsteps:\n  - objective: One\n  - wait: 1\n  - objective: Two\n  - done\n");
    check(old.story?.beats.map((b) => `${b.name}>${b.next ?? "end"}`).join() === "01>02,02>end", "a story with a steps: list reads as beats, one per objective", old.problems.map((p) => p.message).join("; ") || old.story.beats.map((b) => b.name).join());
    const bad = core.readStory("quest: Bad\nid: bad\nauthor: me\nbeats:\n  a:\n    objective: A\n    steps: [ { scene: s } ]\n    next: nowhere\nscenes:\n  s:\n    - go: b\n    - V: Too late.\n");
    check(bad.problems.length === 3 && bad.problems.every((p) => p.line), "a go: to no beat, a go: not last, and a next: to no beat are named with their lines", bad.problems.map((p) => `${p.line}: ${p.message}`).join(" | "));
    fs.appendFileSync(path.join(archive, "smoke_test.journal"), Buffer.from([0]));
    const again = await core.makeQuest(proj, storyFile, bridge, { index: idx, noCheck: true });
    const kept = again.files.find((f) => f.file.endsWith(".journal"))?.result;
    check(kept === "kept" && again.files.filter((f) => f.result === "unchanged").length === 6, "a made file changed by hand is kept, the rest are unchanged", again.files.map((f) => f.result).join(", "));
    check(!again.storyUpdated && again.checklist.length === 3, "making again leaves the story file's checklist and voice ids as they are", `${again.checklist.length} items`);

    // Voice: the template's voice: block got an id, and its line's text id comes from it.
    const storyNow = fs.readFileSync(storyFile, "utf8");
    const vid = storyNow.match(/voice:[^\n]*\n\s+id: ([a-z0-9]+)/)?.[1];
    const first = store.lines[0].locstringId.ruid;
    check(!!vid && first === core.lineKey({ id: "smoke_test" }, "arrival", "main/0", vid) && /# how the line is spoken/.test(storyNow), "a voice: block gets an id once, and its line's id comes from it (comments kept)", `id ${vid}, line ${first}`);
    // EDGEwave's record: a take of the line as it is counts; a take of what it said before does not.
    const lines0 = core.storyLines(made.story.id === "smoke_test" ? core.readStory(storyNow).story : made.story);
    const rec = (say) => ({ edgewave: "voice", version: 1, quest: "smoke_test", lines: { [lines0[0].id]: { scene: "arrival", speaker: "V", text: lines0[0].text, say, direction: lines0[0].voice.direction, female: "a.wav", male: "b.wav" } } });
    const vf = core.voiceFile(proj, "smoke_test");
    fs.mkdirSync(path.dirname(vf), { recursive: true });
    fs.writeFileSync(vf, JSON.stringify(rec(lines0[0].voice.say)));
    const madeOne = core.storyChecklist(storyNow, proj).items.find((i) => i.found === "voice/arrival")?.do;
    fs.writeFileSync(vf, JSON.stringify(rec("[shouts] Here it is!")));
    const staleOne = core.storyChecklist(storyNow, proj).items.find((i) => i.found === "voice/arrival")?.do;
    check(/^Voice 2 of the 3 lines/.test(madeOne ?? "") && /1 changed since its take/.test(staleOne ?? ""), "the voice item counts takes from EDGEwave's voice.json, and a changed line's take as out of date", `${madeOne} / ${staleOne}`);
    // The Storyboard: its model of the template, and its edits, each a change to the story file's text.
    const m = core.boardModel(storyNow, storyFile);
    const p = m.board.pos;
    const opts = m.beats.arrive.scenes[0].rows.filter((r) => r.kind === "option").map((r) => `${r.text}>${r.go}`).join();
    check(p.look.x === p.leave.x && p.look.x > p.arrive.x && p.look.y !== p.leave.y && opts === "Look around>look,Leave>leave" && m.checklist.length === 3,
      "the Storyboard lays out the template: the start, then its two endings side by side; each option says where it goes", `${opts}; arrive ${p.arrive.x}, look ${p.look.x},${p.look.y}, leave ${p.leave.x},${p.leave.y}`);
    let t = core.addBeat(storyNow, "Celebrate the find", "look");
    const added = t.name;
    t = core.setChoiceGo(t.text, ["scenes", "arrival", 1, "choice", "Leave"], added);
    t = core.renameObjective(t, added, "Celebrate");
    t = core.setLineVoice(t, ["scenes", "arrival", 1, "choice", "Leave", 0], { direction: "Flat, already walking away.", say: "" });
    t = core.setTodoDone(t, 0, true);
    const edited2 = core.readStory(t);
    const b2 = edited2.story && core.storyboard(edited2.story);
    const leaveLine = edited2.story?.scenes.get("arrival").items[1].options[1].then[0];
    check(added === "celebrate_the_find" && !!b2 && b2.arrows.some((a) => a.to === added && a.choice === "Leave") && edited2.story.beats.map((b) => b.name).join() === "arrive,look,celebrate_the_find,leave" &&
      leaveLine.voice?.direction === "Flat, already walking away." && edited2.story.todo[0].done && /^# EDGEquest story file/.test(t),
      "Storyboard edits: add a beat, send a choice to it, rename it, say how a line is spoken, tick an item; comments kept", edited2.problems.map((x) => x.message).join("; ") || b2.arrows.map((a) => `${a.from}>${a.to}`).join());
    const gone = core.readStory(core.deleteBeat(t, added));
    check(gone.problems.length === 1 && /go: "celebrate_the_find" is not one of the beats/.test(gone.problems[0].message), "deleting a beat a choice goes to leaves one problem naming it", gone.problems.map((x) => x.message).join("; "));
    // What assistants edit with (quest_edit): an option found by its text, any value set by its path.
    const s0 = core.readStory(storyNow).story;
    const opt = core.optionPath(s0, "arrival", "Leave");
    const set = core.readStory(core.setPath(storyNow, ["beats", "leave", "steps"], [{ wait: 1 }, "failed"])).story;
    check(JSON.stringify(opt) === '["scenes","arrival",1,"choice","Leave"]' && set?.beats.find((b) => b.name === "leave").steps.map((x) => x.kind).join() === "wait,failed",
      "an option is found by its text, and any value can be set by its path", JSON.stringify(opt));
    const conv = core.readStory(core.convertToBeats("quest: Old\nid: old\nauthor: me\nsteps:\n  - objective: One   # first\n  - wait: 1\n  - objective: Two\n  - done\n"));
    check(conv.story?.beats.map((b) => `${b.name}:${b.steps.length}`).join() === "01:1,02:1", "Convert to beats turns a steps: list into beats", conv.problems.map((x) => x.message).join("; "));
    const every = core.assignVoiceIds(storyNow, true);
    const after = core.readStory(every.text).story;
    check(every.added === 2 && core.storyLines(after).every((l) => l.voice?.id), "preparing for voicing gives every line a voice id, and nothing else", `${every.added} added`);
  } finally {
    fs.rmSync(proj, { recursive: true, force: true });
  }
} catch (e) {
  check(false, "smoke test", e instanceof Error ? e.message : String(e));
} finally {
  bridge.stop();
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
