# Dev setup

What a Windows PC needs to work on EDGEquest. The shared tools are the same as in [REDcode's setup guide](https://edgemodders.github.io/REDcode/dev-setup.html). Build steps are in section 5.

## 1. Base tools

| Tool | Version used | Why | Install |
|---|---|---|---|
| Git for Windows | as REDcode | Source control | `winget install --id Git.Git -e` |
| nvm for Windows and Node.js | Node 24.11.1, npm 11.14.1 | The extension and the MCP server are TypeScript, as the rest of the ecosystem | `winget install --id CoreyButler.NVMforWindows -e`, then `nvm install 24` and `nvm use 24` |
| Python | 3.10 or later | Brand tooling | |
| Chrome or Edge | any | Renders the brand images | Already present on Windows |
| REDbridge | 0.11.0 or later | Reads and writes game files; 0.10.0 adds the `loc.*` texts, 0.11.0 reads game 2.5 (EDGEquest's quest index needs it) | See [REDbridge's setup guide](https://edgemodders.github.io/REDbridge/dev-setup.html) |

## 2. Repository and GitHub

```powershell
git clone https://github.com/Edgemodders/EDGEquest.git
cd EDGEquest
git config user.name  "CyberbuildsAI"
git config user.email "340969962+CyberbuildsAI@users.noreply.github.com"
git config credential.https://github.com.username CyberbuildsAI
```

## 3. Game access for checks

Every claim about the game's quest data is checked against the installed game, not taken from memory. Two MCP servers give that access in Claude Code:

| Server | Gives | Add it |
|---|---|---|
| `redcode` (`@edgemodders/redcode-mcp`) | The game's files: `archive_search`, `archive_list`, `cr2w_read`, `cr2w_open` and `cr2w_get_node`, `loc_search`, `tweakdb_*` | `claude mcp add redcode -- cmd /c npx -y @edgemodders/redcode-mcp` (with REDcode installed it finds the bridge and the game itself; see [REDcode's MCP page](https://edgemodders.github.io/REDcode/mcp.html) for `--bridge` and `--game`) |
| `rednode` | The running game: `game_state`, `gameapi_lookup`, `api_call`, `tweakdb`, `logs`, and for quests `game_facts`, `game_journal`, `game_facts_set`, `game_journal_set`, `game_teleport` (REDnode 0.32.0 and later; the last three ask first) | See [REDnode's MCP page](https://edgemodders.github.io/REDnode/mcp.html) |

How the brief's counts were made (2026-10-16): `archive_list` in pages of 5,000 over every game file, grouped by extension; `cr2w_read` with node paths such as `graph.Data.nodes` on one sample of each type. Paths start at the root chunk's fields, without `root.`.

## 4. Docs site and brand images

The site at https://edgemodders.github.io/EDGEquest/ is built by `.github/workflows/pages.yml` on every push to `main`. **Settings > Pages > Source** must be **GitHub Actions**.

```powershell
.\tools\brand\render.ps1   # banner, social preview, icon, badges
```

| Output | Used by |
|---|---|
| `docs/assets/brand/banner.png` | README header |
| `docs/assets/brand/social.png` | Upload by hand in Settings > General > Social preview |
| `docs/assets/brand/icon.png` | Site icon, and the extension's Marketplace icon later |
| `docs/assets/brand/badges/*.svg` | README badges. Edit the list in `tools/brand/badges.py` |
| `tools/brand/activity.svg` | The activity bar icon. Drawn by hand, not rendered: 24 × 24, stroke 2, `currentColor`, the family's HUD brackets around a branching graph. Q1 copies it to `extensions/edgequest/images/activity.svg` |

## 5. Build, test and package

Installed with `npm install` at the repository root on 2026-10-21 (Node 24.11.1, npm 11.14.1). The layout is EDGEmat's: `extensions/edgequest` (its `src/core` has no VS Code imports) and `packages/edgequest-mcp`, which bundles the core.

| Package | Version | Used by |
|---|---|---|
| `vscode-jsonrpc` | 9.0.3 | The bridge client (copied from REDcode `8ba7879`), bundled into the extension and the MCP server |
| `yaml` | 2.9.1 | Reading `.xl` files in `quest_check`, bundled |
| `@modelcontextprotocol/sdk` | 1.32.1 | The MCP server, bundled |
| `zod` | 3.25.76 | The MCP server's tool schemas, bundled |
| `esbuild` | 0.28.2 | Bundling |
| `typescript` | 5.9.3 | Type checks |
| `@types/vscode` | 1.70.0 | The extension's API level (VS Code 1.70 or later) |
| `@vscode/vsce` | 4.0.0 | Packaging the VSIX |
| `ovsx` | 1.3.0 | Publishing to Open VSX, later |

```powershell
npm install
npm run typecheck            # both packages
npm run build                # extensions/edgequest/dist and packages/edgequest-mcp/dist
npm run smoke                # the core against the installed game (see Tests)
npm run edgequest:package    # dist\edgequest-0.1.0.vsix
code --install-extension dist\edgequest-0.1.0.vsix
```

The smoke test finds the game and REDbridge from the VS Code settings (`edgequest.*`, then `redcode.*`), as the extension does. F5 in VS Code, with the repository open, runs the extension in a development host (`.vscode/launch.json`, "Run EDGEquest"); build first.

The quest index is cached in `%LOCALAPPDATA%\EDGEquest\quest-index.json` (about 10 MB), shared by the extension and the MCP server. The extension builds it in the background on first start and after a game update (about 90 seconds); **EDGEquest: Rebuild Quest Index** forces it.

Register the MCP server with Claude Code (no options needed on a PC with REDcode set up). `--scope user` makes it available in every folder:

```powershell
claude mcp add --scope user edgequest -- node "E:\Modding\Cyberpunk 2077\EDGEquest\packages\edgequest-mcp\dist\server.cjs"
```

Its options, each also an environment variable, and an empty value counts as unset: `--game` (`EDGEQUEST_GAME_PATH`), `--bridge` (`REDBRIDGE_EXE`), `--dotnet-root` (`DOTNET_ROOT`), `--cache` (`EDGEQUEST_CACHE`).

