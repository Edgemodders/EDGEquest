// Writes the mod's own text files: onscreens (journal texts, by key name), a subtitle file per scene (its
// lines and options, by locstring id) and the subtitle map naming those files. ArchiveXL merges the
// onscreens and the map into the game's, so no game text file is ever replaced. The .xl lists the map,
// not the subtitle files: ArchiveXL loads a subtitles entry as a map (in-game test 2026-10-22).

import type { Json } from "../graph";
import type { JournalText } from "./journal";
import type { SceneText } from "./scene";
import { Instances, cname, handle, resource } from "./wk";

export async function writeOnscreens(texts: JournalText[], inst: Instances): Promise<Json> {
  // primaryKey 0: ArchiveXL makes the key from secondaryKey (FNV1a64), the same hash a journal text gets.
  const entries = await Promise.all(texts.map((t) => inst.make("localizationPersistenceOnScreenEntry", { primaryKey: "0", secondaryKey: t.key, femaleVariant: t.text, maleVariant: "" })));
  return inst.make("JsonResource", { cookingPlatform: "PLATFORM_PC", root: handle(await inst.make("localizationPersistenceOnScreenEntries", { entries })) });
}

export async function writeSubtitles(texts: SceneText[], inst: Instances): Promise<Json> {
  const entries = await Promise.all(texts.map((t) => inst.make("localizationPersistenceSubtitleEntry", { stringId: t.id, femaleVariant: t.text, maleVariant: "" })));
  return inst.make("JsonResource", { cookingPlatform: "PLATFORM_PC", root: handle(await inst.make("localizationPersistenceSubtitleEntries", { entries })) });
}

/** The subtitle map: the subtitle files, in the group the game files its quest scenes' lines under. */
export async function writeSubtitleMap(files: string[], inst: Instances): Promise<Json> {
  const entries = await Promise.all(files.map((f) => inst.make("localizationPersistenceSubtitleMapEntry", { subtitleFile: resource(f), subtitleGroup: cname("quest") })));
  return inst.make("JsonResource", { cookingPlatform: "PLATFORM_PC", root: handle(await inst.make("localizationPersistenceSubtitleMap", { entries })) });
}
