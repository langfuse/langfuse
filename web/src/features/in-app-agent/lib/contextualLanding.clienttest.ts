import {
  activateInAppAgentContextualLanding,
  clearInAppAgentContextualLanding,
  getInAppAgentContextualLanding,
  registerInAppAgentContextualLanding,
  subscribeToInAppAgentContextualLanding,
  type InAppAgentContextualLanding,
} from "./contextualLanding";

function landing(id: string, title = id): InAppAgentContextualLanding {
  return {
    id,
    title,
    description: "Description",
    examples: [],
    onSubmit: vi.fn().mockResolvedValue(true),
  };
}

describe("in-app agent contextual landing", () => {
  it("scopes registration, activation, and subscriptions by project", () => {
    const projectOneListener = vi.fn();
    const projectTwoListener = vi.fn();
    const unsubscribeProjectOne = subscribeToInAppAgentContextualLanding(
      "project-1",
      projectOneListener,
    );
    const unsubscribeProjectTwo = subscribeToInAppAgentContextualLanding(
      "project-2",
      projectTwoListener,
    );
    const unregister = registerInAppAgentContextualLanding(
      "project-1",
      landing("evaluator"),
    );

    expect(activateInAppAgentContextualLanding("project-2", "evaluator")).toBe(
      false,
    );
    expect(activateInAppAgentContextualLanding("project-1", "evaluator")).toBe(
      true,
    );
    expect(getInAppAgentContextualLanding("project-1")?.id).toBe("evaluator");
    expect(getInAppAgentContextualLanding("project-2")).toBeUndefined();
    expect(projectOneListener).toHaveBeenCalledOnce();
    expect(projectTwoListener).not.toHaveBeenCalled();

    clearInAppAgentContextualLanding("project-1");
    expect(getInAppAgentContextualLanding("project-1")).toBeUndefined();
    expect(projectOneListener).toHaveBeenCalledTimes(2);

    unregister();
    unsubscribeProjectOne();
    unsubscribeProjectTwo();
  });

  it("does not let stale cleanup remove a replacement registration", () => {
    const unregisterOld = registerInAppAgentContextualLanding(
      "project-1",
      landing("evaluator", "Old"),
    );
    const unregisterNew = registerInAppAgentContextualLanding(
      "project-1",
      landing("evaluator", "New"),
    );

    activateInAppAgentContextualLanding("project-1", "evaluator");
    unregisterOld();
    expect(getInAppAgentContextualLanding("project-1")?.title).toBe("New");

    unregisterNew();
    expect(getInAppAgentContextualLanding("project-1")).toBeUndefined();
  });

  it("reactively exposes a replacement for the active landing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToInAppAgentContextualLanding(
      "project-1",
      listener,
    );
    const unregisterOld = registerInAppAgentContextualLanding(
      "project-1",
      landing("evaluator", "Old"),
    );
    activateInAppAgentContextualLanding("project-1", "evaluator");

    const unregisterNew = registerInAppAgentContextualLanding(
      "project-1",
      landing("evaluator", "New"),
    );

    expect(getInAppAgentContextualLanding("project-1")?.title).toBe("New");
    expect(listener).toHaveBeenCalledTimes(2);

    unregisterOld();
    unregisterNew();
    unsubscribe();
  });

  it("clears an active landing when its owner unregisters", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToInAppAgentContextualLanding(
      "project-1",
      listener,
    );
    const unregister = registerInAppAgentContextualLanding(
      "project-1",
      landing("evaluator"),
    );

    activateInAppAgentContextualLanding("project-1", "evaluator");
    unregister();

    expect(getInAppAgentContextualLanding("project-1")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
