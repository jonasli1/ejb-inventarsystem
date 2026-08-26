-- Data backfill: introduce the inventory.change_inv_num permission (normally
-- seeded by `prisma db seed`, which routine deploys do NOT re-run - see
-- README "Aktualisieren") and grant it to every role that currently holds
-- inventory.manage, so existing inventory managers don't lose the ability to
-- change inventory numbers the moment it becomes its own dedicated gate.
-- Admins can split the permissions apart again afterwards via the Roles UI.
INSERT INTO "permissions" (id, key, description, created_at, updated_at)
SELECT gen_random_uuid(), 'inventory.change_inv_num',
       'Change an inventory item''s inventory number, independent of inventory.manage',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE key = 'inventory.change_inv_num');

INSERT INTO "role_permissions" (role_id, permission_id, created_at)
SELECT rp.role_id, change_inv_num.id, now()
FROM "role_permissions" rp
JOIN "permissions" manage ON rp.permission_id = manage.id AND manage.key = 'inventory.manage'
CROSS JOIN (SELECT id FROM "permissions" WHERE key = 'inventory.change_inv_num') change_inv_num
ON CONFLICT (role_id, permission_id) DO NOTHING;
