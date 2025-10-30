/**
 * MCP Server Instance
 *
 * Main MCP server configuration and initialization.
 * This file will be populated in LF-1926 with the actual server setup.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ServerContext } from "../types.js";

/**
 * Create and configure the MCP server instance.
 *
 * This function will be implemented in LF-1926 to:
 * - Initialize the MCP Server
 * - Register all tools and resources
 * - Configure capabilities
 *
 * @param _context - Server context from authenticated request
 * @returns Configured MCP Server instance
 */
export function createMcpServer(_context: ServerContext): Server {
  const server = new Server(
    {
      name: "langfuse-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  // Tools and resources will be registered here in LF-1926 and LF-1928/LF-1929

  return server;
}
