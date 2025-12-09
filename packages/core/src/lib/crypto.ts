import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { err, ok, Result } from "neverthrow";
import type {
  DecryptErrorUnion,
  DecryptJsonErrorUnion,
  EncryptedDataValidationError,
  EncryptErrorUnion,
  EncryptJsonErrorUnion,
} from "./crypto.errors";
import {
  DecryptionFailedError,
  EncryptionFailedError,
  InvalidAuthTagLengthError,
  InvalidBase64FormatError,
  InvalidIvLengthError,
  InvalidKeyLengthError,
  JsonParseFailedError,
  JsonSerializationFailedError,
  MissingEncryptionKeyError,
  PlaintextTooLargeError,
} from "./crypto.errors";

/**
 * Represents encrypted data with all components needed for AES-256-GCM decryption
 *
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
 * @returns {Result<string, MissingEncryptionKeyError>} Result with base64-encoded encryption key or error
 */
function getEncryptionKey(): Result<string, MissingEncryptionKeyError> {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    return err(new MissingEncryptionKeyError());
  }
  return ok(key);
}

/**
 * Validates that encrypted data contains valid base64 strings with correct lengths
 *
 * @private
 * @param {EncryptedData} data - The encrypted data to validate
 * @returns {Result<void, ValidationError>} Result with void on success or error on validation failure
 *
 * @errors
 * - InvalidIvLengthError - IV has incorrect length
 * - InvalidAuthTagLengthError - Tag has incorrect length
 * - InvalidBase64FormatError - Ciphertext is not valid base64
 */
function validateEncryptedData(
  data: EncryptedData,
): Result<void, EncryptedDataValidationError> {
  // Validate IV - check base64 format first
  let ivBuffer: Buffer;
  try {
    ivBuffer = Buffer.from(data.iv, "base64");
  } catch (error) {
    return err(
      new InvalidBase64FormatError(
        "iv",
        error instanceof Error ? error : undefined,
      ),
    );
  }
  if (ivBuffer.length !== IV_LENGTH) {
    return err(new InvalidIvLengthError(IV_LENGTH, ivBuffer.length));
  }

  // Validate tag - check base64 format first
  let tagBuffer: Buffer;
  try {
    tagBuffer = Buffer.from(data.tag, "base64");
  } catch (error) {
    return err(
      new InvalidBase64FormatError(
        "tag",
        error instanceof Error ? error : undefined,
      ),
    );
  }
  if (tagBuffer.length !== TAG_LENGTH) {
    return err(new InvalidAuthTagLengthError(TAG_LENGTH, tagBuffer.length));
  }

  // Validate ciphertext is valid base64
  try {
    Buffer.from(data.ciphertext, "base64");
  } catch (error) {
    return err(
      new InvalidBase64FormatError(
        "ciphertext",
        error instanceof Error ? error : undefined,
      ),
    );
  }

  return ok(undefined);
}

