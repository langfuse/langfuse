import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { z } from "zod";
import { promises as dns } from "dns";
import { Address4, Address6 } from "ip-address";

const IP_4_LOOPBACK_SUBNET = "127.0.0.0/8";
const IP_4_LINK_LOCAL_SUBNET = "169.254.0.0/16";
const IP_4_PRIVATE_A_SUBNET = "10.0.0.0/8";
const IP_4_PRIVATE_B_SUBNET = "172.16.0.0/12";
const IP_4_PRIVATE_C_SUBNET = "192.168.0.0/16";

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
    const addresses = await dns.resolve4(hostname);
    return addresses;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");

    // ensure image is not larger than 1MB in size
    if (!contentLength || parseInt(contentLength, 10) > 1 * 1024 * 1024) {
      return false;
    }

    return !!contentType && contentType.startsWith("image/");
  } catch (error) {
    console.error("Invalid image error:", error);
    return false;
  }
};

export const utilsRouter = createTRPCRouter({
  validateImgUrl: protectedProcedure
    .input(z.string().url().max(2048))
    .query(async ({ input: url }) => {
      const isValidUrl = await isValidAndSecureUrl(url);
      if (!isValidUrl) {
        return { isValid: false };
      }

      const isValidImg = await isValidImageUrl(url);
      return { isValid: isValidImg };
    }),
});
