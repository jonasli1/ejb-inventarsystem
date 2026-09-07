import 'dotenv/config';
import { GroupSource, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ALL_PERMISSIONS } from '../src/common/constants/permissions';

const prisma = new PrismaClient();

const ROLE_DEFINITIONS: { name: string; description: string; permissionKeys: string[] }[] = [
  {
    name: 'Admin',
    description: 'Full system access',
    permissionKeys: ALL_PERMISSIONS.map((p) => p.key),
  },
  {
    name: 'Lagerwart',
    description: 'Manages inventory, locations, articles and loans (own organization)',
    permissionKeys: [
      'inventory.read',
      'inventory.create',
      'inventory.update',
      'inventory.delete',
      'inventory.retire',
      'inventory.change_inventory_number',
      'locations.read',
      'locations.create',
      'locations.update',
      'locations.delete',
      'articles.read',
      'articles.create',
      'articles.update',
      'articles.delete',
      'organizations.read',
      'loans.create',
      'loans.manage',
      'loans.spend',
      'reports.view',
    ],
  },
  {
    name: 'Ausleiher',
    description: 'Can create loans and view inventory',
    permissionKeys: [
      'loans.create',
      'inventory.read',
      'articles.read',
      'locations.read',
      'organizations.read',
    ],
  },
  {
    name: 'Betrachter',
    description: 'Read-only access',
    permissionKeys: [
      'inventory.read',
      'articles.read',
      'locations.read',
      'organizations.read',
      'loans.read',
      'reports.view',
    ],
  },
];

/** inventoryNumber is no longer @unique (just a partial index on active items), so upserts key on id via a findFirst lookup instead. */
async function upsertInventoryItemByNumber(
  inventoryNumber: string,
  create: Parameters<typeof prisma.inventoryItem.create>[0]['data'],
) {
  const existing = await prisma.inventoryItem.findFirst({
    where: { inventoryNumber },
  });
  if (existing) return existing;
  return prisma.inventoryItem.create({ data: create });
}

