import watchHandler from "@/src/features/in-app-agent/server/watchHandler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The generator ends every stream at WATCH_MAX_CONNECTION (90s), well inside
// this limit, so the client's reconnect is always the deliberate path.
export const maxDuration = 120;

export const GET = watchHandler;