/**
 * Encrypts plaintext using AES-256-GCM
 *
 * @param {string} plaintext - The data to encrypt (UTF-8 encoded)
 * @param {string} [key] - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns {Result<EncryptedData, EncryptErrorUnion>} Result with encrypted data (ciphertext + iv + tag) or error
 *
 * @example
 * ```typescript
 * const result = encrypt("Hello, World!", "base64KeyHere...");
 * if (result.isOk()) {
 *   console.log("Encrypted:", result.value.ciphertext);
 *   console.log("IV:", result.value.iv);
 *   console.log("Tag:", result.value.tag);
 * } else {
 *   switch (result.error.type) {
 *     case 'PLAINTEXT_TOO_LARGE':
 *       console.error(`Data too large: ${result.error.actualSize} > ${result.error.maxSize}`);
 *       break;
 *     case 'INVALID_KEY_LENGTH':
 *       console.error(`Key must be ${result.error.expectedLength} bytes`);
 *       break;
 *     // ... handle other cases
 *   }
 * }
 * ```
 *
 * @errors
 * - PlaintextTooLargeError - Data exceeds maximum allowed size (64KB)
 * - InvalidKeyLengthError - Key is not 32 bytes
 * - MissingEncryptionKeyError - No key provided and ENCRYPTION_KEY env var not set
 * - EncryptionFailedError - Unexpected encryption failure
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
): Result<EncryptedData, EncryptErrorUnion> {
  // Validate plaintext size to prevent DoS attacks
  const plaintextSize = Buffer.byteLength(plaintext, "utf8");
  if (plaintextSize > MAX_PLAINTEXT_SIZE) {
    return err(new PlaintextTooLargeError(MAX_PLAINTEXT_SIZE, plaintextSize));
  }

  let encryptionKey: string;
  if (key) {
    encryptionKey = key;
  } else {
    const keyResult = getEncryptionKey();
    if (keyResult.isErr()) {
      return err(keyResult.error);
    }
    encryptionKey = keyResult.value;
  }

  // Validate key length
  const keyBuffer = Buffer.from(encryptionKey, "base64");
  if (keyBuffer.length !== KEY_LENGTH) {
    keyBuffer.fill(0); // Clean up key buffer even on error
    return err(new InvalidKeyLengthError(KEY_LENGTH, keyBuffer.length));
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
    return err(
      new EncryptionFailedError(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
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
 * @returns {Result<string, DecryptErrorUnion>} Result with decrypted plaintext or error
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
 *   switch (result.error.type) {
 *     case 'INVALID_IV_LENGTH':
 *       console.error(`IV must be ${result.error.expectedLength} bytes`);
 *       break;
 *     case 'DECRYPTION_FAILED':
 *       console.error(`Decryption failed: ${result.error.cause.message}`);
 *       break;
 *     // ... handle other cases
 *   }
 * }
 * ```
 *
 * @errors
 * - InvalidIvLengthError - IV has incorrect length
 * - InvalidAuthTagLengthError - Tag has incorrect length
 * - InvalidBase64FormatError - Ciphertext, IV, or tag is not valid base64
 * - InvalidKeyLengthError - Key is not 32 bytes
 * - MissingEncryptionKeyError - No key provided and ENCRYPTION_KEY env var not set
 * - DecryptionFailedError - Decryption failed (wrong key, tampered data, etc.)
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
): Result<string, DecryptErrorUnion> {
  // Validate encrypted data format before attempting decryption
  const validationResult = validateEncryptedData(encryptedData);
  if (validationResult.isErr()) {
    return err(validationResult.error);
  }

  let encryptionKey: string;
  if (key) {
    encryptionKey = key;
  } else {
    const keyResult = getEncryptionKey();
    if (keyResult.isErr()) {
      return err(keyResult.error);
    }
    encryptionKey = keyResult.value;
  }

  // Validate key length
  const keyBuffer = Buffer.from(encryptionKey, "base64");
  if (keyBuffer.length !== KEY_LENGTH) {
    keyBuffer.fill(0); // Clean up key buffer even on error
    return err(new InvalidKeyLengthError(KEY_LENGTH, keyBuffer.length));
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
    return err(
      new DecryptionFailedError(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
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
 * @returns {Result<EncryptedData, EncryptJsonErrorUnion>} Result with encrypted data or error
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
 *   switch (result.error.type) {
 *     case 'JSON_SERIALIZATION_FAILED':
 *       console.error(`Cannot serialize: ${result.error.cause.message}`);
 *       break;
 *     // ... handle other encryption errors
 *   }
 * }
 * ```
 *
 * @errors
 * - JsonSerializationFailedError - Data cannot be serialized (circular references, BigInt, etc.)
 * - PlaintextTooLargeError - Serialized JSON exceeds maximum allowed size (64KB)
 * - InvalidKeyLengthError - Key is not 32 bytes
 * - MissingEncryptionKeyError - No key provided and ENCRYPTION_KEY env var not set
 * - EncryptionFailedError - Unexpected encryption failure
 *
 * @remarks
 * - Uses JSON.stringify() internally - data must be JSON-serializable
 * - All encryption security features from encrypt() apply
 * - Consider the 64KB size limit when encrypting large objects
 *
 * @see {@link encrypt} for underlying encryption details
 */
export function encryptJson(
  data: unknown,
  key?: string,
): Result<EncryptedData, EncryptJsonErrorUnion> {
  let jsonString: string;
  try {
    jsonString = JSON.stringify(data);
  } catch (error) {
    return err(
      new JsonSerializationFailedError(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  }
  return encrypt(jsonString, key);
}

/**
 * Decrypts a JSON object using AES-256-GCM
 *
 * @template T - The expected type of the decrypted data (defaults to unknown)
 * @param {EncryptedData} encryptedData - The encrypted data object
 * @param {string} [key] - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns {Result<T, DecryptJsonErrorUnion>} Result with parsed JSON object or error
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
 *   switch (result.error.type) {
 *     case 'JSON_PARSE_FAILED':
 *       console.error(`Invalid JSON: ${result.error.cause.message}`);
 *       break;
 *     case 'DECRYPTION_FAILED':
 *       console.error(`Decryption failed: ${result.error.cause.message}`);
 *       break;
 *     // ... handle other cases
 *   }
 * }
 * ```
 *
 * @errors
 * - All errors from decrypt() function (invalid data format, wrong key, etc.)
 * - JsonParseFailedError - Decrypted data is not valid JSON
 *
 * @remarks
 * - The type parameter T defaults to unknown for type safety
 * - Callers should provide an explicit type and validate the result
 * - Consider using a schema validation library for runtime type checking
 * - All decryption security features from decrypt() apply
 *
 * @see {@link decrypt} for underlying decryption details
 */
export function decryptJson<T = unknown>(
  encryptedData: EncryptedData,
  key?: string,
): Result<T, DecryptJsonErrorUnion> {
  const plaintextResult = decrypt(encryptedData, key);
  if (plaintextResult.isErr()) {
    return err(plaintextResult.error);
  }

  try {
    const parsed = JSON.parse(plaintextResult.value) as T;
    return ok(parsed);
  } catch (error) {
    return err(
      new JsonParseFailedError(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
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
