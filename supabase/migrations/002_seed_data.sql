-- ═══════════════════════════════════════════════════════════════
-- komu10 会計・事業管理システム v0.3
-- Seed Data
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- profiles: 2ユーザー
-- ─────────────────────────────────────────────────────────────────
INSERT INTO profiles (user_key, display_name, theme) VALUES
  ('tomo', 'トモ', 'light'),
  ('toshiki', 'トシキ', 'light');

-- ─────────────────────────────────────────────────────────────────
-- projects: 5プロジェクト
-- ─────────────────────────────────────────────────────────────────
INSERT INTO projects (name, division, owner, status, client, youtube_id, category, location, shoot_date, publish_date, budget, target_revenue, note, tags) VALUES
  (
    '長崎ランタンフェスティバル vlog',
    'youtube',
    'tomo',
    'completed',
    NULL,
    'YT-2026-001',
    'city',
    '長崎市',
    '2026-01-25',
    '2026-02-01',
    50000,
    80000,
    '中国旧正月のランタンフェスティバル。夜景メイン。',
    ARRAY['自主制作', '撮影（宿泊）']
  ),
  (
    'DMO観光データ分析・長崎市',
    'data',
    'tomo',
    'active',
    '長崎市観光コンベンション協会',
    NULL,
    NULL,
    '長崎市',
    NULL,
    NULL,
    100000,
    500000,
    '宿泊統計・観光消費額の可視化ダッシュボード構築',
    ARRAY['受託', 'データ分析', 'コンサル']
  ),
  (
    '湘南カフェ巡り vlog',
    'youtube',
    'toshiki',
    'active',
    NULL,
    'YT-2026-002',
    'cafe',
    '藤沢・鎌倉',
    '2026-02-08',
    NULL,
    30000,
    50000,
    '江ノ電沿線のカフェ5軒を紹介',
    ARRAY['自主制作', '撮影（日帰り）']
  ),
  (
    '熱海温泉旅館 伴走支援',
    'business',
    'tomo',
    'active',
    '旅館あたみ荘',
    NULL,
    NULL,
    '熱海市',
    NULL,
    NULL,
    50000,
    200000,
    'OTA最適化・Instagram運用支援（3ヶ月）',
    ARRAY['受託', 'コンサル']
  ),
  (
    '鎌倉フォトストック撮影',
    'thisplace',
    'toshiki',
    'active',
    NULL,
    NULL,
    'photo',
    '鎌倉市',
    '2026-02-10',
    NULL,
    10000,
    30000,
    '報国寺・長谷寺の四季フォト',
    ARRAY['自主制作', 'フォトストック']
  );

-- ─────────────────────────────────────────────────────────────────
-- transactions: 20取引（2026年1-2月）
-- ─────────────────────────────────────────────────────────────────

-- === 売上 ===
INSERT INTO transactions (tx_type, date, amount, kamoku, division, owner, store, description, revenue_type, project_id, source) VALUES
  -- DMOコンサル 1月請求
  ('revenue', '2026-01-31', 400000, 'sales', 'data', 'tomo', '長崎市観光コンベンション協会', 'DMO観光データ分析・1月分', 'consulting',
    (SELECT id FROM projects WHERE name LIKE 'DMO観光データ分析%'), 'manual'),
  -- 旅館伴走 1月
  ('revenue', '2026-01-31', 150000, 'sales', 'business', 'tomo', '旅館あたみ荘', '伴走支援・1月分', 'consulting',
    (SELECT id FROM projects WHERE name LIKE '熱海温泉旅館%'), 'manual'),
  -- YouTube広告収益 1月
  ('revenue', '2026-02-05', 45000, 'sales', 'youtube', 'tomo', 'Google AdSense', 'YouTube広告収益・1月分', 'ad_revenue',
    (SELECT id FROM projects WHERE name LIKE '長崎ランタン%'), 'manual'),
  -- タイアップ
  ('revenue', '2026-02-10', 200000, 'sales', 'youtube', 'toshiki', '湘南カフェ連合', 'タイアップ案件', 'tieup',
    (SELECT id FROM projects WHERE name LIKE '湘南カフェ巡り%'), 'manual'),
  -- フォトストック売上
  ('revenue', '2026-02-08', 12000, 'sales', 'thisplace', 'toshiki', 'Adobe Stock', 'フォトストック売上・2月', 'license',
    (SELECT id FROM projects WHERE name LIKE '鎌倉フォトストック%'), 'manual');

