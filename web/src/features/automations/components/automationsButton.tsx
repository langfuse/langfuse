import { Button } from "@/src/components/ui/button";
import { useRouter } from "next/router";
import { Settings } from "lucide-react";

export const AutomationsButton = ({ projectId }: { projectId: string }) => {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/project/${projectId}/automations`);
  };

  return (
    <Button variant="outline" onClick={handleClick}>
      <Settings className="mr-2 h-4 w-4" />
      Automations
    </Button>
  );
};
