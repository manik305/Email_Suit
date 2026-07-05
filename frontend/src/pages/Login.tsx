import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import digioClickLogo from '../assets/Digio-click-logo.jpeg';
import { Mascot3D, MascotState } from '../components/Mascot3D';

const isLocalDev = window.location.port === '5173' || window.location.port === '5174';
const API_BASE_URL = isLocalDev ? 'http://localhost:8000/api/v1' : '/api/v1';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPortal = location.pathname === '/super-admin';
  const [mascotState, setMascotState] = useState<MascotState>('touching');
  
  // Tab Mode: 'signin' | 'register'
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  // Authentication Step: 'credentials' | 'otp' | 'reset_password' | 'reset_password_otp' | 'reset_password_confirm' | 'select_workspace'
  const [step, setStep] = useState<'credentials' | 'otp' | 'reset_password' | 'reset_password_otp' | 'reset_password_confirm' | 'select_workspace'>('credentials');

  const [workspaceOptions, setWorkspaceOptions] = useState<any[]>([]);
  const [tempSelectedWorkspaceId, setTempSelectedWorkspaceId] = useState<string>('');

  const [authLevel, setAuthLevel] = useState<'admin' | 'agent'>(isAdminPortal ? 'admin' : 'agent');
  const [email, setEmail] = useState(isAdminPortal ? 'architect@emailsaas.com' : 'outreach.specialist@emailsaas.com');
  const [password, setPassword] = useState('SecurePassword123');

  // Sync auth level and email when entering/exiting admin portal path
  useEffect(() => {
    setAuthLevel(isAdminPortal ? 'admin' : 'agent');
    setEmail(isAdminPortal ? 'architect@emailsaas.com' : 'outreach.specialist@emailsaas.com');
    setPassword('SecurePassword123');
  }, [isAdminPortal]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const [countdown, setCountdown] = useState(0);

  // SSO Simulator states
  const [showNotification, setShowNotification] = useState(false);
  const [ssoProvider, setSsoProvider] = useState<'google' | 'microsoft' | null>(null);
  const [showSelectorModal, setShowSelectorModal] = useState(false);
  
  const [selectedSsoEmail, setSelectedSsoEmail] = useState('growth.marketer@digioclick.com');
  const [customSsoEmail, setCustomSsoEmail] = useState('');
  const [ssoValidationError, setSsoValidationError] = useState('');
  const [authProgressText, setAuthProgressText] = useState('Contacting Auth Server...');

  // Effect for timer countdown
  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('auth_level');
    if (token) {
      if (role === 'admin') {
        navigate('/projects');
      } else {
        navigate('/dashboard');
      }
    }
  }, [navigate]);

  // Handle Mode Switch (Sign In vs Register)
  const handleModeSwitch = (mode: 'signin' | 'register') => {
    setAuthMode(mode);
    setStep('credentials');
    setErrorMessage('');
    setSuccessMessage('');
    
    // Fill default test credentials
    if (mode === 'signin') {
      setEmail(authLevel === 'admin' ? 'architect@emailsaas.com' : 'outreach.specialist@emailsaas.com');
      setPassword('SecurePassword123');
    } else {
      setEmail('');
      setPassword('');
    }
  };

  // Toggle prefilled creds based on role selection
  const handleAuthLevelChange = (level: 'admin' | 'agent') => {
    setAuthLevel(level);
    if (authMode === 'signin') {
      if (level === 'admin') {
        setEmail('architect@emailsaas.com');
        setPassword('SecurePassword123');
      } else {
        setEmail('outreach.specialist@emailsaas.com');
        setPassword('SecurePassword123');
      }
    }
  };

  // Step 1: Submit email + password (Registration or Login request)
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const endpoint = authMode === 'signin' ? '/auth/login-request' : '/auth/register-request';
      const payload = authMode === 'signin' 
        ? { email, password } 
        : { email, password, role: authLevel };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed. Please verify fields.');
      }

      // Success -> Transition to OTP
      setStep('otp');
      setCountdown(60); // 60s countdown
      setSuccessMessage(data.message || 'OTP sent successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Server connection issue.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Step 2: Submit OTP code (Registration verification or Login verification)
  const handleOtpVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const endpoint = authMode === 'signin' ? '/auth/login-verify' : '/auth/register-verify';
      const payload = { email, otp: otpCode };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Invalid verification passcode.');
      }

      if (authMode === 'register') {
        // Registration complete -> return to Sign In
        setAuthMode('signin');
        setStep('credentials');
        setSuccessMessage('Account verified successfully! You can now sign in.');
        setOtpCode('');
      } else {
        // Store JWT credentials & session details
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('auth_level', data.user.role);
        localStorage.setItem('user_email', data.user.email);
        localStorage.setItem('last_activity', Date.now().toString());

        // Redirection with smooth feedback
        setSuccessMessage('Identity verified. Loading workspaces...');
        
        // Fetch projects for workspace selection popup
        try {
          const projRes = await fetch(`${API_BASE_URL}/projects/`, {
            headers: { 'Authorization': `Bearer ${data.access_token}` }
          });
          if (projRes.ok) {
            const projData = await projRes.json();
            setWorkspaceOptions(projData);
            if (projData.length > 0) {
              setTempSelectedWorkspaceId(projData[0].id);
            }
          }
        } catch (projErr) {
          console.error("Failed to load workspaces for selector", projErr);
        }

        setTimeout(() => {
          setStep('select_workspace');
          setSuccessMessage('');
        }, 800);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleWorkspaceSelectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempSelectedWorkspaceId) {
      setErrorMessage('Please select a workspace project to enter.');
      return;
    }
    localStorage.setItem('selected_project_id', tempSelectedWorkspaceId);
    
    setSuccessMessage('Workspace project selected. Loading command center...');
    setTimeout(() => {
      navigate('/dashboard');
    }, 800);
  };

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setIsLoggingIn(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const endpoint = authMode === 'signin' ? '/auth/login-request' : '/auth/register-request';
      const payload = authMode === 'signin' 
        ? { email, password } 
        : { email, password, role: authLevel };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'OTP dispatch failed.');
      }

      setCountdown(60);
      setSuccessMessage('A fresh passcode was sent to your email.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend code.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Forgot password flow handlers
  const handleResetPasswordRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Reset password request failed.');
      }

      setSuccessMessage(data.message || 'Reset code sent successfully.');
      setStep('reset_password_otp');
      setCountdown(600); // 10 minutes expiry
    } catch (err: any) {
      setErrorMessage(err.message || 'Connection error.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResetPasswordOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Invalid verification code.');
      }

      setSuccessMessage(data.message || 'Code verified. Set your new password.');
      setStep('reset_password_confirm');
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResetPasswordConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoggingIn(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode, password: newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update password.');
      }

      setSuccessMessage(data.message || 'Your password was successfully updated.');
      setTimeout(() => {
        setStep('credentials');
        setNewPassword('');
        setConfirmPassword('');
        setOtpCode('');
        setSuccessMessage('');
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Update failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Google / Microsoft SSO Trigger
  const handleSsoClick = (provider: 'google' | 'microsoft') => {
    setSsoProvider(provider);
    setSelectedSsoEmail(provider === 'google' ? 'growth.marketer@digioclick.com' : 'ceo.enterprise@digioclick.com');
    setCustomSsoEmail('');
    setSsoValidationError('');
    setShowSelectorModal(true);
  };

  const executeSsoAuth = async (selectedEmail: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(selectedEmail)) {
      setSsoValidationError(`Please enter a valid business mail ID (e.g. name@domain.com)`);
      return;
    }

    setSsoValidationError('');
    setShowSelectorModal(false);
    setIsLoggingIn(true);
    
    const providerName = ssoProvider === 'google' ? 'Google' : 'Microsoft';
    setAuthProgressText(`Contacting ${providerName} Secure Auth Server...`);
    setShowNotification(true);

    try {
      const endpoint = ssoProvider === 'google' ? '/auth/google-oauth' : '/auth/microsoft-oauth';
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `${providerName} OAuth handshake failed.`);
      }

      setTimeout(() => {
        setAuthProgressText('Fetching secure user credentials...');
      }, 500);

      setTimeout(() => {
        setAuthProgressText('Establishing OAuth secure session token...');
      }, 1000);

      setTimeout(async () => {
        setShowNotification(false);
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('auth_level', data.user.role);
        localStorage.setItem('user_email', data.user.email);
        localStorage.setItem('last_activity', Date.now().toString());
        setIsLoggingIn(false);

        // Fetch projects for workspace selection popup
        try {
          const projRes = await fetch(`${API_BASE_URL}/projects/`, {
            headers: { 'Authorization': `Bearer ${data.access_token}` }
          });
          if (projRes.ok) {
            const projData = await projRes.json();
            setWorkspaceOptions(projData);
            if (projData.length > 0) {
              setTempSelectedWorkspaceId(projData[0].id);
            }
          }
        } catch (projErr) {
          console.error("Failed to load workspaces for selector", projErr);
        }

        setStep('select_workspace');
      }, 1500);

    } catch (err: any) {
      setIsLoggingIn(false);
      setShowNotification(false);
      setErrorMessage(err.message || `${providerName} sign-in simulated failure.`);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 font-inter relative overflow-hidden bg-[#F0F4F8]" style={{
      backgroundImage: `
        radial-gradient(at 0% 0%, #E0F2FE 0px, transparent 50%),
        radial-gradient(at 50% 0%, #EEF2F6 0px, transparent 50%),
        radial-gradient(at 100% 0%, #E0E7FF 0px, transparent 50%),
        radial-gradient(at 100% 100%, #F1F5F9 0px, transparent 50%),
        radial-gradient(at 0% 100%, #E0F2FE 0px, transparent 50%)
      `
    }}>
      {isLoggingIn && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[9999] flex flex-col items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white/95 border border-slate-200/50 rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm mx-4 transform animate-in zoom-in-95 duration-200 text-center">
            {/* 3D Loading Mascot Visual */}
            <Mascot3D state="loading" size={160} className="mb-4" />
            <h3 className="text-lg font-bold text-slate-800 font-inter">Authenticating...</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Your Digio Hero is verifying credentials and securing your marketing workspace.
            </p>
            {/* Spinning Loader Ring */}
            <div className="w-6 h-6 border-2 border-[#51A2C3] border-t-transparent rounded-full animate-spin mt-6"></div>
          </div>
        </div>
      )}
      
      {/* Centered Login Card Container */}
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl border border-slate-200/50 flex flex-col md:flex-row overflow-hidden relative z-10 min-h-[620px]">
        
        {/* LEFT PANEL: BRAND & PROMO (LIGHT BLUE PANELS) */}
        <div className="w-full md:w-[42%] bg-[#E6EFF6] p-8 flex flex-col justify-between relative overflow-hidden border-r border-slate-100">
          
          {/* Logo Section */}
          <div className="flex items-center gap-3">
            {/* Official Logo */}
            <img src={digioClickLogo} alt="Digio Click Logo" className="w-10 h-10 object-contain rounded-xl shadow-sm border border-slate-100 bg-white p-0.5" />
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">
                DigioClick
              </h1>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mt-0.5">
                Turning Clicks Into Clients
              </span>
            </div>
          </div>

          {/* Welcome Text & Mascot */}
          <div className="my-auto py-8 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                Welcome back! <span className="animate-bounce">👋</span>
              </h2>
              <p className="text-slate-600 mt-3 text-sm leading-relaxed font-medium">
                Get AI generated prospects and sales messages that can help you convert
              </p>
            </div>

            {/* 3D Mascot Interactive Chamber */}
            <div className="bg-white/85 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-sm flex flex-col items-center gap-4 hover:scale-[1.01] transition-all duration-300 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[#E6EFF6] to-transparent pointer-events-none opacity-40" />
              
              <Mascot3D state="touching" size={220} className="relative z-10" />
              
              <div className="w-full text-center relative z-10 mt-1">
                <p className="text-xs font-extrabold text-slate-800 tracking-wide uppercase">Interactive Digio Hero</p>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  Hover to tilt in 3D and see interactive touch ripples.
                </p>
              </div>
            </div>

            {/* Dashboard Mini-Preview (Fidelity Mockup) */}
            <div className="mt-8 bg-white/90 border border-slate-200/60 rounded-xl shadow-lg p-3.5 relative transform hover:scale-[1.02] transition-transform duration-300">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-[8px] text-slate-400 font-mono ml-1">digioclick.com</span>
                </div>
                <div className="w-16 h-3 bg-slate-100 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#EAF2F8] flex items-center justify-center text-[10px]">👤</div>
                  <div className="flex-1 space-y-1">
                    <div className="h-2 w-16 bg-slate-200 rounded"></div>
                    <div className="h-1.5 w-24 bg-slate-100 rounded"></div>
                  </div>
                  <div className="h-3 w-8 bg-[#E6F4EA] rounded text-[7px] text-[#137333] flex items-center justify-center font-bold">Active</div>
                </div>
                <div className="h-[0.5px] bg-slate-100"></div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#FDF2E9] flex items-center justify-center text-[10px]">💼</div>
                  <div className="flex-1 space-y-1">
                    <div className="h-2 w-20 bg-slate-200 rounded"></div>
                    <div className="h-1.5 w-28 bg-slate-100 rounded"></div>
                  </div>
                  <div className="h-3 w-8 bg-[#FCE8E6] rounded text-[7px] text-[#C5221F] flex items-center justify-center font-bold">Bounced</div>
                </div>
              </div>
            </div>
          </div>

          {/* System Footer info */}
          <div className="text-[10px] text-slate-400">
            Powered by DigioClick Outreach Engine
          </div>
        </div>

        {/* RIGHT PANEL: SIGN IN FORM */}
        <div className="flex-1 p-8 md:p-12 flex flex-col justify-between bg-white">
          
          <div className="my-auto max-w-md w-full mx-auto space-y-6">
            
            {/* Header */}
            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                  {step === 'reset_password' || step === 'reset_password_otp' || step === 'reset_password_confirm' ? 'Reset Password' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                </h2>
                {step === 'credentials' && (
                  <button
                    onClick={() => handleModeSwitch(authMode === 'signin' ? 'register' : 'signin')}
                    className="text-xs text-[#4BA7C9] hover:underline font-semibold"
                  >
                    {authMode === 'signin' ? "Don't have an account yet? Sign up" : 'Already have an account? Sign in'}
                  </button>
                )}
              </div>
            </div>

            {/* STATUS ALERTS */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start gap-2 animate-pulse">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold flex items-start gap-2">
                <span>✅</span>
                <span>{successMessage}</span>
              </div>
            )}

            {/* CREDENTIALS FORM */}
            {step === 'credentials' && (
              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                
                {/* ROLE SELECTOR (ADMIN / SUPER ADMIN / CAMPAIGN LEVEL) */}
                {isAdminPortal && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Access Permission Level
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-[#F8F9FA] p-1 border border-slate-200 rounded-xl">
                      <button
                        type="button"
                        onClick={() => handleAuthLevelChange('admin')}
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
                          authLevel === 'admin'
                            ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Admin / Super Admin
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAuthLevelChange('agent')}
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
                          authLevel === 'agent'
                            ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Campaign Manager
                      </button>
                    </div>
                  </div>
                )}

                {/* EMAIL */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="email">
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your registered email"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4BA7C9]/40 focus:border-[#4BA7C9] transition-all text-sm"
                    required
                  />
                </div>

                {/* PASSWORD */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4BA7C9]/40 focus:border-[#4BA7C9] transition-all text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('password') as HTMLInputElement;
                        if (input) input.type = input.type === 'password' ? 'text' : 'password';
                      }}
                      className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600"
                    >
                      👁️
                    </button>
                  </div>
                </div>

                {/* REMEMBER & FORGOT */}
                {authMode === 'signin' && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="flex items-center text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="mr-2 rounded border-slate-300 text-[#4BA7C9] focus:ring-[#4BA7C9]"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={() => setStep('reset_password')}
                      className="text-[#4BA7C9] hover:underline font-semibold"
                    >
                      Forgot password
                    </button>
                  </div>
                )}

                {/* SIGN IN BUTTON */}
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 px-4 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-semibold rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-4 flex items-center justify-center gap-2 text-sm"
                >
                  {isLoggingIn ? 'Signing In...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              </form>
            )}

            {/* OTP VERIFICATION VIEW */}
            {step === 'otp' && (
              <form onSubmit={handleOtpVerifySubmit} className="space-y-5">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-800">Enter OTP Code</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    We sent a verification code to <strong className="text-slate-700">{email}</strong>
                  </p>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-2xl font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#4BA7C9]"
                  required
                />
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>Expires in: <strong>{countdown}s</strong></span>
                  <button type="button" onClick={handleResendOtp} disabled={countdown > 0} className="text-[#4BA7C9] font-bold">
                    Resend Code
                  </button>
                </div>
                <p className="text-[10px] text-center font-semibold text-slate-400 bg-slate-50 border border-slate-100 p-2 rounded-lg mt-2">
                  💡 Sandbox Mode: You can enter <strong>123456</strong> as the bypass OTP.
                </p>
                <button
                  type="submit"
                  className="w-full py-3 bg-[#51A2C3] text-white font-bold rounded-xl shadow-md text-sm"
                >
                  Verify Code
                </button>
              </form>
            )}

            {/* WORKSPACE SELECTION VIEW */}
            {step === 'select_workspace' && (
              <form onSubmit={handleWorkspaceSelectSubmit} className="space-y-5">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-800">Select Project Workspace</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Please select a project context to load your outreach campaigns, meetings, and analytics.
                  </p>
                </div>

                {workspaceOptions.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3">
                    <p className="text-xs text-slate-500 font-medium">
                      {localStorage.getItem('auth_level') === 'admin'
                        ? 'No active workspaces found. Please proceed to the selection hub to create your first workspace.'
                        : 'No assigned workspaces found. Please contact your administrator to grant you access to a project.'}
                    </p>
                    {localStorage.getItem('auth_level') === 'admin' ? (
                      <button
                        type="button"
                        onClick={() => navigate('/projects')}
                        className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition"
                      >
                        Go to Workspace Builder
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem('access_token');
                          localStorage.removeItem('auth_level');
                          localStorage.removeItem('user_email');
                          window.location.href = '/';
                        }}
                        className="py-2 px-4 bg-slate-200 hover:bg-slate-350 text-slate-700 font-bold rounded-xl text-xs transition"
                      >
                        Log Out
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="workspaceSelect" className="block text-xs font-semibold text-slate-700">Available Workspaces</label>
                      <select
                        id="workspaceSelect"
                        value={tempSelectedWorkspaceId}
                        onChange={(e) => setTempSelectedWorkspaceId(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#4BA7C9] text-sm"
                      >
                        {workspaceOptions.map((w) => (
                          <option key={w.id} value={w.id}>
                            📁 {w.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-xl shadow-md transition-all active:scale-[0.98] text-sm"
                    >
                      Enter Workspace
                    </button>
                  </>
                )}
              </form>
            )}

            {/* RESET PASSWORD REQUEST VIEW */}
            {step === 'reset_password' && (
              <form onSubmit={handleResetPasswordRequestSubmit} className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-800">Reset password</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your email to receive a password reset verification code.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="resetEmail">
                    Email address
                  </label>
                  <input
                    id="resetEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#4BA7C9] text-sm"
                    placeholder="name@company.com"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('credentials')}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-[#51A2C3] text-white font-bold rounded-xl text-sm transition"
                  >
                    Send Code
                  </button>
                </div>
              </form>
            )}

            {/* RESET PASSWORD OTP VERIFICATION VIEW */}
            {step === 'reset_password_otp' && (
              <form onSubmit={handleResetPasswordOtpSubmit} className="space-y-5">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-800">Reset Verification Code</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Please check your mailbox at <strong className="text-slate-700">{email}</strong>
                  </p>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-2xl font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#4BA7C9]"
                  required
                />
                <p className="text-[10px] text-center font-semibold text-slate-400 bg-slate-50 border border-slate-100 p-2 rounded-lg my-2">
                  💡 Sandbox Mode: You can enter <strong>123456</strong> as the bypass OTP.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('reset_password')}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-[#51A2C3] text-white font-bold rounded-xl text-sm transition"
                  >
                    Verify Code
                  </button>
                </div>
              </form>
            )}

            {/* RESET PASSWORD CONFIRMATION VIEW */}
            {step === 'reset_password_confirm' && (
              <form onSubmit={handleResetPasswordConfirmSubmit} className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-800">Set New Password</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Set a secure, brand-new password for <strong className="text-slate-700">{email}</strong>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="newPassword">
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#4BA7C9] text-sm"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#4BA7C9] text-sm"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-[#51A2C3] text-white font-bold rounded-xl shadow-md text-sm mt-2 transition"
                >
                  Save & Confirm Password
                </button>
              </form>
            )}

            {/* SSO LOGIN INSTRUCTIONS */}
            {authMode === 'signin' && step === 'credentials' && (
              <>
                <div className="relative flex items-center justify-center my-4">
                  <hr className="w-full border-slate-200" />
                  <span className="absolute bg-white px-3 text-xs text-slate-400">OR</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => handleSsoClick('google')}
                    type="button"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.8-1.07 2.45v2.53h2.6c1.52-1.4 2.4-3.47 2.4-5.83z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-2.6-2.53c-.72.48-1.64.77-2.76.77-2.13 0-3.93-1.44-4.57-3.37h-2.7v2.09C9.33 22.09 13.9 24 12 24z" />
                      <path fill="#FBBC05" d="M7.43 14.96c-.16-.48-.25-1-.25-1.54s.09-1.06.25-1.54V9.79h-2.7C4.24 10.74 4 11.97 4 13.25s.24 2.51.73 3.46l2.7-2.1c-.16-.48-.25-.65-.25-1.65z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.96 1.19 15.24 0 12 0 7.37 0 3.33 3.91 4.73 7.93l2.7 2.09c.64-1.93 2.44-3.37 4.57-3.37z" />
                    </svg>
                    Sign In with Google
                  </button>

                  <button
                    onClick={() => handleSsoClick('microsoft')}
                    type="button"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 23 23">
                      <path fill="#f35325" d="M0 0h11v11H0z" />
                      <path fill="#81bc06" d="M12 0h11v11H12z" />
                      <path fill="#00a4ef" d="M0 12h11v11H0z" />
                      <path fill="#ffb900" d="M12 12h11v11H12z" />
                    </svg>
                    Sign In with Microsoft
                  </button>
                </div>
              </>
            )}

          </div>

          {/* Terms Agreement Footer */}
          <div className="text-[11px] text-slate-400 text-center mt-6">
            By signing up, you are agreeing to our <span className="text-[#4BA7C9] cursor-pointer hover:underline">Terms of Service, Privacy, and Cookie Policy</span>
          </div>
        </div>

      </div>

      {/* SSO PROVIDER EMAIL SELECTOR MODAL */}
      {showSelectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/5 rounded-full filter blur-xl pointer-events-none"></div>

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                  {ssoProvider === 'google' ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.8-1.07 2.45v2.53h2.6c1.52-1.4 2.4-3.47 2.4-5.83z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-2.6-2.53c-.72.48-1.64.77-2.76.77-2.13 0-3.93-1.44-4.57-3.37h-2.7v2.09C9.33 22.09 13.9 24 12 24z" />
                      <path fill="#FBBC05" d="M7.43 14.96c-.16-.48-.25-1-.25-1.54s.09-1.06.25-1.54V9.79h-2.7C4.24 10.74 4 11.97 4 13.25s.24 2.51.73 3.46l2.7-2.1c-.16-.48-.25-.65-.25-1.65z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.96 1.19 15.24 0 12 0 7.37 0 3.33 3.91 4.73 7.93l2.7 2.09c.64-1.93 2.44-3.37 4.57-3.37z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 23 23">
                      <path fill="#f35325" d="M0 0h11v11H0z" />
                      <path fill="#81bc06" d="M12 0h11v11H12z" />
                      <path fill="#00a4ef" d="M0 12h11v11H0z" />
                      <path fill="#ffb900" d="M12 12h11v11H12z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Sign in with {ssoProvider === 'google' ? 'Google' : 'Microsoft'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connect your enterprise account to authorize session.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowSelectorModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Custom Input */}
            <div className="space-y-2 mb-6">
              <label htmlFor="sso-custom-email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Enter your Gmail / Account ID
              </label>
              <div className="relative">
                <input
                  id="sso-custom-email"
                  name="sso_email"
                  type="email"
                  placeholder={ssoProvider === 'google' ? "username@gmail.com" : "username@outlook.com"}
                  value={customSsoEmail}
                  onChange={(e) => {
                    setCustomSsoEmail(e.target.value);
                    setSsoValidationError('');
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all font-mono text-sm"
                  autoFocus
                />
                <div className="absolute left-3.5 top-3.5 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              {ssoValidationError && (
                <p className="text-xs text-rose-500 mt-1 font-medium flex items-center gap-1">
                  <span>⚠️</span> {ssoValidationError}
                </p>
              )}
            </div>

            {/* Suggested Profiles List */}
            <div className="space-y-2 mb-6">
              <p className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Suggested Sandbox Profiles (Click to instantly sign in)
              </p>

              {(isAdminPortal ? [
                { email: `manikprabhudandothkar988@gmail.com`, label: 'Super Admin Creator' }
              ] : [
                { email: `growth.marketer@digioclick.com`, label: 'Growth Marketer Pro' },
                { email: `ceo.enterprise@digioclick.com`, label: 'Enterprise Executive' },
                { email: `outreach.specialist@digioclick.com`, label: 'Lead Outreach Agent' }
              ]).map(p => (
                <div 
                  key={p.email}
                  onClick={() => {
                    executeSsoAuth(p.email);
                  }}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/30 hover:border-blue-300 cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-xs text-slate-700 group-hover:text-blue-700 transition-colors">{p.label}</span>
                    <span className="text-[11px] text-blue-600 font-mono mt-0.5">{p.email}</span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSelectorModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-all border-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!customSsoEmail.trim()) {
                    setSsoValidationError("Please enter an email address.");
                    return;
                  }
                  executeSsoAuth(customSsoEmail.trim());
                }}
                className="flex-1 py-3 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-450 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-[0.99]"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP NOTIFICATION FOR SSO PROGRESS */}
      {showNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 backdrop-blur border border-indigo-500/40 text-slate-100 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <svg className="animate-spin h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-sm">{authProgressText}</h4>
            <p className="text-xs text-slate-400 mt-0.5">Redirecting to Digio Click dashboard in a moment.</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default LoginPage;
