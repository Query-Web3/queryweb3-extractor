/*
  Warnings:

  - Added the required column `type` to the `acala_batchlog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `acala_batchlog` ADD COLUMN `type` ENUM('1', '2') NOT NULL;
