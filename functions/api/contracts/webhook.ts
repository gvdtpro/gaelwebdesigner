// POST /api/contracts/webhook
// Webhook Documenso : reçoit les events de signature/completion.
// Sur "DOCUMENT_COMPLETED" / "DOCUMENT_SIGNED" : telecharge le PDF, le copie dans R2, met le contrat à 'signed'.

import { json, jsonError } from "../../lib/auth";
import { downloadSignedPdf, verifyWebhookSignature } from "../../lib/documenso";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DOCUMENSO_API_URL || !env.DOCUMENSO_API_KEY || !env.DOCUMENSO_WEBHOOK_SECRET) {
    return jsonError(503, "documenso_not_configured");
  }

  const rawBody = await request.text();
  const sigHeader = request.headers.get("X-Documenso-Signature")
    || request.headers.get("X-Webhook-Signature");

  const ok = await verifyWebhookSignature(rawBody, sigHeader, env.DOCUMENSO_WEBHOOK_SECRET);
  if (!ok) return jsonError(401, "bad_signature");

  let event: any;
  try { event = JSON.parse(rawBody); }
  catch { return jsonError(400, "bad_json"); }

  // Documenso v2 : event = { event: "DOCUMENT_COMPLETED" | "DOCUMENT_SIGNED" | ..., payload: { id, ... } }
  // ou alternativement { type, data }. On essaie de tolérer les deux formes.
  const evType = String(event.event || event.type || "").toUpperCase();
  const payload = event.payload || event.data || {};
  const docId = String(payload.id || payload.documentId || payload.document?.id || "");

  // On agit uniquement sur la completion (tous signataires ont signe)
  const isCompleted = evType.includes("COMPLETED")
    || evType.includes("DOCUMENT_SIGNED")
    || evType === "DOCUMENT.COMPLETED";

  if (!isCompleted || !docId) {
    return json({ ok: true, skipped: true, evType, hasDocId: !!docId });
  }

  // Trouve le contrat correspondant
  const contract = await env.DB.prepare(
    `SELECT id, user_id, status FROM contracts WHERE documenso_document_id = ? LIMIT 1`
  ).bind(docId).first<any>();

  if (!contract) {
    return json({ ok: true, skipped: true, reason: "contract_not_found", docId });
  }
  if (contract.status === "signed") {
    return json({ ok: true, skipped: true, reason: "already_signed" });
  }

  // Telecharger le PDF signe
  let pdf;
  try {
    pdf = await downloadSignedPdf(env.DOCUMENSO_API_URL, env.DOCUMENSO_API_KEY, docId);
  } catch (e: any) {
    return jsonError(502, "download_failed", e.message);
  }

  // Stocker dans R2
  const r2Key = `contracts/${contract.user_id}/${contract.id}.pdf`;
  await env.CONTRACTS_BUCKET.put(r2Key, pdf.bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });

  // Update DB
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE contracts
     SET status = 'signed', signed_at = ?, signed_pdf_r2_key = ?, signed_pdf_size = ?, updated_at = ?
     WHERE id = ?`
  ).bind(now, r2Key, pdf.size, now, contract.id).run();

  return json({ ok: true, contract_id: contract.id, signed: true });
};
