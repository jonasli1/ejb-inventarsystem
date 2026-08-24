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
import { CreateGroupOrganizationScopeDto } from './dto/create-group-organization-scope.dto';

export interface LoanScopeEntry {
  organizationId: string;
  organizationUnitId: string | null;
}

const SCOPE_INCLUDE = {
  organizationScopes: {
    include: { organization: true, organizationUnit: true },
  },
};

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
        include: SCOPE_INCLUDE,
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
      include: SCOPE_INCLUDE,
    });
    if (!group) throw new NotFoundException('Group not found.');
    return group;
  }

  private async assertOrganizationAndUnitExist(
    organizationId: string,
    organizationUnitId?: string,
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found.');

    if (organizationUnitId) {
      const unit = await this.prisma.organizationUnit.findFirst({
        where: { id: organizationUnitId, organizationId, deletedAt: null },
      });
      if (!unit) throw new NotFoundException('Organization unit not found.');
    }
  }

  async create(dto: CreateGroupDto, actorId?: string) {
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

  // -----------------------------------------------------------------------
  // Group -> Organization/Unit scope (basis for org/unit-scoped loan
  // approval, issuing and returning)
  // -----------------------------------------------------------------------

  async listOrganizationScopes(groupId: string) {
    await this.findOne(groupId);
    return this.prisma.groupOrganizationScope.findMany({
      where: { groupId },
      include: { organization: true, organizationUnit: true },
    });
  }

  async addOrganizationScope(
    groupId: string,
    dto: CreateGroupOrganizationScopeDto,
  ) {
    await this.findOne(groupId);
    await this.assertOrganizationAndUnitExist(
      dto.organizationId,
      dto.organizationUnitId,
    );

    // Not a upsert-by-compound-key: Prisma's generated compound-unique
    // "where" input for this constraint requires organizationUnitId to be a
    // non-null string even though the column (and the NULLS NOT DISTINCT
    // index) is nullable - it can't express the whole-org (null) case.
    const existing = await this.prisma.groupOrganizationScope.findFirst({
      where: {
        groupId,
        organizationId: dto.organizationId,
        organizationUnitId: dto.organizationUnitId ?? null,
      },
    });
    if (existing) {
      return this.prisma.groupOrganizationScope.findUniqueOrThrow({
        where: { id: existing.id },
        include: { organization: true, organizationUnit: true },
      });
    }
    return this.prisma.groupOrganizationScope.create({
      data: {
        groupId,
        organizationId: dto.organizationId,
        organizationUnitId: dto.organizationUnitId,
      },
      include: { organization: true, organizationUnit: true },
    });
  }

  async removeOrganizationScope(
    groupId: string,
    scopeId: string,
  ): Promise<void> {
    await this.prisma.groupOrganizationScope.deleteMany({
      where: { id: scopeId, groupId },
    });
  }

  /**
   * Every (organization, unit-or-null) scope granted to a user by any
   * (non-deleted) group they belong to. `organizationUnitId: null` means the
   * whole organization. Basis for the org/unit-scoped loans.manage/spend
   * permissions - see LoansService.
   */
  async getLoanScopeForUser(userId: string): Promise<LoanScopeEntry[]> {
    const scopes = await this.prisma.groupOrganizationScope.findMany({
      where: { group: { deletedAt: null, userGroups: { some: { userId } } } },
      select: { organizationId: true, organizationUnitId: true },
    });
    const seen = new Set<string>();
    const result: LoanScopeEntry[] = [];
    for (const s of scopes) {
      const key = `${s.organizationId}:${s.organizationUnitId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(s);
    }
    return result;
  }

  /**
   * Every user id whose group scope covers at least one of the given items'
   * (org, unit) pairs. Intentionally a broad match (on org alone, even if the
   * specific unit differs across a multi-item loan) - meant only for
   * notification-eligibility fan-out, never as the hard authorization
   * boundary (see LoansService for the strict per-item check).
   */
  async getUserIdsWithLoanScopeForItems(
    items: { ownerOrganizationId: string; ownerUnitId: string }[],
  ): Promise<Set<string>> {
    if (items.length === 0) return new Set();
    const organizationIds = [
      ...new Set(items.map((i) => i.ownerOrganizationId)),
    ];

    const scopes = await this.prisma.groupOrganizationScope.findMany({
      where: { organizationId: { in: organizationIds } },
      select: {
        organizationId: true,
        organizationUnitId: true,
        group: {
          select: {
            deletedAt: true,
            userGroups: { select: { userId: true } },
          },
        },
      },
    });

    const userIds = new Set<string>();
    for (const scope of scopes) {
      if (scope.group.deletedAt) continue;
      const matches = items.some(
        (i) =>
          i.ownerOrganizationId === scope.organizationId &&
          (scope.organizationUnitId === null ||
            scope.organizationUnitId === i.ownerUnitId),
      );
      if (!matches) continue;
      for (const ug of scope.group.userGroups) userIds.add(ug.userId);
    }
    return userIds;
  }
}
