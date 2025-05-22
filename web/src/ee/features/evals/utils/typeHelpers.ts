import { type EvalTemplate } from "@langfuse/shared";

export const getMaintainer = (evalTemplate: EvalTemplate) => {
  if (evalTemplate.projectId === null) {
    // if (evalTemplate.partner) {
    //   return `${evalTemplate.partner} maintained`;
    // }
    return "Langfuse maintained";
  }
  return "User maintained";
};
