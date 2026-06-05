/**
 * Cliente HTTP mínimo para hablar con la API FastAPI (registro / login).
 *
 * - `NEXT_PUBLIC_API_URL`: URL base del backend (ej. http://127.0.0.1:8000).
 *   Defínela en `frontend-react/.env.local` (no subas ese archivo a git).
 * - El navegador solo puede llamar a otro origen si el backend tiene CORS
 *   permitiendo el origen del Next.js (ver `CORS_ORIGINS` en `.env` del backend).
 */

/** Clave donde guardamos el JWT tras login o registro (localStorage o sessionStorage). */
export const AUTH_TOKEN_STORAGE_KEY = "dossier_access_token";

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://127.0.0.1:8000";
}

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  company_name: string;
  /** `personal` = espacio sin nombre de empresa comercial (solo tú). */
  workspace_kind?: "personal" | "work";
  organization_id?: string;
  role?: string;
  is_platform_admin?: boolean;
  /** Plan de la organización activa (`organizations.plan`). */
  organization_plan?: string;
  credits_balance?: number;
  credits_monthly_limit?: number;
  /** Texto libre: qué es la empresa (personaliza prompts de dossiers). */
  organization_company_summary?: string | null;
  /** Sector o área de negocio. */
  organization_industry_or_area?: string | null;
};

/** Fila devuelta por `GET /dossiers` (tabla `dossiers` en PostgreSQL). */
export type DossierListItem = {
  id: string;
  subject_name: string | null;
  subject_email: string | null;
  status: string;
  depth_level: string;
  credits_consumed: number;
  created_at: string | null;
  updated_at: string | null;
  dossier_data: unknown;
};

export type DossiersListResponse = {
  organization_id: string;
  items: DossierListItem[];
};

/** Respuesta de `GET /dossiers/{id}` (detalle). */
export type DossierDetailResponse = {
  id: string;
  organization_id: string;
  subject_name: string | null;
  subject_email: string | null;
  status: string;
  depth_level: string;
  credits_consumed: number;
  created_at: string | null;
  updated_at: string | null;
  dossier_data: unknown;
  alerts: unknown;
  agents_activated?: string[];
  agents_failed?: string[];
  data_sources_used?: string[];
  generation_duration_ms?: number | null;
  status_message?: string | null;
};

export type AuthSuccessResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

/** Perfil mínimo guardado tras login/registro para mostrar nombre en el layout (sidebar). */
export type DossierUserPreview = {
  email: string;
  full_name: string;
  company_name?: string;
  workspace_kind?: "personal" | "work";
  is_platform_admin?: boolean;
};

export const DOSSIER_USER_PREVIEW_KEY = "dossier_user_preview";

export function readDossierUserPreview(): DossierUserPreview | null {
  if (typeof window === "undefined") return null;
  const raw =
    window.localStorage.getItem(DOSSIER_USER_PREVIEW_KEY) ??
    window.sessionStorage.getItem(DOSSIER_USER_PREVIEW_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.email !== "string" || typeof o.full_name !== "string") return null;
    return {
      email: o.email,
      full_name: o.full_name,
      company_name: typeof o.company_name === "string" ? o.company_name : undefined,
      workspace_kind:
        o.workspace_kind === "personal" || o.workspace_kind === "work"
          ? o.workspace_kind
          : undefined,
      is_platform_admin: typeof o.is_platform_admin === "boolean" ? o.is_platform_admin : undefined,
    };
  } catch {
    return null;
  }
}

/** Alineado con `persistAuthToken`: local = recuérdame / post-registro; session = sesión temporal. */
export function writeDossierUserPreview(
  data: DossierUserPreview,
  storage: "local" | "session"
): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(data);
  if (storage === "local") {
    window.localStorage.setItem(DOSSIER_USER_PREVIEW_KEY, raw);
    window.sessionStorage.removeItem(DOSSIER_USER_PREVIEW_KEY);
  } else {
    window.sessionStorage.setItem(DOSSIER_USER_PREVIEW_KEY, raw);
    window.localStorage.removeItem(DOSSIER_USER_PREVIEW_KEY);
  }
}

/** Error de red o respuesta HTTP no OK con cuerpo parseable de FastAPI. */
export class DossierApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "DossierApiError";
    this.status = status;
    this.body = body;
  }

  /** True si falló fetch (servidor apagado, DNS, etc.). */
  isNetworkError(): boolean {
    return this.status === 0;
  }
}

function formatFastApiValidationItem(item: unknown): string {
  if (!item || typeof item !== "object") return JSON.stringify(item);
  const o = item as { loc?: unknown[]; msg?: unknown };
  const loc =
    Array.isArray(o.loc) && o.loc.length > 0
      ? o.loc.map((x) => (typeof x === "string" ? x : String(x))).join(".")
      : "";
  const msg = typeof o.msg === "string" ? o.msg : "";
  if (loc && msg) return `${loc}: ${msg}`;
  if (msg) return msg;
  return JSON.stringify(item);
}

function parseFastApiDetail(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as { detail?: unknown };
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    return d.detail.map((item) => formatFastApiValidationItem(item)).join(" ");
  }
  return "";
}

