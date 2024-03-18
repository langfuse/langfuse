"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShaHash = exports.verifySecretKey = exports.generateKeySet = exports.hashSecretKey = exports.getDisplaySecretKey = exports.generatePublicKey = exports.generateSecretKey = void 0;
const bcryptjs_1 = require("bcryptjs");
const crypto_1 = require("crypto");
const crypto = __importStar(require("crypto"));
function generateSecretKey() {
    return `sk-lf-${(0, crypto_1.randomUUID)()}`;
}
exports.generateSecretKey = generateSecretKey;
function generatePublicKey() {
    return `pk-lf-${(0, crypto_1.randomUUID)()}`;
}
exports.generatePublicKey = generatePublicKey;
function getDisplaySecretKey(secretKey) {
    return secretKey.slice(0, 6) + "..." + secretKey.slice(-4);
}
exports.getDisplaySecretKey = getDisplaySecretKey;
async function hashSecretKey(key) {
    const hashedKey = await (0, bcryptjs_1.hash)(key, 11);
    return hashedKey;
}
exports.hashSecretKey = hashSecretKey;
async function generateKeySet() {
    const pk = generatePublicKey();
    const sk = generateSecretKey();
    const hashedSk = await hashSecretKey(sk);
    const displaySk = getDisplaySecretKey(sk);
    return {
        pk,
        sk,
        hashedSk,
        displaySk,
    };
}
exports.generateKeySet = generateKeySet;
async function verifySecretKey(key, hashedKey) {
    const isValid = await (0, bcryptjs_1.compare)(key, hashedKey);
    return isValid;
}
exports.verifySecretKey = verifySecretKey;
function createShaHash(privateKey, salt) {
    const hash = crypto
        .createHash("sha256")
        .update(privateKey)
        .update(crypto.createHash("sha256").update(salt, "utf8").digest("hex"))
        .digest("hex");
    return hash;
}
exports.createShaHash = createShaHash;
