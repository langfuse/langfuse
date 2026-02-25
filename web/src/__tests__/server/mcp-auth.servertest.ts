/** @jest-environment node */

// Mock queue operations to avoid Redis dependency in tests
jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    // Mock queue getInstance to return a no-op queue
    EventPropagationQueue: {
      getInstance: () => ({
        add: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      }),
    },
  };
});

import { createMcpTestSetup } from "./mcp-helpers";

const MCP_ENDPOINT = "/api/public/mcp";

describe("MCP Authentication", () => {
  describe("HTTP status codes for auth errors", () => {
    it("should return 401 for invalid credentials", async () => {
      const invalidAuth = Buffer.from("pk-invalid:sk-invalid").toString(
        "base64",
      );

      const response = await fetch(`http://localhost:3000${MCP_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${invalidAuth}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Authentication failed");
    });

    it("should return 401 for missing authorization header", async () => {
      const response = await fetch(`http://localhost:3000${MCP_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should return 200 for valid credentials", async () => {
      const { auth } = await createMcpTestSetup();

      const response = await fetch(`http://localhost:3000${MCP_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          // auth already includes "Basic " prefix from createBasicAuthHeader
          Authorization: auth,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
          id: 1,
        }),
      });

      // MCP initialize should succeed with valid auth
      expect(response.status).toBe(200);
    });
  });
});
