-- Кэш аудио-волны и длительности. Сервер не декодирует аудио (нет нативных x64-only
-- библиотек на win-arm64; ср. рендер 3D-превью на клиенте), поэтому пики и длительность
-- считает клиент через Web Audio API и заливает сюда — как мастер-превью моделей.
--
-- peaks: по одному байту на столбик (0..255). mtime обязан совпадать с assets.mtime —
-- так запись инвалидируется при изменении файла; FK ON DELETE CASCADE чистит хвосты.
CREATE TABLE audio_waveforms (
  asset_id    INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  mtime       INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  peaks       BLOB    NOT NULL
);
