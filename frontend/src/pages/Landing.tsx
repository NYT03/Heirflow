import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Users, Zap, ArrowRight, Lock, ChevronRight } from 'lucide-react';

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              HeirFlow
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">
              Sign In
            </Link>
            <Link
              to="/register"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 py-28 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-indigo-900/40 border border-indigo-700/50 rounded-full px-4 py-2 mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-indigo-300 font-medium">Now in Public Beta · Trusted by 10,000+ families</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your Digital Legacy,{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Secured.
            </span>
            <br />
            Your Family,{' '}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Protected.
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            The intelligent platform for managing and transferring your digital assets when it matters most.
            Bank-grade security meets thoughtful design.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              to="/register"
              className="group flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg shadow-indigo-900/50"
            >
              Start Planning (Free)
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all"
            >
              Nominee Login
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          {/* Stats Bar */}
          <div className="inline-flex items-center gap-6 bg-slate-800/60 border border-slate-700 rounded-2xl px-8 py-4 backdrop-blur-sm">
            {['10,000+ Assets Protected', '99.9% Uptime', 'Bank-grade Security'].map((stat, i) => (
              <React.Fragment key={stat}>
                <span className="text-sm font-medium text-slate-300">{stat}</span>
                {i < 2 && <span className="text-slate-600">•</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-4">Everything your estate needs</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Comprehensive tools to protect, organize, and transfer your digital life.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: '🔒',
              IconComp: Shield,
              title: 'Secure Vault',
              desc: 'Store all your digital assets — bank accounts, crypto wallets, subscriptions, files — encrypted and organized in one place.',
              color: 'from-blue-500 to-indigo-600',
              bg: 'bg-blue-500/10',
              border: 'border-blue-500/20',
            },
            {
              icon: '👥',
              IconComp: Users,
              title: 'Smart Nominees',
              desc: 'Assign trusted nominees with granular permissions and cryptographic key shares. Multi-party authorization protects against fraud.',
              color: 'from-purple-500 to-pink-600',
              bg: 'bg-purple-500/10',
              border: 'border-purple-500/20',
            },
            {
              icon: '⚡',
              IconComp: Zap,
              title: 'Automated Execution',
              desc: 'Smart contracts trigger asset transfers automatically. Grace periods, identity verification, and dispute resolution built in.',
              color: 'from-amber-500 to-orange-600',
              bg: 'bg-amber-500/10',
              border: 'border-amber-500/20',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className={`${feature.bg} border ${feature.border} rounded-2xl p-8 hover:scale-[1.02] transition-transform`}
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-2xl mb-6`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="bg-slate-800/40 border-y border-slate-800 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-4">How HeirFlow Works</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Add Your Assets', desc: 'Log bank accounts, crypto, subscriptions, properties, and more.' },
              { step: '02', title: 'Set Nominees', desc: 'Assign trusted family members with permissions and key shares.' },
              { step: '03', title: 'Configure Instructions', desc: 'Tell HeirFlow what to do with each asset — transfer, cancel, or recover.' },
              { step: '04', title: 'Activate Your Plan', desc: 'Your estate plan is live. Nominees can claim when the time comes.' },
            ].map((item, i) => (
              <div key={item.step} className="relative text-center">
                {i < 3 && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-full h-0.5 bg-gradient-to-r from-indigo-500/50 to-transparent" />
                )}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-700/40 rounded-3xl p-12">
          <h2 className="text-4xl font-bold mb-4">Start protecting your legacy today</h2>
          <p className="text-slate-300 mb-8 text-lg">Free forever for personal use. No credit card required.</p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-10 py-4 rounded-xl font-semibold text-lg transition-all shadow-xl shadow-indigo-900/50"
          >
            Create Your Estate Plan Free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center">
        <p className="text-slate-500 text-sm">
          © 2024 HeirFlow · Built with ❤️ for families everywhere
        </p>
      </footer>
    </div>
  );
};

export default Landing;

