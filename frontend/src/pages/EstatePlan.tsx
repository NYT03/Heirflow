import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Shield, Zap, AlertTriangle, X, ChevronRight, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import AICopilot from '../components/AICopilot';
import api from '../api/client';
import { Asset, Nominee } from '../types';
import toast from 'react-hot-toast';

const EstatePlan: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [aRes, nRes] = await Promise.all([api.get('/assets'), api.get('/nominees')]);
        if (aRes.data.success) setAssets(aRes.data.data);
        if (nRes.data.success) setNominees(nRes.data.data);
      } catch { toast.error('Failed to load estate data'); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const hasAssets = assets.length > 0;
  const hasNominees = nominees.length > 0;
  const hasInstructions = assets.some(a => a.instructions);
  const hasKeyShares = nominees.length >= 2;
  const isComplete = hasAssets && hasNominees && hasInstructions;

  const completeness = [true, hasAssets, hasNominees, hasInstructions, hasKeyShares].filter(Boolean).length;
  const totalSteps = 5;

  const checklist = [
    { label: 'Identity Verified', desc: 'Your account is registered and verified', done: true },
    { label: 'Assets Added', desc: `${assets.length} asset${assets.length !== 1 ? 's' : ''} in your vault`, done: hasAssets },
    { label: 'Nominees Set', desc: `${nominees.length} nominee${nominees.length !== 1 ? 's' : ''} trusted with your estate`, done: hasNominees },
    { label: 'Instructions Configured', desc: 'Assets have transfer/cancel/recover instructions', done: hasInstructions },
    { label: 'Key Shares Distributed', desc: 'At least 2 nominees have key shares for quorum', done: hasKeyShares },
  ];

  const handleActivate = async () => {
    setActivating(true);
    try {
      await new Promise(r => setTimeout(r, 1500)); // simulate
      setActivated(true);
      setShowConfirm(false);
      toast.success('Estate plan activated! 🎉 Your legacy is now protected.');
    } catch {
      toast.error('Failed to activate');
    } finally { setActivating(false); }
  };

  const getInstructionColor = (instr: string) => {
    if (instr === 'transfer') return 'bg-green-500/10 text-green-300 border-green-500/20';
    if (instr === 'cancel') return 'bg-red-500/10 text-red-300 border-red-500/20';
    return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = { bank: '🏦', crypto: '₿', subscription: '💳', file: '📂', property: '🏠', social: '📱' };
    return icons[type] || '📋';
  };

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
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Estate Plan</h1>
            <p className="text-slate-400 mt-1">Review and activate your digital estate plan</p>
          </div>
          {!activated ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!isComplete}
              className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-green-900/40"
            >
              <Zap className="w-5 h-5" />
              Activate Estate Plan
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/40 text-green-300 px-5 py-3 rounded-xl font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              Plan Active
            </div>
          )}
        </div>

        {!isComplete && (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200">Complete the checklist below to activate your estate plan. All items must be done before activation.</p>
          </div>
        )}

        {/* Progress */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Completion Progress</h2>
            <span className="text-2xl font-bold text-indigo-400">{Math.round((completeness / totalSteps) * 100)}%</span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000"
              style={{ width: `${(completeness / totalSteps) * 100}%` }}
            />
          </div>

          {/* Checklist */}
          <div className="space-y-4">
            {checklist.map(({ label, desc, done }, i) => (
              <div key={label} className={`flex items-start gap-4 p-4 rounded-xl transition-colors ${done ? 'bg-green-900/10 border border-green-800/30' : 'bg-slate-900/40 border border-slate-700'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                  {done ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-bold">{i + 1}</span>}
                </div>
                <div>
                  <p className={`font-medium ${done ? 'text-green-300' : 'text-slate-300'}`}>{label}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Summary */}
        {assets.length > 0 && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Asset Instructions Summary</h2>
            <div className="space-y-3">
              {assets.map(asset => {
                const nominee = nominees.find(n => n.id === asset.nominee_id);
                return (
                  <div key={asset.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{getTypeIcon(asset.type)}</span>
                      <div>
                        <p className="font-medium text-white text-sm">{asset.name}</p>
                        {nominee && <p className="text-xs text-slate-400">→ {nominee.name}</p>}
                      </div>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full border ${getInstructionColor(asset.instructions)} font-medium capitalize`}>
                      {asset.instructions}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">What Happens When a Claim is Filed</h2>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-700" />
            {[
              { title: 'Nominee files claim', desc: 'A nominated person submits the death certificate and their key share.', color: 'bg-blue-500' },
              { title: 'Identity verification', desc: 'HeirFlow verifies the claimant and death certificate.', color: 'bg-purple-500' },
              { title: '7-day grace period', desc: 'A countdown runs allowing the original account holder to contest.', color: 'bg-amber-500' },
              { title: 'Quorum check', desc: 'At least 2 key shares are submitted by different nominees.', color: 'bg-orange-500' },
              { title: 'Automatic execution', desc: 'Assets are transferred, cancelled, or recovered per your instructions.', color: 'bg-green-500' },
            ].map(({ title, desc, color }, i) => (
              <div key={title} className="relative flex items-start gap-6 pl-10 pb-6 last:pb-0">
                <div className={`absolute left-0 w-8 h-8 ${color} rounded-full flex items-center justify-center text-white text-xs font-bold z-10`}>
                  {i + 1}
                </div>
                <div>
                  <p className="font-medium text-white">{title}</p>
                  <p className="text-sm text-slate-400 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-900/30 border border-green-700/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Activate Estate Plan?</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Your estate plan will go live. Nominees can now initiate claims. This action can be updated at any time.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:border-slate-500 font-medium transition-colors">Cancel</button>
              <button onClick={handleActivate} disabled={activating} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-medium transition-all">
                {activating ? 'Activating...' : '✓ Activate Now'}
              </button>
            </div>
          </div>
        </div>
      )}
      <AICopilot />
    </Layout>
  );
};

export default EstatePlan;

