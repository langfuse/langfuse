import { getModelProvider } from "./spielwieseModelCatalog";

export function getModelTintClassName(currentModel?: string) {
  switch (getModelProvider(currentModel ?? "")?.id) {
    case "anthropic":
      return "bg-[linear-gradient(135deg,rgba(201,120,62,0.18)_0%,rgba(239,213,186,0.18)_34%,rgba(255,255,255,0.96)_78%)]";
    case "google":
      return "bg-[linear-gradient(135deg,rgba(66,133,244,0.16)_0%,rgba(52,168,83,0.10)_38%,rgba(251,188,5,0.10)_62%,rgba(255,255,255,0.96)_84%)]";
    case "xai":
      return "bg-[linear-gradient(135deg,rgba(15,23,42,0.13)_0%,rgba(71,85,105,0.12)_42%,rgba(255,255,255,0.97)_84%)]";
    case "openai":
    default:
      return "bg-[linear-gradient(135deg,rgba(16,163,127,0.18)_0%,rgba(16,163,127,0.08)_32%,rgba(255,255,255,0.96)_78%)]";
  }
}

export function getModelShellTintClassName(currentModel?: string) {
  switch (getModelProvider(currentModel ?? "")?.id) {
    case "anthropic":
      return "bg-[rgba(239,213,186,0.42)]";
    case "google":
      return "bg-[rgba(230,239,255,0.72)]";
    case "xai":
      return "bg-[rgba(226,232,240,0.62)]";
    case "openai":
    default:
      return "bg-[rgba(214,242,234,0.72)]";
  }
}
