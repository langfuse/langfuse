import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { ConnectedScoreConfigsTable } from "@/src/features/score-configs/ScoreConfigsTable/ConnectedScoreConfigsTable";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: ({ scope }: { scope: string }) =>
    scope === "scoreConfigs:read",
}));

vi.mock("@/src/hooks/usePaginationState", () => ({
  usePaginationState: () => [{ pageIndex: 0, pageSize: 50 }, vi.fn()] as const,
}));

vi.mock(
  "@/src/features/score-configs/components/ArchiveScoreConfigDialogController",
  () => ({
    ArchiveScoreConfigDialogController: ({
      children,
    }: {
      children: (control: {
        disabled: { reason: string };
        openDialog: () => void;
      }) => ReactNode;
    }) =>
      children({
        disabled: { reason: "Read only" },
        openDialog: () => undefined,
      }),
  }),
);

vi.mock(
  "@/src/features/score-configs/components/UpsertScoreConfigDialogController",
  () => ({
    CreateScoreConfigDialogController: ({
      children,
    }: {
      children: (control: {
        disabled: { reason: string };
        isSubmitting: boolean;
        openDialog: () => void;
      }) => ReactNode;
    }) =>
      children({
        disabled: { reason: "Read only" },
        isSubmitting: false,
        openDialog: () => undefined,
      }),
    EditScoreConfigDialogController: ({
      children,
    }: {
      children: (control: {
        disabled: { reason: string };
        openDialog: () => void;
      }) => ReactNode;
    }) =>
      children({
        disabled: { reason: "Read only" },
        openDialog: () => undefined,
      }),
  }),
);

vi.mock(
  "@/src/features/score-configs/ScoreConfigsTable/ScoreConfigsTable",
  () => ({
    ScoreConfigsTable: ({
      data,
    }: {
      data:
        | { status: "loading" }
        | { status: "error"; error: string }
        | { status: "success"; data: { name: string }[] };
    }) =>
      data.status === "success" ? (
        <ul>
          {data.data.map((row) => (
            <li key={row.name}>{row.name}</li>
          ))}
        </ul>
      ) : (
        <div>loading</div>
      ),
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    scoreConfigs: {
      all: {
        useQuery: (...args: unknown[]) => mocks.useQuery(...args),
      },
    },
  },
}));

describe("ConnectedScoreConfigsTable", () => {
  it("loads rows for a user who can read score configs but not change them", () => {
    mocks.useQuery.mockImplementation(
      (_input: unknown, options: { enabled?: boolean }) => {
        if (!options.enabled) {
          return {
            isPending: true,
            isError: false,
            data: undefined,
            error: null,
          };
        }

        return {
          isPending: false,
          isError: false,
          error: null,
          data: {
            totalCount: 1,
            configs: [
              {
                id: "cfg-1",
                name: "Helpfulness",
                dataType: "NUMERIC",
                description: null,
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
                maxValue: 1,
                minValue: 0,
                categories: [],
                isArchived: false,
              },
            ],
          },
        };
      },
    );

    render(<ConnectedScoreConfigsTable projectId="proj-1" />);

    expect(screen.getByText("Helpfulness")).toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1" }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
