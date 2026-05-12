import { useState, useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CreditCard,
  FileText,
  Layers,
  Mail,
  TicketPercent,
  Menu,
  X,
  LogOut,
  User,
  ArrowLeft,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AdminShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/admin/enrollments', label: 'Inscritos', icon: Users, end: false },
  { to: '/admin/settings/payment', label: 'Pagamentos', icon: CreditCard, end: false },
  { to: '/admin/settings/form', label: 'Formulário', icon: FileText, end: false },
  { to: '/admin/settings/batches', label: 'Lotes', icon: Layers, end: false },
  { to: '/admin/settings/coupons', label: 'Cupons', icon: TicketPercent, end: false },
  { to: '/admin/settings/emails', label: 'Emails', icon: Mail, end: false },
];

export default function AdminShell({ children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement>(null);

  // Close drawer when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        mobileOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileOpen]);

  // Close drawer on resize to desktop
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (window.innerWidth < 1024) {
      setMobileOpen(false);
    }
  };

  const userName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
    : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            Área Mais
          </span>
          <span className="ml-1 rounded-md bg-purple/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple">
            Admin
          </span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 rounded-lg p-2 text-sm font-medium text-purple transition-colors hover:bg-purple/5"
          title="Voltar ao site"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </header>

      {/* Mobile drawer overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          ref={sidebarRef}
          className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
            mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          }`}
        >
          {/* Sidebar header */}
          <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4 lg:h-16 lg:px-5">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-gray-900">
                Área Mais
              </span>
              <span className="rounded-md bg-purple/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple">
                Admin
              </span>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1 px-3 py-4">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple/10 text-purple'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Bottom section */}
          <div className="absolute inset-x-0 bottom-0 border-t border-gray-100 bg-white px-3 py-3">
            <div className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple/10">
                <User className="h-4 w-4 text-purple" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {userName}
                </p>
                {user && (
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
              Sair
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
