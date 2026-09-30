import preview from "../../../../../.storybook/preview";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  OrgOverviewGraph,
  type OrganizationIngestionOverview,
} from "./OrgOverviewGraph";

const meta = preview.meta({
  component: OrgOverviewGraph,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
});

const clientFields = {
  sdkName: "langfuse-js",
  sdkVersion: "4.0.0",
  canonicalSdkName: "javascript",
  sdkUpgradeStatus: "current",
  v4Migration: "not_required",
  publicKey: "pk-js",
  isInternal: false,
  lastSeen: "2026-09-29T23:00:00Z",
} as const;

const noFeatures = {
  activeEvaluationRules: 0,
  datasets: 0,
  datasetItems: 0,
  activeMonitors: 0,
  prompts: 0,
};

const exampleData: OrganizationIngestionOverview = {
  window: {
    previousFrom: "2026-09-16T00:00:00Z",
    currentFrom: "2026-09-23T00:00:00Z",
    to: "2026-09-30T00:00:00Z",
  },
  projects: [
    {
      id: "shiitake",
      name: "Shiitake",
      features: {
        activeEvaluationRules: 4,
        datasets: 3,
        datasetItems: 1250,
        activeMonitors: 2,
        prompts: 12,
      },
    },
    {
      id: "porcini",
      name: "Porcini",
      features: {
        activeEvaluationRules: 1,
        datasets: 1,
        datasetItems: 40,
        activeMonitors: 0,
        prompts: 3,
      },
    },
    { id: "chanterelle", name: "Chanterelle", features: noFeatures },
  ],
  eventRows: [
    {
      ...clientFields,
      projectId: "shiitake",
      ingestionPath: "otel",
      current: 8000,
      previous: 6000,
    },
    {
      ...clientFields,
      projectId: "shiitake",
      ingestionPath: "otel",
      sdkName: "langfuse-python",
      sdkVersion: "3.9.0",
      canonicalSdkName: "python",
      sdkUpgradeStatus: "outdated_major",
      v4Migration: "required",
      publicKey: "pk-python",
      current: 4000,
      previous: 4000,
    },
    {
      ...clientFields,
      projectId: "porcini",
      ingestionPath: "otel",
      publicKey: "pk-staging",
      current: 0,
      previous: 200,
      lastSeen: "2026-09-20T12:00:00Z",
    },
    {
      ...clientFields,
      projectId: "chanterelle",
      ingestionPath: "otel",
      sdkName: "custom-js",
      sdkVersion: "1.0.0",
      canonicalSdkName: null,
      sdkUpgradeStatus: "unsupported_sdk",
      publicKey: null,
      current: 2883,
      previous: 0,
    },
  ],
  scoreRows: [
    {
      ...clientFields,
      projectId: "shiitake",
      source: "API",
      current: 20,
      previous: 20,
    },
    {
      ...clientFields,
      projectId: "shiitake",
      source: "EVAL",
      isInternal: true,
      current: 10,
      previous: 5,
    },
    {
      ...clientFields,
      projectId: "shiitake",
      source: "ANNOTATION",
      isInternal: true,
      current: 10,
      previous: 5,
    },
    {
      ...clientFields,
      projectId: "chanterelle",
      source: "API",
      sdkName: "custom-js",
      sdkVersion: "1.0.0",
      canonicalSdkName: null,
      sdkUpgradeStatus: "unsupported_sdk",
      publicKey: null,
      current: 3,
      previous: 0,
    },
  ],
};

export const Default = meta.story({ args: { data: exampleData } });

export const Loading = meta.story({
  args: { data: undefined, isLoading: true },
});

export const Error = meta.story({
  args: { data: undefined, error: { message: "Failed to fetch analytics." } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Unable to load analytics"),
    ).toBeVisible();
    await expect(canvas.getByText("Failed to fetch analytics.")).toBeVisible();
  },
});

export const NoData = meta.story({
  args: { data: undefined, isLoading: false },
});

export const NoProjects = meta.story({
  args: {
    data: { ...exampleData, projects: [], eventRows: [], scoreRows: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No projects in this organization."),
    ).toBeVisible();
  },
});

