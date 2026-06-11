CREATE TABLE sources(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  scheme TEXT NOT NULL DEFAULT 'local',
  root TEXT NOT NULL,
  config_json TEXT,
  created_at INTEGER NOT NULL,
  last_scan_at INTEGER);

CREATE TABLE assets(
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  parent_dir TEXT NOT NULL,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  kind INTEGER NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  UNIQUE(source_id, rel_path));

CREATE INDEX ix_assets_dir  ON assets(source_id, parent_dir);
CREATE INDEX ix_assets_kind ON assets(kind);

CREATE TABLE dirs(
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  parent TEXT,
  PRIMARY KEY(source_id, path));

CREATE INDEX ix_dirs_parent ON dirs(source_id, parent);

CREATE VIRTUAL TABLE assets_fts USING fts5(
  name, rel_path,
  content='assets', content_rowid='id',
  tokenize="unicode61 separators '-_./'");

CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, name, rel_path) VALUES (new.id, new.name, new.rel_path);
END;

CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, rel_path) VALUES('delete', old.id, old.name, old.rel_path);
END;

CREATE TRIGGER assets_au AFTER UPDATE OF name, rel_path ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, rel_path) VALUES('delete', old.id, old.name, old.rel_path);
  INSERT INTO assets_fts(rowid, name, rel_path) VALUES (new.id, new.name, new.rel_path);
END;

CREATE TABLE tags(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE);

CREATE TABLE asset_tags(
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(asset_id, tag_id));
