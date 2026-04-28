// GET /api/contracts/current
// Retourne le contrat le plus recent du user (pending ou signed).
// Le frontend l'utilise pour afficher la section "Mon contrat" sur compte.html.

import { requireUser, json } from "../../lib/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;

  // On prend le contrat le plus recent (signed prioritaire, sinon pending)
  const row = await env.DB.prepare(
    `SELECT id, status, started_at, signed_at, signed_pdf_size
     FROM contracts
     WHERE user_id = ?
     ORDER BY (status='signed') DESC, id DESC
     LIMIT 1`
  ).bind(auth.userId).first<any>();

  if (!row) {
    return json({ contract: null });
  }

  return json({
    contract: {
      id: row.id,
      status: row.status,
      started_at: row.started_at,
      signed_at: row.signed_at,
      signed_pdf_size: row.signed_pdf_size,
      download_url: row.status === "signed" ? `/api/contracts/${row.id}/download` : null,
    },
  });
};
