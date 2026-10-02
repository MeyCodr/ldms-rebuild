-- Training code: TR (OJT for OJT), the day the training was added in Malaysia
-- time (YYYYMMDD), then 6 random digits, e.g. TR20261002909393. Existing
-- trainings get one from their createdAt.
ALTER TABLE `Training` ADD COLUMN `trainingCode` VARCHAR(20) NULL;

UPDATE `Training`
SET `trainingCode` = CONCAT(
  IF(`type` = 'OJT', 'OJT', 'TR'),
  DATE_FORMAT(DATE_ADD(`createdAt`, INTERVAL 8 HOUR), '%Y%m%d'),
  LPAD(FLOOR(RAND() * 1000000), 6, '0')
);

ALTER TABLE `Training` MODIFY `trainingCode` VARCHAR(20) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Training_trainingCode_key` ON `Training`(`trainingCode`);
