import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  CalendarDays,
  FileText,
  Layers,
  LogOut,
  Mail,
  Menu,
  TicketPercent,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AdminShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/admin/enrollments', label: 'Inscritos', icon: Users, end: false },
  { to: '/admin/empires', label: 'Impérios', icon: Users, end: false },
  { to: '/admin/social-quotas', label: 'Cota Social', icon: Wallet, end: false },
  { to: '/admin/settings/event', label: 'Evento', icon: CalendarDays, end: false },
  { to: '/admin/settings/payment', label: 'Pagamentos', icon: CreditCard, end: false },
  { to: '/admin/settings/form', label: 'Formulário', icon: FileText, end: false },
  { to: '/admin/settings/batches', label: 'Lotes', icon: Layers, end: false },
  { to: '/admin/settings/coupons', label: 'Cupons', icon: TicketPercent, end: false },
  { to: '/admin/settings/emails', label: 'Emails', icon: Mail, end: false },
];

export default function AdminShell({ children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement>(null);

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
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-900">
              Administrativo
            </span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-dark transition-colors hover:bg-gold/10"
            title="Voltar ao site"
          >
            <ArrowLeft className="h-4 w-4" />
            Site
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div className="flex min-h-screen">
        <aside
          ref={sidebarRef}
          className={`fixed inset-y-0 left-0 z-50 transform border-r border-gray-200 bg-white transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          } ${desktopCollapsed ? 'w-[80px]' : 'w-[248px]'}`}
        >
          <div className="flex h-full flex-col">
            <div
              className={`flex items-center border-b border-gray-100 py-5 ${
                desktopCollapsed ? 'justify-center px-3 lg:justify-between' : 'justify-between px-5'
              }`}
            >
              {!desktopCollapsed && (
                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-900">
                  Administrativo
                </span>
              )}
              {desktopCollapsed && (
                <span className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-gray-900 lg:block">
                  Adm
                </span>
              )}
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 lg:hidden"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                onClick={() => setDesktopCollapsed((value) => !value)}
                className="hidden rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:flex"
                aria-label={desktopCollapsed ? 'Expandir menu' : 'Recolher menu'}
                title={desktopCollapsed ? 'Expandir menu' : 'Recolher menu'}
              >
                {desktopCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </button>
            </div>

            <div className={`border-b border-gray-100 py-4 ${desktopCollapsed ? 'px-3' : 'px-4'}`}>
              <button
                onClick={() => navigate('/')}
                className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 ${
                  desktopCollapsed ? 'justify-center' : 'gap-3'
                }`}
                title="Voltar para o site"
              >
                <ArrowLeft className="h-[18px] w-[18px] flex-shrink-0" />
                {!desktopCollapsed && <span>Voltar para o site</span>}
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={handleNavClick}
                  title={desktopCollapsed ? label : undefined}
                  className={({ isActive }) =>
                    `flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-dark text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } ${desktopCollapsed ? 'justify-center' : 'gap-3'}`
                  }
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {!desktopCollapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </nav>

            <div className={`border-t border-gray-100 py-4 ${desktopCollapsed ? 'px-3' : 'px-4'}`}>
              <div
                className={`mb-3 flex items-center rounded-xl px-2 py-1 ${
                  desktopCollapsed ? 'justify-center' : 'gap-3'
                }`}
                title={desktopCollapsed ? userName : undefined}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15">
                  <User className="h-5 w-5 text-dark" />
                </div>
                {!desktopCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
                    {user && <p className="truncate text-xs text-gray-500">{user.email}</p>}
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 ${
                  desktopCollapsed ? 'justify-center' : 'gap-3'
                }`}
                title="Sair"
              >
                <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
                {!desktopCollapsed && <span>Sair</span>}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
