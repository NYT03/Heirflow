import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Building2, Bitcoin, CreditCard, FolderOpen, Home, Share2, X, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';
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

  // Google Account Discovery state
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);

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

  // Run Google/Gmail Discovery Scan
  const handleGoogleScan = async () => {
    setScanning(true);
    try {
      const res = await api.post('/google/scan', {});
      if (res.data.success) {
        setScanResult(res.data.data);
        // Pre-select all discovered items
        const initialSelected: Record<string, boolean> = {};
        const cats = res.data.data.categories;
        [...cats.photos, ...cats.moneyAndUpi, ...cats.crypto, ...cats.property, ...cats.connectedApps].forEach((item: any) => {
          initialSelected[item.id] = true;
        });
        setSelectedItems(initialSelected);
        toast.success(`Discovered ${res.data.data.summary.totalAssets} digital assets!`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to scan Google Account');
    } finally {
      setScanning(false);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleImportSelected = async () => {
    if (!scanResult) return;
    const cats = scanResult.categories;
    const allItems = [...cats.photos, ...cats.moneyAndUpi, ...cats.crypto, ...cats.property, ...cats.connectedApps];
    const itemsToImport = allItems.filter(item => selectedItems[item.id]);

    if (itemsToImport.length === 0) {
      toast.error('Please select at least one asset to import');
      return;
    }

    setImporting(true);
    try {
      const res = await api.post('/google/import', { assets: itemsToImport });
      if (res.data.success) {
        toast.success(res.data.data.message || `Imported ${itemsToImport.length} assets!`);
        setShowGoogleModal(false);
        setScanResult(null);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to import assets');
    } finally {
      setImporting(false);
    }
  };

  const filtered = activeTab === 'All' ? assets : assets.filter(a => a.type === TAB_TO_TYPE[activeTab]);

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Asset Vault</h1>
            <p className="text-slate-400 mt-1">{assets.length} assets secured</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowGoogleModal(true); if (!scanResult) handleGoogleScan(); }}
              className="flex items-center gap-2 bg-gradient-to-r from-red-500/20 via-yellow-500/20 to-blue-500/20 hover:from-red-500/30 hover:to-blue-500/30 text-white border border-slate-700 hover:border-slate-500 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-yellow-400" />
              Scan Google / Gmail Account
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-lg shadow-indigo-900/40">
              <Plus className="w-4 h-4" /> Add Asset
            </button>
          </div>
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

        {/* Assets List */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">Loading assets...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl p-8">
            <p className="text-slate-400 mb-4">No assets found in this category.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => { setShowGoogleModal(true); handleGoogleScan(); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium">
                Auto-discover from Gmail
              </button>
              <button onClick={openAdd} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium">
                Add manually
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(asset => {
              const Icon = TYPE_ICONS[asset.type] || FolderOpen;
              const colorClass = TYPE_COLORS[asset.type] || 'bg-slate-800 text-slate-300 border-slate-700';
              return (
                <div key={asset.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${colorClass}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {asset.type.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(asset)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(asset.id)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <h3 className="font-semibold text-white text-base mb-1">{asset.name}</h3>
                    {asset.nominee_name && (
                      <p className="text-xs text-indigo-400 mb-2">Nominee: {asset.nominee_name}</p>
                    )}
                    {asset.instructions && (
                      <p className="text-xs text-slate-400 line-clamp-2 mb-3 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                        {asset.instructions}
                      </p>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/60 flex justify-between items-center">
                    <span>Added {new Date(asset.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 relative">
            <button onClick={closeModal} className="absolute top-5 right-5 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-4">{editAsset ? 'Edit Asset' : 'Add New Asset'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Asset Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                >
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Asset Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Chase Bank Checking or Bitcoin Vault"
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

      {/* Google / Gmail Account Discovery Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 relative my-8">
            <button onClick={() => setShowGoogleModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-500 via-yellow-400 to-blue-500 flex items-center justify-center font-bold text-white text-base shadow-md">
                G
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Google & Gmail Digital Asset Discovery</h2>
                <p className="text-xs text-slate-400">Scans connected Gmail, Google Photos, UPI, Crypto, Property & Signed-in services</p>
              </div>
            </div>

            {scanning ? (
              <div className="py-16 text-center">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
                <p className="text-white font-medium">Scanning Gmail messages, Photos, UPI & Connected Accounts...</p>
                <p className="text-xs text-slate-400 mt-1">Extracting asset receipts, photo vaults, UPI handles, and deeds</p>
              </div>
            ) : scanResult ? (
              <div>
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 mb-4 flex items-center justify-between text-xs">
                  <div className="flex gap-4">
                    <span className="text-slate-300">Target: <strong className="text-white">{scanResult.email}</strong></span>
                    <span className="text-slate-300">Total Found: <strong className="text-indigo-400">{scanResult.summary.totalAssets} assets</strong></span>
                  </div>
                  <button onClick={handleGoogleScan} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                    <RefreshCw className="w-3.5 h-3.5" /> Re-scan
                  </button>
                </div>

                {/* Categories */}
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                  {/* 1. Photos */}
                  <div>
                    <h3 className="text-xs font-semibold text-teal-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" /> Photos & Cloud Media ({scanResult.categories.photos.length})
                    </h3>
                    <div className="space-y-2">
                      {scanResult.categories.photos.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => toggleSelectItem(item.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            selectedItems[item.id] ? 'bg-indigo-950/30 border-indigo-500/50' : 'bg-slate-950/40 border-slate-800/70 hover:border-slate-700'
                          }`}
                        >
                          <input type="checkbox" checked={!!selectedItems[item.id]} onChange={() => {}} className="mt-1 rounded text-indigo-600 focus:ring-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-sm">{item.name}</span>
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{item.provider}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{item.instructions}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 2. Money & UPI */}
                  <div>
                    <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> Money & UPI Accounts ({scanResult.categories.moneyAndUpi.length})
                    </h3>
                    <div className="space-y-2">
                      {scanResult.categories.moneyAndUpi.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => toggleSelectItem(item.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            selectedItems[item.id] ? 'bg-indigo-950/30 border-indigo-500/50' : 'bg-slate-950/40 border-slate-800/70 hover:border-slate-700'
                          }`}
                        >
                          <input type="checkbox" checked={!!selectedItems[item.id]} onChange={() => {}} className="mt-1 rounded text-indigo-600 focus:ring-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-sm">{item.name}</span>
                              <span className="text-[10px] bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">{item.details?.upiId || item.provider}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{item.instructions}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. Crypto */}
                  <div>
                    <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Bitcoin className="w-3.5 h-3.5" /> Crypto Wallets & Exchanges ({scanResult.categories.crypto.length})
                    </h3>
                    <div className="space-y-2">
                      {scanResult.categories.crypto.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => toggleSelectItem(item.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            selectedItems[item.id] ? 'bg-indigo-950/30 border-indigo-500/50' : 'bg-slate-950/40 border-slate-800/70 hover:border-slate-700'
                          }`}
                        >
                          <input type="checkbox" checked={!!selectedItems[item.id]} onChange={() => {}} className="mt-1 rounded text-indigo-600 focus:ring-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-sm">{item.name}</span>
                              <span className="text-[10px] bg-orange-900/40 text-orange-300 px-2 py-0.5 rounded border border-orange-500/20">{item.provider}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{item.instructions}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. Property */}
                  <div>
                    <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Home className="w-3.5 h-3.5" /> Property & Real Estate ({scanResult.categories.property.length})
                    </h3>
                    <div className="space-y-2">
                      {scanResult.categories.property.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => toggleSelectItem(item.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            selectedItems[item.id] ? 'bg-indigo-950/30 border-indigo-500/50' : 'bg-slate-950/40 border-slate-800/70 hover:border-slate-700'
                          }`}
                        >
                          <input type="checkbox" checked={!!selectedItems[item.id]} onChange={() => {}} className="mt-1 rounded text-indigo-600 focus:ring-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-sm">{item.name}</span>
                              <span className="text-[10px] bg-green-900/40 text-green-300 px-2 py-0.5 rounded border border-green-500/20">{item.provider}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{item.instructions}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 5. Connected Apps */}
                  <div>
                    <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Signed-In Services & Subscriptions ({scanResult.categories.connectedApps.length})
                    </h3>
                    <div className="space-y-2">
                      {scanResult.categories.connectedApps.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => toggleSelectItem(item.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            selectedItems[item.id] ? 'bg-indigo-950/30 border-indigo-500/50' : 'bg-slate-950/40 border-slate-800/70 hover:border-slate-700'
                          }`}
                        >
                          <input type="checkbox" checked={!!selectedItems[item.id]} onChange={() => {}} className="mt-1 rounded text-indigo-600 focus:ring-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-sm">{item.name}</span>
                              <span className="text-[10px] bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20">{item.provider}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{item.instructions}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-5 mt-4 border-t border-slate-800">
                  <span className="text-xs text-slate-400">
                    {Object.values(selectedItems).filter(Boolean).length} of {scanResult.summary.totalAssets} selected
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowGoogleModal(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImportSelected}
                      disabled={importing || Object.values(selectedItems).filter(Boolean).length === 0}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-indigo-900/40"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {importing ? 'Importing...' : `Import Selected (${Object.values(selectedItems).filter(Boolean).length})`}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <AICopilot />
    </Layout>
  );
};

export default Assets;
