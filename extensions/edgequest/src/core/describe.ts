// Quest nodes and conditions in plain words. Written from a count over the game's 4,571 .quest and
// .questphase files (2026-10-21): about 45 node kinds and 30 condition kinds cover 95% of what the
// game uses; the rest get a readable form of their class name. A property at its default value may
// be missing from a file, so each read below names the game's default (from REDbridge describeType).

import { deref, value, type Json, type QuestEdge, type QuestGraph, type QuestNode } from "./graph";

/** What a step does, for icons and grouping. */
export type StepKind =
  | "start" | "end" | "wait" | "if" | "fact" | "journal" | "scene" | "phase" | "flow"
  | "people" | "world" | "player" | "phone" | "reward" | "save" | "hidden" | "other";

export interface FactUse { name: string; set?: string; test?: string }
export interface JournalUse { path: string; kind: string; state?: string }

export interface StepInfo {
  kind: StepKind;
  /** One line in plain words. */
  text: string;
  facts: FactUse[];
  journal: JournalUse[];
  /** Game paths of scenes and phases this step plays. */
  scene?: string;
  phase?: string;
  /** NodeRefs to people, places and objects in the world. */
  refs: string[];
}

type Handles = Map<string, Json>;

// ---- small readers ------------------------------------------------------------------------------

const str = (x: Json): string => {
  const v = value(x);
  return v === undefined || v === null || v === "None" ? "" : String(v);
};
const num = (x: Json, def: number): number => (x === undefined || x === null ? def : Number(value(x)));
const flag = (x: Json, def: boolean): boolean => (x === undefined || x === null ? def : !!Number(value(x)));
const base = (p: string) => p.split(/[\\/]/).pop()!.replace(/\.(questphase|quest|scene)$/, "");

/** A class name in words: questCharacterManagerParameters_SetMortality -> "character manager parameters: set mortality". */
export function humanize(type: string): string {
  const parts = type
    .replace(/^quest/, "")
    .replace(/(NodeDefinition|_NodeType|_NodeSubType|NodeType|_ConditionType|_CondtionType|Condition|Node)$/g, "")
    .split("_")
    .filter(Boolean)
    .map((p) => p.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase().trim());
  return parts.join(": ") || type;
}

const Compare: Record<string, string> = { Greater: ">", GreaterOrEqual: "≥", Equal: "=", NotEqual: "≠", Less: "<", LessOrEqual: "≤" };
const cmp = (x: Json, def = "Greater") => Compare[str(x) || def] ?? str(x);

/** A NodeRef's path; an empty one is stored as "0" and reads as "". */
const refOf = (x: Json): string => {
  const r = str(x);
  return r === "0" ? "" : r;
};

/** Who or what an entity reference points at: V, a name in a community, or a NodeRef. */
function who(x: Json, refs: string[], h: Handles): string {
  const r = deref(x, h);
  if (!r || typeof r !== "object") return str(r) || "?";
  if (flag(r.refLocalPlayer, false) || flag(r.mainPlayerObject, false)) return "V";
  const inner = r.entityReference ? deref(r.entityReference, h) : r;
  const ref = refOf(inner?.reference);
  const names = (inner?.names ?? []).map(str).filter(Boolean);
  if (ref) refs.push(ref);
  if (names.length && ref) return `${names.join(", ")} (${ref})`;
  return names.join(", ") || ref || (r.isPlayer ? "V" : "someone");
}
const node = (x: Json, refs: string[]) => {
  const r = refOf(x);
  if (r) refs.push(r);
  return r || "?";
};

const JournalKinds: Record<string, string> = {
  gameJournalQuest: "quest",
  gameJournalQuestPhase: "quest phase",
  gameJournalQuestObjective: "objective",
  gameJournalQuestSubObjective: "sub-objective",
  gameJournalQuestMapPin: "map pin",
  gameJournalPointOfInterestMappin: "map marker",
  gameJournalPhoneMessage: "text message",
  gameJournalPhoneConversation: "phone conversation",
  gameJournalContact: "contact",
  gameJournalCodexEntry: "codex entry",
  gameJournalOnscreen: "shard",
  gameJournalInternetPage: "web page",
  gameJournalBriefing: "briefing",
  gameJournalTarot: "tarot card",
};

