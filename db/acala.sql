SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;


DROP TABLE IF EXISTS `acala_batchlog`;
CREATE TABLE IF NOT EXISTS `acala_batchlog` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `batchId` varchar(191) NOT NULL,
  `startTime` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `endTime` datetime(3) DEFAULT NULL,
  `status` enum('0','1','2') NOT NULL DEFAULT '2',
  `retryCount` int(11) NOT NULL DEFAULT 0,
  `type` enum('1','2') NOT NULL,
  `processed_block_count` int(11) NOT NULL DEFAULT 0,
  `last_processed_height` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `acala_block`;
CREATE TABLE IF NOT EXISTS `acala_block` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `number` int(11) NOT NULL,
  `hash` varchar(191) NOT NULL,
  `timestamp` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `batchId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `acala_event`;
CREATE TABLE IF NOT EXISTS `acala_event` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `blockId` int(11) NOT NULL,
  `extrinsicId` int(11) DEFAULT NULL,
  `index` int(11) NOT NULL,
  `section` varchar(191) NOT NULL,
  `method` varchar(191) NOT NULL,
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data`)),
  `batchId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `acala_event_blockId_fkey` (`blockId`),
  KEY `acala_event_extrinsicId_fkey` (`extrinsicId`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `acala_extrinsic`;
CREATE TABLE IF NOT EXISTS `acala_extrinsic` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `blockId` int(11) NOT NULL,
  `index` int(11) NOT NULL,
  `method` text NOT NULL,
  `signer` varchar(191) DEFAULT NULL,
  `fee` varchar(191) DEFAULT NULL,
  `status` varchar(191) DEFAULT NULL,
  `params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`params`)),
  `batchId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `acala_extrinsic_blockId_fkey` (`blockId`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
