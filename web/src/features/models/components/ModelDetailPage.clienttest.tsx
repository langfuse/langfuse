import { render, screen } from "@testing-library/react";

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {
      projectId: "project-1",
      modelId: "model-1",
      pricingTier: "deleted-tier",
    },
    push: vi.fn(),
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    models: {
      getById: {
        useQuery: () => ({
          isLoading: false,
          data: {
            id: "model-1",
            projectId: "project-1",
            modelName: "custom-model",
            matchPattern: "custom-model",
            tokenizerId: null,
            tokenizerConfig: null,
            pricingTiers: [
              {
                id: "current-default-tier",
                name: "Standard",
                isDefault: true,
                priority: 0,
                conditions: [],
                prices: { input: 0.000005 },
              },
              {
                id: "current-priority-tier",
                name: "Priority",
                isDefault: false,
                priority: 1,
                conditions: [],
                prices: { input: 0.00001 },
              },
            ],
          },
        }),
      },
    },
  },
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => false,
}));

vi.mock("@/src/features/models/hooks/usePriceUnitMultiplier", () => ({
  usePriceUnitMultiplier: () => ({
    priceUnit: "per unit",
    priceUnitMultiplier: 1,
  }),
}));

vi.mock("@/src/features/models/components/PriceUnitSelector", () => ({
  PriceUnitSelector: () => null,
}));

vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/src/components/table/use-cases/observations", () => ({
  default: () => null,
}));

vi.mock("@/src/components/editor", () => ({
  CodeMirrorEditor: () => null,
}));

import ModelDetailPage from "@/src/pages/project/[projectId]/settings/models/[modelId]";

describe("ModelDetailPage pricing tier deep link", () => {
  it("falls back to the default tier when the linked tier was deleted", () => {
    render(<ModelDetailPage />);

    expect(screen.getByRole("combobox")).toHaveTextContent("Standard");
    expect(screen.getByText("input")).toBeInTheDocument();
  });
});
