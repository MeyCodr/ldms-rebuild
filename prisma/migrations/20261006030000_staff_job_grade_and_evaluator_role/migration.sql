-- Phase 3 groundwork: a staff member's job grade (TNA by grade), who fills in
-- their own TNA, and the Skill matrix evaluator role.

-- AlterTable
ALTER TABLE `Staff` ADD COLUMN `fillsOwnTna` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `jobGrade` TINYINT NULL;

-- AlterTable: `role` is part of the primary key, so the key is rebuilt in the same statement.
ALTER TABLE `StaffRole` DROP PRIMARY KEY,
    MODIFY `role` ENUM('LD_ADMIN', 'MAIN_CLERK', 'CLERK', 'SKILL_EVALUATOR') NOT NULL,
    ADD PRIMARY KEY (`staffId`, `role`);
