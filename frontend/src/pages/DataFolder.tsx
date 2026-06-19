import React, { useState, useRef } from 'react';
import { useAppContext, API_BASE_URL } from '../context/AppContext';

const REQUIRED_HEADERS = [
  "first name",
  "last name",
  "mail ID",
  "alternative mail ID",
  "title",
  "department",
  "company name",
  "website",
  "LinkedIn ID",
  "industry",
  "state",
  "pin code",
  "country"
];

const DataFolderPage: React.FC = () => {
  const { state, uploadFileToBackend, refreshData } = useAppContext();
  const [dragActive, setDragActive] = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [bulkCampaignId, setBulkCampaignId] = useState('');
  const [assigning, setAssigning]   = useState(false);
  const [toast, setToast]           = useState<string|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // Download beautiful Sample Excel Template
  const handleDownloadTemplate = () => {
    const csvContent = REQUIRED_HEADERS.join(",") + "\n" +
      "John,Doe,john.doe@company.com,john.alt@personal.com,Senior Developer,Engineering,Company Inc,https://company.com,linkedin.com/in/johndoe,Software,California,90210,United States\n" +
      "Jane,Smith,jane.smith@enterprise.com,jane.alt@personal.com,Product Manager,Product,Enterprise Corp,https://enterprise.com,linkedin.com/in/janesmith,Technology,New York,10001,United States";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "campaign_leads_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Drag & drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    if (e.dataTransfer.files[0]) uploadFileToBackend(e.dataTransfer.files[0]);
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) uploadFileToBackend(e.target.files[0]);
  };

  // Row checkbox
  const toggleRow = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected(selected.size === state.recipients.length
      ? new Set()
      : new Set(state.recipients.map(r => r.id)));
  };

  // Assign single recipient
  const assignSingle = async (recipientId: string, campaignId: string) => {
    if (!campaignId) return;
    try {
      await fetch(`${API_BASE_URL}/data/recipients/${recipientId}/campaign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      await refreshData();
      showToast('✅ Recipient assigned to campaign.');
    } catch { showToast('❌ Assignment failed.'); }
  };

  // Bulk assign
  const handleBulkAssign = async () => {
    if (!bulkCampaignId) { showToast('Select a campaign first.'); return; }
    if (!selected.size)  { showToast('Select at least one recipient.'); return; }
    setAssigning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/data/recipients/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: bulkCampaignId, recipient_ids: Array.from(selected) }),
      });
      const d = await res.json();
      await refreshData();
      setSelected(new Set());
      showToast(`✅ ${d.assigned} recipient${d.assigned!==1?'s':''} assigned to campaign.`);
    } catch { showToast('❌ Bulk assignment failed.'); }
    setAssigning(false);
  };

  const handleResetDatabase = async () => {
    if (!window.confirm("⚠️ WARNING: Are you sure you want to completely wipe all tables and reset the database? All campaigns, leads, and configs will be permanently deleted. This cannot be undone.")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/data/database/reset`, { method: 'DELETE' });
      if (res.ok) {
        await refreshData();
        showToast('🗑️ Database has been successfully reset.');
      } else {
        const err = await res.json();
        showToast(`❌ Reset failed: ${err.detail || 'unknown error'}`);
      }
    } catch {
      showToast('❌ Failed to reach the reset endpoint.');
    }
  };

  const handleDeleteRecipient = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this lead record?")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/data/recipients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshData();
        showToast('🗑️ Lead record deleted successfully.');
      } else {
        showToast('❌ Failed to delete lead.');
      }
    } catch {
      showToast('❌ Network error during deletion.');
    }
  };

  const statusColor = (s: string) => {
    const m: Record<string,string> = {
      pending:'bg-amber-500/10 text-amber-400',
      sent:'bg-emerald-500/10 text-emerald-400',
      bounced:'bg-red-500/10 text-red-400',
    };
    return m[s] ?? 'bg-slate-700 text-slate-400';
  };

  return (
    <div className="p-4 space-y-8 animate-fade-in pb-20 text-slate-100">
      {toast && (
        <div className="fixed top-6 right-6 z-[100] px-5 py-3 bg-slate-800 border border-slate-600 rounded-xl text-sm text-white shadow-2xl">{toast}</div>
      )}

      {/* Header and Download template button */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/30 p-6 rounded-2xl border border-slate-700/30">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">Lead Data Hub</h1>
          <p className="text-slate-400 mt-2 text-sm">Upload lead lists matching the 13 required headers to populate your verified CRM database.</p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2.5 bg-slate-850 hover:bg-slate-750 text-indigo-400 hover:text-indigo-300 font-semibold text-xs rounded-xl border border-slate-700 hover:border-indigo-500/30 transition-all flex items-center gap-2 shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M7 10l5 5m0 0l5-5m-5 5V3"/>
            </svg>
            Download Blank CSV Template
          </button>
          <button
            onClick={handleResetDatabase}
            className="px-4 py-2.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 font-semibold text-xs rounded-xl border border-red-900/50 hover:border-red-550/40 transition-all flex items-center gap-2 shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Reset Database
          </button>
        </div>
      </div>

      {/* Required Database Schema Preview */}
      <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800">
        <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
          <span>📊</span>
          Required Database Schema Preview (Excel Structure)
        </h4>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Ensure your columns correspond exactly to this 13-field sequence. You can download the template, fill it out, and drag-and-drop it into the upload zone below to import your contacts directly into the Supabase database.
        </p>
        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/20">
          <table className="w-full text-left text-[11px] border-collapse min-w-[1250px]">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-mono">
                {REQUIRED_HEADERS.map((header) => (
                  <th key={header} className="px-3 py-2.5 font-bold border-r border-slate-850 capitalize">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800 font-mono text-slate-300">
                <td className="px-3 py-2.5 border-r border-slate-850">John</td>
                <td className="px-3 py-2.5 border-r border-slate-850">Doe</td>
                <td className="px-3 py-2.5 border-r border-slate-850 text-cyan-400">john.doe@company.com</td>
                <td className="px-3 py-2.5 border-r border-slate-850 text-slate-500">john.alt@personal.com</td>
                <td className="px-3 py-2.5 border-r border-slate-850">Senior Developer</td>
                <td className="px-3 py-2.5 border-r border-slate-850">Engineering</td>
                <td className="px-3 py-2.5 border-r border-slate-850">Company Inc</td>
                <td className="px-3 py-2.5 border-r border-slate-850 text-cyan-500">https://company.com</td>
                <td className="px-3 py-2.5 border-r border-slate-850 text-cyan-500">linkedin.com/in/johndoe</td>
                <td className="px-3 py-2.5 border-r border-slate-850">Software</td>
                <td className="px-3 py-2.5 border-r border-slate-850">California</td>
                <td className="px-3 py-2.5 border-r border-slate-850">90210</td>
                <td className="px-3 py-2.5">United States</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload area */}
      <div
        className={`glass p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all duration-300 ${dragActive ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 hover:border-slate-500'}`}
        onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
      >
        <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleChange}/>
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 text-indigo-400 shadow-xl">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
        </div>
        <h3 className="text-xl font-semibold mb-2 text-slate-100">Drop your lead lists here</h3>
        <p className="text-slate-400 mb-4 text-sm">Supports Excel/CSV files strictly matching the 13 required schema columns shown above</p>
        <button onClick={() => fileInputRef.current?.click()}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95">
          Select Files
        </button>
      </div>

      {/* ── Recipients Table ─────────────────────────────────────────────────── */}
      <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl">
        {/* Table header */}
        <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-800/50 flex flex-wrap gap-4 justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Verified Lead Database</h2>
            <p className="text-xs text-slate-400 mt-1">Real-time sync · {state.recipients.length} profiles</p>
          </div>

          {/* Bulk assign */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2">
              <span className="text-xs text-indigo-300 font-bold">{selected.size} selected</span>
              <select
                id="bulk-campaign-select"
                name="bulk_campaign_id"
                value={bulkCampaignId}
                onChange={e => setBulkCampaignId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
              >
                <option value="">Pick campaign…</option>
                {state.campaigns.map(c => (
                  <option key={c.id} value={c.id}>#{c.id.slice(-4)} — {c.name}</option>
                ))}
              </select>
              <button onClick={handleBulkAssign} disabled={assigning}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50">
                {assigning ? 'Assigning…' : 'Assign →'}
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {state.recipients.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
              No lead profiles yet. Upload a CSV to start.
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/50">
                  <th className="px-4 py-4">
                    <input id="select-all-recipients" name="select_all" type="checkbox" checked={selected.size === state.recipients.length && state.recipients.length>0}
                      onChange={toggleAll} className="accent-indigo-500 w-4 h-4"/>
                  </th>
                  <th className="px-4 py-4 font-semibold">Name / Email</th>
                  <th className="px-4 py-4 font-semibold">Designation</th>
                  <th className="px-4 py-4 font-semibold">Department</th>
                  <th className="px-4 py-4 font-semibold">Industry</th>
                  <th className="px-4 py-4 font-semibold">Region</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold">Campaign</th>
                  <th className="px-4 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {state.recipients.map(r => {
                  const assignedCampaign = state.campaigns.find(c => c.id === r.campaign_id);
                  return (
                    <tr key={r.id} className={`hover:bg-indigo-500/5 transition-colors group ${selected.has(r.id) ? 'bg-indigo-500/5' : ''}`}>
                      <td className="px-4 py-4">
                        <input id={`select-recipient-${r.id}`} name={`select_recipient_${r.id}`} type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} className="accent-indigo-500 w-4 h-4"/>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-slate-200 font-medium">{r.name || 'Anonymous'}</div>
                        <div className="text-xs text-slate-500">{r.email}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-400">{r.designation || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-400">{r.department || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-400">{r.industry || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-400">{r.region || '—'}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-4">
                        {/* Per-row campaign picker */}
                        <select
                          id={`campaign-assign-${r.id}`}
                          name={`campaign_id_${r.id}`}
                          value={r.campaign_id ?? ''}
                          onChange={e => assignSingle(r.id, e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[180px]"
                        >
                          <option value="">— unassigned —</option>
                          {state.campaigns.map(c => (
                            <option key={c.id} value={c.id}>#{c.id.slice(-4)} {c.name}</option>
                          ))}
                        </select>
                        {assignedCampaign && (
                          <div className="text-[10px] text-indigo-400 mt-0.5 truncate max-w-[180px]">↳ {assignedCampaign.name}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => handleDeleteRecipient(r.id)}
                          className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg transition-all"
                          title="Delete Lead"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataFolderPage;
