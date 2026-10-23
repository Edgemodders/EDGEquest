// Writes a story's beats as a .questphase: from the input "In1" (where ArchiveXL starts a phase added under
// the game's root quest) through each beat's steps, branching where a scene's choice goes on to another
// beat, to the output "Out1". Node and socket shapes follow the game's own phases (studied 2026-10-21, see
// docs/design/formats.md).

import type { Json } from "../graph";
import { alwaysGoes, sceneGoes, type Story } from "../story";
import { Instances, cname, entityRef, handle, Handle, nodeRef, resource } from "./wk";
import { AreaLookup, Layout, QuestFileEntryIndex, SceneEntry, SceneExit, goExit } from "./layout";

type SocketKind = "Input" | "Output" | "CutDestination";

interface Built {
  id: number;
  node: Handle;
  sockets: Map<string, Handle>;
}

/** Builds a quest graph: nodes with their sockets, and connections shared by both ends. */
export class GraphBuilder {
  readonly nodes: Handle[] = [];
  private next = 0;
  constructor(private readonly inst: Instances) {}

  async node(type: string, fields: Json, inputs: string[], outputs: string[]): Promise<Built> {
    const id = this.next++;
    const sockets = new Map<string, Handle>();
    const socket = (name: string, kind: SocketKind) => {
      const s = handle({ $type: "questSocketDefinition", connections: [], name: cname(name), type: kind });
      sockets.set(name, s);
      return s;
    };
    const list = [socket("CutDestination", "CutDestination"), ...inputs.map((n) => socket(n, "Input")), ...outputs.map((n) => socket(n, "Output"))];
    const node = handle(await this.inst.make(type, { ...fields, id, sockets: list }));
    this.nodes.push(node);
    return { id, node, sockets };
  }

  connect(from: Built, out: string, to: Built, input: string): void {
    const a = from.sockets.get(out), b = to.sockets.get(input);
    if (!a || !b) throw new Error(`No socket ${out} on node ${from.id} or ${input} on node ${to.id}`);
    const c = handle({ $type: "graphGraphConnectionDefinition", source: a, destination: b });
    a.data.connections.push(c);
    b.data.connections.push(c);
  }
}

export const journalPath = (realPath: string, className: string): Handle =>
  handle({ $type: "gameJournalPath", className: cname(className), editorPath: "", fileEntryIndex: QuestFileEntryIndex, realPath });

export interface PhaseProblem {
  /** Where in the story: "beats go_home". */
  at: string;
  message: string;
}

type End = { node: Built; out: string };

