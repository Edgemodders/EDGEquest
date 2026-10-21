// Writes a story's steps as a .questphase: one chain of nodes from the input "In1" (where ArchiveXL starts
// a phase added under the game's root quest) to the output "Out1". Node and socket shapes follow the
// game's own phases (studied 2026-10-21, see docs/design/formats.md).

import type { Json } from "../graph";
import type { Story } from "../story";
import { Instances, cname, handle, Handle, resource } from "./wk";
import { Layout, QuestFileEntryIndex, SceneEntry, SceneExit } from "./layout";

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
  step: number;
  message: string;
}

export async function writePhase(story: Story, files: Layout, inst: Instances): Promise<{ root: Json; problems: PhaseProblem[] }> {
  const g = new GraphBuilder(inst);
  const problems: PhaseProblem[] = [];
  const input = await g.node("questInputNodeDefinition", { socketName: cname("In1") }, [], ["Out"]);
  let tail: { node: Built; out: string } = { node: input, out: "Out" };
  const chain = async (b: Built, into = "In", out = "Out") => {
    g.connect(tail.node, tail.out, b, into);
    tail = { node: b, out };
  };
  const journal = async (realPath: string, className: string, state: "Active" | "Succeeded" | "Failed", track = false) =>
    g.node("questJournalNodeDefinition", {
      type: handle(await inst.make("questJournalQuestEntry_NodeType", { path: journalPath(realPath, className), sendNotification: 1, trackQuest: track ? 1 : 0, optional: 0, version: "Initial" })),
    }, ["Active", "Inactive", "Succeeded", "Failed"], ["Out"]).then((b) => ({ b, state }));

  let current: { oid: string; marker?: string } | undefined;
  let first = true;
  for (const [i, s] of story.steps.entries()) {
    switch (s.kind) {
      case "objective": {
        if (current) {
          const done = await journal(files.objective(current.oid), "gameJournalQuestObjective", "Succeeded");
          await chain(done.b, "Succeeded");
        }
        const on = await journal(files.objective(s.id), "gameJournalQuestObjective", "Active", first);
        await chain(on.b, "Active");
        if (first && story.description) {
          const d = await journal(files.description(s.id), "gameJournalQuestDescription", "Active");
          await chain(d.b, "Active");
        }
        first = false;
        current = { oid: s.id, marker: s.marker };
        break;
      }
      case "arrive": {
        if (!current || current.marker !== s.place) {
          problems.push({ step: i + 1, message: `arrive: ${s.place} needs the objective before it to have marker: ${s.place}. V arrives at the objective's map marker.` });
          break;
        }
        const type = handle(await inst.make("questMappinGPSComparison_ConditionType", {
          comparisonType: "LessOrEqual",
          distanceDefinition1: handle(await inst.make("questMappinGPSDistance", { mappinPath: journalPath(files.marker(current.oid), "gameJournalQuestMapPin") })),
          distanceDefinition2: handle(await inst.make("questValueDistance", { distanceValue: s.within })),
        }));
        const cond = handle(await inst.make("questDistanceCondition", { type }));
        await chain(await g.node("questPauseConditionNodeDefinition", { condition: cond }, ["In"], ["Out"]));
        break;
      }
      case "wait": {
        const whole = Math.floor(s.seconds);
        const type = handle(await inst.make("questRealtimeDelay_ConditionType", { hours: 0, minutes: 0, seconds: whole, miliseconds: Math.round((s.seconds - whole) * 1000) }));
        const cond = handle(await inst.make("questTimeCondition", { type }));
        await chain(await g.node("questPauseConditionNodeDefinition", { condition: cond }, ["In"], ["Out"]));
        break;
      }
      case "scene": {
        const location = { $type: "scnWorldMarker", type: "Tag", tag: cname("around_player"), nodeRef: { $type: "NodeRef", $storage: "uint64", $value: "0" } };
        const b = await g.node("questSceneNodeDefinition", { sceneFile: resource(files.scene(s.scene)), sceneLocation: location }, [SceneEntry], [SceneExit]);
        await chain(b, SceneEntry, SceneExit);
        break;
      }
      case "set": {
        const type = handle(await inst.make("questSetVar_NodeType", { factName: s.fact, value: s.value, setExactValue: s.add ? 0 : 1 }));
        await chain(await g.node("questFactsDBManagerNodeDefinition", { type }, ["In"], ["Out"]));
        break;
      }
      case "done":
      case "failed": {
        const state = s.kind === "done" ? "Succeeded" : "Failed";
        if (current) await chain((await journal(files.objective(current.oid), "gameJournalQuestObjective", state)).b, state);
        await chain((await journal(files.quest, "gameJournalQuest", state)).b, state);
        current = undefined;
        break;
      }
    }
  }
  const output = await g.node("questOutputNodeDefinition", { socketName: cname("Out1"), type: "Terminating" }, ["In"], []);
  g.connect(tail.node, tail.out, output, "In");

  const graph = handle(await inst.make("questGraphDefinition", { nodes: g.nodes }));
  const root = await inst.make("questQuestPhaseResource", { cookingPlatform: "PLATFORM_PC", graph, phasePrefabs: [], inplacePhases: [] });
  return { root, problems };
}
