// Definition de l'environnement Cloudflare Pages Functions

interface Env {
  // Bindings
  DB: D1Database;
  SESSIONS: KVNamespace;
  INVOICES_BUCKET: R2Bucket;
  CONTRACTS_BUCKET: R2Bucket;

  // Vars publiques (depuis wrangler.toml [vars])
  SITE_URL: string;
  COMPANY_NAME: string;
  COMPANY_SIRET: string;
  COMPANY_VAT_NUMBER: string;
  COMPANY_ADDRESS_LINE1: string;
  COMPANY_ADDRESS_LINE2: string;
  COMPANY_POSTAL_CODE: string;
  COMPANY_CITY: string;
  COMPANY_COUNTRY: string;
  COMPANY_EMAIL: string;
  COMPANY_PHONE: string;
  PLAN_AMOUNT_CENTS: string;
  PLAN_LABEL: string;
  VAT_RATE_BPS: string;
  VAT_MENTION: string;

  // Secrets (via wrangler pages secret put)
  STANCER_API_KEY: string;
  STANCER_WEBHOOK_SECRET: string;
  AUTH_PEPPER: string;
  // Documenso (signature electronique self-hosted)
  DOCUMENSO_API_URL: string;       // ex: https://signature.gaelwebdesigner.fr
  DOCUMENSO_API_KEY: string;       // API key generee dans le dashboard Documenso
  DOCUMENSO_TEMPLATE_ID: string;   // id du template Contrat_SiteWeb
  DOCUMENSO_WEBHOOK_SECRET: string; // secret HMAC du webhook
}

interface PagesFunction<E = Env, P extends string = string, D = unknown> {
  (context: EventContext<E, P, D>): Response | Promise<Response>;
}

interface EventContext<E, P extends string, D> {
  request: Request;
  env: E;
  params: Record<P, string>;
  data: D;
  next: () => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
}
