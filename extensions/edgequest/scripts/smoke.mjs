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
    check(scene.lines.length === 4 && scene.options.length === 2 && scene.lines.every((l) => l.text), "the made scene reads back with its lines and choice", `${scene.lines.length} lines, ${scene.options.length} options`);
    const store = sceneJson.Data.RootChunk.screenplayStore;
    const ids = [...store.lines.map((l) => l.itemId.id), ...store.options.map((o) => o.itemId.id)];
    check(store.lines.every((l, k) => l.itemId.id === k * 256 + 1) && store.options.every((o, k) => o.itemId.id === k * 256 + 2), "the made scene's lines and options are numbered by their place, as the game's are", ids.join(", "));
    const map = JSON.parse((await bridge.fileToJson(path.join(archive, "loc", "en-us", "subtitlemap.json"))).json).Data.RootChunk.root.Data;
    check(map.$type === "localizationPersistenceSubtitleMap" && map.entries.length === 1, "the .xl's subtitles entry is a subtitle map naming the scene's lines", map.$type);
    const listed = made.checklist.map((i) => i.found ?? i.do);
    check(made.storyUpdated && listed.join() === "description,voice/arrival" && /found: voice\/arrival/.test(fs.readFileSync(storyFile, "utf8")) && /^# EDGEquest story file/.test(fs.readFileSync(storyFile, "utf8")),
      "the checklist lists the template's stand-ins and the story file keeps them, comments kept", listed.join(", "));
    // A hand-written item, a ticked one, a written description, a scene gone: the list follows.
    const edited = fs.readFileSync(storyFile, "utf8").replace(/^description: .*$/m, "description: A real one.").replace(/^todo:\n/m, "todo:\n  - Decide what the reward is\n  - do: Name the bar\n    done: true\n");
    const synced = core.syncChecklist(edited, [{ found: "description", do: "x", settled: true }, { found: "voice/other", do: "Voice the 2 lines in the scene other.", tool: "EDGEwave", settled: false }]);
    check(synced.items.map((i) => `${i.found ?? i.do}${i.done ? "+" : ""}`).join() === "Decide what the reward is,Name the bar+,description+,voice/other", "the checklist keeps hand-written items, ticks settled ones and drops what is gone",
      synced.items.map((i) => `${i.found ?? i.do}${i.done ? " (done)" : ""}`).join(", "));
    fs.appendFileSync(path.join(archive, "smoke_test.journal"), Buffer.from([0]));
    const again = await core.makeQuest(proj, storyFile, bridge, { index: idx, noCheck: true });
    const kept = again.files.find((f) => f.file.endsWith(".journal"))?.result;
    check(kept === "kept" && again.files.filter((f) => f.result === "unchanged").length === 6, "a made file changed by hand is kept, the rest are unchanged", again.files.map((f) => f.result).join(", "));
    check(!again.storyUpdated && again.checklist.length === 2, "making again leaves the story file's checklist as it is", `${again.checklist.length} items`);
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
