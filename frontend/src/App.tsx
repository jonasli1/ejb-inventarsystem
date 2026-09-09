import { lazy } from 'react';
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
import { PermissionGate } from '@/auth/PermissionGate';
import { PERMISSIONS } from '@/lib/permissions';

// Everything behind the authenticated shell is code-split per route - none
// of it is needed before login, and a user typically only ever visits a
// handful of these pages in a session.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const InventoryPage = lazy(() => import('@/features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ArticlesPage = lazy(() => import('@/features/articles/ArticlesPage').then((m) => ({ default: m.ArticlesPage })));
const LocationsPage = lazy(() => import('@/features/locations/LocationsPage').then((m) => ({ default: m.LocationsPage })));
const OrganizationsPage = lazy(() =>
  import('@/features/organizations/OrganizationsPage').then((m) => ({ default: m.OrganizationsPage })),
);
const LoansPage = lazy(() => import('@/features/loans/LoansPage').then((m) => ({ default: m.LoansPage })));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage').then((m) => ({ default: m.ActivityPage })));
const UsersPage = lazy(() => import('@/features/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('@/features/roles/RolesPage').then((m) => ({ default: m.RolesPage })));
const GroupsPage = lazy(() => import('@/features/groups/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const GeneralSettingsPage = lazy(() =>
  import('@/features/settings/GeneralSettingsPage').then((m) => ({ default: m.GeneralSettingsPage })),
);
const BackupPage = lazy(() => import('@/features/settings/BackupPage').then((m) => ({ default: m.BackupPage })));
const EmailSettingsPage = lazy(() =>
  import('@/features/settings/EmailSettingsPage').then((m) => ({ default: m.EmailSettingsPage })),
);
const OneDriveCallbackPage = lazy(() =>
  import('@/features/settings/OneDriveCallbackPage').then((m) => ({ default: m.OneDriveCallbackPage })),
);

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
