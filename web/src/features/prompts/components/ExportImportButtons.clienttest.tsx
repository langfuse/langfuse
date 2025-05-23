import { fireEvent, render, waitFor } from "@testing-library/react";
import { ExportPromptsButton } from "./ExportPromptsButton";
import { ImportPromptsButton } from "./ImportPromptsButton";

jest.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

jest.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: jest.fn(),
}));

jest.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: jest.fn(),
}));

const mutateExport = jest.fn(() => Promise.resolve([]));
const mutateImport = jest.fn(() => Promise.resolve());

jest.mock("@/src/utils/api", () => ({
  api: {
    prompts: {
      exportAll: {
        useMutation: () => ({ mutateAsync: mutateExport }),
      },
      importMany: {
        useMutation: () => ({ mutateAsync: mutateImport }),
      },
    },
  },
}));

describe("prompt export/import buttons", () => {
  it("calls export mutation", async () => {
    const { getByText } = render(<ExportPromptsButton projectId="p1" />);
    fireEvent.click(getByText("Export"));
    fireEvent.click(getByText("JSON"));
    await waitFor(() => {
      expect(mutateExport).toHaveBeenCalledWith({ projectId: "p1" });
    });
  });

  it("shows file input on import", () => {
    const { getByText, container } = render(
      <ImportPromptsButton projectId="p1" />,
    );
    fireEvent.click(getByText("Import"));
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });
});
