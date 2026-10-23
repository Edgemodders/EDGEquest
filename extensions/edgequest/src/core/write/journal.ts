// Writes a story's journal: a partial tree ArchiveXL merges into the game's by path. The root's id is
// empty like the game's; one folder entry names the whole path to the quest type ("quests/side_quest"),
// as ArchiveXL finds entries by path. Texts are key names; ArchiveXL turns them into LocKeys. A marker
// stands on a game map marker's world node.

import type { Json } from "../graph";
import type { Story } from "../story";
import { Instances, entityRef, handle, locKey, tweakId, vector3 } from "./wk";
import type { Layout, PlaceLookup } from "./layout";

export interface JournalText {
  key: string;
  text: string;
}

export async function writeJournal(story: Story, files: Layout, inst: Instances, place: PlaceLookup): Promise<{ root: Json; texts: JournalText[]; problems: string[] }> {
  const texts: JournalText[] = [{ key: files.key.title, text: story.title }];
  const problems: string[] = [];
  const objectives: Json[] = [];
  let first = true;
  for (const s of story.beats) {
    const children: Json[] = [];
    if (first && story.description) {
      texts.push({ key: files.key.description, text: story.description });
      children.push(handle(await inst.make("gameJournalQuestDescription", { id: "description", description: locKey(files.key.description) })));
    }
    if (s.marker) {
      const at = place(s.marker);
      if (!at) problems.push(`The place "${s.marker}" is not a game map marker the quest index knows (${story.places.get(s.marker)?.marker}). Build the quest index, or check the marker's journal path: Find Quest finds markers.`);
      else children.push(handle(await inst.make("gameJournalQuestMapPin", {
        id: "marker",
        enableGPS: 1,
        // On the game marker's world node, like the game's own static markers. The game asks ArchiveXL for a
        // new marker's position only when it has a node; without one it shows at the world's origin (in-game
        // test 2026-10-22).
        reference: entityRef(at.node),
        offset: vector3(...at.offset),
        mappinData: await inst.make("gamemappinsMappinData", { mappinType: tweakId("Mappins.QuestStaticMappinDefinition"), active: 1, visibleThroughWalls: 1 }),
      })));
    }
    texts.push({ key: files.key.objective(s.name), text: s.objective });
    objectives.push(handle(await inst.make("gameJournalQuestObjective", { id: s.name, description: locKey(files.key.objective(s.name)), entries: children })));
    first = false;
  }
  const phase = handle(await inst.make("gameJournalQuestPhase", { id: "main", entries: objectives }));
  const quest = handle(await inst.make("gameJournalQuest", { id: story.id, title: locKey(files.key.title), type: story.type === "side" ? "SideQuest" : "MinorQuest", entries: [phase] }));
  const folder = handle(await inst.make("gameJournalFolderEntry", { id: files.journalFolder, entries: [quest] }));
  const rootEntry = handle(await inst.make("gameJournalRootFolderEntry", { id: "", entries: [folder] }));
  return { root: await inst.make("gameJournalResource", { cookingPlatform: "PLATFORM_PC", entry: rootEntry }), texts, problems };
}
