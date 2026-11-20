import React, { useEffect, useState } from 'react';
import { Upload, CheckCircle2, Clock, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import AICopilot from '../components/AICopilot';
import api from '../api/client';
import { Claim } from '../types';
import toast from 'react-hot-toast';

const CLAIM_STEPS = ['Submitted', 'Under Review', 'Grace Period', 'Approved', 'Executing', 'Complete'];

const STATUS_TO_STEP: Record<string, number> = {
  pending: 0,
  under_review: 1,
  grace_period: 2,
  approved: 3,
  executing: 4,
  completed: 5,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  under_review: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  grace_period: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  approved: 'text-green-400 bg-green-500/10 border-green-500/20',
  executing: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  completed: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  rejected: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const NomineeClaim: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ deceased_email: '', key_share: '', certificate_name: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchClaims = async () => {
    try {
      const res = await api.get('/claims');
      if (res.data.success) setClaims(res.data.data);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchClaims(); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setForm(p => ({ ...p, certificate_name: file.name }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deceased_email || !form.key_share) { toast.error('Email and key share are required'); return; }
    setSubmitting(true);
    try {
      let evidence_path = '';
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('folder', 'death_certificates');
        const uploadRes = await api.post('/storage/upload', formData);
        if (uploadRes.data.success) {
          evidence_path = uploadRes.data.data.file_url;
        }
      }

      const res = await api.post('/claims', {
        deceased_email: form.deceased_email,
        key_share: form.key_share,
        evidence_path: evidence_path || form.certificate_name,
      });

      if (res.data.success) {
        toast.success('Claim and evidence submitted to storage!');
        setForm({ deceased_email: '', key_share: '', certificate_name: '' });
        setSelectedFile(null);
        fetchClaims();
      } else {
        toast.error(res.data.error || 'Failed to submit claim');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit claim');
    } finally { setSubmitting(false); }
  };

  const getCountdown = (graceUntil: string) => {
    const diff = new Date(graceUntil).getTime() - now;
    if (diff <= 0) return 'Expired';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Claims Portal</h1>
          <p className="text-slate-400 mt-1">Initiate or track an inheritance claim</p>
        </div>

        {/* Submit Claim Form */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Initiate Inheritance Claim</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Deceased Person's Email *</label>
                <input
                  type="email"
                  value={form.deceased_email}
                  onChange={e => setForm(p => ({ ...p, deceased_email: e.target.value }))}
                  placeholder="john.doe@example.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Your Key Share *</label>
                <input
                  type="text"
                  value={form.key_share}
                  onChange={e => setForm(p => ({ ...p, key_share: e.target.value }))}
                  placeholder="KS-xxxx-xxxx-xxxx"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Death Certificate</label>
              <label className="flex items-center gap-3 w-full bg-slate-900 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl px-4 py-4 cursor-pointer transition-colors">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-slate-400 text-sm">{form.certificate_name || 'Upload death certificate (PDF, JPG, PNG)'}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
              </label>
              {form.certificate_name && (
                <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {form.certificate_name}
                </p>
              )}
            </div>

            <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-xl">
              <p className="text-xs text-amber-300 leading-relaxed">
                ⚠️ <strong>Important:</strong> Filing a false claim is illegal. A 7-day grace period allows the account holder to contest.
                All claims are verified and logged permanently.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg"
            >
              {submitting ? 'Submitting...' : 'Submit Claim'}
            </button>
          </form>
        </div>

        {/* Claims List */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
          </div>
        ) : claims.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No claims filed yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Your Claims</h2>
            {claims.map(claim => {
              const step = STATUS_TO_STEP[claim.status] ?? 0;
              const colorClass = STATUS_COLORS[claim.status] || 'text-slate-400';
              return (
                <div key={claim.id} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-medium text-white">Claim #{claim.id.slice(0, 8)}</p>
                      <p className="text-sm text-slate-400 mt-0.5">Filed {new Date(claim.submitted_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full border font-medium capitalize ${colorClass}`}>
                      {claim.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Stepper */}
                  <div className="relative mb-4">
                    <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-700">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${(step / (CLAIM_STEPS.length - 1)) * 100}%` }}
                      />
                    </div>
                    <div className="relative flex justify-between">
                      {CLAIM_STEPS.map((s, i) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-all ${
                            i < step ? 'bg-indigo-500 text-white' :
                              i === step ? 'bg-indigo-600 text-white ring-2 ring-indigo-400' :
                                'bg-slate-700 text-slate-500'
                          }`}>
                            {i < step ? '✓' : i + 1}
                          </div>
                          <span className={`text-xs text-center max-w-[60px] ${i <= step ? 'text-slate-300' : 'text-slate-600'}`}>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grace Period Countdown */}
                  {claim.status === 'grace_period' && claim.grace_until && (
                    <div className="mt-4 p-4 bg-amber-900/20 border border-amber-700/40 rounded-xl flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-amber-300 text-sm">Grace Period Active</p>
                        <p className="text-amber-200 font-mono text-lg font-bold">{getCountdown(claim.grace_until)}</p>
                        <p className="text-xs text-amber-500 mt-0.5">Time remaining for account holder to contest</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <AICopilot />
    </Layout>
  );
};

export default NomineeClaim;

