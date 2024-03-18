export declare function generateSecretKey(): string;
export declare function generatePublicKey(): string;
export declare function getDisplaySecretKey(secretKey: string): string;
export declare function hashSecretKey(key: string): Promise<string>;
export declare function generateKeySet(): Promise<{
    pk: string;
    sk: string;
    hashedSk: string;
    displaySk: string;
}>;
export declare function verifySecretKey(key: string, hashedKey: string): Promise<boolean>;
export declare function createShaHash(privateKey: string, salt: string): string;
