import { getSkillRequestBodySizeLimit } from "@/src/features/skills/server/skill-request-body-limit";
// Compatibility route for clients using the unstable Skills API.
export { default } from "@/src/pages/api/public/skills/index";

export const config = {
  api: {
    bodyParser: { sizeLimit: getSkillRequestBodySizeLimit() },
  },
};
