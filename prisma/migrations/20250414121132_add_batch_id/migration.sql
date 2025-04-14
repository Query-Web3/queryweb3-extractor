/*
  Warnings:

  - Added the required column `batchId` to the `acala_block` table without a default value. This is not possible if the table is not empty.
  - Added the required column `batchId` to the `acala_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `batchId` to the `acala_extrinsic` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `acala_block` ADD COLUMN `batchId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `acala_event` ADD COLUMN `batchId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `acala_extrinsic` ADD COLUMN `batchId` VARCHAR(191) NOT NULL;
