# EDGEquest on Nexus Mods

The source of EDGEquest's Nexus Mods page lives here, so updates are edits in the repo, not in Nexus's text box. **The page: [mod 35750](https://www.nexusmods.com/cyberpunk2077/mods/35750)** (created by the owner on 2026-11-03; no files until the first release).

The page is kept through Nexus's v3 API, as REDnode's, REDcode's and the other EDGE tools' are: `tools/nexus/` (copied from REDnode unchanged; keep the copies the same) and `nexus.json` (the page, and how a release uploads: Mod Manager Download off, the old version archived). The release workflow's **Update Nexus Mods** box, with What EDGEquest, uploads the Nexus zip, adds the changelog and pushes `description.bbcode`.

| File | What it is |
|---|---|
| `description.bbcode` | The page's description, in Nexus's BBCode |
| `README.md` | This page: the other fields of the Nexus form, the download file, and how to update |
| `nexus.json` | The page, its internal mod id and main file (written by `pull`), how a release uploads, and the hash of the description last pulled |
| `images/` | Screenshots the description shows, when there are some |

## The Nexus form

| Field | Value |
|---|---|
| Mod name | EDGEquest for Cyberpunk 2077 |
| Version | EDGEquest's version, from `extensions/edgequest/package.json` (the first release sets it) |
| Category | Modders Resources and Tutorials |
| Brief overview | The EDGE quest maker in VS Code: read the game's quests in plain words, and write your own as a story with beats, choices, places, music and sound. A VS Code extension, not a game mod. (255 characters at most; this is 184) |
| Author | Edgemodders |
| Language | English |
| Primary image | `docs/assets/brand/social.png` (1280 x 640). The banner is already at the top of the description |
| Requirements | On Nexus: REDcode (35421) and ArchiveXL (4198). Off-site: VS Code 1.70 or later (or VSCodium, or EDGEkit) |
| Permissions | MIT: open source, free to modify and redistribute with the license notice. Bundled packages keep their licenses (`ThirdPartyNotices.txt`). REDbridge, a separate download, is GPL-3.0 |
| Tags | Modders resource, utility, tools, quests |

Screenshots go in `images/` (WebP, as Nexus serves them) and the description links them from this repo's `main` branch: `[img]https://raw.githubusercontent.com/Edgemodders/EDGEquest/main/nexus/images/<name>[/img]`. Good first ones: the Storyboard, a beat's page, a game quest's page, and the choice in the game.

## The download

One main file: `EDGEquest-<version>-nexus.zip`, with:

| File | What it is |
|---|---|
| `edgequest-<version>.vsix` | The extension, the same file the Marketplace and Open VSX have |
| `README.txt` | How to install it: REDcode first, then Install from VSIX in VS Code, or `code --install-extension` |
| `LICENSE.txt`, `ThirdPartyNotices.txt` | EDGEquest's license and its bundled packages' |

**Mod Manager Download stays off** for this file (`nexus.json`, `modManager: false`): it is a VS Code extension, and Vortex would deploy it into the game folder, where it does nothing.

The release workflow builds it whenever it builds EDGEquest (`tools/nexus-zip.mjs`), keeps it in the run's artifact, and attaches it to the GitHub release beside the `.vsix`. By hand, after packaging the vsix (`npm run edgequest:package`): `npm run nexus:zip`.

## Updating the page

1. Edit `description.bbcode` here, check it with `node tools/check-bbcode.mjs nexus/description.bbcode`, commit, push.
2. With a release: tick **Update Nexus Mods** beside **Make a release**, What EDGEquest (or `npm run release:nexus`). After the GitHub release the workflow uploads the zip (the first release creates the main file; later ones add versions to it, the old one archived), adds the version's changelog (`npm run release:notes -- --nexus`) and pushes `description.bbcode` when it differs.
3. The push never overwrites an edit made on Nexus: if the live description is neither the one last pulled nor the one the previous release pushed, the run stops before it builds. Then `npm run nexus:pull`, merge with `git diff`, commit, and run again. `npm run nexus:status` shows the page's version, files and whether its description matches.
4. If the Nexus step fails after the GitHub release, run `node tools/nexus/nexus.mjs release --version <version> --zip <the release's Nexus zip> --notes <notes file>` on the dev PC: it skips what is already done. Add `--dry-run` to see what it would do.

The key: in CI the organisation secret `NEXUS_KEY`; on the dev PC the DPAPI file `%APPDATA%\Edgemodders\nexus-key.txt` (`tools/nexus/api.mjs`). Never print it or pass it on a command line.

Pulled on 2026-11-03: the live description was Nexus's empty template (`nexus.json` records it), so the first release with **Update Nexus Mods** pushes this one.

Keep these in step with the extension (its README and the CHANGELOG):

| Where in the description | Update when |
|---|---|
| The STATUS box near the top | The preview flag goes |
| "Highlights" | A release adds a view, an editor or a command a modder would notice |
| "Coming next" | Its items are released (move them to Highlights) or new ones are planned |
| "Requirements" | The VS Code minimum (`engines.vscode`), the game version or REDbridge's minimum changes |
| "Can people talk to V in my scenes?" | People in scenes and phone calls are released |

## BBCode used

Nexus's BBCode has no tables or Markdown, so the page uses only: `[b]`, `[i]`, `[size=2..5]`, `[color=#hex]`, `[center]`, `[quote]`, `[line]`, `[list]` with `[*]`, `[url=...]` and `[img]`. The colours are the house palette: yellow `#fcee0a` for headings, cyan `#19f3ff` for highlights, orange `#f6b26b` for the preview line.