function journal(x: Json, h: Handles, uses: JournalUse[], state?: string): string {
  const p = deref(x, h);
  const path = str(p?.realPath);
  const kind = JournalKinds[str(p?.className)] ?? humanize(str(p?.className).replace(/^gameJournal/, ""));
  uses.push({ path, kind, state });
  return `${kind} ${path || "?"}`;
}

// ---- conditions -----------------------------------------------------------------------------

/** A condition in plain words, collecting the facts, journal entries and refs it reads. */
export function describeCondition(c: Json, h: Handles, facts: FactUse[] = [], jr: JournalUse[] = [], refs: string[] = []): string {
  const d = deref(c, h);
  if (!d?.$type) return "?";
  const t = deref(d.type, h) ?? {};
  switch (d.$type) {
    case "questLogicalCondition": {
      const op = str(d.operation) || "AND";
      const parts = (d.conditions ?? []).map((x: Json) => describeCondition(x, h, facts, jr, refs));
      const join = { AND: " and ", OR: " or ", XOR: " or else " }[op as "AND" | "OR" | "XOR"];
      if (join) return parts.length > 1 ? `(${parts.join(join)})` : parts[0] ?? "nothing";
      return `${op.toLowerCase()} of (${parts.join(", ")})`;
    }
    case "questTriggerCondition":
    case "questGatherTriggerCondition": {
      const whoIn = flag(d.isPlayerActivator, true) ? "V" : who(d.activatorRef, refs, h);
      const area = node(d.triggerAreaRef, refs);
      const verb = { Entered: "enters", Exited: "leaves", IsInside: "is inside", IsOutside: "is outside", AllInsideMP: "are all inside", AllOutsideMP: "are all outside" }[str(d.type) || "IsInside"] ?? str(d.type);
      return `${d.$type === "questGatherTriggerCondition" ? "everyone with " : ""}${whoIn} ${verb} ${area}`;
    }
    case "questNodeLoadingCondition":
      return `${node(d.objectRef, refs)} has loaded`;
  }
  switch (t.$type) {
    case "questVarComparison_ConditionType": {
      const name = str(t.factName);
      const test = `${cmp(t.comparisonType)} ${num(t.value, 0)}`;
      facts.push({ name, test });
      return `fact ${name} ${test}`;
    }
    case "questVarVsVarComparison_ConditionType": {
      facts.push({ name: str(t.factName1), test: "compared" }, { name: str(t.factName2), test: "compared" });
      return `fact ${str(t.factName1)} ${cmp(t.comparisonType)} fact ${str(t.factName2)}`;
    }
    case "questRealtimeDelay_ConditionType": {
      const s = num(t.hours, 0) * 3600 + num(t.minutes, 0) * 60 + num(t.seconds, 0) + num(t.miliseconds, 0) / 1000;
      return `${s} second${s === 1 ? "" : "s"} pass`;
    }
    case "questGameTimeDelay_ConditionType": {
      const parts = [["day", t.days], ["hour", t.hours], ["minute", t.minutes], ["second", t.seconds]]
        .map(([u, v]) => [u, num(v, 0)] as const).filter(([, v]) => v).map(([u, v]) => `${v} ${u}${v === 1 ? "" : "s"}`);
      return `${parts.join(" ") || "no time"} of game time pass`;
    }
    case "questTickDelay_ConditionType":
      return `${num(t.tickCount, 0)} frames pass`;
    case "questTimePeriod_ConditionType": {
      const hm = (g: Json) => { const s = num(deref(g, h)?.seconds, 0); return `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}`; };
      return `the time is between ${hm(t.begin)} and ${hm(t.end)}`;
    }
    case "questCharacterSpawned_ConditionType":
      return `${who(t.objectRef, refs, h)} has spawned`;
    case "questCharacterKilled_ConditionType": {
      // questComparisonParam defaults to Equal 0: "none of them killed"
      const p = deref(t.comparisonParams, h);
      const op = str(p?.comparisonType) || "Equal";
      const count = num(p?.count, 0);
      const none = (op === "Less" && count <= 1) || ((op === "Equal" || op === "LessOrEqual") && count === 0);
      return `${who(t.objectRef, refs, h)} ${none ? "is not" : "is"} dead or defeated`;
    }
    case "questJournalEntryState_ConditionType":
    case "questJournalEntry_ConditionType": {
      const state = str(t.state);
      const what = journal(t.path, h, jr);
      const known = state && state !== "Undefined";
      return `the journal ${what} ${flag(t.inverted, false) ? "is not" : "is"} ${known ? state.toLowerCase().replace(/_$/, "") : "there"}`;
    }
    case "questDistanceComparison_ConditionType": {
      const d1 = deref(t.distanceDefinition1, h);
      const between = d1?.$type === "questObjectDistance" ? ` from ${who(d1.entityRef, refs, h)} to ${who(d1.nodeRef2, refs, h)}` : "";
      return `distance${between} ${cmp(t.comparisonType)} ${num(deref(t.distanceDefinition2, h)?.distanceValue, 0)} m`;
    }
    case "questMappinGPSComparison_ConditionType":
      return `GPS distance to ${journal(deref(t.distanceDefinition1, h)?.mappinPath, h, jr)} ${cmp(t.comparisonType)} ${num(deref(t.distanceDefinition2, h)?.distanceValue, 0)} m`;
    case "questCharacterMount_ConditionType":
      return `${flag(t.childIsPlayer, false) ? "V" : who(t.childRef, refs, h)} ${str(t.condition) === "OnUnmount" ? "gets out of" : "gets into"} ${flag(t.usePlayersVehicle, false) ? "V's vehicle" : who(t.parentRef, refs, h)}`;
    case "questCameraFocus_ConditionType":
      return `V ${flag(t.inverted, false) ? "looks away from" : "looks at"} ${who(t.objectRef, refs, h)}`;
    case "questDevice_ConditionType":
      return `${node(t.objectRef, refs)}: ${humanize(str(t.deviceConditionFunction))}`;
    case "questCharacterHit_ConditionType":
      return `${who(t.targetRef, refs, h)} is hit${flag(t.isAttackerPlayer, false) ? " by V" : ""}`;
    case "questInventory_ConditionType":
      return `${flag(t.isPlayer, false) ? "V" : who(t.objectRef, refs, h)} has ${str(t.itemID)}`;
    case "questCharacterCombat_ConditionType":
      return `${flag(t.isPlayer, false) ? "V" : who(t.objectRef, refs, h)} is in combat`;
    case "questInteraction_ConditionType":
      return `${node(t.objectRef, refs)} is used`;
    case "questCharacterHealth_ConditionType":
      return `${who(t.objectRef, refs, h)} health ${cmp(t.comparisonType)} ${num(t.percent, 0)}%`;
    case "questCharacterStatusEffect_CondtionType":
      return `${flag(t.isPlayer, false) ? "V" : who(t.objectRef, refs, h)} ${flag(t.inverted, false) ? "does not have" : "has"} ${str(t.statusEffectID)}`;
    case "questScan_ConditionType":
      return `${who(t.objectRef, refs, h)} is scanned`;
    case "questVehicleSpawned_ConditionType":
      return `${who(t.vehicleRef, refs, h)} has spawned`;
  }
  return humanize(t.$type ?? d.$type);
}

