-- Анимационные последовательности: кадр → клип (anim_clip + anim_frame),
-- клипы кластеризуются в "персонажа" (anim_group) в пределах каталога.
-- Заполняется пост-проходом сканера (AnimationIndexer).
ALTER TABLE assets ADD COLUMN anim_group TEXT;
ALTER TABLE assets ADD COLUMN anim_clip TEXT;
ALTER TABLE assets ADD COLUMN anim_frame INTEGER;

CREATE INDEX ix_assets_anim ON assets(source_id, parent_dir, anim_group)
  WHERE anim_group IS NOT NULL;
