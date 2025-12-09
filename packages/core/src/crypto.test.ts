import { describe, it, expect } from "bun:test";
import { encrypt, decrypt, encryptJson, decryptJson, generateEncryptionKey } from "../src/crypto";

describe("Crypto Module", () => {
  const testKey = generateEncryptionKey();
  
  it("should generate a valid 32-byte encryption key", () => {
    const key = generateEncryptionKey();
    const keyBuffer = Buffer.from(key, 'base64');
    expect(keyBuffer.length).toBe(32);
  });

  it("should encrypt and decrypt text correctly", async () => {
    const plaintext = "Hello, World!";
    
    const encryptedResult = await encrypt(plaintext, testKey);
    expect(encryptedResult.isOk()).toBe(true);
    
    if (encryptedResult.isOk()) {
      const decryptedResult = await decrypt(encryptedResult.value, testKey);
      expect(decryptedResult.isOk()).toBe(true);
      
      if (decryptedResult.isOk()) {
        expect(decryptedResult.value).toBe(plaintext);
      }
    }
  });

  it("should encrypt and decrypt JSON objects correctly", async () => {
    const testData = {
      name: "Test User",
      email: "test@example.com",
      tokens: {
        access: "access123",
        refresh: "refresh456"
      }
    };
    
    const encryptedResult = await encryptJson(testData, testKey);
    expect(encryptedResult.isOk()).toBe(true);
    
    if (encryptedResult.isOk()) {
      const decryptedResult = await decryptJson(encryptedResult.value, testKey);
      expect(decryptedResult.isOk()).toBe(true);
      
      if (decryptedResult.isOk()) {
        expect(decryptedResult.value).toEqual(testData);
      }
    }
  });

  it("should fail with invalid key", async () => {
    const invalidKey = "invalid-key";
    const plaintext = "Test data";
    
    const encryptedResult = await encrypt(plaintext, invalidKey);
    expect(encryptedResult.isErr()).toBe(true);
  });

  it("should fail decryption with wrong key", async () => {
    const plaintext = "Hello, World!";
    const wrongKey = generateEncryptionKey();
    
    const encryptedResult = await encrypt(plaintext, testKey);
    expect(encryptedResult.isOk()).toBe(true);
    
    if (encryptedResult.isOk()) {
      const decryptedResult = await decrypt(encryptedResult.value, wrongKey);
      expect(decryptedResult.isErr()).toBe(true);
    }
  });
});