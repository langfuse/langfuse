import { parseDashboardToolResultContent } from "./dashboard-tool-result";

describe("parseDashboardToolResultContent", () => {
  it("unwraps the MCP text result emitted by an approved dashboard tool", () => {
    const content = JSON.stringify({
      content: [
        {
          type: "text",
          text: JSON.stringify({ id: "dashboard-1", name: "Reliability" }),
        },
      ],
    });

    expect(parseDashboardToolResultContent(content)).toEqual({
      id: "dashboard-1",
      name: "Reliability",
    });
  });

  it("does not treat an MCP error envelope as a successful write", () => {
    const content = JSON.stringify({
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ id: "dashboard-1" }) }],
    });

    expect(parseDashboardToolResultContent(content)).toBeNull();
  });
});
