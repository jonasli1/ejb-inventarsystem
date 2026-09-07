import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

  async create(dto: CreateRoleDto, actorId?: string) {
    const role = await this.prisma.role.create({ data: dto });
    await this.audit.log({
      entityType: 'Role',
      entityId: role.id,
      action: 'create',
      summary: `Rolle "${role.name}" angelegt`,
      userId: actorId,
    });
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actorId?: string) {
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
    const updated = await this.prisma.role.update({ where: { id }, data: dto });
    await this.audit.log({
      entityType: 'Role',
      entityId: id,
      action: 'update',
      summary: `Rolle "${role.name}" aktualisiert`,
      userId: actorId,
    });
    return updated;
  }

  async remove(id: string, actorId?: string) {
    const role = await this.findOne(id);
    if (role.name === PROTECTED_ROLE_NAME) {
      throw new AppForbiddenException(
        `Die Rolle "${PROTECTED_ROLE_NAME}" kann nicht gelöscht werden, um zu verhindern, dass alle Administratoren ausgesperrt werden.`,
        'PROTECTED_ROLE',
      );
    }
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({
      entityType: 'Role',
      entityId: id,
      action: 'delete',
      summary: `Rolle "${role.name}" gelöscht`,
      userId: actorId,
    });
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
