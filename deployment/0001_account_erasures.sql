-- Standalone hosting only. Mark erasures so recovery cannot resurrect deleted thoughts.
CREATE TABLE account_erasures (
  owner_id TEXT PRIMARY KEY NOT NULL,
  erased_at TEXT NOT NULL
);
