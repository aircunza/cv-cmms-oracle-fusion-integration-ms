# Oracle Work Order Operations Sync Module

## Overview

Handles asynchronous synchronization of Work Order Operations between the local CMMS system and Oracle Fusion. Operations are child entities of Work Orders in Oracle's API hierarchy.

---

## Operation Created Handler

### Event Subscription

NATS Event: `wo.operation.created`

### Purpose

Creates a new Operation in Oracle Fusion when a local Operation is created.

### Event Payload

| Field                     | Type     | Description                                        |
|---------------------------|----------|----------------------------------------------------|
| workOrderCode             | BigInt   | Local Work Order identifier                        |
| operationCode             | BigInt   | Local Operation identifier                         |
| enableOracleWorkOrder     | string   | "Y" or "N"                                         |
| oclWoId                   | BigInt   | Oracle Work Order ID                               |
| oclWoNumber               | string   | Oracle Work Order Number                           |
| operation                 | object   | Operation data mapped to Oracle format             |
| workOrderActualStartDate  | DateTime | Current WO start date                              |
| workOrderActualCompletionDate | DateTime | Current WO end date                            |
| allOperations             | array    | All operations of the WO (for date recalculation)  |
| isLastOperation           | boolean  | Whether this is the last operation in the WO       |

### Processing

**R-OP-CR-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-OP-CR-02**

IF `oclWoId` is null or undefined,
the handler SHALL log a warning and skip processing.

**R-OP-CR-03**

IF `oracle_wo_operations` already has a record for this `operationCode` (idempotency),
the handler SHALL skip processing.

**R-OP-CR-04**

WHEN a valid event is received,
the handler SHALL:

1. Calculate new WO date range including the new operation
2. Compare with current WO dates
3. IF dates changed, call Oracle API: `PATCH {url}/maintenanceWorkOrders/{oclWoId}` to update WO dates
4. Build the Oracle operation payload
5. Call Oracle API: `POST {url}/maintenanceWorkOrders/{oclWoId}/child/WorkOrderOperation`
6. Extract `WoOperationId` from the response
7. Save the mapping in `oracle_wo_operations` with `sync_status = "synced"`
8. Update local WO dates if they changed (publish `work.order.update-dates` event)

### Oracle Operation Payload Mapping

| Local Field              | Oracle Field                | Notes                        |
|--------------------------|-----------------------------|------------------------------|
| operationName            | OperationName               |                              |
| operationDescription     | OperationDescription        |                              |
| operationSeqNumber       | OperationSequenceNumber     |                              |
| operationType            | OperationType               | "Internal" or "OSP"          |
| actualStartDate          | PlannedStartDate            | Format: ISO 8601 +00:00      |
| actualCompletionDate     | PlannedCompletionDate       | Format: ISO 8601 +00:00      |
| workCenterCode           | WorkCenterCode              |                              |
| CountPointOperationFlag  | CountPointOperationFlag     | true for last operation      |

### Retry Policy

**R-OP-CR-05**

IF the Oracle API call fails,
the handler SHALL retry with exponential backoff (1s, 2s, 4s).
After 3 failures, mark as `sync_status = "failed"`.

---

## Operation Updated Handler

### Event Subscription

NATS Event: `wo.operation.updated`

### Purpose

Updates an Operation in Oracle Fusion when a local Operation is updated.

### Event Payload

| Field                         | Type     | Description                                  |
|-------------------------------|----------|----------------------------------------------|
| workOrderCode                 | BigInt   | Local Work Order identifier                  |
| operationCode                 | BigInt   | Local Operation identifier                   |
| enableOracleWorkOrder         | string   | "Y" or "N"                                   |
| oclWoId                       | BigInt   | Oracle Work Order ID                         |
| oclWoOperationId              | BigInt   | Oracle Operation ID                          |
| changedFields                 | object   | Fields that changed                          |
| datesChanged                  | boolean  | Whether dates changed                        |
| workOrderActualStartDate      | DateTime | Current WO start date                        |
| workOrderActualCompletionDate | DateTime | Current WO end date                          |
| allOperations                 | array    | All operations (for date recalculation)      |

### Processing

**R-OP-UP-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-OP-UP-02**

IF `oclWoId` or `oclWoOperationId` is null,
the handler SHALL skip processing.

