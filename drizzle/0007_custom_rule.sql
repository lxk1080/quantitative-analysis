INSERT OR IGNORE INTO screening_rules(id, name, definition_json, version, created_at, updated_at)
VALUES ('custom-rule', '自定义条件', '{"version":1,"operator":"all","conditions":[]}', 1, datetime('now'), datetime('now'));
