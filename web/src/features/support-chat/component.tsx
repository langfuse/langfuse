import dynamic from "next/dynamic";

export const CrispWidget = dynamic(() => import("./chat"), {
  ssr: false,
});
