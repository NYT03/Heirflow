import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Database, Users, FileText, AlertCircle, Menu, LogOut, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Assets', icon: Database, to: '/assets' },
  { label: 'Nominees', icon: Users, to: '/nominees' },
  { label: 'Estate Plan', icon: FileText, to: '/estate-plan' },
  { label: 'Claims', icon: AlertCircle, to: '/claims' },
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
    <div className="min-h-screen bg-slate-900 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 h-screen w-64 bg-slate-800/80 border-r border-slate-700 backdrop-blur-sm
        flex flex-col z-30 transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              HeirFlow
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, to }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'}
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User area */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-10 bg-slate-800/80 border-b border-slate-700 px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
          <button onClick={() => setMobileOpen(true)} className="text-slate-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            HeirFlow
          </span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;

