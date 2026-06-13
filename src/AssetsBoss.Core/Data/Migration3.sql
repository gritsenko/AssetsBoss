-- Анимированность одиночной картинки (GIF/animated WebP/APNG): определяется сниффером
-- заголовков в пост-проходе сканера (AnimatedImageIndexer). NULL — ещё не определено
-- (новый или изменённый файл), 0 — статичная, 1 — анимированная. Последовательности
-- кадров отслеживаются отдельно через anim_group.
ALTER TABLE assets ADD COLUMN is_animated INTEGER;

-- Частичный индекс под фильтр "анимации": лишь редкие анимированные одиночки.
CREATE INDEX ix_assets_animated ON assets(source_id) WHERE is_animated = 1;
