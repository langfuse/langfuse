import dynamic from "next/dynamic";

const Agentation = dynamic(
  () => import("agentation").then((mod) => mod.Agentation),
  { ssr: false },
);

// DEV ONLY:
// Keep agentation available in local development without shipping it into the
// normal production experience.
export function AgentationSurface() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <div data-testid="agentation-surface" style={{ display: "contents" }}>
      <Agentation />
    </div>
  );
}
