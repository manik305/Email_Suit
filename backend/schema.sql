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

-- 2. Email Configuration (SMTP + IMAP details)
CREATE TABLE IF NOT EXISTS public.email_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) DEFAULT 'Default' NOT NULL,
    provider VARCHAR(50) DEFAULT 'smtp' NOT NULL, -- 'google' | 'microsoft' | 'smtp'
    sender_address VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    smtp_host VARCHAR(255) DEFAULT 'smtp.gmail.com' NOT NULL,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    target_segment VARCHAR(100),
    schedule VARCHAR(50) DEFAULT 'Once' NOT NULL, -- 'Once' | 'Daily' | 'Weekly'
    status VARCHAR(50) DEFAULT 'draft' NOT NULL, -- 'draft' | 'active' | 'completed' | 'paused'
    email_config_id UUID REFERENCES public.email_configs(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    body_template TEXT,
    send_at TIMESTAMP WITH TIME ZONE,
    timezone VARCHAR(100) DEFAULT 'America/New_York' NOT NULL,
    target_region VARCHAR(100) DEFAULT 'US' NOT NULL,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for optimized searches
CREATE INDEX IF NOT EXISTS idx_recipients_email ON public.recipients(email);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_id ON public.recipients(campaign_id);

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

-- 6. Meetings
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    time VARCHAR(50) NOT NULL,
    attendee_email VARCHAR(255) NOT NULL,
    meet_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Meetings
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    time VARCHAR(50) NOT NULL,
    attendee_email VARCHAR(255) NOT NULL,
    meet_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
