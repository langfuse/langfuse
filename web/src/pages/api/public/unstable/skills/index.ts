import { MAX_SKILL_REQUEST_BODY_BYTES } from "@langfuse/shared";

// Compatibility route for clients using the unstable Skills API.
export { default } from "@/src/pages/api/public/skills/index";

export const config = {
  api: {
    bodyParser: { sizeLimit: `${MAX_SKILL_REQUEST_BODY_BYTES}b` },
  },
};
