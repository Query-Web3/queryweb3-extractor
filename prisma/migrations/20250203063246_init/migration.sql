-- CreateTable
CREATE TABLE `Block` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Extrinsic` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blockId` INTEGER NOT NULL,
    `index` INTEGER NOT NULL,
    `method` TEXT NOT NULL,
    `signer` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Extrinsic` ADD CONSTRAINT `Extrinsic_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
