import { scoreSwitcherMatch } from "@/src/features/app-shell/fns/scoreSwitcherMatch";

describe("scoreSwitcherMatch", () => {
  it("shows everything for an empty query", () => {
    expect(scoreSwitcherMatch("  ", ["chat-prod", "Globex Labs"])).toBe(1);
  });

  it("matches by name and never by scattered letters", () => {
    expect(scoreSwitcherMatch("rag", ["rag-pipeline", "Northwind"])).toBe(1);
    expect(scoreSwitcherMatch("rag", ["chat-prod", "Globex Labs"])).toBe(0);
  });

  it("ranks a prefix above a word start, above a substring, above the organization", () => {
    const scores = [
      scoreSwitcherMatch("pipe", ["pipeline-eval", "Acme"]),
      scoreSwitcherMatch("pipe", ["rag-pipeline", "Acme"]),
      scoreSwitcherMatch("pipe", ["ragpipeline", "Acme"]),
      scoreSwitcherMatch("pipe", ["chat", "Pipeworks"]),
    ];

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(4);
    expect(Math.min(...scores)).toBeGreaterThan(0);
  });

  it("finds a project by its organization's name", () => {
    expect(
      scoreSwitcherMatch("northwind", ["agents-staging", "Northwind Research"]),
    ).toBeGreaterThan(0);
  });
});