async function main() {
  console.log('Seeding permissions...');
  const permissionRecords = await Promise.all(
    ALL_PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        update: { displayName: p.displayName, description: p.description },
        create: {
          key: p.key,
          displayName: p.displayName,
          description: p.description,
        },
      }),
    ),
  );
  const permissionByKey = new Map(permissionRecords.map((p) => [p.key, p]));

  console.log('Seeding roles...');
  for (const roleDef of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { description: roleDef.description },
      create: { name: roleDef.name, description: roleDef.description },
    });

    for (const key of roleDef.permissionKeys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Admin' } });

  console.log('Seeding organizations...');
  const orgA = await prisma.organization.upsert({
    where: { name: 'Gemeinde A' },
    update: {},
    create: { name: 'Gemeinde A' },
  });
  const orgB = await prisma.organization.upsert({
    where: { name: 'Verein B' },
    update: {},
    create: { name: 'Verein B' },
  });

  const unitTechnik = await prisma.organizationUnit.upsert({
    where: { organizationId_name: { organizationId: orgA.id, name: 'Technik-Team' } },
    update: {},
    create: { organizationId: orgA.id, name: 'Technik-Team' },
  });
  const unitJugend = await prisma.organizationUnit.upsert({
    where: { organizationId_name: { organizationId: orgB.id, name: 'Jugendarbeit' } },
    update: {},
    create: { organizationId: orgB.id, name: 'Jugendarbeit' },
  });

  console.log('Seeding locations & rooms...');
  const gemeindehaus = await prisma.location.upsert({
    where: { id: (await prisma.location.findFirst({ where: { name: 'Gemeindehaus' } }))?.id ?? '' },
    update: {},
    create: { name: 'Gemeindehaus', address: 'Hauptstraße 1, 12345 Musterstadt' },
  });
  const aussenlager = await prisma.location.upsert({
    where: { id: (await prisma.location.findFirst({ where: { name: 'Außenlager Nord' } }))?.id ?? '' },
    update: {},
    create: { name: 'Außenlager Nord', address: 'Nordring 5, 12345 Musterstadt' },
  });

  const technikraum = await prisma.room.upsert({
    where: { locationId_name: { locationId: gemeindehaus.id, name: 'Technikraum' } },
    update: {},
    create: { locationId: gemeindehaus.id, name: 'Technikraum' },
  });
  const lager1 = await prisma.room.upsert({
    where: { locationId_name: { locationId: gemeindehaus.id, name: 'Lager 1' } },
    update: {},
    create: { locationId: gemeindehaus.id, name: 'Lager 1' },
  });
  const halle = await prisma.room.upsert({
    where: { locationId_name: { locationId: aussenlager.id, name: 'Halle' } },
    update: {},
    create: { locationId: aussenlager.id, name: 'Halle' },
  });

  console.log('Seeding categories & articles...');
  const categoryTechnik = await prisma.category.upsert({
    where: { id: (await prisma.category.findFirst({ where: { name: 'Technik' } }))?.id ?? '' },
    update: {},
    create: { name: 'Technik' },
  });

  // Object types (UNIQUE/BULK/CONSUMABLE) no longer exist - every article's
  // units behave the same way, one InventoryItem row per physical unit.
  const mischpult = await prisma.article.upsert({
    where: { id: (await prisma.article.findFirst({ where: { name: 'Mischpult Behringer X32' } }))?.id ?? '' },
    update: {},
    create: {
      name: 'Mischpult Behringer X32',
      description: 'Digitales 32-Kanal Mischpult',
      notes: 'Jährliche Kalibrierung durch den Technikbeauftragten erforderlich.',
      aliases: ['X32', 'Mischer', 'Behringer'],
      categoryId: categoryTechnik.id,
      manufacturer: 'Behringer',
    },
  });
  const netzkabel = await prisma.article.upsert({
    where: { id: (await prisma.article.findFirst({ where: { name: 'Netzkabel (Kaltgeräte)' } }))?.id ?? '' },
    update: {},
    create: {
      name: 'Netzkabel (Kaltgeräte)',
      description: 'Kaltgerätekabel für das Mischpult',
      aliases: ['Stromkabel Mischpult'],
      categoryId: categoryTechnik.id,
      unitOfMeasure: 'Stück',
    },
  });
  const stromkabel = await prisma.article.upsert({
    where: { id: (await prisma.article.findFirst({ where: { name: 'Stromkabel 5m' } }))?.id ?? '' },
    update: {},
    create: {
      name: 'Stromkabel 5m',
      description: 'Schuko-Verlängerungskabel, 5 Meter',
      aliases: ['Verlängerungskabel', 'Kabeltrommel 5m'],
      categoryId: categoryTechnik.id,
      unitOfMeasure: 'Stück',
    },
  });
  const gaffaTape = await prisma.article.upsert({
    where: { id: (await prisma.article.findFirst({ where: { name: 'Gaffa Tape Rolle' } }))?.id ?? '' },
    update: {},
    create: {
      name: 'Gaffa Tape Rolle',
      description: 'Gewebeklebeband, 50mm x 25m',
      aliases: ['Gaffer Tape', 'Panzertape'],
      categoryId: categoryTechnik.id,
      unitOfMeasure: 'Rolle',
    },
  });

  console.log('Seeding inventory items...');
  const mischpultItem = await upsertInventoryItemByNumber('INV-MISCHPULT-001', {
    articleId: mischpult.id,
    locationId: gemeindehaus.id,
    roomId: technikraum.id,
    ownerOrganizationId: orgA.id,
    ownerUnitId: unitTechnik.id,
    inventoryNumber: 'INV-MISCHPULT-001',
    status: 'available',
    serialNumber: 'X32-2024-0001',
    // Demonstrates the new DGUV V3 field.
    nextDguvV3Check: new Date(new Date().getFullYear() + 1, 2, 1),
  });

  // Demonstrates the accessory relation: this power cable belongs to (and is
  // only ever loaned/tracked together with) the mixing console above.
  const netzkabelItem = await upsertInventoryItemByNumber('INV-NETZKABEL-001', {
    articleId: netzkabel.id,
    locationId: gemeindehaus.id,
    roomId: technikraum.id,
    ownerOrganizationId: orgA.id,
    ownerUnitId: unitTechnik.id,
    inventoryNumber: 'INV-NETZKABEL-001',
    status: 'available',
  });
  if (!netzkabelItem.parentItemId) {
    await prisma.inventoryItem.update({
      where: { id: netzkabelItem.id },
      data: { parentItemId: mischpultItem.id },
    });
  }

  for (let i = 1; i <= 5; i++) {
    const inventoryNumber = `INV-KABEL-${String(i).padStart(3, '0')}`;
    await upsertInventoryItemByNumber(inventoryNumber, {
      articleId: stromkabel.id,
      locationId: gemeindehaus.id,
      roomId: lager1.id,
      ownerOrganizationId: orgA.id,
      ownerUnitId: unitTechnik.id,
      inventoryNumber,
      status: 'available',
    });
  }
  for (let i = 1; i <= 3; i++) {
    const inventoryNumber = `INV-KABEL-B-${String(i).padStart(3, '0')}`;
    await upsertInventoryItemByNumber(inventoryNumber, {
      articleId: stromkabel.id,
      locationId: aussenlager.id,
      roomId: halle.id,
      ownerOrganizationId: orgB.id,
      ownerUnitId: unitJugend.id,
      inventoryNumber,
      status: 'available',
    });
  }

  await upsertInventoryItemByNumber('INV-TAPE-001', {
    articleId: gaffaTape.id,
    locationId: gemeindehaus.id,
    roomId: lager1.id,
    ownerOrganizationId: orgB.id,
    ownerUnitId: unitJugend.id,
    inventoryNumber: 'INV-TAPE-001',
    status: 'available',
  });
  await upsertInventoryItemByNumber('INV-TAPE-002', {
    articleId: gaffaTape.id,
    locationId: gemeindehaus.id,
    roomId: lager1.id,
    ownerOrganizationId: orgB.id,
    ownerUnitId: unitJugend.id,
    inventoryNumber: 'INV-TAPE-002',
    status: 'available',
  });
  // Inventory numbers are optional now - one unlabeled item to demonstrate that.
  const unlabeledExists = await prisma.inventoryItem.findFirst({
    where: { articleId: gaffaTape.id, inventoryNumber: null },
  });
  if (!unlabeledExists) {
    await prisma.inventoryItem.create({
      data: {
        articleId: gaffaTape.id,
        locationId: gemeindehaus.id,
        roomId: lager1.id,
        ownerOrganizationId: orgB.id,
        ownerUnitId: unitJugend.id,
        status: 'available',
      },
    });
  }

  console.log('Seeding groups...');
  const groupVorstand = await prisma.group.upsert({
    where: { id: (await prisma.group.findFirst({ where: { name: 'Vorstand' } }))?.id ?? '' },
    update: {},
    create: { name: 'Vorstand', description: 'Leitungsgremium' },
  });
  await prisma.group.upsert({
    where: { id: (await prisma.group.findFirst({ where: { name: 'Technikteam' } }))?.id ?? '' },
    update: {},
    create: { name: 'Technikteam', description: 'Technik & Veranstaltungen' },
  });

  console.log('Seeding admin user...');
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@example.com')
    .trim()
    .toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
  const adminDisplayName = process.env.ADMIN_DISPLAY_NAME ?? 'System Administrator';

  const passwordHash = await argon2.hash(adminPassword);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { displayName: adminDisplayName },
    create: {
      email: adminEmail,
      displayName: adminDisplayName,
      authIdentities: {
        create: {
          provider: 'local',
          providerSubject: adminEmail,
          passwordHash,
        },
      },
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: adminUser.id, groupId: groupVorstand.id } },
    update: {},
    create: { userId: adminUser.id, groupId: groupVorstand.id, source: GroupSource.manual },
  });

  console.log('Seed completed.');
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
