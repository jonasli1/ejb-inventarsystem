import type { PrismaService } from '../../prisma/prisma.service';

/** Flattens a user's role -> permission assignments into a set of permission keys. */
export async function getEffectivePermissions(
  prisma: PrismaService,
  userId: string,
): Promise<Set<string>> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });

  const permissions = new Set<string>();
  for (const userRole of userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      permissions.add(rp.permission.key);
    }
  }
  return permissions;
}
