import { env } from "@/src/env.mjs";

export const RagasLogoIcon = () => {
  const assetPath = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/ragas-logo.png`;

  return (
    <div className="flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetPath} alt="Ragas Logo" width={12} height={12} />
    </div>
  );
};
