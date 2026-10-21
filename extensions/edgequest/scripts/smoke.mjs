// Smoke test: EDGEquest's core against the installed game, through REDbridge. Build first (npm run build).
// Finds the game and the bridge from the VS Code settings, reads the root quest, a side quest's phase
// and one of its scenes in plain words, and checks the quest index when it is built.
//   npm run smoke

import { createRequire } from "node:module";
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
  }
} catch (e) {
  check(false, "smoke test", e instanceof Error ? e.message : String(e));
} finally {
  bridge.stop();
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
