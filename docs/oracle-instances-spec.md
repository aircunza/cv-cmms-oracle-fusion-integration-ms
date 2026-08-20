# Oracle Instances Module

## Overview

Manages Oracle Fusion credentials and connection configuration. Each instance represents a different Oracle environment (production, staging, etc.) and module (maintenance, inventory, etc.).

Credentials are stored encrypted using AES-256-GCM in the `basic` field. The table structure follows the exact same schema as the monolith.

---

## Database Schema

### Table: `oracle_instances`

| Column      | Type       | Constraints                 | Description                                                     |
| ----------- | ---------- | --------------------------- | --------------------------------------------------------------- |
| id          | BigInt     | PRIMARY KEY, AUTO_INCREMENT | Unique identifier                                               |
| environment | String(10) | NOT NULL                    | Environment (PROD, STAGING, etc.)                               |
| module      | String(50) | NOT NULL                    | Oracle module (MAINTENANCE, INVENTORY, etc.)                    |
| basic       | Text       | NOT NULL                    | AES-256-GCM encrypted string containing `{ "us", "pw", "url" }` |

> The `basic` column contains a Base64-encoded string produced by `GeneralEncryption.encrypt(JSON.stringify({ us, pw, url }))`.
> It is decrypted using `GeneralEncryption.decrypt(basic)` with the key from `ORACLE_ENCRYPTION_KEY` env var.
> The decrypted result is parsed as JSON: `{ "us": "username", "pw": "password", "url": "https://..." }`.

---

## How Credentials Are Used (Same as Monolith)

When a sync handler needs to call the Oracle Fusion API:

```typescript
// 1. Find the instance (e.g., searchBasic for module = "MAINTENANCE")
const instance = await oracleInstancesRepository.searchBasic();

// 2. Decrypt the basic field
const decrypted = JSON.parse(GeneralEncryption.decrypt(instance.basic));
// decrypted = { us: "username", pw: "password", url: "https://..." }

// 3. Build Basic Auth token
const token = Buffer.from(`${decrypted.us}:${decrypted.pw}`).toString("base64");

// 4. Make the API call
const res = await axios.post(
  `${decrypted.url}/maintenanceWorkOrders`,
  payload,
  {
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
  },
);
```

> This exact pattern from `OracleFusionWorkOrderApiClient.ts` MUST be preserved.

---

## Create Oracle Instance

### Communication

NATS Pattern: `oracle.instance.create` (via gateway)

Gateway endpoint: `POST /api/v1/oracle/instances`

### Purpose

Registers a new Oracle Fusion connection instance with encrypted credentials.

### Request

#### Required Fields

| Field       | Type   | Max Length | Description                                      |
| ----------- | ------ | ---------- | ------------------------------------------------ |
| environment | string | 10         | Environment identifier (e.g., "PROD", "STAGING") |
| module      | string | 50         | Oracle module (e.g., "MAINTENANCE", "INVENTORY") |
| url         | string | 500        | Oracle Fusion API base URL                       |
| username    | string | 100        | Oracle Fusion username                           |
| password    | string | 200        | Oracle Fusion password                           |

### Validations

**R-OI-CR-01**

IF `environment` is missing, empty, or exceeds 10 characters,
THEN the system SHALL reject the request with a 400 status.

**R-OI-CR-02**

IF `module` is missing, empty, or exceeds 50 characters,
THEN the system SHALL reject the request with a 400 status.

**R-OI-CR-03**

IF `url` is missing, empty, or is not a valid URL,
THEN the system SHALL reject the request with a 400 status.

**R-OI-CR-04**

IF `username` is missing or empty,
THEN the system SHALL reject the request with a 400 status.

**R-OI-CR-05**

IF `password` is missing or empty,
THEN the system SHALL reject the request with a 400 status.

**R-OI-CR-06**

IF an instance with the same `environment` and `module` already exists,
THEN the system SHALL reject the request with a 409 status.

### Processing

**R-OI-CR-07**

