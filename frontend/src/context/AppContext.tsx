import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string;
  name: string;
  size: string;
  uploadDate: string;
  status: 'Processing' | 'Completed' | 'Failed';
}

export interface Recipient {
  id: string;
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
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
  campaign_id?: string;
  response_category?: string;
  response_text?: string;
  last_message_id?: string;
  send_at?: string;
  last_sent_at?: string;
  next_follow_up_at?: string;
  follow_up_count?: number;
  max_follow_ups?: number;
  cooling_off_until?: string;
  created_at: string;
}


export interface Campaign {
  id: string;
  name: string;
  target_segment?: string;
  schedule?: string;
  status: string;
  subject?: string;
  body_template?: string;
  campaign_type?: string;
  follow_up_templates?: string[];
  send_at?: string;
  email_config_id?: string;
  timezone?: string;
  target_region?: string;
  mails_per_minute?: number;
  daily_fresh_limit?: number;
  daily_followup_limit?: number;
  max_contacts_per_company?: number;
  consecutive_failures?: number;
  diagnostic_error?: string;
  project_id?: string;
  icp_titles?: string[];
  icp_departments?: string[];
  icp_industries?: string[];
  icp_regions?: string[];
  icp_active?: boolean;
  created_at: string;
}

export interface EmailConfigSummary {
  id: string;
  name: string;
  provider: string;
  sender_address: string;
  sender_name?: string;
  is_active: boolean;
  smtp_host?: string;
  smtp_port?: number;
  imap_host?: string;
  imap_port?: number;
  project_id?: string;
  created_at: string;
}

// Legacy shape kept for backwards compat with EmailConfig.tsx page
export interface EmailConfigLegacy {
  provider: 'Google Workspace' | 'Microsoft 365' | 'Custom SMTP' | null;
  status: 'Connected' | 'Disconnected';
  accountEmail?: string;
  lastSync?: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  attendee_email: string;
  meet_link?: string;
  project_id?: string;
  created_at: string;
}

interface AppState {
  metrics: {
    totalEmailsSent: number;
    openRate: number;
    clickRate: number;
    activeCampaigns: number;
    scheduledFollowUpsToday?: number;
    totalScheduledFollowUps?: number;
    totalFilesUploaded: number;
    dataProcessedCount: number;
  };
  files: UploadedFile[];
  recipients: Recipient[];
  campaigns: Campaign[];
  emailConfigs: EmailConfigSummary[];       // full list from /config
  emailConfig: EmailConfigLegacy;           // legacy compat shape
  meetings: Meeting[];
  isLoading: boolean;
}


export interface CreateCampaignPayload {
  name: string;
  target_segment?: string;
  schedule?: string;
  subject?: string;
  body_template?: string;
  campaign_type?: string;
  send_at?: string;
  email_config_id?: string;
  target_region?: string;
  timezone?: string;
  mails_per_minute?: number;
  daily_fresh_limit?: number;
  daily_followup_limit?: number;
  max_contacts_per_company?: number;
}

interface AppContextType {
  state: AppState;
  addFile: (file: UploadedFile) => void;
  uploadFileToBackend: (file: File, campaignId?: string) => Promise<{ success: boolean; rows_added?: number; duplicates_skipped?: number; error?: string }>;
  createCampaign: (data: CreateCampaignPayload) => Promise<Campaign | null>;
  updateEmailConfig: (config: EmailConfigLegacy) => void;
  refreshData: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
export const API_BASE_URL = isLocalDev ? 'http://localhost:8000/api/v1' : (import.meta.env.VITE_API_BASE_URL || '/api/v1');

const initialState: AppState = {
  metrics: {
    totalEmailsSent: 0,
    openRate: 0,
    clickRate: 0,
    activeCampaigns: 0,
    totalFilesUploaded: 0,
    dataProcessedCount: 0,
  },
  files: [],
  recipients: [],
  campaigns: [],
  emailConfigs: [],
  emailConfig: { provider: null, status: 'Disconnected' },
  meetings: [],
  isLoading: false,
};

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(initialState);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const refreshData = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const authHeaders = getAuthHeaders();
      const storedPid = localStorage.getItem('selected_project_id') || '';
      const metricsUrl = storedPid ? `${API_BASE_URL}/campaigns/metrics?project_id=${storedPid}` : `${API_BASE_URL}/campaigns/metrics`;
      const recipientsUrl = storedPid ? `${API_BASE_URL}/data/recipients?project_id=${storedPid}` : `${API_BASE_URL}/data/recipients`;
      const campaignsUrl = storedPid ? `${API_BASE_URL}/campaigns/?project_id=${storedPid}` : `${API_BASE_URL}/campaigns/`;
      const configsUrl = storedPid ? `${API_BASE_URL}/config/?project_id=${storedPid}` : `${API_BASE_URL}/config/`;
      const meetingsUrl = storedPid ? `${API_BASE_URL}/meetings/list?project_id=${storedPid}` : `${API_BASE_URL}/meetings/list`;
      
