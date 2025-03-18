import { AlertCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";

export const SupportOrUpgradePage = () => {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Restricted</AlertTitle>
          <AlertDescription>
            <p className="mb-2">This feature requires additional permissions</p>
            <p>
              Contact your system/project administrator for access or upgrade
              your plan. Need help? Reach out to support.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
};
