// Writes a story's journal: a partial tree ArchiveXL merges into the game's by path. The root's id is
// empty like the game's; one folder entry names the whole path to the quest type ("quests/side_quest"),
// as ArchiveXL finds entries by path. Texts are key names; ArchiveXL turns them into LocKeys.

import type { Json } from "../graph";
import type { Story } from "../story";
import { Instances, cname, handle, locKey, tweakId, vector3 } from "./wk";
import type { Layout } from "./layout";

export interface JournalText {
  key: string;
  text: string;
}

/** A place's world position: from the story, or from a game map marker (looked up by the caller). */
export type PlacePosition = (place: string) => [number, number, number] | undefined;

export async function writeJournal(story: Story, files: Layout, inst: Instances, position: PlacePosition): Promise<{ root: Json; texts: JournalText[]; problems: string[] }> {
  const texts: JournalText[] = [{ key: files.key.title, text: story.title }];
  const problems: string[] = [];
  const objectives: Json[] = [];
  let first = true;
  for (const s of story.steps) {
    if (s.kind !== "objective") continue;
    const children: Json[] = [];
    if (first && story.description) {
      texts.push({ key: files.key.description, text: story.description });
      children.push(handle(await inst.make("gameJournalQuestDescription", { id: "description", description: locKey(files.key.description) })));
    }
    if (s.marker) {
      const at = position(s.marker);
      if (!at) problems.push(`The place "${s.marker}" has no position: give it at: [x, y, z], or a game map marker the quest index knows.`);
      else children.push(handle(await inst.make("gameJournalQuestMapPin", {
        id: "marker",
        enableGPS: 1,
        // No NodeRef: ArchiveXL takes the offset as the world position.
        reference: { $type: "gameEntityReference", dynamicEntityUniqueName: cname(""), names: [], reference: { $type: "NodeRef", $storage: "uint64", $value: "0" }, sceneActorContextName: cname(""), slotName: cname(""), type: "EntityRef" },
        offset: vector3(...at),
        mappinData: await inst.make("gamemappinsMappinData", { mappinType: tweakId("Mappins.QuestStaticMappinDefinition"), active: 1, visibleThroughWalls: 1 }),
      })));
    }
    texts.push({ key: files.key.objective(s.id), text: s.text });
    objectives.push(handle(await inst.make("gameJournalQuestObjective", { id: s.id, description: locKey(files.key.objective(s.id)), entries: children })));
    first = false;
  }
  const phase = handle(await inst.make("gameJournalQuestPhase", { id: "main", entries: objectives }));
  const quest = handle(await inst.make("gameJournalQuest", { id: story.id, title: locKey(files.key.title), type: story.type === "side" ? "SideQuest" : "MinorQuest", entries: [phase] }));
  const folder = handle(await inst.make("gameJournalFolderEntry", { id: files.journalFolder, entries: [quest] }));
  const rootEntry = handle(await inst.make("gameJournalRootFolderEntry", { id: "", entries: [folder] }));
  return { root: await inst.make("gameJournalResource", { cookingPlatform: "PLATFORM_PC", entry: rootEntry }), texts, problems };
}
