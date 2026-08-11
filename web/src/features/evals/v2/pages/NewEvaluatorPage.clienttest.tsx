import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  router: {
    isReady: true,
    query: {} as Record<string, string>,
  },
  evaluatorQuery: vi.fn(),
  setupPage: vi.fn(() => null),
}));

vi.mock("next/router", () => ({ useRouter: () => mocks.router }));
vi.mock("@/src/utils/api", () => ({
  api: { evalsV2: { get: { useQuery: mocks.evaluatorQuery } } },
}));
vi.mock("./EvaluatorSetupPage", () => ({
  EvaluatorSetupPage: mocks.setupPage,
}));

import NewEvaluatorPage from "./NewEvaluatorPage";

describe("NewEvaluatorPage", () => {
  beforeEach(() => {
    mocks.setupPage.mockClear();
    mocks.evaluatorQuery.mockReturnValue({
      data: undefined,
      isPending: false,
    });
  });

  it("prefills a managed template on the create page", () => {
    mocks.router.query = {
      projectId: "project-1",
      template: "exact-match",
    };

    render(<NewEvaluatorPage />);

    expect(mocks.setupPage).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create",
        projectId: "project-1",
        initialDraft: expect.objectContaining({
          name: "Exact Match",
          definition: expect.objectContaining({ type: "CODE" }),
        }),
      }),
      undefined,
    );
  });

  it("copies a project evaluator into a new draft", () => {
    mocks.router.query = {
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    };
    mocks.evaluatorQuery.mockReturnValue({
      isPending: false,
      data: {
        id: "evaluator-1",
        name: "Correctness",
        description: null,
        type: "CODE",
        versions: [
          {
            sourceCode: "function evaluate() {}",
            sourceCodeLanguage: "TYPESCRIPT",
            variableMapping: null,
          },
        ],
      },
    });

    render(<NewEvaluatorPage />);

    expect(mocks.setupPage).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create",
        initialDraft: expect.objectContaining({
          name: "Correctness copy",
          definition: expect.objectContaining({ type: "CODE" }),
        }),
      }),
      undefined,
    );
  });
});
