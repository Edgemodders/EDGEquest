// EDGEquest as an MCP server over stdio. Q1 skeleton.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

declare const __VERSION__: string;

const server = new McpServer({ name: "edgequest", version: __VERSION__ });

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  process.stderr.write(`[edgequest-mcp] ${__VERSION__} ready\n`);
}

main().catch((e) => {
  process.stderr.write(`[edgequest-mcp] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
