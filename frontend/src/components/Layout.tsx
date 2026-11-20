import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Users, FileText, ShieldCheck, Menu, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Assets', icon: Database, to: '/assets' },
  { label: 'Nominees', icon: Users, to: '/nominees' },
  { label: 'Estate Plan', icon: FileText, to: '/estate-plan' },
  { label: 'Claims', icon: ShieldCheck, to: '/claims' },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/70 z-20 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 h-screen w-64 bg-[#0C0C0F] border-r border-zinc-800/80
        flex flex-col z-30 transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="px-6 py-5 border-b border-zinc-800/80">
          <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
            <Logo size="md" />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, to }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-zinc-900 text-zinc-100 border border-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 border border-transparent'}
                `}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-amber-200/90' : 'text-zinc-500'}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User area */}
        <div className="p-4 border-t border-zinc-800/80">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center text-xs font-semibold text-zinc-200 flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100 truncate">{user?.name}</p>
              <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-10 bg-[#0C0C0F]/95 border-b border-zinc-800/80 px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
          <button onClick={() => setMobileOpen(true)} className="text-zinc-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <Logo size="sm" />
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