// ---- nodes -----------------------------------------------------------------------------------

/** One node in plain words. `incoming` is the edges arriving at it, which name a journal node's state. */
export function describeNode(n: QuestNode, h: Handles, incoming: QuestEdge[] = []): StepInfo {
  const facts: FactUse[] = [];
  const jr: JournalUse[] = [];
  const refs: string[] = [];
  const out = (kind: StepKind, text: string, extra: Partial<StepInfo> = {}): StepInfo => ({ kind, text, facts, journal: jr, refs: [...new Set(refs)], ...extra });
  const d = n.data;
  const t = deref(d.type, h) ?? {};
  const sub = deref(t.subtype, h) ?? {};

  switch (n.type) {
    case "questStartNodeDefinition": return out("start", "Start");
    case "questEndNodeDefinition": return out("end", "End");
    case "questInputNodeDefinition": return out("start", `Start: ${str(d.socketName) || "In"}`);
    case "questOutputNodeDefinition": return out("end", `${(str(d.type) || "Terminating") === "Terminating" ? "End" : "Continue"}: ${str(d.socketName) || "Out"}`);
    case "questPauseConditionNodeDefinition": return out("wait", `Wait until ${describeCondition(d.condition, h, facts, jr, refs)}`);
    case "questConditionNodeDefinition": return out("if", `If ${describeCondition(d.condition, h, facts, jr, refs)}`);
    case "questSwitchNodeDefinition": {
      const items = (d.conditions ?? []).map((c: Json) => describeCondition(deref(c, h)?.condition, h, facts, jr, refs));
      return out("if", `${str(d.behaviour) === "First_Fulfilled" || !str(d.behaviour) ? "Take the first that holds" : humanize(str(d.behaviour))}: ${items.join("; ")}`);
    }
    case "questPhaseNodeDefinition": {
      const res = str(d.phaseResource);
      if (res) return out("phase", `Phase ${base(res)}`, { phase: res });
      return out("phase", `Phase, inline (${n.inner?.nodes.length ?? 0} nodes)`);
    }
    case "questSceneNodeDefinition": {
      const scene = str(d.sceneFile);
      const at = refOf(deref(d.sceneLocation, h)?.nodeRef);
      if (at) refs.push(at);
      return out("scene", `Scene ${base(scene)}${at ? ` at ${at}` : ""}`, { scene });
    }
    case "questFactsDBManagerNodeDefinition": {
      if (t.$type === "questSetVar_NodeType") {
        const name = str(t.factName);
        const v = num(t.value, 1);
        const exact = flag(t.setExactValue, false);
        facts.push({ name, set: exact ? `= ${v}` : `+ ${v}` });
        return out("fact", exact ? `Set fact ${name} to ${v}` : `Add ${v} to fact ${name}`);
      }
      break;
    }
    case "questJournalNodeDefinition": {
      const states = [...new Set(incoming.map((e) => e.to.socket))].filter((s) => s && s !== "In");
      const state = states.join(" or ") || undefined;
      switch (t.$type) {
        case "questJournalQuestEntry_NodeType":
        case "questJournalEntry_NodeType": {
          const what = journal(t.path, h, jr, state);
          return out("journal", state ? `Journal: ${what} becomes ${state.toLowerCase()}` : `Journal: ${what}`);
        }
        case "questJournalChangeMappinPhase_NodeType":
          return out("journal", `Journal: ${journal(t.path, h, jr)} goes to ${humanize(str(t.phase))}`);
        case "questJournalQuestObjectiveCounter_NodeType":
          return out("journal", `Journal: count one more for ${journal(t.path, h, jr)}`);
      }
      break;
    }
    case "questMappinManagerNodeDefinition":
      return out("journal", `Show ${journal(d.path, h, jr)}`);
    case "questPhoneManagerNodeDefinition":
      if (t.$type === "questSendMessage_NodeType") return out("phone", `Send ${journal(t.msg, h, jr)}`);
      if (t.$type === "questAddRemoveContact_NodeType") {
        const ps = (t.params ?? []).map((p: Json) => deref(p, h));
        return out("phone", ps.map((p: Json) => `${flag(p.addContact, true) ? "Add" : "Remove"} ${journal(p.contact, h, jr)}`).join("; "));
      }
      break;
    case "questLogicalHubNodeDefinition": return out("flow", "Join");
    case "questLogicalAndNodeDefinition": return out("flow", `When all ${num(d.inputSocketCount, 2)} have arrived`);
    case "questLogicalXorNodeDefinition": return out("flow", `Only the first of ${num(d.inputSocketCount, 2)}`);
    case "questRandomizerNodeDefinition": return out("flow", `Pick one of ${(d.outputWeights ?? []).length || "several"} at random`);
    case "questFlowControlNodeDefinition": return out("flow", `Gate, ${flag(d.isOpen, true) ? "open" : "closed"} at first`);
    case "questCutControlNodeDefinition": return out("flow", "Stop the other branches");
    case "questDeletionMarkerNodeDefinition": return out("hidden", "Deleted nodes marker");
    case "questCheckpointNodeDefinition": return out("save", `Save point${str(d.debugString) ? ` (${str(d.debugString)})` : ""}`);
    case "questSpawnManagerNodeDefinition": {
      const parts = (d.actions ?? []).map((a: Json) => {
        const at = deref(deref(a, h)?.type, h) ?? {};
        const act = !str(at.action) || str(at.action) === "Undefined" ? "Spawn" : str(at.action);
        switch (at.$type) {
          case "questCommunityTemplate_NodeType": return `${act} ${str(at.communityEntryName)}${str(at.communityEntryPhaseName) && str(at.communityEntryPhaseName) !== "default" ? ` (${str(at.communityEntryPhaseName)})` : ""} in ${node(at.spawnerReference, refs)}`;
          case "questSpawnSet_NodeType": return `${act} ${str(at.entryName)}${str(at.phaseName) ? ` (${str(at.phaseName)})` : ""} in ${node(at.reference, refs)}`;
          case "questSpawner_NodeType": return `${act} ${node(at.spawnerReference, refs)}`;
          default: return humanize(at.$type ?? "spawn");
        }
      });
      return out("people", parts.join("; ") || "Spawn");
    }
    case "questTeleportPuppetNodeDefinition": {
      const dest = deref(d.params, h)?.destinationRef;
      return out("people", `Move ${who(d.entityReference, refs, h)} to ${dest ? who(dest, refs, h) : "a position"}`);
    }
    case "questMovePuppetNodeDefinition":
      return out("people", `${who(d.entityReference, refs, h)} ${humanize(str(d.moveType) || "move")}`);
    case "questUseWorkspotNodeDefinition":
      return out("people", `${who(d.entityReference, refs, h)} uses a workspot`);
    case "questCombatNodeDefinition":
    case "questMiscAICommandNode":
      return out("people", `${who(d.entityReference, refs, h)}: ${humanize(str(d.function).replace(/^questCombatNodeParams_|CommandParams$/g, ""))}`);
    case "questRewardManagerNodeDefinition":
      if (t.$type === "questGiveReward_NodeType") return out("reward", `Give reward ${(t.rewards ?? []).map(str).join(", ")}`);
      break;
    case "questItemManagerNodeDefinition":
      if (t.$type === "questAddRemoveItem_NodeType") {
        const ps = (t.params ?? []).map((p: Json) => deref(p, h));
        return out("reward", ps.map((p: Json) => `${str(p.nodeType) === "RemoveItem" ? "Take" : "Give"} ${str(p.itemID)}${num(p.quantity, 1) !== 1 ? ` ×${num(p.quantity, 1)}` : ""}`).join("; "));
      }
      break;
    case "questEventManagerNodeDefinition":
      return out("world", `Send ${humanize(str(deref(d.event, h)?.$type))} to ${who(d.objectRef, refs, h)}`);
    case "questInteractiveObjectManagerNodeDefinition":
      if (t.$type === "questDeviceManager_NodeType") {
        const ps = (t.params ?? []).map((p: Json) => deref(p, h));
        return out("world", ps.map((p: Json) => `${node(p.objectRef, refs)}: ${humanize(str(p.deviceAction))}`).join("; "));
      }
      break;
    case "questWorldDataManagerNodeDefinition":
      if (t.$type === "questTogglePrefabVariant_NodeType") return out("world", `Switch world variants of ${(t.params ?? []).map((p: Json) => node(deref(p, h)?.prefabNodeRef, refs)).join(", ")}`);
      if (t.$type === "questShowWorldNode_NodeType") return out("world", `${flag(t.show, true) ? "Show" : "Hide"} ${node(t.objectRef, refs)}`);
      break;
    case "questGameManagerNodeDefinition":
      if (t.$type === "questGameplayRestrictions_NodeType") return out("player", str(t.action) === "RemoveAllRestrictions" ? `Lift all restrictions${str(t.source) ? ` from ${str(t.source)}` : ""}` : `${str(t.action) === "RemoveRestriction" ? "Lift" : "Add"} restrictions ${(t.restrictionIDs ?? []).map((r: Json) => str(r).replace(/^GameplayRestriction\./, "")).join(", ")}`);
      break;
  }

  // Everything else: the class (and its type and subtype) in words, with the refs it names.
  const label = [n.type, t.$type, sub.$type].filter(Boolean).map((x: string) => humanize(x)).join(" — ");
  const kind: StepKind = /Character|Puppet|Crowd|Voiceset|Spawn/.test(n.type) ? "people" : /Vehicle|World|Environment|Entity|FX|Audio|Transform|Interactive|Event/.test(n.type) ? "world" : /Time|UI|Scene|Game|RenderFx|Vision|Achievement/.test(n.type) ? "player" : "other";
  collectRefs({ type: d.type, entityReference: d.entityReference, objectRef: d.objectRef }, h, refs);
  return out(kind, label.charAt(0).toUpperCase() + label.slice(1));
}

