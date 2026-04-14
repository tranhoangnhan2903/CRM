import { getHisConfig } from "@/lib/his-config";

type Primitive = string | number | boolean | null | undefined;

interface HisRequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, Primitive>;
  body?: unknown;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const globalForHis = globalThis as unknown as {
  hisTokenCache?: TokenCache;
};

function buildUrl(path: string, query?: Record<string, Primitive>) {
  const { baseUrl } = getHisConfig();
  const url = new URL(path.replace(/^\//, ""), `${baseUrl}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function loginHis() {
  const cached = globalForHis.hisTokenCache;
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const config = getHisConfig();
  const response = await fetch(buildUrl("/api/v1/auth/access-token-mobile"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      StoreName: config.storeName,
      Domain: config.domain,
      UserName: config.username,
      Password: config.password,
      Remember: true,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HIS login failed: ${await response.text()}`);
  }

  const payload = await response.json() as { AccessToken?: string };
  if (!payload.AccessToken) {
    throw new Error("HIS login did not return AccessToken");
  }

  globalForHis.hisTokenCache = {
    accessToken: payload.AccessToken,
    expiresAt: Date.now() + 7 * 60 * 60 * 1000,
  };

  return payload.AccessToken;
}

export async function hisRequest<T>(path: string, options: HisRequestOptions = {}) {
  const token = await loginHis();
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HIS request failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}
