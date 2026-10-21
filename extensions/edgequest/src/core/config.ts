// Where the game and REDbridge are: EDGEquest's own settings, then REDcode's API and settings, then
// EDGEdeck's API, then a search of the machine. The same order as EDGEmat. No VS Code imports: the
// extension passes its settings and the APIs it found, and the MCP server passes the VS Code settings
// file it read.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findGames, isGameFolder } from "./gameFinder";

/** Reads a setting such as "edgequest.gamePath" or "redcode.gamePath"; empty strings count as unset. */
export type SettingsReader = (key: string) => string | undefined;

export interface OtherTools {
  /** REDcode's API gamePath(), when REDcode is active. */
  redcodeGamePath?: () => string | undefined;
  /** EDGEdeck's API gamePath(), when EDGEdeck is active. */
  edgedeckGamePath?: () => string | undefined;
}

export interface GameChoice {
  path: string;
  /** Where it came from, in plain words: "EDGEquest setting", "REDcode", "Steam" and so on. */
  from: string;
}

export const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** The game folder, or undefined when none is set or found. Searches the machine only when `search` is true. */
export async function resolveGame(settings: SettingsReader, tools: OtherTools = {}, search = true): Promise<GameChoice | undefined> {
  const candidates: [string | undefined, string][] = [
    [nonEmpty(settings("edgequest.gamePath")), "EDGEquest setting"],
    [nonEmpty(tools.redcodeGamePath?.()), "REDcode"],
    [nonEmpty(settings("redcode.gamePath")), "REDcode setting"],
    [nonEmpty(tools.edgedeckGamePath?.()), "EDGEdeck"],
  ];
  for (const [dir, from] of candidates) {
    if (isGameFolder(dir)) return { path: dir, from };
  }
  if (!search) return undefined;
  const found = await findGames();
  return found[0] ? { path: found[0].path, from: found[0].source } : undefined;
}

export interface BridgeChoice {
  exe: string;
  from: string;
  dotnetRoot?: string;
}

/** REDbridge.exe: EDGEquest's setting, then REDcode's, then REDbridge on PATH. A folder means REDbridge.exe inside it. */
export function resolveBridge(settings: SettingsReader): BridgeChoice | undefined {
  const dotnetRoot = nonEmpty(settings("edgequest.dotnetRoot")) ?? nonEmpty(settings("redcode.dotnetRoot"));
  for (const [value, from] of [
    [nonEmpty(settings("edgequest.bridgePath")), "EDGEquest setting"],
    [nonEmpty(settings("redcode.bridgePath")), "REDcode setting"],
  ] as const) {
    if (!value) continue;
    const exe = fs.existsSync(value) && fs.statSync(value).isDirectory() ? path.join(value, "REDbridge.exe") : value;
    if (fs.existsSync(exe)) return { exe, from, dotnetRoot };
  }
  const onPath = (process.env.PATH ?? "").split(path.delimiter).map((d) => path.join(d, "REDbridge.exe")).find((f) => fs.existsSync(f));
  return onPath ? { exe: onPath, from: "PATH", dotnetRoot } : undefined;
}

/** EDGEquest's cache folder, shared by the extension and the MCP server. */
export function defaultCacheDir(): string {
  const base = process.platform === "win32" ? (process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local")) : path.join(os.homedir(), ".cache");
  return path.join(base, "EDGEquest");
}

/** VS Code's user settings, read tolerantly (comments and trailing commas), for tools that run outside VS Code. */
export function vscodeUserSettings(): SettingsReader {
  const base = process.platform === "win32" ? process.env.APPDATA : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".config");
  let text = "";
  try {
    if (base) text = fs.readFileSync(path.join(base, "Code", "User", "settings.json"), "utf8");
  } catch {
    // no settings file: every setting is unset
  }
  return (key) => {
    const match = text.match(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return match ? nonEmpty(JSON.parse(`"${match[1]}"`)) : undefined;
  };
}
