BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[oracle_instances] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [environment] NVARCHAR(10) NOT NULL,
    [module] NVARCHAR(50) NOT NULL,
    [basic] TEXT NOT NULL,
    CONSTRAINT [oracle_instances_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[oracle_work_orders] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [ocl_wo_id] BIGINT,
    [ocl_wo_number] NVARCHAR(120),
    [ocl_wo_status_code] NVARCHAR(30),
    [work_order_code] BIGINT NOT NULL,
    [sync_status] NVARCHAR(20) NOT NULL CONSTRAINT [oracle_work_orders_sync_status_df] DEFAULT 'pending',
    [sync_error] TEXT,
    [retry_count] INT NOT NULL CONSTRAINT [oracle_work_orders_retry_count_df] DEFAULT 0,
    [last_sync_attempt] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [oracle_work_orders_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [oracle_work_orders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [oracle_work_orders_ocl_wo_id_key] UNIQUE NONCLUSTERED ([ocl_wo_id]),
    CONSTRAINT [oracle_work_orders_ocl_wo_number_key] UNIQUE NONCLUSTERED ([ocl_wo_number])
);

-- CreateTable
CREATE TABLE [dbo].[oracle_wo_operations] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [ocl_wo_id] BIGINT NOT NULL,
    [ocl_wo_number] NVARCHAR(120),
    [ocl_wo_operation_id] BIGINT,
    [ocl_operation_name] NVARCHAR(120),
    [ocl_operation_description] NVARCHAR(240),
    [work_order_code] BIGINT NOT NULL,
    [wo_operation_code] BIGINT NOT NULL,
    [sync_status] NVARCHAR(20) NOT NULL CONSTRAINT [oracle_wo_operations_sync_status_df] DEFAULT 'pending',
    [sync_error] TEXT,
    [retry_count] INT NOT NULL CONSTRAINT [oracle_wo_operations_retry_count_df] DEFAULT 0,
    [last_sync_attempt] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [oracle_wo_operations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [oracle_wo_operations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [oracle_wo_operations_ocl_wo_operation_id_key] UNIQUE NONCLUSTERED ([ocl_wo_operation_id])
);

-- CreateTable
CREATE TABLE [dbo].[oracle_wo_operation_materials] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [ocl_wo_id] BIGINT NOT NULL,
    [ocl_wo_operation_id] BIGINT NOT NULL,
    [ocl_wo_operation_material_id] BIGINT,
    [wo_operation_code] BIGINT NOT NULL,
    [material_sequence_number] INT NOT NULL,
    [sync_status] NVARCHAR(20) NOT NULL CONSTRAINT [oracle_wo_operation_materials_sync_status_df] DEFAULT 'pending',
    [sync_error] TEXT,
    [retry_count] INT NOT NULL CONSTRAINT [oracle_wo_operation_materials_retry_count_df] DEFAULT 0,
    [last_sync_attempt] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [oracle_wo_operation_materials_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [oracle_wo_operation_materials_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [oracle_wo_operation_materials_wo_operation_code_material_sequence_number_key] UNIQUE NONCLUSTERED ([wo_operation_code],[material_sequence_number]),
    CONSTRAINT [oracle_wo_operation_materials_ocl_wo_operation_material_id_key] UNIQUE NONCLUSTERED ([ocl_wo_operation_material_id])
);

-- CreateTable
CREATE TABLE [dbo].[oracle_wo_operation_human_resources] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [ocl_wo_id] BIGINT NOT NULL,
    [ocl_wo_operation_id] BIGINT NOT NULL,
    [ocl_wo_operation_resource_id] BIGINT,
    [wo_operation_code] BIGINT NOT NULL,
    [resource_sequence_number] INT NOT NULL,
    [resource_code] NVARCHAR(50),
    [sync_status] NVARCHAR(20) NOT NULL CONSTRAINT [oracle_wo_operation_human_resources_sync_status_df] DEFAULT 'pending',
    [sync_error] TEXT,
    [retry_count] INT NOT NULL CONSTRAINT [oracle_wo_operation_human_resources_retry_count_df] DEFAULT 0,
    [last_sync_attempt] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [oracle_wo_operation_human_resources_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [oracle_wo_operation_human_resources_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [oracle_wo_operation_human_resources_wo_operation_code_resource_code_key] UNIQUE NONCLUSTERED ([wo_operation_code],[resource_code]),
    CONSTRAINT [oracle_wo_operation_human_resources_ocl_wo_operation_resource_id_key] UNIQUE NONCLUSTERED ([ocl_wo_operation_resource_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_work_orders_work_order_code_idx] ON [dbo].[oracle_work_orders]([work_order_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_work_orders_sync_status_idx] ON [dbo].[oracle_work_orders]([sync_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operations_work_order_code_idx] ON [dbo].[oracle_wo_operations]([work_order_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operations_wo_operation_code_idx] ON [dbo].[oracle_wo_operations]([wo_operation_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operations_ocl_wo_id_idx] ON [dbo].[oracle_wo_operations]([ocl_wo_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operations_sync_status_idx] ON [dbo].[oracle_wo_operations]([sync_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operation_materials_ocl_wo_id_idx] ON [dbo].[oracle_wo_operation_materials]([ocl_wo_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operation_materials_ocl_wo_operation_id_idx] ON [dbo].[oracle_wo_operation_materials]([ocl_wo_operation_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operation_materials_sync_status_idx] ON [dbo].[oracle_wo_operation_materials]([sync_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operation_human_resources_ocl_wo_id_idx] ON [dbo].[oracle_wo_operation_human_resources]([ocl_wo_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operation_human_resources_ocl_wo_operation_id_idx] ON [dbo].[oracle_wo_operation_human_resources]([ocl_wo_operation_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [oracle_wo_operation_human_resources_sync_status_idx] ON [dbo].[oracle_wo_operation_human_resources]([sync_status]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
