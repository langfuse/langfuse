import { render, screen, within } from "@testing-library/react";
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
      />,
    );

    const healthyRow = screen.getByText("healthy-bucket").closest("tr");
    const failedRow = screen.getByText("failed-bucket").closest("tr");

    expect(healthyRow).not.toBeNull();
    expect(failedRow).not.toBeNull();
    expect(within(healthyRow!).getByText("Active")).toBeInTheDocument();
    expect(within(failedRow!).getByText("Error")).toBeInTheDocument();
  });
});
