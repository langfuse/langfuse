import { type ComponentProps } from "react";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { SessionObservationStatusMessage } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionObservationStatusMessage/SessionObservationStatusMessage";

type ToolStatus = Pick<
  ComponentProps<typeof SessionObservationStatusMessage>,
  "name" | "message"
>;

export function SessionToolTooltip({
  children,
  variant,
  content,
}: {
  children: ComponentProps<typeof CustomTooltip>["children"];
  variant: "sidebar" | "timeline";
  content:
    | {
        type: "group";
        title: string;
        errors: readonly ToolStatus[];
        warnings: readonly ToolStatus[];
      }
    | ({ type: "status" } & ComponentProps<
        typeof SessionObservationStatusMessage
      >);
}) {
  const sections =
    content.type === "group"
      ? [
          { severity: "error" as const, tools: content.errors },
          { severity: "warning" as const, tools: content.warnings },
        ]
      : [];
  return (
    <CustomTooltip
      padding="uniform"
      placement={variant === "sidebar" ? "right" : "top"}
      delay={variant === "sidebar" && content.type === "group" ? 200 : 150}
      content={
        <div className="flex flex-col gap-2">
          {variant === "sidebar" && content.type === "group" && (
            <>
              <h4 className="text-sm font-bold">Tool calls</h4>
              <div className="whitespace-pre-line">{content.title}</div>
            </>
          )}
          {content.type === "status" && (
            <SessionObservationStatusMessage
              name={content.name}
              level={content.level}
              message={content.message}
            />
          )}
          {sections.map(({ severity, tools }) => {
            if (tools.length === 0) return null;
            const presentation = (
              {
                error: {
                  label: "Errors",
                  level: "ERROR",
                },
                warning: {
                  label: "Warnings",
                  level: "WARNING",
                },
              } satisfies Record<
                typeof severity,
                {
                  label: string;
                  level: ComponentProps<
                    typeof SessionObservationStatusMessage
                  >["level"];
                }
              >
            )[severity];
            return (
              <div key={severity} className="flex flex-col gap-2">
                {variant === "sidebar" && (
                  <h4 className="text-sm font-bold">{presentation.label}</h4>
                )}
                {tools.map(({ name, message }, index) => (
                  <SessionObservationStatusMessage
                    key={index}
                    name={name}
                    level={presentation.level}
                    message={message}
                  />
                ))}
              </div>
            );
          })}
        </div>
      }
    >
      {children}
    </CustomTooltip>
  );
}
