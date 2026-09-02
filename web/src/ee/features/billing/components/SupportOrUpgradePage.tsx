import { AlertCircle } from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";

export const SupportOrUpgradePage = () => {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Alert icon={AlertCircle}>
          <Alert.Title>Access Restricted</Alert.Title>
          <Alert.Description>
            <p className="mb-2">This feature requires additional permissions</p>
            <p>
              Contact your system/project administrator for access or upgrade
              your plan. Need help? Reach out to support.
            </p>
          </Alert.Description>
        </Alert>
      </div>
    </div>
  );
};
