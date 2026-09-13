import Testing
import Foundation
@testable import Inventarsystem

/// Decode tests using literal JSON captured from a live backend instance for the trickier
/// composition/wrapper shapes (roles wrap permissions in a join row; user detail composes
/// `User`'s own fields with extra side arrays), the same pattern already validated for
/// `ArticleListItem`/`InventoryItemDetail`.
struct RBACModelsTests {
    @Test func decodesRoleWithWrappedPermissions() throws {
        let json = Data("""
        {"id":"06e35a6a-5e12-45bd-965d-8b6cb170c404","name":"Admin","description":"Full system access","createdAt":"2026-09-12T16:21:06.341Z","updatedAt":"2026-09-12T16:21:06.341Z","rolePermissions":[{"roleId":"06e35a6a-5e12-45bd-965d-8b6cb170c404","permissionId":"c2f6cac5-42f3-4084-ba17-70dc0b1e7cc0","createdAt":"2026-09-12T16:21:06.355Z","permission":{"id":"c2f6cac5-42f3-4084-ba17-70dc0b1e7cc0","key":"articles.read","displayName":"Artikel ansehen","description":"Artikel und Kategorien ansehen und durchsuchen."}}]}
        """.utf8)

        let role = try APICoding.decoder.decode(Role.self, from: json)
        #expect(role.name == "Admin")
        #expect(role.permissions.count == 1)
        #expect(role.permissions.first?.key == "articles.read")
        #expect(role.permissions.first?.displayName == "Artikel ansehen")
    }

    @Test func decodesUserDetailWithAuthIdentitiesAndRoles() throws {
        let json = Data("""
        {"id":"bc92f09e-9741-4341-8fc1-adc8115237b3","displayName":"System Administrator","email":"admin@example.com","isActive":true,"themePreference":"system","createdAt":"2026-09-12T16:21:06.778Z","updatedAt":"2026-09-12T16:21:06.778Z","deletedAt":null,"authIdentities":[{"provider":"local","createdAt":"2026-09-12T16:21:06.778Z","deviceLabel":null}],"userRoles":[{"userId":"bc92f09e-9741-4341-8fc1-adc8115237b3","roleId":"06e35a6a-5e12-45bd-965d-8b6cb170c404","source":"manual","createdAt":"2026-09-12T16:21:06.781Z","role":{"id":"06e35a6a-5e12-45bd-965d-8b6cb170c404","name":"Admin"}}]}
        """.utf8)

        let detail = try APICoding.decoder.decode(UserDetail.self, from: json)
        #expect(detail.user.email == "admin@example.com")
        #expect(detail.authIdentities.first?.provider == "local")
        #expect(detail.userRoles.first?.role.name == "Admin")
        #expect(detail.userRoles.first?.source == "manual")
    }

    @Test func decodesGroupWithOrganizationScope() throws {
        let json = Data("""
        {"id":"603f4618-515c-4b4f-9a82-e40fcd3e6e7a","name":"Technikteam","externalRef":null,"description":"Technik & Veranstaltungen","createdAt":"2026-09-12T16:21:06.695Z","updatedAt":"2026-09-12T16:21:06.695Z","deletedAt":null,"organizationScopes":[{"id":"ef81a815-2f52-4d17-a9a3-5dcde7fba5d9","groupId":"603f4618-515c-4b4f-9a82-e40fcd3e6e7a","organizationId":"2607f183-7a00-4d4e-84f5-448a9cd6e54a","organizationUnitId":null,"organization":{"id":"2607f183-7a00-4d4e-84f5-448a9cd6e54a","name":"Gemeinde A","createdAt":"2026-09-12T16:21:06.573Z","updatedAt":"2026-09-12T16:21:06.573Z","deletedAt":null},"organizationUnit":null}]}
        """.utf8)

        let group = try APICoding.decoder.decode(AppGroup.self, from: json)
        #expect(group.name == "Technikteam")
        #expect(!group.isFromChurchTools)
        #expect(group.organizationScopes?.first?.organization.name == "Gemeinde A")
        #expect(group.organizationScopes?.first?.organizationUnit == nil)
    }

    @Test func permissionGroupingMatchesResourcePrefix() {
        #expect(PermissionGroup.group(forKey: "inventory.retire") == .inventory)
        #expect(PermissionGroup.group(forKey: "permissions.assign") == .rolesAndPermissions)
        #expect(PermissionGroup.group(forKey: "roles.read") == .rolesAndPermissions)
        #expect(PermissionGroup.group(forKey: "audit.read") == .audit)
        #expect(PermissionGroup.group(forKey: "settings.manage") == .settingsAndReports)
        #expect(PermissionGroup.group(forKey: "reports.view") == .settingsAndReports)
    }
}
