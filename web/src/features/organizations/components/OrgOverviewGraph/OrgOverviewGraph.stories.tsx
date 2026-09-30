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

const exampleData: OrganizationIngestionOverview = {
  windows: {
    current: { from: "2026-09-23T00:00:00Z", to: "2026-09-30T00:00:00Z" },
    previous: { from: "2026-09-16T00:00:00Z", to: "2026-09-23T00:00:00Z" },
  },
  totals: {
    events: { current: 14883, previous: 10200, changePct: 45.91 },
    scores: { current: 43, previous: 30, changePct: 43.33 },
    projectsByStatus: { active: 1, stopped: 1, new: 1, idle: 0 },
  },
  projects: [
    {
      projectId: "1231231",
      projectName: "Shiitake",
      status: "active",
      events: { current: 12000, previous: 10000, changePct: 20 },
      scores: {
        current: 40,
        previous: 30,
        changePct: 33.33,
        bySource: {
          API: { current: 20, previous: 20, changePct: 0 },
          EVAL: { current: 10, previous: 5, changePct: 100 },
          ANNOTATION: { current: 10, previous: 5, changePct: 100 },
        },
      },
      lastSeen: "2026-09-29T23:00:00Z",
      clients: [
        {
          clientType: "langfuse_sdk",
          sdkName: "langfuse-js",
          sdkVersion: "4.0.0",
          canonicalSdkName: "javascript",
          sdkUpgradeStatus: "current",
          ingestionPaths: ["otel"],
          publicKey: "pk-js",
          status: "active",
          events: { current: 8000, previous: 6000, changePct: 33.33 },
          scores: { current: 20, previous: 20, changePct: 0 },
          lastSeen: "2026-09-29T23:00:00Z",
        },
        {
          clientType: "langfuse_sdk",
          sdkName: "langfuse-python",
          sdkVersion: "3.9.0",
          canonicalSdkName: "python",
          sdkUpgradeStatus: "outdated_major",
          ingestionPaths: ["otel"],
          publicKey: "pk-python",
          status: "active",
          events: { current: 4000, previous: 4000, changePct: 0 },
          scores: { current: 0, previous: 0, changePct: null },
          lastSeen: "2026-09-29T22:00:00Z",
        },
      ],
    },
    {
      projectId: "87987198273",
      projectName: "Porcini",
      status: "stopped",
      events: { current: 0, previous: 200, changePct: -100 },
      scores: {
        current: 0,
        previous: 0,
        changePct: null,
        bySource: {
          API: { current: 0, previous: 0, changePct: null },
          EVAL: { current: 0, previous: 0, changePct: null },
          ANNOTATION: { current: 0, previous: 0, changePct: null },
        },
      },
      lastSeen: "2026-09-20T12:00:00Z",
      clients: [
        {
          clientType: "langfuse_sdk",
          sdkName: "langfuse-js",
          sdkVersion: "4.0.0",
          canonicalSdkName: "javascript",
          sdkUpgradeStatus: "current",
          ingestionPaths: ["otel"],
          publicKey: "pk-staging",
          status: "stopped",
          events: { current: 0, previous: 200, changePct: -100 },
          scores: { current: 0, previous: 0, changePct: null },
          lastSeen: "2026-09-20T12:00:00Z",
        },
      ],
    },
    {
      projectId: "73982891223",
      projectName: "Chanterelle",
      status: "new",
      events: { current: 2883, previous: 0, changePct: null },
      scores: {
        current: 3,
        previous: 0,
        changePct: null,
        bySource: {
          API: { current: 3, previous: 0, changePct: null },
          EVAL: { current: 0, previous: 0, changePct: null },
          ANNOTATION: { current: 0, previous: 0, changePct: null },
        },
      },
      lastSeen: "2026-09-29T23:30:00Z",
      clients: [
        {
          clientType: "custom_otel",
          sdkName: "custom-js",
          sdkVersion: "1.0.0",
          canonicalSdkName: null,
          sdkUpgradeStatus: "unsupported_sdk",
          ingestionPaths: ["otel"],
          publicKey: null,
          status: "new",
          events: { current: 2883, previous: 0, changePct: null },
          scores: { current: 3, previous: 0, changePct: null },
          lastSeen: "2026-09-29T23:30:00Z",
        },
      ],
    },
  ],
};

