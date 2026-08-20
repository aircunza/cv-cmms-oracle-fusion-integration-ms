# Oracle Work Orders Sync Module

## Overview

Handles asynchronous synchronization of Work Orders between the local CMMS system and Oracle Fusion. This module listens to NATS events published by `cv-cmms-maintenance-execution-ms` and performs the corresponding Oracle API calls.

All sync operations are **asynchronous** (fire-and-forget from the caller's perspective). The caller receives immediate confirmation of local persistence, and the Oracle sync status can be queried separately.

---

## Architecture

```
maintenance-execution-ms
  └─ Persist WO locally
  └─ Respond 201 to client immediately
  └─ Publish event: 'work.order.created'
       │
       ▼ (NATS)
oracle-fusion-integration-ms
  └─ Consume event
  └─ Call Oracle API POST /maintenanceWorkOrders
  └─ Save mapping in oracle_work_orders
  └─ Retry on failure (backoff: 1s, 2s, 4s)
  └─ Mark as synced/failed
```

---

## Work Order Created Handler

### Event Subscription

NATS Event: `work.order.created`

### Purpose

Creates a Work Order in Oracle Fusion when a new local Work Order is created with `enableOracleWorkOrder = "Y"`.

### Event Payload

| Field                | Type     | Description                                           |
|----------------------|----------|-------------------------------------------------------|
| workOrderCode        | BigInt   | Local Work Order identifier                           |
| enableOracleWorkOrder| string   | "Y" or "N"                                            |
| payload              | object   | Oracle Fusion API payload (mapped from local fields)  |
| operations           | array    | Array of operations to create with the WO             |

### Processing

**R-WO-CR-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing silently.

**R-WO-CR-02**

IF the handler receives the same event twice (duplicate `workOrderCode`),
the handler SHALL skip processing (idempotency check against `oracle_work_orders`).

**R-WO-CR-03**

WHEN a valid event is received,
the handler SHALL:

1. Check if `oracle_work_orders` already has a record for this `workOrderCode` (idempotency)
2. Find the active Oracle instance for `module = "MAINTENANCE"`
3. Decrypt credentials from the instance
4. Build the Oracle API payload from the event `payload`
5. Call Oracle API: `POST {url}/maintenanceWorkOrders`
6. Extract `WorkOrderId` and `WorkOrderNumber` from the response
7. Save the mapping in `oracle_work_orders` with `sync_status = "synced"`
8. If the response includes `WorkOrderOperation`, process each operation (see `oracle-wo-operations-spec.md`)
9. If the response includes `WorkOrderOperationResource` within each operation, process each resource (see `oracle-wo-operation-human-resources-spec.md`)
10. If the response includes `WorkOrderOperationMaterial` within each operation, process each material (see `oracle-wo-operation-materials-spec.md`)

### Oracle API Payload Mapping

| Local Field              | Oracle Field              | Notes                        |
|--------------------------|---------------------------|------------------------------|
| workOrderDescription     | WorkOrderDescription      |                              |
| assetCode                | AssetNumber               |                              |
| workOrderType            | WorkOrderTypeCode         | Requires equivalence mapping |
| workOrderSubType         | WorkOrderSubTypeCode      | Requires equivalence mapping |
| woStatusCode             | WorkOrderStatusCode       | Requires equivalence mapping |
| workOrderPriority        | WorkOrderPriorityCode     |                              |
| actualStartDate          | PlannedStartDate          | Format: ISO 8601 +00:00      |
| actualCompletionDate     | PlannedCompletionDate     | Format: ISO 8601 +00:00      |
| organizationCode         | OrganizationCode          |                              |
| operations               | WorkOrderOperation[]      | Nested array                 |

### Oracle Equivalences

#### WorkOrderTypeCode

| Local Value    | Oracle Value |
|----------------|--------------|
| "Planned"      | "Planned"    |
| "Not Planned"  | "Not Planned"|

#### WorkOrderSubTypeCode

| Local Value     | Oracle Value    |
|-----------------|-----------------|
| "Preventive"    | "Preventive"    |
| "Corrective"    | "Corrective"    |
| "Emergency"     | "Emergency"     |
| "Inspection"    | "Inspection"    |
| "TPM"           | "TPM"           |

#### WorkOrderStatusCode

| Local Value     | Oracle Value    |
|-----------------|-----------------|
| "UNRELEASED"    | "Unreleased"    |
| "RELEASED"      | "Released"      |
| "ON_HOLD"       | "On Hold"       |
| "COMPLETED"     | "Completed"     |
| "CLOSED"        | "Closed"        |
| "CANCELED"      | "Canceled"      |
| "PENDING_APPROVAL" | "Pending Approval" |

#### OperationType

| Local Value | Oracle Value |
|-------------|--------------|
| "Internal"  | "Internal"   |
| "Supplier"  | "OSP"        |

### Retry Policy

**R-WO-CR-04**

IF the Oracle API call fails,
the handler SHALL retry with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1       | 1s    |
| 2       | 2s    |
| 3       | 4s    |

After 3 failed attempts, the record SHALL be marked with `sync_status = "failed"` and `sync_error` populated.

### Response (Event Acknowledgment)

The handler acknowledges the NATS event. No response is sent back to the caller.

---

## Work Order Fields Updated Handler

### Event Subscription

NATS Event: `work.order.fields.updated`

### Purpose

Updates Work Order fields in Oracle Fusion when the local Work Order is updated.

### Event Payload

| Field                | Type     | Description                                  |
|----------------------|----------|----------------------------------------------|
| workOrderCode        | BigInt   | Local Work Order identifier                  |
| oclWoId              | BigInt   | Oracle Work Order ID (from oracle_work_orders)|
| enableOracleWorkOrder| string   | "Y" or "N"                                   |
| changedFields        | object   | Fields that changed (key-value pairs)        |

### Processing

**R-WO-UP-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-WO-UP-02**

IF `oclWoId` is null or undefined,
the handler SHALL skip processing (WO not yet synced to Oracle).

**R-WO-UP-03**

IF `changedFields` is empty,
the handler SHALL skip processing.

**R-WO-UP-04**

WHEN a valid event is received,
the handler SHALL:

1. Look up `oclWoId` from `oracle_work_orders` by `workOrderCode`
2. Call Oracle API: `PATCH {url}/maintenanceWorkOrders/{oclWoId}`
3. On success, update `updatedAt` in `oracle_work_orders`
4. On failure, apply retry policy (see R-WO-CR-04)

---

## Work Order Released Handler

### Event Subscription

NATS Event: `work.order.released`

### Purpose

Creates a Work Order in Oracle Fusion when a Work Request is released (emergency scenario).

### Event Payload

| Field           | Type     | Description                          |
|-----------------|----------|--------------------------------------|
| requestId       | BigInt   | Work Request identifier              |
| issue           | string   | Work Request description             |
| assetCode       | string   | Asset identifier                     |
| workCenterId    | BigInt   | Work Center identifier               |
| workAreaId      | BigInt   | Work Area identifier                 |
| organizationId  | BigInt   | Organization identifier              |
| organizationCode| string   | Organization code                    |
| releasedBy      | string   | User who released                    |
| requestedAt     | DateTime | Requested date                       |
| enableOracleWorkOrder | string | "Y" or "N"                       |

### Processing

**R-WO-RL-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-WO-RL-02**

WHEN a valid event is received,
the handler SHALL:

1. Build the Oracle payload with default values:
   - WorkOrderTypeCode: "Not Planned"
   - WorkOrderSubTypeCode: "Emergency"
   - WorkOrderStatusCode: "Unreleased"
   - One default operation with the issue description
2. Call Oracle API: `POST {url}/maintenanceWorkOrders`
3. Save the mapping in `oracle_work_orders`
4. On failure, apply retry policy

---

## Get Oracle Sync Status

### Communication

NATS Pattern: `oracle.sync.work-order.status` (via gateway)

Gateway endpoint: `GET /api/v1/work-orders/:workOrderCode/oracle-sync-status`

### Purpose

Returns the Oracle sync status for a specific Work Order.

### Response

```json
{
  "syncStatus": {
    "workOrderCode": 1001,
    "oracleWorkOrderId": 300018,
    "oracleWorkOrderNumber": "WO-2025-001",
    "syncStatus": "synced",
    "lastSyncAttempt": "2025-08-20T10:30:00.000Z",
    "syncError": null,
    "retryCount": 0
  }
}
```

### Sync Status Values

| Value     | Description                                      |
|-----------|--------------------------------------------------|
| pending   | Event received, sync in progress                 |
| synced    | Successfully synced to Oracle                    |
| failed    | Sync failed after all retry attempts             |
| not_enabled | WO was created with `enableOracleWorkOrder = "N"` |

---

## Database Schema

### Table: `oracle_work_orders`

| Column            | Type              | Constraints                              | Description                                      |
|-------------------|-------------------|------------------------------------------|--------------------------------------------------|
| id                | BigInt            | PRIMARY KEY, AUTO_INCREMENT              | Unique identifier                                |
| oclWoId           | BigInt            | UNIQUE, NULLABLE                         | Oracle Work Order ID                             |
| oclWoNumber       | String(120)       | UNIQUE, NULLABLE                         | Oracle Work Order Number                         |
| oclWoStatusCode   | String(30)        | NULLABLE                                 | Oracle Work Order status code                    |
| workOrderCode     | BigInt            | NOT NULL, INDEX                          | Local Work Order identifier (FK reference)       |
| syncStatus        | String(20)        | NOT NULL, DEFAULT "pending"              | "pending", "synced", "failed", "not_enabled"     |
| syncError         | Text              | NULLABLE                                 | Error message if sync failed                     |
| retryCount        | Int               | NOT NULL, DEFAULT 0                      | Number of retry attempts                         |
| lastSyncAttempt   | DateTime          | NULLABLE                                 | Last sync attempt timestamp                      |
| createdAt         | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Record creation timestamp                        |
| updatedAt         | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Last update timestamp                            |

#### Indexes

| Name                 | Columns              | Type     |
|----------------------|----------------------|----------|
| uq_ocl_wo_id         | (oclWoId)            | UNIQUE   |
| uq_ocl_wo_number     | (oclWoNumber)        | UNIQUE   |
| idx_work_order_code  | (workOrderCode)      | INDEX    |
| idx_sync_status      | (syncStatus)         | INDEX    |

---

## NATS Subjects

### Events Consumed

| Event                      | Source Handler              |
|----------------------------|-----------------------------|
| `work.order.created`       | WorkOrderCreatedHandler     |
| `work.order.fields.updated`| WorkOrderFieldsUpdatedHandler|
| `work.order.released`      | WorkOrderReleasedHandler    |

### RPC Subjects

| Subject                        | Action | Description                    |
|--------------------------------|--------|--------------------------------|
| `oracle.sync.work-order.status`| RPC    | Get sync status for a WO       |
