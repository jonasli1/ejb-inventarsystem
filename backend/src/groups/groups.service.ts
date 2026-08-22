import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleAssignSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginate,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notificationPreferences: NotificationPreferencesService,
  ) {}

  async findAll(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where: { deletedAt: null },
        include: { organization: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.group.count({ where: { deletedAt: null } }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null },
      include: { organization: true },
    });
    if (!group) throw new NotFoundException('Group not found.');
    return group;
  }

  private async assertOrganizationExists(organizationId?: string) {
    if (!organizationId) return;
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found.');
  }

  async create(dto: CreateGroupDto, actorId?: string) {
    await this.assertOrganizationExists(dto.organizationId);
    const group = await this.prisma.group.create({ data: dto });
    await this.audit.log({
      entityType: 'Group',
      entityId: group.id,
      action: 'create',
      summary: `Gruppe "${group.name}" angelegt`,
      userId: actorId,
    });
    return group;
  }

  async update(id: string, dto: UpdateGroupDto, actorId?: string) {
    const before = await this.findOne(id);
    await this.assertOrganizationExists(dto.organizationId);
    const group = await this.prisma.group.update({ where: { id }, data: dto });
    await this.audit.log({
      entityType: 'Group',
      entityId: id,
      action: 'update',
      summary: `Gruppe "${before.name}" aktualisiert`,
      userId: actorId,
    });
    return group;
  }

  async remove(id: string, actorId?: string) {
    const group = await this.findOne(id);
    await this.prisma.group.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // Members lose any role they only held because of this group.
    await this.syncGroupMembersRoles(id);
    await this.audit.log({
      entityType: 'Group',
      entityId: id,
      action: 'delete',
      summary: `Gruppe "${group.name}" gelöscht`,
      userId: actorId,
    });
  }

  // -----------------------------------------------------------------------
  // Group -> Role auto-assignment
  // -----------------------------------------------------------------------

  async listRoles(groupId: string) {
    await this.findOne(groupId);
    return this.prisma.groupRole.findMany({
      where: { groupId },
      include: { role: true },
    });
  }

  async assignRole(groupId: string, roleId: string) {
    await this.findOne(groupId);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found.');

    const mapping = await this.prisma.groupRole.upsert({
      where: { groupId_roleId: { groupId, roleId } },
      update: {},
      create: { groupId, roleId },
    });
    await this.syncGroupMembersRoles(groupId);
    return mapping;
  }

  async removeRole(groupId: string, roleId: string) {
    await this.prisma.groupRole.deleteMany({ where: { groupId, roleId } });
    await this.syncGroupMembersRoles(groupId);
  }

  /** Re-syncs the group-derived roles for every current member of a group. */
  async syncGroupMembersRoles(groupId: string): Promise<void> {
    const members = await this.prisma.userGroup.findMany({
      where: { groupId },
      select: { userId: true },
    });
    for (const member of members) {
      await this.syncUserRoles(member.userId);
    }
  }

  /**
   * Grants/revokes group-derived roles (source = "group") for a single user
   * based on their current group memberships and each group's role mapping.
   * Roles assigned manually (source = "manual") are never touched here, even
   * if the same role also happens to be mapped to one of the user's groups.
   */
  async syncUserRoles(userId: string): Promise<void> {
    const memberships = await this.prisma.userGroup.findMany({
      where: { userId, group: { deletedAt: null } },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);

    const mappedRoles = groupIds.length
      ? await this.prisma.groupRole.findMany({
          where: { groupId: { in: groupIds } },
          select: { roleId: true },
        })
      : [];
    const desiredRoleIds = new Set(mappedRoles.map((r) => r.roleId));

    const currentGroupSourced = await this.prisma.userRole.findMany({
      where: { userId, source: RoleAssignSource.group },
      select: { roleId: true },
    });
    const currentGroupSourcedIds = new Set(
      currentGroupSourced.map((r) => r.roleId),
    );

    const toAdd = [...desiredRoleIds].filter(
      (id) => !currentGroupSourcedIds.has(id),
    );
    const toRemove = [...currentGroupSourcedIds].filter(
      (id) => !desiredRoleIds.has(id),
    );

    if (toAdd.length) {
      await this.prisma.userRole.createMany({
        data: toAdd.map((roleId) => ({
          userId,
          roleId,
          source: RoleAssignSource.group,
        })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await this.prisma.userRole.deleteMany({
        where: {
          userId,
          roleId: { in: toRemove },
          source: RoleAssignSource.group,
        },
      });
    }

    if (toAdd.length || toRemove.length) {
      await this.notificationPreferences.pruneForUser(userId);
    }
  }

  /**
   * The set of organizations a user "belongs to" for the purpose of the
   * org-scoped loans.manage permission: the distinct organizationId of every
   * (non-deleted) group the user is a member of that has one set.
   */
  async getOrganizationIdsForUser(userId: string): Promise<string[]> {
    const memberships = await this.prisma.userGroup.findMany({
      where: {
        userId,
        group: { deletedAt: null, organizationId: { not: null } },
      },
      select: { group: { select: { organizationId: true } } },
    });
    const ids = new Set(
      memberships
        .map((m) => m.group.organizationId)
        .filter((id): id is string => id != null),
    );
    return [...ids];
  }
}
