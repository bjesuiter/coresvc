import { describe, expect, it } from "bun:test";
import {
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  generateEncryptionKey,
} from "./crypto";
import {
  DecryptionFailedError,
  InvalidAuthTagLengthError,
  InvalidBase64FormatError,
  InvalidIvLengthError,
  InvalidKeyLengthError,
  PlaintextTooLargeError,
} from "./crypto.errors";

describe("Crypto Module", () => {
  const testKey = generateEncryptionKey();

  it("should generate a valid 32-byte encryption key", () => {
    const key = generateEncryptionKey();
    const keyBuffer = Buffer.from(key, "base64");
    expect(keyBuffer.length).toBe(32);
  });

  it("should encrypt and decrypt text correctly", () => {
    const plaintext = "Hello, World!";

    const encryptedResult = encrypt(plaintext, testKey);
    expect(encryptedResult.isOk()).toBe(true);

    if (encryptedResult.isOk()) {
      const decryptedResult = decrypt(encryptedResult.value, testKey);
      expect(decryptedResult.isOk()).toBe(true);

      if (decryptedResult.isOk()) {
        expect(decryptedResult.value).toBe(plaintext);
      }
    }
  });

  it("should encrypt and decrypt JSON objects correctly", () => {
    const testData = {
      name: "Test User",
      email: "test@example.com",
      tokens: {
        access: "access123",
        refresh: "refresh456",
      },
    };

    const encryptedResult = encryptJson(testData, testKey);
    expect(encryptedResult.isOk()).toBe(true);

    if (encryptedResult.isOk()) {
      const decryptedResult = decryptJson(encryptedResult.value, testKey);
      expect(decryptedResult.isOk()).toBe(true);

      if (decryptedResult.isOk()) {
        expect(decryptedResult.value).toEqual(testData);
      }
    }
  });

  it("should fail with invalid key", () => {
    const invalidKey = "invalid-key";
    const plaintext = "Test data";

    const encryptedResult = encrypt(plaintext, invalidKey);
    expect(encryptedResult.isErr()).toBe(true);

    if (encryptedResult.isErr()) {
      expect(encryptedResult.error).toBeInstanceOf(InvalidKeyLengthError);
      expect(encryptedResult.error.type).toBe("INVALID_KEY_LENGTH");
    }
  });

  it("should fail decryption with wrong key", () => {
    const plaintext = "Hello, World!";
    const wrongKey = generateEncryptionKey();

    const encryptedResult = encrypt(plaintext, testKey);
    expect(encryptedResult.isOk()).toBe(true);

    if (encryptedResult.isOk()) {
      const decryptedResult = decrypt(encryptedResult.value, wrongKey);
      expect(decryptedResult.isErr()).toBe(true);

      if (decryptedResult.isErr()) {
        expect(decryptedResult.error).toBeInstanceOf(DecryptionFailedError);
        expect(decryptedResult.error.type).toBe("DECRYPTION_FAILED");
        expect(decryptedResult.error.cause).toBeInstanceOf(Error);
      }
    }
  });

  it("should fail with plaintext exceeding size limit", () => {
    // Create a string larger than 64KB
    const largePlaintext = "x".repeat(65 * 1024); // 65KB

    const encryptedResult = encrypt(largePlaintext, testKey);
    expect(encryptedResult.isErr()).toBe(true);

    if (encryptedResult.isErr()) {
      const error = encryptedResult.error;
      expect(error).toBeInstanceOf(PlaintextTooLargeError);
      expect(error.type).toBe("PLAINTEXT_TOO_LARGE");

      if (error.type === "PLAINTEXT_TOO_LARGE") {
        expect(error.maxSize).toBe(64 * 1024);
        expect(error.actualSize).toBe(65 * 1024);
      }
    }
  });

  // ============================================
  // Edge Case Tests
  // ============================================

  describe("Edge Cases", () => {
    it("should encrypt and decrypt empty string", () => {
      const plaintext = "";

      const encryptedResult = encrypt(plaintext, testKey);
      expect(encryptedResult.isOk()).toBe(true);

      if (encryptedResult.isOk()) {
        const decryptedResult = decrypt(encryptedResult.value, testKey);
        expect(decryptedResult.isOk()).toBe(true);

        if (decryptedResult.isOk()) {
          expect(decryptedResult.value).toBe("");
        }
      }
    });

    it("should handle Unicode characters correctly", () => {
      // Test various Unicode: emojis, Chinese, Arabic, Spanish special chars
      const plaintext = "Hello 🔐 世界 مرحبا Ñoño 🎉🚀";

      const encryptedResult = encrypt(plaintext, testKey);
      expect(encryptedResult.isOk()).toBe(true);

      if (encryptedResult.isOk()) {
        const decryptedResult = decrypt(encryptedResult.value, testKey);
        expect(decryptedResult.isOk()).toBe(true);

        if (decryptedResult.isOk()) {
          expect(decryptedResult.value).toBe(plaintext);
        }
      }
    });

    it("should handle large data within size limits (63KB)", () => {
      // Create a string just under the 64KB limit
      const largePlaintext = "x".repeat(63 * 1024); // 63KB

      const encryptedResult = encrypt(largePlaintext, testKey);
      expect(encryptedResult.isOk()).toBe(true);

      if (encryptedResult.isOk()) {
        const decryptedResult = decrypt(encryptedResult.value, testKey);
        expect(decryptedResult.isOk()).toBe(true);

        if (decryptedResult.isOk()) {
          expect(decryptedResult.value).toBe(largePlaintext);
        }
      }
    });

    describe("Tampered Data Detection", () => {
      it("should detect tampered ciphertext", () => {
        const plaintext = "Sensitive data";

        const encryptedResult = encrypt(plaintext, testKey);
        expect(encryptedResult.isOk()).toBe(true);

        if (encryptedResult.isOk()) {
          // Tamper with ciphertext by modifying a character
          const tamperedCiphertext =
            encryptedResult.value.ciphertext.slice(0, -2) + "XX";
          const tamperedData = {
            ...encryptedResult.value,
            ciphertext: tamperedCiphertext,
          };

          const decryptedResult = decrypt(tamperedData, testKey);
          expect(decryptedResult.isErr()).toBe(true);

          if (decryptedResult.isErr()) {
            expect(decryptedResult.error).toBeInstanceOf(DecryptionFailedError);
            expect(decryptedResult.error.type).toBe("DECRYPTION_FAILED");
          }
        }
      });

      it("should detect tampered IV", () => {
        const plaintext = "Sensitive data";

        const encryptedResult = encrypt(plaintext, testKey);
        expect(encryptedResult.isOk()).toBe(true);

        if (encryptedResult.isOk()) {
          // Tamper with IV by modifying it
          const ivBuffer = Buffer.from(encryptedResult.value.iv, "base64");
          ivBuffer[0] = ivBuffer[0] ^ 0xff; // Flip bits in first byte
          const tamperedIv = ivBuffer.toString("base64");

          const tamperedData = {
            ...encryptedResult.value,
            iv: tamperedIv,
          };

          const decryptedResult = decrypt(tamperedData, testKey);
          expect(decryptedResult.isErr()).toBe(true);

          if (decryptedResult.isErr()) {
            expect(decryptedResult.error).toBeInstanceOf(DecryptionFailedError);
            expect(decryptedResult.error.type).toBe("DECRYPTION_FAILED");
          }
        }
      });

      it("should detect tampered authentication tag", () => {
        const plaintext = "Sensitive data";

        const encryptedResult = encrypt(plaintext, testKey);
        expect(encryptedResult.isOk()).toBe(true);

        if (encryptedResult.isOk()) {
          // Tamper with auth tag by modifying it
          const tagBuffer = Buffer.from(encryptedResult.value.tag, "base64");
          tagBuffer[0] = tagBuffer[0] ^ 0xff; // Flip bits in first byte
          const tamperedTag = tagBuffer.toString("base64");

          const tamperedData = {
            ...encryptedResult.value,
            tag: tamperedTag,
          };

          const decryptedResult = decrypt(tamperedData, testKey);
          expect(decryptedResult.isErr()).toBe(true);

          if (decryptedResult.isErr()) {
            expect(decryptedResult.error).toBeInstanceOf(DecryptionFailedError);
            expect(decryptedResult.error.type).toBe("DECRYPTION_FAILED");
          }
        }
      });
    });

    describe("Invalid Base64 Handling", () => {
      it("should reject invalid base64 in ciphertext", () => {
        const invalidData = {
          ciphertext: "not valid base64!!!@#$%",
          iv: Buffer.alloc(12).toString("base64"), // Valid 12-byte IV
          tag: Buffer.alloc(16).toString("base64"), // Valid 16-byte tag
        };

        const decryptedResult = decrypt(invalidData, testKey);
        expect(decryptedResult.isErr()).toBe(true);

        // Note: Node.js Buffer.from with base64 is lenient and doesn't throw on invalid chars,
        // so this will likely fail during decryption rather than validation
        if (decryptedResult.isErr()) {
          expect(decryptedResult.error.type).toMatch(
            /DECRYPTION_FAILED|INVALID_BASE64_FORMAT/,
          );
        }
      });

      it("should reject invalid IV length", () => {
        const plaintext = "Test data";
        const encryptedResult = encrypt(plaintext, testKey);
        expect(encryptedResult.isOk()).toBe(true);

        if (encryptedResult.isOk()) {
          const invalidData = {
            ...encryptedResult.value,
            iv: Buffer.alloc(8).toString("base64"), // Wrong length: 8 bytes instead of 12
          };

          const decryptedResult = decrypt(invalidData, testKey);
          expect(decryptedResult.isErr()).toBe(true);

          if (decryptedResult.isErr()) {
            const error = decryptedResult.error;
            expect(error).toBeInstanceOf(InvalidIvLengthError);
            expect(error.type).toBe("INVALID_IV_LENGTH");

            if (error.type === "INVALID_IV_LENGTH") {
              expect(error.expectedLength).toBe(12);
              expect(error.actualLength).toBe(8);
            }
          }
        }
      });

      it("should reject invalid authentication tag length", () => {
        const plaintext = "Test data";
        const encryptedResult = encrypt(plaintext, testKey);
        expect(encryptedResult.isOk()).toBe(true);

        if (encryptedResult.isOk()) {
          const invalidData = {
            ...encryptedResult.value,
            tag: Buffer.alloc(8).toString("base64"), // Wrong length: 8 bytes instead of 16
          };

          const decryptedResult = decrypt(invalidData, testKey);
          expect(decryptedResult.isErr()).toBe(true);

          if (decryptedResult.isErr()) {
            const error = decryptedResult.error;
            expect(error).toBeInstanceOf(InvalidAuthTagLengthError);
            expect(error.type).toBe("INVALID_AUTH_TAG_LENGTH");

            if (error.type === "INVALID_AUTH_TAG_LENGTH") {
              expect(error.expectedLength).toBe(16);
              expect(error.actualLength).toBe(8);
            }
          }
        }
      });
    });
  });
});
