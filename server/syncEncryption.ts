import crypto from "node:crypto";

/**
 * Version identifier for encrypted payload schema
 */
export const ENCRYPTION_VERSION = 1;

/**
 * Key derivation parameters
 */
export const DEFAULT_KDF_ITERATIONS = 100_000;
export const KEY_LENGTH_BYTES = 32; // 256 bits for AES-256
export const SALT_LENGTH_BYTES = 16; // 128-bit salt
export const IV_LENGTH_BYTES = 12;   // 96-bit nonce/IV for AES-GCM
export const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag

/**
 * Serialized structure stored in Convex for encrypted secrets & configs
 */
export interface EncryptedPayload {
  version: number;
  algorithm: "AES-256-GCM";
  kdf: "PBKDF2-HMAC-SHA256";
  iterations: number;
  salt: string;       // hex-encoded salt
  iv: string;         // hex-encoded initialization vector
  authTag: string;    // hex-encoded GCM authentication tag
  ciphertext: string; // hex-encoded encrypted JSON string
}

/**
 * Type guard to verify if an arbitrary object matches EncryptedPayload schema
 */
export function isEncryptedPayload(val: unknown): val is EncryptedPayload {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.version === "number" &&
    obj.algorithm === "AES-256-GCM" &&
    obj.kdf === "PBKDF2-HMAC-SHA256" &&
    typeof obj.iterations === "number" &&
    typeof obj.salt === "string" &&
    typeof obj.iv === "string" &&
    typeof obj.authTag === "string" &&
    typeof obj.ciphertext === "string"
  );
}

/**
 * Derive a 256-bit key from a user sync passphrase and salt using PBKDF2-HMAC-SHA256.
 */
export function deriveKey(
  passphrase: string,
  salt: Buffer,
  iterations = DEFAULT_KDF_ITERATIONS
): Buffer {
  if (!passphrase || passphrase.trim().length === 0) {
    throw new Error("Passphrase cannot be empty");
  }
  return crypto.pbkdf2Sync(
    passphrase,
    salt,
    iterations,
    KEY_LENGTH_BYTES,
    "sha256"
  );
}

/**
 * Async version of deriveKey using crypto.pbkdf2 for non-blocking operations if preferred
 */
export function deriveKeyAsync(
  passphrase: string,
  salt: Buffer,
  iterations = DEFAULT_KDF_ITERATIONS
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!passphrase || passphrase.trim().length === 0) {
      return reject(new Error("Passphrase cannot be empty"));
    }
    crypto.pbkdf2(
      passphrase,
      salt,
      iterations,
      KEY_LENGTH_BYTES,
      "sha256",
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/**
 * Encrypt any JSON-serializable data (secrets, driver configs) using AES-256-GCM
 * with a passphrase-derived key.
 */
export function encryptSecrets<T = Record<string, unknown>>(
  data: T,
  passphrase: string,
  iterations = DEFAULT_KDF_ITERATIONS
): EncryptedPayload {
  const jsonString = JSON.stringify(data);
  const salt = crypto.randomBytes(SALT_LENGTH_BYTES);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const key = deriveKey(passphrase, salt, iterations);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encryptedBuf = Buffer.concat([
    cipher.update(jsonString, "utf8"),
    cipher.final(),
  ]);
  const authTagBuf = cipher.getAuthTag();

  return {
    version: ENCRYPTION_VERSION,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-HMAC-SHA256",
    iterations,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTagBuf.toString("hex"),
    ciphertext: encryptedBuf.toString("hex"),
  };
}

/**
 * Decrypt an EncryptedPayload using the user's sync passphrase.
 * Throws an explicit error if the passphrase is incorrect or payload is corrupted.
 */
export function decryptSecrets<T = Record<string, unknown>>(
  payload: EncryptedPayload,
  passphrase: string
): T {
  if (!isEncryptedPayload(payload)) {
    throw new Error("Invalid encrypted payload format");
  }

  if (payload.version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption payload version: ${payload.version}`);
  }

  const salt = Buffer.from(payload.salt, "hex");
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");

  const key = deriveKey(passphrase, salt, payload.iterations);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decryptedBuf = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    const jsonString = decryptedBuf.toString("utf8");
    return JSON.parse(jsonString) as T;
  } catch (err) {
    throw new Error(
      "Failed to decrypt secrets: Invalid passphrase or corrupted ciphertext",
      { cause: err }
    );
  }
}

/**
 * Specific helper for provider secrets map (e.g. { xai: "sk-...", composio: "ak-..." })
 */
export function encryptProviderSecrets(
  secrets: Record<string, string>,
  passphrase: string
): EncryptedPayload {
  return encryptSecrets(secrets, passphrase);
}

/**
 * Specific helper for decrypting provider secrets map
 */
export function decryptProviderSecrets(
  payload: EncryptedPayload,
  passphrase: string
): Record<string, string> {
  return decryptSecrets<Record<string, string>>(payload, passphrase);
}

/**
 * Specific helper for instance driver config object
 */
export function encryptInstanceConfig(
  config: Record<string, unknown>,
  passphrase: string
): EncryptedPayload {
  return encryptSecrets(config, passphrase);
}

/**
 * Specific helper for decrypting instance driver config object
 */
export function decryptInstanceConfig(
  payload: EncryptedPayload,
  passphrase: string
): Record<string, unknown> {
  return decryptSecrets<Record<string, unknown>>(payload, passphrase);
}
