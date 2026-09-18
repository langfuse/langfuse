import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { SkillLabelsSelect, SkillTagsSelect } from "./SkillMetadataSelect";

function LabelsHarness({ onSave }: { onSave: (labels: string[]) => void }) {
  const [labels, setLabels] = useState(["production"]);
  return (
    <SkillLabelsSelect
      value={labels}
      options={["production", "staging"]}
      disabled={false}
      isSaving={false}
      onSave={async (nextLabels) => {
        onSave(nextLabels);
        setLabels(nextLabels);
        return true;
      }}
    />
  );
}

function TagsHarness({ onSave }: { onSave: (tags: string[]) => void }) {
  const [tags, setTags] = useState(["support"]);
  return (
    <SkillTagsSelect
      value={tags}
      options={["support", "internal"]}
      disabled={false}
      isSaving={false}
      onSave={async (nextTags) => {
        onSave(nextTags);
        setTags(nextTags);
        return true;
      }}
    />
  );
}

describe("skill metadata selectors", () => {
  it("stages prompt-style labels until they are saved", async () => {
    const onSave = vi.fn();
    render(<LabelsHarness onSave={onSave} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Labels" }));
    fireEvent.click(screen.getByRole("button", { name: "staging" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save labels" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(["production", "staging"]),
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Labels" }));
    const search = screen.getByPlaceholderText("Search or create label…");
    fireEvent.change(search, { target: { value: "canary" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save labels" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith([
        "production",
        "staging",
        "canary",
      ]),
    );
  });

  it("stages prompt-style tags until they are saved", async () => {
    const onSave = vi.fn();
    render(<TagsHarness onSave={onSave} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Tags" }));
    fireEvent.click(screen.getByRole("button", { name: "internal" }));
    expect(onSave).not.toHaveBeenCalled();

    const search = screen.getByPlaceholderText("Search or create tag…");
    fireEvent.change(search, { target: { value: "urgent" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(["support", "internal", "urgent"]),
    );
  });
});
