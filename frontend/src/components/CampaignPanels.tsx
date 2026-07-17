import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext, API_BASE_URL, CreateCampaignPayload, Campaign, Recipient } from '../context/AppContext';
import { ALL_TIMEZONES, TZ_REGIONS, localToUtc } from '../data/timezones';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InboxMsg {
  uid: string;
  subject: string;
  from_addr: string;
  date: string;
  snippet: string;
  body?: string;
  response_category?: string;
}

interface AnalyticsDetail {
  total_recipients: number;
  total_sent: number;
  total_sent_today: number;
  total_pending: number;
  total_bounced: number;
  total_responded: number;
  total_followups_sent: number;
  total_followups_pending: number;
  leads: number;
  hot: number;
  cold: number;
  negative: number;
  bounce_classified: number;
  delivery_rate: number;
  response_rate: number;
}

export type Panel = 'inbox' | 'data-integration' | 'drafts' | 'sent' | 'analytics' | 'email-config' | 'graph' | null;

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

// ─── Classification Badge ─────────────────────────────────────────────────────
const CategoryBadge: React.FC<{ category: string; size?: 'sm' | 'md' }> = ({ category, size = 'sm' }) => {
  const config: Record<string, { icon: string; label: string; bg: string; text: string; border: string }> = {
    lead:     { icon: '🟢', label: 'Lead',     bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
    hot:      { icon: '🔥', label: 'Hot',      bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-200' },
    cold:     { icon: '❄️', label: 'Cold',     bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-200' },
    negative: { icon: '👎', label: 'Negative', bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-200' },
    bounce:   { icon: '🚫', label: 'Bounce',   bg: 'bg-gray-100',    text: 'text-gray-700',     border: 'border-gray-300' },
  };
  const c = config[category] || config.bounce;
  const sizeClass = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider border ${c.bg} ${c.text} ${c.border} ${sizeClass}`}>
      <span>{c.icon}</span> {c.label}
    </span>
  );
};


// ─── Classification Popup Modal ───────────────────────────────────────────────
const ClassifyModal: React.FC<{
  msg: InboxMsg;
  campaignId: string;
  projectId?: string;
  onClose: () => void;
  onClassified: (category: string) => void;
}> = ({ msg, campaignId, projectId, onClose, onClassified }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(msg.response_category || null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const categories = [
    { key: 'lead',     icon: '🟢', label: 'Lead',     desc: 'Interested prospect — wants to learn more', color: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400' },
    { key: 'hot',      icon: '🔥', label: 'Hot',      desc: 'High-priority — ready for immediate action', color: 'border-orange-300 bg-orange-50 hover:bg-orange-100 hover:border-orange-400' },
    { key: 'cold',     icon: '❄️', label: 'Cold',     desc: 'Not interested right now, maybe later', color: 'border-blue-300 bg-blue-50 hover:bg-blue-100 hover:border-blue-400' },
    { key: 'negative', icon: '👎', label: 'Negative', desc: 'Explicitly not interested or hostile response', color: 'border-red-300 bg-red-50 hover:bg-red-100 hover:border-red-400' },
    { key: 'bounce',   icon: '🚫', label: 'Bounce',   desc: 'Email delivery failed — address invalid', color: 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400' },
  ];

  // Extract sender email
  let senderEmail = msg.from_addr;
  if (senderEmail.includes('<') && senderEmail.includes('>')) {
    senderEmail = senderEmail.split('<')[1].split('>')[0].trim();
  }

  const handleSave = async () => {
    if (!selectedCategory) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await fetch(`${API_BASE_URL}/dnc/classify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: senderEmail.toLowerCase(),
          reason: selectedCategory,
          source_campaign_id: campaignId,
          project_id: projectId || null,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        onClassified(selectedCategory);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Classification failed: ${err.detail || res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to classify:', e);
      alert('Network error during classification');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeInScale 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Classify Response</h3>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">{senderEmail}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="px-6 py-4 space-y-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Select Classification</p>
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                selectedCategory === cat.key
                  ? `${cat.color} ring-2 ring-indigo-300 ring-offset-1`
                  : 'border-gray-150 bg-white hover:bg-gray-50'
              }`}
            >
              <span className="text-xl">{cat.icon}</span>
              <div className="flex-1">
                <span className="text-sm font-bold text-gray-800">{cat.label}</span>
                <p className="text-[11px] text-gray-500 mt-0.5">{cat.desc}</p>
              </div>
              {selectedCategory === cat.key && (
                <span className="text-indigo-500 text-lg">✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Notes */}
        <div className="px-6 pb-3">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add any notes about this response..."
            className="w-full px-3 py-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none resize-none transition-all"
            rows={2}
          />
        </div>

        {/* DNC Notice */}
        <div className="px-6 pb-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
            <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <strong>DNC Blacklist:</strong> This email will be added to the Do Not Contact list. 
              No further follow-ups will be sent to <strong className="font-mono">{senderEmail}</strong> in this project.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedCategory || saving}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? 'Saving...' : 'Classify & Add to DNC'}
          </button>
        </div>
      </div>
    </div>
  );
};


// ─── Sub-panel: Inbox (IMAP) — REDESIGNED with white background ───────────────
const InboxPanel: React.FC<{ campaignId: string; projectId?: string }> = ({ campaignId, projectId }) => {
  const [msgs, setMsgs] = useState<InboxMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedMsg, setSelectedMsg] = useState<InboxMsg | null>(null);
  const [showClassifyModal, setShowClassifyModal] = useState(false);

  const fetchInbox = useCallback(() => {
    setLoading(true);
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    fetch(`${API_BASE_URL}/campaigns/${campaignId}/inbox?limit=100`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        if (d.error) {
          setErr(d.error);
        }
        setMsgs(d.messages ?? []);
        setLoading(false);
      })
      .catch(e => { setErr(`Failed to load inbox (${e}). Check IMAP config.`); setLoading(false); });
  }, [campaignId]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const handleClassified = (category: string) => {
    // Update the selected message's category locally
    if (selectedMsg) {
      setSelectedMsg({ ...selectedMsg, response_category: category });
      setMsgs(prev => prev.map(m =>
        m.uid === selectedMsg.uid ? { ...m, response_category: category } : m
      ));
    }
    setShowClassifyModal(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500 font-medium">Loading inbox…</span>
      </div>
    </div>
  );

  // We no longer return early if there's an error. We want to show the error banner AND any loaded messages (e.g. bounces).

  if (!msgs.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-500">No messages in inbox</p>
      <p className="text-xs text-gray-400 mt-1">New responses will appear here when received</p>
    </div>
  );

  // ─── Message Detail View ─────────────────────────────────────────────
  if (selectedMsg) {
    const isBounce = selectedMsg.response_category === 'bounce' ||
                     selectedMsg.subject.toLowerCase().includes('delivery status') || 
                     selectedMsg.subject.toLowerCase().includes('undelivered') ||
                     selectedMsg.from_addr.toLowerCase().includes('mailer-daemon');

    const currentCategory = selectedMsg.response_category || (isBounce ? 'bounce' : null);

    return (
      <div className="bg-white rounded-xl">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button 
            onClick={() => setSelectedMsg(null)}
            className="flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-all bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100"
          >
            ← Back to Inbox
          </button>
          <div className="flex items-center gap-2">
            {currentCategory && <CategoryBadge category={currentCategory} size="md" />}
            <button
              onClick={() => setShowClassifyModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
            >
              {currentCategory ? '🔄 Re-classify' : '🏷️ Classify Response'}
            </button>
          </div>
        </div>

        {/* Message metadata */}
        <div className="px-6 py-5 border-b border-gray-50 space-y-3">
          <h2 className="text-base font-bold text-gray-900 leading-snug">{selectedMsg.subject}</h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold block mb-0.5">From</span>
              <span className="text-xs text-gray-700 font-medium">{selectedMsg.from_addr}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold block mb-0.5">Date</span>
              <span className="text-xs text-gray-500">{selectedMsg.date}</span>
            </div>
          </div>
        </div>

        {/* Message body — clean white readable view */}
        <div className="px-6 py-5">
          <div className="bg-white text-sm text-gray-800 leading-relaxed whitespace-pre-wrap max-h-[450px] overflow-y-auto font-[system-ui,-apple-system,sans-serif]"
            style={{ lineHeight: '1.7' }}
          >
            {selectedMsg.body || selectedMsg.snippet}
          </div>
        </div>

        {/* Bounce warning */}
        {isBounce && (
          <div className="mx-6 mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
            <span className="text-red-500 text-lg mt-0.5">🚫</span>
            <div>
              <p className="text-xs font-semibold text-red-800">This email bounced — address is invalid or inactive</p>
              <p className="text-[11px] text-red-600 mt-0.5">The recipient has been automatically flagged. No further follow-ups will be sent.</p>
            </div>
          </div>
        )}

        {/* Classify Modal */}
        {showClassifyModal && (
          <ClassifyModal
            msg={selectedMsg}
            campaignId={campaignId}
            projectId={projectId}
            onClose={() => setShowClassifyModal(false)}
            onClassified={handleClassified}
          />
        )}
      </div>
    );
  }

  // ─── Message List View ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {err && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm relative">
          <button 
            onClick={() => setErr('')} 
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-100"
          >
            ✕
          </button>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base">⚠️</span>
            <h4 className="font-bold text-red-800 text-xs">IMAP Connection Failure</h4>
          </div>
          <p className="text-[11px] text-red-700 mb-2 leading-relaxed max-w-[90%]">
            We couldn't connect to the IMAP server. System bounces are still visible, but normal replies won't load until this is fixed.
          </p>
          <div className="bg-white p-2 rounded-lg border border-red-100 font-mono text-[10px] text-red-900 overflow-x-auto">
            {err}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-bold text-gray-700">{msgs.length} message{msgs.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={fetchInbox} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold transition-colors">
          🔄 Refresh
        </button>
      </div>

      {/* Messages */}
      <div className="divide-y divide-gray-100">
        {msgs.map(m => {
          const isBounce = m.response_category === 'bounce' ||
                           m.subject.toLowerCase().includes('delivery status') || 
                           m.subject.toLowerCase().includes('undelivered') ||
                           m.from_addr.toLowerCase().includes('mailer-daemon');
          const effectiveCategory = m.response_category || (isBounce ? 'bounce' : null);
          
          return (
            <div 
              key={m.uid} 
              onClick={() => setSelectedMsg(m)}
              className="px-5 py-4 hover:bg-indigo-50/50 transition-all cursor-pointer group flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {/* Sender initial avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    isBounce ? 'bg-red-400' : effectiveCategory ? 'bg-indigo-400' : 'bg-gray-400'
                  }`}>
                    {(m.from_addr[0] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800 truncate">
                        {m.subject}
                      </span>
                      {effectiveCategory && <CategoryBadge category={effectiveCategory} />}
                    </div>
                    <p className="text-xs text-gray-500 font-medium truncate">{m.from_addr}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1 truncate leading-relaxed pl-10">{m.snippet}</p>
              </div>
              <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                <span className="text-[10px] text-gray-400">{m.date.split(',')[0] || m.date.split(' ').slice(0,3).join(' ')}</span>
                <span className="text-indigo-500 group-hover:translate-x-0.5 inline-block transition-transform text-[11px] font-semibold opacity-0 group-hover:opacity-100">
                  Open →
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
};

// ─── Sub-panel: Recipients by status ─────────────────────────────────────────
const RecipientsPanel: React.FC<{ campaignId: string; status: 'pending' | 'sent' }> = ({ campaignId, status }) => {
  const [list, setList] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ first_name: '', company_name: '' });
  
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
            <th className="px-6 py-3">First Name / Email</th>
            <th className="px-6 py-3">Company Name</th>
            <th className="px-6 py-3">Designation</th>
            {status === 'pending' ? (
              <th className="px-6 py-3">Scheduled Send</th>
            ) : (
              <th className="px-6 py-3">Scheduled Follow-up</th>
            )}
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
                    value={editForm.first_name || ''}
                    onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs w-full"
                    placeholder="First Name"
                  />
                ) : (
                  <p className="text-slate-200 font-medium">{r.first_name || 'Unknown'}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">{r.email}</p>
                {r.response_category && (
                  <CategoryBadge category={r.response_category} />
                )}
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
              
              {status === 'pending' ? (
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
              ) : (
                <td className="px-6 py-3 text-slate-400 font-mono text-[11px]">
                  {r.next_follow_up_at ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold text-amber-500 uppercase">
                        Stage {(r.follow_up_count || 0) + 1}
                      </span>
                      <span>
                        {new Date(r.next_follow_up_at).toLocaleString('en-US', { 
                          timeZone: 'Asia/Kolkata',
                          month: 'short', 
                          day: 'numeric', 
                          hour: '2-digit', 
                          minute: '2-digit',
                          timeZoneName: 'short'
                        })}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500">None / Completed</span>
                  )}
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
                        setEditForm({ first_name: r.first_name || '', company_name: r.company_name || '' });
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

// ─── Sub-panel: Analytics (Enhanced with DNC response breakdown) ──────────────
const AnalyticsPanel: React.FC<{ campaign: Campaign }> = ({ campaign }) => {
  const [list, setList] = useState<Recipient[]>([]);
  const [detail, setDetail] = useState<AnalyticsDetail | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/data/recipients/by-campaign/${campaign.id}`)
      .then(r => r.json()).then(setList);

    // Fetch detailed analytics with response breakdown
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_BASE_URL}/campaigns/${campaign.id}/analytics-detail`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDetail(d); })
      .catch(() => {});
  }, [campaign.id]);

  const total   = list.length;
  const sent    = list.filter(r => r.status === 'sent').length;
  const pending = list.filter(r => r.status === 'pending').length;
  const bounced = list.filter(r => r.status === 'bounced').length;

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/dnc/export/${campaign.id}`, { headers });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DNC_Responses_${campaign.name.replace(/\s+/g, '_')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExporting(false);
  };

  // Basic stats
  const basicStats = [
    { label: 'Total Recipients', value: total, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'Emails Sent (Total)', value: sent,  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Sent Today',        value: detail ? detail.total_sent_today : 0, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: 'Pending / Queued', value: pending,color:'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Bounced',          value: bounced,color:'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Delivery Rate',    value: total ? `${Math.round((sent/total)*100)}%` : '—', color:'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  // Response category stats from detail endpoint
  const responseStats = detail ? [
    { label: 'Leads',    value: detail.leads,              icon: '🟢', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Hot',      value: detail.hot,                icon: '🔥', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { label: 'Cold',     value: detail.cold,               icon: '❄️', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Negative', value: detail.negative,           icon: '👎', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    { label: 'Bounce',   value: detail.bounce_classified,  icon: '🚫', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {/* Basic Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {basicStats.map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Follow-up Pool Stats */}
      {detail && (
        <div className="bg-slate-900/10 border border-slate-700/10 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">🔄 Follow-up Pool Metrics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-3 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">Total Follow-ups Sent</span>
              <span className="text-2xl font-black text-slate-700">{detail.total_followups_sent}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">Pending in Queue</span>
              <span className="text-2xl font-black text-slate-700">{detail.total_followups_pending}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">Daily Limit Constraint</span>
              <span className="text-2xl font-black text-slate-700">{campaign.daily_followup_limit ?? 200} / day</span>
            </div>
          </div>
        </div>
      )}

      {/* Response Classification Breakdown */}
      {detail && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Response Classification</h3>
              {detail.total_responded > 0 && (
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                  {detail.total_responded} classified
                </span>
              )}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  Exporting...
                </>
              ) : (
                <>📥 Export Excel</>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {responseStats.map(s => (
              <div key={s.label} className={`${s.bg} ${s.border} border rounded-xl p-4 text-center transition-transform hover:scale-105`}>
                <span className="text-xl block mb-1">{s.icon}</span>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-500 mt-1 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Summary bar */}
          {detail.total_responded > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span><strong>Response Rate:</strong> {detail.response_rate}%</span>
                <span><strong>Delivery Rate:</strong> {detail.delivery_rate}%</span>
              </div>
              <span className="text-[11px] text-gray-400">
                {detail.total_responded} of {detail.total_sent} sent emails classified
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { InboxPanel, RecipientsPanel, AnalyticsPanel };
export type { Recipient };
