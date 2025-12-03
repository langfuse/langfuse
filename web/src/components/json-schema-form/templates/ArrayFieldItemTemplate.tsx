import type {
  ArrayFieldItemTemplateProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";
import { Button } from "@/src/components/ui/button";
import { Trash2, ChevronUp, ChevronDown, Copy } from "lucide-react";

export default function ArrayFieldItemTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>(props: ArrayFieldItemTemplateProps<T, S, F>) {
  const { children, disabled, readonly, buttonsProps } = props;
  const {
    hasMoveUp,
    hasMoveDown,
    hasRemove,
    hasCopy,
    onMoveUpItem,
    onMoveDownItem,
    onRemoveItem,
    onCopyItem,
  } = buttonsProps || {};

  return (
    <div className="flex items-start gap-2 rounded-md border bg-card p-3">
      <div className="flex flex-col gap-1">
        {(hasMoveUp || hasMoveDown) && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={disabled || readonly || !hasMoveUp}
              onClick={onMoveUpItem}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={disabled || readonly || !hasMoveDown}
              onClick={onMoveDownItem}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      <div className="flex-1">{children}</div>
      <div className="flex gap-1">
        {hasCopy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            disabled={disabled || readonly}
            onClick={onCopyItem}
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
        {hasRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={disabled || readonly}
            onClick={onRemoveItem}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
