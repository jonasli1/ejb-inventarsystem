import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

interface PkceEntry {
  codeVerifier: string;
  createdAt: number;
}

export interface ChurchToolsProfile {
  personId: string;
  email?: string;
  displayName: string;
  groups: { id: string; name: string }[];
}

interface ChurchToolsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

const PKCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class ChurchToolsService {
  private readonly logger = new Logger(ChurchToolsService.name);
  private readonly pkceStore = new Map<string, PkceEntry>();

  constructor(private readonly config: ConfigService) {}

  private get cfg() {
    return this.config.get('churchtools') as {
      baseUrl: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      authorizationUrl: string;
      tokenUrl: string;
      profileUrl: string;
      scope: string;
    };
  }

  isConfigured(): boolean {
    const c = this.cfg;
    return Boolean(
      c.clientId && c.authorizationUrl && c.tokenUrl && c.profileUrl,
    );
  }

  buildAuthorizationUrl(): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new BadRequestException('ChurchTools login is not configured.');
    }
    const c = this.cfg;

    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    this.pkceStore.set(state, { codeVerifier, createdAt: Date.now() });
    this.cleanupExpired();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      scope: c.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return { url: `${c.authorizationUrl}?${params.toString()}`, state };
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<ChurchToolsProfile> {
    const entry = this.pkceStore.get(state);
    if (!entry) {
      throw new BadRequestException('Invalid or expired OAuth state.');
    }
    this.pkceStore.delete(state);

    if (Date.now() - entry.createdAt > PKCE_TTL_MS) {
      throw new BadRequestException('OAuth flow expired, please try again.');
    }

    const c = this.cfg;
    const tokenResponse = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: c.redirectUri,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        code_verifier: entry.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      this.logger.warn(
        `ChurchTools token exchange failed: ${tokenResponse.status}`,
      );
      throw new BadRequestException('ChurchTools token exchange failed.');
    }

    const token = (await tokenResponse.json()) as ChurchToolsTokenResponse;

    const profileResponse = await fetch(c.profileUrl, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!profileResponse.ok) {
      throw new BadRequestException('Failed to fetch ChurchTools profile.');
    }

    const profile = (await profileResponse.json()) as Record<string, any>;
    return this.mapProfile(profile);
  }

  // The shape of the ChurchTools profile/groups payload is external and
  // dynamic (varies by instance config), so it is parsed defensively here
  // rather than modeled with a strict interface.
  /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
  private mapProfile(raw: Record<string, any>): ChurchToolsProfile {
    const data = raw.data ?? raw;
    const groupsClaim: any[] = data.groups ?? data.groupMemberships ?? [];

    return {
      personId: String(data.id ?? data.personId ?? data.sub),
      email: data.email,
      displayName:
        data.displayName ??
        [data.firstName, data.lastName].filter(Boolean).join(' ') ??
        data.email,
      groups: groupsClaim.map((g) => ({
        id: String(g.id ?? g.groupId),
        name: g.name ?? g.title ?? `Group ${g.id ?? g.groupId}`,
      })),
    };
  }
  /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

  private cleanupExpired() {
    const now = Date.now();
    for (const [state, entry] of this.pkceStore.entries()) {
      if (now - entry.createdAt > PKCE_TTL_MS) {
        this.pkceStore.delete(state);
      }
    }
  }
}
