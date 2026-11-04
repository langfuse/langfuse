import { env } from "@/src/env.mjs";

export const RagasLogoIcon = () => {
  const assetPath = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/ragas-logo.png`;

  return (
    <div className="flex items-center">
      <img src={assetPath} alt="Ragas Logo" width={12} height={12} />
    </div>
  );
};