/** NodeRefs found anywhere in a value: "#name" and "$/..." strings in reference-like fields. */
function collectRefs(x: Json, h: Handles, refs: string[], depth = 0): void {
  if (depth > 6 || !x) return;
  const d = deref(x, h);
  if (Array.isArray(d)) for (const v of d) collectRefs(v, h, refs, depth + 1);
  else if (d && typeof d === "object") {
    if (d.$type === "NodeRef") { const v = str(d); if (v && v !== "0") refs.push(v); return; }
    for (const v of Object.values(d)) collectRefs(v, h, refs, depth + 1);
  }
}

// ---- a whole graph -----------------------------------------------------------------------------

export interface QuestSummary {
  facts: { name: string; sets: string[]; tests: string[] }[];
  journal: { path: string; kind: string; states: string[] }[];
  scenes: string[];
  phases: string[];
  refs: string[];
}

/** Every fact, journal entry, scene, phase and NodeRef a graph uses, inline phases included. */
export function summarize(graph: QuestGraph, h: Handles): QuestSummary {
  const facts = new Map<string, { sets: Set<string>; tests: Set<string> }>();
  const jr = new Map<string, { kind: string; states: Set<string> }>();
  const scenes = new Set<string>(), phases = new Set<string>(), refs = new Set<string>();
  const visit = (g: QuestGraph) => {
    for (const n of g.nodes) {
      const s = describeNode(n, h, g.edges.filter((e) => e.to.node === n.id));
      for (const f of s.facts) {
        const e = facts.get(f.name) ?? { sets: new Set(), tests: new Set() };
        if (f.set) e.sets.add(f.set);
        if (f.test) e.tests.add(f.test);
        facts.set(f.name, e);
      }
      for (const j of s.journal) {
        const e = jr.get(j.path) ?? { kind: j.kind, states: new Set() };
        if (j.state) for (const st of j.state.split(" or ")) e.states.add(st);
        jr.set(j.path, e);
      }
      if (s.scene) scenes.add(s.scene);
      if (s.phase) phases.add(s.phase);
      for (const r of s.refs) refs.add(r);
      if (n.inner) visit(n.inner);
    }
  };
  visit(graph);
  const sorted = <T>(m: Map<string, T>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    facts: sorted(facts).map(([name, e]) => ({ name, sets: [...e.sets], tests: [...e.tests] })),
    journal: sorted(jr).map(([path, e]) => ({ path, kind: e.kind, states: [...e.states] })),
    scenes: [...scenes].sort(),
    phases: [...phases].sort(),
    refs: [...refs].sort(),
  };
}
