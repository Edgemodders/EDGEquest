// Writes the mod's own text files: onscreens (journal texts, by key name) and subtitles (scene lines and
// options, by locstring id). Both are JsonResource files that ArchiveXL merges into the game's, so no
// game text file is ever replaced.

import type { Json } from "../graph";
import type { JournalText } from "./journal";
import type { SceneText } from "./scene";
import { Instances, handle } from "./wk";

export async function writeOnscreens(texts: JournalText[], inst: Instances): Promise<Json> {
  // primaryKey 0: ArchiveXL makes the key from secondaryKey (FNV1a64), the same hash a journal text gets.
  const entries = await Promise.all(texts.map((t) => inst.make("localizationPersistenceOnScreenEntry", { primaryKey: "0", secondaryKey: t.key, femaleVariant: t.text, maleVariant: "" })));
  return inst.make("JsonResource", { cookingPlatform: "PLATFORM_PC", root: handle(await inst.make("localizationPersistenceOnScreenEntries", { entries })) });
}

export async function writeSubtitles(texts: SceneText[], inst: Instances): Promise<Json> {
  const entries = await Promise.all(texts.map((t) => inst.make("localizationPersistenceSubtitleEntry", { stringId: t.id, femaleVariant: t.text, maleVariant: "" })));
  return inst.make("JsonResource", { cookingPlatform: "PLATFORM_PC", root: handle(await inst.make("localizationPersistenceSubtitleEntries", { entries })) });
}
