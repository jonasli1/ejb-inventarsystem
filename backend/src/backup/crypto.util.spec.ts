import { decryptSecret, encryptSecret } from './crypto.util';

describe('backup crypto.util', () => {
  const secret = 'a'.repeat(32);

  it('round-trips a value with the correct key', () => {
    const encrypted = encryptSecret('hunter2', secret);
    expect(encrypted).not.toContain('hunter2');
    expect(decryptSecret(encrypted, secret)).toBe('hunter2');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('hunter2', secret)).not.toBe(
      encryptSecret('hunter2', secret),
    );
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptSecret('hunter2', secret);
    expect(() => decryptSecret(encrypted, 'b'.repeat(32))).toThrow();
  });
});
