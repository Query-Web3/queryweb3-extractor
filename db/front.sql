SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;


DROP TABLE IF EXISTS `dim_asset_types`;
CREATE TABLE IF NOT EXISTS `dim_asset_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dim_asset_types_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `dim_asset_types`;
DROP TABLE IF EXISTS `dim_chains`;
CREATE TABLE IF NOT EXISTS `dim_chains` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `chainId` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `dim_chains`;
DROP TABLE IF EXISTS `dim_return_types`;
CREATE TABLE IF NOT EXISTS `dim_return_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dim_return_types_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `dim_return_types`;
DROP TABLE IF EXISTS `dim_stat_cycles`;
CREATE TABLE IF NOT EXISTS `dim_stat_cycles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(20) NOT NULL,
  `days` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dim_stat_cycles_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `dim_stat_cycles`;
DROP TABLE IF EXISTS `dim_tokens`;
CREATE TABLE IF NOT EXISTS `dim_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `chainId` int(11) NOT NULL,
  `address` varchar(42) NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `decimals` int(11) NOT NULL,
  `assetTypeId` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dim_tokens_chainId_address_key` (`chainId`,`address`),
  KEY `dim_tokens_assetTypeId_fkey` (`assetTypeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `dim_tokens`;
DROP TABLE IF EXISTS `fact_token_daily_stats`;
CREATE TABLE IF NOT EXISTS `fact_token_daily_stats` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tokenId` int(11) NOT NULL,
  `date` datetime(3) NOT NULL,
  `volume` decimal(36,18) NOT NULL,
  `volume_usd` decimal(36,18) NOT NULL,
  `txns_count` int(11) NOT NULL,
  `price_usd` decimal(36,18) NOT NULL,
  `volume_yoy` decimal(10,2) DEFAULT NULL,
  `volume_qoq` decimal(10,2) DEFAULT NULL,
  `txns_yoy` decimal(10,2) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `fact_token_daily_stats_tokenId_date_key` (`tokenId`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `fact_token_daily_stats`;
DROP TABLE IF EXISTS `fact_yield_stats`;
CREATE TABLE IF NOT EXISTS `fact_yield_stats` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tokenId` int(11) NOT NULL,
  `returnTypeId` int(11) NOT NULL,
  `poolAddress` varchar(42) NOT NULL,
  `date` datetime(3) NOT NULL,
  `apy` decimal(10,2) NOT NULL,
  `tvl` decimal(36,18) NOT NULL,
  `tvl_usd` decimal(36,18) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `fact_yield_stats_tokenId_poolAddress_date_key` (`tokenId`,`poolAddress`,`date`),
  KEY `fact_yield_stats_returnTypeId_fkey` (`returnTypeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `fact_yield_stats`;

ALTER TABLE `dim_tokens`
  ADD CONSTRAINT `dim_tokens_assetTypeId_fkey` FOREIGN KEY (`assetTypeId`) REFERENCES `dim_asset_types` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `dim_tokens_chainId_fkey` FOREIGN KEY (`chainId`) REFERENCES `dim_chains` (`id`) ON UPDATE CASCADE;

ALTER TABLE `fact_token_daily_stats`
  ADD CONSTRAINT `fact_token_daily_stats_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `dim_tokens` (`id`) ON UPDATE CASCADE;

ALTER TABLE `fact_yield_stats`
  ADD CONSTRAINT `fact_yield_stats_returnTypeId_fkey` FOREIGN KEY (`returnTypeId`) REFERENCES `dim_return_types` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fact_yield_stats_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `dim_tokens` (`id`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
