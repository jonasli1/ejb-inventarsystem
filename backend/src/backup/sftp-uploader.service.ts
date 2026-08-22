import { Injectable } from '@nestjs/common';
import SftpClient from 'ssh2-sftp-client';

export interface SftpTarget {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
}

@Injectable()
export class SftpUploaderService {
  async test(target: SftpTarget): Promise<void> {
    const client = new SftpClient();
    try {
      await client.connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password,
        readyTimeout: 10_000,
      });
      await client.list(target.remotePath || '/');
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async upload(
    target: SftpTarget,
    buffer: Buffer,
    fileName: string,
  ): Promise<void> {
    const client = new SftpClient();
    try {
      await client.connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password,
        readyTimeout: 10_000,
      });
      const remoteDir = target.remotePath || '/';
      if (!(await client.exists(remoteDir))) {
        await client.mkdir(remoteDir, true);
      }
      const remoteFile = `${remoteDir.replace(/\/$/, '')}/${fileName}`;
      await client.put(buffer, remoteFile);
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
