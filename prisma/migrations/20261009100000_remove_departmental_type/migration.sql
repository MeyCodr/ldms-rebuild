-- The Departmental training type is removed: there are only Public / In-house and OJT.
-- Trainings that had it become Public / In-house, so their participants and hours are kept.
UPDATE `Training` SET `type` = 'PUBLIC_INHOUSE' WHERE `type` = 'DEPARTMENTAL';

-- AlterTable
ALTER TABLE `Training` MODIFY `type` ENUM('PUBLIC_INHOUSE', 'OJT') NOT NULL;
