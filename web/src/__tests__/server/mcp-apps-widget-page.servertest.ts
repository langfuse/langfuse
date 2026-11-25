import { describe, expect, it } from "vitest";

// MCP App hosts never send a Langfuse session: the MCP server fetches this
// page anonymously and returns its HTML as `ui://langfuse/widget.html`. An
// auth gate in front of it would leave every host with an empty widget.
describe("MCP App widget page", () => {
  it("is served without a session", async () => {
    const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/mcp-apps/widget`, {
      redirect: "manual",
    });

    expect(response.status).toBe(200);
    // The page itself, not a sign-in page rendered or rewritten in its place.
    expect(await response.text()).toContain("<title>Langfuse widget</title>");
  });
});
