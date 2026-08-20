# Oracle Work Order Operation Human Resources Sync Module

## Overview

Handles asynchronous synchronization of Operation Human Resources (labor/resources) between the local CMMS system and Oracle Fusion. Resources are child entities of Operations in Oracle's API hierarchy.

---

## Operation Human Resource Created Handler

### Event Subscription

NATS Event: `operation.hr.created`

### Purpose

Creates a new Human Resource in Oracle Fusion when a local Operation Human Resource is created.

### Event Payload

| Field                         | Type     | Description                                        |
|-------------------------------|----------|----------------------------------------------------|
| workOrderCode                 | BigInt   | Local Work Order identifier                        |
| operationCode                 | BigInt   | Local Operation identifier                         |
| enableOracleWorkOrder         | string   | "Y" or "N"                                         |
| oclWorkOrderId                | BigInt   | Oracle Work Order ID                               |
| oclWoOperationId              | BigInt   | Oracle Operation ID                                |
| resourceCode                  | string   | Resource identifier                                |
| resourceSequenceNumber        | Int      | Resource sequence number                           |
| plannedStartDate              | DateTime | Planned start date                                 |
| plannedCompletionDate         | DateTime | Planned completion date                            |
| usageRate                     | Float    | Usage rate (optional)                              |

### Processing

**R-HR-CR-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-HR-CR-02**

IF `oclWorkOrderId` or `oclWoOperationId` is null,
the handler SHALL log a warning and skip processing.

**R-HR-CR-03**

IF `oracle_wo_operation_human_resources` already has a record for this `operationCode` + `resourceCode` (idempotency),
the handler SHALL skip processing.

**R-HR-CR-04**

WHEN a valid event is received,
the handler SHALL:

1. Build the Oracle resource payload
2. Call Oracle API: `POST {url}/maintenanceWorkOrders/{oclWorkOrderId}/child/WorkOrderOperation/{oclWoOperationId}/child/WorkOrderOperationResource`
3. Extract `WoOperationResourceId` from the response
4. IF the response does NOT include `ResourceCode` (Oracle POST response limitation):
   a. Call Oracle API: `GET {url}/maintenanceWorkOrders/{oclWorkOrderId}/child/WorkOrderOperation/{oclWoOperationId}/child/WorkOrderOperationResource`
   b. Find the resource by `WoOperationResourceId` in the response `items`
   c. Extract the complete `ResourceCode`
5. Save the mapping in `oracle_wo_operation_human_resources` with `sync_status = "synced"`
6. Update local resource record with Oracle metadata (publish `operation.hr.synced` event)

### Oracle Resource Payload Mapping

| Local Field              | Oracle Field                | Notes                        |
|--------------------------|-----------------------------|------------------------------|
| resourceCode             | ResourceCode                |                              |
| resourceSequenceNumber   | ResourceSequenceNumber      |                              |
| plannedStartDate         | PlannedStartDate            | Format: ISO 8601 +00:00      |
| plannedCompletionDate    | PlannedCompletionDate       | Format: ISO 8601 +00:00      |
| usageRate                | UsageRate                   | Optional                     |

### Retry Policy

**R-HR-CR-05**

IF the Oracle API call fails,
the handler SHALL retry with exponential backoff (1s, 2s, 4s).
After 3 failures, mark as `sync_status = "failed"`.

---

## Operation Human Resource Deleted Handler

### Event Subscription

NATS Event: `operation.hr.deleted`

### Purpose

Deletes a Human Resource from Oracle Fusion when a local Operation Human Resource is deleted/canceled.

### Event Payload

| Field                         | Type     | Description                          |
|-------------------------------|----------|--------------------------------------|
| workOrderCode                 | BigInt   | Local Work Order identifier          |
| operationCode                 | BigInt   | Local Operation identifier           |
| enableOracleWorkOrder         | string   | "Y" or "N"                           |
| oclWoId                       | BigInt   | Oracle Work Order ID                 |
| oclWoOperationId              | BigInt   | Oracle Operation ID                  |
| oclWoOperationResourceId      | BigInt   | Oracle Resource ID                   |
| resourceCode                  | string   | Resource code (if available)         |
| resourceSequenceNumber        | Int      | Resource sequence number             |

### Processing

**R-HR-DL-01**

IF `enableOracleWorkOrder` is not "Y",
the handler SHALL skip processing.

**R-HR-DL-02**

IF `oclWoId`, `oclWoOperationId`, or `oclWoOperationResourceId` is null,
the handler SHALL skip processing.

**R-HR-DL-03**

WHEN a valid event is received,
the handler SHALL:

1. Call Oracle API: `DELETE {url}/maintenanceWorkOrders/{oclWoId}/child/WorkOrderOperation/{oclWoOperationId}/child/WorkOrderOperationResource/{oclWoOperationResourceId}`
2. On success, remove the mapping from `oracle_wo_operation_human_resources`:
   - IF `resourceCode` is available, use `deleteByOperationAndResourceCode`
   - Otherwise, use `deleteByOperationAndSequence` with `resourceSequenceNumber`
3. On failure, apply retry policy

---

## Database Schema

### Table: `oracle_wo_operation_human_resources`

| Column                        | Type              | Constraints                              | Description                                      |
|-------------------------------|-------------------|------------------------------------------|--------------------------------------------------|
| id                            | BigInt            | PRIMARY KEY, AUTO_INCREMENT              | Unique identifier                                |
| oclWoId                       | BigInt            | NOT NULL, INDEX                          | Oracle Work Order ID                             |
| oclWoOperationId              | BigInt            | NOT NULL, INDEX                          | Oracle Operation ID                              |
| oclWoOperationResourceId      | BigInt            | NULLABLE                                 | Oracle Resource ID                               |
| woOperationCode               | BigInt            | NOT NULL, INDEX                          | Local Operation identifier                       |
| resourceSequenceNumber        | Int               | NOT NULL                                 | Resource sequence number                         |
| resourceCode                  | String(50)        | NULLABLE                                 | Oracle Resource Code (fetched via GET)           |
| syncStatus                    | String(20)        | NOT NULL, DEFAULT "pending"              | "pending", "synced", "failed"                    |
| syncError                     | Text              | NULLABLE                                 | Error message if sync failed                     |
| retryCount                    | Int               | NOT NULL, DEFAULT 0                      | Number of retry attempts                         |
| lastSyncAttempt               | DateTime          | NULLABLE                                 | Last sync attempt timestamp                      |
| createdAt                     | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Record creation timestamp                        |
| updatedAt                     | DateTime          | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Last update timestamp                            |

#### Indexes

| Name                                 | Columns                                    | Type     |
|--------------------------------------|--------------------------------------------|----------|
| uq_op_hr                             | (woOperationCode, resourceCode)            | UNIQUE   |
| uq_ocl_resource_id                   | (oclWoOperationResourceId)                 | UNIQUE   |
| idx_ocl_wo_id                        | (oclWoId)                                  | INDEX    |
| idx_ocl_wo_operation_id              | (oclWoOperationId)                         | INDEX    |
| idx_sync_status                      | (syncStatus)                               | INDEX    |

---

## NATS Subjects

### Events Consumed

| Event                          | Source Handler                      |
|--------------------------------|-------------------------------------|
| `operation.hr.created`         | OperationHrCreatedHandler           |
| `operation.hr.deleted`         | OperationHrDeletedHandler           |
