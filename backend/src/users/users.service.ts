import { Injectable } from '@nestjs/common';
import {
  AuthProvider,
  GroupSource,
  RoleAssignSource,
} from '../generated/prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginate,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import {
  AppBadRequestException,
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions/app.exception';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly groups: GroupsService,
    private readonly notificationPreferences: NotificationPreferencesService,
  ) {}

  async findAll(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        authIdentities: {
          select: { provider: true, createdAt: true, deviceLabel: true },
        },
        userRoles: { include: { role: true } },
      },
    });
    if (!user) throw new AppNotFoundException('Benutzer nicht gefunden.');
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new AppConflictException(
        'Eine Person mit dieser E-Mail-Adresse existiert bereits.',
        'EMAIL_ALREADY_EXISTS',
      );
    }

    const passwordHash = dto.password
      ? await argon2.hash(dto.password)
      : undefined;

    return this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        isActive: dto.isActive ?? true,
        authIdentities: passwordHash
          ? {
              create: {
                provider: AuthProvider.local,
                providerSubject: dto.email,
                passwordHash,
              },
            }
          : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  async remove(id: string, currentUserId?: string) {
    await this.findOne(id);
    if (currentUserId && id === currentUserId) {
      throw new AppForbiddenException(
        'Sie können Ihr eigenes Konto nicht löschen.',
        'CANNOT_DELETE_SELF',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // -----------------------------------------------------------------------
  // Password / email management
  // -----------------------------------------------------------------------

  /** Admin-initiated: sets a new local password without knowing the old one. */
  async resetPassword(id: string, dto: ResetPasswordDto, actorId?: string) {
    await this.findOne(id);
    const passwordHash = await argon2.hash(dto.newPassword);

    const identity = await this.prisma.authIdentity.findFirst({
      where: { userId: id, provider: AuthProvider.local },
    });
    if (identity) {
      await this.prisma.authIdentity.update({
        where: { id: identity.id },
        data: { passwordHash },
      });
    } else {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id },
      });
      await this.prisma.authIdentity.create({
        data: {
          userId: id,
          provider: AuthProvider.local,
          providerSubject: user.email,
          passwordHash,
        },
      });
    }

    // Revoke existing sessions so the new password takes effect immediately.
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      entityType: 'User',
      entityId: id,
      action: 'update',
      summary: 'Passwort durch Administrator zurückgesetzt',
      userId: actorId,
    });
  }

  async changeEmail(id: string, dto: ChangeEmailDto, actorId?: string) {
    const user = await this.findOne(id);
    if (dto.email === user.email) return user;

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new AppConflictException(
        'Eine Person mit dieser E-Mail-Adresse existiert bereits.',
        'EMAIL_ALREADY_EXISTS',
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { email: dto.email } }),
      this.prisma.authIdentity.updateMany({
        where: { userId: id, provider: AuthProvider.local },
        data: { providerSubject: dto.email },
      }),
    ]);

    await this.audit.log({
      entityType: 'User',
      entityId: id,
      action: 'update',
      summary: `E-Mail-Adresse von "${user.email}" auf "${dto.email}" geändert`,
      userId: actorId,
    });

    return updated;
  }

  // -----------------------------------------------------------------------
  // Roles
  // -----------------------------------------------------------------------

  async assignRole(userId: string, roleId: string) {
    await this.findOne(userId);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new AppNotFoundException('Rolle nicht gefunden.');

    // A manual (re-)assignment always wins over a group-derived one, so it
    // survives even if the underlying group→role mapping is later removed.
    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: { source: RoleAssignSource.manual },
      create: { userId, roleId, source: RoleAssignSource.manual },
    });
  }

  async removeRole(userId: string, roleId: string) {
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) return;
    if (existing.source === RoleAssignSource.group) {
      throw new AppBadRequestException(
        'Diese Rolle wurde automatisch über eine Gruppenmitgliedschaft vergeben und kann nicht manuell entfernt werden. Entfernen Sie stattdessen die Gruppenmitgliedschaft oder die Gruppe-Rolle-Zuordnung.',
        'ROLE_FROM_GROUP',
      );
    }
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    await this.notificationPreferences.pruneForUser(userId);
  }

  // -----------------------------------------------------------------------
  // Groups (manual assignment only — ChurchTools sync happens on login)
  // -----------------------------------------------------------------------

  async listGroups(userId: string) {
    await this.findOne(userId);
    return this.prisma.userGroup.findMany({
      where: { userId },
      include: { group: true },
    });
  }

  async assignGroup(userId: string, groupId: string) {
    await this.findOne(userId);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
    });
    if (!group) throw new AppNotFoundException('Gruppe nicht gefunden.');

    const membership = await this.prisma.userGroup.upsert({
      where: { userId_groupId: { userId, groupId } },
      update: { source: GroupSource.manual },
      create: { userId, groupId, source: GroupSource.manual },
    });
    await this.groups.syncUserRoles(userId);
    return membership;
  }

  async removeGroup(userId: string, groupId: string) {
    const membership = await this.prisma.userGroup.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) return;
    if (membership.source !== GroupSource.manual) {
      throw new AppBadRequestException(
        'Diese Mitgliedschaft stammt aus ChurchTools und kann nicht manuell entfernt werden. Sie wird automatisch entfernt, sobald sie in ChurchTools nicht mehr vorhanden ist.',
        'MEMBERSHIP_FROM_CHURCHTOOLS',
      );
    }
    await this.prisma.userGroup.delete({ where: { id: membership.id } });
    await this.groups.syncUserRoles(userId);
  }
}
