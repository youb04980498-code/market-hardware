import type { Tokens } from "../types";
const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
let tokens: Tokens | null = null;
let generation = 0;
let refreshing: Promise<void> | null = null;
export const sessionEvents = new EventTarget();
export function setTokens(value: Tokens | null) {
  tokens = value;
  generation++;
  sessionEvents.dispatchEvent(new Event("change"));
}
export function getTokens() {
  return tokens;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public correlation?: string,
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  UNAUTHENTICATED:
    "Session expirée ou identifiants incorrects. Connectez-vous.",
  RATE_LIMITED: "Trop de tentatives. Réessayez dans une minute.",
  PRODUCT_UNAVAILABLE: "Un produit n'est plus publié. Modifiez le panier.",
  IDEMPOTENCY_CONFLICT: "Cette tentative correspond à une autre commande.",
  FORBIDDEN: "Vous ne disposez pas des droits nécessaires.",
  CANCELLATION_NOT_ALLOWED:
    "Cette commande est finalisée. Contactez un administrateur pour un remboursement.",
};
export async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const send = () =>
    fetch(base + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(auth && tokens
          ? { Authorization: "Bearer " + tokens.access_token }
          : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(20000),
    });
  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiError(
      0,
      "NETWORK",
      "Connexion interrompue. Le résultat est inconnu ; réessayez avec la même tentative.",
    );
  }
  if (response.status === 401 && auth && tokens) {
    if (!refreshing) {
      const current = tokens,
        epoch = generation;
      refreshing = (async () => {
        try {
          const next = await request<Tokens>(
            "/api/auth/refresh",
            {
              method: "POST",
              body: JSON.stringify({ refresh_token: current.refresh_token }),
            },
            false,
          );
          if (generation === epoch) setTokens(next);
        } catch {
          if (generation === epoch) setTokens(null);
        }
      })().finally(() => {
        refreshing = null;
      });
    }
    await refreshing;
    if (tokens) response = await send();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload.error?.code ?? "REQUEST_FAILED";
    if (response.status === 401 && auth) setTokens(null);
    throw new ApiError(
      response.status,
      code,
      messages[code] ??
        payload.error?.message ??
        "Service indisponible. Réessayez.",
      payload.correlation_id,
    );
  }
  return payload as T;
}
export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const result = await request<{ data: T; errors?: { message: string }[] }>(
    "/graphql",
    { method: "POST", body: JSON.stringify({ query, variables }) },
    false,
  );
  if (result.errors?.length)
    throw new ApiError(
      502,
      "GRAPHQL",
      "Catalogue temporairement indisponible. Réessayez.",
    );
  return result.data;
}
