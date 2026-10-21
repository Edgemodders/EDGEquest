// Bundles the extension (CommonJS, VS Code's module loader) and the core on its own (for the smoke
// test and other Node tools). `node esbuild.mjs --watch` rebuilds on change.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const common = { bundle: true, platform: "node", format: "cjs", target: "node18", sourcemap: true, logLevel: "info" };

const builds = [
  { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] },
  { ...common, entryPoints: ["src/core/index.ts"], outfile: "dist/core.js" },
];

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
