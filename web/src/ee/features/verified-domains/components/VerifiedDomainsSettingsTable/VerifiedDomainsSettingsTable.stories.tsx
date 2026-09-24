import { fn } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import { VerifiedDomainsSettingsTable } from "./VerifiedDomainsSettingsTable";

const meta = preview.meta({ component: VerifiedDomainsSettingsTable });

const actions = {
  verifyingDomainId: null,
  onViewInstructions: fn(),
  onDelete: fn(),
};

export const Default = meta.story({
  args: {
    ...actions,
    data: {
      status: "success",
      data: [
        {
          id: "pending",
          domain: "example.com",
          verifiedAt: null,
          createdAt: new Date("2026-09-01"),
          recordHost: "_langfuse.example.com",
          recordValue: "langfuse-verification=example-token",
        },
        {
          id: "verified",
          domain: "verified.example.com",
          verifiedAt: new Date("2026-09-02"),
          createdAt: new Date("2026-09-01"),
          recordHost: "_langfuse.verified.example.com",
          recordValue: "langfuse-verification=verified-token",
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: { ...actions, data: { status: "loading" } },
});

export const Empty = meta.story({
  args: { ...actions, data: { status: "success", data: [] } },
});

export const Error = meta.story({
  args: {
    ...actions,
    data: {
      status: "error",
      error: "Failed to load verified domains. Please try again.",
    },
  },
});
