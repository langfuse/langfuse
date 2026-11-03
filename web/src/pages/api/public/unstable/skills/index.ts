// Compatibility route for clients using the unstable Skills API.
export { default } from "@/src/pages/api/public/skills/index";

export const config = {
  api: {
    bodyParser: { sizeLimit: "4.5mb" },
  },
};
