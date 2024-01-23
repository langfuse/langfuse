import Header from "@/src/components/layouts/header";
import { PlaygroundArea } from "@/src/features/playground/components/playground-area";
import { useRouter } from "next/router";

export default function Playground() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="h-full">
      <Header
        title="Playground"
        help={{
          description:
            "Explore the models with prompts and parameters. Learn more in the docs.",
          href: "https://langfuse.com/docs/playground",
        }}
      />
      <PlaygroundArea projectId={projectId} />
    </div>
  );
}
