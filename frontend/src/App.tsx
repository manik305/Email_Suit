import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import digioClickLogo from './assets/Digio-click-logo.jpeg';
import DashboardPage from './pages/Dashboard';
import CampaignsPage from './pages/Campaigns';
import DataFolderPage from './pages/DataFolder';
import LoginPage from './pages/Login';
import MeetingScheduler from './pages/MeetingScheduler';
import ProjectHubPage from './pages/ProjectHub';
import { Chatbot } from './components/Chatbot';
import { useAppContext, API_BASE_URL } from './context/AppContext';
import { Mascot3D } from './components/Mascot3D';

const navIcons: Record<string, React.ReactNode> = {
  '/dashboard': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  '/campaigns': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  '/data-folder': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  '/meetings': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(localStorage.getItem('selected_project_id') || '');

  useEffect(() => {
    const fetchLayoutProjects = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/projects/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          if (data.length > 0 && !selectedProjectId) {
            setSelectedProjectId(data[0].id);
            localStorage.setItem('selected_project_id', data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load layout projects", err);
      }
    };
    fetchLayoutProjects();
  }, [selectedProjectId]);

  const navItems = [
    { name: 'Dashboard',       path: '/dashboard' },
    { name: 'Campaigns',        path: '/campaigns' },
    { name: 'Data Management',  path: '/data-folder' },
    { name: 'Meetings',         path: '/meetings' },
  ];

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800 font-inter">
      {/* Mobile Top Navbar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src={digioClickLogo} alt="Digio Click Logo" className="w-7 h-7 object-contain rounded-lg border border-slate-200 bg-white p-0.5" />
          <span className="font-bold text-sm text-slate-800">Digio Click</span>
        </div>
        
        {/* Workspace Indicator badge */}
        <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider max-w-[120px] truncate">
          {projects.find(p => p.id === selectedProjectId)?.name || 'Outreach'}
        </span>
      </div>

      {/* Backdrop overlay for mobile sidebar drawer */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity"
        />
      )}

      {/* Sidebar aside drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col border-r border-slate-200 transition-transform duration-300 md:static md:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-200 bg-gradient-to-r from-blue-50/40 to-transparent">
          <img src={digioClickLogo} alt="Digio Click Logo" className="w-8 h-8 object-contain rounded-lg shadow-sm border border-slate-200 bg-white p-0.5" />
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
            Digio Click
          </h1>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden ml-auto p-1.5 text-slate-400 hover:text-slate-650"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Workspace Switcher */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/30">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Active Workspace
          </span>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              const newId = e.target.value;
              setSelectedProjectId(newId);
              localStorage.setItem('selected_project_id', newId);
              window.location.reload();
            }}
            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-750 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {projects.length === 0 ? (
              <option value="">No Workspaces</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))
            )}
          </select>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    location.pathname === item.path
                      ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {navIcons[item.path]}
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={() => {
              localStorage.removeItem('access_token');
              localStorage.removeItem('auth_level');
              localStorage.removeItem('user_email');
              localStorage.removeItem('last_activity');
              window.location.href = '/';
            }}
            className="flex items-center justify-center w-full px-4 py-2 text-sm text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 rounded-lg border border-slate-200 transition active:scale-[0.98]"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 relative overflow-y-auto bg-slate-50/30 pt-14 md:pt-0">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/30 via-transparent to-transparent"></div>
        <div className="p-4 md:p-8 relative z-10 cream-panel min-h-[calc(100vh-4rem)] m-2 md:m-6 rounded-2xl">
          {children}
        </div>
        
        {/* Floating Chatbot Widget */}
        <Chatbot />
      </main>
    </div>
  );
};

// Route Guard Wrapper for Authenticated Resources
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

// Global User Activity Tracking & Session Timeout (2 hours)
const useSessionManager = () => {
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    // Set initial activity time
    if (!localStorage.getItem('last_activity')) {
      localStorage.setItem('last_activity', Date.now().toString());
    }

    const updateActivity = () => {
      localStorage.setItem('last_activity', Date.now().toString());
    };

    // User activity listeners
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((name) => {
      window.addEventListener(name, updateActivity);
    });

    // Check every 10 seconds for 2 hours of absolute inactivity
    const interval = setInterval(() => {
      const lastActivityStr = localStorage.getItem('last_activity');
      if (lastActivityStr) {
        const lastActivity = parseInt(lastActivityStr, 10);
        const inactivityPeriod = Date.now() - lastActivity;
        const twoHours = 2 * 60 * 60 * 1000;

        if (inactivityPeriod >= twoHours) {
          console.warn('⚠️ Session has expired due to 2 hours of inactivity.');
          localStorage.removeItem('access_token');
          localStorage.removeItem('auth_level');
          localStorage.removeItem('user_email');
          localStorage.removeItem('last_activity');
          window.location.href = '/';
        }
      }
    }, 10000);

    return () => {
      events.forEach((name) => {
        window.removeEventListener(name, updateActivity);
      });
      clearInterval(interval);
    };
  }, []);
};

const SessionWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useSessionManager();
  const { state } = useAppContext();

  return (
    <>
      {state.isLoading && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[9999] flex flex-col items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white/95 border border-slate-200/50 rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm mx-4 transform animate-in zoom-in-95 duration-200 text-center">
            {/* 3D Loading Mascot Visual */}
            <Mascot3D state="loading" size={160} className="mb-4" />
            <h3 className="text-lg font-bold text-slate-800 font-inter">Compiling Outreach Magic...</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Your Digio Hero is preparing AI target metrics and validating prospects. Just a moment!
            </p>
            {/* Spinning Loader Ring */}
            <div className="w-6 h-6 border-2 border-[#51A2C3] border-t-transparent rounded-full animate-spin mt-6"></div>
          </div>
        </div>
      )}
      {children}
    </>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <SessionWrapper>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/super-admin"  element={<LoginPage />} />
          <Route path="/dashboard"    element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
          <Route path="/campaigns"    element={<ProtectedRoute><Layout><CampaignsPage /></Layout></ProtectedRoute>} />
          <Route path="/data-folder"  element={<ProtectedRoute><Layout><DataFolderPage /></Layout></ProtectedRoute>} />
          <Route path="/meetings"     element={<ProtectedRoute><Layout><MeetingScheduler /></Layout></ProtectedRoute>} />
          <Route path="/projects"     element={<ProtectedRoute><ProjectHubPage /></ProtectedRoute>} />
        </Routes>
      </SessionWrapper>
    </BrowserRouter>
  );
};

export default App;
