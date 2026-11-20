import React, { useEffect, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  Clock,
  FileText,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Play,
  Ban,
  Key,
} from 'lucide-react';
import Layout from '../components/Layout';
import AICopilot from '../components/AICopilot';
import api from '../api/client';
import { GateClaim } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const CLAIM_STEPS = ['Pending Quorum', 'Verification', 'Grace Period', 'Executed'];

const STATUS_TO_STEP: Record<string, number> = {
  PENDING_QUORUM: 0,
  VERIFICATION_IN_PROGRESS: 1,
  HOLD_FOR_REVIEW: 1,
  GRACE_PERIOD_ACTIVE: 2,
  DISPUTED: 2,
  ABORTED_LIVENESS: 2,
  REJECTED: 1,
  EXECUTED: 3,
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_QUORUM: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  VERIFICATION_IN_PROGRESS: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  HOLD_FOR_REVIEW: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  GRACE_PERIOD_ACTIVE: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  DISPUTED: 'text-red-400 bg-red-500/10 border-red-500/20',
  ABORTED_LIVENESS: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  REJECTED: 'text-red-400 bg-red-500/10 border-red-500/20',
  EXECUTED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

const INITIAL_FORM = {
  deceased_email: '',
  key_share: '',
  registrationNumber: '',
  deceasedName: '',
  dateOfDeath: '',
  stateOrMunicipality: 'Gujarat e-Olakh',
  qrPayload: '',
  gracePeriodSeconds: 10,
  certificate_name: '',
};

const NomineeClaim: React.FC = () => {
  const { user } = useAuth();
  const [claims, setClaims] = useState<GateClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extraShareInputs, setExtraShareInputs] = useState<Record<string, { nomineeId: string; rawShare: string }>>({});
  const [decryptedByClaim, setDecryptedByClaim] = useState<Record<string, any[]>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchClaims = async () => {
    try {
      const res = await api.get('/verification/claims');
      if (res.data.success) setClaims(res.data.data);
    } catch {
      // handled gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setForm(p => ({ ...p, certificate_name: file.name }));
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        resolve(res.includes(',') ? res.split(',')[1] : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deceased_email || !form.key_share || !form.registrationNumber || !form.deceasedName || !form.dateOfDeath) {
      toast.error('Please fill all required claim & certificate fields');
      return;
    }

    setSubmitting(true);
    try {
      let evidence_path = '';
      let rawPdfBase64: string | undefined;

      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('folder', 'death_certificates');
        const uploadRes = await api.post('/storage/upload', formData);
        if (uploadRes.data.success) {
          evidence_path = uploadRes.data.data.file_url;
        }
        if (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')) {
          rawPdfBase64 = await fileToBase64(selectedFile);
        }
      }

      const res = await api.post('/verification/claims/initiate', {
        deceased_email: form.deceased_email,
        key_share: form.key_share,
        registrationNumber: form.registrationNumber,
        deceasedName: form.deceasedName,
        dateOfDeath: form.dateOfDeath,
        stateOrMunicipality: form.stateOrMunicipality,
        qrPayload: form.qrPayload || undefined,
        gracePeriodSeconds: Number(form.gracePeriodSeconds),
        evidence_path: evidence_path || form.certificate_name || undefined,
        rawPdfBase64,
      });

      if (res.data.success) {
        if (res.data.joinedExistingClaim) {
          toast.success(res.data.message || 'Joined existing claim towards 2/3 quorum!');
        } else {
          toast.success(`Claim initiated (${res.data.data.status.replace(/_/g, ' ')})`);
        }
        setForm(INITIAL_FORM);
        setSelectedFile(null);
        fetchClaims();
      } else {
        toast.error(res.data.error || 'Failed to initiate claim');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to initiate claim');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdditionalShare = async (claimId: string) => {
    const input = extraShareInputs[claimId];
    if (!input?.rawShare) {
      toast.error('Enter the nominee key share');
      return;
    }
    try {
      const res = await api.post(`/verification/claims/${claimId}/share`, {
        nomineeId: input.nomineeId || undefined,
        rawShare: input.rawShare,
      });
      if (res.data.success) {
        toast.success(`Share recorded — Status: ${res.data.data.status.replace(/_/g, ' ')}`);
        fetchClaims();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit share');
    }
  };

  const handleLivenessAbort = async (claimId: string) => {
    try {
      const res = await api.post(`/verification/claims/${claimId}/abort`, {
        reason: 'Estate owner verified alive and aborted claim from dashboard.',
      });
      if (res.data.success) {
        toast.success('Claim permanently aborted via Liveness Guard');
        fetchClaims();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to abort claim');
    }
  };

  const handleDispute = async (claimId: string) => {
    try {
      const res = await api.post(`/verification/claims/${claimId}/dispute`, {
        reason: 'Objection raised pending manual legal review.',
      });
      if (res.data.success) {
        toast.success('Claim paused under dispute');
        fetchClaims();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to raise dispute');
    }
  };

  const handleExecute = async (claimId: string) => {
    try {
      const res = await api.post(`/verification/claims/${claimId}/execute`, {});
      if (res.data.success) {
        toast.success('Smart Contract executed — encrypted assets released & key shares destroyed!');
        fetchClaims();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Cannot execute claim yet');
    }
  };

  const handleDecryptAssets = async (claimId: string) => {
    try {
      const res = await api.post(`/verification/claims/${claimId}/decrypt-assets`, {});
      if (res.data.success) {
        setDecryptedByClaim(p => ({ ...p, [claimId]: res.data.data.assets || [] }));
        toast.success('Assets decrypted via Smart Contract & Blockchain verification!');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to decrypt assets');
    }
  };

  const getCountdown = (graceEndsAt: string) => {
    const diff = new Date(graceEndsAt).getTime() - now;
    if (diff <= 0) return 'Grace Period Complete — Ready to Execute';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  const isGraceDone = (graceEndsAt?: string) => {
    if (!graceEndsAt) return false;
    return now >= new Date(graceEndsAt).getTime();
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Verification Gate & Claims Portal</h1>
            <p className="text-slate-400 mt-1">
              2/3 nominee quorum, government registry verification, blockchain audit trail &amp; encrypted Smart Contract handover
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setForm(p => ({
                ...p,
                deceased_email: 'john@demo.com',
                registrationNumber: 'GJ-AHM-2024-D-098234',
                deceasedName: 'John Doe',
                dateOfDeath: '2024-11-01',
                stateOrMunicipality: 'Gujarat e-Olakh',
                qrPayload: 'https://eolakh.gujarat.gov.in/verify/GJ-AHM-2024-D-098234',
                gracePeriodSeconds: 10,
              }))
            }
            className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-indigo-300 px-3 py-2 rounded-lg transition-colors"
          >
            Fill Demo Certificate (John Doe)
          </button>
        </div>

        {/* Submit Claim Form */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Initiate or Join Inheritance Claim</h2>
          <p className="text-xs text-slate-400 mb-4">
            If another nominee already opened a claim for this estate, submitting your share here automatically joins the existing claim towards the 2/3 quorum.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Deceased Person's Email *</label>
                <input
                  type="email"
                  value={form.deceased_email}
                  onChange={e => setForm(p => ({ ...p, deceased_email: e.target.value }))}
                  placeholder="john@demo.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Your Key Share *</label>
                <input
                  type="text"
                  value={form.key_share}
                  onChange={e => setForm(p => ({ ...p, key_share: e.target.value }))}
                  placeholder="HEIRFLOW-SHARE-..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Certificate Reg. Number *</label>
                <input
                  type="text"
                  value={form.registrationNumber}
                  onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))}
                  placeholder="GJ-AHM-2024-D-098234"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Deceased Name on Cert *</label>
                <input
                  type="text"
                  value={form.deceasedName}
                  onChange={e => setForm(p => ({ ...p, deceasedName: e.target.value }))}
                  placeholder="John Doe"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Date of Death *</label>
                <input
                  type="date"
                  value={form.dateOfDeath}
                  onChange={e => setForm(p => ({ ...p, dateOfDeath: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Registry / State Source *</label>
                <input
                  type="text"
                  value={form.stateOrMunicipality}
                  onChange={e => setForm(p => ({ ...p, stateOrMunicipality: e.target.value }))}
                  placeholder="Central CRS / Gujarat e-Olakh"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">QR Verification URL (.gov.in / .nic.in)</label>
                <input
                  type="url"
                  value={form.qrPayload}
                  onChange={e => setForm(p => ({ ...p, qrPayload: e.target.value }))}
                  placeholder="https://eolakh.gujarat.gov.in/verify/..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Grace Period</label>
                <select
                  value={form.gracePeriodSeconds}
                  onChange={e => setForm(p => ({ ...p, gracePeriodSeconds: Number(e.target.value) }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value={10}>10 Seconds (Demo Mode)</option>
                  <option value={60}>1 Minute (Demo Mode)</option>
                  <option value={604800}>7 Days (Production)</option>
                  <option value={1209600}>14 Days (Production)</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Certificate Reg. Number *</label>
                <input
                  type="text"
                  value={form.registrationNumber}
                  onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))}
                  placeholder="GJ-AHM-2024-D-098234"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Deceased Name on Cert *</label>
                <input
                  type="text"
                  value={form.deceasedName}
                  onChange={e => setForm(p => ({ ...p, deceasedName: e.target.value }))}
                  placeholder="John Doe"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Date of Death *</label>
                <input
                  type="date"
                  value={form.dateOfDeath}
                  onChange={e => setForm(p => ({ ...p, dateOfDeath: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Registry / State Source *</label>
                <input
                  type="text"
                  value={form.stateOrMunicipality}
                  onChange={e => setForm(p => ({ ...p, stateOrMunicipality: e.target.value }))}
                  placeholder="Central CRS / Gujarat e-Olakh"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">QR Verification URL (.gov.in / .nic.in)</label>
                <input
                  type="url"
                  value={form.qrPayload}
                  onChange={e => setForm(p => ({ ...p, qrPayload: e.target.value }))}
                  placeholder="https://eolakh.gujarat.gov.in/verify/..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Grace Period</label>
                <select
                  value={form.gracePeriodSeconds}
                  onChange={e => setForm(p => ({ ...p, gracePeriodSeconds: Number(e.target.value) }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value={10}>10 Seconds (Demo Mode)</option>
                  <option value={60}>1 Minute (Demo Mode)</option>
                  <option value={604800}>7 Days (Production)</option>
                  <option value={1209600}>14 Days (Production)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Death Certificate Document (optional)</label>
              <label className="flex items-center gap-3 w-full bg-slate-900 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl px-4 py-3.5 cursor-pointer transition-colors">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-slate-400 text-sm">
                  {form.certificate_name || 'Upload signed death certificate (PDF inspected for digital signatures, JPG, PNG)'}
                </span>
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
                ⚠️ <strong>Verification Gate:</strong> QR domains must strictly belong to <code>*.gov.in</code> or <code>*.nic.in</code>.
                Every claim stage is hashed onto the blockchain. Assets are AES-256-GCM encrypted and released via Smart Contract only after the grace period ends, after which all nominee key shares are permanently destroyed.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-950 px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors"
            >
              {submitting ? 'Verifying & Submitting...' : 'Submit to Verification Gate'}
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
            <p>No verification gate claims filed yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Active & Historical Claims</h2>
            {claims.map(claim => {
              const step = STATUS_TO_STEP[claim.status] ?? 0;
              const colorClass = STATUS_COLORS[claim.status] || 'text-slate-400';
              const isOwner = claim.deceasedUserId === user?.id;
              const canExecute = claim.status === 'GRACE_PERIOD_ACTIVE' && isGraceDone(claim.graceEndsAt);

              return (
                <div key={claim.claimId} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">
                        Claim #{claim.claimId.slice(0, 8)} {claim.deceased_name ? `— ${claim.deceased_name}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Reg: <span className="font-mono">{claim.certificateMetadata?.registrationNumber}</span> •
                        2/3 Quorum: {claim.submittedShares.length}/{claim.quorumConfig.requiredQuorum} required ({claim.quorumConfig.totalNominees} nominees) •
                        Filed {new Date(claim.initiatedAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full border font-medium ${colorClass}`}>
                      {claim.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Stepper */}
                  <div className="relative py-2">
                    <div className="absolute top-6 left-4 right-4 h-0.5 bg-slate-700">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${(step / (CLAIM_STEPS.length - 1)) * 100}%` }}
                      />
                    </div>
                    <div className="relative flex justify-between">
                      {CLAIM_STEPS.map((s, i) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-all ${
                              i < step
                                ? 'bg-indigo-500 text-white'
                                : i === step
                                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                                  : 'bg-slate-700 text-slate-500'
                            }`}
                          >
                            {i < step ? '✓' : i + 1}
                          </div>
                          <span className={`text-xs text-center max-w-[80px] ${i <= step ? 'text-slate-300' : 'text-slate-600'}`}>
                            {s}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hold / Abort / Dispute Banners */}
                  {claim.holdReason && (
                    <div className="p-3.5 bg-orange-900/20 border border-orange-700/40 rounded-xl flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-orange-300">Held for Manual Review</p>
                        <p className="text-orange-200/80 text-xs mt-0.5">{claim.holdReason}</p>
                      </div>
                    </div>
                  )}

                  {claim.abortReason && (
                    <div className="p-3.5 bg-rose-900/20 border border-rose-700/40 rounded-xl flex items-start gap-3">
                      <Ban className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-rose-300">Aborted by Living Estate Owner</p>
                        <p className="text-rose-200/80 text-xs mt-0.5">{claim.abortReason}</p>
                      </div>
                    </div>
                  )}

                  {claim.disputeReason && (
                    <div className="p-3.5 bg-red-900/20 border border-red-700/40 rounded-xl flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-red-300">Claim Disputed — Execution Paused</p>
                        <p className="text-red-200/80 text-xs mt-0.5">{claim.disputeReason}</p>
                      </div>
                    </div>
                  )}

                  {/* Registry Verification Summary */}
                  {claim.registryResult && (
                    <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-xl flex items-center gap-3 text-xs">
                      <ShieldCheck className={`w-4 h-4 flex-shrink-0 ${claim.registryResult.status === 'VERIFIED' ? 'text-emerald-400' : 'text-orange-400'}`} />
                      <div className="text-slate-300">
                        <span className="font-semibold">Registry ({claim.registryResult.provider}):</span>{' '}
                        {claim.registryResult.status}
                        {claim.registryResult.details ? ` — ${claim.registryResult.details}` : ''}
                      </div>
                    </div>
                  )}

                  {/* Pending Quorum: Additional Share Form */}
                  {claim.status === 'PENDING_QUORUM' && (
                    <div className="p-4 bg-slate-900/70 border border-slate-700 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-yellow-300">
                        <Key className="w-4 h-4" />
                        <span>
                          Waiting for {claim.quorumConfig.requiredQuorum - claim.submittedShares.length} more nominee key share(s) to meet 2/3 quorum
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Nominee email (optional if logged in)"
                          value={extraShareInputs[claim.claimId]?.nomineeId || ''}
                          onChange={e =>
                            setExtraShareInputs(p => ({
                              ...p,
                              [claim.claimId]: { nomineeId: e.target.value, rawShare: p[claim.claimId]?.rawShare || '' },
                            }))
                          }
                          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="text"
                          placeholder="Nominee key share"
                          value={extraShareInputs[claim.claimId]?.rawShare || ''}
                          onChange={e =>
                            setExtraShareInputs(p => ({
                              ...p,
                              [claim.claimId]: { nomineeId: p[claim.claimId]?.nomineeId || '', rawShare: e.target.value },
                            }))
                          }
                          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleAdditionalShare(claim.claimId)}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                          Submit Share
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Grace Period Countdown & Guard Actions */}
                  {claim.status === 'GRACE_PERIOD_ACTIVE' && claim.graceEndsAt && (
                    <div className="p-4 bg-amber-900/20 border border-amber-700/40 rounded-xl space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-amber-300 text-sm">Grace Period Active</p>
                            <p className="text-amber-200 font-mono text-lg font-bold">{getCountdown(claim.graceEndsAt)}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => handleLivenessAbort(claim.claimId)}
                              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" /> I'm Alive (Abort Claim)
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDispute(claim.claimId)}
                            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" /> Raise Dispute
                          </button>
                          <button
                            type="button"
                            disabled={!canExecute}
                            onClick={() => handleExecute(claim.claimId)}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" /> Execute Smart Contract
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Executed Asset Handover Actions + Smart Contract Decryption */}
                  {claim.status === 'EXECUTED' && (
                    <div className="p-4 bg-emerald-900/15 border border-emerald-700/30 rounded-xl space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-emerald-300">
                            Smart Contract Executed • Key Shares Destroyed ✓
                          </p>
                          {claim.contractAddress && (
                            <p className="text-xs font-mono text-slate-400 mt-0.5">
                              Contract: {claim.contractAddress} • Tx: {claim.executionTxHash?.slice(0, 18)}...
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDecryptAssets(claim.claimId)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
                        >
                          🔓 Decrypt &amp; View Inherited Assets
                        </button>
                      </div>

                      {decryptedByClaim[claim.claimId] ? (
                        <div className="space-y-2 pt-2 border-t border-emerald-700/30">
                          {decryptedByClaim[claim.claimId].map((item: any) => (
                            <div key={item.actionId} className="bg-slate-900/80 border border-slate-700 rounded-lg p-3 text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="font-semibold text-white">{item.assetName} ({item.assetType})</span>
                                <span className="text-emerald-400 uppercase font-mono">{item.actionType}</span>
                              </div>
                              <p className="text-slate-300">
                                <strong>Instructions:</strong> {item.decrypted?.instructions}
                              </p>
                              <pre className="text-slate-400 bg-slate-950/70 p-2 rounded overflow-x-auto">
                                {JSON.stringify(item.decrypted?.details, null, 2)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      ) : (
                        claim.actions && claim.actions.length > 0 && (
                          <div className="divide-y divide-slate-700/50">
                            {claim.actions.map(action => (
                              <div key={action.id} className="py-2 flex items-center justify-between text-xs">
                                <div>
                                  <span className="font-medium text-white">{action.asset_name}</span>
                                  <span className="ml-2 text-slate-400 uppercase">({action.action_type})</span>
                                  <p className="text-slate-400 mt-0.5">{action.result_notes}</p>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                                  {action.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Blockchain Audit Trail */}
                  {claim.blockchain && claim.blockchain.blocks.length > 0 && (
                    <div className="p-3.5 bg-slate-900/70 border border-slate-700/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-indigo-300">
                          ⛓️ Immutable Blockchain Stage Ledger ({claim.blockchain.blocks.length} blocks)
                        </span>
                        <span className={`font-medium ${claim.blockchain.chainIntegrity.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                          {claim.blockchain.chainIntegrity.valid ? 'Chain Integrity Verified ✓' : 'Chain Compromised ✗'}
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {claim.blockchain.blocks.map(b => (
                          <div key={b.index} className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-800/70 px-2.5 py-1.5 rounded-lg">
                            <span className="font-mono text-indigo-300">#{b.index} {b.stage}</span>
                            <span className="font-mono text-slate-400 truncate max-w-[220px]">tx: {b.txHash}</span>
                            <span className="text-slate-500">{new Date(b.timestamp).toLocaleTimeString()}</span>
                          </div>
                        ))}
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
