-- A fresh real-data installation must be screenable without loading synthetic
-- demo data. Users can later edit or add rules in the rule-management UI.
INSERT OR IGNORE INTO screening_rules(id, name, definition_json, version, created_at, updated_at)
VALUES (
  'trend-start-rule',
  '趋势启动',
  '{"version":1,"operator":"all","conditions":[{"type":"price_above_indicator","indicator":"ma60"},{"type":"volume_multiple","window":5,"minimum":1.1}]}' ,
  1,
  datetime('now'),
  datetime('now')
);
