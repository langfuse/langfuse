import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const huggingFaceHostPatterns = [/^huggingface\.co$/, /\.hf\.space$/];

function isHuggingFaceHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0];
  return huggingFaceHostPatterns.some((pattern) => pattern.test(hostname));
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const host = request.headers.get("host");
  if (isHuggingFaceHost(host)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const cspDirectives = [
    `default-src 'self' https://*.langfuse.com https://*.langfuse.dev https://*.posthog.com https://*.sentry.io`,
    `script-src 'self' 'unsafe-eval' 'unsafe-inline' 'nonce-${nonce}' https://*.langfuse.com https://*.langfuse.dev https://challenges.cloudflare.com https://*.sentry.io https://static.cloudflareinsights.com https://*.stripe.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com`,
    `style-src 'self' 'unsafe-inline' 'nonce-${nonce}' https://fonts.googleapis.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com`,
    `img-src 'self' https: blob: data: http://localhost:* https://prod-uk-services-workspac-workspacefilespublicbuck-vs4gjqpqjkh6.s3.amazonaws.com https://prod-uk-services-attachm-attachmentsbucket28b3ccf-uwfssb4vt2us.s3.eu-west-2.amazonaws.com https://i0.wp.com`,
    `font-src 'self'`,
    `frame-src 'self' https://challenges.cloudflare.com https://*.stripe.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com`,
    `frame-ancestors 'none'`,
    `connect-src 'self' https://*.langfuse.com https://*.langfuse.dev https://*.ingest.us.sentry.io https://*.sentry.io https://chat.uk.plain.com https://*.s3.amazonaws.com https://prod-uk-services-attachm-attachmentsuploadbucket2-1l2e4906o2asm.s3.eu-west-2.amazonaws.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com https://graph.microsoft.com`,
    `media-src 'self' https: http://localhost:*`,
  ];

  if (process.env.LANGFUSE_CSP_ENFORCE_HTTPS === "true") {
    cspDirectives.push("upgrade-insecure-requests", "block-all-mixed-content");
  }

  if (process.env.SENTRY_CSP_REPORT_URI) {
    cspDirectives.push(
      `report-uri ${process.env.SENTRY_CSP_REPORT_URI}`,
      `report-to csp-endpoint`,
    );
  }

  const cspHeader = cspDirectives.join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher:
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|generated).*)",
};