-- === 経費 ===
INSERT INTO transactions (tx_type, date, amount, kamoku, division, owner, store, description, memo, project_id, source) VALUES
  -- 長崎出張（トモ）
  ('expense', '2026-01-24', 26400, 'travel', 'youtube', 'tomo', 'JR東海・JR九州', '新幹線 東京↔長崎', '撮影出張',
    (SELECT id FROM projects WHERE name LIKE '長崎ランタン%'), 'manual'),
  ('expense', '2026-01-25', 12000, 'travel', 'youtube', 'tomo', 'ドーミーイン長崎', '宿泊1泊', '撮影出張',
    (SELECT id FROM projects WHERE name LIKE '長崎ランタン%'), 'manual'),
  ('expense', '2026-01-25', 3500, 'entertainment', 'youtube', 'tomo', '中華街 蘇州林', '撮影取材・食事', 'ランタン祭り取材',
    (SELECT id FROM projects WHERE name LIKE '長崎ランタン%'), 'manual'),

  -- サブスク（共通）
  ('expense', '2026-01-15', 6480, 'subscription', 'general', 'tomo', 'Adobe', 'Creative Cloud 1月', '', NULL, 'manual'),
  ('expense', '2026-02-15', 6480, 'subscription', 'general', 'tomo', 'Adobe', 'Creative Cloud 2月', '', NULL, 'manual'),
  ('expense', '2026-01-20', 1980, 'subscription', 'general', 'toshiki', 'Artlist', 'BGMサブスク 1月', '', NULL, 'manual'),

  -- 家賃按分（共通）
  ('expense', '2026-01-27', 85000, 'rent', 'general', 'tomo', '大家さん', '家賃 1月分', '按分25%', NULL, 'manual'),
  ('expense', '2026-02-27', 85000, 'rent', 'general', 'tomo', '大家さん', '家賃 2月分', '按分25%', NULL, 'manual'),

  -- 携帯（共通）
  ('expense', '2026-01-26', 4980, 'communication', 'general', 'tomo', 'au', '携帯 1月', '按分50%', NULL, 'manual'),
  ('expense', '2026-02-26', 4980, 'communication', 'general', 'tomo', 'au', '携帯 2月', '按分50%', NULL, 'manual'),

  -- 外注
  ('expense', '2026-02-05', 35000, 'outsource', 'youtube', 'tomo', 'フリーランス太郎', '長崎vlog編集外注', '',
    (SELECT id FROM projects WHERE name LIKE '長崎ランタン%'), 'manual'),

  -- 湘南取材（トシキ）
  ('expense', '2026-02-08', 4300, 'travel', 'youtube', 'toshiki', '江ノ島電鉄', '1日乗車券×2', '湘南カフェ取材',
    (SELECT id FROM projects WHERE name LIKE '湘南カフェ巡り%'), 'manual'),
  ('expense', '2026-02-08', 2800, 'entertainment', 'youtube', 'toshiki', 'Pacific DRIVE-IN', 'カフェ取材・撮影', '',
    (SELECT id FROM projects WHERE name LIKE '湘南カフェ巡り%'), 'manual'),

  -- 鎌倉撮影（トシキ）
  ('expense', '2026-02-10', 3200, 'travel', 'thisplace', 'toshiki', 'JR東日本', '鎌倉往復', '',
    (SELECT id FROM projects WHERE name LIKE '鎌倉フォトストック%'), 'manual'),

  -- 機材（トシキ）
  ('expense', '2026-02-03', 8900, 'equipment', 'general', 'toshiki', 'ヨドバシカメラ', 'SDカード 256GB', '', NULL, 'manual');

-- ─────────────────────────────────────────────────────────────────
-- assets: 4固定資産
-- ─────────────────────────────────────────────────────────────────
INSERT INTO assets (name, category, owner, acquisition_date, acquisition_cost, useful_life, business_use_ratio) VALUES
  ('Sony α7IV', 'camera', 'tomo', '2024-03-15', 350000, 5, 100),
  ('FE 24-70mm F2.8 GM II', 'lens', 'tomo', '2024-03-15', 280000, 5, 100),
  ('MacBook Pro 14" M3 Pro', 'pc', 'toshiki', '2024-06-01', 328000, 4, 100),
  ('DJI Mini 4 Pro', 'drone', 'tomo', '2024-09-10', 135000, 5, 100);

-- ─────────────────────────────────────────────────────────────────
-- anbun_settings: 4按分設定
-- ─────────────────────────────────────────────────────────────────
INSERT INTO anbun_settings (kamoku, owner, ratio, note) VALUES
  ('rent', 'tomo', 25, '作業部屋15㎡/全体60㎡=25%'),
  ('communication', 'tomo', 50, '事業利用50%'),
  ('utility', 'tomo', 25, '作業部屋面積比'),
  ('vehicle', 'tomo', 70, 'ロケ撮影70%');
