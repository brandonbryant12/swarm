export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION swarm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS scraped_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_key TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  subreddit TEXT NOT NULL,
  raw_object_key TEXT NOT NULL,
  author TEXT,
  title TEXT,
  score INTEGER,
  num_comments INTEGER,
  parent_item_key TEXT,
  posted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraped_items_subreddit ON scraped_items(subreddit);
CREATE INDEX IF NOT EXISTS idx_scraped_items_source_kind ON scraped_items(source_kind);
CREATE INDEX IF NOT EXISTS idx_scraped_items_posted_at ON scraped_items(posted_at DESC);

DROP TRIGGER IF EXISTS trg_scraped_items_updated_at ON scraped_items;
CREATE TRIGGER trg_scraped_items_updated_at
BEFORE UPDATE ON scraped_items
FOR EACH ROW EXECUTE FUNCTION swarm_set_updated_at();

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_key TEXT NOT NULL UNIQUE,
  scraped_item_id UUID NOT NULL REFERENCES scraped_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  subreddit TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_subreddit ON documents(subreddit);
CREATE INDEX IF NOT EXISTS idx_documents_source_kind ON documents(source_kind);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION swarm_set_updated_at();

CREATE OR REPLACE FUNCTION swarm_documents_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_search_vector ON documents;
CREATE TRIGGER trg_documents_search_vector
BEFORE INSERT OR UPDATE OF title, body, tags ON documents
FOR EACH ROW EXECUTE FUNCTION swarm_documents_search_vector_update();

CREATE INDEX IF NOT EXISTS idx_documents_search_vector
ON documents USING GIN(search_vector);
`;
