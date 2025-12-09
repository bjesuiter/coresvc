/**
 * Crypto Error Types
 *
 * Discriminated union type for all crypto-related errors.
 * Use the `type` property to narrow error types in switch statements.
 */
export type CryptoErrorType =
  | "PLAINTEXT_TOO_LARGE"
  | "INVALID_KEY_LENGTH"
  | "MISSING_ENCRYPTION_KEY"
  | "INVALID_IV_LENGTH"
  | "INVALID_AUTH_TAG_LENGTH"
  | "INVALID_BASE64_FORMAT"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "JSON_SERIALIZATION_FAILED"
  | "JSON_PARSE_FAILED";

/**
 * Base class for all crypto-related errors.
 *
 * Extends the native Error class and adds a discriminated `type` property
 * for type-safe error handling with neverthrow.
 *
 * @example
 * ```typescript
 * const result = encrypt(data);
 * if (result.isErr()) {
 *   switch (result.error.type) {
 *     case 'PLAINTEXT_TOO_LARGE':
 *       console.log(`Max size: ${result.error.maxSize}`);
 *       break;
 *     case 'INVALID_KEY_LENGTH':
 *       console.log(`Expected: ${result.error.expectedLength}`);
 *       break;
 *   }
 * }
 * ```
 */
export abstract class CryptoError extends Error {
  abstract readonly type: CryptoErrorType;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for where error was thrown (V8 engines)
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error thrown when plaintext exceeds the maximum allowed size.
 *
 * @remarks
 * The maximum size limit (64KB) prevents DoS attacks and ensures
 * reasonable memory usage during encryption operations.
 */
export class PlaintextTooLargeError extends CryptoError {
  readonly type = "PLAINTEXT_TOO_LARGE" as const;

  constructor(
    public readonly maxSize: number,
    public readonly actualSize: number,
  ) {
    super(
      `Plaintext exceeds maximum allowed size of ${maxSize} bytes (got ${actualSize} bytes)`,
    );
  }
}

/**
 * Error thrown when the encryption key has an invalid length.
 *
 * @remarks
 * AES-256 requires exactly 32 bytes (256 bits) for the key.
 * The key should be base64-encoded when passed to encrypt/decrypt functions.
 */
export class InvalidKeyLengthError extends CryptoError {
  readonly type = "INVALID_KEY_LENGTH" as const;

  constructor(
    public readonly expectedLength: number,
    public readonly actualLength: number,
  ) {
    super(
      `Encryption key must be ${expectedLength} bytes (base64 encoded), got ${actualLength} bytes`,
    );
  }
}

/**
 * Error thrown when the ENCRYPTION_KEY environment variable is not set.
 *
 * @remarks
 * This error occurs when no key is provided to encrypt/decrypt functions
 * and the ENCRYPTION_KEY environment variable is not configured.
 */
export class MissingEncryptionKeyError extends CryptoError {
  readonly type = "MISSING_ENCRYPTION_KEY" as const;

  constructor() {
    super("ENCRYPTION_KEY environment variable is required");
  }
}

/**
 * Error thrown when the initialization vector (IV) has an invalid length.
 *
 * @remarks
 * AES-256-GCM requires exactly 12 bytes for the IV.
 * The IV should be base64-encoded in the EncryptedData object.
 */
export class InvalidIvLengthError extends CryptoError {
  readonly type = "INVALID_IV_LENGTH" as const;

  constructor(
    public readonly expectedLength: number,
    public readonly actualLength: number,
  ) {
    super(
      `Invalid IV length: expected ${expectedLength} bytes, got ${actualLength} bytes`,
    );
  }
}

/**
 * Error thrown when the authentication tag has an invalid length.
 *
 * @remarks
 * AES-256-GCM requires exactly 16 bytes for the authentication tag.
 * The tag should be base64-encoded in the EncryptedData object.
 */
export class InvalidAuthTagLengthError extends CryptoError {
  readonly type = "INVALID_AUTH_TAG_LENGTH" as const;

