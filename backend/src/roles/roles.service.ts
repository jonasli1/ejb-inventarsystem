import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import {
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions/app.exception';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

// The Admin role is the system's only guaranteed path to full access; deleting
// it (accidentally or otherwise) could lock every administrator out of RBAC
// management entirely, so it is protected here regardless of who deletes it.
const PROTECTED_ROLE_NAME = 'Admin';

// Create/update/delete are audited automatically by AuditInterceptor (see
// the @Audited() decorator on RolesController).
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationPreferences: NotificationPreferencesService,
  ) {}

  findAll() {
    return this.prisma.role.findMany({
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new AppNotFoundException('Rolle nicht gefunden.');
    return role;
  }

  async create(dto: CreateRoleDto) {
    return this.prisma.role.create({ data: dto });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id);
    if (
      role.name === PROTECTED_ROLE_NAME &&
      dto.name !== undefined &&
      dto.name !== PROTECTED_ROLE_NAME
    ) {
      throw new AppForbiddenException(
        `Die Rolle "${PROTECTED_ROLE_NAME}" kann nicht umbenannt werden, um den letzten garantierten Zugang zum System nicht zu verlieren.`,
        'PROTECTED_ROLE',
      );
    }
    return this.prisma.role.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.name === PROTECTED_ROLE_NAME) {
      throw new AppForbiddenException(
        `Die Rolle "${PROTECTED_ROLE_NAME}" kann nicht gelöscht werden, um zu verhindern, dass alle Administratoren ausgesperrt werden.`,
        'PROTECTED_ROLE',
      );
    }
    await this.prisma.role.delete({ where: { id } });
  }

  async assignPermission(roleId: string, permissionId: string) {
    await this.findOne(roleId);
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!permission)
      throw new AppNotFoundException('Berechtigung nicht gefunden.');

    return this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  }

  async removePermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.deleteMany({
      where: { roleId, permissionId },
    });

    // Losing this permission may make some users ineligible for notification
    // events that required it, so their preferences need re-checking.
    const affectedUsers = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    await this.notificationPreferences.pruneForUsers(
      affectedUsers.map((u) => u.userId),
    );
  }
}
