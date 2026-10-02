-- OJT records the old system's "Training Type": OJT, coaching or mentoring.
-- (Table name in its exact case, so this also runs on a case-sensitive Linux server.)
ALTER TABLE `Training` ADD COLUMN `ojtMethod` ENUM('OJT', 'COACHING', 'MENTORING') NULL;
