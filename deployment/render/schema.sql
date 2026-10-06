-- Apply once to an empty, dedicated Neon database. This is not a D1 migration.
CREATE TABLE worlds (
  owner_id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL CHECK (octet_length(data_json) <= 1500000),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL
);
CREATE TABLE world_events (
  owner_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  event_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (owner_id, revision),
  FOREIGN KEY (owner_id) REFERENCES worlds(owner_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX world_events_owner_time ON world_events(owner_id, occurred_at);
CREATE TABLE account_erasures (owner_id TEXT PRIMARY KEY, erased_at TEXT NOT NULL);

-- A per-owner transaction lock covers saves AND erasures. The revision is
-- rechecked after taking the lock, rather than trusting an earlier API read.
CREATE FUNCTION grove_save(p_owner TEXT, p_revision INTEGER, p_world TEXT, p_events TEXT, p_at TEXT, p_label TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE current_revision INTEGER;
BEGIN
  IF p_owner !~ '^github:[1-9][0-9]{0,19}$' OR p_revision < 0 OR p_revision >= 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid owner or revision';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner, 0));
  SELECT revision INTO current_revision FROM worlds WHERE owner_id = p_owner;
  IF COALESCE(current_revision, 0) <> p_revision THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Revision conflict';
  END IF;
  INSERT INTO worlds(owner_id, data_json, revision, updated_at)
    VALUES (p_owner, p_world, p_revision + 1, p_at)
    ON CONFLICT(owner_id) DO UPDATE SET data_json = EXCLUDED.data_json, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at;
  INSERT INTO world_events(owner_id, revision, event_json, occurred_at, label)
    VALUES (p_owner, p_revision + 1, p_events, p_at, p_label);
  RETURN p_revision + 1;
END;
$$;

CREATE FUNCTION grove_erase(p_owner TEXT, p_at TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_owner !~ '^github:[1-9][0-9]{0,19}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid owner';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner, 0));
  INSERT INTO account_erasures(owner_id, erased_at) VALUES (p_owner, p_at)
    ON CONFLICT(owner_id) DO UPDATE SET erased_at = EXCLUDED.erased_at;
  DELETE FROM world_events WHERE owner_id = p_owner;
  DELETE FROM worlds WHERE owner_id = p_owner;
END;
$$;