export async function writePhase(story: Story, files: Layout, inst: Instances, areaOf: AreaLookup): Promise<{ root: Json; problems: PhaseProblem[] }> {
  const g = new GraphBuilder(inst);
  const problems: PhaseProblem[] = [];
  const prefabs = new Set<string>();
  const input = await g.node("questInputNodeDefinition", { socketName: cname("In1") }, [], ["Out"]);
  const journal = async (realPath: string, className: string, state: "Active" | "Succeeded" | "Failed", track = false) =>
    g.node("questJournalNodeDefinition", {
      type: handle(await inst.make("questJournalQuestEntry_NodeType", { path: journalPath(realPath, className), sendNotification: 1, trackQuest: track ? 1 : 0, optional: 0, version: "Initial" })),
    }, ["Active", "Inactive", "Succeeded", "Failed"], ["Out"]);

  // Each beat starts by making its objective active; the first also tracks the quest and shows its
  // description. Whatever goes on to a beat connects to its start, so beats can be reached from several.
  const starts = new Map<string, { first: Built; last: Built }>();
  for (const [k, b] of story.beats.entries()) {
    const on = await journal(files.objective(b.name), "gameJournalQuestObjective", "Active", k === 0);
    let last = on;
    if (k === 0 && story.description) {
      last = await journal(files.description(b.name), "gameJournalQuestDescription", "Active");
      g.connect(on, "Out", last, "Active");
    }
    starts.set(b.name, { first: on, last });
  }
  g.connect(input, "Out", starts.get(story.beats[0].name)!.first, "Active");

  const toOutput: End[] = [];
  const jumps: { from: End; beat: string; to: string }[] = [];
  for (const b of story.beats) {
    let tail: End = { node: starts.get(b.name)!.last, out: "Out" };
    const chain = (n: Built, into = "In", out = "Out") => {
      g.connect(tail.node, tail.out, n, into);
      tail = { node: n, out };
    };
    let ended = false, cut = false;
    for (const s of b.steps) {
      if (cut) break;
      switch (s.kind) {
        case "arrive": {
          // V inside a trigger area, as the game's own quests wait at a place. The area lives in a quest's world
          // prefab, which exists only while a running phase lists it, so this phase lists it too (the Judy mod
          // lists a game prefab the same way). In-game tests of 2026-10-22: GPS arrival and V's distance to a
          // marker's node never fired.
          const at = areaOf(s.place);
          if (!at) {
            problems.push({ at: `beats ${b.name}`, message: `arrive: the place "${s.place}" has no trigger area to arrive in. Its marker has none the quest index knows; give the place area: "#<a game trigger area>".` });
            break;
          }
          at.prefabs.forEach((p) => prefabs.add(p));
          const cond = handle(await inst.make("questTriggerCondition", { type: "IsInside", isPlayerActivator: 1, activatorRef: entityRef(""), triggerAreaRef: nodeRef(at.area) }));
          chain(await g.node("questPauseConditionNodeDefinition", { condition: cond }, ["In"], ["Out"]));
          break;
        }
        case "wait": {
          const whole = Math.floor(s.seconds);
          const type = handle(await inst.make("questRealtimeDelay_ConditionType", { hours: 0, minutes: 0, seconds: whole, miliseconds: Math.round((s.seconds - whole) * 1000) }));
          const cond = handle(await inst.make("questTimeCondition", { type }));
          chain(await g.node("questPauseConditionNodeDefinition", { condition: cond }, ["In"], ["Out"]));
          break;
        }
        case "scene": {
          // A choice that says go: leaves the scene by its own exit, as game scenes branch (375 of 392 scene
          // nodes in 300 game phases have several outputs, 2026-10-23); the rest of the beat follows "end".
          const goes = story.scenes.get(s.scene) ? sceneGoes(story.scenes.get(s.scene)!) : [];
          const location = { $type: "scnWorldMarker", type: "Tag", tag: cname("around_player"), nodeRef: { $type: "NodeRef", $storage: "uint64", $value: "0" } };
          const n = await g.node("questSceneNodeDefinition", { sceneFile: resource(files.scene(s.scene)), sceneLocation: location }, [SceneEntry], [SceneExit, ...goes.map(goExit)]);
          chain(n, SceneEntry, SceneExit);
          for (const to of goes) jumps.push({ from: { node: n, out: goExit(to) }, beat: b.name, to });
          if (alwaysGoes(story.scenes.get(s.scene)?.items ?? [])) cut = true; // nothing after it happens
          break;
        }
        case "set": {
          const type = handle(await inst.make("questSetVar_NodeType", { factName: s.fact, value: s.value, setExactValue: s.add ? 0 : 1 }));
          chain(await g.node("questFactsDBManagerNodeDefinition", { type }, ["In"], ["Out"]));
          break;
        }
        case "done":
        case "failed": {
          const state = s.kind === "done" ? "Succeeded" : "Failed";
          chain(await journal(files.objective(b.name), "gameJournalQuestObjective", state), state);
          chain(await journal(files.quest, "gameJournalQuest", state), state);
          ended = true;
          break;
        }
      }
    }
    if (cut) continue;
    if (ended) toOutput.push(tail);
    else if (b.next) jumps.push({ from: tail, beat: b.name, to: b.next });
    else toOutput.push(tail); // the last beat, with no ending: the quest stays open
  }

  // Going on to another beat: this beat's objective is done, the next one's becomes active.
  for (const j of jumps) {
    const done = await journal(files.objective(j.beat), "gameJournalQuestObjective", "Succeeded");
    g.connect(j.from.node, j.from.out, done, "Succeeded");
    g.connect(done, "Out", starts.get(j.to)!.first, "Active");
  }
  const output = await g.node("questOutputNodeDefinition", { socketName: cname("Out1"), type: "Terminating" }, ["In"], []);
  for (const e of toOutput) g.connect(e.node, e.out, output, "In");

  const graph = handle(await inst.make("questGraphDefinition", { nodes: g.nodes }));
  const phasePrefabs = [...prefabs].map((p) => ({ $type: "questQuestPrefabEntry", prefabNodeRef: nodeRef(p) }));
  const root = await inst.make("questQuestPhaseResource", { cookingPlatform: "PLATFORM_PC", graph, phasePrefabs, inplacePhases: [] });
  return { root, problems };
}
