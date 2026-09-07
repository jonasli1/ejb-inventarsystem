import { plainToInstance } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { normalizeEmail, NormalizeEmail } from './normalize-email';

class Fixture {
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM  ')).toBe(
      'jane.doe@example.com',
    );
  });
});

describe('@NormalizeEmail()', () => {
  it('normalizes the field when the DTO is transformed via class-transformer', () => {
    const instance = plainToInstance(Fixture, {
      email: '  Jane.Doe@Example.COM  ',
    });
    expect(instance.email).toBe('jane.doe@example.com');
  });

  it('leaves non-string values untouched (validation catches those separately)', () => {
    const instance = plainToInstance(Fixture, { email: 123 as unknown });
    expect(instance.email).toBe(123);
  });
});
