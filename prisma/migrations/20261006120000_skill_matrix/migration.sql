-- CreateTable
CREATE TABLE `SkillEvaluation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffId` INTEGER NOT NULL,
    `year` SMALLINT NOT NULL,
    `quarter` TINYINT NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `createdById` INTEGER NULL,
    `copiedFromId` INTEGER NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedById` INTEGER NULL,
    `approvedAt` DATETIME(3) NULL,
    `returnReason` VARCHAR(255) NULL,
    `returnedAt` DATETIME(3) NULL,
    `legacyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SkillEvaluation_year_quarter_status_idx`(`year`, `quarter`, `status`),
    UNIQUE INDEX `SkillEvaluation_staffId_year_quarter_key`(`staffId`, `year`, `quarter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillTopic` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `evaluationId` INTEGER NOT NULL,
    `section` ENUM('KNOWLEDGE', 'SKILL', 'ABILITY') NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `sortOrder` SMALLINT NOT NULL,

    INDEX `SkillTopic_evaluationId_section_sortOrder_idx`(`evaluationId`, `section`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `topicId` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `rating` TINYINT NULL,
    `sortOrder` SMALLINT NOT NULL,

    INDEX `SkillItem_topicId_sortOrder_idx`(`topicId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SkillEvaluation` ADD CONSTRAINT `SkillEvaluation_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillEvaluation` ADD CONSTRAINT `SkillEvaluation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillEvaluation` ADD CONSTRAINT `SkillEvaluation_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillEvaluation` ADD CONSTRAINT `SkillEvaluation_copiedFromId_fkey` FOREIGN KEY (`copiedFromId`) REFERENCES `SkillEvaluation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillTopic` ADD CONSTRAINT `SkillTopic_evaluationId_fkey` FOREIGN KEY (`evaluationId`) REFERENCES `SkillEvaluation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillItem` ADD CONSTRAINT `SkillItem_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `SkillTopic`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

