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
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logoCompleto from '../assets/logo-completo.svg';

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

const brandPurple = 'rgb(165, 44, 240)';

const sidebarCardStyle = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.9) 100%)',
  boxShadow: '0 24px 60px rgba(17, 24, 39, 0.08)',
};

export default function AdminShell({ children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
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
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(165, 44, 240, 0.10), transparent 28%), radial-gradient(circle at top right, rgba(220, 253, 97, 0.16), transparent 24%), #f5f6fb',
      }}
    >
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img src={logoCompleto} alt="Área Mais" className="h-10 w-auto max-w-[180px] object-contain" />
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-purple transition-colors hover:bg-purple/5"
            title="Voltar ao site"
          >
            <ArrowLeft className="h-4 w-4" />
            Site
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/35 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-0 px-0 lg:px-6 lg:py-6">
        <aside
          ref={sidebarRef}
          className={`fixed inset-y-0 left-0 z-50 w-[290px] transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:pr-6 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div
            className="relative flex h-full flex-col overflow-hidden border-r border-white/60 px-4 py-4 lg:rounded-[28px] lg:border"
            style={sidebarCardStyle}
          >
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <img src={logoCompleto} alt="Área Mais" className="h-11 w-auto max-w-[200px] object-contain" />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="hidden lg:block">
              <div
                className="flex flex-col items-center rounded-[24px] border p-5 text-center shadow-sm"
                style={{
                  background: 'linear-gradient(180deg, rgb(88, 28, 135) 0%, rgb(109, 40, 217) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.14)',
                }}
              >
                <img src={logoCompleto} alt="Área Mais" className="h-16 w-auto max-w-[230px] object-contain" />
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
                  <Sparkles className="h-4 w-4 text-white" />
                  Painel administrativo
                </div>
              </div>
            </div>

            <nav className="mt-6 flex flex-1 flex-col gap-1.5">
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? 'text-white shadow-lg'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          background:
                            'linear-gradient(135deg, rgb(165, 44, 240) 0%, rgba(165, 44, 240, 0.84) 100%)',
                          boxShadow: '0 18px 40px rgba(165, 44, 240, 0.24)',
                        }
                      : undefined
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
                        style={{
                          backgroundColor: isActive ? 'rgba(255, 255, 255, 0.16)' : 'rgba(165, 44, 240, 0.08)',
                        }}
                      >
                        <Icon
                          className="h-[18px] w-[18px] transition-colors"
                          style={{ color: isActive ? '#ffffff' : brandPurple }}
                        />
                      </span>
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple/10">
                  <User className="h-5 w-5 text-purple" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{userName}</p>
                  {user && <p className="truncate text-xs text-gray-500">{user.email}</p>}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                <LogOut className="h-[18px] w-[18px]" />
                Sair
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 lg:px-0 lg:py-0">
          <div className="min-h-full rounded-[28px] border border-white/70 bg-white/55 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
