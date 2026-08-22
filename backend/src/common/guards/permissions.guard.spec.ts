import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';

function createContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('allows access when no permissions are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(createContext({ permissions: [] }))).toBe(true);
  });

  it('denies access when the user is missing', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['inventory.manage']);
    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('denies access when the user lacks the required permission', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['inventory.manage']);
    expect(() =>
      guard.canActivate(createContext({ permissions: ['inventory.view'] })),
    ).toThrow(ForbiddenException);
  });

  it('allows access when the user has all required permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['inventory.manage', 'inventory.view']);
    expect(
      guard.canActivate(
        createContext({
          permissions: ['inventory.view', 'inventory.manage', 'loans.create'],
        }),
      ),
    ).toBe(true);
  });

  describe('RequireAnyPermission (OR semantics)', () => {
    function mockAny(permissions: string[]) {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) =>
          key === ANY_PERMISSIONS_KEY ? permissions : undefined,
        );
    }

    it('allows access when the user has at least one of the any-permissions', () => {
      mockAny(['loans.view', 'loans.manage']);
      expect(
        guard.canActivate(createContext({ permissions: ['loans.view'] })),
      ).toBe(true);
    });

    it('denies access when the user has none of the any-permissions', () => {
      mockAny(['loans.view', 'loans.manage']);
      expect(() =>
        guard.canActivate(createContext({ permissions: ['loans.create'] })),
      ).toThrow(ForbiddenException);
    });

    it('combines with RequirePermissions: both an all-check and an any-check must pass', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) => {
          if (key === PERMISSIONS_KEY) return ['inventory.view'];
          if (key === ANY_PERMISSIONS_KEY)
            return ['loans.view', 'loans.manage'];
          return undefined;
        });
      expect(() =>
        guard.canActivate(
          createContext({ permissions: ['inventory.view', 'loans.create'] }),
        ),
      ).toThrow(ForbiddenException);
      expect(
        guard.canActivate(
          createContext({ permissions: ['inventory.view', 'loans.manage'] }),
        ),
      ).toBe(true);
    });
  });
});
