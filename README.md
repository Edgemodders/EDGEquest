<p align="center">
  <img src="docs/assets/brand/banner.png" alt="EDGEquest: the EDGE quest maker for Cyberpunk 2077. Write new quests: the story, the talk, the journal, in the game. Makes quests and scenes, engine REDbridge, MIT." width="100%">
</p>

<p align="center">
  <a href="https://edgemodders.github.io/EDGEquest/"><img src="docs/assets/brand/badges/docs.svg" alt="docs: read the docs"></a>
  <img src="docs/assets/brand/badges/status.svg" alt="status: scaffold">
  <img src="docs/assets/brand/badges/game.svg" alt="game: Cyberpunk 2077">
  <img src="docs/assets/brand/badges/makes.svg" alt="makes: quests">
  <a href="LICENSE"><img src="docs/assets/brand/badges/license.svg" alt="license: MIT"></a>
</p>

The EDGE quest maker for Cyberpunk 2077, a VS Code extension in the EDGE family. Open any of the game's quests and read it in plain words: its steps, its choices, who says what, what goes in the journal. Then write your own: a new gig, a phone call, a conversation with a choice that matters. Or skip the UI: EDGEquest's MCP server lets REDagent or Claude do it when you say "add a side gig where Wakako sends V to collect a debt".

EDGEquest builds on the other EDGE tools: [REDcode](https://github.com/Edgemodders/REDcode) for the project and packing, [REDbridge](https://github.com/Edgemodders/REDbridge) for game files, [EDGEwave](https://github.com/Edgemodders/EDGEwave) for voice, [EDGEbuilder](https://github.com/Edgemodders/EDGEbuilder) for people and places in the world, and [EDGEdeck](https://github.com/Edgemodders/EDGEdeck) and [REDnode](https://github.com/Edgemodders/REDnode) to try the quest in the game.

**[Read the docs](https://edgemodders.github.io/EDGEquest/)** &middot; [Design](docs/design.md) &middot; [Dev setup](docs/dev-setup.md)

> [!NOTE]
> **Status: Q2 Write, not released yet.** EDGEquest reads the game's quests in plain words (Q1) and makes new ones from a story file: a quest made from its template plays in the game from start to end, and a choice can branch it to different endings. The Storyboard edits a quest as cards, one per beat, and the MCP server lets an assistant start, edit and make a quest. There is no release yet: to try it, build it from source ([Dev setup](docs/dev-setup.md), section 5). What works so far is in the [changelog](CHANGELOG.md), and where it goes is in the [design](docs/design.md). Tested in the game on 2.31; on 2.5, REDbridge does not yet read every game file ([REDbridge #10](https://github.com/Edgemodders/REDbridge/issues/10)).

## Repository layout

| Path | Contents |
|---|---|
| `extensions/edgequest/` | The VS Code extension; `src/core` holds everything that is not UI, with no VS Code imports |
| `packages/edgequest-mcp/` | The MCP server `edgequest`, which bundles the core |
| `docs/` | Documentation site: the design, the quest formats, the tests and the dev setup |
| `tools/brand/` | Renders the banner, icon and badges; `activity.svg` is the activity bar icon |
| `CHANGELOG.md` | What changed, newest first |

## Legal

EDGEquest is MIT. Like REDcode, it talks to REDbridge (GPL-3.0, because it links WolvenKit) only as a separate process and never links it. This repository contains no game files and no data extracted from them. Single-player modding only. EDGEquest is not affiliated with CD Projekt RED.

## License

[MIT](LICENSE)
