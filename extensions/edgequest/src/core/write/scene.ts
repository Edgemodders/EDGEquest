// Writes a story scene as a .scene with V alone: lines in sections, choices, and facts set through quest
// nodes inside the scene. Shapes follow the game's smallest scenes with V alone (studied 2026-10-21, see
// docs/design/formats.md). Lines are unvoiced: their text comes from the mod's subtitle file, keyed by
// the line's locstring id, and is also kept in the scene's own text store.

import type { Json } from "../graph";
import type { SceneItem, SceneSpec, Story } from "../story";
import { Instances, cname, handle, nodeRef, stableId, tweakId } from "./wk";
import { GraphBuilder } from "./phase";
import { SceneEntry, SceneExit, goExit } from "./layout";


const NoId = 4294967295;
const V = 0; // V's actor id when alone; performer id = actorId * 256 + 1
/** V's voice tag, as the game's scenes with V give it. */
const VVoiceTag = "1103967280742240864";

export interface SceneText {
  /** The locstring id (ruid): the subtitle entry's stringId. */
  id: string;
  text: string;
}

export interface WrittenScene {
  root: Json;
  texts: SceneText[];
  problems: string[];
}

/** How long an unvoiced line stays up, in ms: a reading pace with a floor. *Unverified* in the game. */
export const lineMs = (text: string) => Math.max(2000, 1000 + 60 * text.length);

const nodeId = (id: number) => ({ $type: "scnNodeId", id });
const out = (name: number, ordinal: number, to: { id: number; ordinal: number }[]) => ({
  $type: "scnOutputSocket",
  stamp: { $type: "scnOutputSocketStamp", name, ordinal },
  destinations: to.map((d) => ({ $type: "scnInputSocketId", isockStamp: { $type: "scnInputSocketStamp", name: 0, ordinal: d.ordinal }, nodeId: nodeId(d.id) })),
});

interface Node {
  id: number;
  data: Json;
  /** Where its main output goes; filled as the scene is laid out. */
  next: { id: number; ordinal: number }[];
  /** A choice's per-option targets. */
  options?: { id: number; ordinal: number }[][];
  /** Input ordinal for a link into this node: 1 for quest nodes (0 is the cut socket), else 0. */
  inOrdinal: number;
}

