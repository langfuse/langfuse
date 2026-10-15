import { Sparkles } from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { type TopicSetupNoticeState } from "./TopicModelSettings";

type TopicSetupNoticeProps = {
  notice: TopicSetupNoticeState;
  canWrite: boolean;
  canConfigure: boolean;
  onConfigure: () => void;
  onKeepOff: () => void;
  onTurnBackOn: () => void;
  showOnboarding?: boolean;
  configured?: boolean;
  canProcess?: boolean;
  automaticEnabled?: boolean;
  running?: boolean;
  onAutomaticProcessing?: () => void;
  onManualProcessing?: () => void;
};

/** Guides projects to their first summaries and surfaces paused processing. */
export function TopicSetupNotice({
  notice,
  canWrite,
  canConfigure,
  onConfigure,
  onKeepOff,
  onTurnBackOn,
  showOnboarding = notice.status?.kind === "setup",
  configured = false,
  canProcess = false,
  automaticEnabled = false,
  running = false,
  onAutomaticProcessing,
  onManualProcessing,
}: TopicSetupNoticeProps) {
  const { status } = notice;
  const processingChoiceDescription = automaticEnabled
    ? "Automatic processing is on for new traces. You can also summarize existing traces in manual batches."
    : "Enable automatic processing for incoming traces, or summarize existing traces in manual batches of up to 1,000.";
  const availableProcessingDescription = running
    ? "Your traces are being processed. Summaries will appear here as they become available."
    : processingChoiceDescription;
  const processingDescription = notice.unavailable
    ? "Topics processing is not enabled for this project. You can configure Topics, but an administrator needs to enable processing before you can analyze traces."
    : availableProcessingDescription;
  return (
    <>
      {status?.kind === "paused" ? (
        <Alert variant="warning">
          <Alert.Title>Automatic Topics processing is paused</Alert.Title>
          <Alert.Description>
            <p className="break-words">{status.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                text="Turn back on"
                variant="secondary"
                size="sm"
                disabled={!canWrite}
                onClick={onTurnBackOn}
              />
              <Button
                text="Keep off"
                variant="secondary"
                size="sm"
                disabled={!canWrite}
                onClick={onKeepOff}
              />
            </div>
          </Alert.Description>
        </Alert>
      ) : null}
      {notice.unavailable && !showOnboarding ? (
        <p role="status" className="text-muted-foreground text-sm">
          Topics processing is not enabled for this project. Existing summaries
          and topics remain available.
        </p>
      ) : null}
      {showOnboarding ? (
        <div className="mx-auto flex w-full max-w-xl flex-col items-center overflow-y-auto pt-12">
          <Sparkles
            aria-hidden="true"
            className="icon-xl text-muted-foreground"
          />
          <SplashScreen
            title={
              configured
                ? "Start analyzing your traces"
                : "Find patterns across your traces"
            }
            description="Topics analyzes each trace along the questions you choose, called facets, and clusters similar answers, so you can see what users ask for, how runs end, and which issues come up along the way."
            steps={[
              {
                title: "Configure Topics",
                badge: configured ? (
                  <StatusBadge type="completed" showText={false} isLive={false}>
                    Done
                  </StatusBadge>
                ) : undefined,
                description: configured
                  ? "Your project models and facets are ready. You can adjust them at any time."
                  : "Pick the models Topics runs on and the facets to analyze, such as intent, outcome, and issues.",
                content: (
                  <Button
                    text="Configure Topics"
                    size="sm"
                    variant={configured ? "secondary" : "primary"}
                    disabled={!canWrite || !canConfigure}
                    onClick={onConfigure}
                  />
                ),
              },
              {
                title: "Analyze traces",
                description: processingDescription,
                content: (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      text="Automatic processing"
                      variant={
                        configured && canProcess && !automaticEnabled
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      disabled={!configured || !canProcess}
                      onClick={onAutomaticProcessing}
                    />
                    <Button
                      text="Summarize traces & embed"
                      variant="secondary"
                      size="sm"
                      disabled={!configured || !canProcess || running}
                      onClick={onManualProcessing}
                    />
                  </div>
                ),
              },
              {
                title: "Gather insights",
                description:
                  "Once summaries are available, generate topics to discover recurring patterns across your traces.",
                content: (
                  <Button
                    text="Generate topics"
                    variant="secondary"
                    size="sm"
                    disabled
                  />
                ),
              },
            ]}
          />
        </div>
      ) : null}
      {status?.kind === "models" && !showOnboarding ? (
        <Alert variant="info">
          <Alert.Title>Choose the models Topics runs on</Alert.Title>
          <Alert.Description>
            <p>
              Topics uses your LLM connections for three jobs: facet summaries,
              embeddings, and topic clustering. Open Configure Topics to set all
              three.
            </p>
          </Alert.Description>
        </Alert>
      ) : null}
    </>
  );
}
