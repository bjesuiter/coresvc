import { describe, it, expect } from "bun:test";
import { encrypt, decrypt, encryptJson, decryptJson, generateEncryptionKey } from "../src/crypto";

describe("Crypto Module", () => {
  const testKey = generateEncryptionKey();
  
  it("should generate a valid 32-byte encryption key", () => {
    const key = generateEncryptionKey();
    const keyBuffer = Buffer.from(key, 'base64');
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
        refresh: "refresh456"
      }
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
  });

  it("should fail decryption with wrong key", () => {
    const plaintext = "Hello, World!";
    const wrongKey = generateEncryptionKey();
    
    const encryptedResult = encrypt(plaintext, testKey);
    expect(encryptedResult.isOk()).toBe(true);
    
    if (encryptedResult.isOk()) {
      const decryptedResult = decrypt(encryptedResult.value, wrongKey);
      expect(decryptedResult.isErr()).toBe(true);
    }
  });
});