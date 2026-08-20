# Oracle Encryption Module

## Overview

Defines the encryption standard used to store Oracle Fusion credentials securely. All credentials stored in the `basic` field of `oracle_instances` are encrypted using AES-256-GCM.

---

## Algorithm

**AES-256-GCM** (Galois/Counter Mode)

- Key size: 256 bits (32 bytes)
- IV size: 96 bits (12 bytes)
- Auth tag size: 128 bits (16 bytes)

---

## Key Derivation

The encryption key is derived from the environment variable `ORACLE_ENCRYPTION_KEY`.

```
key = UTF8Encode(ORACLE_ENCRYPTION_KEY)
```

**Requirements:**
- The key MUST be exactly 32 characters (256 bits)
- If the key is not 32 characters, the system SHALL fail at startup
- The key SHALL be stored only in environment variables or a secrets manager, NEVER in code or database

---

## Encryption Process

### Input

```json
{
  "us": "oracle_username",
  "pw": "oracle_password",
  "url": "https://oracle-fusion.example.com/fscmRestApi/resources/11.13.18.05"
}
```

### Steps

1. Serialize the credentials object as a JSON string
2. Generate a random 12-byte IV (Initialization Vector)
3. Create an AES-256-GCM cipher with the key and IV
4. Encrypt the plaintext
5. Extract the 16-byte authentication tag from the cipher
6. Concatenate: `IV (12 bytes) + TAG (16 bytes) + CIPHERTEXT`
7. Encode the result as Base64

### Output Format

The encrypted value is a Base64 string with the following structure:

```
Base64( IV[12] | TAG[16] | CIPHERTEXT[variable] )
```

---

## Decryption Process

### Steps

1. Decode the Base64 string to bytes
2. Extract the first 12 bytes as the IV
3. Extract bytes 12-27 (16 bytes) as the authentication tag
4. Extract the remaining bytes as the ciphertext
5. Create an AES-256-GCM decipher with the key and IV
6. Set the authentication tag
7. Decrypt the ciphertext
8. Parse the result as JSON

### Error Handling

**R-ENC-01**

IF the authentication tag verification fails,
the system SHALL throw an error indicating tampered or corrupted data.

**R-ENC-02**

IF the decryption key is incorrect,
the system SHALL throw an authentication tag verification error.

**R-ENC-03**

IF the Base64 string is malformed,
the system SHALL throw a decoding error.

---

## Usage

### When to Encrypt

- When creating a new Oracle instance
- When updating credentials of an existing Oracle instance

### When to Decrypt

- When making an API call to Oracle Fusion
- When testing Oracle connectivity

### Caching

**R-ENC-04**

To avoid repeated decryption operations,
the system SHOULD cache decrypted credentials with a TTL (Time To Live).

Recommended cache strategy:
- TTL: 5 minutes
- Cache key: `oracle:credentials:{instanceId}`
- Cache invalidation: When credentials are updated

---

## Security Considerations

**R-SEC-01**

The encryption key SHALL NEVER be logged, even in error messages.

**R-SEC-02**

Decrypted credentials SHALL NEVER be returned in API responses.

**R-SEC-03**

The `basic` field SHALL NEVER be included in list/find responses.

**R-SEC-04**

All access to encryption/decryption functions SHALL be logged (without exposing keys or credentials).

**R-SEC-05**

The encryption key SHALL be rotated periodically. When rotated:
1. All existing `basic` values must be re-encrypted with the new key
2. This requires a maintenance window or a background migration

---

## API Client Authentication

When calling Oracle Fusion APIs, the decrypted credentials are used as HTTP Basic Auth:

```
Authorization: Basic Base64(username:password)
```

The token is generated per-request and is NOT stored.

---

## Example

### Encryption

```
Input:  {"us":"admin","pw":"secret123","url":"https://oracle.example.com/api"}
Key:    "my-32-character-key-string!!1234"

Output: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcHFyc3Q="
```

### Decryption

```
Input:  "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcHFyc3Q="
Key:    "my-32-character-key-string!!1234"

Output: {"us":"admin","pw":"secret123","url":"https://oracle.example.com/api"}
```
