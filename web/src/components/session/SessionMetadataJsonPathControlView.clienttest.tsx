import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import { SessionMetadataJsonPathControlView } from "@/src/components/session/SessionMetadataJsonPathControlView";

describe("SessionMetadataJsonPathControlView", () => {
  it("adds multiple unique paths and removes one configured pill", () => {
    const onSave = vi.fn();
    const onRemove = vi.fn();

    function Harness() {
      const [paths, setPaths] = useState<string[]>([]);

      return (
        <SessionMetadataJsonPathControlView
          key={JSON.stringify(paths)}
          paths={paths}
          source={{
            state: "ready",
            metadata: {
              email: "danielm@nexite.io",
              cloud_region: "EU",
            },
            metadataTruncated: false,
          }}
          isEditorOpen
          onEditorOpenChange={vi.fn()}
          onSave={(path) => {
            onSave(path);
            setPaths((current) => [...current, path]);
          }}
          onRemove={(path) => {
            onRemove(path);
            setPaths((current) => current.filter((item) => item !== path));
          }}
        />
      );
    }

    render(<Harness />);
    const input = () => screen.getByLabelText("Metadata JSONPath");
    const save = () => screen.getByRole("button", { name: "Save" });

    fireEvent.change(input(), { target: { value: "email" } });
    expect(screen.getByText("JSONPath must start with $.")).toBeInTheDocument();
    expect(save()).toBeDisabled();

    fireEvent.change(input(), { target: { value: "$.email" } });
    expect(screen.getByText("danielm@nexite.io")).toBeInTheDocument();
    fireEvent.click(save());

    fireEvent.change(input(), { target: { value: "$.email" } });
    expect(
      screen.getByText("This JSONPath is already shown."),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();

    fireEvent.change(input(), { target: { value: "$.cloud_region" } });
    fireEvent.click(save());
    expect(onSave).toHaveBeenNthCalledWith(1, "$.email");
    expect(onSave).toHaveBeenNthCalledWith(2, "$.cloud_region");
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("cloud_region")).toBeInTheDocument();
    expect(screen.getByText("EU")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove metadata JSONPath $.email",
      }),
    );
    expect(onRemove).toHaveBeenCalledWith("$.email");
    expect(screen.queryByText("email")).not.toBeInTheDocument();
    expect(screen.getByText("cloud_region")).toBeInTheDocument();
  });
});