WHEN a valid instance creation request is received,
the system SHALL:

1. Validate all fields
2. Build the credentials object: `{ "us": "<username>", "pw": "<password>", "url": "<url>" }`
3. Encrypt using `GeneralEncryption.encrypt(JSON.stringify(credentials))`
4. Store the encrypted string in the `basic` column
5. Return the created instance (id, environment, module only)

### Response

**R-OI-CR-08**

WHEN the instance is created successfully,
the system SHALL return a 201 status with:

```json
{
  "oracleInstance": {
    "id": 1,
    "environment": "PROD",
    "module": "MAINTENANCE"
  }
}
```

> The `basic` field (encrypted credentials) SHALL NOT be returned in any response.

### Errors

**R-OI-CR-09**

IF the request contains validation errors,
THEN the system SHALL return a 400 status with a `message` array.

**R-OI-CR-10**

IF an instance with the same `environment` + `module` already exists,
THEN the system SHALL return a 409 status with error code `INSTANCE_ALREADY_EXISTS`.

---

## Find One Oracle Instance

### Communication

NATS Pattern: `oracle.instance.find.one` (via gateway)

Gateway endpoint: `GET /api/v1/oracle/instances/:id`

### Purpose

Retrieves a specific Oracle instance by ID.

### Response

Returns the instance fields without the encrypted `basic` field.

```json
{
  "oracleInstance": {
    "id": 1,
    "environment": "PROD",
    "module": "MAINTENANCE"
  }
}
```

---

## Find All Oracle Instances

### Communication

NATS Pattern: `oracle.instance.find.all` (via gateway)

Gateway endpoint: `GET /api/v1/oracle/instances`

### Purpose

Lists all registered Oracle instances with pagination.

### Request

| Field  | Type   | Default | Description     |
| ------ | ------ | ------- | --------------- |
| limit  | number | 10      | Maximum records |
| offset | number | 0       | Records to skip |

### Response

```json
{
  "oracleInstances": [
    {
      "id": 1,
      "environment": "PROD",
      "module": "MAINTENANCE"
    }
  ],
  "total": 1
}
```

---

## Update Oracle Instance

### Communication

NATS Pattern: `oracle.instance.update` (via gateway)

Gateway endpoint: `PATCH /api/v1/oracle/instances/:id`

### Purpose

Updates an existing Oracle instance. If new credentials are provided, they are re-encrypted and stored in `basic`.

### Request (All Optional)

| Field       | Type   | Description                                     |
| ----------- | ------ | ----------------------------------------------- |
| environment | string | Updated environment                             |
| module      | string | Updated module                                  |
| url         | string | Updated Oracle API URL (triggers re-encryption) |
| username    | string | Updated username (triggers re-encryption)       |
| password    | string | Updated password (triggers re-encryption)       |

### Processing

**R-OI-UP-01**

WHEN `username` or `password` or `url` is provided,
the system SHALL re-encrypt the full credentials object `{ "us", "pw", "url" }` and update the `basic` field.

**R-OI-UP-02**

IF only `environment` or `module` is updated (no credential changes),
the `basic` field SHALL NOT be modified.

---

## Delete Oracle Instance

### Communication

NATS Pattern: `oracle.instance.delete` (via gateway)

Gateway endpoint: `DELETE /api/v1/oracle/instances/:id`

### Purpose

Deletes an Oracle instance record.

### Processing

**R-OI-DL-01**

IF the instance is referenced by pending sync operations,
the system SHALL warn but allow deletion (sync handlers will fail gracefully).

---

## NATS Subjects

| Subject                    | Action | Description                  |
| -------------------------- | ------ | ---------------------------- |
| `oracle.instance.create`   | RPC    | Create a new Oracle instance |
| `oracle.instance.find.one` | RPC    | Get instance by ID           |
| `oracle.instance.find.all` | RPC    | List all instances           |
| `oracle.instance.update`   | RPC    | Update an instance           |
| `oracle.instance.delete`   | RPC    | Delete an instance           |
