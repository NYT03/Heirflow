import React, { useEffect, useState } from 'react';
import { Plus, Eye, EyeOff, Trash2, Pencil, X, Users, Key, Info } from 'lucide-react';
import Layout from '../components/Layout';
import AICopilot from '../components/AICopilot';
import api from '../api/client';
import { Nominee } from '../types';
import toast from 'react-hot-toast';

const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Friend', 'Lawyer', 'Other'];

const DEFAULT_FORM = { name: '', email: '', phone: '', relationship: 'Spouse', permissions: { view_assets: true, claim_assets: true } };

const maskShare = (share: string) => {
  if (!share) return 'KS-****-****-' + '????';
  const last4 = share.slice(-4);
  return `KS-****-****-${last4}`;
};

const Nominees: React.FC = () => {
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editNominee, setEditNominee] = useState<Nominee | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [revealedShares, setRevealedShares] = useState<Set<string>>(new Set());

  const fetchNominees = async () => {
    try {
      const res = await api.get('/nominees');
      if (res.data.success) setNominees(res.data.data);
    } catch { toast.error('Failed to load nominees'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNominees(); }, []);

  const openAdd = () => { setEditNominee(null); setForm(DEFAULT_FORM); setShowModal(true); };
  const openEdit = (n: Nominee) => {
    setEditNominee(n);
    setForm({ name: n.name, email: n.email, phone: n.phone || '', relationship: n.relationship, permissions: n.permissions || DEFAULT_FORM.permissions });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditNominee(null); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) { toast.error('Name and email are required'); return; }
    setSaving(true);
    try {
      if (editNominee) {
        await api.put(`/nominees/${editNominee.id}`, form);
        toast.success('Nominee updated!');
      } else {
        await api.post('/nominees', form);
        toast.success('Nominee added! Key share generated 🔑');
      }
      closeModal();
      fetchNominees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save nominee');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this nominee? Their key share will be revoked.')) return;
    try {
      await api.delete(`/nominees/${id}`);
      toast.success('Nominee removed');
      setNominees(prev => prev.filter(n => n.id !== id));
    } catch { toast.error('Failed to delete'); }
  };

  const toggleReveal = (id: string) => {
    setRevealedShares(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarColor = (name: string) => {
    const colors = ['from-blue-500 to-indigo-600', 'from-purple-500 to-pink-600', 'from-green-500 to-teal-600', 'from-orange-500 to-red-600'];
    return colors[name.charCodeAt(0) % colors.length];
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Nominees</h1>
            <p className="text-slate-400 mt-1">{nominees.length} nominees trusted with your estate</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-lg shadow-indigo-900/40">
            <Plus className="w-4 h-4" /> Add Nominee
          </button>
        </div>

        {/* Key Share Quorum Info */}
        <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <Key className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-indigo-300">Key Share Quorum System</p>
            <p className="text-sm text-slate-400 mt-0.5">
              <strong className="text-white">2 of {Math.max(nominees.length, 3)} nominees</strong> must submit their key share to unlock the estate.
              Each nominee receives a unique cryptographic share on creation.
            </p>
          </div>
        </div>

        {/* Nominee Cards */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500" />
          </div>
        ) : nominees.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No nominees yet</h3>
            <p className="text-slate-500 mb-6">Add trusted people who can claim your estate</p>
            <button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors">
              + Add First Nominee
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {nominees.map(nominee => {
              const revealed = revealedShares.has(nominee.id);
              return (
                <div key={nominee.id} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 hover:border-slate-600 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 bg-gradient-to-br ${avatarColor(nominee.name)} rounded-xl flex items-center justify-center text-white font-bold text-sm`}>
                        {initials(nominee.name)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{nominee.name}</h3>
                        <p className="text-sm text-slate-400">{nominee.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(nominee)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(nominee.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {nominee.relationship}
                    </span>
                    {nominee.permissions?.view_assets && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">View Assets</span>
                    )}
                    {nominee.permissions?.claim_assets && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-300 border border-green-500/20">Claim Assets</span>
                    )}
                  </div>

                  {/* Key Share */}
                  <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="font-mono text-sm text-amber-200">
                          {revealed ? (nominee.key_share || 'KS-' + nominee.id.slice(0, 12)) : maskShare(nominee.key_share || nominee.id)}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleReveal(nominee.id)}
                        className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
                      >
                        {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Cryptographic key share — share securely</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{editNominee ? 'Edit Nominee' : 'Add Nominee'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Jane Doe" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="jane@example.com" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
                <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Relationship</label>
                <select value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                  {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Permissions</label>
                <div className="space-y-2">
                  {[
                    { key: 'view_assets', label: 'Can view assets' },
                    { key: 'claim_assets', label: 'Can claim assets' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!(form.permissions as any)[key]}
                        onChange={e => setForm(p => ({ ...p, permissions: { ...p.permissions, [key]: e.target.checked } }))}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {!editNominee && (
                <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-xl">
                  <p className="text-xs text-amber-300">🔑 A unique cryptographic key share will be generated for this nominee on creation.</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors">
                  {saving ? 'Saving...' : editNominee ? 'Update' : 'Add Nominee'}
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

export default Nominees;

