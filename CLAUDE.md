# EDGEquest: notes for Claude sessions

EDGEquest is the EDGE quest maker for Cyberpunk 2077: a VS Code extension in the EDGE family (`edgemodders.edgequest`, proposed) and an MCP server. It reads the game's quests in plain words and writes new ones: quest and phase graphs, facts, journal entries and dialogue scenes. Read [docs/design.md](docs/design.md) first.

## Status and next step

- Scaffold created 2026-10-16 by the REDcode session: README, license, docs site (HUD layout, dev setup), brand sources and images (icon "EQ", activity bar icon), Pages workflow. No code.
- **Q0 done 2026-10-21: design draft 0.2 agreed with the owner.** [docs/design.md](docs/design.md) has the decisions (native quest files first through ArchiveXL, REDnode quests later, CyberScript studied only), the boundaries checked against the sibling repos that day, the shape, the MCP conventions (same as `edgemat-mcp`) and phases Q1 to Q5. [docs/design/formats.md](docs/design/formats.md) has the formats, checked against the game, ArchiveXL and two quest mods.
- **Q1 Read built 2026-10-21** (see `docs/testing.md`): core (graph reader, plain-words describer, scene reader, quest index, renderer, `quest_check`), the extension (Game Quests view, Find Quest, quest page, Check Quest Mod), MCP `quest_index`, `quest_find`, `quest_describe`, `quest_scene`, `quest_check`. `npm run smoke` passes 15 checks. The owner's hand test passed 2026-10-21 (one fault, fixed). Q1's own test (follow a side quest on the quest page alone) is the owner's, still open.
- **Q2 Write: plan agreed 2026-10-21** (design, Q2 row and the "Where a written quest lives" decision): a `.quest.yaml` story file makes the game files; template starts on load, map marker and trigger area at a game NodeRef, scene with V alone and a choice, then a phone call. Being built. Core writer built; in-game test 1 (2026-10-22) failed on the marker (no NodeRef: shown at the origin) and subtitles (the `.xl` needs a subtitle map), both fixed; test 2 pending (see `docs/testing.md`).
- Test data for `quest_check`: the Judy mod (Nexus 7833) is in this session's scratchpad only; never commit mod files.
- Requests filed on 2026-10-21 (see the design's boundaries table): REDbridge (spoken lines in `loc.*`), REDcode (`.journal` in the CR2W editor, quest graph editors move here), REDnode (quest calls), EDGEwave (voice a list of lines, `.wem`), EDGEbuilder (quest places).
- At the start of each session: read this repo's open issues labelled `request` (needs from other EDGE repos), and check whether the requests EDGEquest filed elsewhere have answers.

## The EDGE platform

EDGE is an AI-first modding platform for Cyberpunk 2077, by the same owner as every repo below (GitHub organisation Edgemodders). EDGEmodders is the community and organisation; EDGE is the platform brand. Each tool has its own repo and its own `CLAUDE.md`; most are checked out as siblings of this one under `E:\Modding\Cyberpunk 2077\` (EDGEbuilder is not, on this machine: read it on GitHub). Read a sibling's notes and design before relying on it; another session may be working in it right now.

| Tool | What it is | What EDGEquest gets from it |
|---|---|---|
| REDcode | The editor: a VS Code extension, `edgemodders.redcode-cyberpunk` (0.10.0 on the Marketplace and Open VSX). WolvenKit projects, Game Assets tree, CR2W editor, viewers, TweakDB and LocKeys views, pack and install | `REDcodeApi` version 1 from `activate()` ([docs/api.md](https://edgemodders.github.io/REDcode/api.html)): game folder, bridge, project, pack. Its CR2W editor already opens `.quest`, `.questphase`, `.scene` and `.journal` for raw edits |
| REDbridge | WolvenKit's C# engine behind JSON-RPC over stdio, GPL-3.0, .NET 10 (0.10.0) | Every game file read and write: `archive.*`, `cr2w.*` (document sessions, JSON Patch), `tweakdb.*`, `loc.*` |
| redcode-mcp | REDbridge as MCP tools, `@edgemodders/redcode-mcp` on npm (0.3.0) | How a session checks the game's data. See [docs/dev-setup.md](docs/dev-setup.md) section 3 |
| REDnode | The runtime: a RED4ext plugin plus Node.js, mods and HTML overlays in the running game, a typed game API with a published reference, an MCP server (`rednode`) | Trying a quest live: facts (`questQuestsSystem`), the journal (`gameJournalManager`), `api_call`. Reference: https://edgemodders.github.io/REDnode/game/ |
| EDGEdeck | The mod manager extension (was REDdeck): deploy with a manifest, undo, conflicts, Nexus. `EDGEdeckApi` 1, MCP server `@edgemodders/edgedeck-mcp` on npm | Deploying, through REDcode's install or its API |
| REDagent | The in-game assistant, powered by Claude, a REDnode package | A user of EDGEquest's MCP tools |
| EDGEwave | The sound studio extension, on REDcode | Voice for new lines |
| EDGEbuilder | The world builder, in the game on REDnode | People, props and places a quest refers to |
| EDGEmat | The material editor | Rarely needed for quests |
| EDGEfab | The asset maker: new items and objects | Rewards and new characters' items |
| EDGEkit | The branded editor and the extension pack `edgemodders.edgekit` | Bundles EDGEquest once it is released. Ask EDGEkit with a `request` issue then |
| EDGEchat | The Claude Code plugin for EDGE (was EDGEplugin): skills and the EDGE MCP servers, listed in its `plugin.json` | Lists `edgequest-mcp` once it is on npm. Ask with a `request` issue then |
| EDGEweb | The platform site and wiki | Lists EDGEquest once there is something to show |

**How the tools work together:** when two tools are installed, one owns each job and the others call it, through an exported extension API or MCP tools, never by importing each other's code. Each still works alone, with a fallback. Before building anything in another tool's domain, check whether that tool does it and agree a small entry point with the owner.

## Conventions

- Same as the sibling repos (see REDcode's and EDGEfab's CLAUDE.md): commit straight to `main` in small logical commits and push; agree the plan in chat first; PRs only for large or risky changes. Plain, short sentences; tables for comparisons and facts; mark anything unverified as unverified.
- **Changelog:** [CHANGELOG.md](CHANGELOG.md), the Edgemodders convention (issue #1, copied from REDnode). Add a line under **Unreleased** in the same commit as the change; leave out changes only the tests see. Release notes for GitHub, the stores and Nexus come from it.
- **Git identity:** per repo, `CyberbuildsAI` with the GitHub no-reply email (`340969962+CyberbuildsAI@users.noreply.github.com`), already set in this checkout. Never change the global identity. A push can block on a Git Credential Manager sign-in window; if it does, tell the owner rather than retrying.
- **Never commit game files**, WolvenKit binaries, or data extracted from the game. Class and field names, game paths, counts and a few short example values in docs are fine. No dialogue text from the game beyond a few words.
- **License boundary:** this repo is MIT. Talk to REDbridge (GPL-3.0) only as a separate process; never link it or copy WolvenKit code here. Study other mods and tools for how quests are built (their file sets and behavior), never copy their code or data, and credit WolvenKit and the community where their work informs ours.
- **Do not change other EDGE repos from here**; other sessions work in them. Needs go to them as issues labelled `request` on their repo, with the shape that would work. Record each one in the design's boundaries table with its issue link.
- **The mission decides UI questions:** modding for everyone, especially non-coders; easy, fun, fast. Story words first, raw nodes one click away. Every feature ships in the UI and the MCP server together. AI is optional: no network calls or telemetry until an assistant or an AI service the user chose connects.
- Keep `extensions/edgequest/src/core` free of VS Code imports; the MCP server bundles it.
- **House style** is the HUD look from REDnode's design doc; the REDnode HUD theme (`edgemodders.rednode-hud-theme`, in REDcode's repo) is the default theme for any VS Code UI.
- **Docs site:** `docs/` is published by GitHub Pages through `.github/workflows/pages.yml` at https://edgemodders.github.io/EDGEquest/. `docs/index.md` is the landing page (document ledger and roadmap status); add every page to `nav` in `docs/_config.yml`. Brand images come from `tools/brand/render.ps1`; re-run it when a badge changes. Record every tool install in `docs/dev-setup.md`, with versions and exact commands.
- **Machine:** the game is at `E:\SteamLibrary\steamapps\common\Cyberpunk 2077`. WolvenKit test projects live in `E:\Modding\Cyberpunk 2077\Projects`. In-game test archives go in a test project's `tests` folder, never its `packed` folder (Pack clears it).
- **Shell pitfalls on this machine:** Bash heredocs and `node -e` strings eat backslashes in Windows game paths; write such text with the Write or Edit tool, or a script file.
