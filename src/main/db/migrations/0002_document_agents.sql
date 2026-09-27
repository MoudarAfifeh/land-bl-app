ALTER TABLE `documents` ADD `customs_agent1` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `customs_agent2` text;--> statement-breakpoint
-- Documents saved before this migration get the agent text that is in settings now.
UPDATE `documents` SET
  `customs_agent1` = (SELECT json_extract(`value`, '$') FROM `settings` WHERE `key` = 'customsAgent1'),
  `customs_agent2` = (SELECT json_extract(`value`, '$') FROM `settings` WHERE `key` = 'customsAgent2');
