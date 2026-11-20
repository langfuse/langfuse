import ragasLogo from "@/public/assets/ragas-logo.png";
import { SafeImage } from "@/src/components/design-system/SafeImage/SafeImage";

export const RagasLogoIcon = () => {
  return (
    <div className="flex items-center">
      <SafeImage src={ragasLogo} alt="Ragas Logo" width={12} height={12} />
    </div>
  );
};
