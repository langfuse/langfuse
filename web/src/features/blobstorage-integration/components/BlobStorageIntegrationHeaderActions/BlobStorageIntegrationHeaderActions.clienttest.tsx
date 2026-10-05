import { fireEvent, render, screen } from "@testing-library/react";

import { BlobStorageIntegrationHeaderActions } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationHeaderActions/BlobStorageIntegrationHeaderActions";

describe("BlobStorageIntegrationHeaderActions", () => {
  it("only allows users who can load the configuration to add an integration", () => {
    const onAddIntegration = vi.fn();
    const { rerender } = render(
      <BlobStorageIntegrationHeaderActions
        canLoadConfig={false}
        showDetails={false}
        onAddIntegration={onAddIntegration}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Add integration" }),
    ).not.toBeInTheDocument();

    rerender(
      <BlobStorageIntegrationHeaderActions
        canLoadConfig
        showDetails={false}
        onAddIntegration={onAddIntegration}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add integration" }));
    expect(onAddIntegration).toHaveBeenCalledOnce();

    rerender(
      <BlobStorageIntegrationHeaderActions
        canLoadConfig
        showDetails
        onAddIntegration={onAddIntegration}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Add integration" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Integration Docs" }),
    ).toBeInTheDocument();
  });
});
