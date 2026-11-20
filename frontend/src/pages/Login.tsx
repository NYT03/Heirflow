import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email || !password) {
      const msg = 'Please fill in all fields';
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Invalid email or password';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 grid lg:grid-cols-2">
      {/* Left Editorial Panel */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 border-r border-zinc-900 overflow-hidden bg-[#0C0C0F]">
        <img
          src="/images/auth-minimal.jpg"
          alt="Minimalist architectural geometry"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="relative z-10">
          <Link to="/">
            <Logo size="md" />
          </Link>
        </div>
        <div className="relative z-10 max-w-md space-y-3">
          <p className="text-xl font-medium text-zinc-100 leading-snug">
            “Clarity for the people you trust, secured until the moment they need it.”
          </p>
          <p className="text-xs text-zinc-400">Zero-knowledge encrypted estate vault</p>
        </div>
      </div>

      {/* Right Form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-7">
          <div className="lg:hidden">
            <Link to="/">
              <Logo size="md" />
            </Link>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Sign in</h1>
            <p className="text-sm text-zinc-400 mt-1">Access your private digital estate vault</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="flex items-center gap-2.5 bg-red-950/50 border border-red-800/70 text-red-300 text-xs px-3.5 py-2.5 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[#111114] border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-[#111114] border border-zinc-800 rounded-lg pl-9 pr-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-100 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 py-2.5 rounded-lg text-sm font-semibold transition-colors mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-zinc-500 text-xs text-center">
            Don't have an account?{' '}
            <Link to="/register" className="text-zinc-200 hover:text-white font-medium underline underline-offset-4">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
