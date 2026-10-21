// Bundles the MCP server into one CommonJS file, with EDGEquest's core taken from the extension's source
// (it has no VS Code dependency) and the MCP SDK included, so `node dist/server.cjs` needs nothing else.
// Also copies the repository's MIT licence beside package.json for npm.
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));

await esbuild.build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  define: { __VERSION__: JSON.stringify(pkg.version) },
  banner: { js: "#!/usr/bin/env node" },
});
fs.copyFileSync(path.join(here, "..", "..", "LICENSE"), path.join(here, "LICENSE"));
