import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.next();
  }

  const startTime = Date.now();
  const { method, nextUrl } = request;
  const path = `${nextUrl.pathname}${nextUrl.search}`;

  const response = NextResponse.next();

  response.headers.set("x-request-start-time", startTime.toString());

  // For now, just log that the request started
  try {
    // Import logger dynamically to avoid build issues
    const loggerModule = require("@langfuse/shared/src/server/logger");
    const logger = loggerModule.logger;

    // Log request start - this won't have response time/status like Next.js built-in logging
    if (path.startsWith("/api/")) {
      logger?.info(`→ ${method} ${path}`);
    }
  } catch (error) {
    // Silently ignore logging errors to not break requests
  }

  return response;
}

export const config = {
  // Focus on API routes since those are the main requests we want to capture
  matcher: [
    "/api/:path*",
    // Also capture page routes for completeness, but exclude static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
