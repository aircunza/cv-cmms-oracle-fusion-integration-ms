/*
  Warnings:

  - A unique constraint covering the columns `[wo_operation_code]` on the table `oracle_wo_operations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[work_order_code]` on the table `oracle_work_orders` will be added. If there are existing duplicate values, this will fail.

*/
BEGIN TRY

BEGIN TRAN;

-- DropIndex
ALTER TABLE [dbo].[oracle_wo_operation_human_resources] DROP CONSTRAINT [oracle_wo_operation_human_resources_ocl_wo_operation_resource_id_key];

-- DropIndex
ALTER TABLE [dbo].[oracle_wo_operation_materials] DROP CONSTRAINT [oracle_wo_operation_materials_ocl_wo_operation_material_id_key];

-- DropIndex
ALTER TABLE [dbo].[oracle_wo_operations] DROP CONSTRAINT [oracle_wo_operations_ocl_wo_operation_id_key];

-- DropIndex
ALTER TABLE [dbo].[oracle_work_orders] DROP CONSTRAINT [oracle_work_orders_ocl_wo_id_key];

-- DropIndex
ALTER TABLE [dbo].[oracle_work_orders] DROP CONSTRAINT [oracle_work_orders_ocl_wo_number_key];

-- CreateIndex
ALTER TABLE [dbo].[oracle_wo_operations] ADD CONSTRAINT [uq_wo_operation_code] UNIQUE NONCLUSTERED ([wo_operation_code]);

-- CreateIndex
ALTER TABLE [dbo].[oracle_work_orders] ADD CONSTRAINT [uq_work_order_code] UNIQUE NONCLUSTERED ([work_order_code]);

-- RenameIndex
EXEC SP_RENAME N'dbo.oracle_wo_operation_human_resources.oracle_wo_operation_human_resources_wo_operation_code_resource_code_key', N'uq_wo_op_hr_resource', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.oracle_wo_operation_materials.oracle_wo_operation_materials_wo_operation_code_material_sequence_number_key', N'uq_wo_op_mat_seq', N'INDEX';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
