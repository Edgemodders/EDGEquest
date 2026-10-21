// Reads a .quest or .questphase (WolvenKit JSON) into nodes and edges. In the file, nodes list their
// sockets, and sockets and connections are handles shared across the whole file: a handle appears once
// with its data (HandleId + Data) and elsewhere as a reference (HandleRefId). A phase node either holds
// its own graph inline (phaseGraph) or names another .questphase (phaseResource).

/** WolvenKit JSON: any value. */
export type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface QuestSocket {
  name: string;
  /** Input, Output, CutDestination, CutSource and so on. */
  kind: string;
}

export interface QuestNode {
  id: number;
  /** The node class, such as questPauseConditionNodeDefinition. */
  type: string;
  /** The node's own JSON, with handles left as they are. */
  data: Json;
  sockets: QuestSocket[];
  /** An inline phase: its own graph. */
  inner?: QuestGraph;
}

export interface QuestEdge {
  from: { node: number; socket: string };
  to: { node: number; socket: string };
}

export interface QuestGraph {
  nodes: QuestNode[];
  edges: QuestEdge[];
}

export interface QuestFile {
  /** questQuestResource or questQuestPhaseResource. */
  type: string;
  graph: QuestGraph;
  /** phasePrefabs: the world prefabs (sectors) the phase uses. */
  prefabs: Json[];
  /** Every handle in the file, by id, for following references inside node data. */
  handles: Map<string, Json>;
}

/** The value of a CName, NodeRef, ResourcePath or similar wrapper; plain values pass through.
 *  An empty resource path is stored as the hash "0" and reads as "". */
export function value(x: Json): Json {
  if (x && typeof x === "object") {
    if ("$value" in x) return x.$value;
    if ("DepotPath" in x) {
      const p = value(x.DepotPath);
      return p === "0" ? "" : p;
    }
  }
  return x;
}

/** The data behind a handle or a handle reference. */
export function deref(x: Json, handles: Map<string, Json>): Json {
  if (!x || typeof x !== "object") return x;
  if ("Data" in x && ("HandleId" in x || Object.keys(x).length === 1)) return x.Data;
  if ("HandleRefId" in x) return handles.get(String(x.HandleRefId));
  return x;
}

function collectHandles(x: Json, into: Map<string, Json>): void {
  if (Array.isArray(x)) {
    for (const v of x) collectHandles(v, into);
  } else if (x && typeof x === "object") {
    if ("HandleId" in x && "Data" in x) into.set(String(x.HandleId), x.Data);
    for (const v of Object.values(x)) collectHandles(v, into);
  }
}

const handleId = (x: Json): string | undefined => (x && typeof x === "object" ? String(x.HandleId ?? x.HandleRefId ?? "") || undefined : undefined);

function readGraph(def: Json, handles: Map<string, Json>): QuestGraph {
  const nodes: QuestNode[] = [];
  // socket handle id -> the node and socket name that own it, for this graph
  const owner = new Map<string, { node: number; socket: string }>();
  const connections = new Map<string, Json>();
  for (const entry of def?.nodes ?? []) {
    const data = deref(entry, handles);
    if (!data) continue;
    const node: QuestNode = { id: Number(data.id ?? -1), type: String(data.$type), data, sockets: [] };
    for (const s of data.sockets ?? []) {
      const sd = deref(s, handles);
      if (!sd) continue;
      const name = String(value(sd.name) ?? "");
      node.sockets.push({ name, kind: String(sd.type ?? "") });
      const id = handleId(s);
      if (id) owner.set(id, { node: node.id, socket: name });
      for (const c of sd.connections ?? []) {
        const cid = handleId(c);
        const cd = deref(c, handles);
        if (cid && cd) connections.set(cid, cd);
      }
    }
    const inner = deref(data.phaseGraph, handles);
    if (inner?.nodes) node.inner = readGraph(inner, handles);
    nodes.push(node);
  }
  const edges: QuestEdge[] = [];
  for (const c of connections.values()) {
    const from = owner.get(handleId(c.source) ?? "");
    const to = owner.get(handleId(c.destination) ?? "");
    if (from && to) edges.push({ from, to });
  }
  edges.sort((a, b) => a.from.node - b.from.node || a.to.node - b.to.node);
  return { nodes, edges };
}

/** Reads a .quest or .questphase from its WolvenKit JSON (the whole file, or its RootChunk). */
export function readQuestFile(json: Json): QuestFile {
  const root = json?.Data?.RootChunk ?? json;
  const handles = new Map<string, Json>();
  collectHandles(root, handles);
  const def = deref(root.graph, handles);
  return { type: String(root.$type), graph: readGraph(def, handles), prefabs: root.phasePrefabs ?? [], handles };
}

/**
 * The nodes in reading order: from the graph's inputs and start nodes along the edges, each branch
 * followed to its end before the next (so a branch reads as one story), then any node not reached.
 */
export function flowOrder(graph: QuestGraph): QuestNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const next = new Map<number, number[]>();
  const incoming = new Set<number>();
  for (const e of graph.edges) {
    if (!next.has(e.from.node)) next.set(e.from.node, []);
    next.get(e.from.node)!.push(e.to.node);
    incoming.add(e.to.node);
  }
  const starts = graph.nodes.filter((n) => n.type === "questInputNodeDefinition" || n.type === "questStartNodeDefinition");
  const roots = starts.length ? starts : graph.nodes.filter((n) => !incoming.has(n.id));
  const order: QuestNode[] = [];
  const seen = new Set<number>();
  const stack = roots.map((n) => n.id).reverse();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (n) order.push(n);
    const targets = (next.get(id) ?? []).filter((t) => !seen.has(t));
    for (let i = targets.length - 1; i >= 0; i--) stack.push(targets[i]);
  }
  for (const n of graph.nodes) if (!seen.has(n.id)) order.push(n);
  return order;
}
