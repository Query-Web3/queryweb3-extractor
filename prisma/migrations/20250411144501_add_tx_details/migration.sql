/*
  Warnings:

  - You are about to drop the `Block` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Extrinsic` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Extrinsic` DROP FOREIGN KEY `Extrinsic_blockId_fkey`;

-- DropTable
DROP TABLE `Block`;

-- DropTable
DROP TABLE `Extrinsic`;

-- CreateTable
CREATE TABLE `acala_block` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acala_extrinsic` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blockId` INTEGER NOT NULL,
    `index` INTEGER NOT NULL,
    `method` TEXT NOT NULL,
    `signer` VARCHAR(191) NULL,
    `fee` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `params` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acala_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blockId` INTEGER NOT NULL,
    `extrinsicId` INTEGER NULL,
    `index` INTEGER NOT NULL,
    `section` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `data` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `acala_extrinsic` ADD CONSTRAINT `acala_extrinsic_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `acala_block`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acala_event` ADD CONSTRAINT `acala_event_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `acala_block`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acala_event` ADD CONSTRAINT `acala_event_extrinsicId_fkey` FOREIGN KEY (`extrinsicId`) REFERENCES `acala_extrinsic`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
