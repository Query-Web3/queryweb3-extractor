DROP TABLE IF EXISTS `batch_log`;
CREATE TABLE IF NOT EXISTS `batch_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `batchId` char(36) NOT NULL,
  `startTime` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `endTime` datetime(3) DEFAULT NULL,
  `status` enum('FAILED','SUCCESS','RUNNING','STOPPED','PAUSED','RESUMED','CANCELED','COMPLETED','SKIPPED','RETRYING') NOT NULL DEFAULT 'RUNNING',
  `retryCount` int(11) NOT NULL DEFAULT 0,
  `type` enum('EXTRACT','TRANSFORM') NOT NULL,
  `processed_block_count` int(11) NOT NULL DEFAULT 0,
  `last_processed_height` int(11) DEFAULT NULL,
  `lock_key` varchar(191) DEFAULT NULL,
  `lock_time` datetime(3) DEFAULT NULL,
  `lock_status` enum('UNLOCKED','LOCKED','FAILED') DEFAULT NULL,
  `logs` json DEFAULT NULL,
  `errorDetails` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;