INSERT OR IGNORE INTO screening_rules(id, name, definition_json, version, created_at, updated_at)
VALUES (
  'mid-term-trend-rule',
  '中线趋势',
  '{"version":1,"operator":"all","conditions":[{"type":"preset","preset_id":"mid_term_trend"}]}' ,
  1,
  datetime('now'),
  datetime('now')
);
