import { api } from "@/src/utils/api";
import { NewProjectButton } from "@/src/features/projects/components/NewProjectButton";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function ProjectList() {
  const projects = api.projects.all.useQuery();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projects.data) {
      if (projects.data.length > 0)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        void router.push(`/project/${projects.data[0]!.id}`);
      else setLoading(false);
    }
  }, [projects.data, router]);

  if (loading || projects.status === "loading") {
    return <div>Loading...</div>;
  }

  return (
    <div className="text-center">
      <svg
        className="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
        />
      </svg>
      <h3 className="mt-2 text-sm font-semibold text-gray-900">No projects</h3>
      <p className="mt-1 text-sm text-gray-500">
        Get started by creating a new project.
      </p>
      <div className="mt-6">
        <NewProjectButton />
      </div>
    </div>
  );
}
