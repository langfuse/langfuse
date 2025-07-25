import {
  type AnnotationQueueItem,
  type ValidatedScoreConfig,
} from "@langfuse/shared";
import { AnnotationDrawerSection } from "../shared/AnnotationDrawerSection";
import { AnnotationProcessingLayout } from "../shared/AnnotationProcessingLayout";

interface SessionAnnotationProcessorProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  data: any; // // Session data with scores
  configs: ValidatedScoreConfig[];
}

export const SessionAnnotationProcessor: React.FC<
  SessionAnnotationProcessorProps
> = ({ item, data, configs }) => {
  const leftPanel = (
    <div className="flex h-full items-center justify-center p-4">
      <div className="text-center text-muted-foreground">
        <div className="text-lg font-medium">Session View</div>
        <div className="mt-2 text-xs">Session ID: {item.objectId}</div>
      </div>
    </div>
  );

  const rightPanel = (
    <AnnotationDrawerSection
      item={item}
      scoreTarget={{
        type: "session",
        sessionId: item.objectId,
      }}
      scores={data?.scores ?? []}
      configs={configs}
      environment={data?.environment}
    />
  );

  return (
    <AnnotationProcessingLayout leftPanel={leftPanel} rightPanel={rightPanel} />
  );
};
