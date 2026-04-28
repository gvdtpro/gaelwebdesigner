// POST /api/contracts/start
// Initie ou reprend la signature du contrat pour le user connecté.
// Reuse un contrat 'pending' existant si déjà créé, sinon appelle Documenso pour créer un doc.
// Retourne { signing_url } -> le frontend redirige le user vers cette URL.

import { requireUser, json, jsonError } from "../../lib/auth";
import { createDocumentFromTemplate } from "../../lib/documenso";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;

  if (!env.DOCUMENSO_API_URL || !env.DOCUMENSO_API_KEY || !env.DOCUMENSO_TEMPLATE_ID) {
    return jsonError(503, "documenso_not_configured", "Service de signature indisponible.");
  }

  // 1. Si un contrat 'pending' existe deja, on reuse son signing_url
  const existing = await env.DB.prepare(
    `SELECT id, documenso_signing_url, status
     FROM contracts WHERE user_id = ? AND status IN ('pending')
     ORDER BY id DESC LIMIT 1`
  ).bind(auth.userId).first<any>();

  if (existing && existing.documenso_signing_url) {
    return json({ signing_url: existing.documenso_signing_url, contract_id: existing.id, reused: true });
  }

  // 2. Si un contrat 'signed' existe deja, on bloque (un seul contrat actif a la fois)
  const signed = await env.DB.prepare(
    `SELECT id FROM contracts WHERE user_id = ? AND status = 'signed' LIMIT 1`
  ).bind(auth.userId).first<any>();
  if (signed) {
    return jsonError(409, "already_signed", "Vous avez déjà signé votre contrat.");
  }

  // 3. Charger les infos du user pour pre-remplir le contrat
  const user = await env.DB.prepare(
    `SELECT email, first_name, last_name, company, address_line1, postal_code, city, country
     FROM users WHERE id = ?`
  ).bind(auth.userId).first<any>();
  if (!user) return jsonError(404, "user_not_found");

  // 4. Appel API Documenso : créer un document depuis le template, sans envoi de mail
  let result;
  try {
    result = await createDocumentFromTemplate(
      env.DOCUMENSO_API_URL,
      env.DOCUMENSO_API_KEY,
      env.DOCUMENSO_TEMPLATE_ID,
      user,
      `${env.SITE_URL}/compte`,
    );
  } catch (e: any) {
    return jsonError(502, "documenso_failed", e.message || String(e));
  }

  // 5. Stocke le contrat en DB
  const snapshot = JSON.stringify({
    email: user.email, first_name: user.first_name, last_name: user.last_name,
    company: user.company, address_line1: user.address_line1,
    postal_code: user.postal_code, city: user.city, country: user.country,
  });

  const ins = await env.DB.prepare(
    `INSERT INTO contracts (user_id, documenso_document_id, documenso_signing_url, documenso_template_id, status, client_snapshot_json)
     VALUES (?, ?, ?, ?, 'pending', ?)`
  ).bind(
    auth.userId,
    result.document_id,
    result.signing_url,
    env.DOCUMENSO_TEMPLATE_ID,
    snapshot,
  ).run();

  return json({
    signing_url: result.signing_url,
    contract_id: ins.meta?.last_row_id,
    reused: false,
  });
};
