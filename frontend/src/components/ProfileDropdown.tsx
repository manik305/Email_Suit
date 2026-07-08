import React, { useState, useRef, useEffect } from 'react';

export const ProfileDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const email = localStorage.getItem('user_email') || 'user@emailsaas.com';
  const role = localStorage.getItem('auth_level') || 'agent';
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('auth_level');
    localStorage.removeItem('user_email');
    localStorage.removeItem('last_activity');
    window.location.href = '/';
  };

  // First letter of email for avatar
  const firstLetter = email.charAt(0).toUpperCase();

  const isAdmin = role === 'admin';
  const roleLabel = isAdmin ? 'Administrator' : 'Campaign Manager';
  const roleColor = isAdmin 
    ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
    : 'bg-emerald-50 text-emerald-700 border-emerald-100';

  const capabilities = isAdmin
    ? [
        '✨ Create & Edit Projects',
        '👥 Grant & Revoke Team Access',
        '⚙️ Manage Global SMTP Mailers',
        '🚀 Launch outreach sequences',
      ]
    : [
        '📧 Configure personal mailers',
        '📁 Upload campaign leads list',
        '📥 Read incoming IMAP inbox',
        '📅 Schedule prospect meetings',
      ];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-tr from-[#51A2C3] to-[#3F93B5] text-white font-extrabold text-sm border-2 border-white shadow-md hover:scale-[1.03] active:scale-[0.98] transition-all focus:outline-none"
        title="View profile info"
        aria-expanded={isOpen}
      >
        {firstLetter}
      </button>

      {/* Gmail-style Dropdown Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl z-[999] py-4.5 px-4 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex flex-col items-center text-center pb-4 border-b border-slate-100">
            {/* Large Avatar */}
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-[#51A2C3] to-[#3F93B5] text-white font-black text-xl mb-3 shadow-inner">
              {firstLetter}
            </div>
            
            {/* Email Address */}
            <div className="text-sm font-bold text-slate-800 truncate w-full px-2" title={email}>
              {email}
            </div>
            
            {/* Role Badge */}
            <div className={`mt-2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleColor}`}>
              {roleLabel}
            </div>
          </div>

          {/* Capabilities/Permissions List */}
          <div className="py-4">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
              Authorized Capabilities
            </span>
            <ul className="space-y-1.5">
              {capabilities.map((cap, idx) => (
                <li key={idx} className="text-xs text-slate-650 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-slate-50">
                  <span className="text-[10px] leading-none">{cap}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex gap-2">
            <button
              onClick={() => setIsOpen(false)}
              className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition text-center"
            >
              Close
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition shadow-sm text-center"
            >
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
