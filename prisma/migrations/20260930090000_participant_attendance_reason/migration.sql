-- Holds the reason for any attendance an admin records: why someone was absent,
-- or why they were marked completed on their behalf.
ALTER TABLE `Participant` RENAME COLUMN `absentReason` TO `attendanceReason`;
