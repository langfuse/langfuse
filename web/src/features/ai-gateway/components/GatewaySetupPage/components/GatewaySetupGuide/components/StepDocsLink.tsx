import { Button } from "@/src/components/design-system/Button/Button";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetupDocsUrl";

export function StepDocsLink() {
  return (
    <Button
      variant="text"
      size="sm"
      text="Docs"
      href={GATEWAY_SETUP_DOCS_URL}
    />
  );
}
