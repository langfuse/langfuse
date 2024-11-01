import { SupportChannels } from "@/src/components/Support";
import Header from "@/src/components/layouts/header";
import { ScrollScreenPage } from "@/src/components/layouts/scroll-screen-page";

export default function SupportPage() {
  return (
    <ScrollScreenPage>
      <Header title="Support" />

      <div className="flex flex-col gap-10">
        <p>
          We are here to help in case of questions or issues. Pick the channel
          that is most convenient for you!
        </p>
      </div>
      <SupportChannels />
    </ScrollScreenPage>
  );
}
