import { type EvalTemplate } from "@langfuse/shared";

export const partnerIdentifierToName = new Map([["ragas", "Ragas"]]);

const getPartnerName = (partner: string) => {
  return partnerIdentifierToName.get(partner) ?? "Unknown";
};

export const getMaintainer = (
  evalTemplate: Partial<EvalTemplate> & {
    partner?: string | null;
    projectId: string | null;
  },
) => {
  if (evalTemplate.projectId === null) {
    if (evalTemplate.partner) {
      return `${getPartnerName(evalTemplate.partner)} maintained`;
    }
    return "Langfuse maintained";
  }
  return "User maintained";
};
