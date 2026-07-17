/**
 * EmailConfigPanel.tsx
 * ────────────────────
 * Embedded inside the Campaign detail view.
 * Supports Gmail / G Suite, Microsoft 365, and Custom SMTP + IMAP.
 * Lets the user create, edit and delete SMTP/IMAP configs and link
 * the active one to the parent campaign.
 */
import React, { useState, useEffect } from 'react';
import { API_BASE_URL, EmailConfigSummary } from '../context/AppContext';

// ─── Provider presets ─────────────────────────────────────────────────────────
const PRESETS: Record<string, { smtpHost: string; smtpPort: number; imapHost: string; imapPort: number; label: string }> = {
  gmail: {
    label: 'Gmail / G Suite',
    smtpHost: 'smtp.gmail.com', smtpPort: 587,
    imapHost: 'imap.gmail.com', imapPort: 993,
  },
  microsoft: {
    label: 'Microsoft 365 / Outlook',
    smtpHost: 'smtp.office365.com', smtpPort: 587,
    imapHost: 'outlook.office365.com', imapPort: 993,
  },
  custom: {
    label: 'Custom SMTP / IMAP',
    smtpHost: '', smtpPort: 587,
    imapHost: '', imapPort: 993,
  },
};

interface Props {
  campaignId: string;
  linkedConfigId?: string;
  onLinked: (configId: string) => void;
  projectId?: string;
}

interface ConfigForm {
  name: string;
  provider: string;
  senderAddress: string;
  senderName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpTls: boolean;
  enableImap: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
}

const blank = (): ConfigForm => ({
  name: '', provider: 'gmail', senderAddress: '', senderName: '',
  smtpHost: PRESETS.gmail.smtpHost, smtpPort: PRESETS.gmail.smtpPort,
  smtpUser: '', smtpPass: '', smtpTls: true,
  enableImap: true,
  imapHost: PRESETS.gmail.imapHost, imapPort: PRESETS.gmail.imapPort,
  imapUser: '', imapPass: '',
});

