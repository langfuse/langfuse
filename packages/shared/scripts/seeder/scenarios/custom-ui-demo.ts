import { Prisma, prisma } from "../../../src/db";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { supportAgentScenario } from "./support-agent";

const CATALOG_VERSION = "custom-ui@1";

const match = (name: string, type?: string) => [
  ...(type
    ? [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: [type],
        },
      ]
    : []),
  { column: "name", type: "string", operator: "=", value: name },
];

const observationPlacement = {
  surface: "SESSION",
  slot: "OBSERVATION_OUTPUT",
  destinations: ["SESSION", "TRACE"],
  injection: "AFTER",
  anchor: {},
};

const observationDefinition = ({
  title,
  summary,
  name,
  type,
  elements,
}: {
  title: string;
  summary: string;
  name: string;
  type: string;
  elements: Record<string, unknown>;
}) => ({
  schemaVersion: "2",
  catalogVersion: CATALOG_VERSION,
  envelopeVersion: "1",
  title,
  summary,
  match: { entity: "OBSERVATION", filters: match(name, type) },
  placement: observationPlacement,
  binding: { source: "OBSERVATION_OUTPUT" },
  spec: { root: "root", elements },
});

const CUSTOM_UI_DEMO_VISUALIZATIONS = [
  {
    id: "custom-ui-demo-resolution-story",
    name: "Resolution story",
    description:
      "Turns the full support trace into an outcome-first story with its execution sequence on demand.",
    definition: {
      schemaVersion: "2",
      catalogVersion: CATALOG_VERSION,
      envelopeVersion: "1",
      title: "Resolution story",
      summary:
        "Turns the full support trace into an outcome-first story with its execution sequence on demand.",
      match: {
        entity: "TRACE",
        filters: [
          {
            column: "isRootObservation",
            type: "boolean",
            operator: "=",
            value: true,
          },
          {
            column: "name",
            type: "string",
            operator: "=",
            value: "support-copilot",
          },
        ],
      },
      placement: { surface: "TRACE", slot: "TAB", label: "Resolution" },
      binding: { source: "TRACE" },
      spec: {
        root: "root",
        elements: {
          root: {
            type: "Stack",
            props: { gap: "lg" },
            children: ["title", "outcome", "facts", "sequence", "raw"],
          },
          title: {
            type: "Heading",
            props: {
              text: {
                $cond: { $state: "/data/trace/name" },
                $then: {
                  $computed: "titleCase",
                  args: { value: { $state: "/data/trace/name" } },
                },
                $else: "Trace resolution",
              },
              level: 2,
            },
            children: [],
          },
          outcome: {
            type: "Alert",
            props: {
              title: "Customer outcome",
              message: { $state: "/data/trace/output/reply" },
              tone: "success",
            },
            children: [],
          },
          facts: {
            type: "Grid",
            props: { columns: 3 },
            children: ["resolution", "confidence", "steps"],
          },
          resolution: {
            type: "Stat",
            props: {
              label: "Resolution",
              value: {
                $computed: "titleCase",
                args: {
                  value: { $state: "/data/trace/output/resolution" },
                },
              },
              detail: null,
              tone: "success",
            },
            children: [],
          },
          confidence: {
            type: "Stat",
            props: {
              label: "Confidence",
              value: {
                $computed: "percent",
                args: { value: { $state: "/data/trace/output/confidence" } },
              },
              detail: null,
              tone: "info",
            },
            children: [],
          },
          steps: {
            type: "Stat",
            props: {
              label: "Recorded steps",
              value: {
                $computed: "count",
                args: { value: { $state: "/data/observations" } },
              },
              detail: null,
              tone: "neutral",
            },
            children: [],
          },
          sequence: {
            type: "Card",
            props: {
              title: "What happened",
              description: "The recorded agent run in execution order.",
              tone: "neutral",
            },
            children: ["stepsList"],
          },
          stepsList: {
            type: "Stack",
            props: { gap: "xs" },
            children: ["step"],
            repeat: { statePath: "/data/observations", key: "id" },
          },
          step: {
            type: "ListItem",
            props: {
              primary: { $item: "name" },
              secondary: { $item: "statusMessage" },
              badge: { $item: "type" },
            },
            children: [],
          },
          raw: {
            type: "Accordion",
            props: { title: "Trace payload", defaultOpen: false },
            children: ["rawJson"],
          },
          rawJson: {
            type: "Json",
            props: {
              label: null,
              value: { $state: "/data/trace" },
              collapsed: false,
            },
            children: [],
          },
        },
      },
    },
  },
  {
    id: "custom-ui-demo-refund-receipt",
    name: "Refund receipt",
    description:
      "Makes a successful refund readable at a glance while retaining the raw provider response.",
    definition: observationDefinition({
      title: "Refund receipt",
      summary:
        "Makes a successful refund readable at a glance while retaining the raw provider response.",
      name: "stripe.create-refund",
      type: "TOOL",
      elements: {
        root: {
          type: "Stack",
          props: { gap: "md" },
          children: ["outcome", "amount", "details", "raw"],
        },
        outcome: {
          type: "Alert",
          props: {
            title: "Refund issued",
            message: "The duplicate charge was refunded successfully.",
            tone: "success",
          },
          children: [],
        },
        amount: {
          type: "Stat",
          props: {
            label: "Amount refunded (USD)",
            value: { $state: "/data/selectedValue/amount_usd" },
            detail: { $state: "/data/selectedValue/expected_arrival" },
            tone: "success",
          },
          children: [],
        },
        details: {
          type: "Card",
          props: { title: "Receipt", description: null, tone: "neutral" },
          children: ["status", "refund", "charge"],
        },
        status: {
          type: "KeyValue",
          props: {
            label: "Status",
            value: {
              $computed: "titleCase",
              args: { value: { $state: "/data/selectedValue/status" } },
            },
            maxCharacters: 120,
          },
          children: [],
        },
        refund: {
          type: "KeyValue",
          props: {
            label: "Refund ID",
            value: { $state: "/data/selectedValue/refund_id" },
            maxCharacters: 120,
          },
          children: [],
        },
        charge: {
          type: "KeyValue",
          props: {
            label: "Charge ID",
            value: { $state: "/data/selectedValue/charge_id" },
            maxCharacters: 120,
          },
          children: [],
        },
        raw: {
          type: "Accordion",
          props: { title: "Provider response", defaultOpen: false },
          children: ["json"],
        },
        json: {
          type: "Json",
          props: {
            label: null,
            value: { $state: "/data/selectedValue" },
            collapsed: false,
          },
          children: [],
        },
      },
    }),
  },
  {
    id: "custom-ui-demo-intent-signal",
    name: "Intent signal",
    description:
      "Condenses classifier JSON into the three signals a support operator needs.",
    definition: observationDefinition({
      title: "Intent signal",
      summary:
        "Condenses classifier JSON into the three signals a support operator needs.",
      name: "classify-intent",
      type: "GENERATION",
      elements: {
        root: {
          type: "Card",
          props: {
            title: "Request classification",
            description:
              "The routing signal extracted from the customer message.",
            tone: "info",
          },
          children: ["intent", "signals", "raw"],
        },
        intent: {
          type: "Heading",
          props: {
            text: {
              $computed: "titleCase",
              args: { value: { $state: "/data/selectedValue/intent" } },
            },
            level: 3,
          },
          children: [],
        },
        signals: {
          type: "Grid",
          props: { columns: 2 },
          children: ["urgency", "sentiment"],
        },
        urgency: {
          type: "Stat",
          props: {
            label: "Urgency",
            value: {
              $computed: "titleCase",
              args: { value: { $state: "/data/selectedValue/urgency" } },
            },
            detail: null,
            tone: "warning",
          },
          children: [],
        },
        sentiment: {
          type: "Stat",
          props: {
            label: "Sentiment",
            value: {
              $computed: "titleCase",
              args: { value: { $state: "/data/selectedValue/sentiment" } },
            },
            detail: null,
            tone: "neutral",
          },
          children: [],
        },
        raw: {
          type: "Accordion",
          props: { title: "Classifier output", defaultOpen: false },
          children: ["json"],
        },
        json: {
          type: "Json",
          props: {
            label: null,
            value: { $state: "/data/selectedValue" },
            collapsed: false,
          },
          children: [],
        },
      },
    }),
  },
  {
    id: "custom-ui-demo-reply-reader",
    name: "Reply reader",
    description:
      "Presents the drafted customer response as the primary artifact instead of nested JSON.",
    definition: observationDefinition({
      title: "Reply reader",
      summary:
        "Presents the drafted customer response as the primary artifact instead of nested JSON.",
      name: "draft-response",
      type: "GENERATION",
      elements: {
        root: {
          type: "Stack",
          props: { gap: "md" },
          children: ["heading", "reply", "length", "raw"],
        },
        heading: {
          type: "Heading",
          props: { text: "Drafted reply", level: 3 },
          children: [],
        },
        reply: {
          type: "Card",
          props: { title: null, description: null, tone: "neutral" },
          children: ["replyText"],
        },
        replyText: {
          type: "Text",
          props: {
            content: { $state: "/data/selectedValue/reply" },
            variant: "body",
            maxLines: null,
          },
          children: [],
        },
        length: {
          type: "Stat",
          props: {
            label: "Characters",
            value: {
              $computed: "count",
              args: { value: { $state: "/data/selectedValue/reply" } },
            },
            detail: "A concise customer-facing answer",
            tone: "neutral",
          },
          children: [],
        },
        raw: {
          type: "Accordion",
          props: { title: "Raw generation output", defaultOpen: false },
          children: ["json"],
        },
        json: {
          type: "Json",
          props: {
            label: null,
            value: { $state: "/data/selectedValue" },
            collapsed: false,
          },
          children: [],
        },
      },
    }),
  },
  {
    id: "custom-ui-demo-delivery-receipt",
    name: "Delivery receipt",
    description:
      "Turns a transport response into a compact, human-readable delivery confirmation.",
    definition: observationDefinition({
      title: "Delivery receipt",
      summary:
        "Turns a transport response into a compact, human-readable delivery confirmation.",
      name: "zendesk.send-reply",
      type: "TOOL",
      elements: {
        root: {
          type: "Card",
          props: {
            title: "Reply delivered",
            description:
              "The customer-facing response reached the support thread.",
            tone: "success",
          },
          children: ["status", "message", "raw"],
        },
        status: {
          type: "Badge",
          props: {
            text: {
              $computed: "titleCase",
              args: { value: { $state: "/data/selectedValue/status" } },
            },
            tone: "success",
          },
          children: [],
        },
        message: {
          type: "KeyValue",
          props: {
            label: "Message ID",
            value: { $state: "/data/selectedValue/message_id" },
            maxCharacters: 160,
          },
          children: [],
        },
        raw: {
          type: "Accordion",
          props: { title: "Delivery response", defaultOpen: false },
          children: ["json"],
        },
        json: {
          type: "Json",
          props: {
            label: null,
            value: { $state: "/data/selectedValue" },
            collapsed: false,
          },
          children: [],
        },
      },
    }),
  },
] as const;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const supportSummary = await supportAgentScenario.run(ctx, {
    ...params,
    v4: params["v4"] !== false,
    fail: false,
    "days-ago": 0,
  });
  const links = [
    `${ctx.baseUrl}/project/${ctx.projectId}/visualizations`,
    ...CUSTOM_UI_DEMO_VISUALIZATIONS.map(
      ({ id }) =>
        `${ctx.baseUrl}/project/${ctx.projectId}/visualizations/${id}`,
    ),
    ...supportSummary.links,
  ];

  if (ctx.dryRun) {
    return {
      ...supportSummary,
      scenario: "custom-ui-demo",
      counts: {
        ...supportSummary.counts,
        customVisualizations: CUSTOM_UI_DEMO_VISUALIZATIONS.length,
        customVisualizationVersions: CUSTOM_UI_DEMO_VISUALIZATIONS.length,
      },
      links,
      durationMs: Date.now() - startedAt,
    };
  }

  const member = await prisma.projectMembership.findFirst({
    where: { projectId: ctx.projectId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!member) {
    throw new SeedError(
      `Project ${ctx.projectId} has no member who can own Custom UI records`,
      "run the normal local Postgres seed first",
    );
  }

  const ids = CUSTOM_UI_DEMO_VISUALIZATIONS.map(({ id }) => id);
  await prisma.$transaction(async (tx) => {
    await tx.customVisualization.deleteMany({
      where:
        params["replace-existing"] === true
          ? { projectId: ctx.projectId }
          : { projectId: ctx.projectId, id: { in: ids } },
    });
    for (const visualization of CUSTOM_UI_DEMO_VISUALIZATIONS) {
      await tx.customVisualization.create({
        data: {
          id: visualization.id,
          projectId: ctx.projectId,
          name: visualization.name,
          description: visualization.description,
          createdByUserId: member.userId,
        },
      });
      const versionId = `${visualization.id}-v1`;
      await tx.customVisualizationVersion.create({
        data: {
          id: versionId,
          visualizationId: visualization.id,
          version: 1,
          definition: visualization.definition as Prisma.InputJsonValue,
          source: "SEED",
          prompt: null,
          createdByUserId: member.userId,
        },
      });
      await tx.customVisualization.update({
        where: { id: visualization.id },
        data: { activeVersionId: versionId },
      });
    }
  });

  const verifiedCustomVisualizations = await prisma.customVisualization.count({
    where: { projectId: ctx.projectId, id: { in: ids } },
  });
  const verifiedCustomVisualizationVersions =
    await prisma.customVisualizationVersion.count({
      where: { visualizationId: { in: ids } },
    });
  if (
    verifiedCustomVisualizations !== CUSTOM_UI_DEMO_VISUALIZATIONS.length ||
    verifiedCustomVisualizationVersions !== CUSTOM_UI_DEMO_VISUALIZATIONS.length
  ) {
    throw new SeedError(
      "Custom UI readback did not match the curated demo set",
    );
  }

  ctx.log(
    `published ${CUSTOM_UI_DEMO_VISUALIZATIONS.length} curated Custom UI definitions`,
  );
  return {
    ...supportSummary,
    scenario: "custom-ui-demo",
    params,
    counts: {
      ...supportSummary.counts,
      customVisualizations: CUSTOM_UI_DEMO_VISUALIZATIONS.length,
      customVisualizationVersions: CUSTOM_UI_DEMO_VISUALIZATIONS.length,
    },
    verified: {
      ...supportSummary.verified,
      customVisualizations: verifiedCustomVisualizations,
      customVisualizationVersions: verifiedCustomVisualizationVersions,
    },
    links,
    durationMs: Date.now() - startedAt,
  };
};

export const customUiDemoScenario: ScenarioDefinition = {
  name: "custom-ui-demo",
  description:
    "A screenshot-ready support-agent session plus five live declarative Custom UIs: resolution story, refund receipt, intent signal, reply reader, and delivery receipt.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "also mirror the support trace into v4 events tables",
    },
    {
      flag: "replace-existing",
      type: "boolean",
      default: false,
      description:
        "remove every existing Custom UI in the target project before seeding the curated set",
    },
  ],
  run,
};
