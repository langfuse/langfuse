import { describe, expect, it } from "vitest";

import { LANGFUSE_IN_APP_AGENT_SKILLS } from "./skills";

describe("in-app agent skills", () => {
  it("registers the evaluator design flow with its required project context", () => {
    const evaluatorDesignSkill = LANGFUSE_IN_APP_AGENT_SKILLS.find(
      (skill) => skill.name === "langfuse-evaluator-design",
    );

    expect(evaluatorDesignSkill).toBeDefined();
    expect(evaluatorDesignSkill?.description).toContain(
      "project traces or a user-provided goal",
    );
    expect(evaluatorDesignSkill?.instructions).toContain("listObservations");
    expect(evaluatorDesignSkill?.instructions).toContain("listEvaluators");
    expect(evaluatorDesignSkill?.instructions).toContain("listScores");
    expect(evaluatorDesignSkill?.instructions).toContain("upsertEvaluator");
    expect(evaluatorDesignSkill?.instructions).toContain(
      "Ask for explicit confirmation",
    );
  });
});
