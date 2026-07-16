import React, { useState, useEffect } from 'react';
import { useAppContext, API_BASE_URL, CreateCampaignPayload } from '../context/AppContext';
import { ALL_TIMEZONES, TZ_REGIONS, localToUtc, utcToLocal } from '../data/timezones';
import { InboxPanel, RecipientsPanel, AnalyticsPanel } from '../components/CampaignPanels';
import EmailConfigPanel from '../components/EmailConfigPanel';
import DataIntegrationPanel from '../components/DataIntegrationPanel';
import { GraphDashboard } from '../components/GraphDashboard';
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
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(false);

  const fetchProjects = async () => {
    setProjectsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}/projects/`, { headers });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !selectedProjectId) {
          const storedPid = localStorage.getItem('selected_project_id');
          const exists = data.some((p: any) => p.id === storedPid);
          if (exists && storedPid) {
            setSelectedProjectId(storedPid);
          } else {
            setSelectedProjectId(data[0].id);
            localStorage.setItem('selected_project_id', data[0].id);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch projects", e);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}/projects/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newProjectName }),
      });
      if (res.ok) {
        const created = await res.json();
        showToast(`📁 Project "${newProjectName}" created successfully!`);
        setNewProjectName('');
        setShowCreateProjectModal(false);
        await fetchProjects();
        setSelectedProjectId(created.id);
        localStorage.setItem('selected_project_id', created.id);
      } else {
        showToast('❌ Failed to create project.');
      }
    } catch (e) {
      showToast('❌ Network error creating project.');
    }
  };
  const [showModal, setShowModal]     = useState(false);
  const [isEditing, setIsEditing]     = useState(false);
  const [editCampaignId, setEditCampaignId] = useState<string|null>(null);
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
    campaign_type: 'cold',
    subject:'', body_template:'', send_at:'',
    email_config_id:'',
    tone:'professional', product:'',
    localDt:'', timezone:'America/New_York', target_region: 'US',
    mails_per_minute: 2, daily_fresh_limit: 100, max_contacts_per_company: 1,
  });

  const [modalStep, setModalStep] = useState(1);
  const [configMode, setConfigMode] = useState<'existing' | 'new'>('existing');
  const [newConfig, setNewConfig] = useState({
    provider: 'google',
    name: '',
    senderName: '',
    senderAddress: '',
    password: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpTls: true,
    enableImap: true,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapUser: '',
    imapPass: '',
  });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const insertFormatting = (
    textareaId: string,
    type: 'bold' | 'italic' | 'underline' | 'bullet' | 'number' | 'token',
    tokenValue?: string
  ) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = '';
    if (type === 'bold') {
      replacement = `<strong>${selectedText || 'bold text'}</strong>`;
    } else if (type === 'italic') {
      replacement = `<em>${selectedText || 'italic text'}</em>`;
    } else if (type === 'underline') {
      replacement = `<u>${selectedText || 'underlined text'}</u>`;
    } else if (type === 'bullet') {
      replacement = `\n<ul>\n  <li>${selectedText || 'list item'}</li>\n</ul>\n`;
    } else if (type === 'number') {
      replacement = `\n<ol>\n  <li>${selectedText || 'list item'}</li>\n</ol>\n`;
    } else if (type === 'token' && tokenValue) {
      replacement = tokenValue;
    }

    const newVal = text.substring(0, start) + replacement + text.substring(end);

    if (textareaId === 'c-body') {
      set('body_template', newVal);
    } else if (textareaId === 'initial-body') {
      setInitialBody(newVal);
    } else if (textareaId === 'followup-editor') {
      setFollowUps(prev => {
        const copy = [...prev];
        copy[followUpStage] = newVal;
        return copy;
      });
    }

    setTimeout(() => {
      textarea.focus();
      const offset = replacement.length;
      textarea.setSelectionRange(start + offset, start + offset);
    }, 50);
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalStep(1);
    setIsEditing(false);
    setEditCampaignId(null);
    setConfigMode('existing');
    setForm({
      name:'', target_segment:'All Leads', schedule:'Once',
      campaign_type: 'cold',
      subject:'', body_template:'', send_at:'',
      email_config_id:'',
      tone:'professional', product:'',
      localDt:'', timezone:'America/New_York', target_region: 'US',
      mails_per_minute: 2, daily_fresh_limit: 100, max_contacts_per_company: 1,
    });
  };

  const handleStartEdit = () => {
    if (!selected) return;
    setIsEditing(true);
    setEditCampaignId(selected.id);
    
    // Convert send_at to local date-time string
    let localDtStr = '';
    if (selected.send_at) {
      localDtStr = utcToLocal(selected.send_at, selected.timezone || 'America/New_York');
    }

    setForm({
      name: selected.name,
      target_segment: (selected.target_segment as any) || 'All Leads',
      schedule: (selected.schedule as any) || 'Once',
      campaign_type: selected.campaign_type || 'cold',
      subject: selected.subject || '',
      body_template: selected.body_template || '',
      send_at: selected.send_at || '',
      email_config_id: selected.email_config_id || '',
      tone: 'professional',
      product: '',
      localDt: localDtStr,
      timezone: selected.timezone || 'America/New_York',
      target_region: (selected.target_region as any) || 'US',
      mails_per_minute: selected.mails_per_minute || 2,
      daily_fresh_limit: selected.daily_fresh_limit || 100,
      max_contacts_per_company: selected.max_contacts_per_company || 1,
    });
    
    setModalStep(1);
    setConfigMode('existing');
    setShowModal(true);
  };

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
        method:'POST', headers:{'Content-Type':'application/json', ...getAuthHeaders()},
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

    let configId = form.email_config_id || undefined;

    if (configMode === 'new') {
      if (!newConfig.senderAddress || !newConfig.password) {
        showToast('❌ Sender email address and password are required.');
        setSubmitting(false);
        return;
      }
      try {
        const body = {
          name: newConfig.name || `${newConfig.provider === 'google' ? 'Google Workspace' : newConfig.provider === 'microsoft' ? 'Microsoft 365' : 'Custom'} Account`,
          provider: newConfig.provider,
          sender_address: newConfig.senderAddress,
          sender_name: newConfig.senderName || undefined,
          smtp: {
            host: newConfig.provider === 'google' ? 'smtp.gmail.com' 
                 : newConfig.provider === 'microsoft' ? 'smtp.office365.com' 
                 : newConfig.smtpHost,
            port: newConfig.provider === 'google' || newConfig.provider === 'microsoft' ? 587 : newConfig.smtpPort,
            username: newConfig.senderAddress,
            password: newConfig.password,
            use_tls: newConfig.provider === 'google' || newConfig.provider === 'microsoft' ? true : newConfig.smtpTls,
          },
          imap: newConfig.enableImap ? {
            host: newConfig.provider === 'google' ? 'imap.gmail.com' 
                 : newConfig.provider === 'microsoft' ? 'outlook.office365.com' 
                 : newConfig.imapHost,
            port: newConfig.provider === 'google' || newConfig.provider === 'microsoft' ? 993 : newConfig.imapPort,
            username: newConfig.senderAddress,
            password: newConfig.password,
            use_ssl: true,
          } : undefined,
          is_active: true,
          project_id: selectedProjectId || undefined,
        };

        // Test the SMTP and IMAP credentials before saving
        try {
          const testRes = await fetch(`${API_BASE_URL}/config/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              smtp_host: body.smtp.host,
              smtp_port: body.smtp.port,
              smtp_username: body.smtp.username,
              smtp_password: body.smtp.password,
              smtp_use_tls: body.smtp.use_tls,
              enable_imap: !!body.imap,
              imap_host: body.imap?.host,
              imap_port: body.imap?.port,
              imap_username: body.imap?.username,
              imap_password: body.imap?.password,
              imap_use_ssl: true,
            }),
          });
          const testData = await testRes.json();
          if (!testData.success) {
            let testErr = 'Credentials verification failed.';
            if (testData.smtp && !testData.smtp.success) {
              testErr += ` SMTP: ${testData.smtp.error}.`;
            }
            if (testData.imap && !testData.imap.success) {
              testErr += ` IMAP: ${testData.imap.error}.`;
            }
            showToast(`❌ ${testErr}`);
            setSubmitting(false);
            return;
          }
        } catch (testEx) {
          showToast(`❌ Connection test failed with network error: ${testEx}`);
          setSubmitting(false);
          return;
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        };

        const configRes = await fetch(`${API_BASE_URL}/config/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!configRes.ok) {
          const errText = await configRes.text();
          showToast(`❌ Failed to create email config: ${errText}`);
          setSubmitting(false);
          return;
        }

        const savedConfig = await configRes.json();
        configId = savedConfig.id;
        showToast('✅ New email configuration linked.');
        await refreshData();
      } catch (ex) {
        showToast(`❌ Connection error creating config: ${ex}`);
        setSubmitting(false);
        return;
      }
    }

    const send_at = form.localDt ? localToUtc(form.localDt, form.timezone) : null;

    if (isEditing && editCampaignId) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        };

        const res = await fetch(`${API_BASE_URL}/campaigns/${editCampaignId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            name: form.name,
            target_segment: form.target_segment,
            schedule: form.schedule,
            campaign_type: form.campaign_type,
            subject: form.subject || null,
            body_template: form.body_template || null,
            send_at,
            email_config_id: configId || null,
            target_region: form.target_region,
            timezone: form.timezone,
            mails_per_minute: form.mails_per_minute,
            daily_fresh_limit: form.daily_fresh_limit,
            max_contacts_per_company: form.max_contacts_per_company,
            project_id: selectedProjectId || undefined,
          }),
        });

        setSubmitting(false);

        if (res.ok) {
          showToast(`✅ Campaign "${form.name}" updated successfully!`);
          setShowModal(false);
          setModalStep(1);
          setIsEditing(false);
          setEditCampaignId(null);
          setConfigMode('existing');
          setNewConfig({
            provider: 'google', name: '', senderName: '', senderAddress: '', password: '',
            smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUser: '', smtpPass: '', smtpTls: true,
            enableImap: true, imapHost: 'imap.gmail.com', imapPort: 993, imapUser: '', imapPass: ''
          });
          setForm({
            name:'',target_segment:'All Leads',schedule:'Once',subject:'',body_template:'',send_at:'',email_config_id:'',
            campaign_type: 'cold',
            tone:'professional',product:'',localDt:'',timezone:'America/New_York',target_region:'US',
            mails_per_minute: 2, daily_fresh_limit: 100, max_contacts_per_company: 1,
          });
          await refreshData();
        } else {
          const errText = await res.text();
          showToast(`❌ Failed to update campaign: ${errText || 'Server error'}`);
        }
      } catch (err) {
        showToast(`❌ Connection error updating campaign: ${err}`);
        setSubmitting(false);
      }
      return;
    }

    const created = await createCampaign({
      name: form.name, target_segment: form.target_segment,
      schedule: form.schedule, subject: form.subject || undefined,
      body_template: form.body_template || undefined,
      campaign_type: form.campaign_type,
      send_at: send_at || undefined, email_config_id: configId,
      target_region: form.target_region,
      timezone: form.timezone,
      mails_per_minute: form.mails_per_minute,
      daily_fresh_limit: form.daily_fresh_limit,
      max_contacts_per_company: form.max_contacts_per_company,
      project_id: selectedProjectId || undefined,
    } as any);
    setSubmitting(false);
    if (created) {
      showToast(`✅ "${created.name}" created${send_at ? ' — scheduled!' : '!'}`);
      setShowModal(false);
      setModalStep(1);
      setConfigMode('existing');
      setNewConfig({
        provider: 'google', name: '', senderName: '', senderAddress: '', password: '',
        smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUser: '', smtpPass: '', smtpTls: true,
        enableImap: true, imapHost: 'imap.gmail.com', imapPort: 993, imapUser: '', imapPass: ''
      });
      setForm({
        name:'',target_segment:'All Leads',schedule:'Once',subject:'',body_template:'',send_at:'',email_config_id:'',
        campaign_type: 'cold',
        tone:'professional',product:'',localDt:'',timezone:'America/New_York',target_region:'US',
        mails_per_minute: 2, daily_fresh_limit: 100, max_contacts_per_company: 1,
      });
    } else { showToast('❌ Failed to create campaign.'); }
  };

  const selected = state.campaigns.find(c => c.id === selectedId);

  // Sidebar Controls States
  const [sideTzRegion, setSideTzRegion] = useState('US & Canada');
  const [sideTzSearch, setSideTzSearch] = useState('');
  const [sideTimezone, setSideTimezone] = useState('America/New_York');
  const [sideLocalDt, setSideLocalDt] = useState('');
  const [sideMailsPerMinute, setSideMailsPerMinute] = useState(2);
  const [sideDailyFreshLimit, setSideDailyFreshLimit] = useState(100);
  const [sideMaxContactsPerCompany, setSideMaxContactsPerCompany] = useState(1);
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
      setSideMailsPerMinute(selected.mails_per_minute ?? 2);
      setSideDailyFreshLimit(selected.daily_fresh_limit ?? 100);
      setSideMaxContactsPerCompany(selected.max_contacts_per_company ?? 1);
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          timezone: sideTimezone,
          send_at: send_at,
          mails_per_minute: sideMailsPerMinute,
          daily_fresh_limit: sideDailyFreshLimit,
          max_contacts_per_company: sideMaxContactsPerCompany,
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
        headers: getAuthHeaders(),
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

  const handleToggleStatus = async () => {
    if (!selected) return;
    const newStatus = selected.status === 'active' ? 'paused' : 'active';
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      };
      const res = await fetch(`${API_BASE_URL}/campaigns/${selected.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.status === 401) {
        showToast('⚠️ Session expired. Please log in again.');
        localStorage.clear();
        window.location.href = '/';
        return;
      }
      if (res.ok) {
        showToast(`Campaign status updated to ${newStatus}`);
        await refreshData();
      } else {
        showToast('Failed to update campaign status.');
      }
    } catch (err) {
      showToast('Network error updating campaign status.');
    }
  };

  const filteredCampaigns = state.campaigns.filter(c => !selectedProjectId || c.project_id === selectedProjectId);
  const filteredCampaignIds = new Set(filteredCampaigns.map(c => c.id));
  const filteredRecipients = state.recipients.filter(r => r.campaign_id && filteredCampaignIds.has(r.campaign_id));
  const selectedCampaignRecipients = selectedId ? state.recipients.filter(r => r.campaign_id === selectedId) : [];
  const filteredEmailConfigs = state.emailConfigs.filter(cfg => !selectedProjectId || cfg.project_id === selectedProjectId);

  const PANELS = [
    { key:'inbox'            as Panel, label:'Inbox',            color:'text-blue-400',   icon:'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { key:'graph'            as Panel, label:'Neo4j Graph',      color:'text-amber-500',  icon:'M9 20l-5.447-2.724A2 2 0 013 15.447V8.553a2 2 0 011.053-1.789L9 4m0 16v-8m0 8l5.447-2.724A2 2 0 0015 15.447V8.553a2 2 0 00-1.053-1.789L9 4m0 0l5.447 2.724A2 2 0 0115 8.553v6.894a2 2 0 01-1.053 1.789L9 20' },
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

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase">Active Project:</span>
                <select
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none"
                  value={selectedProjectId}
                  onChange={e => {
                    const newPid = e.target.value;
                    setSelectedProjectId(newPid);
                    localStorage.setItem('selected_project_id', newPid);
                    refreshData();
                  }}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {localStorage.getItem('auth_level') === 'admin' && (
                <button
                  onClick={() => setShowCreateProjectModal(true)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  title="Create New Project"
                >
                  📁 New Project
                </button>
              )}

              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditCampaignId(null);
                  setShowModal(true);
                  setModalStep(1);
                }}
                className="px-5 py-2 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-xl transition-all shadow-md text-sm"
              >
                Create New Campaign
              </button>
            </div>
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
            {filteredCampaigns.length === 0 ? (
              <div className="md:col-span-4 border-2 border-dashed border-slate-200 p-16 text-center text-slate-400 rounded-3xl bg-white">
                No campaigns active. Click <strong className="text-slate-600">Create New Campaign</strong> above to start.
              </div>
            ) : (
              filteredCampaigns.map(c => {
                  // Dynamically read/render actual metrics from state
                  const campaignRecipients = filteredRecipients.filter(r => r.campaign_id === c.id);
                  const companies = new Set(campaignRecipients.map(r => r.company_name).filter(Boolean)).size;
                  const contacts = campaignRecipients.length;
                  const sent = campaignRecipients.filter(r => r.status === 'sent').length;

                  // Dynamic categories:
                  const hot = campaignRecipients.filter(r => r.response_category === 'hot').length;
                  const cold = campaignRecipients.filter(r => r.response_category === 'cold').length;
                  const negative = campaignRecipients.filter(r => r.response_category === 'negative').length;
                  const leads = campaignRecipients.filter(r => r.response_category === 'lead').length;
                  const bounced = campaignRecipients.filter(r => r.status === 'bounced').length;

                  // Meetings count: attendee email matches campaign recipients
                  const recipientEmails = new Set(campaignRecipients.map(r => r.email.toLowerCase()));
                  const meetingsCount = (state.meetings || []).filter(m => recipientEmails.has(m.attendee_email.toLowerCase())).length;

                  // Gauges:
                  // 1. Prioritized (pending vs deferred)
                  const pending = campaignRecipients.filter(r => r.status === 'pending').length;
                  const deferred = campaignRecipients.filter(r => r.status === 'deferred').length;
                  const totalEligible = pending + deferred;
                  const prioritizedPercent = totalEligible > 0 ? Math.round((pending / totalEligible) * 100) : 0;
                  
                  // 2. Scheduled (follow-ups scheduled)
                  const scheduledFollowUps = campaignRecipients.filter(r => r.status === 'sent' && r.next_follow_up_at).length;

                  // 3. Slots (daily fresh limit)
                  const slots = c.daily_fresh_limit ?? 100;

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
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium flex items-center gap-1.5 flex-wrap">
                          {c.campaign_type === 'warm' ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-extrabold uppercase tracking-wider">🔥 WARM</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[8px] font-extrabold uppercase tracking-wider">❄️ COLD</span>
                          )}
                          <span>{c.target_segment} · {c.schedule}</span>
                        </p>
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
                          <span className="font-bold text-slate-700">{hot}</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#EAF5EC] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Meetings
                          </span>
                          <span className="font-bold text-slate-700">{meetingsCount}</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#EAF2F8] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Cold
                          </span>
                          <span className="font-bold text-slate-700">{cold}</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#FCE8E6] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" /> Negative
                          </span>
                          <span className="font-bold text-slate-700">{negative}</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#e2f0ed] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" /> Leads
                          </span>
                          <span className="font-bold text-slate-700">{leads}</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-[#f1f5f9] rounded-lg">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Bounced
                          </span>
                          <span className="font-bold text-slate-700">{bounced}</span>
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
                              <path className="text-[#A294CC]" strokeWidth="3.5" strokeDasharray={`${prioritizedPercent}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <text x="18" y="20.5" className="text-[9px] font-bold text-slate-700" textAnchor="middle">{prioritizedPercent}%</text>
                            </svg>
                            <span className="text-[7px] font-bold text-slate-400 uppercase mt-1">Prioritized</span>
                          </div>

                          {/* Gauge 2 */}
                          <div className="flex flex-col items-center">
                            <svg className="w-10 h-10" viewBox="0 0 36 36">
                              <path className="text-slate-200" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path className="text-[#8B5CF6]" strokeWidth="3.5" strokeDasharray={`${scheduledFollowUps > 0 ? 100 : 0}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <text x="18" y="20.5" className="text-[9px] font-bold text-slate-700" textAnchor="middle">{scheduledFollowUps}</text>
                            </svg>
                            <span className="text-[7px] font-bold text-slate-400 uppercase mt-1">Scheduled</span>
                          </div>

                          {/* Gauge 3 */}
                          <div className="flex flex-col items-center">
                            <svg className="w-10 h-10" viewBox="0 0 36 36">
                              <path className="text-slate-200" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path className="text-[#8B5CF6]" strokeWidth="3.5" strokeDasharray={`${slots > 0 ? 100 : 0}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <text x="18" y="20.5" className="text-[8px] font-bold text-slate-700" textAnchor="middle">{slots}</text>
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
                              const res = await fetch(`${API_BASE_URL}/campaigns/${c.id}`, { method: 'DELETE', headers: getAuthHeaders() });
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

          {selected?.status === 'paused' && selected?.diagnostic_error && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-4 text-rose-800 shadow-sm animate-fade-in">
              <span className="text-2xl mt-0.5">🚨</span>
              <div className="space-y-1 flex-1">
                <h4 className="font-bold text-rose-900 text-sm">Campaign Paused: Automated Spam Block Protection</h4>
                <p className="text-xs text-rose-700 leading-relaxed">
                  The campaign has been paused to protect your sender credentials. The system detected multiple consecutive failures:
                </p>
                <div className="bg-white/80 p-3 rounded-xl border border-rose-100 font-mono text-xs text-rose-900 mt-2 max-w-full overflow-x-auto">
                  {selected.diagnostic_error}
                </div>
                <p className="text-xs text-rose-600 mt-2">
                  Please update your SMTP settings or verify your mailing list, then set status back to active to resume.
                </p>
              </div>
            </div>
          )}

          {selected?.status === 'draft' && (
            <div className="bg-blue-50/20 border border-blue-200/60 rounded-2xl p-5 shadow-sm animate-fade-in space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">🚀</span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Outreach Campaign Setup Wizard</h4>
                  <p className="text-xs text-slate-500">Link a sender and add contacts to start sending outreach campaigns.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* Step 1: Link Sender Account */}
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  selected?.email_config_id 
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800' 
                    : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Step 1: SMTP Mailer</span>
                    <p className="text-xs leading-relaxed">
                      {selected?.email_config_id 
                        ? '✅ SMTP sending account is linked and ready.' 
                        : 'Link a mailer account (Gmail, MS 365, etc.) to handle SMTP relay dispatch.'}
                    </p>
                  </div>
                  {!selected?.email_config_id && (
                    <button
                      onClick={() => setActivePanel('email-config')}
                      className="mt-3 py-1.5 px-3 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-lg text-[10px] transition self-start"
                    >
                      Configure SMTP Sender
                    </button>
                  )}
                </div>

                {/* Step 2: Upload Contacts */}
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  state.recipients.filter(r => r.campaign_id === selectedId).length > 0 
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800' 
                    : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Step 2: Contacts List</span>
                    <p className="text-xs leading-relaxed">
                      {state.recipients.filter(r => r.campaign_id === selectedId).length > 0 
                        ? `✅ ${state.recipients.filter(r => r.campaign_id === selectedId).length} contact(s) imported & validated.` 
                        : 'Upload or import your CSV/Excel lead spreadsheet to seed recipients list.'}
                    </p>
                  </div>
                  {state.recipients.filter(r => r.campaign_id === selectedId).length === 0 && (
                    <button
                      onClick={() => setActivePanel('data-integration')}
                      className="mt-3 py-1.5 px-3 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-lg text-[10px] transition self-start"
                    >
                      Import Lead Contacts
                    </button>
                  )}
                </div>

                {/* Step 3: Launch Campaign */}
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  selected?.email_config_id && state.recipients.filter(r => r.campaign_id === selectedId).length > 0
                    ? 'bg-[#E6EFF6] border-[#51A2C3]/30 text-slate-800'
                    : 'bg-slate-50 border-slate-100 text-slate-400'
                }`}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Step 3: Go Live!</span>
                    <p className="text-xs leading-relaxed">
                      Toggle the campaign status to Active to automatically start scheduling and sending your outbound emails.
                    </p>
                  </div>
                  {selected?.email_config_id && state.recipients.filter(r => r.campaign_id === selectedId).length > 0 && (
                    <button
                      onClick={handleToggleStatus}
                      className="mt-3 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition self-start"
                    >
                      ▶️ Activate Campaign
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Main Stats KPIs Panel (matching top layout of Screenshot 2) */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
            
            {/* Header info */}
             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-150 pb-3 mb-4 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">{selected?.name}</h2>
                <button 
                  onClick={handleStartEdit} 
                  className="text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg transition-all text-xs flex items-center gap-1.5 border border-indigo-500/20"
                  title="Edit Campaign Details"
                >
                  <span>✏️</span>
                  <span className="font-semibold text-[10px]">Edit Campaign</span>
                </button>
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  selected?.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : selected?.status === 'paused'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}>
                  {selected?.status}
                </span>
                <button
                  onClick={handleToggleStatus}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all border ${
                    selected?.status === 'active'
                      ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/20'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/20'
                  }`}
                  title={selected?.status === 'active' ? 'Pause Campaign' : 'Activate Campaign'}
                >
                  <span>{selected?.status === 'active' ? '⏸️' : '▶️'}</span>
                  <span>{selected?.status === 'active' ? 'Pause Campaign' : 'Activate Campaign'}</span>
                </button>
              </div>

              <div className="flex gap-2 self-start sm:self-auto">
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
                  {new Set(selectedCampaignRecipients.map(r => r.company_name).filter(Boolean)).size}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Number of prospects</span>
                <span className="text-sm font-bold text-emerald-600 block mt-1">
                  {selectedCampaignRecipients.length}
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
                  {selectedCampaignRecipients.filter(r => r.status === 'sent').length}
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
                  {activePanel === 'inbox' && <InboxPanel campaignId={selectedId} projectId={selectedProjectId}/>}
                  {activePanel === 'graph' && <GraphDashboard campaignId={selectedId} projectId={selectedProjectId}/>}
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
                      projectId={selectedProjectId}
                    />
                  )}
                </div>
              )}

              {/* Preserved template preview */}
              {selected?.body_template && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Subject & Template Content</h3>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 font-sans text-xs text-slate-700 whitespace-pre-wrap">
                    <strong className="block text-slate-800 mb-2 font-sans">Subject: {selected.subject}</strong>
                    <div dangerouslySetInnerHTML={{ __html: selected.body_template }} />
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

                  <div className="bg-[#E6EFF6]/40 border border-[#51A2C3]/20 rounded-xl p-3.5 space-y-2 mt-2">
                    <span className="text-[10px] font-bold text-[#2C5F78] uppercase tracking-wider block">Scheduler Constraints</span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-slate-150">
                        <label htmlFor="side-speed" className="text-[9px] text-slate-400 block font-bold uppercase">Speed</label>
                        <select
                          id="side-speed"
                          value={sideMailsPerMinute}
                          onChange={e => setSideMailsPerMinute(parseInt(e.target.value))}
                          className="w-full bg-transparent text-slate-700 font-bold focus:outline-none"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                            <option key={v} value={v}>{v} / min</option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-slate-50/50 p-2 rounded-lg border border-slate-150">
                        <label htmlFor="side-fresh" className="text-[9px] text-slate-400 block font-bold uppercase">Daily Fresh</label>
                        <select
                          id="side-fresh"
                          value={sideDailyFreshLimit}
                          onChange={e => setSideDailyFreshLimit(parseInt(e.target.value))}
                          className="w-full bg-transparent text-slate-700 font-bold focus:outline-none"
                        >
                          {[50, 100, 200, 300, 400, 500].map(v => (
                            <option key={v} value={v}>{v} limit</option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-150">
                        <label htmlFor="side-maxco" className="text-[9px] text-slate-400 block font-bold uppercase">Max per Co.</label>
                        <select
                          id="side-maxco"
                          value={sideMaxContactsPerCompany}
                          onChange={e => setSideMaxContactsPerCompany(parseInt(e.target.value))}
                          className="w-full bg-transparent text-slate-700 font-bold focus:outline-none"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                            <option key={v} value={v}>{v} contacts</option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-slate-50/50 p-2 rounded-lg border border-slate-150">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Consecutive Errors</span>
                        <span className={`font-bold ${selected?.consecutive_failures ? 'text-rose-500 font-black' : 'text-slate-700'}`}>
                          {selected?.consecutive_failures ?? 0}/3
                        </span>
                      </div>
                    </div>
                  </div>
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
                    <div className="bg-blue-50/20 border border-blue-200/60 p-3 rounded-lg text-xs space-y-2">
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
            
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{isEditing ? 'Edit Campaign Details' : 'Create New Campaign'}</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Wizard step-by-step setup procedure</p>
              </div>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            {/* Step Progress Bar */}
            <div className="mb-8 bg-slate-50 p-3 rounded-2xl border border-slate-150">
              <div className="flex items-center justify-between">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center flex-1 last:flex-initial">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 ${
                      modalStep === step 
                        ? 'bg-[#51A2C3] text-white shadow-sm ring-4 ring-[#51A2C3]/10' 
                        : modalStep > step 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-white text-slate-400 border border-slate-200'
                    }`}>
                      {modalStep > step ? '✓' : step}
                    </div>
                    <span className={`ml-2 text-[10px] font-bold ${
                      modalStep === step ? 'text-slate-700' : 'text-slate-400'
                    }`}>
                      {step === 1 ? 'Constraints' : step === 2 ? 'Templates' : 'Link Sender'}
                    </span>
                    {step < 3 && (
                      <div className={`h-0.5 flex-1 mx-3 rounded transition-all duration-300 ${
                        modalStep > step ? 'bg-emerald-500' : 'bg-slate-200'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step 1: Campaign Rules Config (Scheduler Constraints) */}
            {modalStep === 1 && (
              <div className="space-y-4 text-xs text-slate-700">
                <div className="space-y-1">
                  <label htmlFor="c-name" className="block font-bold text-slate-500 uppercase">Campaign Name *</label>
                  <input required id="c-name" placeholder="e.g. Outreach Q3 Campaign" value={form.name} onChange={e=>set('name',e.target.value)}
                    className="w-full bg-white border border-slate-250 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9] focus:border-[#4BA7C9]"/>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="c-type" className="block font-bold text-slate-500 uppercase">Campaign Type</label>
                    <select id="c-type" className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2" value={form.campaign_type || 'cold'} onChange={e=>set('campaign_type',e.target.value)}>
                      <option value="cold">❄️ Cold</option>
                      <option value="warm">🔥 Warm</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="c-segment" className="block font-bold text-slate-500 uppercase">Target Segment</label>
                    <select id="c-segment" className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2" value={form.target_segment} onChange={e=>set('target_segment',e.target.value)}>
                      {['All Leads','Cold Outreach','Warm Following','Enterprise','SMB'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="c-cadence" className="block font-bold text-slate-500 uppercase">Cadence</label>
                    <select id="c-cadence" className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2" value={form.schedule} onChange={e=>set('schedule',e.target.value)}>
                      {['Once','Daily','Weekly','Monthly'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="c-region" className="block font-bold text-slate-500 uppercase">Target Region</label>
                    <select id="c-region" className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2" value={form.target_region || 'US'} onChange={e=>set('target_region',e.target.value)}>
                      <option value="US">US (Full Tracking)</option>
                      <option value="EU">EU (GDPR Privacy)</option>
                      <option value="IN">India (DPDPA)</option>
                      <option value="APAC">APAC (PDPA)</option>
                      <option value="ME">Middle East (PDPL)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="c-tz" className="block font-bold text-slate-500 uppercase">Target Timezone</label>
                    <select id="c-tz" className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2" value={form.timezone} onChange={e=>set('timezone',e.target.value)}>
                      {ALL_TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="c-localDt" className="block font-bold text-slate-500 uppercase">Start Time</label>
                    <input id="c-localDt" type="datetime-local" className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2" value={form.localDt || ''} onChange={e=>set('localDt',e.target.value)}/>
                  </div>
                </div>

                {/* Sending Speed Slider */}
                <div className="bg-[#E6EFF6]/30 border border-[#51A2C3]/20 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block font-bold text-slate-600 uppercase">Sending Speed (Mails Per Minute)</label>
                    <span className="px-2 py-0.5 bg-[#E6EFF6] text-[#2C5F78] rounded-md font-bold text-[10px]">
                      {form.mails_per_minute ?? 2} mails/min
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={form.mails_per_minute ?? 2}
                    onChange={e => set('mails_per_minute', parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#51A2C3]"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                    <span>1 mail / min</span>
                    <span>10 mails / min</span>
                  </div>
                </div>

                {/* Daily Outreach Volume Fresh Limit Toggle Chips */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block font-bold text-slate-600 uppercase">Daily Outreach Volume (Fresh Limit)</label>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold text-[10px]">
                      {form.daily_fresh_limit ?? 100} Fresh Leads / Day
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {[50, 100, 200, 300, 400, 500].map(val => (
                      <button
                        type="button"
                        key={val}
                        onClick={() => set('daily_fresh_limit', val)}
                        className={`py-1.5 rounded-lg font-bold border transition text-[10px] ${
                          form.daily_fresh_limit === val
                            ? 'bg-[#E6EFF6] text-[#2C5F78] border-[#51A2C3] shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Company Concentration Dropdown */}
                <div className="space-y-1">
                  <label htmlFor="c-max-co" className="block font-bold text-slate-500 uppercase">Company Concentration Filter (Max Contacts / Company)</label>
                  <select id="c-max-co" className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2" value={form.max_contacts_per_company ?? 1} onChange={e=>set('max_contacts_per_company', parseInt(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                      <option key={val} value={val}>{val} contact{val > 1 ? 's' : ''} per company</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 italic">Automatically limits outbound messages sent to a single organization to avoid domain blocklists.</p>
                </div>

                {/* Navigation */}
                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={handleCloseModal} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition">Cancel</button>
                  <button 
                    type="button" 
                    onClick={() => {
                      if (!form.name || !form.name.trim()) {
                        showToast('Please enter a Campaign Name');
                        return;
                      }
                      setModalStep(2);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#51A2C3] text-white font-bold hover:bg-[#3F93B5] transition"
                  >
                    Next: Compose Templates
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Drafting Section (Templates & Follow-up sequence) */}
            {modalStep === 2 && (
              <div className="space-y-4 text-xs text-slate-700">
                
                {/* AI writer assistant */}
                <div className="bg-blue-50/20 border border-blue-200/50 p-4 rounded-xl space-y-3">
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
                  <div className="flex justify-between items-center">
                    <label htmlFor="c-subject" className="block font-bold text-slate-500 uppercase">Email Subject</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('c-subject') as HTMLInputElement;
                          if (input) {
                            const start = input.selectionStart ?? 0;
                            const end = input.selectionEnd ?? 0;
                            const text = form.subject || '';
                            const newVal = text.substring(0, start) + "{first_name}" + text.substring(end);
                            set('subject', newVal);
                            setTimeout(() => {
                              input.focus();
                              input.setSelectionRange(start + 12, start + 12);
                            }, 50);
                          }
                        }}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-650 rounded-md border border-slate-200"
                      >
                        + First Name
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('c-subject') as HTMLInputElement;
                          if (input) {
                            const start = input.selectionStart ?? 0;
                            const end = input.selectionEnd ?? 0;
                            const text = form.subject || '';
                            const newVal = text.substring(0, start) + "{company_name}" + text.substring(end);
                            set('subject', newVal);
                            setTimeout(() => {
                              input.focus();
                              input.setSelectionRange(start + 14, start + 14);
                            }, 50);
                          }
                        }}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-650 rounded-md border border-slate-200"
                      >
                        + Company Name
                      </button>
                    </div>
                  </div>
                  <input id="c-subject" placeholder="Enter Subject template" value={form.subject} onChange={e=>set('subject',e.target.value)}
                    className="w-full bg-white border border-slate-250 rounded-xl px-4 py-2.5 text-slate-805 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9]"/>
                </div>

                 <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label htmlFor="c-body" className="block font-bold text-slate-500 uppercase">Email Template Body</label>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => insertFormatting('c-body', 'token', ' {name}')} className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-650 rounded-md border border-slate-200">+ Full Name</button>
                      <button type="button" onClick={() => insertFormatting('c-body', 'token', ' {first_name}')} className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-650 rounded-md border border-slate-200">+ First Name</button>
                      <button type="button" onClick={() => insertFormatting('c-body', 'token', ' {company_name}')} className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-650 rounded-md border border-slate-200">+ Company</button>
                    </div>
                  </div>
                  <div className="border border-slate-250 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-[#4BA7C9]">
                    <div className="flex items-center gap-1.5 p-2 bg-slate-50 border-b border-slate-200 text-xs">
                      <button type="button" onClick={() => insertFormatting('c-body', 'bold')} className="w-6 h-6 flex items-center justify-center font-black bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Bold">B</button>
                      <button type="button" onClick={() => insertFormatting('c-body', 'italic')} className="w-6 h-6 flex items-center justify-center font-bold italic bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Italic">I</button>
                      <button type="button" onClick={() => insertFormatting('c-body', 'underline')} className="w-6 h-6 flex items-center justify-center font-bold underline bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Underline">U</button>
                      <span className="w-px h-4 bg-slate-200 mx-0.5" />
                      <button type="button" onClick={() => insertFormatting('c-body', 'bullet')} className="px-1.5 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm text-[10px] font-bold" title="Bullet List">• List</button>
                      <button type="button" onClick={() => insertFormatting('c-body', 'number')} className="px-1.5 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm text-[10px] font-bold" title="Numbered List">1. List</button>
                    </div>
                    <textarea id="c-body" rows={5} placeholder="Write template body content... Use tokens like {name}, {company_name}, {designation}." value={form.body_template} onChange={e=>set('body_template',e.target.value)}
                      className="w-full bg-white border-0 px-4 py-2.5 text-slate-800 font-sans focus:outline-none resize-none"/>
                  </div>
                </div>

                <div className="bg-[#E6EFF6]/20 border border-[#51A2C3]/10 p-3.5 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-700 block text-xs">Multi-phase Follow-up Sequences</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Automate email sequences & delay cadences</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => {
                      setFollowUpStage(1);
                      setShowFollowUpModal(true);
                    }}
                    className="px-3 py-1.5 bg-slate-800 text-white rounded-lg font-bold text-[10px] hover:bg-slate-700 transition"
                  >
                    ✉️ Setup Sequence
                  </button>
                </div>

                {/* Navigation */}
                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setModalStep(1)} className="flex-1 py-2.5 rounded-xl bg-slate-150 text-slate-600 font-bold hover:bg-slate-200 transition">Back</button>
                  <button 
                    type="button" 
                    onClick={() => setModalStep(3)}
                    className="flex-1 py-2.5 rounded-xl bg-[#51A2C3] text-white font-bold hover:bg-[#3F93B5] transition"
                  >
                    Next: Link Sender Config
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Link Account & Summary */}
            {modalStep === 3 && (
              <form onSubmit={handleCreate} className="space-y-4 text-xs text-slate-700">
                
                {/* Selector for Existing vs. New Sender Account */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-500 uppercase">Sender Account Setup</label>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setConfigMode('existing')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        configMode === 'existing'
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/55'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Link Existing Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfigMode('new')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        configMode === 'new'
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/55'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Set up New Account
                    </button>
                  </div>
                </div>

                {/* MODE A: Link Existing Account */}
                {configMode === 'existing' && (
                  <div className="space-y-1">
                    <label htmlFor="c-config" className="block font-bold text-slate-500 uppercase">Linked Sender SMTP Account *</label>
                    <select 
                      required={configMode === 'existing'} 
                      id="c-config" 
                      className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9]" 
                      value={form.email_config_id || ''} 
                      onChange={e=>set('email_config_id',e.target.value)}
                    >
                      <option value="">— Link config mail account —</option>
                      {filteredEmailConfigs.map(c=><option key={c.id} value={c.id}>{c.name} ({c.sender_address})</option>)}
                    </select>
                  </div>
                )}

                {/* MODE B: Set up New Account */}
                {configMode === 'new' && (
                  <div className="space-y-4">
                    {/* Provider selection tabs */}
                    <div className="flex gap-2">
                      {[
                        { key: 'google', label: 'Google Workspace', icon: '🔑' },
                        { key: 'microsoft', label: 'Microsoft 365', icon: '🏢' },
                        { key: 'custom', label: 'Custom SMTP/IMAP', icon: '⚙️' }
                      ].map((prov) => (
                        <button
                          key={prov.key}
                          type="button"
                          onClick={() => {
                            setNewConfig(p => ({
                              ...p,
                              provider: prov.key,
                              smtpHost: prov.key === 'google' ? 'smtp.gmail.com' : prov.key === 'microsoft' ? 'smtp.office365.com' : '',
                              imapHost: prov.key === 'google' ? 'imap.gmail.com' : prov.key === 'microsoft' ? 'outlook.office365.com' : '',
                              smtpPort: 587,
                              imapPort: 993,
                            }));
                          }}
                          className={`flex-1 py-2 px-1 text-[10px] font-bold rounded-xl border transition-all flex flex-col items-center gap-1 ${
                            newConfig.provider === prov.key
                              ? 'bg-[#E6EFF6] border-[#51A2C3] text-[#2C5F78] shadow-sm'
                              : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <span>{prov.icon}</span>
                          <span>{prov.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Inputs panel */}
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="nc-name" className="block text-[10px] font-bold text-slate-500 uppercase">Account Name *</label>
                          <input
                            required={configMode === 'new'}
                            id="nc-name"
                            placeholder="e.g. Sales Gmail"
                            value={newConfig.name}
                            onChange={e => setNewConfig(p => ({ ...p, name: e.target.value }))}
                            className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-slate-800 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="nc-senderName" className="block text-[10px] font-bold text-slate-500 uppercase">Sender Name</label>
                          <input
                            id="nc-senderName"
                            placeholder="e.g. Dave from Sales"
                            value={newConfig.senderName}
                            onChange={e => setNewConfig(p => ({ ...p, senderName: e.target.value }))}
                            className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-slate-800 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="nc-email" className="block text-[10px] font-bold text-slate-500 uppercase">Sender Email Address *</label>
                        <input
                          required={configMode === 'new'}
                          type="email"
                          id="nc-email"
                          placeholder="you@company.com"
                          value={newConfig.senderAddress}
                          onChange={e => setNewConfig(p => ({ ...p, senderAddress: e.target.value }))}
                          className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-slate-800 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="nc-pass" className="block text-[10px] font-bold text-slate-500 uppercase">
                          {newConfig.provider === 'google' 
                            ? 'App Password *' 
                            : newConfig.provider === 'microsoft' 
                              ? 'App Password / Password *' 
                              : 'SMTP Password *'}
                        </label>
                        <input
                          required={configMode === 'new'}
                          type="password"
                          id="nc-pass"
                          placeholder="••••••••••••"
                          value={newConfig.password}
                          onChange={e => setNewConfig(p => ({ ...p, password: e.target.value }))}
                          className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-slate-800 focus:outline-none"
                        />
                        {newConfig.provider === 'google' && (
                          <p className="text-[9px] text-slate-400 italic">
                            Google Workspace requires a custom App Password. Go to My Account → Security → App Passwords to create one.
                          </p>
                        )}
                      </div>

                      {newConfig.provider === 'custom' && (
                        <div className="pt-2 border-t border-slate-200 space-y-3">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">Custom server settings</span>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2 space-y-1">
                              <label htmlFor="nc-smtphost" className="block text-[9px] font-bold text-slate-450 uppercase">SMTP Host *</label>
                              <input
                                required={configMode === 'new' && newConfig.provider === 'custom'}
                                id="nc-smtphost"
                                placeholder="smtp.example.com"
                                value={newConfig.smtpHost}
                                onChange={e => setNewConfig(p => ({ ...p, smtpHost: e.target.value }))}
                                className="w-full bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label htmlFor="nc-smtpport" className="block text-[9px] font-bold text-slate-450 uppercase">Port *</label>
                              <input
                                required={configMode === 'new' && newConfig.provider === 'custom'}
                                type="number"
                                id="nc-smtpport"
                                value={newConfig.smtpPort}
                                onChange={e => setNewConfig(p => ({ ...p, smtpPort: parseInt(e.target.value) || 587 }))}
                                className="w-full bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="nc-smtptls"
                              checked={newConfig.smtpTls}
                              onChange={e => setNewConfig(p => ({ ...p, smtpTls: e.target.checked }))}
                              className="accent-[#51A2C3]"
                            />
                            <label htmlFor="nc-smtptls" className="text-[10px] text-slate-500 font-medium">Use STARTTLS (Port 587)</label>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2 space-y-1">
                              <label htmlFor="nc-imaphost" className="block text-[9px] font-bold text-slate-450 uppercase">IMAP Host</label>
                              <input
                                id="nc-imaphost"
                                placeholder="imap.example.com"
                                value={newConfig.imapHost}
                                onChange={e => setNewConfig(p => ({ ...p, imapHost: e.target.value }))}
                                className="w-full bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label htmlFor="nc-imapport" className="block text-[9px] font-bold text-slate-440 uppercase">Port</label>
                              <input
                                type="number"
                                id="nc-imapport"
                                value={newConfig.imapPort}
                                onChange={e => setNewConfig(p => ({ ...p, imapPort: parseInt(e.target.value) || 993 }))}
                                className="w-full bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="nc-imapenable"
                              checked={newConfig.enableImap}
                              onChange={e => setNewConfig(p => ({ ...p, enableImap: e.target.checked }))}
                              className="accent-[#51A2C3]"
                            />
                            <label htmlFor="nc-imapenable" className="text-[10px] text-slate-500 font-medium">Enable IMAP incoming sync</label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Campaign overview/summary card */}
                <div className="bg-[#E6EFF6]/40 border border-[#51A2C3]/20 rounded-2xl p-5 space-y-3">
                  <h4 className="font-bold text-[#2C5F78] text-xs uppercase tracking-wider">Campaign Overview & Config Summary</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Campaign Name</span>
                      <span className="font-bold text-slate-700 truncate block max-w-[200px]">{form.name || 'Unnamed Campaign'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Cadence & Region</span>
                      <span className="font-bold text-slate-700 block">{form.schedule} · {form.target_region}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Timezone</span>
                      <span className="font-bold text-slate-700 truncate block max-w-[200px]">{form.timezone}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Speed Constraint</span>
                      <span className="font-bold text-slate-700 block">{form.mails_per_minute} mails / min</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Daily Volume Limit</span>
                      <span className="font-bold text-slate-700 block">{form.daily_fresh_limit} fresh leads</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Company Limit</span>
                      <span className="font-bold text-slate-700 block">{form.max_contacts_per_company} contact/co</span>
                    </div>
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setModalStep(2)} className="flex-1 py-2.5 rounded-xl bg-slate-150 text-slate-600 font-bold hover:bg-slate-200 transition">Back</button>
                  <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-[#51A2C3] text-white font-bold hover:bg-[#3F93B5] transition disabled:opacity-50">
                    {isEditing ? (submitting ? 'Saving...' : 'Save Changes') : (submitting ? 'Launching...' : 'Launch Campaign')}
                  </button>
                </div>
              </form>
            )}

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
                <div className="space-y-3 p-4 bg-blue-50/20 border border-blue-200/40 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">Stage 0 - Initial Mail Draft Settings</span>
                    <span className="text-[10px] bg-[#E6EFF6] px-2 py-0.5 rounded font-mono text-slate-600 font-bold">
                      Sequence Starter
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label htmlFor="initial-subject" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Subject</label>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('initial-subject') as HTMLInputElement;
                            if (input) {
                              const start = input.selectionStart ?? 0;
                              const end = input.selectionEnd ?? 0;
                              const text = initialSubject || '';
                              const newVal = text.substring(0, start) + "{first_name}" + text.substring(end);
                              setInitialSubject(newVal);
                              setTimeout(() => {
                                input.focus();
                                input.setSelectionRange(start + 12, start + 12);
                              }, 50);
                            }
                          }}
                          className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[9px] font-bold text-slate-550 rounded border border-slate-200"
                        >
                          + First Name
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('initial-subject') as HTMLInputElement;
                            if (input) {
                              const start = input.selectionStart ?? 0;
                              const end = input.selectionEnd ?? 0;
                              const text = initialSubject || '';
                              const newVal = text.substring(0, start) + "{company_name}" + text.substring(end);
                              setInitialSubject(newVal);
                              setTimeout(() => {
                                input.focus();
                                input.setSelectionRange(start + 14, start + 14);
                              }, 50);
                            }
                          }}
                          className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[9px] font-bold text-slate-550 rounded border border-slate-200"
                        >
                          + Company Name
                        </button>
                      </div>
                    </div>
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
                    <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-[#4BA7C9]">
                      <div className="flex items-center gap-1.5 p-2 bg-slate-50 border-b border-slate-200 text-xs">
                        <button type="button" onClick={() => insertFormatting('initial-body', 'bold')} className="w-6 h-6 flex items-center justify-center font-black bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Bold">B</button>
                        <button type="button" onClick={() => insertFormatting('initial-body', 'italic')} className="w-6 h-6 flex items-center justify-center font-bold italic bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Italic">I</button>
                        <button type="button" onClick={() => insertFormatting('initial-body', 'underline')} className="w-6 h-6 flex items-center justify-center font-bold underline bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Underline">U</button>
                        <span className="w-px h-4 bg-slate-200 mx-0.5" />
                        <button type="button" onClick={() => insertFormatting('initial-body', 'bullet')} className="px-1.5 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm text-[10px] font-bold" title="Bullet List">• List</button>
                        <button type="button" onClick={() => insertFormatting('initial-body', 'number')} className="px-1.5 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm text-[10px] font-bold" title="Numbered List">1. List</button>
                      </div>
                      <textarea
                        id="initial-body"
                        rows={5}
                        className="w-full bg-white border-0 px-4 py-2.5 text-slate-800 font-sans text-xs focus:outline-none resize-none"
                        value={initialBody}
                        onChange={e => setInitialBody(e.target.value)}
                        placeholder="Write template body content..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Personalization Tokens</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => insertFormatting('initial-body', 'token', ' {{first_name}}')}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-350 rounded text-[10px] font-mono text-slate-700 font-bold transition hover:bg-slate-300"
                      >
                        + First Name
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('initial-body', 'token', ' {{company}}')}
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
                <div className="space-y-3 p-4 bg-blue-50/20 border border-blue-200/40 rounded-2xl">
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
                    <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-[#4BA7C9]">
                      <div className="flex items-center gap-1.5 p-2 bg-slate-50 border-b border-slate-200 text-xs">
                        <button type="button" onClick={() => insertFormatting('followup-editor', 'bold')} className="w-6 h-6 flex items-center justify-center font-black bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Bold">B</button>
                        <button type="button" onClick={() => insertFormatting('followup-editor', 'italic')} className="w-6 h-6 flex items-center justify-center font-bold italic bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Italic">I</button>
                        <button type="button" onClick={() => insertFormatting('followup-editor', 'underline')} className="w-6 h-6 flex items-center justify-center font-bold underline bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm" title="Underline">U</button>
                        <span className="w-px h-4 bg-slate-200 mx-0.5" />
                        <button type="button" onClick={() => insertFormatting('followup-editor', 'bullet')} className="px-1.5 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm text-[10px] font-bold" title="Bullet List">• List</button>
                        <button type="button" onClick={() => insertFormatting('followup-editor', 'number')} className="px-1.5 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 shadow-sm text-[10px] font-bold" title="Numbered List">1. List</button>
                      </div>
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
                        className="w-full bg-white border-0 px-4 py-2.5 text-slate-800 font-sans text-xs focus:outline-none resize-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Personalization Tokens</span>
                      <span className="text-[9px] text-slate-400 italic">Values resolve dynamically from database</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => insertFormatting('followup-editor', 'token', ' {{first_name}}')}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-350 rounded text-[10px] font-mono text-slate-700 font-bold transition hover:bg-slate-300"
                      >
                        + First Name
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('followup-editor', 'token', ' {{company}}')}
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
                        <div 
                          className="font-sans text-slate-700 whitespace-pre-wrap leading-relaxed bg-[#FAF9F6] p-2.5 rounded border border-slate-100 max-h-[150px] overflow-y-auto text-[11px]"
                          dangerouslySetInnerHTML={{
                            __html: initialBody
                              .replace(/{name}/g, previewName)
                              .replace(/{company_name}/g, previewCompany)
                              .replace(/{company}/g, previewCompany)
                              .replace(/{{name}}/g, previewName)
                              .replace(/{{company_name}}/g, previewCompany)
                              .replace(/{{company}}/g, previewCompany)
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold mb-1">Follow-up {followUpStage} Body Preview</span>
                      <div 
                        className="font-sans text-slate-700 whitespace-pre-wrap leading-relaxed bg-[#FAF9F6] p-2.5 rounded border border-slate-100 max-h-[150px] overflow-y-auto text-[11px]"
                        dangerouslySetInnerHTML={{
                          __html: (followUps[followUpStage] || '')
                            .replace(/{name}/g, previewName)
                            .replace(/{company_name}/g, previewCompany)
                            .replace(/{company}/g, previewCompany)
                            .replace(/{{name}}/g, previewName)
                            .replace(/{{company_name}}/g, previewCompany)
                            .replace(/{{company}}/g, previewCompany)
                        }}
                      />
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
      {/* ─── Create Project Modal ─────────────────────────────────────────────────── */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl border border-slate-200 shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Create New Project</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Define a new campaigns & mail configurations boundary</p>
              </div>
              <button onClick={() => setShowCreateProjectModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="space-y-1 text-xs">
                <label htmlFor="p-name" className="block font-bold text-slate-500 uppercase">Project Name *</label>
                <input
                  required
                  id="p-name"
                  placeholder="e.g. Europe Cold Outreach"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  className="w-full bg-white border border-slate-250 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9] focus:border-[#4BA7C9]"
                />
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateProjectModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#51A2C3] text-white font-bold hover:bg-[#3F93B5] transition text-xs"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


export default CampaignsPage;
