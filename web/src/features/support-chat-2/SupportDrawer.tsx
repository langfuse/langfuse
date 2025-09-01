import { useSupportDrawer } from "@/src/features/support-chat-2/SupportDrawerProvider";
import { SupportForm } from "@/src/features/support-chat-2/SupportForm";

export const SupportDrawer = () => {
  const { open, setOpen } = useSupportDrawer();
  return <SupportForm open={open} onOpenChange={setOpen} />;
};
