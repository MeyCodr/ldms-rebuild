/*
  Warnings:

  - You are about to drop the column `certificateAt` on the `Participant` table. All the data in the column will be lost.
  - You are about to drop the column `certificateFile` on the `Participant` table. All the data in the column will be lost.
  - You are about to drop the column `certificateName` on the `Participant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Participant` DROP COLUMN `certificateAt`,
    DROP COLUMN `certificateFile`,
    DROP COLUMN `certificateName`;

-- AlterTable
ALTER TABLE `Training` ADD COLUMN `certificateAt` DATETIME(3) NULL,
    ADD COLUMN `certificateById` INTEGER NULL,
    ADD COLUMN `certificateFile` VARCHAR(255) NULL,
    ADD COLUMN `certificateName` VARCHAR(255) NULL;
