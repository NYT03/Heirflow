import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Database, Users, Shield, Plus, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import Layout from '../components/Layout';
import AICopilot from '../components/AICopilot';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { DashboardData } from '../types';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/dashboard');
        if (res.data.success) setData(res.data.data);
      } catch {
        // show fallback
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const completeness = data?.estate_completeness ?? 0;
  const getCompletenessColor = () => {
    if (completeness < 30) return 'from-red-500 to-orange-500';
    if (completeness < 70) return 'from-yellow-500 to-amber-500';
    return 'from-green-500 to-emerald-500';
  };

  const getTimeOfDay = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const statCards = [
    { label: 'Total Assets', value: data?.assets_count ?? '—', icon: Database, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Nominees Set', value: data?.nominees_count ?? '—', icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Estate Status', value: completeness >= 100 ? 'Active' : 'Draft', icon: Shield, color: completeness >= 100 ? 'text-green-400' : 'text-yellow-400', bg: completeness >= 100 ? 'bg-green-500/10' : 'bg-yellow-500/10' },
    { label: 'Completeness', value: `${completeness}%`, icon: TrendingUp, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            {getTimeOfDay()}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 mt-1">Here's your estate overview</p>
        </div>

        {/* Estate Completeness Bar */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-white">Estate Plan Completeness</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                {completeness < 30 ? 'Just getting started — add some assets!' :
                  completeness < 70 ? 'Good progress — keep going!' :
                    completeness < 100 ? 'Almost there — finalize your plan!' :
                      'Your estate plan is complete! 🎉'}
              </p>
            </div>
            <span className={`text-2xl font-bold bg-gradient-to-r ${getCompletenessColor()} bg-clip-text text-transparent`}>
              {completeness}%
            </span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${getCompletenessColor()} rounded-full transition-all duration-1000`}
              style={{ width: `${completeness}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-sm text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/assets" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-lg shadow-blue-900/30">
              <Plus className="w-4 h-4" /> Add Asset
            </Link>
            <Link to="/nominees" className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-lg shadow-purple-900/30">
              <Plus className="w-4 h-4" /> Add Nominee
            </Link>
            <Link to="/estate-plan" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-lg shadow-indigo-900/30">
              <Shield className="w-4 h-4" /> View Estate Plan
            </Link>
            <Link to="/claims" className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors">
              <AlertCircle className="w-4 h-4" /> Claims Portal
            </Link>
          </div>
        </div>

        {/* Checklist + Activity */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Checklist */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Estate Checklist</h2>
            <div className="space-y-3">
              {[
                { label: 'Create Account', done: true },
                { label: 'Add at least one asset', done: (data?.assets_count ?? 0) > 0 },
                { label: 'Add at least one nominee', done: (data?.nominees_count ?? 0) > 0 },
                { label: 'Configure asset instructions', done: (data?.assets_count ?? 0) > 0 },
                { label: 'Distribute key shares', done: (data?.nominees_count ?? 0) >= 2 },
                { label: 'Activate estate plan', done: completeness >= 100 },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-3">
                  {done
                    ? <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                    : <div className="w-5 h-5 border-2 border-slate-600 rounded-full flex-shrink-0" />}
                  <span className={`text-sm ${done ? 'text-green-300 line-through decoration-green-500/50' : 'text-slate-300'}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
            </div>
            {data?.recent_activity && data.recent_activity.length > 0 ? (
              <div className="space-y-3">
                {data.recent_activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="w-7 h-7 bg-indigo-900/40 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Clock className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-200">{item.action}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No activity yet</p>
                <p className="text-slate-500 text-xs mt-1">Start by adding assets or nominees</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <AICopilot />
    </Layout>
  );
};

// FileText is used in quickActions but not imported, fix:
function FileText(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export default Dashboard;

