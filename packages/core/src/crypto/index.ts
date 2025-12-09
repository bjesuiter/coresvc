import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { err, ok, Result } from "neverthrow";

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Cryptographic constants for AES-256-GCM encryption
 */
const ALGORITHM = "aes-256-gcm" as const;
const KEY_LENGTH = 32; // 32 bytes for AES-256
const IV_LENGTH = 12; // 12 bytes recommended for GCM
const TAG_LENGTH = 16; // 16 bytes for GCM authentication tag

/**
 * Maximum allowed plaintext size in bytes (64KB)
 * Suitable for API keys and metadata while preventing DoS attacks
 */
const MAX_PLAINTEXT_SIZE = 64 * 1024; // 64KB

/**
 * Gets the encryption key from environment variables
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }
  return key;
}

/**
 * Validates that encrypted data contains valid base64 strings with correct lengths
 * @param data - The encrypted data to validate
 * @returns Result with void on success or error on validation failure
 */
function validateEncryptedData(data: EncryptedData): Result<void, Error> {
  try {
    // Validate IV length
    const ivBuffer = Buffer.from(data.iv, "base64");
    if (ivBuffer.length !== IV_LENGTH) {
      return err(
        new Error(
          `Invalid IV length: expected ${IV_LENGTH} bytes, got ${ivBuffer.length}`,
        ),
      );
    }

    // Validate tag length
    const tagBuffer = Buffer.from(data.tag, "base64");
    if (tagBuffer.length !== TAG_LENGTH) {
      return err(
        new Error(
          `Invalid authentication tag length: expected ${TAG_LENGTH} bytes, got ${tagBuffer.length}`,
        ),
      );
    }

    // Validate ciphertext is valid base64 (will throw if invalid)
    Buffer.from(data.ciphertext, "base64");

    return ok(undefined);
  } catch (error) {
    return err(
      new Error(
        `Invalid encrypted data format: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
}

/**
 * Encrypts plaintext using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @param key - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns Result with encrypted data (ciphertext + iv + tag) or error
 */
export function encrypt(
  plaintext: string,
  key?: string,
): Result<EncryptedData, Error> {
  // Validate plaintext size to prevent DoS attacks
  const plaintextSize = Buffer.byteLength(plaintext, "utf8");
  if (plaintextSize > MAX_PLAINTEXT_SIZE) {
    return err(
      new Error(
        `Plaintext exceeds maximum allowed size of ${MAX_PLAINTEXT_SIZE} bytes (got ${plaintextSize} bytes)`,
      ),
    );
  }

  const encryptionKey = key || getEncryptionKey();

  // Validate key length
  const keyBuffer = Buffer.from(encryptionKey, "base64");
  if (keyBuffer.length !== KEY_LENGTH) {
    keyBuffer.fill(0); // Clean up key buffer even on error
    return err(
      new Error(
        `Encryption key must be ${KEY_LENGTH} bytes (base64 encoded)`,
      ),
    );
  }

  try {
    // Generate random IV
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

    // Encrypt the data
    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    // Get the authentication tag
    const tag = cipher.getAuthTag();

    return ok({
      ciphertext,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  } finally {
    // Always zero out the key buffer to prevent key material from remaining in memory
    keyBuffer.fill(0);
  }
}

/**
 * Decrypts ciphertext using AES-256-GCM
 * @param encryptedData - The encrypted data object
 * @param key - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns Result with decrypted plaintext or error
 */
export function decrypt(
  encryptedData: EncryptedData,
  key?: string,
): Result<string, Error> {
  // Validate encrypted data format before attempting decryption
  const validationResult = validateEncryptedData(encryptedData);
  if (validationResult.isErr()) {
    return err(validationResult.error);
  }

  const encryptionKey = key || getEncryptionKey();

  // Validate key length
  const keyBuffer = Buffer.from(encryptionKey, "base64");
  if (keyBuffer.length !== KEY_LENGTH) {
    keyBuffer.fill(0); // Clean up key buffer even on error
    return err(
      new Error(
        `Encryption key must be ${KEY_LENGTH} bytes (base64 encoded)`,
      ),
    );
  }

  try {
    // Create decipher
    const decipher = createDecipheriv(
      ALGORITHM,
      keyBuffer,
      Buffer.from(encryptedData.iv, "base64"),
    );

    // Set the authentication tag
    // Note: GCM mode's setAuthTag + final() performs timing-safe tag verification internally
    decipher.setAuthTag(Buffer.from(encryptedData.tag, "base64"));

    // Decrypt the data
    let plaintext = decipher.update(encryptedData.ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");

    return ok(plaintext);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  } finally {
    // Always zero out the key buffer to prevent key material from remaining in memory
    keyBuffer.fill(0);
  }
}

/**
 * Encrypts a JSON object using AES-256-GCM
 * @param data - The object to encrypt (must be JSON-serializable)
 * @param key - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns Result with encrypted data or error
 *
 * TODO: Research: how to best type data as "JSON-serializable"?
 */
export function encryptJson(
  data: unknown,
  key?: string,
): Result<EncryptedData, Error> {
  try {
    const jsonString = JSON.stringify(data);
    return encrypt(jsonString, key);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Decrypts a JSON object using AES-256-GCM
 * @param encryptedData - The encrypted data object
 * @param key - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns Result with parsed JSON object or error
 * @remarks The type parameter T defaults to unknown for type safety.
 * Callers should provide an explicit type and validate the result.
 *
 * TODO: Research: how to best type data as "JSON-serializable"?
 */
export function decryptJson<T = unknown>(
  encryptedData: EncryptedData,
  key?: string,
): Result<T, Error> {
  try {
    const plaintextResult = decrypt(encryptedData, key);
    if (plaintextResult.isErr()) {
      return err(plaintextResult.error);
    }

    const parsed = JSON.parse(plaintextResult.value) as T;
    return ok(parsed);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Generates a cryptographically secure key and returns it as base64
 * This can be used to generate the ENCRYPTION_KEY environment variable
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64");
}
