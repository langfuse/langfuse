import { api } from "@/src/app/utils/api";

type UsePeekEvalTemplateDataProps = {
  projectId: string;
  templateId?: string;
};

export const usePeekEvalTemplateData = ({
  projectId,
  templateId,
}: UsePeekEvalTemplateDataProps) => {
  return api.evals.templateById.useQuery(
    {
      id: templateId as string,
      projectId,
    },
    {
      enabled: !!templateId,
    },
  );
};
