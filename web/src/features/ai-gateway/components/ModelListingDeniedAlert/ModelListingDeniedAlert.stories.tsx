import preview from "@/.storybook/preview";
import { ModelListingDeniedAlert } from "./ModelListingDeniedAlert";

const meta = preview.meta({ component: ModelListingDeniedAlert });

export const Default = meta.story({ args: { provider: "BEDROCK" } });

export const Xai = meta.story({ args: { provider: "XAI" } });
