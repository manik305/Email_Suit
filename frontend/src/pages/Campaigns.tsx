import React, { useState, useEffect } from 'react';
import { useAppContext, API_BASE_URL, CreateCampaignPayload } from '../context/AppContext';
import { ALL_TIMEZONES, TZ_REGIONS, localToUtc, utcToLocal } from '../data/timezones';
import { InboxPanel, RecipientsPanel, AnalyticsPanel } from '../components/CampaignPanels';
import EmailConfigPanel from '../components/EmailConfigPanel';
import DataIntegrationPanel from '../components/DataIntegrationPanel';
import type { Panel } from '../components/CampaignPanels';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string,string> = {
    active:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    draft:'bg-slate-500/10 text-slate-400 border-slate-500/20',
    paused:'bg-amber-500/10 text-amber-400 border-amber-500/20',
    completed:'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  return <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${map[status]??map.draft}`}>{status}</span>;
};

const CampaignsPage: React.FC = () => {
  const { state, createCampaign, refreshData } = useAppContext();
  const [showModal, setShowModal]     = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpStage, setFollowUpStage] = useState(1);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [selectedId, setSelectedId]   = useState<string|null>(null);

  const [initialSubject, setInitialSubject] = useState('');
  const [initialBody, setInitialBody] = useState('');
  const [previewName, setPreviewName] = useState('John Doe');
  const [previewCompany, setPreviewCompany] = useState('Acme Corp');
  const [sideTone, setSideTone] = useState('professional');
  const [sideProduct, setSideProduct] = useState('');
  const [sideDraftLoading, setSideDraftLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [toast, setToast]             = useState<string|null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [tzRegion, setTzRegion]         = useState('US & Canada');
  const [tzSearch, setTzSearch]         = useState('');

  const [form, setForm] = useState<CreateCampaignPayload & {
    tone: string; product: string; localDt: string; timezone: string;
  }>({
    name:'', target_segment:'All Leads', schedule:'Once',
    subject:'', body_template:'', send_at:'',
    email_config_id:'',
    tone:'professional', product:'',
    localDt:'', timezone:'America/New_York', target_region: 'US',
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // Filtered TZ list
  const tzList = ALL_TIMEZONES.filter(t =>
    t.region === tzRegion &&
    (!tzSearch || t.label.toLowerCase().includes(tzSearch.toLowerCase()))
  );

  const handleGenerate = async () => {
    if (!form.name) { showToast('Enter a campaign name first.'); return; }
    setDraftLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chat/draft`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ campaign_name:form.name, target_segment:form.target_segment, tone:form.tone, product_or_service:form.product||undefined, include_subject:true }),
      });
      if (res.ok) {
        const d = await res.json();
        setForm(p => ({ ...p, subject: d.subject ?? p.subject, body_template: d.body }));
        showToast('✨ AI draft generated!');
      } else { showToast('Draft generation failed — check EURI_API_KEY.'); }
    } catch { showToast('Network error during draft generation.'); }
    setDraftLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const send_at = form.localDt ? localToUtc(form.localDt, form.timezone) : undefined;
    const created = await createCampaign({
      name: form.name, target_segment: form.target_segment,
      schedule: form.schedule, subject: form.subject || undefined,
      body_template: form.body_template || undefined,
      send_at, email_config_id: form.email_config_id || undefined,
      target_region: form.target_region,
    });
    setSubmitting(false);
    if (created) {
      showToast(`✅ "${created.name}" created${send_at ? ' — scheduled!' : '!'}`);
      setShowModal(false);
      setForm({ name:'',target_segment:'All Leads',schedule:'Once',subject:'',body_template:'',send_at:'',email_config_id:'',tone:'professional',product:'',localDt:'',timezone:'America/New_York',target_region:'US' });
    } else { showToast('❌ Failed to create campaign.'); }
  };

  const selected = state.campaigns.find(c => c.id === selectedId);

  // Sidebar Controls States
  const [sideTzRegion, setSideTzRegion] = useState('US & Canada');
  const [sideTzSearch, setSideTzSearch] = useState('');
  const [sideTimezone, setSideTimezone] = useState('America/New_York');
  const [sideLocalDt, setSideLocalDt] = useState('');
  const [updatingSchedule, setUpdatingSchedule] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [showConfirmSendNow, setShowConfirmSendNow] = useState(false);

  // Sync sidebar states when campaign is selected or modified in the database
  useEffect(() => {
    if (selected) {
      setSideTimezone(selected.timezone || 'America/New_York');
      const foundTz = ALL_TIMEZONES.find(t => t.value === selected.timezone);
      if (foundTz) {
        setSideTzRegion(foundTz.region);
      }
      if (selected.send_at) {
        const localVal = utcToLocal(selected.send_at, selected.timezone || 'America/New_York');
        setSideLocalDt(localVal);
      } else {
        setSideLocalDt('');
      }
    }
  }, [selectedId, selected?.send_at, selected?.timezone]);

  // Sync initial draft states when campaign is selected or showFollowUpModal becomes true
  useEffect(() => {
    if (selected && showFollowUpModal) {
      setInitialSubject(selected.subject || '');
      setInitialBody(selected.body_template || '');
      if (selected.follow_up_templates) {
        setFollowUps(selected.follow_up_templates);
      } else {
        setFollowUps([]);
      }
    }
  }, [selected, showFollowUpModal]);

  const handleSideGenerate = async () => {
    if (!selected) return;
    setSideDraftLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chat/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: selected.name,
          target_segment: selected.target_segment || 'All Leads',
          tone: sideTone,
          product_or_service: sideProduct || undefined,
          include_subject: true
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setInitialSubject(d.subject || '');
        setInitialBody(d.body || '');
        showToast('✨ AI draft regenerated!');
      } else {
        showToast('Failed to generate draft.');
      }
    } catch {
      showToast('Network error during draft generation.');
    } finally {
      setSideDraftLoading(false);
    }
  };

  const handleSaveSequence = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/campaigns/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: initialSubject,
          body_template: initialBody,
          follow_up_templates: followUps,
        }),
      });
      if (res.ok) {
        showToast('✅ Sequence & Initial Draft updated successfully!');
        await refreshData();
        setShowFollowUpModal(false);
      } else {
        showToast('❌ Failed to update Initial Draft.');
      }
    } catch {
      showToast('❌ Network error saving sequence.');
    }
  };

  const handleUpdateSchedule = async () => {
    if (!selectedId) return;
    setUpdatingSchedule(true);
    try {
      const send_at = sideLocalDt ? localToUtc(sideLocalDt, sideTimezone) : null;
      const res = await fetch(`${API_BASE_URL}/campaigns/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: sideTimezone,
          send_at: send_at,
        }),
      });
      if (res.ok) {
        await refreshData();
        showToast('📅 Campaign schedule updated successfully!');
      } else {
        showToast('❌ Failed to update schedule.');
      }
    } catch (e) {
      showToast('❌ Network error updating schedule.');
    } finally {
      setUpdatingSchedule(false);
    }
  };

  const handleSendNow = async () => {
    if (!selectedId) return;
    setSendingNow(true);
    setShowConfirmSendNow(false);
    try {
      const res = await fetch(`${API_BASE_URL}/campaigns/${selectedId}/send`, {
        method: 'POST',
      });
      if (res.ok) {
        const d = await res.json();
        await refreshData();
        showToast(`🚀 Dispatched to ${d.sent} recipient(s) successfully!`);
      } else {
        const errorText = await res.text();
        showToast(`❌ Dispatch failed: ${errorText || 'Server error'}`);
      }
    } catch (e) {
      showToast('❌ Network error triggering dispatch.');
    } finally {
      setSendingNow(false);
    }
  };

  const PANELS = [
    { key:'inbox'            as Panel, label:'Inbox',            color:'text-blue-400',   icon:'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { key:'data-integration' as Panel, label:'Data Integration', color:'text-cyan-400',   icon:'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
    { key:'drafts'           as Panel, label:'Drafts',           color:'text-amber-400',  icon:'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { key:'sent'             as Panel, label:'Sent',             color:'text-emerald-400',icon:'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
    { key:'analytics'        as Panel, label:'Analytics',        color:'text-purple-400', icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key:'email-config'     as Panel, label:'Email Config',     color:'text-rose-400',   icon:'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ];


  return (
    <div className="space-y-6 animate-fade-in pb-20 text-slate-700">
      {toast && (
        <div className="fixed top-6 right-6 z-[100] px-5 py-3 bg-[#FCFAF5] border border-[#E2DCBE] rounded-xl text-sm text-slate-800 shadow-xl animate-fade-in">
          {toast}
        </div>
      )}

      {/* Top Banner Navigation (matching Screenshot 2 path navigation) */}
      <div className="text-xs text-slate-400 flex items-center gap-1">
        <span className="hover:underline cursor-pointer" onClick={() => { setSelectedId(null); setActivePanel(null); }}>Home</span>
        <span>&gt;</span>
        {selectedId ? <span className="text-slate-600 font-medium">{selected?.name}</span> : <span className="text-slate-600 font-medium">Campaigns</span>}
      </div>

      {/* Main Campaign List Dashboard */}
      {!selectedId ? (
        <div className="space-y-6">
          
          {/* Dashboard Header Panel */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-[#E6EFF6] rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">All Campaigns</span>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-1 bg-[#FCFAF5] border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50">
                📊 Report
              </button>
            </div>
            
            <button
              onClick={() => setShowModal(true)}
              className="px-5 py-2 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-xl transition-all shadow-md text-sm"
            >
              Create New Campaign
            </button>
          </div>

          {/* Filters and search controls (matching screenshot 1) */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">Campaigns</span>
              <button className="px-3 py-1 rounded-full text-xs font-semibold bg-[#E6EFF6] text-[#2C5F78]">Others</button>
              <button className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-150 text-slate-600 hover:bg-slate-200">Select all</button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-250 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9] focus:border-[#4BA7C9]"
                />
                <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
              
              <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                <button className="p-1.5 bg-slate-100 rounded-lg text-slate-700 text-xs font-bold">Grid</button>
                <button className="p-1.5 text-slate-400 hover:text-slate-700 text-xs font-bold">List</button>
              </div>

              <button className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-650 hover:bg-slate-50">
                Filter ⚙️
              </button>
            </div>
          </div>

          {/* Grid Layout of Campaign Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {state.campaigns.length === 0 ? (
              <div className="md:col-span-4 border-2 border-dashed border-slate-200 p-16 text-center text-slate-400 rounded-3xl bg-white">
                No campaigns active. Click <strong className="text-slate-600">Create New Campaign</strong> above to start.
              </div>
            ) : (
              state.campaigns.map(c => {
                  // Dynamically read/render actual metrics from state
                  const campaignRecipients = state.recipients.filter(r => r.campaign_id === c.id);
                  const companies = new Set(campaignRecipients.map(r => r.company_name).filter(Boolean)).size;
                  const contacts = campaignRecipients.length;
                  const sent = campaignRecipients.filter(r => r.status === 'sent').length;

                  return (
                    <div
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setActivePanel(null); }}
                      className="cream-card rounded-2xl p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between"
                    >
                      
                      {/* Top Row: Date, Status, Settings */}
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded border-slate-300 text-[#4BA7C9] focus:ring-[#4BA7C9]" onClick={e => e.stopPropagation()} />
                          <span className="text-[10px] font-bold text-slate-400">
                            {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            c.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {c.status}
                          </span>
                          <div className="w-5 h-5 rounded-full bg-[#EAECEB] flex items-center justify-center text-[10px]">👤</div>
                        </div>
                      </div>

                      {/* Campaign Info */}
                      <div className="mb-4">
                        <h3 className="text-base font-bold text-slate-800 hover:text-[#4BA7C9] transition-colors truncate">{c.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{c.target_segment} · {c.schedule}</p>
                      </div>

                      {/* Stats counters */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-150 mb-4 text-center">
                        <div>
                          <span className="text-[9px] text-slate-400 block uppercase font-medium">Companies</span>
                          <span className="text-sm font-black text-slate-800">{companies}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block uppercase font-medium">Contacts</span>
                          <span className="text-sm font-black text-slate-800">{contacts}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block uppercase font-medium">Email Sent</span>
                          <span className="text-sm font-black text-slate-800">{sent}</span>
                        </div>
                      </div>

                      {/* Status pills grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                        <div className="flex items-center justify-between p-1.5 bg-[#FAF7EA] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Hot
                          </span>
                          <span className="font-bold text-slate-700">0</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#EAF5EC] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Meetings
                          </span>
                          <span className="font-bold text-slate-700">0</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#EAF2F8] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Cold
                          </span>
                          <span className="font-bold text-slate-700">0</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#FCE8E6] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Negative
                          </span>
                          <span className="font-bold text-slate-700">0</span>
                        </div>
                      </div>

                      {/* Today's Tasks Section with Progress Arcs */}
                      <div className="space-y-2 mb-4">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Today's tasks</span>
                        <div className="flex items-center justify-around gap-2 bg-[#F8F9FA] p-2 rounded-xl">
                          
                          {/* Gauge 1 */}
                          <div className="flex flex-col items-center">
                            <svg className="w-10 h-10" viewBox="0 0 36 36">
                              <path className="text-slate-200" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path className="text-[#A294CC]" strokeWidth="3.5" strokeDasharray="0, 100" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <text x="18" y="20.5" className="text-[9px] font-bold text-slate-700" textAnchor="middle">0%</text>
                            </svg>
                            <span className="text-[7px] font-bold text-slate-400 uppercase mt-1">Prioritized</span>
                          </div>

                          {/* Gauge 2 */}
                          <div className="flex flex-col items-center">
                            <svg className="w-10 h-10" viewBox="0 0 36 36">
                              <path className="text-slate-200" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path className="text-[#8B5CF6]" strokeWidth="3.5" strokeDasharray="0, 100" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <text x="18" y="20.5" className="text-[9px] font-bold text-slate-700" textAnchor="middle">0</text>
                            </svg>
                            <span className="text-[7px] font-bold text-slate-400 uppercase mt-1">Scheduled</span>
                          </div>

                          {/* Gauge 3 */}
                          <div className="flex flex-col items-center">
                            <svg className="w-10 h-10" viewBox="0 0 36 36">
                              <path className="text-slate-200" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path className="text-[#8B5CF6]" strokeWidth="3.5" strokeDasharray="0, 100" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <text x="18" y="20.5" className="text-[8px] font-bold text-slate-700" textAnchor="middle">0</text>
                            </svg>
                            <span className="text-[7px] font-bold text-slate-400 uppercase mt-1">Slots</span>
                          </div>

                        </div>
                      </div>

                    {/* Card Footer: quick tools */}
                    <div className="flex justify-end items-center pt-3 border-t border-slate-100 text-[10px]">
                      
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button className="p-1 text-slate-400 hover:text-[#4BA7C9] transition">📋</button>
                        <button className="p-1 text-slate-400 hover:text-[#4BA7C9] transition">📄</button>
                        <button className="p-1 text-slate-400 hover:text-[#4BA7C9] transition">📊</button>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Are you sure you want to delete campaign "${c.name}"?`)) {
                              const res = await fetch(`${API_BASE_URL}/campaigns/${c.id}`, { method: 'DELETE' });
                              if (res.ok) {
                                await refreshData();
                                showToast('🗑️ Campaign deleted successfully');
                              }
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                          title="Delete Campaign"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>
      ) : (
        
        /* Campaign Details View & KPI Block Row (matching Screenshot 2) */
        <div className="space-y-6">
          
          {/* Main Stats KPIs Panel (matching top layout of Screenshot 2) */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
            
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-slate-150 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-800">{selected?.name}</h2>
                <button className="text-slate-400 hover:text-slate-600">✏️</button>
                <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                  {selected?.status}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedId(null); setActivePanel(null); }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition"
                >
                  Back to Hub
                </button>
              </div>
            </div>

            {/* KPI Matrix Row (Dynamic metrics calculated from database) */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              
              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Campaign Activity</span>
                <span className="text-xs font-bold text-slate-600 block mt-1">Till Date</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Number of companies</span>
                <span className="text-sm font-bold text-emerald-600 block mt-1">
                  {new Set(state.recipients.filter(r => r.campaign_id === selectedId).map(r => r.company_name).filter(Boolean)).size}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Number of prospects</span>
                <span className="text-sm font-bold text-emerald-600 block mt-1">
                  {state.recipients.filter(r => r.campaign_id === selectedId).length}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">All follow ups done</span>
                <span className="text-sm font-bold text-emerald-600 block mt-1">0 <span className="text-[9px] text-slate-400 font-normal">Prospects</span></span>
              </div>

              <div className="p-3 bg-[#EAF2F8] border border-blue-200 rounded-xl">
                <span className="text-[10px] text-[#2C5F78] block uppercase font-medium">Today's Scheduled</span>
                <span className="text-xs font-bold text-[#2C5F78] block mt-1">Activity</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">First contact emails</span>
                <span className="text-sm font-bold text-emerald-600 block mt-1">
                  {state.recipients.filter(r => r.campaign_id === selectedId && r.status === 'sent').length}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Follow up emails</span>
                <span className="text-sm font-bold text-emerald-600 block mt-1">0</span>
              </div>

            </div>

          </div>

          {/* Details Panels & sticky sidebar layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Area: Dynamic campaign workspace tab panel views */}
            <div className="lg:col-span-8 space-y-6">
              
              <div className="flex flex-wrap gap-2">
                {PANELS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setActivePanel(activePanel === p.key ? null : p.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-bold ${
                      activePanel === p.key
                        ? 'bg-[#E5DEC7] border-[#D0C7AA] text-slate-800'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Active Tab Panel Content */}
              {activePanel && selectedId && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  {activePanel === 'inbox' && <InboxPanel campaignId={selectedId}/>}
                  {activePanel === 'data-integration' && (
                    <DataIntegrationPanel
                      campaignId={selectedId}
                      onUploadSuccess={() => showToast('🎉 Contacts list imported & validated!')}
                    />
                  )}
                  {activePanel === 'drafts' && <RecipientsPanel campaignId={selectedId} status="pending"/>}
                  {activePanel === 'sent' && <RecipientsPanel campaignId={selectedId} status="sent"/>}
                  {activePanel === 'analytics' && selected && <AnalyticsPanel campaign={selected}/>}
                  {activePanel === 'email-config' && selected && (
                    <EmailConfigPanel
                      campaignId={selectedId}
                      linkedConfigId={selected.email_config_id}
                      onLinked={(cid) => showToast(`✅ Mail account linked: ${cid.slice(-6)}`)}
                    />
                  )}
                </div>
              )}

              {/* Preserved template preview */}
              {selected?.body_template && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Subject & Template Content</h3>
                  <div className="bg-[#FAF8F0] p-4 rounded-xl border border-slate-200/60 font-mono text-xs text-slate-700 whitespace-pre-wrap">
                    <strong className="block text-slate-800 mb-2">Subject: {selected.subject}</strong>
                    {selected.body_template}
                  </div>
                </div>
              )}

            </div>

            {/* Right Sticky sidebar: Schedule dispatch settings */}
            <div className="lg:col-span-4 space-y-6">
              
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                  <span>🕐</span> Campaign Timing Scheduler
                </h3>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="region-select" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Region</label>
                    <select
                      id="region-select"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none"
                      value={sideTzRegion}
                      onChange={e => setSideTzRegion(e.target.value)}
                    >
                      {TZ_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="tz-select" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Timezone</label>
                    <select
                      id="tz-select"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none"
                      value={sideTimezone}
                      onChange={e => setSideTimezone(e.target.value)}
                    >
                      {ALL_TIMEZONES.filter(t => t.region === sideTzRegion).map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="date-input" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date & Time</label>
                    <input
                      id="date-input"
                      type="datetime-local"
                      value={sideLocalDt}
                      onChange={e => setSideLocalDt(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none"
                    />
                  </div>

                  <button
                    onClick={handleUpdateSchedule}
                    disabled={updatingSchedule}
                    className="w-full py-2 bg-slate-800 text-white font-bold rounded-lg text-xs hover:bg-slate-700 transition"
                  >
                    Save Timing Settings
                  </button>
                </div>

                <hr className="border-slate-100" />

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Manual Dispatch Trigger</label>
                  {!showConfirmSendNow ? (
                    <button
                      onClick={() => setShowConfirmSendNow(true)}
                      disabled={sendingNow}
                      className="w-full py-2.5 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-lg text-xs transition shadow-sm"
                    >
                      {sendingNow ? 'Processing...' : 'Send Campaign Now'}
                    </button>
                  ) : (
                    <div className="bg-[#FAF8F0] border border-amber-200 p-3 rounded-lg text-xs space-y-2">
                      <span className="font-bold text-slate-800">Confirm Broadcast?</span>
                      <p className="text-[10px] text-slate-500">Send SMTP outreach immediately to all loaded contacts.</p>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setShowConfirmSendNow(false)} className="flex-1 py-1 bg-white border border-slate-200 rounded text-[10px]">Cancel</button>
                        <button onClick={handleSendNow} className="flex-1 py-1 bg-[#51A2C3] text-white rounded text-[10px]">Send</button>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="border-slate-100" />

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Automated Sequences</label>
                  <button
                    onClick={() => {
                      setFollowUpStage(1);
                      setShowFollowUpModal(true);
                    }}
                    className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white font-bold rounded-lg text-xs transition shadow-sm bg-indigo-600 hover:bg-indigo-700"
                  >
                    ✉️ Create & Manage Follow-ups
                  </button>
                </div>


              </div>

            </div>

          </div>

        </div>
      )}

      {/* ─── Create Modal ─────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-3xl border border-slate-200 shadow-2xl p-6 overflow-y-auto max-h-[92vh]">
            
            <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Create New Campaign</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs text-slate-700">
              
              <div className="space-y-1">
                <label htmlFor="c-name" className="block font-bold text-slate-500 uppercase">Campaign Name *</label>
                <input required id="c-name" placeholder="e.g. Outreach Q3 Campaign" value={form.name} onChange={e=>set('name',e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9] focus:border-[#4BA7C9]"/>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label htmlFor="c-segment" className="block font-bold text-slate-500 uppercase">Target Segment</label>
                  <select id="c-segment" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2" value={form.target_segment} onChange={e=>set('target_segment',e.target.value)}>
                    {['All Leads','Cold Outreach','Warm Following','Enterprise','SMB'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="c-cadence" className="block font-bold text-slate-500 uppercase">Cadence</label>
                  <select id="c-cadence" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2" value={form.schedule} onChange={e=>set('schedule',e.target.value)}>
                    {['Once','Daily','Weekly','Monthly'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="c-region" className="block font-bold text-slate-500 uppercase">Target Region</label>
                  <select id="c-region" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2" value={form.target_region || 'US'} onChange={e=>set('target_region',e.target.value)}>
                    <option value="US">US (Full Tracking)</option>
                    <option value="EU">EU (GDPR Privacy)</option>
                    <option value="IN">India (DPDPA)</option>
                    <option value="APAC">APAC (PDPA)</option>
                    <option value="ME">Middle East (PDPL)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="c-config" className="block font-bold text-slate-500 uppercase">SMTP Configuration Mail Account</label>
                <select id="c-config" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2" value={form.email_config_id} onChange={e=>set('email_config_id',e.target.value)}>
                  <option value="">— Link mailer account later —</option>
                  {state.emailConfigs.map(c=><option key={c.id} value={c.id}>{c.name} ({c.sender_address})</option>)}
                </select>
              </div>

              {/* AI generator tool */}
              <div className="bg-[#FAF8F0] border border-amber-250/50 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">✨</span>
                  <span className="font-bold text-slate-800">AI Template Writer</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="c-tone" className="text-[10px] text-slate-500 mb-1 block uppercase font-bold">Tone</label>
                    <select id="c-tone" className="w-full bg-white border border-slate-200 rounded-lg p-1.5" value={form.tone} onChange={e=>set('tone',e.target.value)}>
                      {['professional','casual','persuasive','friendly'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="c-prod" className="text-[10px] text-slate-500 mb-1 block uppercase font-bold">Product / Service</label>
                    <input id="c-prod" placeholder="e.g. SaaS Suite" value={form.product} onChange={e=>set('product',e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-1.5"/>
                  </div>
                </div>
                <button type="button" onClick={handleGenerate} disabled={draftLoading}
                  className="w-full py-2 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-lg transition disabled:opacity-50">
                  {draftLoading ? 'Generating templates...' : '✨ Generate AI Subject & Body Template'}
                </button>
              </div>

              <div className="space-y-1">
                <label htmlFor="c-subject" className="block font-bold text-slate-500 uppercase">Email Subject</label>
                <input id="c-subject" placeholder="Enter Subject template" value={form.subject} onChange={e=>set('subject',e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none"/>
              </div>

              <div className="space-y-1">
                <label htmlFor="c-body" className="block font-bold text-slate-500 uppercase">Email Template Body</label>
                <textarea id="c-body" rows={4} placeholder="Write template body content..." value={form.body_template} onChange={e=>set('body_template',e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 font-mono focus:outline-none resize-none"/>
              </div>

              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-250 transition">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-[#51A2C3] text-white font-bold hover:bg-[#3F93B5] transition disabled:opacity-50">
                  {submitting ? 'Launching...' : 'Launch Campaign'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ─── Follow-up Sequence Modal ─────────────────────────────────────────── */}
      {showFollowUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-3xl border border-slate-200 shadow-2xl p-6 overflow-y-auto max-h-[92vh]">
            
            <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Mail Sequence Configurator</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Campaign: {selected?.name}</p>
              </div>
              <button onClick={() => setShowFollowUpModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            <div className="space-y-4">
              {/* Follow-up Selector Tabs */}
              <div className="flex gap-1 overflow-x-auto pb-2 border-b border-slate-100">
                {[0, 1, 2, 3, 4, 5, 6].map(stage => (
                  <button
                    key={stage}
                    onClick={() => {
                      setFollowUpStage(stage);
                      // Initialize draft content if not present
                      if (stage > 0 && !followUps[stage]) {
                        const defaultBody = `Hi {name},\n\nFollowing up on my previous message regarding {company_name}.\n\nBest regards,\n[Outreach Team]`;
                        setFollowUps(prev => {
                          const copy = [...prev];
                          copy[stage] = defaultBody;
                          return copy;
                        });
                      }
                    }}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      followUpStage === stage
                        ? 'bg-[#E5DEC7] border-[#D0C7AA] text-slate-800'
                        : 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {stage === 0 ? 'Initial Draft' : `Follow-up ${stage}`}
                  </button>
                ))}
              </div>

              {followUpStage === 0 ? (
                // ─── Stage 0: Initial Draft ───
                <div className="space-y-3 p-4 bg-[#FAF8F0] border border-amber-250/30 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">Stage 0 - Initial Mail Draft Settings</span>
                    <span className="text-[10px] bg-[#E6EFF6] px-2 py-0.5 rounded font-mono text-slate-600 font-bold">
                      Sequence Starter
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="initial-subject" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Subject</label>
                    <input
                      id="initial-subject"
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs focus:outline-none"
                      value={initialSubject}
                      onChange={e => setInitialSubject(e.target.value)}
                      placeholder="Enter Subject template"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="initial-body" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Template Body</label>
                    <textarea
                      id="initial-body"
                      rows={5}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-805 font-mono text-xs focus:outline-none resize-none"
                      value={initialBody}
                      onChange={e => setInitialBody(e.target.value)}
                      placeholder="Write template body content..."
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Personalization Tokens</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setInitialBody(p => p + ' {name}')}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-350 rounded text-[10px] font-mono text-slate-700 font-bold transition hover:bg-slate-300"
                      >
                        + Name
                      </button>
                      <button
                        type="button"
                        onClick={() => setInitialBody(p => p + ' {company_name}')}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-350 rounded text-[10px] font-mono text-slate-700 font-bold transition hover:bg-slate-300"
                      >
                        + Company Name
                      </button>
                    </div>
                  </div>

                  {/* AI Regenerator inside Modal */}
                  <div className="bg-white border border-slate-200 p-3.5 rounded-xl space-y-2.5 mt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-500">✨</span>
                      <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">AI Draft Regenerator</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="side-tone" className="text-[9px] text-slate-400 mb-0.5 block uppercase font-bold">Tone</label>
                        <select id="side-tone" className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-[11px]" value={sideTone} onChange={e=>setSideTone(e.target.value)}>
                          {['professional','casual','persuasive','friendly'].map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="side-prod" className="text-[9px] text-slate-400 mb-0.5 block uppercase font-bold">Product / Service</label>
                        <input id="side-prod" placeholder="e.g. SaaS Suite" value={sideProduct} onChange={e=>setSideProduct(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-[11px]"/>
                      </div>
                    </div>
                    <button type="button" onClick={handleSideGenerate} disabled={sideDraftLoading}
                      className="w-full py-1.5 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-lg transition disabled:opacity-50 text-[10px]">
                      {sideDraftLoading ? 'Generating templates...' : '✨ Regenerate Subject & Body Template'}
                    </button>
                  </div>
                </div>
              ) : (
                // ─── Stage 1-6: Follow-up Drafts ───
                <div className="space-y-3 p-4 bg-[#FAF8F0] border border-amber-250/30 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">Stage {followUpStage} Follow-up Settings</span>
                    <span className="text-[10px] bg-slate-200/80 px-2 py-0.5 rounded font-mono text-slate-600">
                      Individual Draft
                    </span>
                  </div>

                  {/* Cadence Calculation Section */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delay Cadence (From Today)</label>
                    <div className="grid grid-cols-2 gap-3 bg-white p-3 border border-slate-200 rounded-xl">
                      <div>
                        <span className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Set Cadence</span>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-700 focus:outline-none"
                          value={form.schedule === 'Once' ? '2' : '3'}
                          onChange={(e) => {
                            const val = e.target.value;
                            set('schedule', val === '2' ? 'Once' : 'Daily'); // temporary toggle
                          }}
                        >
                          <option value="2">2 days from now</option>
                          <option value="3">3 days from now</option>
                        </select>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Calculated Dispatch Target Date</span>
                        <span className="text-xs font-black text-emerald-600 block mt-2">
                          {(() => {
                            const daysToAdd = form.schedule === 'Once' ? 2 : 3;
                            const targetDate = new Date();
                            targetDate.setDate(targetDate.getDate() + daysToAdd);
                            return targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Individual Draft Edit Section */}
                  <div className="space-y-1">
                    <label htmlFor="followup-editor" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Follow-up Template Body</label>
                    <textarea
                      id="followup-editor"
                      rows={5}
                      placeholder="Write custom follow-up body template..."
                      value={followUps[followUpStage] || ''}
                      onChange={(e) => {
                        const text = e.target.value;
                        setFollowUps(prev => {
                          const copy = [...prev];
                          copy[followUpStage] = text;
                          return copy;
                        });
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-850 font-mono text-xs focus:outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Personalization Tokens</span>
                      <span className="text-[9px] text-slate-400 italic">Values resolve dynamically from database</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const currentVal = followUps[followUpStage] || '';
                          setFollowUps(prev => {
                            const copy = [...prev];
                            copy[followUpStage] = currentVal + ' {name}';
                            return copy;
                          });
                        }}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-350 rounded text-[10px] font-mono text-slate-700 font-bold transition hover:bg-slate-300"
                      >
                        + Name
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const currentVal = followUps[followUpStage] || '';
                          setFollowUps(prev => {
                            const copy = [...prev];
                            copy[followUpStage] = currentVal + ' {company_name}';
                            return copy;
                          });
                        }}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-350 rounded text-[10px] font-mono text-slate-700 font-bold transition hover:bg-slate-300"
                      >
                        + Company Name
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Real-time Personalization Previewer Section ─── */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-[#FCFAF5] space-y-2.5">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                  <span>👁️</span> Real-time Personalization Previewer
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Test Name</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-250 rounded-lg px-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9]"
                      value={previewName}
                      onChange={e => setPreviewName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Test Company Name</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-250 rounded-lg px-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9]"
                      value={previewCompany}
                      onChange={e => setPreviewCompany(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-xs space-y-2">
                  {followUpStage === 0 ? (
                    <>
                      <div className="pb-1.5 border-b border-slate-100">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Subject Preview</span>
                        <span className="font-bold text-slate-800 text-xs">
                          {initialSubject
                            .replace(/{name}/g, previewName)
                            .replace(/{company_name}/g, previewCompany)
                            .replace(/{company}/g, previewCompany)
                          }
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold mb-1">Body Preview</span>
                        <div className="font-mono text-slate-700 whitespace-pre-wrap leading-relaxed bg-[#FAF9F6] p-2.5 rounded border border-slate-100 max-h-[150px] overflow-y-auto text-[11px]">
                          {initialBody
                            .replace(/{name}/g, previewName)
                            .replace(/{company_name}/g, previewCompany)
                            .replace(/{company}/g, previewCompany)
                          }
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold mb-1">Follow-up {followUpStage} Body Preview</span>
                      <div className="font-mono text-slate-700 whitespace-pre-wrap leading-relaxed bg-[#FAF9F6] p-2.5 rounded border border-slate-100 max-h-[150px] overflow-y-auto text-[11px]">
                        {(followUps[followUpStage] || '')
                          .replace(/{name}/g, previewName)
                          .replace(/{company_name}/g, previewCompany)
                          .replace(/{company}/g, previewCompany)
                        }
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowFollowUpModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-755 font-bold hover:bg-slate-200 transition text-center text-xs"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveSequence();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#51A2C3] text-white font-bold hover:bg-[#3F93B5] transition text-center text-xs"
                >
                  Save Sequence
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default CampaignsPage;
