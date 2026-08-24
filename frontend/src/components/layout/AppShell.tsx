import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronDown, LogOut, Menu, Package, UserCircle, X } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { isPermitted } from '@/lib/permissions';
import { usePublicAppSettings } from '@/lib/app-settings';
import { NAV_ITEMS, type NavItem } from './nav-config';

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { data } = usePublicAppSettings();
  const boxSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const iconSize = size === 'sm' ? 13 : 17;
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex ${boxSize} shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-600 text-white`}
      >
        {data?.logoDataUrl ? (
          <img src={data.logoDataUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <Package size={iconSize} />
        )}
      </div>
      <span className="truncate text-sm font-semibold text-ink">
        {data?.displayName ?? 'Inventarsystem'}
      </span>
    </div>
  );
}

const linkClasses = (isActive: boolean) =>
  clsx(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-black/5 hover:text-ink',
  );

function NavGroup({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const children = (item.children ?? []).filter((c) => isPermitted(hasPermission, c.permission));
  const isChildActive = children.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(isChildActive);

  if (children.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(linkClasses(false), 'w-full justify-between')}
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <item.icon size={18} strokeWidth={1.75} />
          {item.label}
        </span>
        <ChevronDown size={15} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
          {children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={onNavigate}
              className={({ isActive }) => linkClasses(isActive)}
            >
              <child.icon size={16} strokeWidth={1.75} />
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { hasPermission } = useAuth();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {NAV_ITEMS.filter((item) => isPermitted(hasPermission, item.permission)).map((item) =>
        item.children ? (
          <NavGroup key={item.to} item={item} onNavigate={onNavigate} />
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => linkClasses(isActive)}
          >
            <item.icon size={18} strokeWidth={1.75} />
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}

export function AppShell() {
  const { me, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface py-5 md:flex">
        <div className="mb-6 px-4">
          <BrandMark />
        </div>
        <NavItems />
        <div className="mt-auto px-3 pt-4">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-black/5 hover:text-ink',
              )
            }
          >
            <UserCircle size={18} strokeWidth={1.75} />
            <span className="truncate">{me?.displayName}</span>
          </NavLink>
          <button
            onClick={() => void logout()}
            className="mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-black/5 hover:text-ink"
          >
            <LogOut size={18} strokeWidth={1.75} />
            Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface py-5">
            <div className="mb-6 flex items-center justify-between px-4">
              <BrandMark />
              <button onClick={() => setMobileOpen(false)} className="p-1 text-muted">
                <X size={20} />
              </button>
            </div>
            <NavItems onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto px-3 pt-4">
              <NavLink
                to="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-black/5 hover:text-ink"
              >
                <UserCircle size={18} strokeWidth={1.75} />
                <span className="truncate">{me?.displayName}</span>
              </NavLink>
              <button
                onClick={() => void logout()}
                className="mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-black/5 hover:text-ink"
              >
                <LogOut size={18} strokeWidth={1.75} />
                Abmelden
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar */}
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
          <button onClick={() => setMobileOpen(true)} className="p-1 text-ink">
            <Menu size={22} />
          </button>
          <BrandMark size="sm" />
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
