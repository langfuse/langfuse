import net from "node:net";
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import type { LookupAddress } from "node:dns";

// Import our existing validation logic
import { resolveHost } from "./validation";
import { isIPBlocked } from "./ipBlocking";

export interface SecureHttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  maxRedirects?: number;
}

export interface SecureHttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/**
 * Secure HTTP client that prevents DNS rebinding attacks (TOCTOU) by:
 * 1. Custom DNS lookup that blocks private IPs at connection time
 * 2. Disabling redirects to prevent bypass attempts
 */
export class SecureHttpClient {
  /**
   * Make a secure HTTP request with SSRF protection
   */
  async request(
    urlString: string,
    options: SecureHttpOptions = {},
  ): Promise<SecureHttpResponse> {
    const url = new URL(urlString);
    const transport = url.protocol === "https:" ? https : http;

    // Create custom agent with secure DNS lookup
    const agent = new transport.Agent({
      keepAlive: false,
      lookup: this.createSecureLookup(),
    });

    const requestOptions = {
      method: options.method ?? "POST",
      agent,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      timeout: options.timeout ?? 5000,
      // Disable redirects to prevent bypass attempts
      maxRedirects: options.maxRedirects ?? 0,
    };

    return new Promise((resolve, reject) => {
      const req = transport.request(url, requestOptions, (res) => {
        res.setEncoding("utf8");
        const chunks: string[] = [];

        res.on("data", (chunk: string) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: chunks.join(""),
          });
        });
        res.on("error", reject);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout after ${options.timeout ?? 5000}ms`));
      });

      req.on("error", reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * Creates a secure DNS lookup function that blocks private IPs at connection time
   * This prevents DNS rebinding attacks where DNS changes between validation and request
   */
  private createSecureLookup() {
    return (
      hostname: string,
      _options: any,
      callback: (
        // eslint-disable-next-line no-unused-vars
        _err: Error | null,
        // eslint-disable-next-line no-unused-vars
        _address: string | LookupAddress[],
        // eslint-disable-next-line no-unused-vars
        _family: number,
      ) => void,
    ) => {
      // Handle async operations without making the function async
      Promise.resolve().then(async () => {
        try {
          // Use shared DNS resolution logic
          const ips = await resolveHost(hostname);

          // Validate each resolved IP against our blocklist
          for (const ip of ips) {
            if (!ip) {
              callback(new Error("Invalid IP address: undefined"), "", 0);
              return;
            }
            if (isIPBlocked(ip)) {
              callback(
                new Error(
                  `Blocked IP address detected at connection time: ${ip}`,
                ),
                "",
                0,
              );
              return;
            }
          }

          // Return the first valid IP (could be randomized for load balancing)
          const selectedIP = ips[0];
          if (!selectedIP) {
            callback(new Error("No valid IP address found"), "", 0);
            return;
          }
          const family = net.isIPv6(selectedIP) ? 6 : 4;
          callback(null, selectedIP, family);
        } catch (error) {
          callback(
            error instanceof Error ? error : new Error("DNS resolution failed"),
            "",
            0,
          );
        }
      });
    };
  }
}

// Export a singleton instance
export const secureHttpClient = new SecureHttpClient();
