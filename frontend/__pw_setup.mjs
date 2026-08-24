import { request } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:3000/api/v1';
const STATE_FILE = '/private/tmp/claude-501/-Users-jonas-Documents-Development-ejb-inventarsystem/2f3971fe-3883-40c3-8c3b-495002000d4b/scratchpad/pw-fixture-state.json';

const api = await request.newContext();

async function j(res) {
  const body = await res.json().catch(() => null);
  if (!res.ok()) {
    throw new Error(`${res.status()} ${res.url()} -> ${JSON.stringify(body)}`);
  }
  return body;
}
const post = async (path, headers, data) => j(await api.post(`${BASE}${path}`, { headers, data }));
const get = async (path, headers) => j(await api.get(`${BASE}${path}`, { headers }));

const loginRes = await api.post(`${BASE}/auth/login`, {
  data: { email: 'admin@example.com', password: 'ChangeMe123!' },
});
const { accessToken: adminToken } = await j(loginRes);
const auth = { Authorization: `Bearer ${adminToken}` };

const suffix = 'pwui' + Math.floor(Math.random() * 1e6);

const org = await post('/organizations', auth, { name: `PWUI Org ${suffix}` });
const unit = await post(`/organizations/${org.id}/units`, auth, { name: `PWUI Unit ${suffix}` });
const location = await post('/locations', auth, { name: `PWUI Location ${suffix}` });
const room = await post('/rooms', auth, { name: `PWUI Room ${suffix}`, locationId: location.id });
const article = await post('/articles', auth, { name: `PWUI Kamera ${suffix}`, type: 'UNIQUE' });
const item1 = await post('/inventory', auth, {
  articleId: article.id,
  locationId: location.id,
  roomId: room.id,
  ownerOrganizationId: org.id,
  ownerUnitId: unit.id,
});

const permissions = await get('/permissions', auth);
const permId = (key) => permissions.find((p) => p.key === key)?.id;

const manageRole = await post('/roles', auth, { name: `PWUI Manage ${suffix}` });
await post(`/roles/${manageRole.id}/permissions`, auth, { permissionId: permId('loans.manage') });
await post(`/roles/${manageRole.id}/permissions`, auth, { permissionId: permId('loans.view') });

const spendRole = await post('/roles', auth, { name: `PWUI Spend ${suffix}` });
await post(`/roles/${spendRole.id}/permissions`, auth, { permissionId: permId('loans.spend') });
await post(`/roles/${spendRole.id}/permissions`, auth, { permissionId: permId('loans.view') });

const createRole = await post('/roles', auth, { name: `PWUI Create ${suffix}` });
await post(`/roles/${createRole.id}/permissions`, auth, { permissionId: permId('loans.create') });

const group = await post('/groups', auth, { name: `PWUI Group ${suffix}` });
await post(`/groups/${group.id}/organization-scopes`, auth, { organizationId: org.id });

const password = 'PwuiPass123!';
async function makeUser(email, roleId, inGroup) {
  const user = await post('/users', auth, { email, displayName: email, password });
  await post(`/users/${user.id}/roles`, auth, { roleId });
  if (inGroup) {
    await post(`/users/${user.id}/groups`, auth, { groupId: group.id });
  }
  return user;
}

const manager = await makeUser(`pwui-manager-${suffix}@example.com`, manageRole.id, true);
const spender = await makeUser(`pwui-spender-${suffix}@example.com`, spendRole.id, true);
const creator = await makeUser(`pwui-creator-${suffix}@example.com`, createRole.id, false);

const state = {
  suffix, password,
  org, unit, location, room, article, item1,
  manageRole, spendRole, createRole, group,
  manager, spender, creator,
};
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log('FIXTURES OK');
console.log(JSON.stringify({ suffix, orgId: org.id, itemId: item1.id, articleName: article.name, manager: manager.email, spender: spender.email, creator: creator.email }, null, 2));

await api.dispose();
