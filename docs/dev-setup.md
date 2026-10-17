# Dev setup

What a Windows PC needs to work on EDGEquest. The shared tools are the same as in [REDcode's setup guide](https://edgemodders.github.io/REDcode/dev-setup.html). There is no code yet: Q0 decides the details, and this page then gains its build steps with exact versions.

## 1. Base tools

| Tool | Version used | Why | Install |
|---|---|---|---|
| Git for Windows | as REDcode | Source control | `winget install --id Git.Git -e` |
| nvm for Windows and Node.js | as REDcode (Node 24) | The tool will be TypeScript, as the rest of the ecosystem | `winget install --id CoreyButler.NVMforWindows -e`, then `nvm install 24` and `nvm use 24` |
| Python | 3.10 or later | Brand tooling | |
| Chrome or Edge | any | Renders the brand images | Already present on Windows |
| REDbridge | 0.10.0 or later | Reads and writes game files; 0.10.0 adds the `loc.*` texts | See [REDbridge's setup guide](https://edgemodders.github.io/REDbridge/dev-setup.html) |

## 2. Repository and GitHub

```powershell
git clone https://github.com/Edgemodders/EDGEquest.git
cd EDGEquest
git config user.name  "CyberbuildsAI"
git config user.email "340969962+CyberbuildsAI@users.noreply.github.com"
```

## 3. Game access for checks

Every claim about the game's quest data is checked against the installed game, not taken from memory. Two MCP servers give that access in Claude Code:

| Server | Gives | Add it |
|---|---|---|
| `redcode` (`@edgemodders/redcode-mcp`) | The game's files: `archive_search`, `archive_list`, `cr2w_read`, `cr2w_open` and `cr2w_get_node`, `loc_search`, `tweakdb_*` | `claude mcp add redcode -- cmd /c npx -y @edgemodders/redcode-mcp` (with REDcode installed it finds the bridge and the game itself; see [REDcode's MCP page](https://edgemodders.github.io/REDcode/mcp.html) for `--bridge` and `--game`) |
| `rednode` | The running game: `game_state`, `gameapi_lookup`, `api_call`, `tweakdb`, `logs` | See [REDnode's MCP page](https://edgemodders.github.io/REDnode/mcp.html) |

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
