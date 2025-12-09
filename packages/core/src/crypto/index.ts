import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { err, ok, Result } from "neverthrow";

/**
 * Represents encrypted data with all components needed for AES-256-GCM decryption
 * 
 * @interface EncryptedData
 * @property {string} ciphertext - Base64-encoded encrypted data
 * @property {string} iv - Base64-encoded initialization vector (12 bytes)
 * @property {string} tag - Base64-encoded authentication tag (16 bytes)
 * 
 * @example
 * ```typescript
 * const encrypted: EncryptedData = {
 *   ciphertext: "encryptedDataHere...",
 *   iv: "base64IVHere...",
 *   tag: "base64TagHere..."
 * };
 * ```
 */
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
 * 
 * @private
 * @throws {Error} When ENCRYPTION_KEY environment variable is not set
 * @returns {string} Base64-encoded encryption key
 * 
 * @remarks
 * This function throws instead of returning a Result because it's used internally
 * and key availability should fail fast during application startup.
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
 * 
 * @private
 * @param {EncryptedData} data - The encrypted data to validate
 * @returns {Result<void, Error>} Result with void on success or error on validation failure
 * 
 * @errors
 * - "Invalid IV length: expected 12 bytes, got X" - IV has incorrect length
 * - "Invalid authentication tag length: expected 16 bytes, got X" - Tag has incorrect length  
 * - "Invalid encrypted data format: ..." - Ciphertext is not valid base64
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
 * 
 * @param {string} plaintext - The data to encrypt (UTF-8 encoded)
 * @param {string} [key] - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns {Result<EncryptedData, Error>} Result with encrypted data (ciphertext + iv + tag) or error
 * 
 * @example
 * ```typescript
 * const result = encrypt("Hello, World!", "base64KeyHere...");
 * if (result.isOk()) {
 *   console.log("Encrypted:", result.value.ciphertext);
 *   console.log("IV:", result.value.iv);
 *   console.log("Tag:", result.value.tag);
 * } else {
 *   console.error("Encryption failed:", result.error.message);
 * }
 * ```
 * 
 * @errors
 * - "Plaintext exceeds maximum allowed size of 65536 bytes (got X bytes)" - Data too large
 * - "Encryption key must be 32 bytes (base64 encoded)" - Invalid key length
 * - "ENCRYPTION_KEY environment variable is required" - No key provided and no env var
 * 
 * @remarks
 * - Uses AES-256-GCM for authenticated encryption
 * - Generates a unique 12-byte IV for each encryption
 * - Key material is securely zeroed from memory after use
 * - Maximum plaintext size is 64KB to prevent DoS attacks
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
 * 
 * @param {EncryptedData} encryptedData - The encrypted data object with ciphertext, iv, and tag
 * @param {string} [key] - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns {Result<string, Error>} Result with decrypted plaintext or error
 * 
 * @example
 * ```typescript
 * const encrypted: EncryptedData = {
 *   ciphertext: "encryptedDataHere...",
 *   iv: "base64IVHere...",
 *   tag: "base64TagHere..."
 * };
 * 
 * const result = decrypt(encrypted, "base64KeyHere...");
 * if (result.isOk()) {
 *   console.log("Decrypted:", result.value);
 * } else {
 *   console.error("Decryption failed:", result.error.message);
 * }
 * ```
 * 
 * @errors
 * - "Invalid IV length: expected 12 bytes, got X" - IV has incorrect length
 * - "Invalid authentication tag length: expected 16 bytes, got X" - Tag has incorrect length
 * - "Invalid encrypted data format: ..." - Ciphertext is not valid base64
 * - "Encryption key must be 32 bytes (base64 encoded)" - Invalid key length
 * - "ENCRYPTION_KEY environment variable is required" - No key provided and no env var
 * - Authentication errors from GCM mode if data is tampered
 * 
 * @remarks
 * - GCM mode provides authenticated encryption with associated data (AEAD)
 * - Authentication tag verification is timing-safe (handled internally by Node.js)
 * - Key material is securely zeroed from memory after use
 * - Will fail if ciphertext, IV, or tag have been tampered with
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
 * 
 * @param {unknown} data - The object to encrypt (must be JSON-serializable)
 * @param {string} [key] - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns {Result<EncryptedData, Error>} Result with encrypted data or error
 * 
 * @example
 * ```typescript
 * const userData = {
 *   id: 123,
 *   name: "John Doe",
 *   permissions: ["read", "write"]
 * };
 * 
 * const result = encryptJson(userData, "base64KeyHere...");
 * if (result.isOk()) {
 *   console.log("Encrypted JSON:", result.value.ciphertext);
 * } else {
 *   console.error("Encryption failed:", result.error.message);
 * }
 * ```
 * 
 * @errors
 * - "Plaintext exceeds maximum allowed size of 65536 bytes (got X bytes)" - Data too large
 * - "Encryption key must be 32 bytes (base64 encoded)" - Invalid key length
 * - "ENCRYPTION_KEY environment variable is required" - No key provided and no env var
 * - JSON serialization errors (e.g., circular references)
 * 
 * @remarks
 * - Uses JSON.stringify() internally - data must be JSON-serializable
 * - All encryption security features from encrypt() apply
 * - Consider the 64KB size limit when encrypting large objects
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
 * 
 * @template T - The expected type of the decrypted data (defaults to unknown)
 * @param {EncryptedData} encryptedData - The encrypted data object
 * @param {string} [key] - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns {Result<T, Error>} Result with parsed JSON object or error
 * 
 * @example
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 *   permissions: string[];
 * }
 * 
 * const result = decryptJson<User>(encryptedData, "base64KeyHere...");
 * if (result.isOk()) {
 *   console.log("User ID:", result.value.id);
 *   console.log("Name:", result.value.name);
 *   // TypeScript knows result.value is of type User
 * } else {
 *   console.error("Decryption failed:", result.error.message);
 * }
 * ```
 * 
 * @errors
 * - All errors from decrypt() function (invalid data format, wrong key, etc.)
 * - JSON parsing errors (malformed JSON)
 * 
 * @remarks
 * - The type parameter T defaults to unknown for type safety
 * - Callers should provide an explicit type and validate the result
 * - Consider using a schema validation library for runtime type checking
 * - All decryption security features from decrypt() apply
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
 * 
 * @returns {string} Base64-encoded 32-byte encryption key
 * 
 * @example
 * ```typescript
 * const key = generateEncryptionKey();
 * console.log("Generated key:", key);
 * // Store this securely as ENCRYPTION_KEY environment variable
 * 
 * // Use the key for encryption
 * const encrypted = encrypt("secret data", key);
 * ```
 * 
 * @remarks
 * - Uses cryptographically secure random number generation
 * - Generates exactly 32 bytes (256 bits) for AES-256
 * - Returns base64-encoded string for easy storage and environment variable usage
 * - Store the generated key securely (e.g., in environment variables, not in code)
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64");
}
