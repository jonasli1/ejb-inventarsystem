import {
  ForbiddenException,
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import type { PermissionKey } from '../constants/permissions';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

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
      throw new ForbiddenException('Not authenticated.');
    }

    const hasAll =
      !required ||
      required.every((permission) => user.permissions.includes(permission));

    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required permission(s): ${required.join(', ')}`,
      );
    }

    const hasAny =
      !requiredAny?.length ||
      requiredAny.some((permission) => user.permissions.includes(permission));

    if (!hasAny) {
      throw new ForbiddenException(
        `Missing required permission(s): one of ${requiredAny.join(', ')}`,
      );
    }

    return true;
  }
}
