import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext, API_BASE_URL, CreateCampaignPayload, Campaign } from '../context/AppContext';
import { ALL_TIMEZONES, TZ_REGIONS, localToUtc } from '../data/timezones';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Recipient {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  alternative_email?: string;
  designation?: string;
  department?: string;
  company_name?: string;
  website?: string;
  linkedin_id?: string;
  industry?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  region?: string;
  status: string;
  send_at?: string;
}
interface InboxMsg   { uid: string; subject: string; from_addr: string; date: string; snippet: string; body?: string; }

export type Panel = 'inbox' | 'data-integration' | 'drafts' | 'sent' | 'analytics' | 'email-config' | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string,string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    draft: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  return <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${map[status]??map.draft}`}>{status}</span>;
};

async function aiDraft(p:{campaign_name:string;target_segment?:string;tone?:string;product_or_service?:string}){
  try {
    const r = await fetch(`${API_BASE_URL}/chat/draft`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,include_subject:true})});
    if(!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ─── Sub-panel: Inbox (IMAP) ──────────────────────────────────────────────────
const InboxPanel: React.FC<{ campaignId: string }> = ({ campaignId }) => {
  const [msgs, setMsgs] = useState<InboxMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedMsg, setSelectedMsg] = useState<InboxMsg | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/campaigns/${campaignId}/inbox`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        if (d.error) {
          setErr(d.error);
        } else {
          setMsgs(d.messages ?? []);
        }
        setLoading(false);
      })
      .catch(e => { setErr(`Failed to load inbox (${e}). Check IMAP config.`); setLoading(false); });
  }, [campaignId]);

  if (loading) return <p className="text-slate-500 text-sm py-8 text-center animate-pulse">Loading inbox…</p>;

  if (err) {
    return (
      <div className="bg-rose-50 border border-rose-250 rounded-2xl p-5 text-rose-800 space-y-2 max-w-xl mx-auto my-4 shadow-sm animate-fade-in">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <h4 className="font-bold text-rose-900 text-sm">IMAP Connection Failure</h4>
        </div>
        <p className="text-xs text-rose-750 leading-relaxed">
          The system was unable to establish a secure IMAP connection to retrieve the inbox messages:
        </p>
        <div className="bg-white/80 p-3 rounded-xl border border-rose-100 font-mono text-xs text-rose-900 overflow-x-auto max-w-full">
          {err}
        </div>
        <div className="text-[11px] text-rose-600 space-y-1 mt-2">
          <p className="font-bold text-rose-700">Troubleshooting Recommendations:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Verify that <strong>IMAP access is enabled</strong> in your email provider settings.</li>
            <li>For Gmail/G Suite: ensure you use a <strong>16-character App Password</strong> rather than your standard account password.</li>
            <li>For Custom IMAP: double check host, port, and security settings.</li>
          </ul>
        </div>
      </div>
    );
  }

  if (!msgs.length) return <p className="text-slate-500 text-sm py-8 text-center">Inbox is empty.</p>;

  if (selectedMsg) {
    const isBounce = selectedMsg.subject.toLowerCase().includes('delivery status') || 
                     selectedMsg.subject.toLowerCase().includes('undelivered') ||
                     selectedMsg.from_addr.toLowerCase().includes('mailer-daemon');

    return (
      <div className="p-6 bg-slate-900/60 rounded-2xl border border-indigo-500/10 shadow-2xl backdrop-blur-md animate-in fade-in duration-200">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
          <button 
            onClick={() => setSelectedMsg(null)}
            className="flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-all bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/20"
          >
            ← Back to Inbox
          </button>
          {isBounce && (
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
              ⚠️ Delivery Failure
            </span>
          )}
        </div>

        <div className="space-y-3 mb-6 bg-slate-950/40 p-5 rounded-xl border border-slate-800/60">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Subject</span>
            <h2 className="text-base font-bold text-slate-100">{selectedMsg.subject}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">From</span>
              <span className="text-xs text-indigo-300 font-mono font-medium">{selectedMsg.from_addr}</span>
            </div>
            <div className="md:text-right">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Received Date</span>
              <span className="text-xs text-slate-400 font-mono">{selectedMsg.date}</span>
            </div>
          </div>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-2">Message Body</span>
          <div className="bg-slate-950/80 p-5 rounded-xl border border-slate-800/80 text-xs text-slate-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar">
            {selectedMsg.body || selectedMsg.snippet}
          </div>
        </div>

        {isBounce && (
          <div className="mt-6 p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-rose-400">Recipient bounced or email address is invalid</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Please check their email details in the leads list or import an alternative mail ID.</p>
            </div>
            <button 
              onClick={() => setSelectedMsg(null)}
              className="text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg border border-slate-700 transition-all text-center"
            >
              Okay, Go Back
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-700/30">
      {msgs.map(m => {
        const isBounce = m.subject.toLowerCase().includes('delivery status') || 
                         m.subject.toLowerCase().includes('undelivered') ||
                         m.from_addr.toLowerCase().includes('mailer-daemon');
        return (
          <div 
            key={m.uid} 
            onClick={() => setSelectedMsg(m)}
            className="px-6 py-5 hover:bg-indigo-500/5 transition-colors cursor-pointer group flex items-start justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="text-sm font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                  {m.subject}
                </span>
                {isBounce && (
                  <span className="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    Bounce
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium font-mono">{m.from_addr}</p>
              <p className="text-xs text-slate-500 mt-1.5 truncate leading-relaxed">{m.snippet}</p>
            </div>
            <div className="text-right flex-shrink-0 flex flex-col items-end justify-between h-full min-h-[50px]">
              <span className="text-[10px] text-slate-500 font-mono block">{m.date.split(' ')[0] || m.date}</span>
              <span className="text-indigo-400 group-hover:translate-x-1 inline-block mt-3 transition-transform text-xs font-bold">
                Open →
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Sub-panel: Recipients by status ─────────────────────────────────────────
const RecipientsPanel: React.FC<{ campaignId: string; status: 'pending' | 'sent' }> = ({ campaignId, status }) => {
  const [list, setList] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', company_name: '' });
  
  // States for Draft Preview Modal
  const [previewMsg, setPreviewMsg] = useState<{ subject: string; body: string } | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const label = status === 'pending' ? 'Drafts (Queued)' : 'Sent';

  const fetchRecipients = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/data/recipients/by-campaign/${campaignId}`)
      .then(r => r.json())
      .then((all: Recipient[]) => {
        setList(all.filter(r => r.status === status));
        setLoading(false);
      });
  }, [campaignId, status]);

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  const handleSaveEdit = async (rid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/data/recipients/${rid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        fetchRecipients();
      }
    } catch (e) {
      console.error('Failed to update recipient details:', e);
    }
  };

  const handlePreview = async (recipient: Recipient) => {
    setSelectedRecipient(recipient);
    setLoadingPreview(true);
    try {
      const res = await fetch(`${API_BASE_URL}/data/recipients/${recipient.id}/preview`);
      if (res.ok) {
        const d = await res.json();
        setPreviewMsg(d);
      }
    } catch (e) {
      console.error('Failed to fetch preview details:', e);
    }
    setLoadingPreview(false);
  };

  if (loading) return <p className="text-slate-500 text-sm py-8 text-center">Loading…</p>;
  if (!list.length) return <p className="text-slate-500 text-sm py-8 text-center">No {label.toLowerCase()} emails.</p>;

  return (
    <div className="overflow-x-auto space-y-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-900/40">
            <th className="px-6 py-3">Name / Email</th>
            <th className="px-6 py-3">Company Name</th>
            <th className="px-6 py-3">Designation</th>
            {status === 'pending' && <th className="px-6 py-3">Scheduled Send</th>}
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/20">
          {list.map(r => (
            <tr key={r.id} className="hover:bg-indigo-500/5 transition-colors">
              <td className="px-6 py-3">
                {editingId === r.id ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs w-full"
                  />
                ) : (
                  <p className="text-slate-200 font-medium">{r.name || 'Unknown'}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">{r.email}</p>
              </td>
              <td className="px-6 py-3">
                {editingId === r.id ? (
                  <input
                    type="text"
                    value={editForm.company_name}
                    onChange={e => setEditForm(p => ({ ...p, company_name: e.target.value }))}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs w-full"
                  />
                ) : (
                  <span className="text-slate-400">{r.company_name || '—'}</span>
                )}
              </td>
              <td className="px-6 py-3 text-slate-400">{r.designation || '—'}</td>
              
              {status === 'pending' && (
                <td className="px-6 py-3 text-slate-400 font-mono text-[11px]">
                  {r.send_at ? new Date(r.send_at).toLocaleString('en-US', { 
                    timeZone: 'Asia/Kolkata',
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit',
                    timeZoneName: 'short'
                  }) : 'Pending launch'}
                </td>
              )}

              <td className="px-6 py-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${r.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400 font-extrabold' : 'bg-amber-500/10 text-amber-400 font-extrabold'}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-6 py-3">
                {editingId === r.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(r.id)}
                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[10px] transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold rounded text-[10px] transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingId(r.id);
                        setEditForm({ name: r.name || '', company_name: r.company_name || '' });
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 font-bold rounded text-[10px] border border-slate-700 transition"
                    >
                      Edit Draft Fields
                    </button>
                    <button
                      onClick={() => handlePreview(r)}
                      disabled={loadingPreview}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-bold rounded text-[10px] border border-slate-700 transition flex items-center gap-1 disabled:opacity-40"
                    >
                      🔍 Preview
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ─── Draft Preview Modal ─────────────────────────────────────────────── */}
      {previewMsg && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-[#1E293B] border border-slate-700/80 w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-100 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-slate-700/60">
              <h3 className="font-bold text-sm text-indigo-400 uppercase tracking-wider">📧 Email Draft Preview</h3>
              <button 
                onClick={() => {
                  setPreviewMsg(null);
                  setSelectedRecipient(null);
                }}
                className="text-slate-400 hover:text-slate-200 transition text-sm font-bold bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-1">Subject</span>
                <p className="text-xs font-semibold text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">{previewMsg.subject}</p>
              </div>
              
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-1">Message Content</span>
                <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto custom-scrollbar">
                  {previewMsg.body}
                </div>
              </div>

              {/* Recipient Variables Metadata Grid */}
              {selectedRecipient && (
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-[10px] text-indigo-400 uppercase tracking-wider">📋 Loaded Recipient Variables</h4>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                      ID: {selectedRecipient.id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-slate-350">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">First Name</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block">{selectedRecipient.first_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Last Name</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block">{selectedRecipient.last_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Company Name</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block">{selectedRecipient.company_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Designation</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block">{selectedRecipient.designation || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Target Email</span>
                      <span className="font-semibold text-indigo-400 text-[11px] truncate block font-mono">{selectedRecipient.email}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Alternative Email</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block font-mono">{selectedRecipient.alternative_email || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Website</span>
                      {selectedRecipient.website ? (
                        <a href={selectedRecipient.website.startsWith('http') ? selectedRecipient.website : `https://${selectedRecipient.website}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline text-[11px] truncate block font-medium">
                          {selectedRecipient.website}
                        </a>
                      ) : (
                        <span className="font-semibold text-slate-250 text-[11px]">—</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">LinkedIn ID</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block">{selectedRecipient.linkedin_id || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Industry</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block">{selectedRecipient.industry || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Region/State</span>
                      <span className="font-semibold text-slate-250 text-[11px] truncate block">{selectedRecipient.region || selectedRecipient.state || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Scheduled Send</span>
                      <span className="font-semibold text-amber-400 text-[11px] truncate block font-mono">
                        {selectedRecipient.send_at ? new Date(selectedRecipient.send_at).toLocaleString('en-US', {
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZoneName: 'short'
                        }) : 'Pending launch'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => {
                  setPreviewMsg(null);
                  setSelectedRecipient(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sub-panel: Analytics ─────────────────────────────────────────────────────
const AnalyticsPanel: React.FC<{ campaign: Campaign }> = ({ campaign }) => {
  const [list, setList] = useState<Recipient[]>([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/data/recipients/by-campaign/${campaign.id}`)
      .then(r => r.json()).then(setList);
  }, [campaign.id]);
  const total   = list.length;
  const sent    = list.filter(r => r.status === 'sent').length;
  const pending = list.filter(r => r.status === 'pending').length;
  const bounced = list.filter(r => r.status === 'bounced').length;
  const stats = [
    { label: 'Total Recipients', value: total, color: 'text-indigo-400' },
    { label: 'Emails Sent',      value: sent,  color: 'text-emerald-400' },
    { label: 'Pending / Queued', value: pending,color:'text-amber-400' },
    { label: 'Bounced',          value: bounced,color:'text-red-400' },
    { label: 'Delivery Rate',    value: total ? `${Math.round((sent/total)*100)}%` : '—', color:'text-purple-400' },
  ];
  return (
    <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map(s => (
        <div key={s.label} className="bg-slate-900/40 rounded-xl p-4 text-center">
          <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          <p className="text-xs text-slate-500 mt-1">{s.label}</p>
        </div>
      ))}
    </div>
  );
};

export { InboxPanel, RecipientsPanel, AnalyticsPanel };
export type { Recipient };
