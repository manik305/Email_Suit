import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const isLocalDev = window.location.port === '5173' || window.location.port === '5174';
const API_BASE_URL = isLocalDev ? 'http://localhost:8000/api/v1' : '/api/v1';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Tab Mode: 'signin' | 'register'
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  // Authentication Step: 'credentials' | 'otp' | 'reset_password'
  const [step, setStep] = useState<'credentials' | 'otp' | 'reset_password'>('credentials');

  const [authLevel, setAuthLevel] = useState<'admin' | 'agent'>('admin');
  const [email, setEmail] = useState('architect@emailsaas.com');
  const [password, setPassword] = useState('SecurePassword123');
  const [otpCode, setOtpCode] = useState('');
  
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Dev Sandbox Helper OTP storage
  const [devOtp, setDevOtp] = useState('');
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
    if (token) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Handle Mode Switch (Sign In vs Register)
  const handleModeSwitch = (mode: 'signin' | 'register') => {
    setAuthMode(mode);
    setStep('credentials');
    setErrorMessage('');
    setSuccessMessage('');
    setDevOtp('');
    
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
    setDevOtp('');

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
      if (data.dev_otp) {
        setDevOtp(data.dev_otp);
      }
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
        setDevOtp('');
      } else {
        // Login complete -> Store JWT & session details
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('auth_level', data.user.role);
        localStorage.setItem('user_email', data.user.email);
        localStorage.setItem('last_activity', Date.now().toString());

        // Redirection with smooth feedback
        setSuccessMessage('Identity verified. Redirecting to workspace...');
        setTimeout(() => {
          navigate('/dashboard');
        }, 800);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setIsLoggingIn(true);
    setErrorMessage('');
    setSuccessMessage('');
    setDevOtp('');

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
      if (data.dev_otp) {
        setDevOtp(data.dev_otp);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend code.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Reset password handler simulation
  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(`A password reset link has been dispatched to ${email}.`);
    setTimeout(() => {
      setStep('credentials');
      setSuccessMessage('');
    }, 3000);
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

      setTimeout(() => {
        setShowNotification(false);
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('auth_level', data.user.role);
        localStorage.setItem('user_email', data.user.email);
        localStorage.setItem('last_activity', Date.now().toString());
        setIsLoggingIn(false);
        navigate('/dashboard');
      }, 1500);

    } catch (err: any) {
      setIsLoggingIn(false);
      setShowNotification(false);
      setErrorMessage(err.message || `${providerName} sign-in simulated failure.`);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 font-inter relative overflow-hidden bg-[#E2EFEC]" style={{
      backgroundImage: `
        radial-gradient(at 0% 0%, #E3EFE5 0px, transparent 50%),
        radial-gradient(at 50% 0%, #FAF6EA 0px, transparent 50%),
        radial-gradient(at 100% 0%, #E5EEF0 0px, transparent 50%),
        radial-gradient(at 100% 100%, #FAF6EA 0px, transparent 50%),
        radial-gradient(at 0% 100%, #E2EDF2 0px, transparent 50%)
      `
    }}>
      
      {/* Centered Login Card Container */}
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl border border-slate-200/50 flex flex-col md:flex-row overflow-hidden relative z-10 min-h-[620px]">
        
        {/* LEFT PANEL: BRAND & PROMO (LIGHT BLUE PANELS) */}
        <div className="w-full md:w-[42%] bg-[#E6EFF6] p-8 flex flex-col justify-between relative overflow-hidden border-r border-slate-100">
          
          {/* Logo Section */}
          <div className="flex items-center gap-2.5">
            {/* Funnel/Play Logo replacement */}
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#3F93B5] via-[#4BA7C9] to-[#71C4E4] flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 3h18v2l-7 8v6l-4 2v-8L3 5V3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">
                DigioClick
              </h1>
              <span className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold block mt-0.5">Marketing Automation</span>
            </div>
          </div>

          {/* Welcome Text */}
          <div className="my-auto py-8">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
              Welcome back! <span className="animate-bounce">👋</span>
            </h2>
            <p className="text-slate-600 mt-3 text-sm leading-relaxed font-medium">
              Get AI generated prospects and sales messages that can help you convert
            </p>

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
                  {step === 'reset_password' ? 'Reset Password' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                </h2>
                {step !== 'reset_password' && (
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

            {/* DEV AUTO FILL WIDGET */}
            {devOtp && step === 'otp' && (
              <div className="p-3 bg-[#EAF2F8] border border-blue-200 rounded-xl text-xs flex flex-col gap-2">
                <div className="flex justify-between items-center text-blue-800 font-semibold font-mono">
                  <span>🤖 Dev Sandbox Mode</span>
                </div>
                <div className="flex gap-2 items-center">
                  <code className="bg-white border border-slate-200 text-slate-800 font-mono px-3 py-1.5 rounded-lg text-sm font-bold flex-1 text-center">
                    {devOtp}
                  </code>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devOtp)}
                    className="bg-[#4BA7C9] hover:bg-[#3F93B5] text-white font-semibold px-3 py-1.5 rounded-lg text-[11px] transition-all"
                  >
                    Auto-Fill
                  </button>
                </div>
              </div>
            )}

            {/* CREDENTIALS FORM */}
            {step === 'credentials' && (
              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                
                {/* ROLE SELECTOR (ADMIN / SUPER ADMIN / CAMPAIGN LEVEL) */}
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
                <button
                  type="submit"
                  className="w-full py-3 bg-[#51A2C3] text-white font-bold rounded-xl shadow-md"
                >
                  Verify Code
                </button>
              </form>
            )}

            {/* RESET PASSWORD VIEW */}
            {step === 'reset_password' && (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="resetEmail">
                    Email address
                  </label>
                  <input
                    id="resetEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('credentials')}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-[#51A2C3] text-white font-bold rounded-xl text-sm"
                  >
                    Reset Password
                  </button>
                </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/10 rounded-full filter blur-xl pointer-events-none"></div>

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400">
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
                  <h3 className="text-lg font-bold text-white">
                    Sign in with {ssoProvider === 'google' ? 'Google' : 'Microsoft'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Connect your enterprise account to authorize session.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowSelectorModal(false)}
                className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Custom Input */}
            <div className="space-y-2 mb-6">
              <label htmlFor="sso-custom-email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
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
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all font-mono text-sm"
                  autoFocus
                />
                <div className="absolute left-3.5 top-3.5 text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              {ssoValidationError && (
                <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                  <span>⚠️</span> {ssoValidationError}
                </p>
              )}
            </div>

            {/* Suggested Profiles List */}
            <div className="space-y-2 mb-6">
              <p className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Suggested Sandbox Profiles (Click to instantly sign in)
              </p>

              {[
                { email: `growth.marketer@digioclick.com`, label: 'Growth Marketer Pro' },
                { email: `ceo.enterprise@digioclick.com`, label: 'Enterprise Executive' },
                { email: `outreach.specialist@digioclick.com`, label: 'Lead Outreach Agent' }
              ].map(p => (
                <div 
                  key={p.email}
                  onClick={() => {
                    executeSsoAuth(p.email);
                  }}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-indigo-950/20 hover:border-indigo-500/40 cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-xs text-slate-200 group-hover:text-white transition-colors">{p.label}</span>
                    <span className="text-[11px] text-indigo-400 font-mono mt-0.5">{p.email}</span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity">
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
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl text-sm transition-all border border-slate-750"
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
                className="flex-1 py-3 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-450 hover:to-purple-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.99]"
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
