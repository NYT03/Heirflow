import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Building2, Bitcoin, CreditCard, FolderOpen, Home, Share2, X, Landmark, CheckSquare, Square, KeyRound, Upload, Lock, Unlock, ExternalLink, Copy } from 'lucide-react';
import Layout from '../components/Layout';
import AICopilot from '../components/AICopilot';
import api from '../api/client';
import { Asset, Nominee } from '../types';
import toast from 'react-hot-toast';
import {
  ParsedChromeEntry,
  HeirflowAssetType,
  SAMPLE_CHROME_CSV,
  parseChromePasswordCsv,
  encryptCredentialPayload,
  decryptCredentialPayload,
} from '../utils/chromePasswordImporter';

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

  // RBI Account Aggregator (Demo) State
  const [showAaModal, setShowAaModal] = useState(false);
  const [aaMobile, setAaMobile] = useState('9876543210');
  const [aaHandle, setAaHandle] = useState('9876543210@onemoney');
  const [aaConsent, setAaConsent] = useState<any>(null);
  const [aaOtp, setAaOtp] = useState('123456');
  const [aaLoading, setAaLoading] = useState(false);
  const [selectedNomineeId, setSelectedNomineeId] = useState('');
  const [aaAccounts, setAaAccounts] = useState<any[]>([]);
  const [selectedAaAccounts, setSelectedAaAccounts] = useState<Set<number>>(new Set());
  const [importingAa, setImportingAa] = useState(false);

  // Chrome Saved Passwords Importer State
  const [showChromeModal, setShowChromeModal] = useState(false);
  const [chromeEntries, setChromeEntries] = useState<ParsedChromeEntry[]>([]);
  const [selectedChromeIds, setSelectedChromeIds] = useState<Set<string>>(new Set());
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [chromeNomineeId, setChromeNomineeId] = useState('');
  const [importingChrome, setImportingChrome] = useState(false);

  // Decrypt preview in Edit/View modal
  const [decryptPassphrase, setDecryptPassphrase] = useState('');
  const [decryptedCreds, setDecryptedCreds] = useState<{ url: string; username: string; password: string; note?: string } | null>(null);

  const fetchData = async () => {
    try {
      const [aRes, nRes] = await Promise.all([api.get('/assets'), api.get('/nominees')]);
      if (aRes.data.success) setAssets(aRes.data.data);
      if (nRes.data.success) setNominees(nRes.data.data);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => {
    setEditAsset(null);
    setForm(DEFAULT_FORM);
    setDecryptPassphrase('');
    setDecryptedCreds(null);
    setShowModal(true);
  };
  const openEdit = (a: Asset) => {
    setEditAsset(a);
    setForm({ type: a.type, name: a.name, details: typeof a.details === 'string' ? a.details : JSON.stringify(a.details || {}, null, 2), instructions: a.instructions, nominee_id: a.nominee_id || '' });
    setDecryptPassphrase('');
    setDecryptedCreds(null);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditAsset(null); setDecryptPassphrase(''); setDecryptedCreds(null); };

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

  const openAaModal = () => {
    setSelectedNomineeId(nominees[0]?.id || '');
    setAaConsent(null);
    setAaAccounts([]);
    setSelectedAaAccounts(new Set());
    setShowAaModal(true);
  };

  const handleCreateAaConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAaLoading(true);
    try {
      const res = await api.post('/aa/consent', { mobileNumber: aaMobile, aaHandle });
      if (res.data.success) {
        setAaConsent(res.data.data);
        toast.success(`RBI AA Consent created (${res.data.data.vua})`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create AA consent');
    } finally {
      setAaLoading(false);
    }
  };

  const handleApproveAndFetchAa = async () => {
    if (!aaConsent?.consentId) return;
    setAaLoading(true);
    try {
      if (aaConsent.mode === 'rbi_aa_local_simulator' && aaConsent.status !== 'ACTIVE') {
        const approveRes = await api.post(`/aa/consent/${aaConsent.consentId}/approve`, { otp: aaOtp });
        if (approveRes.data.success) {
          setAaConsent((p: any) => ({ ...p, status: 'ACTIVE' }));
        }
      }

      const fetchRes = await api.get(`/aa/consent/${aaConsent.consentId}/accounts`);
      if (fetchRes.data.success) {
        const items = fetchRes.data.data.accounts || [];
        setAaAccounts(items);
        const initialSelected = new Set<number>();
        items.forEach((acc: any, idx: number) => {
          if (!acc.alreadyImported) initialSelected.add(idx);
        });
        setSelectedAaAccounts(initialSelected);
        toast.success(`Fetched ${items.length} bank account(s) via RBI Account Aggregator!`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fetch bank accounts from AA');
    } finally {
      setAaLoading(false);
    }
  };

  const toggleAaAccount = (idx: number) => {
    setSelectedAaAccounts(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleImportAaAccounts = async () => {
    const toImport = aaAccounts.filter((_, idx) => selectedAaAccounts.has(idx));
    if (toImport.length === 0) {
      toast.error('Select at least one bank account to import');
      return;
    }
    setImportingAa(true);
    try {
      const res = await api.post('/aa/import', {
        accounts: toImport,
        nominee_id: selectedNomineeId || undefined,
      });
      if (res.data.success) {
        toast.success(`Imported ${res.data.data.importedCount} bank account(s) for nominee transfer!`);
        setShowAaModal(false);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to import bank accounts');
    } finally {
      setImportingAa(false);
    }
  };

  const openChromeModal = () => {
    setChromeNomineeId(nominees[0]?.id || '');
    setChromeEntries([]);
    setSelectedChromeIds(new Set());
    setVaultPassphrase('');
    setShowChromeModal(true);
  };

  const loadChromeCsvText = (csvText: string) => {
    try {
      const parsed = parseChromePasswordCsv(csvText);
      setChromeEntries(parsed);
      setSelectedChromeIds(new Set(parsed.map(e => e.id)));
      toast.success(`Parsed ${parsed.length} saved account(s) locally in your browser.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse Chrome CSV');
    }
  };

  const handleChromeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadChromeCsvText(text);
  };

  const toggleChromeEntry = (id: string) => {
    setSelectedChromeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateChromeEntryType = (id: string, newType: HeirflowAssetType) => {
    setChromeEntries(prev => prev.map(entry => (entry.id === id ? { ...entry, type: newType } : entry)));
  };

  const handleImportChromeEntries = async () => {
    const toImport = chromeEntries.filter(e => selectedChromeIds.has(e.id));
    if (toImport.length === 0) {
      toast.error('Select at least one account to import.');
      return;
    }
    if (vaultPassphrase.trim().length < 6) {
      toast.error('Enter a Vault Passphrase (at least 6 characters) to encrypt passwords before saving.');
      return;
    }

    setImportingChrome(true);
    try {
      const encryptedEntries = await Promise.all(
        toImport.map(async entry => {
          const encryptedCredentials = await encryptCredentialPayload(
            { url: entry.url, username: entry.username, password: entry.password, note: entry.note },
            vaultPassphrase.trim()
          );
          return {
            type: entry.type,
            name: entry.name,
            instructions: 'transfer',
            details: {
              provider: 'chrome_password_export',
              domain: entry.domain,
              url: entry.url,
              username: entry.username,
              maskedPassword: '••••••••',
              encryptedCredentials,
              note: entry.note || undefined,
            },
          };
        })
      );

      const res = await api.post('/assets/import-passwords', {
        entries: encryptedEntries,
        nominee_id: chromeNomineeId || undefined,
      });

      if (res.data.success) {
        const { importedCount, skippedCount } = res.data.data;
        toast.success(
          `Encrypted & imported ${importedCount} account(s)${skippedCount ? ` (${skippedCount} duplicate skipped)` : ''}!`
        );
        setShowChromeModal(false);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to import Chrome passwords');
    } finally {
      setImportingChrome(false);
    }
  };

  const handleDecryptEditAsset = async () => {
    const enc = editAsset?.details?.encryptedCredentials;
    if (!enc) return;
    if (!decryptPassphrase.trim()) {
      toast.error('Enter your Vault Passphrase to decrypt');
      return;
    }
    try {
      const creds = await decryptCredentialPayload(enc, decryptPassphrase.trim());
      setDecryptedCreds(creds);
      toast.success('Credentials decrypted locally');
    } catch {
      toast.error('Incorrect Vault Passphrase');
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Asset Vault</h1>
            <p className="text-slate-400 mt-1">{assets.length} assets secured</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={openChromeModal}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              <KeyRound className="w-4 h-4" /> Import Chrome Passwords
            </button>
            <button
              onClick={openAaModal}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-indigo-500/40 text-indigo-300 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              <Landmark className="w-4 h-4" /> RBI AA (Demo)
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
              const colorClass = TYPE_COLORS[asset.type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
              const nominee = nominees.find(n => n.id === asset.nominee_id);
              const openChromeModal = () => {
    setChromeNomineeId(nominees[0]?.id || '');
    setChromeEntries([]);
    setSelectedChromeIds(new Set());
    setVaultPassphrase('');
    setShowChromeModal(true);
  };

  const loadChromeCsvText = (csvText: string) => {
    try {
      const parsed = parseChromePasswordCsv(csvText);
      setChromeEntries(parsed);
      setSelectedChromeIds(new Set(parsed.map(e => e.id)));
      toast.success(`Parsed ${parsed.length} saved account(s) locally in your browser.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse Chrome CSV');
    }
  };

  const handleChromeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadChromeCsvText(text);
  };

  const toggleChromeEntry = (id: string) => {
    setSelectedChromeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateChromeEntryType = (id: string, newType: HeirflowAssetType) => {
    setChromeEntries(prev => prev.map(entry => (entry.id === id ? { ...entry, type: newType } : entry)));
  };

  const handleImportChromeEntries = async () => {
    const toImport = chromeEntries.filter(e => selectedChromeIds.has(e.id));
    if (toImport.length === 0) {
      toast.error('Select at least one account to import.');
      return;
    }
    if (vaultPassphrase.trim().length < 6) {
      toast.error('Enter a Vault Passphrase (at least 6 characters) to encrypt passwords before saving.');
      return;
    }

    setImportingChrome(true);
    try {
      const encryptedEntries = await Promise.all(
        toImport.map(async entry => {
          const encryptedCredentials = await encryptCredentialPayload(
            { url: entry.url, username: entry.username, password: entry.password, note: entry.note },
            vaultPassphrase.trim()
          );
          return {
            type: entry.type,
            name: entry.name,
            instructions: 'transfer',
            details: {
              provider: 'chrome_password_export',
              domain: entry.domain,
              url: entry.url,
              username: entry.username,
              maskedPassword: '••••••••',
              encryptedCredentials,
              note: entry.note || undefined,
            },
          };
        })
      );

      const res = await api.post('/assets/import-passwords', {
        entries: encryptedEntries,
        nominee_id: chromeNomineeId || undefined,
      });

      if (res.data.success) {
        const { importedCount, skippedCount } = res.data.data;
        toast.success(
          `Encrypted & imported ${importedCount} account(s)${skippedCount ? ` (${skippedCount} duplicate skipped)` : ''}!`
        );
        setShowChromeModal(false);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to import Chrome passwords');
    } finally {
      setImportingChrome(false);
    }
  };

  const handleDecryptEditAsset = async () => {
    const enc = editAsset?.details?.encryptedCredentials;
    if (!enc) return;
    if (!decryptPassphrase.trim()) {
      toast.error('Enter your Vault Passphrase to decrypt');
      return;
    }
    try {
      const creds = await decryptCredentialPayload(enc, decryptPassphrase.trim());
      setDecryptedCreds(creds);
      toast.success('Credentials decrypted locally');
    } catch {
      toast.error('Incorrect Vault Passphrase');
    }
  };

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
                  <h3 className="font-semibold text-white mb-2">{asset.name}</h3>
                  {asset.details?.username && (
                    <p className="text-xs text-slate-400 mb-2 truncate">
                      {asset.details.username} {asset.details?.encryptedCredentials ? '• 🔒 Encrypted Vault' : ''}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${colorClass} font-medium capitalize`}>
                      {asset.type}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium capitalize">
                      {asset.instructions}
                    </span>
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
              {editAsset?.details?.encryptedCredentials && (
                <div className="p-3.5 bg-slate-900/80 border border-emerald-500/30 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                    <Lock className="w-3.5 h-3.5" /> Encrypted Chrome Vault Credentials (AES-256-GCM)
                  </div>
                  {!decryptedCreds ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={decryptPassphrase}
                        onChange={e => setDecryptPassphrase(e.target.value)}
                        placeholder="Enter Vault Passphrase to decrypt"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleDecryptEditAsset}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                      >
                        <Unlock className="w-3.5 h-3.5" /> Decrypt
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs space-y-1 text-slate-200 font-mono bg-slate-950/60 p-2.5 rounded-lg">
                      <div>URL: {decryptedCreds.url || '—'}</div>
                      <div>User: {decryptedCreds.username || '—'}</div>
                      <div>Pass: {decryptedCreds.password || '—'}</div>
                      {decryptedCreds.note && <div>Note: {decryptedCreds.note}</div>}
                    </div>
                  )}
                </div>
              )}
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

      {/* RBI Account Aggregator (AA) Bank Discovery Modal */}
      {showAaModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-indigo-400" /> RBI Account Aggregator (Demo)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Demo ReBIT AA consent flow to simulate fetching bank deposit accounts &amp; assigning a nominee for transfer
                </p>
              </div>
              <button onClick={() => setShowAaModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* Step 1: Create Consent */}
              <form onSubmit={handleCreateAaConsent} className="grid sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={aaMobile}
                  onChange={e => {
                    setAaMobile(e.target.value);
                    setAaHandle(`${e.target.value}@onemoney`);
                  }}
                  placeholder="Mobile (e.g. 9876543210)"
                  className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={aaHandle}
                  onChange={e => setAaHandle(e.target.value)}
                  placeholder="AA Handle (e.g. 9876543210@onemoney)"
                  className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={aaLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-colors"
                >
                  {aaLoading && !aaConsent ? 'Creating Consent...' : '1. Create AA Consent'}
                </button>
              </form>

              {/* Step 2: Approve Consent & Fetch Accounts */}
              {aaConsent && (
                <div className="p-4 bg-slate-900/70 border border-indigo-500/30 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300">
                      Consent ID: <code className="text-indigo-300">{aaConsent.consentId}</code> • VUA: <code className="text-indigo-300">{aaConsent.vua}</code>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${aaConsent.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {aaConsent.status}
                    </span>
                  </div>

                  {aaConsent.redirectUrl ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={aaConsent.redirectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-white text-slate-900 text-xs font-semibold px-4 py-2 rounded-lg"
                      >
                        Approve in Setu AA Portal ↗
                      </a>
                      <button
                        type="button"
                        onClick={handleApproveAndFetchAa}
                        disabled={aaLoading}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                      >
                        2. Fetch Bank Accounts
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        value={aaOtp}
                        onChange={e => setAaOtp(e.target.value)}
                        placeholder="OTP (123456)"
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white w-36 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleApproveAndFetchAa}
                        disabled={aaLoading}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                      >
                        {aaLoading ? 'Fetching...' : '2. Approve Consent & Fetch Bank Accounts'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Select Accounts & Nominee */}
              {aaAccounts.length > 0 && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Assign Nominee for Bank Transfer
                    </label>
                    <select
                      value={selectedNomineeId}
                      onChange={e => setSelectedNomineeId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">— No nominee assigned —</option>
                      {nominees.map(n => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.relationship})
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-xs font-medium text-slate-300">
                    Discovered {aaAccounts.length} bank account(s) via RBI AA — select accounts to import:
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {aaAccounts.map((acc, idx) => {
                      const checked = selectedAaAccounts.has(idx);
                      const openChromeModal = () => {
    setChromeNomineeId(nominees[0]?.id || '');
    setChromeEntries([]);
    setSelectedChromeIds(new Set());
    setVaultPassphrase('');
    setShowChromeModal(true);
  };

  const loadChromeCsvText = (csvText: string) => {
    try {
      const parsed = parseChromePasswordCsv(csvText);
      setChromeEntries(parsed);
      setSelectedChromeIds(new Set(parsed.map(e => e.id)));
      toast.success(`Parsed ${parsed.length} saved account(s) locally in your browser.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse Chrome CSV');
    }
  };

  const handleChromeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadChromeCsvText(text);
  };

  const toggleChromeEntry = (id: string) => {
    setSelectedChromeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateChromeEntryType = (id: string, newType: HeirflowAssetType) => {
    setChromeEntries(prev => prev.map(entry => (entry.id === id ? { ...entry, type: newType } : entry)));
  };

  const handleImportChromeEntries = async () => {
    const toImport = chromeEntries.filter(e => selectedChromeIds.has(e.id));
    if (toImport.length === 0) {
      toast.error('Select at least one account to import.');
      return;
    }
    if (vaultPassphrase.trim().length < 6) {
      toast.error('Enter a Vault Passphrase (at least 6 characters) to encrypt passwords before saving.');
      return;
    }

    setImportingChrome(true);
    try {
      const encryptedEntries = await Promise.all(
        toImport.map(async entry => {
          const encryptedCredentials = await encryptCredentialPayload(
            { url: entry.url, username: entry.username, password: entry.password, note: entry.note },
            vaultPassphrase.trim()
          );
          return {
            type: entry.type,
            name: entry.name,
            instructions: 'transfer',
            details: {
              provider: 'chrome_password_export',
              domain: entry.domain,
              url: entry.url,
              username: entry.username,
              maskedPassword: '••••••••',
              encryptedCredentials,
              note: entry.note || undefined,
            },
          };
        })
      );

      const res = await api.post('/assets/import-passwords', {
        entries: encryptedEntries,
        nominee_id: chromeNomineeId || undefined,
      });

      if (res.data.success) {
        const { importedCount, skippedCount } = res.data.data;
        toast.success(
          `Encrypted & imported ${importedCount} account(s)${skippedCount ? ` (${skippedCount} duplicate skipped)` : ''}!`
        );
        setShowChromeModal(false);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to import Chrome passwords');
    } finally {
      setImportingChrome(false);
    }
  };

  const handleDecryptEditAsset = async () => {
    const enc = editAsset?.details?.encryptedCredentials;
    if (!enc) return;
    if (!decryptPassphrase.trim()) {
      toast.error('Enter your Vault Passphrase to decrypt');
      return;
    }
    try {
      const creds = await decryptCredentialPayload(enc, decryptPassphrase.trim());
      setDecryptedCreds(creds);
      toast.success('Credentials decrypted locally');
    } catch {
      toast.error('Incorrect Vault Passphrase');
    }
  };

  return (
                        <div
                          key={idx}
                          onClick={() => !acc.alreadyImported && toggleAaAccount(idx)}
                          className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                            acc.alreadyImported
                              ? 'bg-slate-900/40 border-slate-800 opacity-60 cursor-not-allowed'
                              : checked
                                ? 'bg-indigo-900/20 border-indigo-500/50 cursor-pointer'
                                : 'bg-slate-900/60 border-slate-700 cursor-pointer hover:border-slate-500'
                          }`}
                        >
                          <div className="mt-0.5 text-indigo-400">
                            {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-white truncate">{acc.name}</span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-blue-500/20 text-blue-300 border-blue-500/30">
                                {acc.alreadyImported ? 'Already in Vault' : acc.details?.ifsc || 'BANK'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">
                              Account: {acc.details?.maskedAccNumber} • Type: {acc.details?.accountType} • Balance: ₹{Number(acc.details?.currentBalanceINR || 0).toLocaleString('en-IN')}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{acc.instructions}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {aaAccounts.length > 0 && (
              <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAaModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={importingAa || selectedAaAccounts.size === 0}
                  onClick={handleImportAaAccounts}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
                >
                  {importingAa ? 'Importing...' : `3. Import Selected (${selectedAaAccounts.size})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Chrome Saved Passwords Importer Modal */}
      {showChromeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-400" /> Import Chrome Saved Passwords
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Parsed &amp; AES-256-GCM encrypted in your browser before saving — raw passwords never leave your device
                </p>
              </div>
              <button onClick={() => setShowChromeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-4 bg-slate-900/70 border border-slate-700 rounded-xl text-xs text-slate-300 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-white">Quick Export Steps (Chrome / Google Password Manager):</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href="https://passwords.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 px-2.5 py-1 rounded-lg font-medium transition-colors"
                    >
                      Open Google Password Manager <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('chrome://password-manager/settings');
                        toast.success('Copied! Paste into a new Chrome address bar.');
                      }}
                      className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 px-2.5 py-1 rounded-lg font-medium transition-colors"
                    >
                      <Copy className="w-3 h-3" /> Copy chrome:// link
                    </button>
                  </div>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>
                    Click <span className="text-white font-medium">Open Google Password Manager</span> above (or paste{' '}
                    <code className="text-emerald-300">chrome://password-manager/settings</code> into a new Chrome tab).
                  </li>
                  <li>
                    Open <span className="text-white font-medium">Settings</span> → click{' '}
                    <span className="text-white font-medium">Export passwords</span> → <span className="text-white font-medium">Download file</span> (verify with your Windows PIN/password).
                  </li>
                  <li>
                    Click <span className="text-white font-medium">Upload Chrome CSV</span> below, enter a{' '}
                    <span className="text-white font-medium">Vault Passphrase</span>, and select a nominee.
                  </li>
                  <li>
                    Click <span className="text-white font-medium">Encrypt &amp; Import</span> — HeirFlow encrypts every password in your browser before saving.
                  </li>
                </ol>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors">
                  <Upload className="w-4 h-4" /> Upload Chrome CSV
                  <input type="file" accept=".csv,text/csv" onChange={handleChromeFileChange} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => loadChromeCsvText(SAMPLE_CHROME_CSV)}
                  className="bg-slate-900 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  Load Sample Chrome CSV (Test)
                </button>
              </div>

              {chromeEntries.length > 0 && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Nominee Vault Passphrase (AES-256-GCM)
                      </label>
                      <input
                        type="password"
                        value={vaultPassphrase}
                        onChange={e => setVaultPassphrase(e.target.value)}
                        placeholder="Min 6 chars (share with nominee)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Assign Nominee
                      </label>
                      <select
                        value={chromeNomineeId}
                        onChange={e => setChromeNomineeId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">— No nominee assigned —</option>
                        {nominees.map(n => (
                          <option key={n.id} value={n.id}>
                            {n.name} ({n.relationship})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Discovered {chromeEntries.length} account(s)</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedChromeIds(
                          selectedChromeIds.size === chromeEntries.length
                            ? new Set()
                            : new Set(chromeEntries.map(e => e.id))
                        )
                      }
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      {selectedChromeIds.size === chromeEntries.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {chromeEntries.map(entry => {
                      const checked = selectedChromeIds.has(entry.id);
                      return (
                        <div
                          key={entry.id}
                          className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
                            checked
                              ? 'bg-emerald-900/15 border-emerald-500/40'
                              : 'bg-slate-900/60 border-slate-700 opacity-70'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleChromeEntry(entry.id)}
                            className="text-emerald-400 shrink-0"
                          >
                            {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-500" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{entry.name}</div>
                            <div className="text-xs text-slate-400 truncate">
                              {entry.domain} • {entry.username || 'No username'} • ••••••••
                            </div>
                          </div>
                          <select
                            value={entry.type}
                            onChange={e => updateChromeEntryType(entry.id, e.target.value as HeirflowAssetType)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 capitalize"
                          >
                            {ASSET_TYPES.map(t => (
                              <option key={t} value={t} className="capitalize">
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {chromeEntries.length > 0 && (
              <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowChromeModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={importingChrome || selectedChromeIds.size === 0}
                  onClick={handleImportChromeEntries}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
                >
                  {importingChrome ? 'Encrypting & Importing...' : `Encrypt & Import (${selectedChromeIds.size})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <AICopilot />
    </Layout>
  );
};

export default Assets;
