-- Preset strategy: N-pattern continuation after a limit-up day.
INSERT OR IGNORE INTO screening_rules(id, name, definition_json, version, created_at, updated_at)
VALUES (
  'n-pattern-rule',
  'N字战法',
  '{"version":1,"operator":"all","conditions":[{"type":"preset","preset_id":"n_pattern"}]}' ,
  1,
  datetime('now'),
  datetime('now')
);
