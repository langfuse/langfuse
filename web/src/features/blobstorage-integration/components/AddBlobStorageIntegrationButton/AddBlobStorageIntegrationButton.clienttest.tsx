import { fireEvent, render, screen } from "@testing-library/react";

import { AddBlobStorageIntegrationButton } from "@/src/features/blobstorage-integration/components/AddBlobStorageIntegrationButton/AddBlobStorageIntegrationButton";

describe("AddBlobStorageIntegrationButton", () => {
  it("only allows users who can load the configuration to add an integration", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <AddBlobStorageIntegrationButton
        canLoadConfig={false}
        showDetails={false}
        onClick={onClick}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Add integration" }),
    ).not.toBeInTheDocument();

    rerender(
      <AddBlobStorageIntegrationButton
        canLoadConfig
        showDetails={false}
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add integration" }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <AddBlobStorageIntegrationButton
        canLoadConfig
        showDetails
        onClick={onClick}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Add integration" }),
    ).not.toBeInTheDocument();
  });
});
