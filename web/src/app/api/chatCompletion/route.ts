import chatCompletionHandler from "@/src/features/playground/server/chatCompletionHandler";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return chatCompletionHandler(req);
}
