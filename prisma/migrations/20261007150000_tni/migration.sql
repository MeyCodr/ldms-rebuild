-- CreateTable
CREATE TABLE `Tni` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` SMALLINT NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `updatedById` INTEGER NULL,
    `legacyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tni_year_departmentId_key`(`year`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TniItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tniId` INTEGER NOT NULL,
    `sortOrder` SMALLINT NOT NULL,
    `indicator` TEXT NOT NULL,
    `expected` TINYINT NOT NULL,
    `actual` TINYINT NOT NULL,
    `causes` VARCHAR(500) NOT NULL,
    `ask` VARCHAR(255) NOT NULL,
    `method` ENUM('OJT', 'COACHING', 'EXTERNAL_INHOUSE') NOT NULL,
    `evaluation` VARCHAR(255) NOT NULL,

    INDEX `TniItem_tniId_sortOrder_idx`(`tniId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Tni` ADD CONSTRAINT `Tni_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tni` ADD CONSTRAINT `Tni_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TniItem` ADD CONSTRAINT `TniItem_tniId_fkey` FOREIGN KEY (`tniId`) REFERENCES `Tni`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