  constructor(
    public readonly expectedLength: number,
    public readonly actualLength: number,
  ) {
    super(
      `Invalid authentication tag length: expected ${expectedLength} bytes, got ${actualLength} bytes`,
    );
  }
}

/**
 * Error thrown when a field in EncryptedData contains invalid base64.
 *
 * @remarks
 * All fields in EncryptedData (ciphertext, iv, tag) must be valid base64 strings.
 */
export class InvalidBase64FormatError extends CryptoError {
  readonly type = "INVALID_BASE64_FORMAT" as const;

  constructor(
    public readonly field: "ciphertext" | "iv" | "tag",
    public readonly cause?: Error,
  ) {
    super(
      `Invalid base64 format in ${field}${cause ? `: ${cause.message}` : ""}`,
    );
  }
}

/**
 * Error thrown when the encryption operation fails.
 *
 * @remarks
 * This is a wrapper for unexpected errors during the encryption process.
 * The original error is preserved in the `cause` property.
 */
export class EncryptionFailedError extends CryptoError {
  readonly type = "ENCRYPTION_FAILED" as const;

  constructor(public readonly cause: Error) {
    super(`Encryption failed: ${cause.message}`);
  }
}

/**
 * Error thrown when the decryption operation fails.
 *
 * @remarks
 * This can occur due to:
 * - Authentication tag mismatch (data tampering detected)
 * - Wrong encryption key
 * - Corrupted ciphertext
 *
 * The original error is preserved in the `cause` property.
 */
export class DecryptionFailedError extends CryptoError {
  readonly type = "DECRYPTION_FAILED" as const;

  constructor(public readonly cause: Error) {
    super(`Decryption failed: ${cause.message}`);
  }
}

/**
 * Error thrown when JSON serialization fails.
 *
 * @remarks
 * This occurs in `encryptJson` when the input data cannot be serialized.
 * Common causes include circular references or BigInt values.
 */
export class JsonSerializationFailedError extends CryptoError {
  readonly type = "JSON_SERIALIZATION_FAILED" as const;

  constructor(public readonly cause: Error) {
    super(`JSON serialization failed: ${cause.message}`);
  }
}

/**
 * Error thrown when JSON parsing fails.
 *
 * @remarks
 * This occurs in `decryptJson` when the decrypted plaintext is not valid JSON.
 */
export class JsonParseFailedError extends CryptoError {
  readonly type = "JSON_PARSE_FAILED" as const;

  constructor(public readonly cause: Error) {
    super(`JSON parse failed: ${cause.message}`);
  }
}

/**
 * Union type of all crypto errors.
 *
 * Use this type for function return types with neverthrow:
 *
 * @example
 * ```typescript
 * function encrypt(plaintext: string): Result<EncryptedData, CryptoErrorUnion>
 * ```
 */
export type CryptoErrorUnion =
  | PlaintextTooLargeError
  | InvalidKeyLengthError
  | MissingEncryptionKeyError
  | InvalidIvLengthError
  | InvalidAuthTagLengthError
  | InvalidBase64FormatError
  | EncryptionFailedError
  | DecryptionFailedError
  | JsonSerializationFailedError
  | JsonParseFailedError;

/**
 * Subset of errors that can occur during encryption.
 */
export type EncryptErrorUnion =
  | PlaintextTooLargeError
  | InvalidKeyLengthError
  | MissingEncryptionKeyError
  | EncryptionFailedError;

/**
 * Subset of errors that can occur during decryption.
 */
export type DecryptErrorUnion =
  | InvalidKeyLengthError
  | MissingEncryptionKeyError
  | InvalidIvLengthError
  | InvalidAuthTagLengthError
  | InvalidBase64FormatError
  | DecryptionFailedError;

/**
 * Subset of errors that can occur during EncryptedData validation.
 */
export type EncryptedDataValidationError =
  | InvalidIvLengthError
  | InvalidAuthTagLengthError
  | InvalidBase64FormatError;

/**
 * Subset of errors that can occur during JSON encryption.
 */
export type EncryptJsonErrorUnion = EncryptErrorUnion | JsonSerializationFailedError;

/**
 * Subset of errors that can occur during JSON decryption.
 */
export type DecryptJsonErrorUnion = DecryptErrorUnion | JsonParseFailedError;
