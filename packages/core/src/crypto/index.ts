import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { err, ok, Result } from "neverthrow";

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

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
    // Validate IV length (12 bytes = 16 base64 chars)
    const ivBuffer = Buffer.from(data.iv, 'base64');
    if (ivBuffer.length !== 12) {
      return err(new Error(`Invalid IV length: expected 12 bytes, got ${ivBuffer.length}`));
    }
    
    // Validate tag length (16 bytes for GCM)
    const tagBuffer = Buffer.from(data.tag, 'base64');
    if (tagBuffer.length !== 16) {
      return err(new Error(`Invalid authentication tag length: expected 16 bytes, got ${tagBuffer.length}`));
    }
    
    // Validate ciphertext is valid base64 (will throw if invalid)
    Buffer.from(data.ciphertext, 'base64');
    
    return ok(undefined);
  } catch (error) {
    return err(new Error(`Invalid encrypted data format: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/**
 * Encrypts plaintext using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @param key - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns Result with encrypted data (ciphertext + iv + tag) or error
 */
export async function encrypt(
  plaintext: string,
  key?: string
): Promise<Result<EncryptedData, Error>> {
  const encryptionKey = key || getEncryptionKey();
  
  // For AES-256-GCM, we need a 32-byte key
  const keyBuffer = Buffer.from(encryptionKey, 'base64');
  if (keyBuffer.length !== 32) {
    keyBuffer.fill(0); // Clean up key buffer even on error
    return err(new Error("Encryption key must be 32 bytes (base64 encoded)"));
  }

  try {
    // Generate random IV (12 bytes recommended for GCM)
    const iv = randomBytes(12);
    
    // Create cipher
    const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);
    
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
export async function decrypt(
  encryptedData: EncryptedData,
  key?: string
): Promise<Result<string, Error>> {
  // Validate encrypted data format before attempting decryption
  const validationResult = validateEncryptedData(encryptedData);
  if (validationResult.isErr()) {
    return err(validationResult.error);
  }

  const encryptionKey = key || getEncryptionKey();
  
  // For AES-256-GCM, we need a 32-byte key
  const keyBuffer = Buffer.from(encryptionKey, 'base64');
  if (keyBuffer.length !== 32) {
    keyBuffer.fill(0); // Clean up key buffer even on error
    return err(new Error("Encryption key must be 32 bytes (base64 encoded)"));
  }

  try {
    // Create decipher
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyBuffer,
      Buffer.from(encryptedData.iv, "base64")
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
 * @param data - The object to encrypt
 * @param key - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns Result with encrypted data or error
 */
export async function encryptJson(
  data: any,
  key?: string
): Promise<Result<EncryptedData, Error>> {
  try {
    const jsonString = JSON.stringify(data);
    return await encrypt(jsonString, key);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Decrypts a JSON object using AES-256-GCM
 * @param encryptedData - The encrypted data object
 * @param key - Optional encryption key (defaults to ENCRYPTION_KEY env var)
 * @returns Result with parsed JSON object or error
 */
export async function decryptJson<T = any>(
  encryptedData: EncryptedData,
  key?: string
): Promise<Result<T, Error>> {
  try {
    const plaintextResult = await decrypt(encryptedData, key);
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
 * Generates a cryptographically secure 32-byte key and returns it as base64
 * This can be used to generate the ENCRYPTION_KEY environment variable
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}