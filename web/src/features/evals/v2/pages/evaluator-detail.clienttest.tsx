import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  routerQuery: {} as Record<string, string>,
  editViewMounts: 0,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/project/[projectId]/evals/v2/[evaluatorId]",
    query: mocks.routerQuery,
    push: mocks.push,
    replace: mocks.replace,
  }),
}));

vi.mock("@/src/components/layouts/page", () => ({
  default: ({
    children,
    headerProps,
  }: {
    children: ReactNode;
    headerProps: { actionButtonsRight?: ReactNode };
  }) => (
    <>
      {headerProps.actionButtonsRight}
      {children}
    </>
  ),
}));

vi.mock(
  "@/src/features/evals/v2/components/EvaluatorConfigurationView",
  () => ({
    EvaluatorDefinitionView: ({
      sourceCode,
      prompt,
    }: {
      sourceCode: string | null;
      prompt: string | null;
    }) => <div>Saved definition: {sourceCode ?? prompt}</div>,
  }),
);

vi.mock("@/src/features/evals/v2/components/ActivateEvaluatorDialog", () => ({
  ActivateEvaluatorDialog: () => null,
}));
vi.mock("@/src/features/evals/v2/components/EvaluatorEditView", () => ({
  EvaluatorEditView: ({
    onCancel,
    onSaved,
  }: {
    onCancel: () => void;
    onSaved: () => void;
  }) => {
    mocks.editViewMounts += 1;
    return (
      <>
        <button type="button" onClick={onCancel}>
          Cancel evaluator edit
        </button>
        <button type="button" onClick={onSaved}>
          Save evaluator edit
        </button>
      </>
    );
  },
}));
vi.mock("@/src/features/evals/v2/components/EvaluatorTitleEditor", () => ({
  EvaluatorTitleEditor: () => null,
}));
vi.mock("@/src/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
vi.mock("@/src/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));
vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evals: { invalidate: vi.fn() },
      evalsV2: { invalidate: vi.fn() },
    }),
    evals: {
      configById: {
        useQuery: () => ({
          isPending: false,
          data: {
            id: "evaluator-1",
            scoreName: "Quality",
            description: null,
            filter: [],
            sampling: { toNumber: () => 1 },
            variableMapping: [],
            ruleAssignments: [
              {
                rule: {
                  id: "rule-1",
                  name: "Production",
                  filter: [],
                  enabled: true,
                },
              },
            ],
            evalTemplate: {
              id: "template-2",
              name: "quality",
              version: 2,
              projectId: "project-1",
              type: "CODE",
              sourceCode: "return true",
              sourceCodeLanguage: "TYPESCRIPT",
              prompt: null,
              provider: null,
              model: null,
              outputDefinition: null,
            },
          },
        }),
      },
      allTemplatesForName: {
        useQuery: () => ({
          data: {
            templates: [
              {
                id: "template-2",
                version: 2,
                createdAt: new Date("2025-02-02T12:00:00Z"),
                type: "CODE",
                sourceCode: "return 'current'",
                sourceCodeLanguage: "TYPESCRIPT",
                prompt: null,
                provider: null,
                model: null,
                outputDefinition: null,
              },
              {
                id: "template-1",
                version: 1,
                createdAt: new Date("2025-01-01T12:00:00Z"),
                type: "CODE",
                sourceCode: "return 'old'",
                sourceCodeLanguage: "TYPESCRIPT",
                prompt: null,
                provider: null,
                model: null,
                outputDefinition: null,
              },
            ],
          },
          isPending: false,
        }),
      },
      deleteEvalJob: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    defaultLlmModel: {
      fetchDefaultModel: {
        useQuery: () => ({ data: null }),
      },
    },
  },
}));

import EvaluatorDetailPage from "./evaluator-detail";

describe("EvaluatorDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editViewMounts = 0;
    Object.keys(mocks.routerQuery).forEach((key) => {
      delete mocks.routerQuery[key];
    });
    Object.assign(mocks.routerQuery, {
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });
    mocks.push.mockResolvedValue(true);
    mocks.replace.mockResolvedValue(true);
  });

  it("always shows the evaluator as an editable form", () => {
    render(<EvaluatorDetailPage />);

    expect(
      screen.getByRole("button", { name: "Cancel evaluator edit" }),
    ).toBeInTheDocument();
  });

  it("returns to the evaluator overview when cancelling", () => {
    render(<EvaluatorDetailPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Cancel evaluator edit" }),
    );

    expect(mocks.replace).toHaveBeenCalledWith("/project/project-1/evals/v2");
  });

  it("remounts the edit form after a successful save so its dirty state resets", () => {
    render(<EvaluatorDetailPage />);
    expect(mocks.editViewMounts).toBe(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Save evaluator edit" }),
    );

    expect(mocks.editViewMounts).toBe(2);
  });

  it("opens a saved evaluator version from the version history", () => {
    render(<EvaluatorDetailPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Show evaluator versions" }),
    );
    expect(screen.getByRole("button", { name: /^Version 1/ })).toBeVisible();
    expect(screen.queryByText("Code")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Version 1/ }));

    expect(screen.getByText("Saved definition: return 'old'")).toBeVisible();
    expect(screen.getByRole("button", { name: "All versions" })).toBeVisible();
  });
});
