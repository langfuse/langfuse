import { useRouter } from "next/router";
import PromptDeployScreen from "@/src/product/screens/PromptDeployScreen";
import PromptEvaluateScreen from "@/src/product/screens/PromptEvaluateScreen";
import PromptIterateScreen from "@/src/product/screens/PromptIterateScreen";
import PromptMonitorScreen from "@/src/product/screens/PromptMonitorScreen";
import { resolvePromptPreviewSlug } from "@/src/product/shell/product-manifest";

export default function PromptPreviewRoutePage() {
  const router = useRouter();

  if (!router.isReady) {
    return null;
  }

  const { stage } = resolvePromptPreviewSlug(router.query.slug);

  switch (stage) {
    case "evaluate":
      return <PromptEvaluateScreen />;
    case "monitor":
      return <PromptMonitorScreen />;
    case "deploy":
      return <PromptDeployScreen />;
    case "iterate":
    default:
      return <PromptIterateScreen />;
  }
}