      const [metricsRes, recipientsRes, campaignsRes, configsRes, meetingsRes] = await Promise.all([
        fetch(metricsUrl, { headers: authHeaders }),
        fetch(recipientsUrl, { headers: authHeaders }),
        fetch(campaignsUrl, { headers: authHeaders }),
        fetch(configsUrl, { headers: authHeaders }),
        fetch(meetingsUrl, { headers: authHeaders }),
      ]);

      if (metricsRes.status === 401 || recipientsRes.status === 401 || campaignsRes.status === 401 || configsRes.status === 401 || meetingsRes.status === 401) {
        console.warn('⚠️ Token expired or invalid. Logging out.');
        localStorage.removeItem('access_token');
        localStorage.removeItem('auth_level');
        localStorage.removeItem('user_email');
        localStorage.removeItem('last_activity');
        window.location.href = '/';
        return;
      }

      if (metricsRes.status === 403 || recipientsRes.status === 403 || campaignsRes.status === 403 || configsRes.status === 403 || meetingsRes.status === 403) {
        console.warn('⚠️ Access forbidden. Redirecting to workspace hub.');
        localStorage.removeItem('selected_project_id');
        window.location.href = '/projects';
        return;
      }

      const metrics: AppState['metrics']           = await metricsRes.json();
      const recipients: Recipient[]                 = await recipientsRes.json();
      const campaigns: Campaign[]                   = await campaignsRes.json();
      const emailConfigs: EmailConfigSummary[]      = await configsRes.json();
      const meetingsData                            = await meetingsRes.json();
      const meetings: Meeting[]                     = meetingsData && Array.isArray(meetingsData.meetings) ? meetingsData.meetings : [];

      const activeConfig = emailConfigs.find(c => c.is_active);
      const todayStr = new Date().toDateString();
      const scheduledFollowUpsToday = recipients.filter(r => r.status === 'sent' && r.next_follow_up_at && new Date(r.next_follow_up_at).toDateString() === todayStr).length;
      const totalScheduledFollowUps = recipients.filter(r => r.status === 'sent' && Boolean(r.next_follow_up_at)).length;

      setState(prev => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          ...metrics,
          activeCampaigns: campaigns.filter(c => c.status === 'active').length,
          scheduledFollowUpsToday,
          totalScheduledFollowUps,
        },
        recipients,
        campaigns,
        emailConfigs,
        meetings,
        emailConfig: activeConfig
          ? {
              provider: activeConfig.provider as any,
              status: 'Connected',
              accountEmail: activeConfig.sender_address,
              lastSync: new Date(activeConfig.created_at).toLocaleTimeString(),
            }
          : prev.emailConfig,
        isLoading: false,
      }));

    } catch (error) {
      console.error('Failed to fetch app data:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const addFile = (file: UploadedFile) =>
    setState(prev => ({ ...prev, files: [file, ...prev.files] }));

  const uploadFileToBackend = async (file: File, campaignId?: string): Promise<{ success: boolean; rows_added?: number; duplicates_skipped?: number; error?: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (campaignId) {
      formData.append('campaign_id', campaignId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/data/upload`, {
        method: 'POST',
        body: formData,
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        await refreshData();
        const data = await res.json();
        return {
          success: true,
          rows_added: data.rows_added,
          duplicates_skipped: data.duplicates_skipped,
        };
      } else {
        const errText = await res.text();
        return { success: false, error: errText };
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      return { success: false, error: err.message || 'Network error' };
    }
  };


  const createCampaign = async (data: CreateCampaignPayload): Promise<Campaign | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/campaigns/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        console.error('Campaign creation failed:', await res.text());
        return null;
      }
      const created: Campaign = await res.json();
      // Optimistic update — prepend to list immediately
      setState(prev => ({
        ...prev,
        campaigns: [created, ...prev.campaigns],
        metrics: {
          ...prev.metrics,
          activeCampaigns: prev.metrics.activeCampaigns + (created.status === 'active' ? 1 : 0),
        },
      }));
      return created;
    } catch (err) {
      console.error('Campaign creation error:', err);
      return null;
    }
  };

  const updateEmailConfig = async (config: EmailConfigLegacy) => {
    try {
      if (config.provider && config.accountEmail) {
        await fetch(`${API_BASE_URL}/config/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            provider: config.provider,
            sender_address: config.accountEmail,
            settings_json: {},
            is_active: true,
          }),
        });
      }
      await refreshData();
    } catch (err) {
      console.error('Failed to update email config:', err);
    }
  };

  return (
    <AppContext.Provider
      value={{ state, addFile, uploadFileToBackend, createCampaign, updateEmailConfig, refreshData }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within an AppProvider');
  return ctx;
};