export const Default = meta.story({ args: { data: exampleData } });

export const SingleProjectThreeClients = meta.story({
  args: {
    data: {
      ...exampleData,
      totals: {
        events: { current: 14883, previous: 10000, changePct: 48.83 },
        scores: { current: 43, previous: 30, changePct: 43.33 },
        projectsByStatus: { active: 1, stopped: 0, new: 0, idle: 0 },
      },
      projects: [
        {
          ...exampleData.projects[0]!,
          events: { current: 14883, previous: 10000, changePct: 48.83 },
          scores: {
            ...exampleData.projects[0]!.scores,
            current: 43,
            changePct: 43.33,
            bySource: {
              ...exampleData.projects[0]!.scores.bySource,
              API: { current: 23, previous: 20, changePct: 15 },
            },
          },
          lastSeen: "2026-09-29T23:30:00Z",
          clients: [
            ...exampleData.projects[0]!.clients,
            ...exampleData.projects[2]!.clients,
          ],
        },
      ],
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

const largeProjects = mushroomNames.map((projectName, index) => {
  const project = exampleData.projects[index % 3]!;
  // Seeded variation keeps screenshots stable across story renders.
  const factor = 0.4 + ((index * 37 + 13) % 100) / 40;
  const clients = project.clients.map((client, clientIndex) => {
    const current = Math.round(
      client.events.current * factor * (1 + clientIndex * 0.2),
    );
    const previous = Math.round(
      client.events.previous *
        (0.5 + ((index * 19 + clientIndex * 7) % 80) / 40),
    );
    return {
      ...client,
      publicKey: `pk-project-${index}-client-${clientIndex}`,
      events: {
        current,
        previous,
        changePct:
          previous === 0 ? null : ((current - previous) / previous) * 100,
      },
    };
  });
  const current = clients.reduce(
    (sum, client) => sum + client.events.current,
    0,
  );
  const previous = clients.reduce(
    (sum, client) => sum + client.events.previous,
    0,
  );
  return {
    ...project,
    projectId: `mushroom-${index}`,
    projectName: `Team ${projectName}`,
    clients,
    events: {
      current,
      previous,
      changePct:
        previous === 0 ? null : ((current - previous) / previous) * 100,
    },
  };
});
// Seeded shuffle keeps the varied layout reproducible for screenshots.
let shuffleSeed = 42;
for (let index = largeProjects.length - 1; index > 0; index--) {
  shuffleSeed = (shuffleSeed * 1664525 + 1013904223) % 4294967296;
  const swapIndex = shuffleSeed % (index + 1);
  [largeProjects[index], largeProjects[swapIndex]] = [
    largeProjects[swapIndex]!,
    largeProjects[index]!,
  ];
}

const largeCurrent = largeProjects.reduce(
  (sum, project) => sum + project.events.current,
  0,
);
const largePrevious = largeProjects.reduce(
  (sum, project) => sum + project.events.previous,
  0,
);

export const LargeOrganization = meta.story({
  args: {
    initialZoom: 0.35,
    data: {
      ...exampleData,
      totals: {
        events: {
          current: largeCurrent,
          previous: largePrevious,
          changePct: ((largeCurrent - largePrevious) / largePrevious) * 100,
        },
        scores: { current: 344, previous: 240, changePct: 43.33 },
        projectsByStatus: { active: 8, stopped: 8, new: 8, idle: 0 },
      },
      projects: largeProjects,
    },
  },
});
