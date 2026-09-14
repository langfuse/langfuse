// @vitest-environment node

import { classifyJsonShape } from "@/src/components/ui/jsonTableStyleVariants";

const shortKeys = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`key_${i}`, `value ${i}`]),
  );

describe("classifyJsonShape", () => {
  it("reads a flat object with short values as facts (the p50 output)", () => {
    expect(
      classifyJsonShape({
        workspace_id: "ws_4Hn2Qp",
        name: "Acme Robotics",
        plan: "team",
        previous_plan: "pro",
        plan_changed_at: "2026-09-10T16:04:51Z",
        seats: 3,
        billing_cycle: "monthly",
        owner: "maya.chen@acme.example",
      }),
    ).toBe("facts");
  });

  it("reads a root array as io", () => {
    expect(classifyJsonShape([{ role: "user", content: "hi" }])).toBe("io");
    expect(classifyJsonShape([])).toBe("io");
  });

  it("reads a top-level string over 80 chars as io", () => {
    expect(classifyJsonShape({ answer: "a".repeat(81) })).toBe("io");
    expect(classifyJsonShape({ answer: "a".repeat(80) })).toBe("facts");
  });

  it("reads a top-level string with a line break as io", () => {
    expect(classifyJsonShape({ answer: "yes.\nno." })).toBe("io");
  });

  it("reads three or more container levels as io, two as facts", () => {
    expect(classifyJsonShape({ a: { b: { c: 1 } } })).toBe("io");
    expect(classifyJsonShape({ a: { b: 1 }, c: [1, 2] })).toBe("facts");
  });

  it("reads more than 20 top-level keys as io", () => {
    expect(classifyJsonShape(shortKeys(21))).toBe("io");
    expect(classifyJsonShape(shortKeys(20))).toBe("facts");
  });

  it("looks at the top level only: a long string one level down stays facts", () => {
    expect(classifyJsonShape({ meta: { note: "b".repeat(200) } })).toBe(
      "facts",
    );
  });

  it("reads primitives as facts unless the root itself is a long string", () => {
    expect(classifyJsonShape(null)).toBe("facts");
    expect(classifyJsonShape(42)).toBe("facts");
    expect(classifyJsonShape("COMPLETE")).toBe("facts");
    expect(classifyJsonShape("line one\nline two")).toBe("io");
  });
});