export const SortByDatasets = meta.story({
  name: "(Test) Sort by datasets with name tie-breaker",
  args: {
    order: "datasets",
    data: {
      ...exampleData,
      projects: exampleData.projects.map((project) => ({
        ...project,
        features: {
          ...project.features,
          datasets: project.id === "porcini" ? 1 : 3,
        },
      })),
      eventRows: [],
      scoreRows: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Chanterelle");
    await waitFor(() => {
      const centers = ["Chanterelle", "Shiitake", "Porcini"].map((name) => {
        const node = canvas.getByText(name).closest(".react-flow__node");
        expect(node).not.toBeNull();
        const bounds = node!.getBoundingClientRect();
        expect(bounds.height).toBeGreaterThan(0);
        return bounds.top + bounds.height / 2;
      });
      expect(centers[0]!).toBeLessThan(centers[1]!);
      expect(centers[1]!).toBeLessThan(centers[2]!);
    });
  },
});

export const SortByEvaluationRules = meta.story({
  args: { data: exampleData, order: "activeEvaluationRules" },
});

export const SortByDatasetItems = meta.story({
  args: { data: exampleData, order: "datasetItems" },
});

export const SortByActiveMonitors = meta.story({
  args: { data: exampleData, order: "activeMonitors" },
});

export const SortByPrompts = meta.story({
  args: { data: exampleData, order: "prompts" },
});

export const EmptyProjectBeforeClients = meta.story({
  args: {
    data: {
      ...exampleData,
      projects: [
        {
          id: "empty",
          name: "Empty project",
          features: {
            activeEvaluationRules: 0,
            datasets: 0,
            datasetItems: 0,
            activeMonitors: 0,
            prompts: 0,
          },
        },
        exampleData.projects[0]!,
      ],
      eventRows: exampleData.eventRows.map((row) => ({
        ...row,
        projectId: "shiitake",
      })),
      scoreRows: [],
    },
  },
});

export const SeparatedProjectCards = meta.story({
  name: "(Test) Separated project cards",
  args: { data: exampleData },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Shiitake");
    await waitFor(() => {
      const cards = ["Shiitake", "Porcini", "Chanterelle"].map((name) => {
        const node = canvas.getByText(name).closest(".react-flow__node");
        expect(node).not.toBeNull();
        const bounds = node!.getBoundingClientRect();
        expect(bounds.height).toBeGreaterThan(0);
        return bounds;
      });
      expect(cards[1]!.top).toBeGreaterThan(cards[0]!.bottom);
      expect(cards[2]!.top).toBeGreaterThan(cards[1]!.bottom);
    });
  },
});

export const ProjectMetadata = meta.story({
  name: "(Test) Project metadata",
  args: {
    data: {
      ...exampleData,
      projects: [exampleData.projects[0]!],
      eventRows: [],
      scoreRows: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Active evaluation rules"),
    ).toBeVisible();
    await expect(canvas.getByText("Datasets")).toBeVisible();
    await expect(canvas.getByText("Dataset items")).toBeVisible();
    await expect(canvas.getByText("1,250")).toBeVisible();
    await expect(canvas.getByText("Active monitors")).toBeVisible();
    await expect(canvas.getByText("Prompts")).toBeVisible();
    await expect(canvas.getByText("Observations (7d)")).toBeVisible();
  },
});

