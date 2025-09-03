/**
 * @jest-environment jsdom
 */

import {
  saveLastUsedLogin,
  getLastUsedLogins,
  getLastUsedLoginForEmail,
  clearLastUsedLogins,
  getProviderDisplayName,
  getProviderIcon,
} from "../lib/lastUsedLogin";

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('lastUsedLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('saveLastUsedLogin', () => {
    it('should save login data to localStorage', () => {
      const loginData = {
        provider: 'google',
        email: 'test@example.com',
        providerName: 'Google',
        providerIcon: 'SiGoogle',
      };

      saveLastUsedLogin(loginData);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'langfuse_last_used_login',
        expect.stringContaining('"provider":"google"')
      );
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => saveLastUsedLogin({
        provider: 'google',
        email: 'test@example.com',
        providerName: 'Google',
        providerIcon: 'SiGoogle',
      })).not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getLastUsedLogins', () => {
    it('should return empty array when no data exists', () => {
      const result = getLastUsedLogins();
      expect(result).toEqual([]);
    });

    it('should parse and return stored login data', () => {
      const mockData = [{
        provider: 'google',
        email: 'test@example.com',
        providerName: 'Google',
        providerIcon: 'SiGoogle',
        timestamp: Date.now() - 1000,
      }];

      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = getLastUsedLogins();
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('google');
    });

    it('should filter out expired entries', () => {
      const oldTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      const mockData = [{
        provider: 'google',
        email: 'test@example.com',
        providerName: 'Google',
        providerIcon: 'SiGoogle',
        timestamp: oldTimestamp,
      }];

      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = getLastUsedLogins();
      expect(result).toEqual([]);
    });

    it('should handle corrupted data gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const result = getLastUsedLogins();
      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('getLastUsedLoginForEmail', () => {
    it('should return login data for specific email', () => {
      const mockData = [
        {
          provider: 'google',
          email: 'user1@example.com',
          providerName: 'Google',
          providerIcon: 'SiGoogle',
          timestamp: Date.now(),
        },
        {
          provider: 'github',
          email: 'user2@example.com',
          providerName: 'GitHub',
          providerIcon: 'SiGithub',
          timestamp: Date.now(),
        },
      ];

      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = getLastUsedLoginForEmail('user1@example.com');
      expect(result?.provider).toBe('google');
    });

    it('should be case insensitive', () => {
      const mockData = [{
        provider: 'google',
        email: 'User@Example.Com',
        providerName: 'Google',
        providerIcon: 'SiGoogle',
        timestamp: Date.now(),
      }];

      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = getLastUsedLoginForEmail('user@example.com');
      expect(result?.provider).toBe('google');
    });
  });

  describe('clearLastUsedLogins', () => {
    it('should remove data from localStorage', () => {
      clearLastUsedLogins();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('langfuse_last_used_login');
    });
  });

  describe('getProviderDisplayName', () => {
    it('should return correct display names for known providers', () => {
      expect(getProviderDisplayName('google')).toBe('Google');
      expect(getProviderDisplayName('github')).toBe('GitHub');
      expect(getProviderDisplayName('azure-ad')).toBe('Azure AD');
      expect(getProviderDisplayName('credentials')).toBe('Email/Password');
    });

    it('should handle multi-tenant SSO providers', () => {
      expect(getProviderDisplayName('example.com.google')).toBe('Google');
      expect(getProviderDisplayName('company.okta')).toBe('Okta');
    });

    it('should return the provider name as fallback', () => {
      expect(getProviderDisplayName('unknown-provider')).toBe('unknown-provider');
    });
  });

  describe('getProviderIcon', () => {
    it('should return correct icon names for known providers', () => {
      expect(getProviderIcon('google')).toBe('SiGoogle');
      expect(getProviderIcon('github')).toBe('SiGithub');
      expect(getProviderIcon('azure-ad')).toBe('TbBrandAzure');
      expect(getProviderIcon('credentials')).toBe('AtSign');
    });

    it('should handle multi-tenant SSO providers', () => {
      expect(getProviderIcon('example.com.google')).toBe('SiGoogle');
      expect(getProviderIcon('company.okta')).toBe('SiOkta');
    });

    it('should return default icon for unknown providers', () => {
      expect(getProviderIcon('unknown-provider')).toBe('TbBrandOauth');
    });
  });
});