export async function writeScene(story: Story, spec: SceneSpec, inst: Instances): Promise<WrittenScene> {
  const problems: string[] = [];
  if (spec.call) problems.push(`The scene "${spec.name}" is a phone call. Phone calls come in the next build; for now a scene has V alone.`);

  const key = (s: string) => stableId(`edgequest/${story.id}/${spec.name}/${s}`);
  const nodes: Node[] = [];
  let nextNode = 3; // 1 start, 2 end
  // A screenplay item's id is its place in its list: line k is k*256+1, option k is k*256+2. Every game
  // scene numbers them so (141 scenes, 2026-10-22), and the game finds an item by it: one shared counter
  // left the options pointing past the end of their list (no text, crash on choosing; in-game test 3).
  const lineId = () => lines.length * 256 + 1;
  const optionId = () => options.length * 256 + 2;
  const lines: Json[] = [], options: Json[] = [], texts: SceneText[] = [];
  const eventSymbols: Json[] = [];
  const qb = new GraphBuilder(inst);

  const start: Node = { id: 1, data: await inst.make("scnStartNode", { ffStrategy: "automatic", nodeId: nodeId(1) }), next: [], inOrdinal: 0 };
  const end: Node = { id: 2, data: await inst.make("scnEndNode", { ffStrategy: "automatic", nodeId: nodeId(2), type: "Terminating" }), next: [], inOrdinal: 0 };
  nodes.push(start, end);

  // Lays out items; returns the first node and the open ends that continue to whatever comes after.
  type Ends = { node: Node; option?: number }[];
  const link = (ends: Ends, to: Node) => {
    for (const e of ends) {
      const target = { id: to.id, ordinal: to.inOrdinal };
      if (e.option !== undefined) e.node.options![e.option].push(target);
      else e.node.next.push(target);
    }
  };
  let lastLineEvent: string | undefined;
  // A go: ends the scene at its own end node, one per beat, with an exit named for it (game scenes name an
  // exit per way out). The quest's scene node has an output per exit.
  const goEnds = new Map<string, Node>();

  const layoutItems = async (items: SceneItem[], ends: Ends, path: string): Promise<Ends> => {
    let i = 0;
    while (i < items.length) {
      const it = items[i];
      if (it.kind === "line") {
        // Consecutive lines share one section.
        const id = nextNode++;
        const events: Json[] = [];
        let t = 0;
        while (i < items.length && items[i].kind === "line") {
          const l = items[i] as Extract<SceneItem, { kind: "line" }>;
          const itemId = lineId();
          const ruid = key(`${path}/${i}/line`);
          lines.push({
            $type: "scnscreenplayDialogLine", addressee: { $type: "scnActorId", id: V }, femaleLipsyncAnimationName: cname(""), maleLipsyncAnimationName: cname(""),
            itemId: { $type: "scnscreenplayItemId", id: itemId }, locstringId: { $type: "scnlocLocstringId", ruid }, speaker: { $type: "scnActorId", id: V },
            usage: { $type: "scnscreenplayLineUsage", playerGenderMask: { $type: "scnGenderMask", mask: 3 } },
          });
          texts.push({ id: ruid, text: l.text });
          const ms = lineMs(l.text);
          const eventId = key(`${path}/${i}/event`);
          lastLineEvent = eventId;
          events.push(handle({
            $type: "scnDialogLineEvent",
            additionalSpeakers: { $type: "scnAdditionalSpeakers", executionTag: 0, role: "Full", speakers: [] },
            duration: ms, executionTagFlags: 0, id: { $type: "scnSceneEventId", id: eventId }, scalingData: null,
            screenplayLineId: { $type: "scnscreenplayItemId", id: itemId }, startTime: t, type: "0", visualStyle: "regular",
            voParams: { $type: "scnDialogLineVoParams", alwaysUseBrainGender: 0, customVoEvent: cname(""), disableHeadMovement: 0, ignoreSpeakerIncapacitation: 0, isHolocallSpeaker: 0, voContext: "Vo_Context_Quest", voExpression: "Vo_Expression_Spoken" },
          }));
          eventSymbols.push({ $type: "scnSceneEventSymbol", editorEventId: String(268435456 + eventSymbols.length), originNodeId: nodeId(id), sceneEventIds: [{ $type: "scnSceneEventId", id: eventId }] });
          t += ms;
          i++;
        }
        const n: Node = {
          id, inOrdinal: 0, next: [],
          data: await inst.make("scnSectionNode", {
            actorBehaviors: [{ $type: "scnSectionInternalsActorBehavior", actorId: { $type: "scnActorId", id: V }, behaviorMode: "OnlyIfAlive" }],
            events, ffStrategy: "automatic", isFocusClue: 0, nodeId: nodeId(id), sectionDuration: { $type: "scnSceneTime", stu: t + 1 },
          }),
        };
        nodes.push(n);
        link(ends, n);
        ends = [{ node: n }];
      } else if (it.kind === "set") {
        const id = nextNode++;
        const type = handle(await inst.make("questSetVar_NodeType", { factName: it.fact, value: it.value, setExactValue: it.add ? 0 : 1 }));
        const q = await qb.node("questFactsDBManagerNodeDefinition", { type }, ["In"], ["Out"]);
        q.node.data.id = id;
        const n: Node = { id, inOrdinal: 1, next: [], data: await inst.make("scnQuestNode", { ffStrategy: "automatic", isockMappings: [cname("CutDestination"), cname("In")], nodeId: nodeId(id), osockMappings: [cname("Out")], questNode: q.node }) };
        nodes.push(n);
        link(ends, n);
        ends = [{ node: n }];
        i++;
      } else if (it.kind === "go") {
        let e = goEnds.get(it.beat);
        if (!e) {
          const id = nextNode++;
          e = { id, inOrdinal: 0, next: [], data: await inst.make("scnEndNode", { ffStrategy: "automatic", nodeId: nodeId(id), type: "Terminating" }) };
          nodes.push(e);
          goEnds.set(it.beat, e);
        }
        link(ends, e);
        ends = [];
        i++;
      } else {
        const id = nextNode++;
        const opts: Json[] = [];
        for (const [j, o] of it.options.entries()) {
          const itemId = optionId();
          const ruid = key(`${path}/${i}/option/${j}`);
          options.push({ $type: "scnscreenplayChoiceOption", itemId: { $type: "scnscreenplayItemId", id: itemId }, locstringId: { $type: "scnlocLocstringId", ruid }, usage: { $type: "scnscreenplayOptionUsage", playerGenderMask: { $type: "scnGenderMask", mask: 3 } } });
          texts.push({ id: ruid, text: o.text });
          opts.push(await inst.make("scnChoiceNodeOption", { screenplayOptionId: { $type: "scnscreenplayItemId", id: itemId }, caption: cname(""), gameplayAction: tweakId(""), mappinReferencePointId: { $type: "scnReferencePointId", id: NoId } }));
        }
        const n: Node = {
          id, inOrdinal: 0, next: [], options: it.options.map(() => []),
          data: await inst.make("scnChoiceNode", {
            nodeId: nodeId(id), options: opts, mode: "attachToScreen", ffStrategy: "automatic",
            persistentLineEvents: lastLineEvent ? [{ $type: "scnSceneEventId", id: lastLineEvent }] : [],
            mappinParams: handle(await inst.make("scnChoiceNodeNsMappinParams", { locationType: "None", mappinSettings: tweakId("") })),
          }),
        };
        nodes.push(n);
        link(ends, n);
        const after: Ends = [];
        for (const [j, o] of it.options.entries()) after.push(...(await layoutItems(o.then, [{ node: n, option: j }], `${path}/${i}/${j}`)));
        ends = after;
        i++;
      }
    }
    return ends;
  };
  const ends = await layoutItems(spec.items, [{ node: start }], "main");
  link(ends, end);
  if (!spec.items.length) problems.push(`The scene "${spec.name}" has no lines.`);

  const graph = nodes.map((n) => {
    const sockets: Json[] = [];
    if (n.options) {
      n.options.forEach((to, j) => sockets.push(out(0, j, to)));
      for (let k = 1; k <= 6; k++) sockets.push(out(k, 0, []));
    } else if (n.data.$type === "scnSectionNode") sockets.push(out(0, 0, n.next), out(1, 0, []));
    else if (n.data.$type !== "scnEndNode") sockets.push(out(0, 0, n.next));
    return handle({ ...n.data, outputSockets: sockets });
  });

  const vd: Json[] = [], vp: Json[] = [];
  for (const t of texts) for (const locale of ["db_db", "en_us"]) {
    const variant = stableId(`${t.id}/${locale}`);
    vd.push({ $type: "scnlocLocStoreEmbeddedVariantDescriptorEntry", localeId: locale, locstringId: { $type: "scnlocLocstringId", ruid: t.id }, signature: { $type: "scnlocSignature", val: "3" }, variantId: { $type: "scnlocVariantId", ruid: variant }, vpeIndex: vp.length });
    vp.push({ $type: "scnlocLocStoreEmbeddedVariantPayloadEntry", content: t.text, variantId: { $type: "scnlocVariantId", ruid: variant } });
  }

  const player = await inst.make("scnPlayerActorDef", {
    acquisitionPlan: "findInContext", actorId: { $type: "scnActorId", id: V }, playerName: "Player",
    findActorInContextParams: { $type: "scnFindEntityInContextParams", contextActorName: cname(""), contextualName: "Player", forceMaxVisibility: 0, specRecordId: tweakId("Character.Player_Puppet_Base"), voiceVagId: { $type: "scnVoicetagId", id: "0" } },
    specCharacterRecordId: tweakId("Character.Player_Puppet_Base"),
    lipsyncAnimSet: { $type: "scnLipsyncAnimSetSRRefId", id: NoId },
    voicetagId: { $type: "scnVoicetagId", id: VVoiceTag },
  });

  // The game's default: the scene pauses when speakers are more than 6 m apart and goes on under 5 m.
  const interruption = await inst.make("scnInterruptionScenario", {
    enabled: 1, id: { $type: "scnInterruptionScenarioId", id: 0 }, name: cname("Default"), playInterruptLine: 1, playingLinesBehavior: "Default", talkOnReturn: 1,
    interruptConditions: [handle(await inst.make("scnCheckSpeakersDistanceInterruptCondition", { params: { $type: "scnCheckSpeakersDistanceInterruptConditionParams", comparisonType: "Greater", distance: 6 } }))],
    returnConditions: [handle(await inst.make("scnCheckSpeakersDistanceReturnCondition", { params: { $type: "scnCheckSpeakersDistanceReturnConditionParams", comparisonType: "Less", distance: 5 } }))],
  });

  const root = await inst.make("scnSceneResource", {
    cookingPlatform: "PLATFORM_PC",
    actors: [],
    playerActors: [player],
    interruptionScenarios: [interruption],
    sceneGraph: handle(await inst.make("scnSceneGraph", { graph, startNodes: [nodeId(1)], endNodes: [nodeId(2), ...[...goEnds.values()].map((n) => nodeId(n.id))] })),
    entryPoints: [{ $type: "scnEntryPoint", name: cname(SceneEntry), nodeId: nodeId(1) }],
    exitPoints: [
      { $type: "scnExitPoint", name: cname(SceneExit), nodeId: nodeId(2) },
      ...[...goEnds].map(([beat, n]) => ({ $type: "scnExitPoint", name: cname(goExit(beat)), nodeId: nodeId(n.id) })),
    ],
    screenplayStore: await inst.make("scnscreenplayStore", { lines, options }),
    locStore: await inst.make("scnlocLocStoreEmbedded", { vdEntries: vd, vpEntries: vp }),
    debugSymbols: await inst.make("scnDebugSymbols", {
      performersDebugSymbols: [{
        $type: "scnPerformerSymbol", editorPerformerId: key("performer/V"), performerId: { $type: "scnPerformerId", id: V * 256 + 1 },
        entityRef: { $type: "gameEntityReference", dynamicEntityUniqueName: cname(""), names: [], reference: nodeRef("#player"), sceneActorContextName: cname(""), slotName: cname(""), type: "EntityRef" },
      }],
      sceneEventsDebugSymbols: eventSymbols,
      sceneNodesDebugSymbols: nodes.map((n) => ({ $type: "scnNodeSymbol", editorEventId: "9223372036854775807", editorNodeId: nodeId(n.id), nodeId: nodeId(n.id) })),
      workspotsDebugSymbols: [],
    }),
    sceneCategoryTag: story.type === "side" ? "sideQuests" : "minorQuests",
    version: 5,
  });
  return { root, texts, problems };
}
