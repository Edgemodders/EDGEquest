// Building blocks for writing WolvenKit JSON, which REDbridge turns into game files (cr2w.fromJson).
// Objects come from the game's own type defaults (cr2w.createInstance), so EDGEquest ships no game data:
// a writer asks for a type, then sets the fields the game's own files are seen to use.
//
// Handles: in the file, an object held by handle appears once with its data ({HandleId, Data}) and
// elsewhere as a reference ({HandleRefId}). Writers mark such objects with `handle()` and share the same
// object wherever the game shares it (a socket is held by its node and by each connection); `cr2wJson`
// numbers them in the order they are first met.

import type { BridgeClient } from "../bridgeClient";
import type { Json } from "../graph";

/** An object the file holds by handle. */
export class Handle {
  constructor(readonly data: Json) {}
}
export const handle = (data: Json): Handle => new Handle(data);

/** A whole CR2W file as WolvenKit JSON, with handles numbered. */
export function cr2wJson(root: Json): Json {
  const ids = new Map<Handle, string>();
  const walk = (x: Json): Json => {
    if (x instanceof Handle) {
      const seen = ids.get(x);
      if (seen !== undefined) return { HandleRefId: seen };
      const id = String(ids.size);
      ids.set(x, id);
      return { HandleId: id, Data: walk(x.data) };
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const out: Json = {};
      for (const [k, v] of Object.entries(x)) out[k] = walk(v);
      return out;
    }
    return x;
  };
  return {
    Header: { WolvenKitVersion: "9.1.0", WKitJsonVersion: "0.0.9", GameVersion: 2310, ExportedDateTime: new Date().toISOString(), DataType: "CR2W" },
    Data: { Version: 195, BuildVersion: 0, RootChunk: walk(root), EmbeddedFiles: [] },
  };
}

// ---- small values -------------------------------------------------------------------------------

export const cname = (s: string): Json => ({ $type: "CName", $storage: "string", $value: s || "None" });
/** A NodeRef by name ("#name"), or by hash when only the hash is known (digits). */
export const nodeRef = (s: string): Json => (s && !/^\d+$/.test(s) ? { $type: "NodeRef", $storage: "string", $value: s } : { $type: "NodeRef", $storage: "uint64", $value: s || "0" });
/** A gameEntityReference to a world node. */
export const entityRef = (node: string): Json => ({ $type: "gameEntityReference", dynamicEntityUniqueName: cname(""), names: [], reference: nodeRef(node), sceneActorContextName: cname(""), slotName: cname(""), type: "EntityRef" });
export const tweakId = (s: string): Json => (s ? { $type: "TweakDBID", $storage: "string", $value: s } : { $type: "TweakDBID", $storage: "uint64", $value: "0" });
export const resource = (path: string, flags: "Soft" | "Default" = "Soft"): Json =>
  path ? { DepotPath: { $type: "ResourcePath", $storage: "string", $value: path }, Flags: flags } : { DepotPath: { $type: "ResourcePath", $storage: "uint64", $value: "0" }, Flags: "Default" };
/** A journal text. ArchiveXL turns a value without "LocKey#" into the key's FNV1a64 hash, matching an
 *  onscreens entry whose secondaryKey is that name. */
export const locKey = (key: string): Json => ({ unk1: "0", value: key });
export const vector3 = (x: number, y: number, z: number): Json => ({ $type: "Vector3", X: x, Y: y, Z: z });

// ---- hashes -------------------------------------------------------------------------------------

/** FNV-1a, 64 bits, as a decimal string: ArchiveXL's key for a named text. */
export function fnv1a64(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of Buffer.from(s, "utf8")) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return h.toString();
}

/** A stable 64-bit id from a name, for scene text ids (locstring and variant ruids) and event ids.
 *  Kept below 2^63 so tools that read it as a signed number agree. */
export function stableId(s: string): string {
  return (BigInt(fnv1a64(s)) & 0x7fffffffffffffffn).toString();
}

/** Murmur3 (32 bits): the game keys compiled map markers by this hash of the journal path, seed 0x5EEDBA5E. */
export function murmur3(s: string, seed = 0x5eedba5e): number {
  const data = Buffer.from(s, "utf8");
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  const n = data.length & ~3;
  let h = seed >>> 0;
  for (let i = 0; i < n; i += 4) {
    let k = data.readUInt32LE(i);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  const rest = data.length & 3;
  if (rest === 3) k ^= data[n + 2] << 16;
  if (rest >= 2) k ^= data[n + 1] << 8;
  if (rest >= 1) { k ^= data[n]; k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k; }
  h ^= data.length;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

// ---- type defaults ------------------------------------------------------------------------------

/** Makes objects of a game type from its defaults, then sets fields. Defaults are fetched once per type. */
export class Instances {
  private cache = new Map<string, Promise<Json>>();
  constructor(private readonly source: (type: string) => Promise<Json>) {}

  static fromBridge(bridge: BridgeClient): Instances {
    return new Instances((type) => bridge.createInstance(type));
  }

  async make(type: string, fields: Json = {}): Promise<Json> {
    let base = this.cache.get(type);
    if (!base) {
      base = this.source(type);
      this.cache.set(type, base);
    }
    return { ...structuredClone(await base), ...fields };
  }
}
