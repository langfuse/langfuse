import {
  Database,
  FileJson,
  FlaskConical,
  Layers,
  ListTree,
  MessageSquareText,
  ScanSearch,
  type IconComponent,
} from "@langfuse/icons";

import type { PageContextKind } from "@/src/features/page-context";
import { ContextThumbnail } from "@/src/features/in-app-agent/stage/components/ContextThumbnail";
import type { StageContextAttachment } from "@/src/features/in-app-agent/stage/chat/types";

const KIND_ICONS: Record<PageContextKind, IconComponent> = {
  trace: ListTree,
  observation: ScanSearch,
  session: MessageSquareText,
  prompt: FileJson,
  dataset: Database,
  "experiment-run": FlaskConical,
  page: Layers,
};

const VISIBLE_FACTS = 4;

/**
 * The handed-over page as a message attachment: the picture the user saw and,
 * next to it, the structured data the assistant actually receives.
 */
export function ContextAttachmentCard({
  attachment,
  isStageSlot,
  onOpenPage,
}: {
  attachment: StageContextAttachment;
  /** The thumbnail the page flies into and back out of. */
  isStageSlot: boolean;
  onOpenPage: () => void;
}) {
  const { context } = attachment;
  const KindIcon = KIND_ICONS[context.kind];

  return (
    <div className="flex min-w-0 flex-row items-start gap-3 md:flex-col">
      <button
        type="button"
        data-stage-slot={isStageSlot ? "true" : undefined}
        onClick={onOpenPage}
        title={`Back to this ${context.label.toLowerCase()}`}
        className="ring-border hover:ring-ring focus-visible:ring-ring relative block w-28 shrink-0 overflow-hidden rounded-[10px] ring-1 transition-shadow focus-visible:ring-2 focus-visible:outline-hidden md:w-80"
        style={{ aspectRatio: attachment.aspectRatio }}
      >
        <ContextThumbnail
          source={attachment.thumbnail}
          label={`The ${context.label.toLowerCase()} you were looking at`}
        />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:w-80 md:flex-none">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <KindIcon size="sm" color="muted" aria-hidden />
          <span>
            {context.label}
            {context.surface === "peek" ? " · peek" : ""}
          </span>
        </div>
        <p className="truncate text-sm font-bold" title={context.title}>
          {context.title}
        </p>
        {context.id ? (
          <p
            className="text-muted-foreground truncate font-mono text-xs"
            title={context.id}
          >
            {context.id}
          </p>
        ) : null}
        {context.facts.length > 0 ? (
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            {context.facts.slice(0, VISIBLE_FACTS).map((item) => (
              <div key={item.key} className="min-w-0">
                <dt className="text-muted-foreground text-2xs">{item.label}</dt>
                <dd className="truncate font-mono text-xs" title={item.display}>
                  {item.display}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {context.focus ? (
          <p
            className="border-border mt-1.5 truncate border-t pt-1.5 text-xs"
            title={`${context.focus.label}: ${context.focus.title}`}
          >
            <span className="text-muted-foreground">Selected </span>
            <span className="font-mono">{context.focus.title}</span>
            <span className="text-muted-foreground">
              {" "}
              · {context.focus.label}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
