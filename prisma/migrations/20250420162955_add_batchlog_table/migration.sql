-- CreateTable
CREATE TABLE `acala_batchlog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchId` VARCHAR(191) NOT NULL,
    `startTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endTime` DATETIME(3) NULL,
    `status` ENUM('0', '1', '2') NOT NULL DEFAULT '2',
    `retryCount` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dim_chains` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `chainId` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dim_asset_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `dim_asset_types_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dim_return_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `dim_return_types_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dim_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chainId` INTEGER NOT NULL,
    `address` VARCHAR(42) NOT NULL,
    `symbol` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `decimals` INTEGER NOT NULL,
    `assetTypeId` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `dim_tokens_chainId_address_key`(`chainId`, `address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fact_token_daily_stats` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tokenId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `volume` DECIMAL(36, 18) NOT NULL,
    `volume_usd` DECIMAL(36, 18) NOT NULL,
    `txns_count` INTEGER NOT NULL,
    `price_usd` DECIMAL(36, 18) NOT NULL,
    `volume_yoy` DECIMAL(10, 2) NULL,
    `volume_qoq` DECIMAL(10, 2) NULL,
    `txns_yoy` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fact_token_daily_stats_tokenId_date_key`(`tokenId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fact_yield_stats` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tokenId` INTEGER NOT NULL,
    `returnTypeId` INTEGER NOT NULL,
    `poolAddress` VARCHAR(42) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `apy` DECIMAL(10, 2) NOT NULL,
    `tvl` DECIMAL(36, 18) NOT NULL,
    `tvl_usd` DECIMAL(36, 18) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fact_yield_stats_tokenId_poolAddress_date_key`(`tokenId`, `poolAddress`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dim_stat_cycles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(20) NOT NULL,
    `days` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `dim_stat_cycles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dim_tokens` ADD CONSTRAINT `dim_tokens_chainId_fkey` FOREIGN KEY (`chainId`) REFERENCES `dim_chains`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dim_tokens` ADD CONSTRAINT `dim_tokens_assetTypeId_fkey` FOREIGN KEY (`assetTypeId`) REFERENCES `dim_asset_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fact_token_daily_stats` ADD CONSTRAINT `fact_token_daily_stats_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `dim_tokens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fact_yield_stats` ADD CONSTRAINT `fact_yield_stats_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `dim_tokens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fact_yield_stats` ADD CONSTRAINT `fact_yield_stats_returnTypeId_fkey` FOREIGN KEY (`returnTypeId`) REFERENCES `dim_return_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
