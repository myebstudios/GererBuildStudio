import { describe, it, expect } from "vitest";
import {
  encryptProviderSecrets,
  decryptProviderSecrets,
  encryptInstanceConfig,
  decryptInstanceConfig,
  isEncryptedPayload,
  deriveKey,
  deriveKeyAsync,
} from "./syncEncryption.js";

describe("syncEncryption module", () => {
  const testPassphrase = "my-secure-sync-passphrase-2026";
  const testSecrets = {
    xai: "xai-secret-api-key-12345",
    composio: "ak_live_890abcdef",
    trello: "trello-secret-token-xyz",
  };
  const testDriverConfig = {
    cli: "claude",
    permissionMode: "bypassPermissions",
    timeoutMs: 30000,
    nested: {
      authSecret: "super-secret-token",
    },
  };

  it("derives consistent keys synchronously and asynchronously for identical passphrase and salt", async () => {
    const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
    const syncKey = deriveKey(testPassphrase, salt, 1000);
    const asyncKey = await deriveKeyAsync(testPassphrase, salt, 1000);

    expect(syncKey.toString("hex")).toEqual(asyncKey.toString("hex"));
    expect(syncKey.length).toBe(32); // 256 bits
  });

  it("throws error when deriving key with empty passphrase", () => {
    const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
    expect(() => deriveKey("", salt)).toThrow("Passphrase cannot be empty");
    expect(() => deriveKey("   ", salt)).toThrow("Passphrase cannot be empty");
  });

  it("encrypts and decrypts provider secrets correctly", () => {
    const encrypted = encryptProviderSecrets(testSecrets, testPassphrase);

    expect(isEncryptedPayload(encrypted)).toBe(true);
    expect(encrypted.version).toBe(1);
    expect(encrypted.algorithm).toBe("AES-256-GCM");
    expect(encrypted.kdf).toBe("PBKDF2-HMAC-SHA256");
    expect(encrypted.ciphertext).not.toContain("xai-secret-api-key");
    expect(encrypted.ciphertext).not.toContain("ak_live_890abcdef");

    const decrypted = decryptProviderSecrets(encrypted, testPassphrase);
    expect(decrypted).toEqual(testSecrets);
  });

  it("encrypts and decrypts complex instance configs correctly", () => {
    const encrypted = encryptInstanceConfig(testDriverConfig, testPassphrase);

    expect(isEncryptedPayload(encrypted)).toBe(true);
    expect(encrypted.ciphertext).not.toContain("super-secret-token");

    const decrypted = decryptInstanceConfig(encrypted, testPassphrase);
    expect(decrypted).toEqual(testDriverConfig);
  });

  it("fails to decrypt with incorrect passphrase", () => {
    const encrypted = encryptProviderSecrets(testSecrets, testPassphrase);
    const wrongPassphrase = "wrong-passphrase!";

    expect(() => decryptProviderSecrets(encrypted, wrongPassphrase)).toThrow(
      "Failed to decrypt secrets: Invalid passphrase or corrupted ciphertext"
    );
  });

  it("fails to decrypt corrupted ciphertext or auth tag", () => {
    const encrypted = encryptProviderSecrets(testSecrets, testPassphrase);
    
    // Tamper with ciphertext
    const corruptedPayload = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.replace(/^./, (c) => (c === "a" ? "b" : "a")),
    };

    expect(() => decryptProviderSecrets(corruptedPayload, testPassphrase)).toThrow(
      "Failed to decrypt secrets"
    );
  });

  it("verifies that no plaintext secrets leak into the payload object", () => {
    const encrypted = encryptProviderSecrets(testSecrets, testPassphrase);
    const serializedPayload = JSON.stringify(encrypted);

    for (const secretValue of Object.values(testSecrets)) {
      expect(serializedPayload).not.toContain(secretValue);
    }
  });

  it("uses random salt and IV for every encryption operation", () => {
    const enc1 = encryptProviderSecrets(testSecrets, testPassphrase);
    const enc2 = encryptProviderSecrets(testSecrets, testPassphrase);

    expect(enc1.salt).not.toEqual(enc2.salt);
    expect(enc1.iv).not.toEqual(enc2.iv);
    expect(enc1.ciphertext).not.toEqual(enc2.ciphertext);
  });
});
