import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Settings } from 'lucide-react';

interface AdminShellProps {
  children: ReactNode;
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-white text-black shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`;

export default function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <aside className="w-full rounded-2xl bg-gray-950 p-4 text-white shadow-xl lg:sticky lg:top-6 lg:w-72 lg:self-start">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">Admin</p>
            <h1 className="mt-2 text-2xl font-bold">Área Mais</h1>
          </div>
          <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <NavLink to="/admin" end className={navLinkClassName}>
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </NavLink>
            <NavLink to="/admin/settings" className={navLinkClassName}>
              <Settings className="h-4 w-4" />
              Opções
            </NavLink>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
