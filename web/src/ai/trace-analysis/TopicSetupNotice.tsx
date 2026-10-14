import { Alert } from "@/src/app/design-system/Alert/Alert";
import { Button } from "@/src/app/design-system/Button/Button";
import { SplashScreen } from "@/src/app/design-system/legacy-primitives/splash-screen";
import { type TopicSetupNoticeState } from "./TopicModelSettings";

type TopicSetupNoticeProps = {
  notice: TopicSetupNoticeState;
  canWrite: boolean;
  canConfigure: boolean;
  onConfigure: () => void;
  onKeepOff: () => void;
  onTurnBackOn: () => void;
};

/** Setup, paused, and availability notices above the Topics workspace. */
export function TopicSetupNotice({
  notice,
  canWrite,
  canConfigure,
  onConfigure,
  onKeepOff,
  onTurnBackOn,
}: TopicSetupNoticeProps) {
  const { status } = notice;
  return (
    <>
      {notice.unavailable ? (
        <Alert variant="info">
          <Alert.Title>
            Topics processing is not enabled for this project
          </Alert.Title>
          <Alert.Description>
            <p>
              You can configure Topics, but processing traces and automatic
              processing stay unavailable until Topics is enabled for this
              project.
            </p>
          </Alert.Description>
        </Alert>
      ) : null}
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
      {status?.kind === "setup" ? (
        <div className="mx-auto w-full max-w-xl pt-12">
          <SplashScreen
            title="Find patterns across your traces"
            description="Topics analyzes each trace along the questions you choose, called facets, and clusters similar answers, so you can see what users ask for, how runs end, and which issues come up along the way."
            steps={[
              {
                title: "Set up Topics",
                description:
                  "Pick the models Topics runs on and the facets to analyze, such as intent, outcome, and issues.",
              },
              {
                title: "Analyze traces",
                description:
                  "Topics summarizes new traces automatically, and past traces whenever you process them.",
              },
              {
                title: "Gather insights",
                description:
                  "Similar summaries are clustered into topics, on demand or continuously, so patterns across your traces show up here.",
              },
            ]}
            primaryAction={{
              label: "Configure Topics",
              component: (
                <Button
                  text="Configure Topics"
                  disabled={!canWrite || !canConfigure}
                  onClick={onConfigure}
                />
              ),
            }}
          />
        </div>
      ) : null}
      {status?.kind === "models" ? (
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
