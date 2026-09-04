import { describe, expect, it } from "vitest";
import {
  getV4PreviewDisabledRedirect,
  getV4PreviewEnabledRedirect,
} from "./v4PreviewRedirect";

describe("getV4PreviewDisabledRedirect", () => {
  it("returns the legacy evaluator route for the default evaluator route", () => {
    expect(
      getV4PreviewDisabledRedirect(
        "/project/[projectId]/evals/rules",
        "project-1",
      ),
    ).toBe("/project/project-1/evals/legacy");
  });

  it("keeps the existing experiments fallback", () => {
    expect(
      getV4PreviewDisabledRedirect(
        "/project/[projectId]/experiments",
        "project-1",
      ),
    ).toBe("/project/project-1/datasets");
  });

  it("does not redirect routes available in both experiences", () => {
    expect(
      getV4PreviewDisabledRedirect("/project/[projectId]/traces", "project-1"),
    ).toBeNull();
  });
});

describe("getV4PreviewEnabledRedirect", () => {
  it("returns the default evaluator route from the legacy evaluator route", () => {
    expect(
      getV4PreviewEnabledRedirect(
        "/project/[projectId]/evals/legacy",
        "project-1",
      ),
    ).toBe("/project/project-1/evals");
  });

  it("does not redirect routes shared by both experiences", () => {
    expect(
      getV4PreviewEnabledRedirect(
        "/project/[projectId]/evals/templates",
        "project-1",
      ),
    ).toBeNull();
  });
});
