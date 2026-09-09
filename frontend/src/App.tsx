import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/auth/AuthContext';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { ToastProvider } from '@/components/ui/toast';
import { LightboxProvider } from '@/components/ui/ImageLightbox';
import { AppShell } from '@/components/layout/AppShell';
import { AppBranding } from '@/components/layout/AppBranding';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { ChurchToolsCallbackPage } from '@/features/auth/ChurchToolsCallbackPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { ArticlesPage } from '@/features/articles/ArticlesPage';
import { LocationsPage } from '@/features/locations/LocationsPage';
import { OrganizationsPage } from '@/features/organizations/OrganizationsPage';
import { LoansPage } from '@/features/loans/LoansPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { ActivityPage } from '@/features/activity/ActivityPage';
import { UsersPage } from '@/features/users/UsersPage';
import { RolesPage } from '@/features/roles/RolesPage';
import { GroupsPage } from '@/features/groups/GroupsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { GeneralSettingsPage } from '@/features/settings/GeneralSettingsPage';
import { BackupPage } from '@/features/settings/BackupPage';
import { EmailSettingsPage } from '@/features/settings/EmailSettingsPage';
import { OneDriveCallbackPage } from '@/features/settings/OneDriveCallbackPage';
import { PermissionGate } from '@/auth/PermissionGate';
import { PERMISSIONS } from '@/lib/permissions';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppBranding />
      <ToastProvider>
        <LightboxProvider>
          <AuthProvider>
            <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/churchtools/callback" element={<ChurchToolsCallbackPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route
                    path="inventory"
                    element={
                      <PermissionGate permission={PERMISSIONS.INVENTORY_READ}>
                        <InventoryPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="articles"
                    element={
                      <PermissionGate permission={PERMISSIONS.ARTICLES_READ}>
                        <ArticlesPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="locations"
                    element={
                      <PermissionGate permission={PERMISSIONS.LOCATIONS_READ}>
                        <LocationsPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="organizations"
                    element={
                      <PermissionGate permission={PERMISSIONS.ORGANIZATIONS_READ}>
                        <OrganizationsPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="loans"
                    element={
                      <PermissionGate
                        permission={[
                          PERMISSIONS.LOANS_CREATE,
                          PERMISSIONS.LOANS_READ,
                          PERMISSIONS.LOANS_MANAGE,
                          PERMISSIONS.LOANS_SPEND,
                          PERMISSIONS.LOANS_ADMINISTER,
                        ]}
                      >
                        <LoansPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="calendar"
                    element={
                      <PermissionGate
                        permission={[
                          PERMISSIONS.LOANS_READ,
                          PERMISSIONS.LOANS_MANAGE,
                          PERMISSIONS.LOANS_SPEND,
                          PERMISSIONS.LOANS_ADMINISTER,
                        ]}
                      >
                        <CalendarPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="activity"
                    element={
                      <PermissionGate permission={PERMISSIONS.INVENTORY_READ}>
                        <ActivityPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <PermissionGate permission={PERMISSIONS.USERS_READ}>
                        <UsersPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="roles"
                    element={
                      <PermissionGate permission={PERMISSIONS.ROLES_READ}>
                        <RolesPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="groups"
                    element={
                      <PermissionGate permission={PERMISSIONS.GROUPS_READ}>
                        <GroupsPage />
                      </PermissionGate>
                    }
                  />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route
                    path="settings/general"
                    element={
                      <PermissionGate permission={PERMISSIONS.SETTINGS_MANAGE}>
                        <GeneralSettingsPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="settings/backup"
                    element={
                      <PermissionGate permission={PERMISSIONS.SETTINGS_MANAGE}>
                        <BackupPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="settings/backup/onedrive/callback"
                    element={
                      <PermissionGate permission={PERMISSIONS.SETTINGS_MANAGE}>
                        <OneDriveCallbackPage />
                      </PermissionGate>
                    }
                  />
                  <Route
                    path="settings/email"
                    element={
                      <PermissionGate permission={PERMISSIONS.SETTINGS_MANAGE}>
                        <EmailSettingsPage />
                      </PermissionGate>
                    }
                  />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </BrowserRouter>
          </AuthProvider>
        </LightboxProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
