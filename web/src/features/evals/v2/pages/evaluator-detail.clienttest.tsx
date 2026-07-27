import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  closePeek: vi.fn(),
  openPeek: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  routerQuery: {} as Record<string, string>,
  configByIdInvalidate: vi.fn(),
  editView: vi.fn(),
}));

vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({
    openPeek: mocks.openPeek,
    closePeek: mocks.closePeek,
  }),
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
vi.mock("@/src/features/evals/v2/components/EvaluationRulePeekView", () => ({
  TablePeekViewEvaluationRuleDetail: () => <div>Rule editor</div>,
}));
vi.mock(
  "@/src/features/evals/v2/components/CreateEvaluationRuleDialog",
  () => ({
    CreateEvaluationRuleDialog: ({
      open,
      initialEvaluatorIds,
    }: {
      open: boolean;
      initialEvaluatorIds?: string[];
    }) =>
      open ? (
        <div>
          New rule modal with evaluator {initialEvaluatorIds?.join(",")}
        </div>
      ) : null,
  }),
);
vi.mock("@/src/features/evals/v2/components/EvaluatorEditView", () => ({
  EvaluatorEditView: ({
    onCancel,
    ruleEditorExpanded,
    initialEvaluationRuleId,
  }: {
    onCancel: () => void;
    ruleEditorExpanded: boolean;
    initialEvaluationRuleId?: string;
  }) => {
    const [initializedRuleId] = useState(initialEvaluationRuleId ?? "default");
    mocks.editView({ ruleEditorExpanded });
    return (
      <>
        <span>Initialized rule: {initializedRuleId}</span>
        <button type="button" onClick={onCancel}>
          Cancel evaluator edit
        </button>
      </>
    );
  },
}));
vi.mock("@/src/features/evals/v2/components/EvaluatorRuleAssignments", () => ({
  EvaluatorRuleAssignments: ({
    rules,
    onView,
    onCreateRule,
  }: {
    rules: Array<{ id: string; name: string }>;
    onView: (ruleId: string) => void;
    onCreateRule: () => void;
  }) => (
    <div>
      {rules.map((rule) => (
        <button key={rule.id} type="button" onClick={() => onView(rule.id)}>
          {rule.name}
        </button>
      ))}
      <button type="button" onClick={onCreateRule}>
        Create new rule
      </button>
    </div>
  ),
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
      evals: {
        invalidate: vi.fn(),
        configById: { invalidate: mocks.configByIdInvalidate },
      },
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
    annotationQueues: {
      allNamesAndIds: {
        useQuery: vi.fn(),
      },
    },
  },
}));

import EvaluatorDetailPage from "./evaluator-detail";

describe("EvaluatorDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mocks.routerQuery).forEach((key) => {
      delete mocks.routerQuery[key];
    });
    Object.assign(mocks.routerQuery, {
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });
    mocks.push.mockResolvedValue(true);
    mocks.replace.mockResolvedValue(true);
    mocks.configByIdInvalidate.mockResolvedValue(undefined);
    mocks.openPeek.mockImplementation(() => {
      mocks.routerQuery.editRule = "1";
    });
  });

  it("returns to the evaluator overview when editing is cancelled", () => {
    Object.assign(mocks.routerQuery, {
      edit: "1",
      peek: "trace-1",
      peekView: "expanded",
      observation: "observation-1",
      display: "details",
      timestamp: "2026-07-20T12:00:00.000Z",
    });

    render(<EvaluatorDetailPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Cancel evaluator edit" }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/project/project-1/evals/v2");
  });

  it("shows attached rules and opens a selected rule without leaving the draft", () => {
    render(<EvaluatorDetailPage />);

    const rulesButton = screen.getByRole("button", { name: "Rules 1" });
    expect(rulesButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(rulesButton);
    expect(screen.getByRole("heading", { name: "Rules" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Production" }));

    expect(mocks.openPeek).toHaveBeenCalledWith("rule-1", { openEdit: true });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByText("Rule editor")).toBeVisible();
    expect(mocks.editView).toHaveBeenLastCalledWith({
      ruleEditorExpanded: false,
    });
  });

  it("prefills this evaluator when creating a rule from the rules panel", () => {
    render(<EvaluatorDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Rules 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new rule" }));

    expect(
      screen.getByText("New rule modal with evaluator evaluator-1"),
    ).toBeVisible();
    expect(mocks.editView).toHaveBeenLastCalledWith({
      ruleEditorExpanded: false,
    });
  });

  it("reinitializes the evaluator with filters from a linked rule", () => {
    const { rerender } = render(<EvaluatorDetailPage />);
    expect(screen.getByText("Initialized rule: default")).toBeVisible();

    mocks.routerQuery.ruleId = "rule-1";
    rerender(<EvaluatorDetailPage />);

    expect(screen.getByText("Initialized rule: rule-1")).toBeVisible();
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
