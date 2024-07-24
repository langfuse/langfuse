import { redis } from "@langfuse/shared/src/server";

export default async function teardown() {
  redis?.disconnect();
  console.log("Teardown complete");
}
