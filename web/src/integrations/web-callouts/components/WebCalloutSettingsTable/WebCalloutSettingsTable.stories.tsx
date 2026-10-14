import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import {
  WebCalloutSettingsTable,
  type WebCalloutEndpoint,
} from "./WebCalloutSettingsTable";

const meta = preview.meta({ component: WebCalloutSettingsTable });

const endpoint = {
  id: "endpoint-1",
  projectId: "project-1",
  name: "Deploy",
  url: "https://example.com/callout",
  enabled: true,
  toastMessage: "Deployment started",
  requestHeaderKeys: ["Authorization"],
  createdAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-01"),
} satisfies WebCalloutEndpoint;

export const Default = meta.story({
  args: {
    data: { status: "success", data: [endpoint] },
    noResultsMessage: "No callout endpoint configured.",
    createAction: {
      disabledReason: "Currently you can only create one callout per project.",
      onClick: fn(),
    },
    onEdit: fn(),
    onDelete: fn(),
  },
});

export const Empty = meta.story({
  args: {
    ...Default.input.args,
    data: { status: "success", data: [] },
    createAction: { onClick: fn() },
  },
});

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    data: { status: "loading" },
    createAction: {
      disabledReason: "Loading callout endpoint configuration.",
      onClick: fn(),
    },
  },
});
