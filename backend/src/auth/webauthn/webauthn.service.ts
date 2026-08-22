import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server';

interface ChallengeEntry {
  challenge: string;
  userId?: string;
  createdAt: number;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class WebauthnService {
  private readonly challengeStore = new Map<string, ChallengeEntry>();

  constructor(private readonly config: ConfigService) {}

  private get cfg() {
    return this.config.get('webauthn') as {
      rpId: string;
      rpName: string;
      origin: string;
    };
  }

  async createRegistrationOptions(
    userId: string,
    userEmail: string,
    userDisplayName: string,
    existingCredentialIds: string[],
  ) {
    const c = this.cfg;
    const options = await generateRegistrationOptions({
      rpName: c.rpName,
      rpID: c.rpId,
      userName: userEmail,
      userDisplayName,
      attestationType: 'none',
      excludeCredentials: existingCredentialIds.map((id) => ({ id })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const challengeId = crypto.randomUUID();
    this.challengeStore.set(challengeId, {
      challenge: options.challenge,
      userId,
      createdAt: Date.now(),
    });
    this.cleanupExpired();

    return { challengeId, options };
  }

  verifyRegistration(
    challengeId: string,
    response: RegistrationResponseJSON,
  ): Promise<VerifiedRegistrationResponse> {
    const entry = this.consumeChallenge(challengeId);
    const c = this.cfg;
    return verifyRegistrationResponse({
      response,
      expectedChallenge: entry.challenge,
      expectedOrigin: c.origin,
      expectedRPID: c.rpId,
    });
  }

  async createAuthenticationOptions(
    allowCredentialIds: {
      id: string;
      transports?: AuthenticatorTransportFuture[];
    }[],
  ) {
    const c = this.cfg;
    const options = await generateAuthenticationOptions({
      rpID: c.rpId,
      userVerification: 'preferred',
      allowCredentials: allowCredentialIds.length
        ? allowCredentialIds
        : undefined,
    });

    const challengeId = crypto.randomUUID();
    this.challengeStore.set(challengeId, {
      challenge: options.challenge,
      createdAt: Date.now(),
    });
    this.cleanupExpired();

    return { challengeId, options };
  }

  verifyAuthentication(
    challengeId: string,
    response: AuthenticationResponseJSON,
    credential: {
      id: string;
      publicKey: Uint8Array;
      counter: number;
      transports?: AuthenticatorTransportFuture[];
    },
  ): Promise<VerifiedAuthenticationResponse> {
    const entry = this.consumeChallenge(challengeId);
    const c = this.cfg;
    return verifyAuthenticationResponse({
      response,
      expectedChallenge: entry.challenge,
      expectedOrigin: c.origin,
      expectedRPID: c.rpId,
      credential: credential as WebAuthnCredential,
    });
  }

  private consumeChallenge(challengeId: string): ChallengeEntry {
    const entry = this.challengeStore.get(challengeId);
    if (!entry) {
      throw new BadRequestException('Invalid or expired challenge.');
    }
    this.challengeStore.delete(challengeId);
    if (Date.now() - entry.createdAt > CHALLENGE_TTL_MS) {
      throw new BadRequestException('Challenge expired, please try again.');
    }
    return entry;
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of this.challengeStore.entries()) {
      if (now - entry.createdAt > CHALLENGE_TTL_MS) {
        this.challengeStore.delete(id);
      }
    }
  }
}
