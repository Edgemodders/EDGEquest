// Makes a story's game files in a WolvenKit project: the .questphase, .journal, scenes, text files under
// source/archive, and the .archive.xl under source/resources. A made file changed by hand since EDGEquest
// last wrote it is noticed by its hash (kept in .edgequest/<id>.made.json) and not overwritten unless the
// caller says so. quest_check then runs on the project.

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { BridgeClient } from "../bridgeClient";
import { checkQuestMod, modFromFolder, type Finding } from "../check";
import type { Json } from "../graph";
import type { QuestIndex } from "../questIndex";
import { readStory, type Story, type StoryProblem } from "../story";
import { writeJournal, type PlacePosition } from "./journal";
import { layout, type Layout } from "./layout";
import { writePhase } from "./phase";
import { writeScene, type SceneText } from "./scene";
import { writeOnscreens, writeSubtitles } from "./texts";
import { Instances, cr2wJson } from "./wk";

export interface MadeFile {
  /** Path in the project, with forward slashes: source/archive/mod/... or source/resources/... */
  file: string;
  /** What happened: written, unchanged, or kept because it was changed by hand. */
  result: "written" | "unchanged" | "kept";
}

export interface MakeResult {
  story?: Story;
  problems: StoryProblem[];
  files: MadeFile[];
  findings: Finding[];
}

export interface MakeOptions {
  /** Overwrite made files changed by hand. */
  force?: boolean;
  /** The quest index: game map marker positions for places named by marker. */
  index?: QuestIndex;
  /** Skip quest_check (tests). */
  noCheck?: boolean;
}

export const isProject = (dir: string) => fs.existsSync(dir) && fs.readdirSync(dir).some((n) => n.toLowerCase().endsWith(".cpmodproj"));
const manifestFile = (project: string, id: string) => path.join(project, ".edgequest", `${id}.made.json`);
const sha1 = (b: Buffer) => crypto.createHash("sha1").update(b).digest("hex");

/** The .xl that loads the quest: the phase under the game's root quest, the journal and the texts. */
export function xlText(files: Layout): string {
  return `# Made by EDGEquest from the story file. Edit the story file, not this.
quest:
  phases:
    - path: ${files.phase}
      parent: cyberpunk2077.quest
journal:
  - ${files.journal}
localization:
  onscreens:
    en-us: ${files.onscreens("en-us")}
  subtitles:
    en-us: ${files.subtitles("en-us")}
`;
}

/** Makes every file from a story file in a WolvenKit project. */
export async function makeQuest(project: string, storyFile: string, bridge: BridgeClient, options: MakeOptions = {}): Promise<MakeResult> {
  const result: MakeResult = { problems: [], files: [], findings: [] };
  if (!isProject(project)) {
    result.problems.push({ at: "project", message: `${project} is not a WolvenKit project (no .cpmodproj). Make one in WolvenKit or REDcode first.` });
    return result;
  }
  const read = readStory(fs.readFileSync(storyFile, "utf8"));
  result.problems.push(...read.problems);
  if (!read.story) return result;
  const story = (result.story = read.story);
  const files = layout(story);
  const inst = Instances.fromBridge(bridge);

  const position: PlacePosition = (name) => {
    const p = story.places.get(name);
    if (p?.at) return p.at;
    if (p?.marker) return options.index?.places?.[p.marker];
    return undefined;
  };

  // Build everything in memory first, so a problem stops before any file is touched.
  const phase = await writePhase(story, files, inst);
  for (const p of phase.problems) result.problems.push({ at: `steps ${p.step}`, message: p.message });
  const journal = await writeJournal(story, files, inst, position);
  for (const m of journal.problems) result.problems.push({ at: "places", message: m });
  const sceneTexts: SceneText[] = [];
  const scenes: [string, Json][] = [];
  for (const spec of story.scenes.values()) {
    const s = await writeScene(story, spec, inst);
    for (const m of s.problems) result.problems.push({ at: `scenes ${spec.name}`, message: m });
    sceneTexts.push(...s.texts);
    scenes.push([files.scene(spec.name), s.root]);
  }
  for (const name of story.scenes.keys()) if (!story.steps.some((s) => s.kind === "scene" && s.scene === name)) result.problems.push({ at: `scenes ${name}`, message: `The scene "${name}" is never played: no step says scene: ${name}.` });
  if (result.problems.length) return result;

  const cr2w: [string, Json][] = [
    [files.phase, phase.root],
    [files.journal, journal.root],
    ...scenes,
    [files.onscreens("en-us"), await writeOnscreens(journal.texts, inst)],
    [files.subtitles("en-us"), await writeSubtitles(sceneTexts, inst)],
  ];

  // Turn the JSON into game files in a temp folder, then compare with what is in the project.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "edgequest-make-"));
  const out: { rel: string; bytes: Buffer }[] = [];
  try {
    for (const [gamePath, root] of cr2w) {
      const tmp = path.join(temp, `${out.length}.bin`);
      await bridge.fromJson(tmp, { json: JSON.stringify(cr2wJson(root)) });
      out.push({ rel: `source/archive/${gamePath.replace(/\\/g, "/")}`, bytes: fs.readFileSync(tmp) });
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  out.push({ rel: `source/resources/${files.xl}`, bytes: Buffer.from(xlText(files), "utf8") });

  const mf = manifestFile(project, story.id);
  const made: Record<string, string> = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")).files ?? {} : {};
  const kept: string[] = [];
  for (const f of out) {
    const disk = path.join(project, f.rel);
    const now = fs.existsSync(disk) ? sha1(fs.readFileSync(disk)) : undefined;
    const next = sha1(f.bytes);
    if (now === next) { result.files.push({ file: f.rel, result: "unchanged" }); made[f.rel] = next; continue; }
    if (now !== undefined && made[f.rel] !== now && !options.force) { kept.push(f.rel); result.files.push({ file: f.rel, result: "kept" }); continue; }
    fs.mkdirSync(path.dirname(disk), { recursive: true });
    fs.writeFileSync(disk, f.bytes);
    made[f.rel] = next;
    result.files.push({ file: f.rel, result: "written" });
  }
  fs.mkdirSync(path.dirname(mf), { recursive: true });
  fs.writeFileSync(mf, JSON.stringify({ story: path.relative(project, storyFile).replace(/\\/g, "/"), madeAt: new Date().toISOString(), files: made }, null, 2));
  if (kept.length) result.problems.push({ at: "files", message: `${kept.length} file(s) were changed by hand since EDGEquest made them, so they were kept: ${kept.join(", ")}. Make again with force to overwrite them, or move your changes into the story file.` });

  if (!options.noCheck) result.findings = (await checkQuestMod(modFromFolder(project), bridge, options.index)).findings;
  return result;
}
