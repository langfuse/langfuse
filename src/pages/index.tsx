import ProjectList from "@/src/features/projects/components/ProjectList";
import Header from "@/src/components/layouts/header";
import { NewProjectButton } from "@/src/features/projects/components/NewProjectButton";

export default function GetStartedPage() {
  return (
    <>
      <Header title="Projects" actionButtons={<NewProjectButton />} />
      <ProjectList />
    </>
  );
}
