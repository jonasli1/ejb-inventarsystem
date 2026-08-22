import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { tokenStore } from './token-store';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Plain axios instance (no interceptors) used for the refresh call itself,
// to avoid recursively triggering the 401 handler below.
const refreshClient = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
        refreshToken,
      })
      .then((res) => {
        tokenStore.setTokens(res.data);
        return res.data.accessToken;
      })
      .catch(() => {
        tokenStore.clear();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const isAuthEndpoint = config?.url?.startsWith('/auth/login') || config?.url?.startsWith('/auth/refresh');

    if (status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        config.headers.set('Authorization', `Bearer ${newToken}`);
        return api(config);
      }
    }

    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

export function getApiErrorMessage(error: unknown, fallback = 'Ein Fehler ist aufgetreten.'): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join(', ') : body.message;
    }
  }
  return fallback;
}
