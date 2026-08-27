export interface ManagedAccessToken {
  token: string;
  expiresOnTimestamp: number;
}

export interface ManagedCredentialProvider {
  readonly name: string;
  readonly username?: string;
  fetchToken(): Promise<ManagedAccessToken>;
}
