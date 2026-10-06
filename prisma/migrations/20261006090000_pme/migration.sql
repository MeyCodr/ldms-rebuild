-- CreateTable
CREATE TABLE `Pme` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `participantId` INTEGER NOT NULL,
    `status` ENUM('NOT_REQUIRED', 'PENDING', 'EVALUATED', 'ACKNOWLEDGED', 'VERIFIED') NOT NULL DEFAULT 'PENDING',
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `answers` JSON NULL,
    `answersVersion` INTEGER NULL,
    `ojtConducted` BOOLEAN NULL,
    `averageMark` DECIMAL(5, 2) NULL,
    `evaluatedById` INTEGER NULL,
    `evaluatedAt` DATETIME(3) NULL,
    `staffComment` VARCHAR(500) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `verifiedById` INTEGER NULL,
    `verifiedAt` DATETIME(3) NULL,
    `returnReason` VARCHAR(255) NULL,
    `returnedAt` DATETIME(3) NULL,
    `legacyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Pme_participantId_key`(`participantId`),
    INDEX `Pme_status_periodEnd_idx`(`status`, `periodEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Pme` ADD CONSTRAINT `Pme_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `Participant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pme` ADD CONSTRAINT `Pme_evaluatedById_fkey` FOREIGN KEY (`evaluatedById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pme` ADD CONSTRAINT `Pme_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

