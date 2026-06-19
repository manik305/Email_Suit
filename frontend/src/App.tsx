import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import DashboardPage from './pages/Dashboard';
import CampaignsPage from './pages/Campaigns';
import DataFolderPage from './pages/DataFolder';
import LoginPage from './pages/Login';
import MeetingScheduler from './pages/MeetingScheduler';
import { Chatbot } from './components/Chatbot';

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

  const navItems = [
    { name: 'Dashboard',       path: '/dashboard' },
    { name: 'Campaigns',        path: '/campaigns' },
    { name: 'Data Management',  path: '/data-folder' },
    { name: 'Meetings',         path: '/meetings' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAF8F0] text-slate-800 font-inter">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-[#E2DCBE] bg-[#F4F1E6] flex flex-col relative z-40">
        <div className="h-16 flex items-center px-5 gap-2.5 border-b border-[#E2DCBE] bg-gradient-to-r from-[#ECE6D2]/40 to-transparent">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#C5A059] to-[#8C6D3B] flex items-center justify-center shadow-sm">
            <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-[#8C6D3B] via-[#A88C52] to-[#C5A059] bg-clip-text text-transparent">
            Digio Click
          </h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    location.pathname === item.path
                      ? 'bg-[#E5DEC7] text-slate-900 shadow-sm border border-[#D0C7AA] font-medium'
                      : 'text-slate-600 hover:bg-[#EBE5CE] hover:text-slate-900'
                  }`}
                >
                  {navIcons[item.path]}
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-[#E2DCBE]">
          <button
            onClick={() => {
              localStorage.removeItem('access_token');
              localStorage.removeItem('auth_level');
              localStorage.removeItem('user_email');
              localStorage.removeItem('last_activity');
              window.location.href = '/';
            }}
            className="flex items-center justify-center w-full px-4 py-2 text-sm text-slate-600 bg-[#FAF8F0] hover:bg-[#ECE6D2] hover:text-slate-900 rounded-lg border border-[#E2DCBE] transition active:scale-[0.98]"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 relative overflow-y-auto bg-[#FAF8F0]/30">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#ECE6D2]/30 via-transparent to-transparent"></div>
        <div className="p-8 relative z-10 cream-panel min-h-[calc(100vh-4rem)] m-6 rounded-2xl">
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
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <SessionWrapper>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/dashboard"    element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
          <Route path="/campaigns"    element={<ProtectedRoute><Layout><CampaignsPage /></Layout></ProtectedRoute>} />
          <Route path="/data-folder"  element={<ProtectedRoute><Layout><DataFolderPage /></Layout></ProtectedRoute>} />
          <Route path="/meetings"     element={<ProtectedRoute><Layout><MeetingScheduler /></Layout></ProtectedRoute>} />
        </Routes>
      </SessionWrapper>
    </BrowserRouter>
  );
};

export default App;
