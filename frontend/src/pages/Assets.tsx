import React, { useEffect, useState, Fragment } from 'react';
import { Plus, Pencil, Trash2, Building2, Bitcoin, CreditCard, FolderOpen, Home, Share2, X, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout';
import AICopilot from '../components/AICopilot';
import api from '../api/client';
import { Asset, Nominee } from '../types';
import toast from 'react-hot-toast';

const ASSET_TYPES = ['bank', 'crypto', 'subscription', 'file', 'property', 'social'];
const ASSET_TABS = ['All', 'Bank Accounts', 'Crypto', 'Subscriptions', 'Files', 'Property', 'Social'];
const TAB_TO_TYPE: Record<string, string> = {
  'Bank Accounts': 'bank',
  'Crypto': 'crypto',
  'Subscriptions': 'subscription',
  'Files': 'file',
  'Property': 'property',
  'Social': 'social',
};

const TYPE_COLORS: Record<string, string> = {
  bank: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  crypto: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  subscription: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  file: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  property: 'bg-green-500/20 text-green-300 border-green-500/30',
  social: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

const TYPE_ICONS: Record<string, React.FC<any>> = {
  bank: Building2,
  crypto: Bitcoin,
  subscription: CreditCard,
  file: FolderOpen,
  property: Home,
  social: Share2,
};

const DEFAULT_FORM = { type: 'bank', name: '', details: '', instructions: 'transfer', nominee_id: '' };

const Assets: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [aRes, nRes] = await Promise.all([api.get('/assets'), api.get('/nominees')]);
      if (aRes.data.success) setAssets(aRes.data.data);
      if (nRes.data.success) setNominees(nRes.data.data);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => { setEditAsset(null); setForm(DEFAULT_FORM); setShowModal(true); };
  const openEdit = (a: Asset) => {
    setEditAsset(a);
    setForm({ type: a.type, name: a.name, details: typeof a.details === 'string' ? a.details : JSON.stringify(a.details || {}), instructions: a.instructions, nominee_id: a.nominee_id || '' });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditAsset(null); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.type) { toast.error('Name and type are required'); return; }
    setSaving(true);
    try {
      let details: any = form.details;
      try { details = JSON.parse(form.details); } catch { /* keep as string */ }
      const payload = { ...form, details, nominee_id: form.nominee_id || undefined };
      if (editAsset) {
        await api.put(`/assets/${editAsset.id}`, payload);
        toast.success('Asset updated!');
      } else {
        await api.post('/assets', payload);
        toast.success('Asset added!');
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save asset');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this asset?')) return;
    try {
      await api.delete(`/assets/${id}`);
      toast.success('Asset deleted');
      setAssets(prev => prev.filter(a => a.id !== id));
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = activeTab === 'All' ? assets : assets.filter(a => a.type === TAB_TO_TYPE[activeTab]);

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Asset Vault</h1>
            <p className="text-slate-400 mt-1">{assets.length} assets secured</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-lg shadow-indigo-900/40">
            <Plus className="w-4 h-4" /> Add Asset
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {ASSET_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Asset Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No assets yet</h3>
            <p className="text-slate-500 mb-6">Add your first asset to get started</p>
            <button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors">
              + Add First Asset
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(asset => {
              const Icon = TYPE_ICONS[asset.type] || FolderOpen;
              const colorClass = TYPE_COLORS[asset.type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
              const nominee = nominees.find(n => n.id === asset.nominee_id);
              return (
                <div key={asset.id} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 hover:border-slate-600 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl ${colorClass.replace('text-', 'bg-').split(' ')[0]}/10 flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${colorClass.split(' ')[1]}`} />
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(asset)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(asset.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-white mb-2">{asset.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${colorClass} font-medium capitalize`}>
                      {asset.type}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium capitalize">
                      {asset.instructions}
                    </span>
                  </div>
                  {nominee && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                      <div className="w-5 h-5 bg-purple-900/40 rounded-full flex items-center justify-center text-purple-300 font-medium">
                        {nominee.name[0]}
                      </div>
                      <span>Nominee: {nominee.name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{editAsset ? 'Edit Asset' : 'Add Asset'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Asset Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                >
                  {ASSET_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Asset Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Chase Bank Savings, Bitcoin Wallet"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Details (JSON or text)</label>
                <textarea
                  value={form.details}
                  onChange={e => setForm(p => ({ ...p, details: e.target.value }))}
                  placeholder='{"account_number": "****1234", "bank": "Chase"}'
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Instruction on Death</label>
                <select
                  value={form.instructions}
                  onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="transfer">Transfer to Nominee</option>
                  <option value="cancel">Cancel / Close</option>
                  <option value="recover">Recover Funds</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Assign Nominee (Optional)</label>
                <select
                  value={form.nominee_id}
                  onChange={e => setForm(p => ({ ...p, nominee_id: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">— No nominee assigned —</option>
                  {nominees.map(n => <option key={n.id} value={n.id}>{n.name} ({n.relationship})</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors">
                  {saving ? 'Saving...' : editAsset ? 'Update' : 'Add Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <AICopilot />
    </Layout>
  );
};

export default Assets;

