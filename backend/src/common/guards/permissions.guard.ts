import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import type { PermissionKey } from '../constants/permissions';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { AppForbiddenException } from '../exceptions/app.exception';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<PermissionKey[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if ((!required || required.length === 0) && !requiredAny?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new AppForbiddenException(
        'Anmeldung erforderlich.',
        'UNAUTHENTICATED',
      );
    }

    const hasAll =
      !required ||
      required.every((permission) => user.permissions.includes(permission));

    if (!hasAll) {
      throw new AppForbiddenException(
        `Fehlende Berechtigung(en): ${required!.join(', ')}`,
        'MISSING_PERMISSION',
      );
    }

    const hasAny =
      !requiredAny?.length ||
      requiredAny.some((permission) => user.permissions.includes(permission));

    if (!hasAny) {
      throw new AppForbiddenException(
        `Fehlende Berechtigung(en): eine von ${requiredAny!.join(', ')}`,
        'MISSING_PERMISSION',
      );
    }

    return true;
  }
}
