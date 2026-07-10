import React, { useState, useEffect, useCallback } from 'react';

const isLocalDev = window.location.port === '5173' || window.location.port === '5174';
const API_BASE = isLocalDev ? 'http://localhost:8000/api/v1' : '/api/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  project_id?: string;
  campaign_id?: string;
  user_email?: string;
  action: string;
  category: string;
  severity: string;
  summary: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

interface LogStats {
  total: number;
  today: number;
  errors: number;
  warnings: number;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
}

// ─── Severity Badge ──────────────────────────────────────────────────────────

const severityConfig: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  info:     { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500',   label: 'Info' },
  warning:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500',  label: 'Warning' },
  error:    { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',  dot: 'bg-rose-500',   label: 'Error' },
  critical: { bg: 'bg-red-100',   text: 'text-red-800',    border: 'border-red-300',   dot: 'bg-red-600',    label: 'Critical' },
};

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const cfg = severityConfig[severity] || severityConfig.info;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
      {cfg.label}
    </span>
  );
};

// ─── Category Badge ──────────────────────────────────────────────────────────

const categoryIcons: Record<string, string> = {
  campaign: '📢',
  data:     '📊',
  email:    '✉️',
  config:   '⚙️',
  auth:     '🔐',
  system:   '🖥️',
  error:    '🚨',
};

const CategoryBadge: React.FC<{ category: string }> = ({ category }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wider border border-slate-200">
    {categoryIcons[category] || '📋'} {category}
  </span>
);

