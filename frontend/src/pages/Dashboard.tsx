import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext, Campaign, Recipient } from '../context/AppContext';
import { Link, useNavigate } from 'react-router-dom';
import { useRealtimeEvents } from '../context/useRealtimeEvents';
import { PlotlyDashboard } from '../components/PlotlyDashboard';

export const DashboardPage: React.FC = () => {
  const { state, refreshData, updateCampaignStatus, cloneCampaign } = useAppContext();
  const { metrics, campaigns, recipients, emailConfigs } = state;
  const navigate = useNavigate();

  // ─── Real-Time Sync via SSE ──────────────────────────────────────────────────
  const { isConnected: isRealtimeConnected } = useRealtimeEvents((evt) => {
    if (
      evt.event === 'email_sent' ||
      evt.event === 'campaign_status_changed' ||
      evt.event === 'recipient_updated' ||
      evt.event === 'stats_updated'
    ) {
      refreshData();
    }
  });

  // ─── View & Filter States ─────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');
  
  // Modals & Drawers
  const [selectedInsightCampaign, setSelectedInsightCampaign] = useState<Campaign | null>(null);
  const [selectedCloneCampaign, setSelectedCloneCampaign] = useState<Campaign | null>(null);
  const [cloneName, setCloneName] = useState<string>('');
  const [selectedLeadCategory, setSelectedLeadCategory] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [omniSearch, setOmniSearch] = useState<string>('');
  const [togglingCampaignId, setTogglingCampaignId] = useState<string | null>(null);

  // Keyboard shortcut for Omni Search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Lead Segmentation Calculations (Funnl Taxonomy) ──────────────────────────
  const leadStats = useMemo(() => {
    let hot = 0;
    let meetings = 0;
    let cold = 0;
    let negative = 0;
    let bounce = 0;
    let untouched = 0;

    const uniqueCompanies = new Set<string>();
    const touchedCompanies = new Set<string>();

    recipients.forEach((r) => {
      const company = (r.company_name || '').trim().toLowerCase();
      if (company) uniqueCompanies.add(company);

      const cat = (r.response_category || '').toLowerCase();
      const status = (r.status || '').toLowerCase();

      if (cat === 'hot' || cat === 'interested' || cat === 'positive') {
        hot++;
        if (company) touchedCompanies.add(company);
      } else if (cat === 'meeting' || status === 'meeting' || status === 'booked') {
        meetings++;
        if (company) touchedCompanies.add(company);
      } else if (cat === 'negative' || cat === 'not_interested' || cat === 'unsubscribe') {
        negative++;
        if (company) touchedCompanies.add(company);
      } else if (status === 'bounced' || status === 'invalid') {
        bounce++;
      } else if (status === 'sent' || status === 'clicked' || status === 'opened') {
        cold++;
        if (company) touchedCompanies.add(company);
      } else {
        untouched++;
      }
    });

    return {
      hot,
      meetings,
      cold,
      negative,
      bounce,
      untouched,
      totalContacts: recipients.length,
      totalCompanies: uniqueCompanies.size,
      touchedCompanies: touchedCompanies.size,
      untouchedCompanies: Math.max(0, uniqueCompanies.size - touchedCompanies.size),
    };
  }, [recipients]);

  // ─── Filtered Campaigns ───────────────────────────────────────────────────────
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesStatus =
        filterStatus === 'all' ? true : c.status.toLowerCase() === filterStatus.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.target_segment || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [campaigns, filterStatus, searchQuery]);

  // ─── Funnl Table View Totals ──────────────────────────────────────────────────
  const tableTotals = useMemo(() => {
    let companiesCount = 0;
    let contactsCount = 0;
    let sentCount = 0;

    filteredCampaigns.forEach((c) => {
      const cRecipients = recipients.filter((r) => r.campaign_id === c.id);
      contactsCount += cRecipients.length;
      const comps = new Set(cRecipients.map((r) => r.company_name).filter(Boolean));
      companiesCount += comps.size;
      sentCount += cRecipients.filter((r) => ['sent', 'replied', 'clicked'].includes(r.status)).length;
    });

    return {
      companiesCount,
      contactsCount,
      sentCount,
    };
  }, [filteredCampaigns, recipients]);

  // ─── Action Handlers ──────────────────────────────────────────────────────────
  const handleToggleStatus = async (campaign: Campaign) => {
    setTogglingCampaignId(campaign.id);
    const newStatus = campaign.status === 'active' ? 'paused' : 'active';
    await updateCampaignStatus(campaign.id, newStatus);
    setTogglingCampaignId(null);
  };

  const handleOpenClone = (campaign: Campaign) => {
    setSelectedCloneCampaign(campaign);
    setCloneName(`${campaign.name} (Copy)`);
  };

  const handleConfirmClone = async () => {
    if (!selectedCloneCampaign || !cloneName.trim()) return;
    await cloneCampaign(selectedCloneCampaign.id, cloneName.trim());
    setSelectedCloneCampaign(null);
    setCloneName('');
  };

  const handleExportCSV = () => {
    const headers = ['Campaign Name', 'Status', 'Segment', 'Mails/Min', 'Daily Limit', 'Created At'];
    const rows = filteredCampaigns.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      c.status,
      `"${c.target_segment || ''}"`,
      c.mails_per_minute || 1,
      c.daily_fresh_limit || 50,
      c.created_at
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `funnl_campaigns_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in transition-all duration-300">
      {/* ─── Funnl Command Center Top Nav & Role Bar ────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          {/* Breadcrumb Hierarchy */}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
            <span className="hover:text-slate-600 cursor-pointer">Platform</span>
            <span>/</span>
            <span className="text-blue-600">Command Center</span>
            <span>/</span>
            <span className="text-slate-700 font-bold">Dashboard</span>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Platform Command Center
            </h1>
            
            {/* Real-Time Sync SSE Badge */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all ${
                isRealtimeConnected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isRealtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></span>
              {isRealtimeConnected ? 'Live Real-Time Sync' : 'Reconnecting Event Bus...'}
            </span>

            {/* Team Leader Role Badge */}
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[11px] font-bold text-indigo-700">
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Team Leader Access
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Real-time pipeline monitoring, automated multi-touch cadences & lead allocation.
          </p>
        </div>

        {/* Global Action Deck */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Omni Search Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 shadow-sm transition"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden sm:inline">Search Prospects</span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] text-slate-500 font-mono">⌘K</kbd>
          </button>

          {/* Export Report */}
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>

          {/* New Campaign CTA */}
          <Link
            to="/campaigns"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition transform active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + Create Campaign
          </Link>
        </div>
      </div>

      {/* ─── Funnl Executive KPI Deck (Row 1) ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Card 1: Companies Reached */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:border-blue-400 transition flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Companies</span>
            <span className="p-1 rounded-md bg-blue-50 text-blue-600">🏢</span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {leadStats.totalCompanies.toLocaleString()}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
              <span>Touched: <strong className="text-blue-600 font-bold">{leadStats.touchedCompanies}</strong></span>
              <span className="text-slate-400 font-medium">Pool: {leadStats.untouchedCompanies}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Contacts / Prospects */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:border-indigo-400 transition flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Prospectors</span>
            <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">👥</span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {leadStats.totalContacts.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Emails Sent: <strong className="text-indigo-600 font-bold">{metrics?.totalEmailsSent || 0}</strong></span>
              <span className="text-emerald-600 font-bold">{metrics?.openRate || 0}% Open</span>
            </div>
          </div>
        </div>

        {/* Card 3: Hot Leads (Funnl Rose Badge) */}
        <div
          onClick={() => setSelectedLeadCategory('hot')}
          className="bg-white border border-rose-100 hover:border-rose-300 rounded-2xl p-4 shadow-sm transition cursor-pointer group flex flex-col justify-between bg-gradient-to-br from-rose-50/30 to-white"
        >
          <div className="flex items-center justify-between text-rose-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1">
              🔥 Hot Leads
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-500 group-hover:animate-ping"></span>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-600">
              {leadStats.hot}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Positive intent & ready for call</p>
          </div>
        </div>

        {/* Card 4: Meetings (Funnl Indigo Badge) */}
        <div
          onClick={() => setSelectedLeadCategory('meeting')}
          className="bg-white border border-indigo-100 hover:border-indigo-300 rounded-2xl p-4 shadow-sm transition cursor-pointer group flex flex-col justify-between bg-gradient-to-br from-indigo-50/30 to-white"
        >
          <div className="flex items-center justify-between text-indigo-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1">
              📅 Meetings
            </span>
            <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
          </div>
          <div>
            <div className="text-2xl font-black text-indigo-600">
              {leadStats.meetings}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Calendar RSVPs synced</p>
          </div>
        </div>

        {/* Card 5: Follow-Up & Cold Cadence */}
        <div
          onClick={() => setSelectedLeadCategory('cold')}
          className="bg-white border border-sky-100 hover:border-sky-300 rounded-2xl p-4 shadow-sm transition cursor-pointer group flex flex-col justify-between bg-gradient-to-br from-sky-50/30 to-white"
        >
          <div className="flex items-center justify-between text-sky-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600 flex items-center gap-1">
              ❄️ Cold Follow-Ups
            </span>
            <span className="h-2 w-2 rounded-full bg-sky-500"></span>
          </div>
          <div>
            <div className="text-2xl font-black text-sky-600">
              {leadStats.cold}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Active sequence steps</p>
          </div>
        </div>

        {/* Card 6: Cadence Queue Health */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Follow-Ups Today</span>
            <span className="p-1 rounded-md bg-emerald-50 text-emerald-600">⚡</span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {metrics?.scheduledFollowUpsToday ?? 0}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              All Follow-Ups Clear
            </div>
          </div>
        </div>
      </div>

      {/* ─── Funnl Filter Toolbar & View Switcher ──────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {[
            { id: 'all', label: 'All Campaigns', count: campaigns.length },
            { id: 'active', label: 'Active', count: campaigns.filter(c => c.status === 'active').length },
            { id: 'paused', label: 'Paused', count: campaigns.filter(c => c.status === 'paused').length },
            { id: 'draft', label: 'Drafts', count: campaigns.filter(c => c.status === 'draft').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterStatus === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  filterStatus === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Right: Search, Date Filter & View Toggle */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Quick Search Input */}
          <div className="relative flex-1 md:w-48">
            <input
              type="text"
              placeholder="Filter campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
            />
            <svg
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Date Range Switcher */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">Since Beginning</option>
          </select>

          {/* Card / Table View Switcher (Exact Funnl Toggle) */}
          <div className="flex items-center border border-slate-200 rounded-xl p-0.5 bg-slate-100">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'table'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'card'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Card View"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ─── View Container: Table View or Card View ───────────────────────────── */}
      {viewMode === 'table' ? (
        /* Funnl-Style Data Table */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-3.5 px-4">Campaign Name & Segment</th>
                  <th className="py-3.5 px-3 text-center">Status</th>
                  <th className="py-3.5 px-3 text-center">Companies</th>
                  <th className="py-3.5 px-3 text-center">Contacts</th>
                  <th className="py-3.5 px-4">Activity & Speed</th>
                  <th className="py-3.5 px-3 text-center">Leads Breakdown</th>
                  <th className="py-3.5 px-3 text-center">Sender Mailbox</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No campaigns found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredCampaigns.map((c) => {
                    const cRecipients = recipients.filter((r) => r.campaign_id === c.id);
                    const comps = new Set(cRecipients.map((r) => r.company_name).filter(Boolean));
                    const sent = cRecipients.filter((r) => ['sent', 'replied', 'clicked'].includes(r.status)).length;
                    const cHot = cRecipients.filter((r) => ['hot', 'interested', 'positive'].includes((r.response_category || '').toLowerCase())).length;
                    const cMeetings = cRecipients.filter((r) => ['meeting', 'booked'].includes((r.status || '').toLowerCase()) || (r.response_category || '').toLowerCase() === 'meeting').length;
                    const cCold = cRecipients.filter((r) => ['sent', 'clicked'].includes(r.status)).length;
                    const cNeg = cRecipients.filter((r) => ['negative', 'unsubscribe'].includes((r.response_category || '').toLowerCase())).length;
                    const sender = emailConfigs.find((cfg) => cfg.id === c.email_config_id);

                    const isActive = c.status === 'active';

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-blue-50/20 transition-colors group"
                      >
                        {/* Name & Segment */}
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
                            <span className="hover:text-blue-600 cursor-pointer" onClick={() => setSelectedInsightCampaign(c)}>
                              {c.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Segment: <span className="text-slate-600 font-semibold">{c.target_segment || 'Broad ICP'}</span>
                          </div>
                        </td>

                        {/* Status Toggle Switch */}
                        <td className="py-3.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleStatus(c)}
                            disabled={togglingCampaignId === c.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                              }`}
                            ></span>
                            {togglingCampaignId === c.id ? 'Updating...' : (isActive ? 'Active' : 'Paused')}
                          </button>
                        </td>

                        {/* Companies */}
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700">
                          {comps.size}
                        </td>

                        {/* Contacts */}
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700">
                          {cRecipients.length}
                        </td>

                        {/* Activity & Speed */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-between text-[11px] mb-1 font-semibold text-slate-600">
                            <span>Sent: {sent} / {cRecipients.length}</span>
                            <span className="text-blue-600">{c.mails_per_minute || 1} mails/min</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-600 h-full rounded-full transition-all"
                              style={{
                                width: `${cRecipients.length > 0 ? Math.min(100, Math.round((sent / cRecipients.length) * 100)) : 0}%`,
                              }}
                            ></div>
                          </div>
                        </td>

                        {/* Leads Breakdown Stack */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <span
                              className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-100"
                              title="Hot Leads"
                            >
                              🔥 {cHot}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px] border border-indigo-100"
                              title="Meetings"
                            >
                              📅 {cMeetings}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px] border border-sky-100"
                              title="Cold Sequence"
                            >
                              ❄️ {cCold}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px] border border-slate-200"
                              title="Negative"
                            >
                              ❌ {cNeg}
                            </span>
                          </div>
                        </td>

                        {/* Sender Mailbox */}
                        <td className="py-3.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                          {sender ? sender.sender_address : <span className="text-amber-500 font-sans">No Mailbox</span>}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Insight Modal */}
                            <button
                              onClick={() => setSelectedInsightCampaign(c)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Campaign Insights"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                            </button>

                            {/* Audience Sheet Shortcut */}
                            <Link
                              to={`/data-folder?campaign_id=${c.id}`}
                              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                              title="Open Audience Spreadsheet"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </Link>

                            {/* Clone Campaign */}
                            <button
                              onClick={() => handleOpenClone(c)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                              title="Clone Campaign"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>

                            {/* Edit / Cadence Wizard */}
                            <Link
                              to={`/campaigns?edit=${c.id}`}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                              title="Edit Settings"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Exact Funnl Summary Footer Row */}
              {filteredCampaigns.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100/70 border-t-2 border-slate-200 font-black text-slate-800">
                    <td className="py-3 px-4">TOTALS ({filteredCampaigns.length} Campaigns)</td>
                    <td className="py-3 px-3 text-center">-</td>
                    <td className="py-3 px-3 text-center text-blue-700">{tableTotals.companiesCount}</td>
                    <td className="py-3 px-3 text-center text-indigo-700">{tableTotals.contactsCount}</td>
                    <td className="py-3 px-4">
                      Sent: <span className="text-emerald-700">{tableTotals.sentCount}</span> / {tableTotals.contactsCount}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-rose-600">🔥 {leadStats.hot}</span> | <span className="text-indigo-600">📅 {leadStats.meetings}</span>
                    </td>
                    <td className="py-3 px-3 text-center">-</td>
                    <td className="py-3 px-4 text-right">-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* Funnl Card View Deck */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCampaigns.map((c) => {
            const cRecipients = recipients.filter((r) => r.campaign_id === c.id);
            const comps = new Set(cRecipients.map((r) => r.company_name).filter(Boolean));
            const sent = cRecipients.filter((r) => ['sent', 'replied', 'clicked'].includes(r.status)).length;
            const cHot = cRecipients.filter((r) => ['hot', 'interested', 'positive'].includes((r.response_category || '').toLowerCase())).length;
            const cMeetings = cRecipients.filter((r) => ['meeting', 'booked'].includes((r.status || '').toLowerCase()) || (r.response_category || '').toLowerCase() === 'meeting').length;
            const sender = emailConfigs.find((cfg) => cfg.id === c.email_config_id);
            const isActive = c.status === 'active';

            return (
              <div
                key={c.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-400 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top: Status & Speed */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => handleToggleStatus(c)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                      {isActive ? 'Active' : 'Paused'}
                    </button>
                    <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                      ⚡ {c.mails_per_minute || 1} mails/min
                    </span>
                  </div>

                  {/* Campaign Name & Segment */}
                  <h3
                    onClick={() => setSelectedInsightCampaign(c)}
                    className="text-base font-bold text-slate-800 hover:text-blue-600 cursor-pointer line-clamp-1"
                  >
                    {c.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Segment: <span className="font-semibold text-slate-700">{c.target_segment || 'Broad ICP'}</span>
                  </p>

                  {/* Sending Progress Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                      <span>Delivery Quota</span>
                      <span className="font-bold text-slate-800">{sent} / {cRecipients.length}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all"
                        style={{
                          width: `${cRecipients.length > 0 ? Math.min(100, Math.round((sent / cRecipients.length) * 100)) : 0}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Stats Badges */}
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Companies</div>
                      <div className="text-sm font-black text-slate-800 mt-0.5">{comps.size}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-50/50 border border-rose-100/60">
                      <div className="text-[10px] font-bold uppercase text-rose-500">🔥 Hot</div>
                      <div className="text-sm font-black text-rose-600 mt-0.5">{cHot}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-indigo-50/50 border border-indigo-100/60">
                      <div className="text-[10px] font-bold uppercase text-indigo-500">📅 Meet</div>
                      <div className="text-sm font-black text-indigo-600 mt-0.5">{cMeetings}</div>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">
                    {sender ? sender.sender_address : 'No Mailbox'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedInsightCampaign(c)}
                      className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                    >
                      Insights
                    </button>
                    <Link
                      to={`/data-folder?campaign_id=${c.id}`}
                      className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      title="Audience Spreadsheet"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => handleOpenClone(c)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      title="Clone"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Funnl Insight Summary Modal ───────────────────────────────────────── */}
      {selectedInsightCampaign && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Campaign Insight</div>
                <h2 className="text-xl font-black text-slate-900">{selectedInsightCampaign.name}</h2>
              </div>
              <button
                onClick={() => setSelectedInsightCampaign(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Funnel Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
              <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100">
                <span className="text-[10px] font-bold text-blue-600 uppercase">Total Contacts</span>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {recipients.filter(r => r.campaign_id === selectedInsightCampaign.id).length}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100">
                <span className="text-[10px] font-bold text-indigo-600 uppercase">Outreached</span>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {recipients.filter(r => r.campaign_id === selectedInsightCampaign.id && ['sent', 'replied'].includes(r.status)).length}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-100">
                <span className="text-[10px] font-bold text-rose-600 uppercase">🔥 Hot Leads</span>
                <div className="text-xl font-black text-rose-600 mt-1">
                  {recipients.filter(r => r.campaign_id === selectedInsightCampaign.id && ['hot', 'interested', 'positive'].includes((r.response_category || '').toLowerCase())).length}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                <span className="text-[10px] font-bold text-emerald-600 uppercase">📅 Meetings</span>
                <div className="text-xl font-black text-emerald-600 mt-1">
                  {recipients.filter(r => r.campaign_id === selectedInsightCampaign.id && ((r.response_category || '').toLowerCase() === 'meeting' || r.status === 'meeting')).length}
                </div>
              </div>
            </div>

            {/* Campaign Config Specs */}
            <div className="space-y-2 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Sending Cadence Speed:</span>
                <strong className="text-slate-800">{selectedInsightCampaign.mails_per_minute || 1} emails / min</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Daily Fresh Contact Limit:</span>
                <strong className="text-slate-800">{selectedInsightCampaign.daily_fresh_limit || 50} per day</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Max Contacts per Company:</span>
                <strong className="text-slate-800">{selectedInsightCampaign.max_contacts_per_company || 1}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Attached Mailbox:</span>
                <strong className="text-slate-800">
                  {emailConfigs.find(cfg => cfg.id === selectedInsightCampaign.email_config_id)?.sender_address || 'None'}
                </strong>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-end gap-3 mt-6">
              <Link
                to={`/data-folder?campaign_id=${selectedInsightCampaign.id}`}
                className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition"
              >
                Open Audience Spreadsheet →
              </Link>
              <button
                onClick={() => setSelectedInsightCampaign(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Funnl Clone Campaign Modal ────────────────────────────────────────── */}
      {selectedCloneCampaign && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-900 mb-2">Clone Campaign</h3>
            <p className="text-xs text-slate-500 mb-4">
              Duplicate cadence steps, daily throttling, and sending settings into a new campaign.
            </p>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-600">New Campaign Title</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter campaign title"
              />
            </div>
            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={() => setSelectedCloneCampaign(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClone}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition"
              >
                Confirm Clone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Funnl Lead Category Slide-Over Drawer ─────────────────────────────── */}
      {selectedLeadCategory && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl p-6 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Lead Pipeline</span>
                <h3 className="text-lg font-black text-slate-900 capitalize">
                  {selectedLeadCategory === 'hot' && '🔥 Hot Leads (High Buying Intent)'}
                  {selectedLeadCategory === 'meeting' && '📅 Scheduled Meetings & RSVPs'}
                  {selectedLeadCategory === 'cold' && '❄️ Cold Follow-Up Sequence'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLeadCategory(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Prospects List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {recipients
                .filter((r) => {
                  const cat = (r.response_category || '').toLowerCase();
                  const stat = (r.status || '').toLowerCase();
                  if (selectedLeadCategory === 'hot') return ['hot', 'interested', 'positive'].includes(cat);
                  if (selectedLeadCategory === 'meeting') return ['meeting', 'booked'].includes(stat) || cat === 'meeting';
                  if (selectedLeadCategory === 'cold') return ['sent', 'clicked'].includes(stat);
                  return false;
                })
                .map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-blue-400 transition bg-slate-50/50"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{r.name || `${r.first_name || ''} ${r.last_name || ''}` || 'Prospect'}</h4>
                        <p className="text-xs text-slate-500 font-mono">{r.email}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                        {r.title || 'Executive'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 mt-3 pt-2 border-t border-slate-100">
                      <span>Company: <strong>{r.company_name || 'Direct'}</strong></span>
                      {r.order_id && <span className="font-mono text-slate-400">Order: #{r.order_id}</span>}
                    </div>
                  </div>
                ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Link
                to="/data-folder"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition"
              >
                Open Full Spreadsheet
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ─── Funnl Omni-Search Modal (Ctrl+K) ─────────────────────────────────── */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="Search prospects, companies, campaigns..."
                value={omniSearch}
                onChange={(e) => setOmniSearch(e.target.value)}
                className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
              />
              <button onClick={() => setIsSearchOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
                ESC
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto py-2 divide-y divide-slate-100 text-xs">
              {omniSearch.length < 2 ? (
                <p className="text-center py-6 text-slate-400">Type at least 2 characters to search...</p>
              ) : (
                <>
                  {campaigns
                    .filter(c => c.name.toLowerCase().includes(omniSearch.toLowerCase()))
                    .slice(0, 3)
                    .map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setIsSearchOpen(false);
                          setSelectedInsightCampaign(c);
                        }}
                        className="p-2.5 hover:bg-slate-50 cursor-pointer rounded-lg flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold text-slate-800">📁 {c.name}</span>
                          <span className="text-[10px] text-slate-400 block">Campaign</span>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600">View</span>
                      </div>
                    ))}

                  {recipients
                    .filter(r => (r.email + ' ' + (r.name || '') + ' ' + (r.company_name || '')).toLowerCase().includes(omniSearch.toLowerCase()))
                    .slice(0, 5)
                    .map(r => (
                      <div
                        key={r.id}
                        onClick={() => {
                          setIsSearchOpen(false);
                          navigate(`/data-folder?search=${encodeURIComponent(r.email)}`);
                        }}
                        className="p-2.5 hover:bg-slate-50 cursor-pointer rounded-lg flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold text-slate-800">👤 {r.name || r.email}</span>
                          <span className="text-[10px] text-slate-400 block">{r.company_name || 'No Company'}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{r.email}</span>
                      </div>
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Funnl Outbound Visualizer & Graph Dashboard ───────────────────────── */}
      <div className="pt-4">
        <PlotlyDashboard />
      </div>
    </div>
  );
};

export default DashboardPage;