export const MixedInternalExternalTraffic = meta.story({
  name: "(Test) Mixed internal and external traffic",
  args: {
    data: {
      ...exampleData,
      projects: [exampleData.projects[0]!],
      eventRows: [
        {
          ...exampleData.eventRows[0]!,
          current: 8000,
          previous: 6000,
          v4Migration: "required",
        },
        {
          ...exampleData.eventRows[0]!,
          isInternal: true,
          current: 2000,
          previous: 1000,
          lastSeen: "2026-09-30T00:00:00Z",
          v4Migration: "unknown",
        },
      ],
      scoreRows: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByText("langfuse-js")).toHaveLength(1);
    await waitFor(() => {
      const client = canvas
        .getByText("langfuse-js")
        .closest(".react-flow__node");
      const project = canvas.getByText("Shiitake").closest(".react-flow__node");
      expect(client).not.toBeNull();
      expect(project).not.toBeNull();
      const clientBounds = client!.getBoundingClientRect();
      const projectBounds = project!.getBoundingClientRect();
      expect(clientBounds.height).toBeGreaterThan(0);
      expect(projectBounds.height).toBeGreaterThan(0);
      expect(
        Math.abs(
          clientBounds.top +
            clientBounds.height / 2 -
            (projectBounds.top + projectBounds.height / 2),
        ),
      ).toBeLessThan(1);
    });
    await expect(await canvas.findByText("External")).toBeVisible();
    await expect(await canvas.findByText("Internal")).toBeVisible();
    await expect(canvas.getByText("8,000")).toBeVisible();
    await expect(canvas.getByText("2,000")).toBeVisible();
    await expect(canvas.getByText("Required")).toBeVisible();
    await userEvent.hover(
      canvas.getByRole("button", {
        name: "Explain internal and external traffic",
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("tooltip")).toHaveTextContent(
      "Internal observations use an environment starting with langfuse-",
    );
  },
});

export const ExternalTrafficOnly = meta.story({
  name: "(Test) External traffic only",
  args: {
    data: {
      ...exampleData,
      projects: [exampleData.projects[0]!],
      eventRows: [exampleData.eventRows[0]!],
      scoreRows: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByText("8,000")).toHaveLength(3);
    await expect(canvas.queryByText("External")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Internal")).not.toBeInTheDocument();
  },
});

export const CompactViewport = meta.story({
  args: { data: exampleData },
  decorators: [
    (Story) => (
      <div className="h-[480px] w-[720px]">
        <Story />
      </div>
    ),
  ],
});

export const SingleProjectThreeClients = meta.story({
  args: {
    data: {
      ...exampleData,
      projects: [exampleData.projects[0]!],
      eventRows: exampleData.eventRows
        .filter((row) => row.projectId !== "porcini")
        .map((row) => ({ ...row, projectId: "shiitake" })),
      scoreRows: exampleData.scoreRows.map((row) => ({
        ...row,
        projectId: "shiitake",
      })),
    },
  },
});

const mushroomNames = [
  "Shiitake",
  "Porcini",
  "Chanterelle",
  "Morel",
  "Oyster",
  "Enoki",
  "Truffle",
  "Maitake",
  "Reishi",
  "Portobello",
  "Cremini",
  "Button",
  "King Oyster",
  "Black Trumpet",
  "Hedgehog",
  "Lobster",
  "Saffron Milk Cap",
  "Cauliflower",
  "Wood Ear",
  "Shimeji",
  "Nameko",
  "Puffball",
  "Blewit",
  "Matsutake",
];
const largeData: OrganizationIngestionOverview = {
  ...exampleData,
  projects: [],
  eventRows: [],
  scoreRows: [],
};
for (const [index, name] of mushroomNames.entries()) {
  const projectId = `mushroom-${index}`;
  const template = exampleData.projects[index % 3]!;
  const templateId = template.id;
  const factor = 0.4 + ((index * 37 + 13) % 100) / 40;
  largeData.projects.push({
    id: projectId,
    name: `Team ${name}`,
    features: template.features,
  });
  for (const row of exampleData.eventRows.filter(
    (entry) => entry.projectId === templateId,
  )) {
    largeData.eventRows.push({
      ...row,
      projectId,
      current: Math.round(row.current * factor),
      previous: Math.round(row.previous * (0.5 + ((index * 19) % 80) / 40)),
    });
  }
  for (const row of exampleData.scoreRows.filter(
    (entry) => entry.projectId === templateId,
  )) {
    largeData.scoreRows.push({
      ...row,
      projectId,
      current: Math.round(row.current * factor),
      previous: Math.round(row.previous * factor),
    });
  }
}
let shuffleSeed = 42;
for (let index = largeData.projects.length - 1; index > 0; index--) {
  shuffleSeed = (shuffleSeed * 1664525 + 1013904223) % 4294967296;
  const swapIndex = shuffleSeed % (index + 1);
  [largeData.projects[index], largeData.projects[swapIndex]] = [
    largeData.projects[swapIndex]!,
    largeData.projects[index]!,
  ];
}

export const LargeOrganization = meta.story({
  args: { initialZoom: 0.35, data: largeData },
});

export const IdleProject = meta.story({
  args: {
    data: {
      ...exampleData,
      projects: [{ id: "morel", name: "Morel", features: noFeatures }],
      eventRows: [],
      scoreRows: [],
    },
  },
});

export const UnknownSdk = meta.story({
  args: {
    data: {
      ...exampleData,
      projects: [exampleData.projects[0]!],
      eventRows: [
        {
          ...exampleData.eventRows[0]!,
          sdkName: null,
          sdkVersion: null,
          canonicalSdkName: null,
          sdkUpgradeStatus: "unknown",
          v4Migration: "unknown",
        },
      ],
      scoreRows: [],
    },
  },
});
