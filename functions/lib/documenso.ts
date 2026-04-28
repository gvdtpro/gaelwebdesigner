// Helper pour l'API Documenso self-hosted (https://signature.gaelwebdesigner.fr)
// Documenso expose une API v2 avec auth par API key (header Authorization: Bearer ...)

export interface DocumensoCreateDocResult {
  document_id: string;
  signing_url: string;
}

interface UserProfile {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address_line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

// Cree un document a partir du template, avec le user comme signataire.
// Retourne l'id Documenso + l'URL de signature unique (pas de mail envoye).
export async function createDocumentFromTemplate(
  baseUrl: string,
  apiKey: string,
  templateId: string,
  user: UserProfile,
  redirectUrl: string,
): Promise<DocumensoCreateDocResult> {
  const recipientName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
    || user.company
    || user.email.split("@")[0];

  // Documenso API v2 : POST /api/v2/template/{templateId}/use
  // Crée un document à partir du template avec le destinataire spécifié.
  const url = `${baseUrl.replace(/\/$/, "")}/api/v2/template/${encodeURIComponent(templateId)}/use`;

  const body = {
    recipients: [
      {
        email: user.email,
        name: recipientName,
        // Le role par defaut du template definit s'il signe / approuve / reçoit.
      },
    ],
    distributeDocument: false,  // Pas d'email envoyé par Documenso : on récupère le signing URL nous-mêmes.
    sendEmail: false,
    meta: {
      redirectUrl: redirectUrl,  // Ou Documenso renvoie le user après signature.
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`documenso_use_template_failed_${res.status}:${txt.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  // La forme exacte dépend de la version Documenso ; on tolère plusieurs variantes.
  const documentId = String(
    data.documentId ?? data.id ?? data.document?.id ?? ""
  );
  // signing_url = URL unique pour le destinataire (premier recipient)
  const signingUrl = String(
    data.recipients?.[0]?.signingUrl
    ?? data.signingUrls?.[0]
    ?? data.signingUrl
    ?? ""
  );

  if (!documentId || !signingUrl) {
    throw new Error(`documenso_unexpected_response:${JSON.stringify(data).slice(0, 300)}`);
  }

  return { document_id: documentId, signing_url: signingUrl };
}

// Telecharge le PDF signe d'un document Documenso (apres completion).
export async function downloadSignedPdf(
  baseUrl: string,
  apiKey: string,
  documentId: string,
): Promise<{ bytes: Uint8Array; size: number }> {
  // GET /api/v2/document/{id}/download
  const url = `${baseUrl.replace(/\/$/, "")}/api/v2/document/${encodeURIComponent(documentId)}/download`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`documenso_download_failed_${res.status}:${txt.slice(0, 200)}`);
  }
  // Documenso peut soit retourner directement le PDF (Content-Type application/pdf),
  // soit retourner un objet { downloadUrl: "..." } qu'il faut suivre.
  const contentType = res.headers.get("Content-Type") || "";
  if (contentType.startsWith("application/pdf")) {
    const buf = await res.arrayBuffer();
    return { bytes: new Uint8Array(buf), size: buf.byteLength };
  }
  if (contentType.includes("application/json")) {
    const data = await res.json() as any;
    const dl = data.downloadUrl || data.url;
    if (!dl) throw new Error(`documenso_download_no_url:${JSON.stringify(data).slice(0,200)}`);
    const r2 = await fetch(dl);
    if (!r2.ok) throw new Error(`documenso_download_followup_${r2.status}`);
    const buf = await r2.arrayBuffer();
    return { bytes: new Uint8Array(buf), size: buf.byteLength };
  }
  // fallback : on prend le body tel quel
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), size: buf.byteLength };
}

// Verifie la signature HMAC d'un webhook Documenso.
// Documenso envoie un header `X-Documenso-Signature` avec un HMAC SHA-256 hex du body brut.
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !webhookSecret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  // signatureHeader peut etre "sha256=xxx" ou juste "xxx"
  const provided = signatureHeader.replace(/^sha256=/, "").trim().toLowerCase();
  return constantTimeEqualHex(hex, provided);
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
