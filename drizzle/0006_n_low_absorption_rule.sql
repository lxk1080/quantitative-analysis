INSERT OR IGNORE INTO screening_rules(id, name, definition_json, version, created_at, updated_at)
VALUES (
  'n-low-absorption-rule',
  'N字低吸',
  '{"version":1,"operator":"all","conditions":[{"type":"preset","preset_id":"n_low_absorption"}]}' ,
  1,
  datetime('now'),
  datetime('now')
);
