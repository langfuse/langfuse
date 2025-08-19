import { useRouter } from "next/router";

export const RagasLogoIcon = () => {
  const router = useRouter();
  const assetPath = `${router.basePath}/assets/ragas-logo.png`;

  return (
    <div className="flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetPath} alt="Ragas Logo" width={12} height={12} />
    </div>
  );
};
