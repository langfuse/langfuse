import preview from "../../../../../../.storybook/preview";
import { DnsRecordTable } from "./DnsRecordTable";

const meta = preview.meta({ component: DnsRecordTable });

export const Default = meta.story({
  args: {
    recordHost: "_langfuse.example.com",
    recordValue: "langfuse-verification=example-token",
  },
});
