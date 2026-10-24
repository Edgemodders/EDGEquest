// The game's sound event names, to check a story's music and sound steps (agreed 2026-10-24). The game
// lists every event in base\sound\event\eventsmetadata.json (23,524 in 2.31, each with its name); a
// project's own REDmod custom sounds (EDGEwave's customSound) add theirs in source/resources/info.json.
// Only the names are kept, in EDGEquest's cache folder, made again when the game changes. Finding,
// hearing and making sounds is EDGEwave's (EDGEwave #7); this only says whether a name exists.

import * as fs from "fs";
import * as path from "path";
import type { BridgeClient } from "./bridgeClient";
import { gameKey } from "./questIndex";
import type { Story } from "./story";

export const EventsFile = "base\\sound\\event\\eventsmetadata.json";
const cacheFile = (cacheDir: string) => path.join(cacheDir, "sound-events.json");

/** The event names a story can use: the game's, and the project's own custom sounds. */
export interface SoundNames {
  game: Set<string>;
  custom: Set<string>;
}

/** The cached game event names, if they were read before. */
export function loadSoundEvents(cacheDir: string): { key: string; names: Set<string> } | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(cacheDir), "utf8")) as { key: string; names: string[] };
    return { key: c.key, names: new Set(c.names) };
  } catch {
    return undefined;
  }
}

/** The game event names, read from the game when the cache is missing or from another game version. */
export async function soundEvents(bridge: BridgeClient, cacheDir: string): Promise<Set<string>> {
  const key = await gameKey(bridge);
  const cached = loadSoundEvents(cacheDir);
  if (cached?.key === key) return cached.names;
  const j = JSON.parse((await bridge.toJson(EventsFile)).json ?? "null");
  const root = j?.Data?.RootChunk?.root?.Data ?? j?.root?.Data;
  const names = [...new Set<string>((root?.events ?? []).map((e: { redId?: { $value?: string } }) => e.redId?.$value).filter((n: unknown): n is string => typeof n === "string" && n !== "None"))];
  if (!names.length) throw new Error(`No sound events in ${EventsFile}.`);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile(cacheDir), JSON.stringify({ key, names }));
  return new Set(names);
}

/** A project's REDmod custom sounds' event names (source/resources/info.json customSounds). */
export function customSoundNames(project: string): Set<string> {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(project, "source", "resources", "info.json"), "utf8")) as { customSounds?: { name?: string }[] };
    return new Set((info.customSounds ?? []).map((c) => c.name).filter((n): n is string => !!n));
  } catch {
    return new Set();
  }
}

/** Every music and sound event a story names, with where. */
export function storySounds(story: Story): { event: string; music: boolean; where: string }[] {
  const out: { event: string; music: boolean; where: string }[] = [];
  for (const b of story.beats) for (const s of b.steps) if (s.kind === "music" || s.kind === "sound") out.push({ event: s.event, music: s.kind === "music", where: `the beat ${b.name}` });
  for (const sc of story.scenes.values()) {
    const walk = (items: typeof sc.items) => items.forEach((it) => {
      if (it.kind === "sound") out.push({ event: it.event, music: false, where: `the scene ${sc.name}` });
      if (it.kind === "choice") it.options.forEach((o) => walk(o.then));
    });
    walk(sc.items);
  }
  return out;
}
