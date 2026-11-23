export class ApiError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const TOKEN_KEY = 'ubus_auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token');
}

export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('token');
  }
}

export function isRegularUser(role?: string | null): boolean {
  if (!role) return false;
  return role === 'student' || role === 'faculty' || role === 'staff';
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL !== undefined
    ? process.env.NEXT_PUBLIC_API_URL
    : (typeof window !== 'undefined' ? '' : 'http://127.0.0.1:8000');

interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { skipAuth, headers = {}, ...rest } = options;

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const token = getAuthToken();
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };

  if (!skipAuth && token) {
    reqHeaders['Authorization'] = `Token ${token}`;
  }

  // If body is not FormData, default to application/json
  if (rest.body && !(rest.body instanceof FormData)) {
    if (!reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, {
    ...rest,
    headers: reqHeaders,
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let errorData: Record<string, unknown> | string | null = null;

    try {
      errorData = await response.json();
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData) {
        if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (typeof errorData.message === 'string') {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = String(errorData.error);
        } else if (errorData.detail) {
          errorMessage = String(errorData.detail);
        } else if (errorData.message) {
          errorMessage = String(errorData.message);
        } else {
          // If serializer error dict (e.g. { username: ["This field is required"] })
          const firstKey = Object.keys(errorData)[0];
          if (firstKey) {
            const val = errorData[firstKey];
            const msg = Array.isArray(val) ? val.join(' ') : String(val);
            errorMessage = `${firstKey}: ${msg}`;
          }
        }
      }
    } catch {
      // Not JSON response
    }

    throw new ApiError(errorMessage, response.status, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
