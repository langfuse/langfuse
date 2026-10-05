import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ComponentProps } from "react";

import { BlobStorageIntegrationTable } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationTable";

type Integration = ComponentProps<
  typeof BlobStorageIntegrationTable
>["integrations"][number];

const integration = (overrides: Partial<Integration>): Integration =>
  ({
    id: "integration-id",
    bucketName: "bucket",
    type: "S3",
    enabled: true,
    lastError: null,
    lastSyncAt: new Date("2026-10-05T10:00:00.000Z"),
    nextSyncAt: new Date("2026-10-06T10:00:00.000Z"),
    runStartedAt: null,
    ...overrides,
  }) as Integration;

describe("BlobStorageIntegrationTable", () => {
  it("shows the derived sync state and gives errors precedence", () => {
    render(
      <BlobStorageIntegrationTable
        integrations={[
          integration({ bucketName: "healthy-bucket" }),
          integration({
            id: "failed-integration",
            bucketName: "failed-bucket",
            lastError: "Access denied",
          }),
        ]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const healthyRow = screen.getByText("healthy-bucket").closest("tr");
    const failedRow = screen.getByText("failed-bucket").closest("tr");

    expect(healthyRow).not.toBeNull();
    expect(failedRow).not.toBeNull();
    expect(within(healthyRow!).getByText("Active")).toBeInTheDocument();
    expect(within(failedRow!).getByText("Error")).toBeInTheDocument();
  });

  it("requests deletion for the selected row without opening it", async () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();

    render(
      <BlobStorageIntegrationTable
        integrations={[
          integration({ bucketName: "first-bucket" }),
          integration({
            id: "second-integration",
            bucketName: "second-bucket",
          }),
        ]}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onDelete={onDelete}
      />,
    );

    const secondRow = screen.getByText("second-bucket").closest("tr");
    expect(secondRow).not.toBeNull();

    fireEvent.click(
      within(secondRow!).getByRole("button", { name: "Open actions menu" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "Delete integration",
      }),
    );

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "second-integration" }),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });
});
