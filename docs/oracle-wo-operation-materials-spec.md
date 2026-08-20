# Oracle Work Order Operation Materials Sync Module

## Overview

Handles asynchronous synchronization of Operation Materials between the local CMMS system and Oracle Fusion. Materials are child entities of Operations in Oracle's API hierarchy.

---

## Operation Material Created Handler

### Event Subscription

NATS Event: `operation.material.created`

### Purpose

Creates a new Material in Oracle Fusion when a local Operation Material is created.

### Event Payload

| Field                     | Type     | Description                                        |
|---------------------------|----------|----------------------------------------------------|
| workOrderCode             | BigInt   | Local Work Order identifier                        |
| operationCode             | BigInt   | Local Operation identifier                         |
| enableOracleWorkOrder     | string   | "Y" or "N"                                         |
| oclWoId                   | BigInt   | Oracle Work Order ID                               |
| oclWoOperationId          | BigInt   | Oracle Operation ID                                |
| material                  | object   | Material data mapped to Oracle format              |
| operationActualStartDate  | DateTime | Operation start date (for date calculations)       |

### Processing

**R-MAT-CR-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-MAT-CR-02**

IF `oclWoId` or `oclWoOperationId` is null,
the handler SHALL log a warning and skip processing.

**R-MAT-CR-03**

IF `oracle_wo_operation_materials` already has a record for this `operationCode` + `materialSequenceNumber` (idempotency),
the handler SHALL skip processing.

**R-MAT-CR-04**

WHEN a valid event is received,
the handler SHALL:

1. Build the Oracle material payload
2. Call Oracle API: `POST {url}/maintenanceWorkOrders/{oclWoId}/child/WorkOrderOperation/{oclWoOperationId}/child/WorkOrderOperationMaterial`
3. Extract `WoOperationMaterialId` from the response
4. Save the mapping in `oracle_wo_operation_materials` with `sync_status = "synced"`
5. Update local material record with Oracle metadata (publish `operation.material.synced` event)

### Oracle Material Payload Mapping

| Local Field              | Oracle Field                | Notes                        |
|--------------------------|-----------------------------|------------------------------|
| materialCode             | ItemNumber                  | Material/item identifier     |
| materialSequenceNumber   | MaterialSequenceNumber      |                              |
| quantity                 | Quantity                    |                              |
| supplyType               | SupplyType                  | Supply type code             |
| operationActualStartDate | RequiredDate                | Derived from operation date  |

### Retry Policy

**R-MAT-CR-05**

IF the Oracle API call fails,
the handler SHALL retry with exponential backoff (1s, 2s, 4s).
After 3 failures, mark as `sync_status = "failed"`.

---

## Operation Material Deleted Handler

### Event Subscription

NATS Event: `operation.material.deleted`

### Purpose

Deletes a Material from Oracle Fusion when a local Operation Material is deleted.

### Event Payload

| Field                         | Type     | Description                          |
|-------------------------------|----------|--------------------------------------|
| workOrderCode                 | BigInt   | Local Work Order identifier          |
| operationCode                 | BigInt   | Local Operation identifier           |
| enableOracleWorkOrder         | string   | "Y" or "N"                           |
| oclWoId                       | BigInt   | Oracle Work Order ID                 |
| oclWoOperationId              | BigInt   | Oracle Operation ID                  |
| oclWoOperationMaterialId      | BigInt   | Oracle Material ID                   |
| materialSequenceNumber        | Int      | Local material sequence number       |

### Processing

**R-MAT-DL-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-MAT-DL-02**

IF `oclWoId`, `oclWoOperationId`, or `oclWoOperationMaterialId` is null,
the handler SHALL skip processing.

**R-MAT-DL-03**

WHEN a valid event is received,
the handler SHALL:

1. Call Oracle API: `DELETE {url}/maintenanceWorkOrders/{oclWoId}/child/WorkOrderOperation/{oclWoOperationId}/child/WorkOrderOperationMaterial/{oclWoOperationMaterialId}`
2. On success, remove the mapping from `oracle_wo_operation_materials`
3. On failure, apply retry policy

---

## Database Schema

### Table: `oracle_wo_operation_materials`

| Column                        | Type              | Constraints                              | Description                                      |
|-------------------------------|-------------------|------------------------------------------|--------------------------------------------------|
| id                            | BigInt            | PRIMARY KEY, AUTO_INCREMENT              | Unique identifier                                |
| oclWoId                       | BigInt            | NOT NULL, INDEX                          | Oracle Work Order ID                             |
| oclWoOperationId              | BigInt            | NOT NULL, INDEX                          | Oracle Operation ID                              |
| oclWoOperationMaterialId      | BigInt            | NULLABLE                                 | Oracle Material ID                               |
| woOperationCode               | BigInt            | NOT NULL, INDEX                          | Local Operation identifier                       |
| materialSequenceNumber        | Int               | NOT NULL                                 | Material sequence number                         |
| syncStatus                    | String(20)        | NOT NULL, DEFAULT "pending"              | "pending", "synced", "failed"                    |
| syncError                     | Text              | NULLABLE                                 | Error message if sync failed                     |
| retryCount                    | Int               | NOT NULL, DEFAULT 0                      | Number of retry attempts                         |
| lastSyncAttempt               | DateTime          | NULLABLE                                 | Last sync attempt timestamp                      |
| createdAt                     | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Record creation timestamp                        |
| updatedAt                     | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Last update timestamp                            |

#### Indexes

| Name                                 | Columns                                    | Type     |
|--------------------------------------|--------------------------------------------|----------|
| uq_op_material                       | (woOperationCode, materialSequenceNumber)  | UNIQUE   |
| uq_ocl_material_id                   | (oclWoOperationMaterialId)                 | UNIQUE   |
| idx_ocl_wo_id                        | (oclWoId)                                  | INDEX    |
| idx_ocl_wo_operation_id              | (oclWoOperationId)                         | INDEX    |
| idx_sync_status                      | (syncStatus)                               | INDEX    |

---

## NATS Subjects

### Events Consumed

| Event                          | Source Handler                  |
|--------------------------------|---------------------------------|
| `operation.material.created`   | OperationMaterialCreatedHandler |
| `operation.material.deleted`   | OperationMaterialDeletedHandler |
