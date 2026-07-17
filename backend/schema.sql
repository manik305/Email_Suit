-- Digio Click Outbound CRM & Email Marketing PostgreSQL Schema
-- Suitable for execution in the Supabase SQL Editor.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create auth schema and dummy users table if not exists (for local development compatibility)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    raw_user_meta_data JSONB
);

-- 1. Profiles/Users Table
-- Links user details to Supabase Auth table (auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255),
    role VARCHAR(50) DEFAULT 'agent', -- 'admin' | 'agent'
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    otp VARCHAR(50),
    otp_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 1.5. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.6. Project Members Mapping Table
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' NOT NULL, -- 'manager' | 'member'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, project_id)
);

-- 2. Email Configuration (SMTP + IMAP details)
CREATE TABLE IF NOT EXISTS public.email_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) DEFAULT 'Default' NOT NULL,
    provider VARCHAR(50) DEFAULT 'smtp' NOT NULL, -- 'google' | 'microsoft' | 'smtp'
    sender_address VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    smtp_host VARCHAR(255) DEFAULT 'smtp-relay.gmail.com' NOT NULL,
    smtp_port INTEGER DEFAULT 587 NOT NULL,
    smtp_username VARCHAR(255) NOT NULL,
    smtp_password VARCHAR(255) NOT NULL, -- Encrypted or plaintext for sandbox
    smtp_use_tls BOOLEAN DEFAULT TRUE NOT NULL,
    imap_host VARCHAR(255) DEFAULT 'imap.gmail.com',
    imap_port INTEGER DEFAULT 993,
    imap_username VARCHAR(255),
    imap_password VARCHAR(255),
    imap_use_ssl BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    daily_limit INTEGER DEFAULT 500 NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    target_segment VARCHAR(100),
    schedule VARCHAR(50) DEFAULT 'Once' NOT NULL, -- 'Once' | 'Daily' | 'Weekly'
    status VARCHAR(50) DEFAULT 'draft' NOT NULL, -- 'draft' | 'active' | 'completed' | 'paused'
    campaign_type VARCHAR(50) DEFAULT 'cold' NOT NULL, -- 'cold' | 'warm'
    email_config_id UUID REFERENCES public.email_configs(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    body_template TEXT,
    send_at TIMESTAMP WITH TIME ZONE,
    timezone VARCHAR(100) DEFAULT 'America/New_York' NOT NULL,
    target_region VARCHAR(100) DEFAULT 'US' NOT NULL,
    mails_per_minute INTEGER DEFAULT 2,
    daily_fresh_limit INTEGER DEFAULT 100,
    daily_followup_limit INTEGER DEFAULT 200,
    max_contacts_per_company INTEGER DEFAULT 1,
    consecutive_failures INTEGER DEFAULT 0,
    diagnostic_error TEXT,
    email_config_pool JSONB DEFAULT '[]',
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Recipients (Main Email Processing Candidates)
CREATE TABLE IF NOT EXISTS public.recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL, -- Mail ID
    name VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    alternative_email VARCHAR(255), -- Alternate Mail ID
    title VARCHAR(255), -- Designation
    department VARCHAR(255),
    website VARCHAR(255),
    company_name VARCHAR(255),
    linkedin_url TEXT,
    industry VARCHAR(255),
    sub_industry VARCHAR(255),
    state VARCHAR(255),
    city VARCHAR(255),
    zip_code VARCHAR(100), -- Zip / Pin Code
    country VARCHAR(255),
    region VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- 'pending' | 'sent' | 'bounced' | 'replied'
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    follow_up_count INTEGER DEFAULT 0 NOT NULL,
    max_follow_ups INTEGER DEFAULT 0 NOT NULL,
    next_follow_up_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    open_count INTEGER DEFAULT 0 NOT NULL,
    click_count INTEGER DEFAULT 0 NOT NULL,
    send_at TIMESTAMP WITH TIME ZONE,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    response_text TEXT,
    last_message_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for optimized searches
CREATE INDEX IF NOT EXISTS idx_recipients_email ON public.recipients(email);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_id ON public.recipients(campaign_id);

-- Add response_category column to recipients (for DNC classification)
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS response_category VARCHAR(50);
-- values: 'lead' | 'hot' | 'cold' | 'negative' | 'bounce' | null

-- 5. Recipient Tracking Events
CREATE TABLE IF NOT EXISTS public.recipient_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES public.recipients(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'open' | 'click'
    link_url TEXT,
    ip_address VARCHAR(100),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Email Config Daily Quota Tracker
CREATE TABLE IF NOT EXISTS public.email_config_daily_quota (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_config_id UUID REFERENCES public.email_configs(id) ON DELETE CASCADE,
    quota_date DATE NOT NULL,
    emails_sent INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(email_config_id, quota_date)
);
CREATE INDEX IF NOT EXISTS idx_quota_config_date ON public.email_config_daily_quota(email_config_id, quota_date);

-- 6. Meetings
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    time VARCHAR(50) NOT NULL,
    attendee_email VARCHAR(255) NOT NULL,
    meet_link TEXT,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. DNC (Do Not Contact) List - Project-Scoped
CREATE TABLE IF NOT EXISTS public.dnc_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    reason VARCHAR(50) NOT NULL,           -- 'lead' | 'hot' | 'cold' | 'negative' | 'bounce'
    source_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    notes TEXT,
    classified_by VARCHAR(255),            -- user email who classified
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(email, project_id)              -- one email can only appear once per project
);
CREATE INDEX IF NOT EXISTS idx_dnc_email ON public.dnc_list(email);
CREATE INDEX IF NOT EXISTS idx_dnc_project ON public.dnc_list(project_id);

-- 8. Activity Logs (Admin Audit Trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,        -- 'campaign_created', 'campaign_updated', 'data_uploaded', etc.
    category VARCHAR(50) NOT NULL,       -- 'campaign' | 'data' | 'email' | 'config' | 'auth' | 'system' | 'error'
    severity VARCHAR(20) DEFAULT 'info', -- 'info' | 'warning' | 'error' | 'critical'
    summary TEXT NOT NULL,               -- Human-readable description
    details JSONB DEFAULT '{}',          -- Structured metadata (counts, IDs, error messages)
    ip_address VARCHAR(100),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_project ON public.activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_campaign ON public.activity_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON public.activity_logs(category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at DESC);

-- Setup automatic profile creation for Supabase auth sign-ups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'role', 'agent'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run handle_new_user() on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- ROW LEVEL SECURITY (RLS) CONFIGURATION
-- ==========================================

-- Enable RLS on all existing public tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_config_daily_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Security Definer Helper Functions (run with bypass-RLS privileges to avoid policy recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_project_member(project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = auth.uid() AND project_id = $1
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_project_manager(project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = auth.uid() AND project_id = $1 AND role = 'manager'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_campaign_member(campaign_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_id AND (public.is_project_member(c.project_id) OR public.is_admin())
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_recipient_member(recipient_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipients r
    WHERE r.id = recipient_id AND (public.is_campaign_member(r.campaign_id) OR public.is_admin())
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_email_config_member(config_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.email_configs c
    WHERE c.id = config_id AND (public.is_project_member(c.project_id) OR public.is_admin())
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- RLS Policies for Profiles
DROP POLICY IF EXISTS profiles_read_policy ON public.profiles;
CREATE POLICY profiles_read_policy ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS profiles_write_policy ON public.profiles;
CREATE POLICY profiles_write_policy ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- RLS Policies for Projects
DROP POLICY IF EXISTS projects_read_policy ON public.projects;
CREATE POLICY projects_read_policy ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_project_member(id) OR public.is_admin());

DROP POLICY IF EXISTS projects_write_policy ON public.projects;
CREATE POLICY projects_write_policy ON public.projects
  FOR ALL TO authenticated
  USING (public.is_project_manager(id) OR public.is_admin());

-- RLS Policies for Project Members
DROP POLICY IF EXISTS members_read_policy ON public.project_members;
CREATE POLICY members_read_policy ON public.project_members
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id) OR public.is_admin());

DROP POLICY IF EXISTS members_write_policy ON public.project_members;
CREATE POLICY members_write_policy ON public.project_members
  FOR ALL TO authenticated
  USING (public.is_project_manager(project_id) OR public.is_admin());

-- RLS Policies for Campaigns
DROP POLICY IF EXISTS campaigns_policy ON public.campaigns;
CREATE POLICY campaigns_policy ON public.campaigns
  FOR ALL TO authenticated
  USING (public.is_project_member(project_id) OR public.is_admin());

-- RLS Policies for Email Configs
DROP POLICY IF EXISTS email_configs_read_policy ON public.email_configs;
CREATE POLICY email_configs_read_policy ON public.email_configs
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id) OR public.is_admin());

DROP POLICY IF EXISTS email_configs_write_policy ON public.email_configs;
CREATE POLICY email_configs_write_policy ON public.email_configs
  FOR ALL TO authenticated
  USING (public.is_project_manager(project_id) OR public.is_admin());

-- RLS Policies for Recipients
DROP POLICY IF EXISTS recipients_policy ON public.recipients;
CREATE POLICY recipients_policy ON public.recipients
  FOR ALL TO authenticated
  USING (public.is_campaign_member(campaign_id) OR public.is_admin());

-- RLS Policies for Recipient Events
DROP POLICY IF EXISTS recipient_events_policy ON public.recipient_events;
CREATE POLICY recipient_events_policy ON public.recipient_events
  FOR ALL TO authenticated
  USING (public.is_recipient_member(recipient_id) OR public.is_admin());

-- RLS Policies for Email Config Daily Quota Tracker
DROP POLICY IF EXISTS quota_policy ON public.email_config_daily_quota;
CREATE POLICY quota_policy ON public.email_config_daily_quota
  FOR ALL TO authenticated
  USING (public.is_email_config_member(email_config_id) OR public.is_admin());

-- RLS Policies for Meetings
DROP POLICY IF EXISTS meetings_policy ON public.meetings;
CREATE POLICY meetings_policy ON public.meetings
  FOR ALL TO authenticated
  USING (public.is_project_member(project_id) OR public.is_admin());

-- RLS Policies for DNC List
DROP POLICY IF EXISTS dnc_policy ON public.dnc_list;
CREATE POLICY dnc_policy ON public.dnc_list
  FOR ALL TO authenticated
  USING (public.is_project_member(project_id) OR public.is_admin());

-- RLS Policies for Activity Logs
DROP POLICY IF EXISTS logs_read_policy ON public.activity_logs;
CREATE POLICY logs_read_policy ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id) OR public.is_admin());

DROP POLICY IF EXISTS logs_insert_policy ON public.activity_logs;
CREATE POLICY logs_insert_policy ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true); -- Allow backend app to write logs

DROP POLICY IF EXISTS logs_admin_policy ON public.activity_logs;
CREATE POLICY logs_admin_policy ON public.activity_logs
  FOR ALL TO authenticated
  USING (public.is_admin());

-- Event Trigger to automatically enable RLS on all future tables
CREATE OR REPLACE FUNCTION public.auto_enable_rls_on_create()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    obj record;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'CREATE TABLE'
    LOOP
        IF obj.schema_name = 'public' THEN
            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', obj.schema_name, obj.object_name);
        END IF;
    END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_auto_enable_rls;
CREATE EVENT TRIGGER trg_auto_enable_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION public.auto_enable_rls_on_create();

