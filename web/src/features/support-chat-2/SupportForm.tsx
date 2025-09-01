import { IntroSection } from "@/src/features/support-chat-2/IntroSection";
import { FormSection } from "@/src/features/support-chat-2/FormSection";
import { SuccessSection } from "@/src/features/support-chat-2/SuccessSection";

export const SupportForm = ({
  mode,
  onModeChange,
  onClose,
}: {
  mode: "intro" | "form" | "success";
  onModeChange: (mode: "intro" | "form" | "success") => void;
  onClose: () => void;
}) => {
  return (
    <div className="h-full bg-background">
      <div className="p-2">
        {mode === "intro" && (
          <IntroSection onStartForm={() => onModeChange("form")} />
        )}
        {mode === "form" && (
          <FormSection
            onSuccess={() => onModeChange("success")}
            onBack={() => onModeChange("intro")}
          />
        )}
        {mode === "success" && (
          <SuccessSection
            onClose={onClose}
            onAnother={() => onModeChange("form")}
          />
        )}
      </div>
    </div>
  );
};
