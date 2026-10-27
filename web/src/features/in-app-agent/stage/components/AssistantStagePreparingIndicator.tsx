import { Layer } from "@/src/components/design-system/Layer/Layer";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { ASSISTANT_STAGE_ROOT_ATTRIBUTE } from "@/src/features/in-app-agent/stage/constants";

/**
 * Feedback while a slow page is being captured. Fades in late, so the usual
 * warm or fast capture never flashes it; lives in the `agent` layer, which the
 * capture leaves out.
 */
export function AssistantStagePreparingIndicator() {
  return (
    <Layer name="agent">
      <div
        {...{ [ASSISTANT_STAGE_ROOT_ATTRIBUTE]: "" }}
        role="status"
        className="border-border bg-background text-muted-foreground animate-in fade-in fill-mode-both fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm delay-200 duration-200"
      >
        <Spinner size="xs" variant="muted" />
        Attaching this page…
      </div>
    </Layer>
  );
}
