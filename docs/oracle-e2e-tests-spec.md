# Oracle Fusion Integration E2E Tests

## Overview

End-to-end tests for the Oracle Fusion integration microservice. All tests follow the **Happy Path** approach, verifying that events are correctly consumed and Oracle API calls succeed.

---

## Test Setup

### Mock Strategy

| Component          | Strategy                              |
|--------------------|---------------------------------------|
| Oracle API         | Mock HTTP responses (nock or similar) |
| NATS               | Mock ClientProxy                      |
| Database           | Test database with Prisma             |
| Encryption         | Use test encryption key               |

### Environment Variables for Tests

```
DATABASE_URL=sqlserver://localhost:1433;database=test_oracle_integration;...
ORACLE_ENCRYPTION_KEY=test-32-character-key-string!!
NATS_URL=nats://localhost:4222
```

---

## Test Cases

### Oracle Instances

#### TC-OI-01: Create Oracle Instance

**Given** a valid Oracle instance payload
**When** the `oracle.instance.create` NATS RPC is called
**Then** the instance is created with encrypted credentials
**And** the response includes all fields except `basic`

#### TC-OI-02: Find Oracle Instance by ID

**Given** an existing Oracle instance
**When** the `oracle.instance.find.one` NATS RPC is called with the instance ID
**Then** the instance is returned without the `basic` field

#### TC-OI-03: List All Oracle Instances

**Given** multiple Oracle instances exist
**When** the `oracle.instance.find.all` NATS RPC is called
**Then** all instances are returned without the `basic` field

---

### Work Orders

#### TC-WO-01: Create Work Order in Oracle (Happy Path)

**Given** the Oracle integration is enabled
**And** a Work Order is created locally with `enableOracleWorkOrder = "Y"`
**And** the Oracle API mock returns a successful response with `WorkOrderId` and `WorkOrderNumber`
**When** the `work.order.created` event is published to NATS
**Then** the handler consumes the event
**And** the Oracle API is called with the correct payload
**And** a record is saved in `oracle_work_orders` with `sync_status = "synced"`
**And** `oclWoId` and `oclWoNumber` are populated

#### TC-WO-02: Create Work Order with Operations in Oracle (Happy Path)

**Given** the Oracle integration is enabled
**And** a Work Order with operations is created locally
**And** the Oracle API mock returns a successful response including `WorkOrderOperation` array
**When** the `work.order.created` event is published to NATS
**Then** the Work Order is created in Oracle
**And** each operation is saved in `oracle_wo_operations`
**And** each operation material is saved in `oracle_wo_operation_materials`
**And** each operation resource is saved in `oracle_wo_operation_human_resources`

#### TC-WO-03: Update Work Order Fields in Oracle (Happy Path)

**Given** a Work Order already synced to Oracle (`oclWoId` exists)
**And** the Oracle API mock returns a successful PATCH response
**When** the `work.order.fields.updated` event is published with `changedFields`
**Then** the Oracle API PATCH is called with the correct payload
**And** the `oracle_work_orders` record is updated

#### TC-WO-04: Get Oracle Sync Status (Happy Path)

**Given** a Work Order synced to Oracle
**When** the `oracle.sync.work-order.status` NATS RPC is called
**Then** the sync status is returned with `sync_status = "synced"`
**And** `oracleWorkOrderId` and `oracleWorkOrderNumber` are populated

---

### Operations

#### TC-OP-01: Create Operation in Oracle (Happy Path)

**Given** a Work Order already synced to Oracle
**And** a new operation is created locally
**And** the Oracle API mock returns a successful response with `WoOperationId`
**When** the `wo.operation.created` event is published to NATS
**Then** the Oracle API POST is called for the operation
**And** a record is saved in `oracle_wo_operations` with `sync_status = "synced"`

#### TC-OP-02: Update Operation in Oracle (Happy Path)

**Given** an operation already synced to Oracle (`oclWoOperationId` exists)
**And** the Oracle API mock returns a successful PATCH response
**When** the `wo.operation.updated` event is published with `changedFields`
**Then** the Oracle API PATCH is called for the operation
**And** the `oracle_wo_operations` record is updated

#### TC-OP-03: Delete Operation from Oracle (Happy Path)

**Given** an operation synced to Oracle
**And** the Oracle API mock returns a successful DELETE response
**When** the `wo.operation.deleted` event is published to NATS
**Then** the Oracle API DELETE is called
**And** the record is removed from `oracle_wo_operations`

---

### Operation Materials

#### TC-MAT-01: Create Operation Material in Oracle (Happy Path)

**Given** an operation synced to Oracle
**And** a new material is created locally
**And** the Oracle API mock returns a successful response with `WoOperationMaterialId`
**When** the `operation.material.created` event is published to NATS
**Then** the Oracle API POST is called for the material
**And** a record is saved in `oracle_wo_operation_materials` with `sync_status = "synced"`

#### TC-MAT-02: Delete Operation Material from Oracle (Happy Path)

**Given** a material synced to Oracle
**And** the Oracle API mock returns a successful DELETE response
**When** the `operation.material.deleted` event is published to NATS
**Then** the Oracle API DELETE is called
**And** the record is removed from `oracle_wo_operation_materials`

---

### Operation Human Resources

#### TC-HR-01: Create Operation Human Resource in Oracle (Happy Path)

**Given** an operation synced to Oracle
**And** a new human resource is created locally
**And** the Oracle API mock returns a successful response with `WoOperationResourceId`
**When** the `operation.hr.created` event is published to NATS
**Then** the Oracle API POST is called for the resource
**And** the Oracle API GET is called to fetch the complete `ResourceCode`
**And** a record is saved in `oracle_wo_operation_human_resources` with `sync_status = "synced"`

#### TC-HR-02: Delete Operation Human Resource from Oracle (Happy Path)

**Given** a human resource synced to Oracle
**And** the Oracle API mock returns a successful DELETE response
**When** the `operation.hr.deleted` event is published to NATS
**Then** the Oracle API DELETE is called
**And** the record is removed from `oracle_wo_operation_human_resources`

---

### Encryption

#### TC-ENC-01: Encrypt and Decrypt Credentials

**Given** a valid encryption key
**And** a credentials object `{ us, pw, url }`
**When** the credentials are encrypted
**And** the result is decrypted
**Then** the decrypted value matches the original credentials

#### TC-ENC-02: Decrypt Tampered Data Fails

**Given** an encrypted string that has been modified
**When** decryption is attempted
**Then** an error is thrown

---

## Test File Structure

```
test/
└── e2e/
    ├── oracle-instances/
    │   ├── oracle-instance.create.test.ts
    │   ├── oracle-instance.find-one.test.ts
    │   └── oracle-instance.find-all.test.ts
    ├── oracle-work-orders/
    │   ├── work-order-created.test.ts
    │   ├── work-order-fields-updated.test.ts
    │   └── work-order-sync-status.test.ts
    ├── oracle-wo-operations/
    │   ├── operation-created.test.ts
    │   ├── operation-updated.test.ts
    │   └── operation-deleted.test.ts
    ├── oracle-wo-operation-materials/
    │   ├── material-created.test.ts
    │   └── material-deleted.test.ts
    ├── oracle-wo-operation-human-resources/
    │   ├── hr-created.test.ts
    │   └── hr-deleted.test.ts
    └── oracle-encryption/
        └── encryption.test.ts
```

---

## Test Runner Configuration

### Jest E2E Config

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".test.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/src/$1"
  }
}
```

### Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run specific module
npm run test:e2e -- oracle-work-orders

# Run with coverage
npm run test:e2e -- --coverage
```
