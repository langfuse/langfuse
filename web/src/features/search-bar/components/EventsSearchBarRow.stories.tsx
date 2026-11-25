import { useState } from "react";
import { useStore } from "zustand";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { type AppRouter } from "@/src/server/api/root";
import { type RouterInputs } from "@/src/utils/api";
import { type AiFilterResult } from "../lib/ai-filter-result";
import { filterStateToQueryText } from "../lib/filter-state-to-query";
import { createSearchBarStore } from "../store/searchBarStore";
import { EventsSearchBarRow } from "./EventsSearchBarRow";

const projects = ["project-a", "project-b"];
const session: Session = {
  expires: "2999-01-01T00:00:00.000Z",
  policies: [],
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: null,
  },
  user: {
    id: "storybook-user",
    canCreateOrganizations: false,
    featureFlags: {
      templateFlag: false,
      v4BetaToggleVisible: false,
      experimentsV4Enabled: false,
    },
    organizations: [
      {
        id: "storybook-organization",
        name: "Example organization",
        cloudConfig: undefined,
        plan: "cloud:hobby",
        metadata: {},
        aiFeaturesEnabled: true,
        aiTelemetryEnabled: false,
        projects: projects.map((id) => ({
          id,
          name: id,
          deletedAt: null,
          retentionDays: null,
          hasTraces: true,
          metadata: {},
          createdAt: "2026-01-01T00:00:00.000Z",
        })),
      },
    ],
  },
};
const storyApi = createTRPCReact<AppRouter>();
const applied = fn();
const requested =
  fn<(input: RouterInputs["searchBar"]["generateFilter"]) => void>();
const analytics = new PostHog();
analytics.capture = fn();

function completeResult(level: string): AiFilterResult {
  return {
    status: "complete",
    filters: [
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: [level],
      },
    ],
    queryText: `level:${level}`,
    unknownScoreNames: [],
  };
}

function DeferredAiExample({
  results,
}: {
  results: Record<string, AiFilterResult>;
}) {
  const [projectId, setProjectId] = useState("project-a");
  const [store] = useState(() => {
    const value = createSearchBarStore();
    value.getState().actions.setDraft("level:ERROR");
    return value;
  });
  const draft = useStore(store, (state) => state.draft);
  const [pending, setPending] = useState(new Map<string, () => void>());
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              if (op.path !== "searchBar.generateFilter") {
                observer.error(
                  new TRPCClientError(
                    "Unexpected API request in AI filter story",
                  ),
                );
                return;
              }
              const input =
                op.input as RouterInputs["searchBar"]["generateFilter"];
              requested(input);
              setPending((current) =>
                new Map(current).set(input.projectId, () => {
                  observer.next({ result: { data: results[input.projectId] } });
                  observer.complete();
                  setPending((active) => {
                    const next = new Map(active);
                    next.delete(input.projectId);
                    return next;
                  });
                }),
              );
            }),
      ],
    }),
  );
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <PostHogProvider client={analytics}>
        <storyApi.Provider client={client} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <div className="flex max-w-2xl flex-col gap-2">
              <Button
                text="Switch to project B"
                onClick={() => setProjectId("project-b")}
              />
              <EventsSearchBarRow
                projectId={projectId}
                tableName="observations"
                store={store}
                commit={() => store.getState().draft}
                observed={{}}
                onApplyFilters={(filters) => {
                  applied(filters);
                  store
                    .getState()
                    .actions.setDraft(filterStateToQueryText(filters).text);
                }}
              />
              <output aria-label="Current query" className="ph-no-capture">
                {draft}
              </output>
              {projects.map((id) => (
                <Button
                  key={id}
                  text={`Deliver ${id} response`}
                  disabled={!pending.has(id)}
                  onClick={() => pending.get(id)?.()}
                />
              ))}
            </div>
          </QueryClientProvider>
        </storyApi.Provider>
      </PostHogProvider>
    </SessionProvider>
  );
}

const meta = preview.meta({
  component: DeferredAiExample,
  parameters: { nextjs: { router: { query: { projectId: "project-a" } } } },
  beforeEach: () => {
    applied.mockClear();
    requested.mockClear();
  },
});

export const TestProjectChangeDuringGeneration = meta.story({
  name: "(Test) Project changes discard an earlier AI response",
  args: {
    results: {
      "project-a": completeResult("DEBUG"),
      "project-b": completeResult("WARNING"),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Ask AI to build or refine filters" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Ask AI to build filters" }),
      "only errors{Enter}",
    );
    await expect(requested).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-a",
        currentQuery: "level:ERROR",
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch to project B" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Deliver project-a response" }),
    );
    const prompt = canvas.getByRole("textbox", {
      name: "Ask AI to build filters",
    });
    await expect(prompt).toBeEnabled();
    await expect(canvas.getByLabelText("Current query")).toHaveTextContent(
      "level:ERROR",
    );
    await expect(applied).not.toHaveBeenCalled();
    await userEvent.type(prompt, "only warnings{Enter}");
    await expect(requested).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId: "project-b",
        currentQuery: "level:ERROR",
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Deliver project-b response" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("combobox", { name: "Search" }),
      ).toHaveTextContent("level:WARNING"),
    );
    await expect(applied).toHaveBeenCalledTimes(1);
    await expect(applied).toHaveBeenCalledWith([
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["WARNING"],
      },
    ]);
  },
});

export const TestIncompleteGeneration = meta.story({
  name: "(Test) An unknown score keeps the existing filters and AI prompt",
  args: {
    results: {
      "project-a": {
        status: "incomplete",
        unknownScoreNames: ["private-score"],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Ask AI to build or refine filters" }),
    );
    const prompt = canvas.getByRole("textbox", {
      name: "Ask AI to build filters",
    });
    await userEvent.type(prompt, "only private-score{Enter}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Deliver project-a response" }),
    );
    await canvas.findByText(
      'No score named "private-score" exists in this project — that filter was not applied. Your existing filters were not changed.',
    );
    await expect(prompt).toBeEnabled();
    await expect(prompt).toHaveValue("only private-score");
    await expect(canvas.getByLabelText("Current query")).toHaveTextContent(
      "level:ERROR",
    );
    await expect(
      canvas.queryByRole("combobox", { name: "Search" }),
    ).not.toBeInTheDocument();
    await expect(applied).not.toHaveBeenCalled();
  },
});