function assertAuthSuccessResponse(data: unknown): asserts data is AuthSuccessResponse {
  if (!data || typeof data !== "object") {
    throw new DossierApiError(
      502,
      "La API respondió con un cuerpo inválido (no es JSON de auth).",
      data
    );
  }
  const d = data as Record<string, unknown>;
  if (typeof d.access_token !== "string" || !d.access_token) {
    throw new DossierApiError(
      502,
      "La API respondió sin access_token. Revisa la consola de red y la URL del backend.",
      data
    );
  }
  if (!d.user || typeof d.user !== "object") {
    throw new DossierApiError(502, "La API respondió sin objeto user.", data);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }

  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }

  return parsed as T;
}

export async function authRegister(payload: {
  email: string;
  password: string;
  full_name: string;
  company_name?: string | null;
  workspace_kind?: "personal" | "work";
}): Promise<AuthSuccessResponse> {
  const data = await postJson<AuthSuccessResponse>("/auth/register", payload);
  assertAuthSuccessResponse(data);
  return data;
}

export async function authLogin(payload: {
  email: string;
  password: string;
}): Promise<AuthSuccessResponse> {
  const data = await postJson<AuthSuccessResponse>("/auth/login", payload);
  assertAuthSuccessResponse(data);
  return data;
}

/** Perfil del usuario autenticado (JWT). */
export async function fetchAuthMe(): Promise<AuthUser> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}/auth/me`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new DossierApiError(502, "Respuesta inválida de /auth/me.", parsed);
  }
  return parsed as AuthUser;
}

export type AdminOverview = {
  users_total: number;
  organizations_total: number;
  dossiers_total: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_platform_admin: boolean;
  created_at: string | null;
  organization_id: string | null;
  organization_name: string | null;
  workspace_kind?: "personal" | "work" | null;
  plan: string | null;
  credits_balance: number | null;
  credits_monthly_limit: number | null;
  dossiers_count: number;
};

export type AdminUsersResponse = { total: number; items: AdminUserRow[] };

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits_balance: number;
  credits_monthly_limit: number;
  is_active: boolean;
  members_count: number;
  dossiers_count: number;
  created_at: string | null;
  workspace_kind?: "personal" | "work";
};

export type AdminOrgsResponse = { total: number; items: AdminOrgRow[] };

export type AdminDossierRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  workspace_kind?: "personal" | "work";
  requested_by_user_id: string;
  requested_by_email: string;
  subject_name: string | null;
  subject_email: string | null;
  status: string;
  credits_consumed: number;
  created_at: string | null;
};

export type AdminDossiersResponse = { total: number; items: AdminDossierRow[] };

async function getJsonWithAuth<T>(path: string): Promise<T> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }
  return parsed as T;
}

async function patchJsonWithAuth<T>(path: string, body: unknown): Promise<T> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }
  return parsed as T;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return getJsonWithAuth<AdminOverview>("/admin/overview");
}

export async function fetchAdminUsers(limit = 50, offset = 0): Promise<AdminUsersResponse> {
  const q = `limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
  return getJsonWithAuth<AdminUsersResponse>(`/admin/users?${q}`);
}

export async function fetchAdminOrganizations(limit = 50, offset = 0): Promise<AdminOrgsResponse> {
  const q = `limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
  return getJsonWithAuth<AdminOrgsResponse>(`/admin/organizations?${q}`);
}

export async function fetchAdminDossiers(limit = 50, offset = 0): Promise<AdminDossiersResponse> {
  const q = `limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
  return getJsonWithAuth<AdminDossiersResponse>(`/admin/dossiers?${q}`);
}

export type AdminUserRolesPatchBody = {
  is_platform_admin: boolean;
};

/** Actualiza solo el rol de administrador de plataforma (`PATCH /admin/users/{id}`). */
export async function patchAdminUserRoles(
  userId: string,
  body: AdminUserRolesPatchBody
): Promise<AdminUserRow> {
  return patchJsonWithAuth<AdminUserRow>(`/admin/users/${encodeURIComponent(userId)}`, body);
}

export type OrganizationPlanPatchBody = {
  plan: "free" | "pro" | "enterprise";
};

/** Cambia el plan de la organización del JWT (solo rol `admin` en la org). */
export async function patchOrganizationPlan(body: OrganizationPlanPatchBody): Promise<AuthUser> {
  return patchJsonWithAuth<AuthUser>("/auth/organization/plan", body);
}

export type OrganizationDossierContextPatchBody = {
  company_summary: string;
  industry_or_area: string;
};

/** Contexto de empresa para prompts (solo rol `admin` en la org). */
export async function patchOrganizationDossierContext(
  body: OrganizationDossierContextPatchBody
): Promise<AuthUser> {
  return patchJsonWithAuth<AuthUser>("/auth/organization/dossier-context", body);
}

/**
 * Guarda el JWT: localStorage si "recuérdame", si no sessionStorage (se pierde al cerrar pestaña).
 * Limpia el otro almacén para no dejar un token viejo.
 */
