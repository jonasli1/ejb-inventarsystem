import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from '@/lib/api-client';
import type { TokenResponse } from '@/lib/api-types';

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export async function registerPasskey(deviceLabel?: string): Promise<void> {
  const { data } = await api.post<{
    challengeId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>('/auth/passkey/register/options');

  const response = await startRegistration({ optionsJSON: data.options });

  await api.post('/auth/passkey/register/verify', {
    challengeId: data.challengeId,
    response,
    deviceLabel,
  });
}

export async function loginWithPasskey(email?: string): Promise<TokenResponse> {
  const { data } = await api.post<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>('/auth/passkey/login/options', email ? { email } : {});

  const response = await startAuthentication({ optionsJSON: data.options });

  const verifyRes = await api.post<TokenResponse>('/auth/passkey/login/verify', {
    challengeId: data.challengeId,
    response,
  });

  return verifyRes.data;
}