// ─── Stat Card ───────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  accentBg: string;
}> = ({ title, value, icon, accent, accentBg }) => (
  <div className="glass-panel rounded-2xl p-5 bg-white border border-slate-200/60 shadow-sm hover:shadow-md transition-all group">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
        <p className={`text-3xl font-black mt-1 ${accent}`}>{value.toLocaleString()}</p>
      </div>
      <div className={`w-11 h-11 rounded-xl ${accentBg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
    </div>
  </div>
);

// ─── Detail Drawer ───────────────────────────────────────────────────────────

const DetailDrawer: React.FC<{ log: LogEntry | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl z-50 overflow-y-auto"
           style={{ animation: 'fadeInScale 0.2s ease-out' }}>
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-slate-800">Log Detail</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Action</span>
              <span className="text-sm font-semibold text-slate-800 font-mono bg-slate-50 px-2 py-1 rounded">{log.action}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Category</span>
              <CategoryBadge category={log.category} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Severity</span>
              <SeverityBadge severity={log.severity} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Timestamp</span>
              <span className="text-xs text-slate-700">{new Date(log.created_at).toLocaleString()}</span>
            </div>
          </div>

          {/* Summary */}
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Summary</span>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-100">{log.summary}</p>
          </div>

          {/* User */}
          {log.user_email && (
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">User</span>
              <span className="text-sm text-slate-700">{log.user_email}</span>
            </div>
          )}

          {/* IDs */}
          <div className="grid grid-cols-2 gap-4">
            {log.project_id && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Project ID</span>
                <span className="text-xs text-slate-600 font-mono break-all">{log.project_id}</span>
              </div>
            )}
            {log.campaign_id && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Campaign ID</span>
                <span className="text-xs text-slate-600 font-mono break-all">{log.campaign_id}</span>
              </div>
            )}
          </div>

          {/* Client info */}
          {(log.ip_address || log.user_agent) && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Client Information</span>
              {log.ip_address && (
                <p className="text-xs text-slate-600"><span className="font-semibold">IP:</span> {log.ip_address}</p>
              )}
              {log.user_agent && (
                <p className="text-xs text-slate-500 break-all"><span className="font-semibold text-slate-600">UA:</span> {log.user_agent}</p>
              )}
            </div>
          )}

          {/* Details JSON */}
          {log.details && Object.keys(log.details).length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Details (JSON)</span>
              <pre className="text-xs text-slate-700 bg-slate-50 rounded-xl p-4 border border-slate-100 overflow-x-auto whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const ActivityLogsPage: React.FC = () => {
  const selectedProjectId = localStorage.getItem('selected_project_id') || '';
  const isAdmin = localStorage.getItem('auth_level') === 'admin';

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  // Filters
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const getHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.append('project_id', selectedProjectId);
      const res = await fetch(`${API_BASE}/activity-logs/stats?${params}`, { headers: getHeaders() });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch log stats:', err);
    }
  }, [selectedProjectId, getHeaders]);

  const fetchLogs = useCallback(async (resetOffset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.append('project_id', selectedProjectId);
      if (category) params.append('category', category);
      if (severity) params.append('severity', severity);
      if (search) params.append('search', search);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      const currentOffset = resetOffset ? 0 : offset;
      params.append('limit', limit.toString());
      params.append('offset', currentOffset.toString());

      const res = await fetch(`${API_BASE}/activity-logs/?${params}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        if (resetOffset) setOffset(0);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, category, severity, search, dateFrom, dateTo, offset, getHeaders]);

  useEffect(() => {
    fetchStats();
    fetchLogs(true);
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when filters change (debounced for search)
  useEffect(() => {
    const timer = setTimeout(() => fetchLogs(true), search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [category, severity, search, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when offset changes (pagination)
  useEffect(() => {
    if (offset > 0) fetchLogs(false);
  }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    fetchStats();
    fetchLogs(true);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-lg font-bold">Admin Access Required</p>
        <p className="text-sm mt-1">Activity logs are only available to administrators.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6 pb-20 text-slate-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600">Activity Logs</h1>
          <p className="text-slate-500 mt-1">Monitor all campaign operations, data changes, and system events</p>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 transition active:scale-[0.97] shadow-sm"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Logs"
            value={stats.total}
            accent="text-slate-800"
            accentBg="bg-blue-50"
            icon={
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <StatCard
            title="Today"
            value={stats.today}
            accent="text-emerald-700"
            accentBg="bg-emerald-50"
            icon={
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Warnings"
            value={stats.warnings}
            accent="text-amber-700"
            accentBg="bg-amber-50"
            icon={
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            }
          />
          <StatCard
            title="Errors"
            value={stats.errors}
            accent="text-rose-700"
            accentBg="bg-rose-50"
            icon={
              <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>
      )}

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-4 bg-white border border-slate-200/60 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Category filter */}
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[130px]"
          >
            <option value="">All Categories</option>
            <option value="campaign">📢 Campaign</option>
            <option value="data">📊 Data</option>
            <option value="email">✉️ Email</option>
            <option value="config">⚙️ Config</option>
            <option value="auth">🔐 Auth</option>
            <option value="system">🖥️ System</option>
            <option value="error">🚨 Error</option>
          </select>

          {/* Severity filter */}
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
          >
            <option value="">All Severity</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>

          {/* Date range */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 [color-scheme:light]"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 [color-scheme:light]"
            placeholder="To"
          />

          {/* Clear filters */}
          {(category || severity || search || dateFrom || dateTo) && (
            <button
              onClick={() => { setCategory(''); setSeverity(''); setSearch(''); setDateFrom(''); setDateTo(''); }}
              className="px-3 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-panel rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[160px_1fr_100px_90px_110px_60px] gap-3 px-5 py-3 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <span>Timestamp</span>
          <span>Summary</span>
          <span>Category</span>
          <span>Severity</span>
          <span>User</span>
          <span></span>
        </div>

        {/* Loading State */}
        {loading && logs.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-sm text-slate-500">Loading activity logs...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && logs.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <svg className="w-14 h-14 mx-auto mb-3 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium">No activity logs found</p>
            <p className="text-xs mt-1">Activity will appear here as actions are performed in the system.</p>
          </div>
        )}

        {/* Log Rows */}
        <div className="divide-y divide-slate-100">
          {logs.map(log => {
            const ts = new Date(log.created_at);
            const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return (
              <div
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="grid grid-cols-1 md:grid-cols-[160px_1fr_100px_90px_110px_60px] gap-2 md:gap-3 px-5 py-3.5 hover:bg-blue-50/40 cursor-pointer transition-colors group"
              >
                {/* Timestamp */}
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${severityConfig[log.severity]?.dot || 'bg-blue-500'} flex-shrink-0`}></div>
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">{dateStr}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{timeStr}</span>
                  </div>
                </div>

                {/* Summary */}
                <div className="flex items-center">
                  <p className="text-sm text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                    {log.summary}
                  </p>
                </div>

                {/* Category */}
                <div className="flex items-center">
                  <CategoryBadge category={log.category} />
                </div>

                {/* Severity */}
                <div className="flex items-center">
                  <SeverityBadge severity={log.severity} />
                </div>

                {/* User */}
                <div className="flex items-center">
                  <span className="text-xs text-slate-500 truncate max-w-[100px]" title={log.user_email || 'System'}>
                    {log.user_email ? log.user_email.split('@')[0] : '—'}
                  </span>
                </div>

                {/* Expand arrow */}
                <div className="flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50/50 border-t border-slate-200">
            <span className="text-xs text-slate-500">
              Showing {offset + 1}–{Math.min(offset + limit, total)} of {total} logs
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-500 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category Breakdown (mini chart) */}
      {stats && Object.keys(stats.by_category).length > 0 && (
        <div className="glass-panel rounded-2xl p-5 bg-white border border-slate-200/60 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Activity by Category
          </h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.by_category).sort(([,a], [,b]) => b - a).map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setCategory(category === cat ? '' : cat)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition border ${
                  category === cat
                    ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {categoryIcons[cat] || '📋'}
                <span className="capitalize">{cat}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  category === cat ? 'bg-blue-100 text-blue-700' : 'bg-slate-200/60 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <DetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
};

export default ActivityLogsPage;
