-- Migration : table contracts pour la signature electronique via Documenso
-- A appliquer apres 0001_init.sql

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  -- Cote Documenso
  documenso_document_id TEXT,           -- id du document Documenso (string ou int selon API)
  documenso_signing_url TEXT,           -- URL unique de signature (envoyee au user au clic)
  documenso_template_id TEXT,           -- template utilise (audit)
  -- Statut workflow
  status TEXT NOT NULL DEFAULT 'pending', -- pending, signed, declined, expired
  -- Dates
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  signed_at INTEGER,
  -- PDF signe
  signed_pdf_r2_key TEXT,               -- chemin dans R2 : contracts/{user_id}/{id}.pdf
  signed_pdf_size INTEGER,              -- taille en octets (info UI)
  -- Snapshot client a la signature (immutable, pour preuve)
  client_snapshot_json TEXT,
  -- Audit
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contracts_user ON contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_doc_id ON contracts(documenso_document_id);
