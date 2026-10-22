// Where a story's files go and what its journal entries and texts are called. One place, so the phase,
// journal, scenes, texts and .xl agree.

import type { IndexedPlace } from "../questIndex";
import type { Story } from "../story";

/** A story place's game map marker, looked up in the quest index by the caller. */
export type PlaceLookup = (place: string) => IndexedPlace | undefined;

export interface Layout {
  /** The mod's folder inside the archive: mod\<author>\<id>. */
  folder: string;
  phase: string;
  journal: string;
  scene(name: string): string;
  onscreens(lang: string): string;
  /** The subtitle map the .xl lists: it names one subtitle file per scene. */
  subtitleMap(lang: string): string;
  /** A scene's lines, named after the scene like the game's own subtitle files. */
  subtitles(lang: string, scene: string): string;
  /** The .xl file name, in the project's resources folder. */
  xl: string;
  journalFolder: string;
  quest: string;
  objective(oid: string): string;
  description(oid: string): string;
  marker(oid: string): string;
  /** Text keys (onscreens secondaryKey). */
  key: { title: string; description: string; objective(oid: string): string };
}

export function layout(story: Pick<Story, "id" | "author" | "type">): Layout {
  const folder = `mod\\${story.author}\\${story.id}`;
  const journalFolder = `quests/${story.type}_quest`;
  const quest = `${journalFolder}/${story.id}`;
  const objective = (oid: string) => `${quest}/main/${oid}`;
  return {
    folder,
    phase: `${folder}\\${story.id}.questphase`,
    journal: `${folder}\\${story.id}.journal`,
    scene: (name) => `${folder}\\scenes\\${name}.scene`,
    onscreens: (lang) => `${folder}\\loc\\${lang}\\onscreens.json`,
    subtitleMap: (lang) => `${folder}\\loc\\${lang}\\subtitlemap.json`,
    subtitles: (lang, scene) => `${folder}\\loc\\${lang}\\subtitles\\${scene}.json`,
    xl: `${story.id}.archive.xl`,
    journalFolder,
    quest,
    objective,
    description: (oid) => `${objective(oid)}/description`,
    marker: (oid) => `${objective(oid)}/marker`,
    key: {
      title: `${story.id}_title`,
      description: `${story.id}_description`,
      objective: (oid) => `${story.id}_objective_${oid}`,
    },
  };
}

/** A written scene's entry and exit names; the phase's scene node uses them as its socket names. */
export const SceneEntry = "start";
export const SceneExit = "end";

/** The position in a journal path of the entry that owns the file: the quest (quests/<type>/<id>). */
export const QuestFileEntryIndex = 2;
