const REFRESH_KEY = 'inventarsystem.refreshToken';

let accessToken: string | null = null;
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export const tokenStore = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => refreshToken,

  setTokens(next: { accessToken: string; refreshToken: string }) {
    accessToken = next.accessToken;
    refreshToken = next.refreshToken;
    localStorage.setItem(REFRESH_KEY, next.refreshToken);
    notify();
  },

  setAccessToken(token: string) {
    accessToken = token;
    notify();
  },

  clear() {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem(REFRESH_KEY);
    notify();
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
