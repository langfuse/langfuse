import { api, type RouterOutputs } from "@/src/utils/api";
import { type TopicFacet, type TopicRule } from "@langfuse/shared/topics";
import { useAutomaticProcessing } from "./useAutomaticProcessing";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];
type Connection = RouterOutputs["llmApiKey"]["effective"]["data"][number];

export type ConfigureTopicsSettingsInput = {
  projectId: string;
  canWrite: boolean;
  stored: StoredSettings;
  traceIdleMs: number | null;
  connections: Connection[];
  facets: TopicFacet[];
  /** The project's only rule; null with none or several. */
  rule: TopicRule | null;
  ruleCount: number;
};

export type TopicSetupNoticeState = {
  status:
    | { kind: "paused"; message: string }
    | { kind: "setup" }
    | { kind: "models" }
    | null;
};

/**
 * Topics setup state. The page wraps itself in `ConfigureTopicsDialogController`
 * and `AutomaticProcessingDialogController` and wires their `openDialog` into
 * the header buttons and `TopicSetupNotice`.
 */
export function useTopicSettings({
  projectId,
  canWrite,
  facets,
  facetsReady,
}: {
  projectId: string;
  canWrite: boolean;
  facets: TopicFacet[];
  facetsReady: boolean;
}) {
  const settings = api.topics.modelSettings.useQuery({ projectId });
  const readinessSettings = api.topics.tracingReadinessSettings.useQuery({
    projectId,
  });
  // The maps overview lists the rules too; one query keeps them in one cache.
  const maps = api.topics.maps.useQuery({ projectId });
  const rules = maps.data?.rules;
  const connections = api.llmApiKey.effective.useQuery({ projectId });
  const configured = Boolean(
    settings.data?.summary &&
    settings.data.embedding &&
    settings.data.clustering,
  );
  const rule = rules?.length === 1 ? rules[0] : null;
  const automaticProcessing = useAutomaticProcessing({
    projectId,
    rule,
    hasRules: Boolean(rules?.length),
    stored: settings.data,
  });

  let status: TopicSetupNoticeState["status"] = null;
  if (settings.data?.blockMessage)
    status = { kind: "paused", message: settings.data.blockMessage };
  else if (settings.data && !configured && facetsReady && !facets.length)
    status = { kind: "setup" };
  else if (settings.data && !configured) status = { kind: "models" };

  const configureSettings: ConfigureTopicsSettingsInput | null =
    settings.data &&
    readinessSettings.data &&
    connections.data &&
    rules !== undefined &&
    facetsReady
      ? {
          projectId,
          canWrite,
          stored: settings.data,
          traceIdleMs: readinessSettings.data.traceIdleMs,
          connections: connections.data.data,
          facets,
          rule,
          ruleCount: rules.length,
        }
      : null;

  const configurationError =
    settings.error ??
    readinessSettings.error ??
    connections.error ??
    maps.error;

  return {
    configure: {
      settings: configureSettings,
      error: configurationError
        ? `Could not load Topics configuration: ${configurationError.message} Reload the page to retry.`
        : null,
    },
    automaticProcessing: {
      ...automaticProcessing,
      dialog: {
        projectId,
        rule,
        stored: settings.data,
        save: automaticProcessing.save,
        saving: automaticProcessing.saving,
      },
    },
    notice: {
      status,
    } satisfies TopicSetupNoticeState,
  };
}