const EmailConfigPanel: React.FC<Props> = ({ campaignId, linkedConfigId, onLinked, projectId }) => {
  const [configs, setConfigs]       = useState<EmailConfigSummary[]>([]);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<ConfigForm>(blank());
  const [saving, setSaving]         = useState(false);
  const [testing, setTesting]       = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const [linking, setLinking]       = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const loadConfigs = async () => {
    try {
      const url = projectId ? `${API_BASE_URL}/config/?project_id=${projectId}` : `${API_BASE_URL}/config/`;
      const r = await fetch(url);
      if (r.ok) setConfigs(await r.json());
    } catch { /* silent */ }
  };

  useEffect(() => { loadConfigs(); }, [projectId]);

  // ── Apply provider preset ──
  const applyPreset = (provider: string) => {
    const p = PRESETS[provider] ?? PRESETS.custom;
    setForm(f => ({
      ...f,
      provider,
      smtpHost: p.smtpHost, smtpPort: p.smtpPort,
      imapHost: p.imapHost, imapPort: p.imapPort,
    }));
  };

  const set = (k: keyof ConfigForm, v: string | number | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  // ── Save config ────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name,
      provider: form.provider,
      sender_address: form.senderAddress,
      sender_name: form.senderName || undefined,
      smtp: {
        host: form.smtpHost,
        port: form.smtpPort,
        username: form.smtpUser,
        password: form.smtpPass,
        use_tls: form.smtpTls,
      },
      imap: form.enableImap ? {
        host: form.imapHost,
        port: form.imapPort,
        username: form.imapUser || form.smtpUser,
        password: form.imapPass || form.smtpPass,
        use_ssl: true,
      } : undefined,
      is_active: true,
      project_id: projectId || undefined,
    };

    try {
      const url  = editId ? `${API_BASE_URL}/config/${editId}` : `${API_BASE_URL}/config/`;
      const meth = editId ? 'PATCH' : 'POST';
      const res  = await fetch(url, { method: meth, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const saved = await res.json();
        showToast(`✅ Config "${saved.name}" saved.`);
        await loadConfigs();
        setShowForm(false);
        setEditId(null);
        setForm(blank());
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ ${err.detail ?? 'Save failed'}`);
      }
    } catch (ex) { showToast(`❌ Network error: ${ex}`); }
    setSaving(false);
  };

  // ── Test Connection (SMTP & IMAP) ──────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/config/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp_host: form.smtpHost,
          smtp_port: form.smtpPort,
          smtp_username: form.smtpUser,
          smtp_password: form.smtpPass,
          smtp_use_tls: form.smtpTls,
          enable_imap: form.enableImap,
          imap_host: form.imapHost,
          imap_port: form.imapPort,
          imap_username: form.imapUser || form.smtpUser,
          imap_password: form.imapPass || form.smtpPass,
          imap_use_ssl: true,
        }),
      });
      const d = await res.json();
      if (d.success) {
        showToast('✅ SMTP & IMAP connections successfully verified!');
      } else {
        let msg = '';
        if (d.smtp && !d.smtp.success) {
          msg += `❌ SMTP failed: ${d.smtp.error}. `;
        }
        if (d.imap && !d.imap.success) {
          msg += `❌ IMAP failed: ${d.imap.error}.`;
        }
        showToast(msg || '❌ Connection test failed.');
      }
    } catch { showToast('❌ Connection test network error.'); }
    setTesting(false);
  };

  // ── Link config to campaign ────────────────────────────────────────────────
  const handleLink = async (configId: string) => {
    setLinking(true);
    try {
      const res = await fetch(`${API_BASE_URL}/campaigns/${campaignId}/attach-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_config_id: configId }),
      });
      if (res.ok) { onLinked(configId); showToast('✅ Mailer linked to campaign.'); }
      else showToast('❌ Failed to link config.');
    } catch { showToast('❌ Network error.'); }
    setLinking(false);
  };

  // ── Toggle active status ───────────────────────────────────────────────────
  const handleToggleActive = async (c: EmailConfigSummary) => {
    try {
      const res = await fetch(`${API_BASE_URL}/config/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      if (res.ok) {
        showToast(`✅ Config "${c.name}" is now ${!c.is_active ? 'Active' : 'Inactive'}.`);
        await loadConfigs();
      } else {
        showToast('❌ Failed to update active status.');
      }
    } catch {
      showToast('❌ Network error.');
    }
  };

  // ── Delete config ──────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this email config?')) return;
    try {
      await fetch(`${API_BASE_URL}/config/${id}`, { method: 'DELETE' });
      await loadConfigs();
      showToast('🗑️ Config deleted.');
    } catch { showToast('❌ Delete failed.'); }
  };

  // ── Edit prefill ───────────────────────────────────────────────────────────
  const startEdit = (c: EmailConfigSummary) => {
    const provider = (['gmail', 'microsoft', 'custom'].includes(c.provider) ? c.provider : 'custom');
    
    // Find matching preset or fallback to custom values from database
    const defaultSmtpHost = PRESETS[provider]?.smtpHost || '';
    const defaultImapHost = PRESETS[provider]?.imapHost || '';
    
    setForm({
      name: c.name, provider,
      senderAddress: c.sender_address, senderName: c.sender_name ?? '',
      smtpHost: c.smtp_host || defaultSmtpHost,
      smtpPort: c.smtp_port ?? 587,
      smtpUser: c.sender_address, smtpPass: '', smtpTls: true,
      enableImap: !!(c.imap_host),
      imapHost: c.imap_host || defaultImapHost,
      imapPort: c.imap_port ?? 993,
      imapUser: '', imapPass: '',
    });
    setEditId(c.id);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-6 right-6 z-[200] px-5 py-3 bg-slate-800 border border-slate-600 rounded-xl text-sm text-white shadow-2xl">
          {toast}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {linkedConfigId
            ? `✅ Mailer linked · ${configs.find(c => c.id === linkedConfigId)?.sender_address ?? linkedConfigId}`
            : '⚠️ No mailer linked — link one below or create new.'}
        </p>
        <button
          onClick={() => { setEditId(null); setForm(blank()); setShowForm(v => !v); }}
          className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all font-medium"
        >
          {showForm ? 'Cancel' : '+ New Config'}
        </button>
      </div>

      {/* ── Saved configs list ─────────────────────────────────────────────── */}
      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map(c => (
            <div key={c.id}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${c.id === linkedConfigId ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900/40 border-slate-700/50'}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate flex items-center gap-2">
                  {c.name}
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${c.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {c.is_active ? 'Enabled' : 'Disabled'}
                  </span>
                </p>
                <p className="text-xs text-slate-500">{c.sender_address} · {c.provider} · SMTP:{c.smtp_host}:{c.smtp_port}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <button onClick={() => handleToggleActive(c)}
                  className={`text-xs px-2 py-1 rounded-lg transition-all font-medium ${c.is_active ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300'}`}>
                  {c.is_active ? 'Disable' : 'Enable'}
                </button>
                {c.id !== linkedConfigId ? (
                  <button onClick={() => handleLink(c.id)} disabled={linking}
                    className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all disabled:opacity-50">
                    Use This
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400 font-bold">Linked ✓</span>
                )}
                <button onClick={() => startEdit(c)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all">Edit</button>
                <button onClick={() => handleDelete(c.id)} className="text-xs px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit form ─────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-5 space-y-4">
          <h4 className="text-sm font-bold text-slate-300">{editId ? 'Edit Email Config' : 'New Email Config'}</h4>

          {/* Provider tabs */}
          <div className="flex gap-2">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} type="button"
                onClick={() => applyPreset(key)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${form.provider === key ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Config name + sender */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="config-name" className="text-xs text-slate-500 mb-1 block">Config Name *</label>
              <input required id="config-name" name="name" type="text" placeholder="e.g. My Work Gmail" value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label htmlFor="config-sender-name" className="text-xs text-slate-500 mb-1 block">Sender Name</label>
              <input id="config-sender-name" name="senderName" type="text" placeholder="e.g. John from Acme" value={form.senderName} onChange={e => set('senderName', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
            </div>
          </div>
          <div>
            <label htmlFor="config-sender-address" className="text-xs text-slate-500 mb-1 block">From Email Address *</label>
            <input required id="config-sender-address" name="senderAddress" type="email" placeholder="you@company.com" value={form.senderAddress} onChange={e => set('senderAddress', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>

          {/* SMTP section */}
          <div className="border border-slate-700/50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">📤 SMTP (Outgoing)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label htmlFor="config-smtp-host" className="text-xs text-slate-500 mb-1 block">SMTP Host *</label>
                <input required id="config-smtp-host" name="smtpHost" type="text" placeholder="smtp.gmail.com" value={form.smtpHost} onChange={e => set('smtpHost', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
              </div>
              <div>
                <label htmlFor="config-smtp-port" className="text-xs text-slate-500 mb-1 block">Port *</label>
                <input required id="config-smtp-port" name="smtpPort" type="number" value={form.smtpPort} onChange={e => set('smtpPort', Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="config-smtp-user" className="text-xs text-slate-500 mb-1 block">Username / Email *</label>
                <input required id="config-smtp-user" name="smtpUser" type="email" placeholder="you@company.com" value={form.smtpUser} onChange={e => set('smtpUser', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
              </div>
              <div>
                <label htmlFor="config-smtp-pass" className="text-xs text-slate-500 mb-1 block">Password / App Password *</label>
                <input required id="config-smtp-pass" name="smtpPass" type="password" placeholder="••••••••••••" value={form.smtpPass} onChange={e => set('smtpPass', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="smtpTls" checked={form.smtpTls} onChange={e => set('smtpTls', e.target.checked)} className="accent-indigo-500"/>
              <label htmlFor="smtpTls" className="text-xs text-slate-400">Use STARTTLS (recommended for port 587)</label>
            </div>
            <button type="button" onClick={handleTest} disabled={testing || !form.smtpHost || !form.smtpUser || !form.smtpPass}
              className="w-full py-2 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              {testing ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Testing…</> : '🔌 Test SMTP & IMAP Connection'}
            </button>
          </div>

          {/* IMAP section */}
          <div className="border border-slate-700/50 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">📥 IMAP (Inbox / Received)</p>
              <label htmlFor="enableImap" className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input id="enableImap" name="enableImap" type="checkbox" checked={form.enableImap} onChange={e => set('enableImap', e.target.checked)} className="accent-indigo-500"/>
                Enable IMAP
              </label>
            </div>
            {form.enableImap && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label htmlFor="config-imap-host" className="text-xs text-slate-500 mb-1 block">IMAP Host</label>
                    <input id="config-imap-host" name="imapHost" type="text" placeholder="imap.gmail.com" value={form.imapHost} onChange={e => set('imapHost', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
                  </div>
                  <div>
                    <label htmlFor="config-imap-port" className="text-xs text-slate-500 mb-1 block">Port</label>
                    <input id="config-imap-port" name="imapPort" type="number" value={form.imapPort} onChange={e => set('imapPort', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="config-imap-user" className="text-xs text-slate-500 mb-1 block">Username <span className="text-slate-600">(blank = same as SMTP)</span></label>
                    <input id="config-imap-user" name="imapUser" type="email" placeholder="same as SMTP" value={form.imapUser} onChange={e => set('imapUser', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
                  </div>
                  <div>
                    <label htmlFor="config-imap-pass" className="text-xs text-slate-500 mb-1 block">Password <span className="text-slate-600">(blank = same as SMTP)</span></label>
                    <input id="config-imap-pass" name="imapPass" type="password" placeholder="same as SMTP" value={form.imapPass} onChange={e => set('imapPass', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600">For Gmail: use an App Password (not your Google password). Go to Google Account → Security → App Passwords.</p>
              </>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(blank()); }}
              className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-600 transition-all">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
              {saving ? 'Saving…' : editId ? 'Update Config' : 'Save Config'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default EmailConfigPanel;
