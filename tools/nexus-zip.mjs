// Builds the Nexus Mods file from the packaged extension: dist/EDGEquest-<version>-nexus.zip with the
// .vsix, how to install it, and the licenses. Run after the vsix is packaged (npm run edgequest:package,
// or the release workflow's Package step). Modelled on REDcode's tools/nexus-zip.mjs.
//   node tools/nexus-zip.mjs
// The release workflow runs it whenever it builds EDGEquest, attaches the zip to the GitHub release and,
// with Update Nexus Mods, uploads it (the Nexus tool's release, EDGErepo's tools/nexus/nexus.mjs).
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ext = path.join(root, "extensions", "edgequest");
const { name, version } = JSON.parse(fs.readFileSync(path.join(ext, "package.json"), "utf8"));
const vsix = [path.join(root, "dist", `${name}-${version}.vsix`), path.join(ext, `${name}-${version}.vsix`)].find((p) => fs.existsSync(p));
const stage = path.join(root, "dist", "nexus");
const zip = path.join(root, "dist", `EDGEquest-${version}-nexus.zip`);

if (!vsix) throw new Error(`${name}-${version}.vsix is missing: package the extension first`);
fs.rmSync(stage, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.mkdirSync(stage, { recursive: true });

fs.copyFileSync(vsix, path.join(stage, path.basename(vsix)));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(stage, "LICENSE.txt"));
fs.copyFileSync(path.join(ext, "ThirdPartyNotices.txt"), path.join(stage, "ThirdPartyNotices.txt"));
fs.writeFileSync(
  path.join(stage, "README.txt"),
  [
    `EDGEquest for Cyberpunk 2077 ${version}: the EDGE quest maker, in VS Code.`,
    "Read the game's quests in plain words, and write new ones as a story.",
    "",
    "This is a VS Code extension, not a game mod. Do not install it with Vortex.",
    "",
    "Install:",
    "  1. Install REDcode for Cyberpunk 2077 first (VS Code Marketplace, Open VSX or",
    "     https://www.nexusmods.com/cyberpunk2077/mods/35421). It finds the game and installs",
    "     REDbridge, which EDGEquest uses to read and write the game's files.",
    "  2. In VS Code (or VSCodium, or EDGEkit), open the Extensions view (Ctrl+Shift+X).",
    "  3. Click ... at its top, choose Install from VSIX..., and pick",
    `     ${path.basename(vsix)} from this folder.`,
    "  4. Click the EDGEquest icon in the activity bar.",
    "",
    "Or from a terminal:",
    `  code --install-extension ${path.basename(vsix)}`,
    "",
    "The same extension is on the VS Code Marketplace and Open VSX (search for",
    "EDGEquest), where it updates itself.",
    "",
    "Quests you make need ArchiveXL in the game. Made for Cyberpunk 2077 2.5.",
    "Needs Windows 10 or 11, 64-bit, and VS Code 1.70 or later.",
    "",
    "Docs: https://edgemodders.github.io/EDGEquest/",
    "Source and issues: https://github.com/Edgemodders/EDGEquest",
    "",
  ].join("\r\n"),
);

// Windows' own tar writes zip files (-a picks the format from the name); Git's tar does not.
const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const packed = spawnSync(tar, ["-a", "-c", "-f", zip, ...fs.readdirSync(stage)], { cwd: stage, stdio: "inherit" });
if (packed.status !== 0) throw new Error("Zipping failed");
fs.rmSync(stage, { recursive: true, force: true });
console.log(`${zip}: ${(fs.statSync(zip).size / 1048576).toFixed(1)} MB`);
