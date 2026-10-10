import { useEffect } from "react";
import { act, renderHook } from "@testing-library/react";

import {
  activateInAppAgentContextualLanding,
  getInAppAgentContextualLanding,
  registerInAppAgentContextualLanding,
  type InAppAgentContextualLanding,
  useInAppAgentContextualLanding,
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
  it("rejects activation from another project", () => {
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

    unregister();
  });

  it("reacts to activation and replacement without stale owner cleanup", () => {
    const useOwnedLanding = (ownedLanding: InAppAgentContextualLanding) => {
      useEffect(
        () => registerInAppAgentContextualLanding("project-1", ownedLanding),
        [ownedLanding],
      );
      return useInAppAgentContextualLanding("project-1");
    };
    const oldLanding = landing("evaluator", "Old");
    const newLanding = landing("evaluator", "New");
    const oldOwner = renderHook(() => useOwnedLanding(oldLanding));

    act(() => {
      activateInAppAgentContextualLanding("project-1", "evaluator");
    });
    expect(oldOwner.result.current?.title).toBe("Old");

    const newOwner = renderHook(() => useOwnedLanding(newLanding));
    expect(newOwner.result.current?.title).toBe("New");

    oldOwner.unmount();
    expect(newOwner.result.current?.title).toBe("New");

    newOwner.unmount();
    expect(getInAppAgentContextualLanding("project-1")).toBeUndefined();
  });
});
