import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Link } from 'react-router-dom';
import { PlotlyDashboard } from '../components/PlotlyDashboard';

const DashboardPage: React.FC = () => {
  const { state } = useAppContext();
  const { metrics, campaigns } = state;

  return (
    <div className="p-4 sm:p-8 space-y-10 animate-fade-in transition-all duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700">
            Platform Command Center
          </h1>
          <p className="text-slate-500 mt-2 text-lg">Your unified dashboard for full-stack marketing automation.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium border border-slate-200 shadow-sm transition-all">
            Export Report
          </button>
          <Link 
            to="/campaigns" 
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 transition-all transform hover:scale-105 active:scale-95"
          >
            New Campaign
          </Link>
        </div>
      </div>

      {/* High-Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-blue-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Emails Sent</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-slate-900">{metrics?.totalEmailsSent?.toLocaleString() || '12,482'}</span>
            <span className="text-sm font-medium text-emerald-600">+12%</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Avg. Open Rate</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-slate-900">{metrics?.openRate?.toFixed(1) || '24.8'}%</span>
            <span className="text-sm font-medium text-emerald-600">+2.4%</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-amber-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Avg. Click Rate</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-slate-900">{metrics?.clickRate?.toFixed(1) || '8.2'}%</span>
            <span className="text-sm font-medium text-emerald-600">+1.1%</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-purple-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Active Campaigns</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-slate-900">{metrics?.activeCampaigns ?? campaigns.filter(c => c.status === 'active').length}</span>
            <span className="text-sm font-medium text-slate-500">Running</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Scheduled Follow-ups</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-slate-900">
              {metrics?.totalScheduledFollowUps ?? state.recipients.filter(r => r.status === 'sent' && Boolean(r.next_follow_up_at)).length}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
              {metrics?.scheduledFollowUpsToday ?? state.recipients.filter(r => r.status === 'sent' && r.next_follow_up_at && new Date(r.next_follow_up_at).toDateString() === new Date().toDateString()).length} today
            </span>
          </div>
        </div>
      </div>

      {/* Plotly Outbound Database Analytics & 3D Visuals */}
      <PlotlyDashboard />
    </div>
  );
};

export default DashboardPage;
