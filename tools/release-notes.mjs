// Prints the release notes for one version from CHANGELOG.md's section for it. The release workflow
// uses it for the GitHub release and Nexus's changelog, and stops before releasing anything when the
// version has no section. The same convention as every Edgemodders repo (REDnode's
// tools/release/notes.mjs, REDcode's tools/release-notes.mjs); EDGEquest keeps one CHANGELOG.md at
// the top for the extension and the MCP server, which release with the same version.
//
//   node tools/release-notes.mjs <folder> [version] [--nexus] [--out <file>]
//     <folder>   extensions/edgequest or packages/edgequest-mcp (its package.json gives the version)
//     version    defaults to the folder's package.json version
//     --nexus    plain lines for Nexus's changelog field (the Nexus tool's release --notes, EDGErepo's tools/nexus/nexus.mjs)
//     --out      writes the notes to a file (UTF-8)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const nexus = args.includes("--nexus");
if (nexus) args.splice(args.indexOf("--nexus"), 1);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const [folder, given] = args;
if (!folder) {
  console.error("usage: node tools/release-notes.mjs <folder> [version] [--nexus] [--out <file>]");
  process.exit(2);
}
const version = given ?? JSON.parse(readFileSync(join(root, folder, "package.json"), "utf8")).version;
const file = "CHANGELOG.md";
const lines = readFileSync(join(root, file), "utf8").split(/\r?\n/);

// "## 0.1.0" or "## 0.1.0 (2026-11-10)"
const heading = new RegExp(`^## ${version.replace(/\./g, "\\.")}(\\s|$)`);
const start = lines.findIndex((line) => heading.test(line));
if (start < 0) {
  console.error(`${file} has no section for ${version}: rename Unreleased to "## ${version} (date)" first`);
  process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
if (end < 0) end = lines.length;
const section = lines.slice(start + 1, end).join("\n").trim();
if (!section) {
  console.error(`${file}: the section for ${version} is empty`);
  process.exit(1);
}

// Nexus's changelog takes one plain line per change: no markdown, links as "text (url)".
const plain = (text) =>
  text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
// A change under a group line (**New**, **Changed**, **Fixed**, **Other**) gets the group in front.
function nexusLines() {
  const result = [];
  let group = "";
  for (const line of section.split("\n")) {
    const groupHeading = line.match(/^\*\*(.+)\*\*$/);
    if (groupHeading) group = groupHeading[1];
    else if (line.startsWith("- ")) result.push((group ? `${group}: ` : "") + plain(line.slice(2)));
    else if (line.trim()) result.push(plain(line.trim()));
  }
  return result.join("\n");
}
const notes = nexus ? nexusLines() : section;

if (out) writeFileSync(out, notes + "\n", "utf8");
else console.log(notes);
