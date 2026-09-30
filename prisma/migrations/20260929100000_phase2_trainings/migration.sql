-- Phase 2, module 1: trainings, their optional sessions, and participants.
-- (Replaces four migrations made while the module was being designed; none were shared.)

-- CreateTable
CREATE TABLE `Training` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('PUBLIC_INHOUSE', 'OJT', 'DEPARTMENTAL') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `code` VARCHAR(40) NULL,
    `provider` VARCHAR(160) NULL,
    `trainerName` VARCHAR(160) NULL,
    `trainerStaffId` INTEGER NULL,
    `venue` VARCHAR(160) NULL,
    `program` ENUM('EXTERNAL_PUBLIC', 'INTERNAL_EXTERNAL_TRAINER', 'INTERNAL_INTERNAL_TRAINER') NULL,
    `function` ENUM('BUSINESS', 'DIGITAL', 'LEADERSHIP', 'PERSONAL_EFFECTIVENESS') NULL,
    `platform` ENUM('PHYSICAL', 'ONLINE') NULL,
    `category` VARCHAR(80) NULL,
    `hrdfClaimable` BOOLEAN NOT NULL DEFAULT false,
    `cost` DECIMAL(12, 2) NULL,
    `description` TEXT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `startTime` TIME(0) NOT NULL,
    `endTime` TIME(0) NOT NULL,
    `status` ENUM('SCHEDULED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `departmentId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `legacySource` VARCHAR(10) NULL,
    `legacyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Training_type_startDate_idx`(`type`, `startDate`),
    INDEX `Training_startDate_idx`(`startDate`),
    UNIQUE INDEX `Training_legacySource_legacyId_key`(`legacySource`, `legacyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trainingId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `startTime` TIME(0) NOT NULL,
    `endTime` TIME(0) NOT NULL,

    UNIQUE INDEX `TrainingSession_trainingId_date_startTime_key`(`trainingId`, `date`, `startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Participant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trainingId` INTEGER NOT NULL,
    `staffId` INTEGER NOT NULL,
    `attendance` ENUM('PENDING', 'COMPLETED', 'ABSENT') NOT NULL DEFAULT 'PENDING',
    `source` ENUM('ADMIN', 'CLERK', 'SELF', 'IMPORT') NOT NULL DEFAULT 'ADMIN',
    `recordedById` INTEGER NULL,
    `absentReason` VARCHAR(255) NULL,
    `feedback` JSON NULL,
    `feedbackVersion` INTEGER NULL,
    `submittedAt` DATETIME(3) NULL,
    `certificateFile` VARCHAR(255) NULL,
    `certificateName` VARCHAR(255) NULL,
    `certificateAt` DATETIME(3) NULL,
    `legacyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Participant_staffId_attendance_idx`(`staffId`, `attendance`),
    INDEX `Participant_attendance_trainingId_idx`(`attendance`, `trainingId`),
    UNIQUE INDEX `Participant_trainingId_staffId_key`(`trainingId`, `staffId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Training` ADD CONSTRAINT `Training_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Training` ADD CONSTRAINT `Training_trainerStaffId_fkey` FOREIGN KEY (`trainerStaffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingSession` ADD CONSTRAINT `TrainingSession_trainingId_fkey` FOREIGN KEY (`trainingId`) REFERENCES `Training`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_trainingId_fkey` FOREIGN KEY (`trainingId`) REFERENCES `Training`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

