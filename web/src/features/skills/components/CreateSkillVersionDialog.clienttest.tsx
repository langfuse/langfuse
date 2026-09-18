import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { CreateSkillVersionDialog } from "./CreateSkillVersionDialog";
import { createSkillEditorStore } from "./skillEditorStore";

describe("CreateSkillVersionDialog", () => {
  it("collects the version note before confirmation", () => {
    const store = createSkillEditorStore({
      name: "support-triage",
      baseVersion: 2,
      labels: ["production"],
      tags: ["support"],
      files: [
        {
          path: "SKILL.md",
          content: "# Support triage",
          contentType: "text/markdown",
          executable: false,
        },
      ],
    });
    const onConfirm = vi.fn(async () => undefined);

    render(
      <Dialog open>
        <DialogContent>
          <CreateSkillVersionDialog
            store={store}
            name="support-triage"
            isFirstVersion={false}
            isSaving={false}
            onCancel={vi.fn()}
            onConfirm={onConfirm}
          />
        </DialogContent>
      </Dialog>,
    );

    fireEvent.change(screen.getByLabelText("Version note"), {
      target: { value: "Clarify escalation steps" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create version" }));

    expect(store.getState().commitMessage).toBe("Clarify escalation steps");
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
