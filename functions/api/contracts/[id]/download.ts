// GET /api/contracts/{id}/download
// Proxy le PDF signe depuis R2 (contracts bucket). Acces protege par session : seul l'owner peut DL.

import { requireUser, jsonError } from "../../../lib/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;

  const id = parseInt(params.id, 10);
  if (!id) return jsonError(400, "invalid_id");

  const row = await env.DB.prepare(
    `SELECT id, user_id, status, signed_pdf_r2_key, signed_at
     FROM contracts WHERE id = ? AND user_id = ?`
  ).bind(id, auth.userId).first<any>();

  if (!row) return jsonError(404, "not_found");
  if (row.status !== "signed" || !row.signed_pdf_r2_key) {
    return jsonError(409, "not_signed", "Le contrat n'est pas encore signé.");
  }

  const obj = await env.CONTRACTS_BUCKET.get(row.signed_pdf_r2_key);
  if (!obj) return jsonError(404, "pdf_not_in_storage");

  const filename = `contrat-gaelwebdesigner-${id}.pdf`;
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
};
