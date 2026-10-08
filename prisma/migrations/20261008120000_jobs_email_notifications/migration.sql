-- CreateTable
CREATE TABLE `JobRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job` VARCHAR(40) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` ENUM('RUNNING', 'OK', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `summary` JSON NULL,
    `error` TEXT NULL,
    `startedById` INTEGER NULL,

    INDEX `JobRun_job_startedAt_idx`(`job`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(40) NOT NULL,
    `staffId` INTEGER NULL,
    `intendedTo` VARCHAR(160) NOT NULL,
    `sentTo` VARCHAR(160) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `dedupeKey` VARCHAR(80) NOT NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NULL,
    `jobRunId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,

    UNIQUE INDEX `EmailMessage_dedupeKey_key`(`dedupeKey`),
    INDEX `EmailMessage_createdAt_idx`(`createdAt`),
    INDEX `EmailMessage_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffId` INTEGER NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `href` VARCHAR(200) NOT NULL,
    `entity` VARCHAR(40) NOT NULL,
    `entityId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    INDEX `Notification_staffId_readAt_createdAt_idx`(`staffId`, `readAt`, `createdAt`),
    INDEX `Notification_entity_entityId_idx`(`entity`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `JobRun` ADD CONSTRAINT `JobRun_startedById_fkey` FOREIGN KEY (`startedById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailMessage` ADD CONSTRAINT `EmailMessage_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailMessage` ADD CONSTRAINT `EmailMessage_jobRunId_fkey` FOREIGN KEY (`jobRunId`) REFERENCES `JobRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

