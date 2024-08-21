import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { z } from "zod";
import { promises as dns } from "dns";
import { Address4, Address6 } from "ip-address";

const IP_4_LOOPBACK_SUBNET = "127.0.0.0/8";
const IP_4_LINK_LOCAL_SUBNET = "169.254.0.0/16";
const IP_4_PRIVATE_A_SUBNET = "10.0.0.0/8";
const IP_4_PRIVATE_B_SUBNET = "172.16.0.0/12";
const IP_4_PRIVATE_C_SUBNET = "192.168.0.0/16";

/**
 * Check if the hostname is a private IP address
 * This function is used to protect against Server Side Request Forgery (SSRF) attacks.
 * SSRF attacks can cause the server to make requests to internal resources that should not be accessible.
 * By checking if a hostname resolves to a private IP address, we can prevent such attacks.
 *
 * @param hostname - The hostname to check
 * @returns True if the hostname is a private IP address, false otherwise
 */
const isPrivateIp = (hostname: string): boolean => {
  try {
    if (Address6.isValid(hostname)) {
      const address = new Address6(hostname);
      return address.isLinkLocal() || address.isLoopback();
    } else if (Address4.isValid(hostname)) {
      const address = new Address4(hostname);
      return [
        IP_4_LOOPBACK_SUBNET,
        IP_4_LINK_LOCAL_SUBNET,
        IP_4_PRIVATE_A_SUBNET,
        IP_4_PRIVATE_B_SUBNET,
        IP_4_PRIVATE_C_SUBNET,
      ].some((subnet) => address.isInSubnet(new Address4(subnet)));
    } else {
      console.error("Invalid IP address:", hostname);
      return false;
    }
  } catch (error) {
    console.error("IP parsing error:", error);
    return false;
  }
};

const resolveHostname = async (hostname: string): Promise<string[]> => {
  try {
    const addresses4 = await dns.resolve4(hostname);
    const addresses6 = await dns.resolve6(hostname);
    return [...addresses4, ...addresses6];
  } catch (error) {
    console.error("DNS resolution error:", error);
    return [];
  }
};

const isValidAndSecureUrl = async (urlString: string): Promise<boolean> => {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") {
      return false;
    }
    const hostname = new URL(url).hostname;
    const ipAddresses = await resolveHostname(hostname);

    return ipAddresses.every((ip) => !isPrivateIp(ip));
  } catch (error) {
    console.error("Invalid URL:", error);
    return false;
  }
};

const isValidImageUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type");

    return !!contentType && contentType.startsWith("image/");
  } catch (error) {
    console.error("Invalid image error:", error);
    return false;
  }
};

export const utilsRouter = createTRPCRouter({
  validateImgUrl: protectedProcedure
    .input(z.string().max(2048))
    .query(async ({ input: url }) => {
      const isValidUrl = await isValidAndSecureUrl(url);
      if (!isValidUrl) {
        return { isValid: false };
      }

      const isValidImg = await isValidImageUrl(url);
      return { isValid: isValidImg };
    }),
});
