import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Users, KeyRound, ArrowRight, FileCheck2, Lock } from 'lucide-react';
import Logo from '../components/Logo';

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/80 px-6 py-4 sticky top-0 bg-[#09090B]/90 backdrop-blur-md z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/login" className="text-zinc-400 hover:text-zinc-100 transition-colors text-sm font-medium">
              Sign In
            </Link>
            <Link
              to="/register"
              className="bg-zinc-100 hover:bg-white text-zinc-950 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3.5 py-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span className="text-xs text-zinc-300 font-medium tracking-wide">
                Zero-Knowledge Digital Estate Vault
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight leading-[1.08] text-zinc-50">
              Your digital legacy,{' '}
              <span className="text-zinc-400">quietly secured.</span>
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl">
              Organize your accounts, encrypted credentials, and banking records in one private vault—so your family knows what exists and can claim it with dignity.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/register"
                className="group inline-flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
              >
                Create Estate Plan
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 border border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 text-zinc-200 px-6 py-3 rounded-lg font-medium text-sm transition-colors"
              >
                Nominee Sign In
              </Link>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-500 border-t border-zinc-900">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-zinc-400" /> AES-256-GCM Client Encryption
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-zinc-400" /> 2/3 Nominee Quorum
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-zinc-400" /> Verified Claim Gate
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl">
              <img
                src="/images/hero-vault.jpg"
                alt="Minimalist architectural digital vault"
                className="w-full aspect-[16/10] object-cover opacity-90"
              />
              <div className="p-4 border-t border-zinc-800/80 bg-[#0C0C0F] flex items-center justify-between text-xs text-zinc-400">
                <span>Encrypted Vault &amp; Nominee Registry</span>
                <span className="text-zinc-300 font-medium">AES-256-GCM</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-zinc-900">
        <div className="max-w-xl mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 mb-3">
            Designed for clarity when it matters most
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base">
            Everything required to inventory your digital life, verify a claim, and hand over access without friction.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              IconComp: KeyRound,
              title: 'Encrypted Credential Vault',
              desc: 'Import saved Chrome logins or add accounts manually. Credentials are encrypted in your browser before they ever touch storage.',
            },
            {
              IconComp: Users,
              title: 'Multi-Nominee Quorum',
              desc: 'Designate trusted family members with split cryptographic key shares so no single party can act prematurely.',
            },
            {
              IconComp: ShieldCheck,
              title: 'Verified Claim Gate',
              desc: 'Automated certificate verification, liveness alerts, and grace periods ensure assets are released only when verified.',
            },
          ].map(({ IconComp, title, desc }) => (
            <div
              key={title}
              className="bg-[#111114] border border-zinc-800/90 rounded-2xl p-7 hover:border-zinc-700 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
                <IconComp className="w-5 h-5 text-zinc-200" />
              </div>
              <h3 className="text-base font-semibold text-zinc-100 mb-2">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="border-y border-zinc-900 bg-[#0C0C0F] py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 mb-10">
            How HeirFlow works
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Inventory Assets', desc: 'Import Chrome passwords, add bank accounts, or log crypto & property.' },
              { step: '02', title: 'Assign Nominees', desc: 'Add trusted family members and generate split key shares.' },
              { step: '03', title: 'Set Instructions', desc: 'Specify whether each account should be transferred, closed, or recovered.' },
              { step: '04', title: 'Verified Release', desc: 'Nominees submit verification and unlock encrypted instructions.' },
            ].map((item) => (
              <div key={item.step} className="bg-[#111114] border border-zinc-800/80 rounded-xl p-5">
                <span className="text-xs font-mono text-zinc-500 block mb-3">{item.step}</span>
                <h3 className="font-semibold text-zinc-100 text-sm mb-1.5">{item.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="bg-[#111114] border border-zinc-800 rounded-2xl p-10 sm:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 mb-2">
              Protect your digital estate today
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base">
              Set up your private vault in under two minutes.
            </p>
          </div>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-6 py-3 rounded-lg font-semibold text-sm transition-colors shrink-0"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <Logo size="sm" />
          <p>© {new Date().getFullYear()} HeirFlow. Private Digital Estate Management.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
