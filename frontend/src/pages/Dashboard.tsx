import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Link } from 'react-router-dom';

const DashboardPage: React.FC = () => {
  const { state } = useAppContext();
  const { metrics, campaigns } = state;

  const appModules = [
    {
      title: 'Email Campaigns',
      description: 'Design, launch, and monitor automated email sequences and track outreach performance.',
      path: '/campaigns',
      color: 'text-indigo-400',
      bgGradient: 'group-hover:from-indigo-500/20 group-hover:to-indigo-500/5',
      borderColor: 'group-hover:border-indigo-500/50',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      title: 'Meeting Scheduler',
      description: 'Manage bookings, sync with your calendar, and streamline appointment scheduling.',
      path: '/meetings',
      color: 'text-emerald-400',
      bgGradient: 'group-hover:from-emerald-500/20 group-hover:to-emerald-500/5',
      borderColor: 'group-hover:border-emerald-500/50',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      title: 'Data Management',
      description: 'Upload, enrich, and manage your lead lists and contact databases securely.',
      path: '/data-folder',
      color: 'text-purple-400',
      bgGradient: 'group-hover:from-purple-500/20 group-hover:to-purple-500/5',
      borderColor: 'group-hover:border-purple-500/50',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      )
    },
    {
      title: 'Email Configuration',
      description: 'Manage SMTP settings, sender profiles, and domain authentication for your campaigns.',
      path: '/email-config',
      color: 'text-cyan-400',
      bgGradient: 'group-hover:from-cyan-500/20 group-hover:to-cyan-500/5',
      borderColor: 'group-hover:border-cyan-500/50',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      )
    }
  ];

  // Merge real campaigns into activity feed
  const campaignActivity = campaigns.slice(0, 3).map(c => ({
    id: c.id,
    type: 'email',
    message: `Campaign "${c.name}" created — ${c.status}${c.email_config_id ? ' · mailer linked' : ''}`,
    time: new Date(c.created_at).toLocaleString(),
    icon: '📧',
  }));

  const staticActivity = [
    { id: 's3', type: 'data', message: 'New lead list "Tech-CXOs-Q3" successfully enriched', time: 'Yesterday', icon: '💾' },
  ];

  const recentActivity = [...campaignActivity, ...staticActivity].slice(0, 5);

  return (
    <div className="p-4 sm:p-8 space-y-10 animate-fade-in transition-all duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            Platform Command Center
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Your unified dashboard for full-stack marketing automation.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition-all">
            Export Report
          </button>
          <Link 
            to="/campaigns" 
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/25 transition-all transform hover:scale-105 active:scale-95"
          >
            New Campaign
          </Link>
        </div>
      </div>

      {/* High-Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total Emails Sent</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-white">{metrics?.totalEmailsSent?.toLocaleString() || '12,482'}</span>
            <span className="text-sm font-medium text-emerald-400">+12%</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Avg. Open Rate</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-white">{metrics?.openRate?.toFixed(1) || '24.8'}%</span>
            <span className="text-sm font-medium text-emerald-400">+2.4%</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-amber-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Avg. Click Rate</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-white">{metrics?.clickRate?.toFixed(1) || '8.2'}%</span>
            <span className="text-sm font-medium text-emerald-400">+1.1%</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-purple-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Active Campaigns</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-white">{metrics?.activeCampaigns ?? campaigns.filter(c => c.status === 'active').length}</span>
            <span className="text-sm font-medium text-slate-400">Running</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
            Explore Modules
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {appModules.map((module) => (
              <Link 
                key={module.path} 
                to={module.path}
                className={`group relative glass-panel p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 ${module.borderColor} overflow-hidden`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 ${module.bgGradient}`}></div>
                <div className="relative z-10 flex flex-col h-full">
                  <div className={`p-3 rounded-xl bg-slate-800/50 w-fit mb-4 ${module.color}`}>
                    {module.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{module.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed flex-grow">
                    {module.description}
                  </p>
                  <div className="mt-6 flex items-center text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                    Open Module
                    <svg className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Recent Activity
          </h2>
          <div className="glass-panel rounded-2xl divide-y divide-slate-700/50 overflow-hidden">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="p-4 hover:bg-white/5 transition-colors group cursor-default">
                <div className="flex gap-4">
                  <span className="text-2xl grayscale group-hover:grayscale-0 transition-all">{activity.icon}</span>
                  <div className="flex-1">
                    <p className="text-slate-200 text-sm font-medium">{activity.message}</p>
                    <p className="text-slate-500 text-xs mt-1">{activity.time}</p>
                  </div>
                </div>
              </div>
            ))}
            <button className="w-full p-4 text-center text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-white/5 transition-all">
              View All Activity
            </button>
          </div>

          <div className="glass-panel p-6 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-indigo-500/20 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-bold text-white mb-2">AI Copilot Ready</h3>
              <p className="text-slate-400 text-sm mb-4">Need help optimizing your campaigns or configuring agents? Just ask.</p>
              <button className="w-full py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20">
                Launch Assistant
              </button>
            </div>
            <div className="absolute -right-10 -bottom-10 opacity-10">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
