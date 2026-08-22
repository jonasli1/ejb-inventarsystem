import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
// 4 MiB chunks, must be a multiple of 320 KiB per the Graph upload-session docs.
const UPLOAD_CHUNK_SIZE = 4 * 320 * 1024 * 4;
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

export interface OneDriveTokenResult {
  accessToken: string;
  refreshToken: string;
}

async function assertOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new InternalServerErrorException(
      `${context} failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
}

@Injectable()
export class OneDriveUploaderService {
  constructor(private readonly config: ConfigService) {}

  private get clientId(): string {
    return this.config.get<string>('microsoft.clientId') ?? '';
  }
  private get clientSecret(): string {
    return this.config.get<string>('microsoft.clientSecret') ?? '';
  }
  private get tenantId(): string {
    return this.config.get<string>('microsoft.tenantId') ?? 'common';
  }
  private get redirectUri(): string {
    return this.config.get<string>('microsoft.redirectUri') ?? '';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: 'offline_access Files.ReadWrite',
      state,
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OneDriveTokenResult> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<OneDriveTokenResult> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async requestToken(
    extra: Record<string, string>,
  ): Promise<OneDriveTokenResult> {
    const res = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          ...extra,
        }),
      },
    );
    await assertOk(res, 'Microsoft token request');
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
  }

  async test(accessToken: string): Promise<void> {
    const res = await fetch(`${GRAPH_BASE}/me/drive`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await assertOk(res, 'OneDrive connectivity test');
  }

  async upload(
    accessToken: string,
    folderPath: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<void> {
    const cleanFolder = (folderPath || '/').replace(/^\/+|\/+$/g, '');
    const itemPath = cleanFolder ? `${cleanFolder}/${fileName}` : fileName;

    if (buffer.length <= SIMPLE_UPLOAD_LIMIT) {
      const res = await fetch(
        `${GRAPH_BASE}/me/drive/root:/${encodeURI(itemPath)}:/content`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
          },
          body: new Uint8Array(buffer),
        },
      );
      await assertOk(res, 'OneDrive upload');
      return;
    }

    const sessionRes = await fetch(
      `${GRAPH_BASE}/me/drive/root:/${encodeURI(itemPath)}:/createUploadSession`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: { '@microsoft.graph.conflictBehavior': 'replace' },
        }),
      },
    );
    await assertOk(sessionRes, 'OneDrive upload session creation');
    const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };

    for (let offset = 0; offset < buffer.length; offset += UPLOAD_CHUNK_SIZE) {
      const chunk = buffer.subarray(
        offset,
        Math.min(offset + UPLOAD_CHUNK_SIZE, buffer.length),
      );
      const rangeEnd = offset + chunk.length - 1;
      const chunkRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${rangeEnd}/${buffer.length}`,
        },
        body: new Uint8Array(chunk),
      });
      await assertOk(chunkRes, 'OneDrive chunk upload');
    }
  }
}