**R-OP-UP-03**

IF `changedFields` is empty,
the handler SHALL skip processing.

**R-OP-UP-04**

WHEN a valid event is received,
the handler SHALL:

1. IF `datesChanged` is true:
   a. Calculate new WO date range from all operations
   b. IF WO dates changed, call Oracle API: `PATCH {url}/maintenanceWorkOrders/{oclWoId}`
2. Build Oracle payload from `changedFields`
3. Call Oracle API: `PATCH {url}/maintenanceWorkOrders/{oclWoId}/child/WorkOrderOperation/{oclWoOperationId}`
4. On success, update `updatedAt` in `oracle_wo_operations`
5. On failure, apply retry policy

---

## Operation Deleted Handler

### Event Subscription

NATS Event: `wo.operation.deleted`

### Purpose

Deletes an Operation from Oracle Fusion when a local Operation is deleted/canceled.

### Event Payload

| Field                 | Type     | Description                          |
|-----------------------|----------|--------------------------------------|
| workOrderCode         | BigInt   | Local Work Order identifier          |
| operationCode         | BigInt   | Local Operation identifier           |
| enableOracleWorkOrder | string   | "Y" or "N"                           |
| oclWoId               | BigInt   | Oracle Work Order ID                 |
| oclWoOperationId      | BigInt   | Oracle Operation ID                  |

### Processing

**R-OP-DL-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-OP-DL-02**

IF `oclWoId` or `oclWoOperationId` is null,
the handler SHALL skip processing.

**R-OP-DL-03**

WHEN a valid event is received,
the handler SHALL:

1. Call Oracle API: `DELETE {url}/maintenanceWorkOrders/{oclWoId}/child/WorkOrderOperation/{oclWoOperationId}`
2. On success, remove the mapping from `oracle_wo_operations`
3. On failure, apply retry policy

---

## Database Schema

### Table: `oracle_wo_operations`

| Column                    | Type              | Constraints                              | Description                                      |
|---------------------------|-------------------|------------------------------------------|--------------------------------------------------|
| id                        | BigInt            | PRIMARY KEY, AUTO_INCREMENT              | Unique identifier                                |
| oclWoId                   | BigInt            | NOT NULL, INDEX                          | Oracle Work Order ID                             |
| oclWoNumber               | String(120)       | NULLABLE                                 | Oracle Work Order Number                         |
| oclWoOperationId          | BigInt            | UNIQUE, NULLABLE                         | Oracle Operation ID                              |
| oclOperationName          | String(120)       | NULLABLE                                 | Oracle Operation name                            |
| oclOperationDescription   | String(240)       | NULLABLE                                 | Oracle Operation description                     |
| workOrderCode             | BigInt            | NOT NULL, INDEX                          | Local Work Order identifier                      |
| woOperationCode           | BigInt            | NOT NULL, INDEX                          | Local Operation identifier                       |
| syncStatus                | String(20)        | NOT NULL, DEFAULT "pending"              | "pending", "synced", "failed"                    |
| syncError                 | Text              | NULLABLE                                 | Error message if sync failed                     |
| retryCount                | Int               | NOT NULL, DEFAULT 0                      | Number of retry attempts                         |
| lastSyncAttempt           | DateTime          | NULLABLE                                 | Last sync attempt timestamp                      |
| createdAt                 | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Record creation timestamp                        |
| updatedAt                 | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Last update timestamp                            |

#### Indexes

| Name                         | Columns                        | Type     |
|------------------------------|--------------------------------|----------|
| uq_ocl_wo_operation_id       | (oclWoOperationId)             | UNIQUE   |
| idx_work_order_code          | (workOrderCode)                | INDEX    |
| idx_wo_operation_code        | (woOperationCode)              | INDEX    |
| idx_ocl_wo_id                | (oclWoId)                      | INDEX    |
| idx_sync_status              | (syncStatus)                   | INDEX    |

---

## NATS Subjects

### Events Consumed

| Event                      | Source Handler              |
|----------------------------|-----------------------------|
| `wo.operation.created`     | OperationCreatedHandler     |
| `wo.operation.updated`     | OperationUpdatedHandler     |
| `wo.operation.deleted`     | OperationDeletedHandler     |
