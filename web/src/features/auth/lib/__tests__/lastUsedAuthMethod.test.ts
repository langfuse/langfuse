/**
 * @jest-environment jsdom
 */

import {
  storeLastUsedAuthMethod,
  getLastUsedAuthMethod,
  clearLastUsedAuthMethod,
  type AuthMethod,
} from "../lastUsedAuthMethod";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("lastUsedAuthMethod", () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe("storeLastUsedAuthMethod", () => {
    it("should store auth method in localStorage", () => {
      const method: AuthMethod = "google";
      storeLastUsedAuthMethod(method);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "langfuse_last_used_auth_method",
        "google"
      );
    });

    it("should handle different auth methods", () => {
      const methods: AuthMethod[] = [
        "google",
        "github",
        "credentials",
        "azure-ad",
        "okta",
      ];

      methods.forEach((method) => {
        storeLastUsedAuthMethod(method);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          "langfuse_last_used_auth_method",
          method
        );
      });
    });

    it("should not throw when localStorage is unavailable", () => {
      // Mock localStorage to throw an error
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("localStorage unavailable");
      });

      expect(() => storeLastUsedAuthMethod("google")).not.toThrow();
    });
  });

  describe("getLastUsedAuthMethod", () => {
    it("should retrieve stored auth method", () => {
      localStorageMock.setItem("langfuse_last_used_auth_method", "github");

      const result = getLastUsedAuthMethod();

      expect(result).toBe("github");
      expect(localStorageMock.getItem).toHaveBeenCalledWith(
        "langfuse_last_used_auth_method"
      );
    });

    it("should return null when no method is stored", () => {
      const result = getLastUsedAuthMethod();

      expect(result).toBeNull();
    });

    it("should return null when localStorage is unavailable", () => {
      // Mock localStorage to throw an error
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error("localStorage unavailable");
      });

      const result = getLastUsedAuthMethod();

      expect(result).toBeNull();
    });
  });

  describe("clearLastUsedAuthMethod", () => {
    it("should remove stored auth method", () => {
      // First store a method
      localStorageMock.setItem("langfuse_last_used_auth_method", "google");

      clearLastUsedAuthMethod();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "langfuse_last_used_auth_method"
      );
    });

    it("should not throw when localStorage is unavailable", () => {
      // Mock localStorage to throw an error
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error("localStorage unavailable");
      });

      expect(() => clearLastUsedAuthMethod()).not.toThrow();
    });
  });

  describe("integration", () => {
    it("should store and retrieve auth method correctly", () => {
      const method: AuthMethod = "azure-ad";

      storeLastUsedAuthMethod(method);
      const retrieved = getLastUsedAuthMethod();

      expect(retrieved).toBe(method);
    });

    it("should clear stored auth method correctly", () => {
      const method: AuthMethod = "okta";

      storeLastUsedAuthMethod(method);
      expect(getLastUsedAuthMethod()).toBe(method);

      clearLastUsedAuthMethod();
      expect(getLastUsedAuthMethod()).toBeNull();
    });
  });
});