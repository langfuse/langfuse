import preview from "../../../../../.storybook/preview";
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
  publicKey: "pk-js",
  isInternal: false,
  lastSeen: "2026-09-29T23:00:00Z",
} as const;

const exampleData: OrganizationIngestionOverview = {
  window: {
    previousFrom: "2026-09-16T00:00:00Z",
    currentFrom: "2026-09-23T00:00:00Z",
    to: "2026-09-30T00:00:00Z",
  },
  projects: [
    { id: "shiitake", name: "Shiitake" },
    { id: "porcini", name: "Porcini" },
    { id: "chanterelle", name: "Chanterelle" },
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
  "Lion’s Mane",
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
  const templateId = exampleData.projects[index % 3]!.id;
  const factor = 0.4 + ((index * 37 + 13) % 100) / 40;
  largeData.projects.push({ id: projectId, name: `Team ${name}` });
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
      projects: [{ id: "morel", name: "Morel" }],
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
        },
      ],
      scoreRows: [],
    },
  },
});
