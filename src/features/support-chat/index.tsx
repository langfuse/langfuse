import dynamic from "next/dynamic";

export { chatSetUser } from "./chat";

export const CrispWidget = dynamic(() => import("./chat"), {
  ssr: false,
});
