export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh_token');
}

function setTokens(access: string, refresh: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, options, false);
    } else {
      clearTokens();
      throw new Error('Authentication expired');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      (error as { message?: string }).message ?? `Request failed with status ${res.status}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export { getAccessToken, getRefreshToken, setTokens, clearTokens };