export function persistAuthToken(token: string, remember: boolean): void {
  if (typeof window === "undefined") return;
  if (remember) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } else {
    sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

/** Dónde está guardado el JWT (alineado con persistAuthToken). */
export function getAuthTokenStorageMode(): "local" | "session" {
  if (typeof window === "undefined") return "local";
  if (window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) return "local";
  if (window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) return "session";
  return "local";
}

/** JWT actual guardado por `persistAuthToken` (localStorage o sessionStorage). */
export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ??
    sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  );
}

/** Quita JWT y vista previa de usuario en local y session (cerrar sesión). */
export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(DOSSIER_USER_PREVIEW_KEY);
  sessionStorage.removeItem(DOSSIER_USER_PREVIEW_KEY);
}

async function postJsonWithAuth<T>(path: string, body: unknown): Promise<T> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }

  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }

  return parsed as T;
}

/** Igual que ``CorporateCompanyResolution`` en la API (Pydantic). */
export type CorporateCompanyResolutionPayload =
  | {
      source: "companies_house";
      title: string;
      company_number: string;
    }
  | {
      source: "sec_edgar";
      title: string;
      ticker: string;
      cik: string;
    };

export type CreateCorporateDossierPayload = {
  subject_query: string;
  subject_email?: string;
  depth: "basic" | "standard" | "deep";
  resolution?: CorporateCompanyResolutionPayload;
};

/** Coincidencias UK/US para desambiguar el nombre de empresa. */
export type CorporateCompanySearchUk = {
  company_number: string;
  title: string;
  company_status: string;
  company_type: string;
};

export type CorporateCompanySearchUs = {
  ticker: string;
  title: string;
  cik: string;
};

export type CorporateCompanySearchResponse = {
  query: string;
  uk: CorporateCompanySearchUk[];
  us: CorporateCompanySearchUs[];
  warnings: string[];
};

export type CreateCorporateDossierResponse = {
  id: string;
  organization_id: string;
  status: string;
  credits_consumed: number;
  organization_credits_balance: number;
  generation_duration_ms: number | null;
};

/** Búsqueda de empresas (UK + US) para elegir el registro correcto. */
export async function fetchCorporateCompanySearch(
  q: string
): Promise<CorporateCompanySearchResponse> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}/dossiers/corporate/company-search?q=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }
  return parsed as CorporateCompanySearchResponse;
}

export type PersonResearchPayload = {
  full_name: string;
  job_area?: string | null;
  company?: string | null;
  country?: string | null;
  city?: string | null;
  extra_keywords?: string | null;
  start?: number;
  max_profiles?: number;
  include_posts?: boolean;
  /** `gemini_web` = solo IA + Google Search; `netrows` = API Netrows + análisis Gemini. */
  research_source?: "gemini_web" | "netrows";
};

export type PersonResearchApiResponse = {
  filters_applied: Record<string, unknown>;
  search_attempts: unknown[];
  profile_urls: string[];
  profiles: unknown[];
  posts_by_url: Record<string, unknown>;
  gemini_analysis_markdown: string | null;
  /** True si el informe salió de Gemini + Google Search (sin JSON de Netrows). */
  gemini_google_search_used?: boolean;
  warnings: string[];
};

export async function postPersonResearch(
  payload: PersonResearchPayload
): Promise<PersonResearchApiResponse> {
  return postJsonWithAuth<PersonResearchApiResponse>("/dossiers/person/research", payload);
}

/** Genera dossier con pipeline LangGraph (UK + US + Gemini) y lo persiste en la API. */
export async function createCorporateDossier(
  payload: CreateCorporateDossierPayload
): Promise<CreateCorporateDossierResponse> {
  return postJsonWithAuth<CreateCorporateDossierResponse>(
    "/dossiers/corporate/generate",
    payload
  );
}

/**
 * Lista dossiers de la organización del token (`org_id` en el JWT).
 * Requiere haber aplicado el SQL de migración y tener filas en `dossiers`.
 */
export async function fetchDossiersFromApi(limit = 50): Promise<DossiersListResponse> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}/dossiers?limit=${encodeURIComponent(String(limit))}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }
  return parsed as DossiersListResponse;
}

/** Detalle de un dossier (`GET /dossiers/{id}`). */
export async function fetchDossierById(dossierId: string): Promise<DossierDetailResponse> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}/dossiers/${encodeURIComponent(dossierId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { detail: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }
  return parsed as DossierDetailResponse;
}

/** Elimina un dossier (`DELETE /dossiers/{id}`). Respuesta 204 sin cuerpo. */
export async function deleteDossierFromApi(dossierId: string): Promise<void> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new DossierApiError(401, "No hay sesión. Inicia sesión de nuevo.");
  }
  const url = `${getApiBaseUrl()}/dossiers/${encodeURIComponent(dossierId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new DossierApiError(0, "NETWORK");
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { detail: text.slice(0, 500) };
    }
  }
  if (!res.ok) {
    const msg = parseFastApiDetail(parsed) || res.statusText || "HTTP_ERROR";
    throw new DossierApiError(res.status, msg, parsed);
  }
}
