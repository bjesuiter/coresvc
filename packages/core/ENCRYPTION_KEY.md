# Environment Variables Documentation

## ENCRYPTION_KEY

**Required:** Yes  
**Package:** `@coresvc/core`  
**Description:** 32-byte base64 encoded key used for AES-256-GCM encryption of sensitive data

### Requirements

- Must be exactly 32 bytes when decoded from base64
- Must be base64 encoded
- Should be cryptographically secure and randomly generated

### How to Generate

You can generate a valid encryption key using the built-in utility:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using OpenSSL
openssl rand -base64 32

# Or use the provided utility in the code
bun -e "import { generateEncryptionKey } from './src/crypto/index.ts'; console.log(generateEncryptionKey())"
```

### Example

```bash
# .env file
ENCRYPTION_KEY="your-32-byte-base64-encoded-key-here"
```

### Security Notes

- **Never commit this key to version control**
- Store it securely in environment variables or secret management systems
- Rotate the key periodically (requires re-encrypting all stored data)
- Use a different key for each environment (development, staging, production)

### Usage

The encryption key is used to encrypt:
- OAuth tokens and refresh tokens
- API keys
- Other sensitive service credentials

All encryption uses AES-256-GCM which provides both confidentiality and authenticity.