// Writes ThirdPartyNotices.txt for the extension and the MCP server: every npm package esbuild puts
// into their bundles, with its version, license and license text. Run after adding or updating a
// dependency, and before a release; the Nexus zip and the npm package ship the file.
//   node tools/third-party-notices.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { build } = createRequire(path.join(root, "package.json"))("esbuild");
const targets = [
  { name: "EDGEquest", entry: "extensions/edgequest/src/extension.ts", external: ["vscode"], out: "extensions/edgequest/ThirdPartyNotices.txt" },
  { name: "edgequest-mcp", entry: "packages/edgequest-mcp/src/server.ts", external: [], out: "packages/edgequest-mcp/ThirdPartyNotices.txt" },
];

const licenseText = (dir) => {
  const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  return file ? fs.readFileSync(path.join(dir, file), "utf8").trim() : undefined;
};

for (const t of targets) {
  const r = await build({ entryPoints: [path.join(root, t.entry)], bundle: true, platform: "node", format: "cjs", write: false, metafile: true, external: t.external, logLevel: "silent" });
  const names = new Set();
  for (const input of Object.keys(r.metafile.inputs)) {
    const m = input.replace(/\\/g, "/").match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
    if (m) names.add(m.at(-1).replace("node_modules/", ""));
  }
  const parts = [
    `${t.name} includes the following third-party packages, bundled into its code. Each keeps its own license, given below.`,
    `${t.name} itself is MIT licensed (LICENSE).`,
  ];
  for (const name of [...names].sort()) {
    const dir = path.join(root, "node_modules", name);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const text = licenseText(dir);
    if (!text) throw new Error(`${name} has no license file in ${dir}`);
    parts.push(`${"-".repeat(78)}\n${name} ${pkg.version} (${pkg.license})\n${pkg.homepage ?? ""}\n\n${text}`);
  }
  fs.writeFileSync(path.join(root, t.out), parts.join("\n\n") + "\n", "utf8");
  console.log(`${t.out}: ${names.size} packages`);
}
