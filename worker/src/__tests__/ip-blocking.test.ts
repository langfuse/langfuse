import { describe, it, expect } from "vitest";
import {
  isIPBlocked,
  isIPAddress,
  isHostnameBlocked,
} from "@langfuse/shared/src/server";

describe("IP Blocking Module", () => {
  describe("isIPBlocked", () => {
    describe("IPv4 blocked addresses", () => {
      it("should block localhost addresses", () => {
        expect(isIPBlocked("127.0.0.1", [], [])).toBe(true);
        expect(isIPBlocked("127.1.1.1", [], [])).toBe(true);
        expect(isIPBlocked("127.255.255.255", [], [])).toBe(true);
      });

      it("should block private network addresses", () => {
        expect(isIPBlocked("10.0.0.1", [], [])).toBe(true);
        expect(isIPBlocked("10.255.255.255", [], [])).toBe(true);
        expect(isIPBlocked("172.16.0.1", [], [])).toBe(true);
        expect(isIPBlocked("172.31.255.255", [], [])).toBe(true);
        expect(isIPBlocked("192.168.0.1", [], [])).toBe(true);
        expect(isIPBlocked("192.168.255.255", [], [])).toBe(true);
      });

      it("should block link-local addresses", () => {
        expect(isIPBlocked("169.254.0.1", [], [])).toBe(true);
        expect(isIPBlocked("169.254.169.254", [], [])).toBe(true); // AWS metadata
        expect(isIPBlocked("169.254.255.255", [], [])).toBe(true);
      });

      it("should block multicast addresses", () => {
        expect(isIPBlocked("224.0.0.1", [], [])).toBe(true);
        expect(isIPBlocked("239.255.255.255", [], [])).toBe(true);
      });

      it("should block broadcast and reserved addresses", () => {
        expect(isIPBlocked("255.255.255.255", [], [])).toBe(true);
        expect(isIPBlocked("240.0.0.1", [], [])).toBe(true);
        expect(isIPBlocked("0.0.0.1", [], [])).toBe(true);
      });

      it("should block test networks", () => {
        expect(isIPBlocked("192.0.2.1", [], [])).toBe(true); // TEST-NET-1
        expect(isIPBlocked("198.51.100.1", [], [])).toBe(true); // TEST-NET-2
        expect(isIPBlocked("203.0.113.1", [], [])).toBe(true); // TEST-NET-3
      });

      it("should block CG-NAT addresses", () => {
        expect(isIPBlocked("100.64.0.1", [], [])).toBe(true);
        expect(isIPBlocked("100.127.255.255", [], [])).toBe(true);
      });
    });

    describe("IPv6 blocked addresses", () => {
      it("should block IPv6 localhost", () => {
        expect(isIPBlocked("::1", [], [])).toBe(true);
        expect(isIPBlocked("::", [], [])).toBe(true);
      });

      it("should block IPv6 private addresses", () => {
        expect(isIPBlocked("fc00::1", [], [])).toBe(true);
        expect(isIPBlocked("fd00::1", [], [])).toBe(true);
        expect(isIPBlocked("fe80::1", [], [])).toBe(true);
      });

      it("should block IPv6 multicast", () => {
        expect(isIPBlocked("ff00::1", [], [])).toBe(true);
        expect(isIPBlocked("ff02::1", [], [])).toBe(true);
      });

      it("should block IPv4-mapped IPv6 addresses", () => {
        expect(isIPBlocked("::ffff:192.168.1.1", [], [])).toBe(true);
        expect(isIPBlocked("::ffff:127.0.0.1", [], [])).toBe(true);
      });

      it("should block Teredo addresses", () => {
        expect(isIPBlocked("2001::1", [], [])).toBe(true);
        expect(
          isIPBlocked("2001:0000:4136:e378:8000:63bf:3fff:fdd2", [], []),
        ).toBe(true);
      });
    });

    describe("allowed public addresses", () => {
      it("should allow public IPv4 addresses", () => {
        expect(isIPBlocked("8.8.8.8", [], [])).toBe(false); // Google DNS
        expect(isIPBlocked("1.1.1.1", [], [])).toBe(false); // Cloudflare DNS
        expect(isIPBlocked("208.67.222.222", [], [])).toBe(false); // OpenDNS
        expect(isIPBlocked("74.125.224.72", [], [])).toBe(false); // Google
      });

      it("should allow public IPv6 addresses", () => {
        expect(isIPBlocked("2001:4860:4860::8888", [], [])).toBe(false); // Google DNS
        expect(isIPBlocked("2606:4700:4700::1111", [], [])).toBe(false); // Cloudflare DNS
      });
    });

    describe("invalid IP addresses", () => {
      it("should block invalid IP strings", () => {
        expect(isIPBlocked("not-an-ip", [], [])).toBe(true);
        expect(isIPBlocked("256.256.256.256", [], [])).toBe(true);
        expect(isIPBlocked("", [], [])).toBe(true);
        expect(isIPBlocked("invalid", [], [])).toBe(true);
      });
    });

    describe("whitelisted IPs", () => {
      it("should allow whitelisted IPv4 addresses that would normally be blocked", () => {
        // These IPs would normally be blocked but should be allowed due to whitelist
        expect(
          isIPBlocked("127.0.0.1", ["127.0.0.1", "192.168.1.100"], []),
        ).toBe(false);
        expect(
          isIPBlocked("192.168.1.100", ["127.0.0.1", "192.168.1.100"], []),
        ).toBe(false);

        // Non-whitelisted IPs should still be blocked normally
        expect(
          isIPBlocked("192.168.1.1", ["127.0.0.1", "192.168.1.100"], []),
        ).toBe(true);
        expect(
          isIPBlocked("10.0.0.1", ["127.0.0.1", "192.168.1.100"], []),
        ).toBe(true);
      });

      it("should allow whitelisted IPv6 addresses that would normally be blocked", () => {
        expect(isIPBlocked("::1", ["::1", "fe80::1"], [])).toBe(false);
        expect(isIPBlocked("fe80::1", ["::1", "fe80::1"], [])).toBe(false);

        // Non-whitelisted IPv6 should still be blocked
        expect(isIPBlocked("fc00::1", ["::1", "fe80::1"], [])).toBe(true);
      });

      it("should still block non-whitelisted IPs normally", () => {
        // Private IPs not in whitelist should still be blocked
        expect(isIPBlocked("192.168.1.1", ["127.0.0.1"], [])).toBe(true);
        expect(isIPBlocked("172.16.0.1", ["127.0.0.1"], [])).toBe(true);

        // Public IPs should not be blocked
        expect(isIPBlocked("8.8.8.8", ["127.0.0.1"], [])).toBe(false);
      });
    });
    describe("whitelisted IP Segments", () => {
      it("should allow whitelisted IPv4 Segment that would normally be blocked", () => {
        // These IPs would normally be blocked but should be allowed due to whitelist
        expect(isIPBlocked("127.0.0.1", [], ["127.0.0.1/32"])).toBe(false);
        expect(isIPBlocked("192.168.1.100", [], ["192.168.1.0/24"])).toBe(
          false,
        );

        // Non-whitelisted IPs should still be blocked normally
        expect(isIPBlocked("192.168.1.1", [], ["10.0.0.0/8"])).toBe(true);
        expect(isIPBlocked("10.0.0.1", [], ["192.168.1.0/24"])).toBe(true);
      });

      it("should allow whitelisted IPv6 Segment that would normally be blocked", () => {
        expect(isIPBlocked("::1", [], ["::1/128"])).toBe(false);
        expect(isIPBlocked("fe80::1", [], ["fe80::/10"])).toBe(false);

        // Non-whitelisted IPv6 should still be blocked
        expect(isIPBlocked("fc00::1", [], ["::1/128"])).toBe(true);
      });

      it("should still block non-whitelisted IPs normally", () => {
        // Private IPs not in whitelist should still be blocked
        expect(isIPBlocked("192.168.1.1", [], [])).toBe(true);
        expect(isIPBlocked("172.16.0.1", [], [])).toBe(true);

        // Public IPs should not be blocked
        expect(isIPBlocked("8.8.8.8", ["127.0.0.1"], ["192.168.1.0/24"])).toBe(
          false,
        );
      });
    });
  });

  describe("isIPAddress", () => {
    it("should detect valid IPv4 addresses", () => {
      expect(isIPAddress("192.168.1.1")).toBe(true);
      expect(isIPAddress("8.8.8.8")).toBe(true);
      expect(isIPAddress("127.0.0.1")).toBe(true);
    });

    it("should detect valid IPv6 addresses", () => {
      expect(isIPAddress("::1")).toBe(true);
      expect(isIPAddress("2001:4860:4860::8888")).toBe(true);
      expect(isIPAddress("fe80::1")).toBe(true);
    });

    it("should handle IPv6 addresses with brackets", () => {
      expect(isIPAddress("[::1]")).toBe(true);
      expect(isIPAddress("[2001:4860:4860::8888]")).toBe(true);
    });

    it("should not detect hostnames as IP addresses", () => {
      expect(isIPAddress("example.com")).toBe(false);
      expect(isIPAddress("localhost")).toBe(false);
      expect(isIPAddress("google.com")).toBe(false);
    });

    it("should handle invalid formats", () => {
      expect(isIPAddress("256.256.256.256")).toBe(false);
      expect(isIPAddress("not-an-ip")).toBe(false);
      expect(isIPAddress("")).toBe(false);
    });
  });

  describe("isHostnameBlocked", () => {
    it("should block localhost variations", () => {
      expect(isHostnameBlocked("localhost")).toBe(true);
      expect(isHostnameBlocked("test.localhost")).toBe(true);
      expect(isHostnameBlocked("api.localhost")).toBe(true);
    });

    it("should block internal hostnames", () => {
      expect(isHostnameBlocked("internal")).toBe(true);
      expect(isHostnameBlocked("api.internal")).toBe(true);
      expect(isHostnameBlocked("service.internal")).toBe(true);
    });

    it("should block intranet hostnames", () => {
      expect(isHostnameBlocked("intranet")).toBe(true);
      expect(isHostnameBlocked("portal.intranet")).toBe(true);
    });

    it("should block cloud metadata endpoints", () => {
      expect(isHostnameBlocked("metadata.google.internal")).toBe(true);
      expect(isHostnameBlocked("169.254.169.254")).toBe(true);
    });

    it("should block Docker internal hostnames", () => {
      expect(isHostnameBlocked("host.docker.internal")).toBe(true);
      expect(isHostnameBlocked("gateway.docker.internal")).toBe(true);
    });

    it("should allow legitimate hostnames", () => {
      expect(isHostnameBlocked("example.com")).toBe(false);
      expect(isHostnameBlocked("google.com")).toBe(false);
      expect(isHostnameBlocked("github.com")).toBe(false);
      expect(isHostnameBlocked("webhook.site")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isHostnameBlocked("")).toBe(false);
      expect(isHostnameBlocked("localhostbutnotreally.com")).toBe(false);
      expect(isHostnameBlocked("internal.company.com")).toBe(false); // Only blocks *.internal, not *internal*
    });
  });
});
