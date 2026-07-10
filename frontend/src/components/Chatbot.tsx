import React, { useState, useRef, useEffect } from 'react';

type Message = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  time: string;
};

const LLM_MODELS = [
  { label: 'Chrome Gemini Nano (Local AI)', value: 'chrome-prompt-api' },
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Llama 4 Scout', value: 'llama-4-scout-17b-16e-instruct' },
];

import { API_BASE_URL } from '../context/AppContext';

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(LLM_MODELS[0].value);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'ai',
      text: 'Hi! I am your Digio Click Copilot. Select a model above and ask me anything about your campaigns, CRM leads, or email templates.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Speech Recognition States
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported in this browser. Try Google Chrome.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const getSelectedLabel = () => {
    return LLM_MODELS.find(m => m.value === selectedModel)?.label || selectedModel;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setIsTyping(true);

    // 1. Google Chrome built-in Prompt API Handshake
    if (selectedModel === 'chrome-prompt-api') {
      try {
        const winAI = (window as any).ai;
        if (!winAI || !winAI.languageModel) {
          throw new Error("Chrome Prompt API (Gemini Nano) not detected. Enable it in chrome://flags/#prompt-api-for-gemini-nano");
        }

        const capabilities = await winAI.languageModel.capabilities();
        if (capabilities.available === 'no') {
          throw new Error("Gemini Nano model not available inside your Google Chrome installation.");
        }

        const session = await winAI.languageModel.create({
          systemPrompt: "You are a local Google Gemini Nano assistant. Help the user manage Digio Click CRM leads, Cold email campaigns, and timezone scheduling."
        });

        const aiResponse = await session.prompt(currentInput);

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: aiResponse || "Model returned an empty response.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, aiMsg]);
      } catch (err: any) {
        // Graceful sandbox simulator fallback for developer testing
        const fallbackMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `🤖 [Chrome Prompt API Sandbox Simulator]\n\nSince local Gemini Nano is not enabled in this browser, here is the simulated response:\n\n"Regarding your CRM project, we have configured a strict 13-header lead matrix database connected to Supabase PostgreSQL. Campaigns are automatically dispatched using scheduling timezones, triggering SMTP relays with verification OTPs."\n\n💡 *To run this locally in Chrome, enable these flags:\n1. chrome://flags/#optimization-guide-on-device-model\n2. chrome://flags/#prompt-api-for-gemini-nano*`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, fallbackMsg]);
      } finally {
        setIsTyping(false);
      }
      return;
    }

    // 2. Standard Server completions fallback
    try {
      const response = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: 'You are a helpful SaaS Email Campaign assistant. Help users with campaign setup, data management, email configuration, and meeting scheduling.' },
            { role: 'user', content: currentInput }
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      const aiText = data?.choices?.[0]?.message?.content 
        || data?.choices?.[0]?.message?.content 
        || 'Sorry, I could not generate a response. Please check your API key configuration.';
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: aiText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: `⚠️ Could not reach the backend (${API_BASE_URL}). Make sure the FastAPI server is running with: uvicorn app.main:app --reload`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-96 max-w-[calc(100vw-3rem)] h-[500px] max-h-[80vh] glass rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-fade-in origin-bottom-right">
          
          {/* Header */}
          <div className="bg-indigo-600 p-4 shrink-0 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Copilot Assistant</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span className="text-indigo-100 text-xs">{getSelectedLabel()}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-indigo-100 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Model Selector */}
          <div className="bg-slate-900/80 px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
             <span className="text-xs text-slate-400 font-medium">Model:</span>
             <select 
               id="chatbot-model-selector"
               name="model"
               value={selectedModel}
               onChange={(e) => setSelectedModel(e.target.value)}
               className="bg-transparent text-xs text-indigo-400 font-semibold focus:outline-none cursor-pointer appearance-none text-right"
             >
               {LLM_MODELS.map(m => (
                 <option key={m.value} value={m.value} className="bg-slate-800 text-white">{m.label}</option>
               ))}
             </select>
          </div>

          {/* Message History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    msg.sender === 'user' 
                      ? 'bg-indigo-600 text-white rounded-br-none' 
                      : 'bg-slate-800 border border-white/5 text-slate-200 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex items-start">
                 <div className="bg-slate-800 border border-white/5 rounded-2xl rounded-bl-none px-4 py-3">
                   <div className="flex gap-1.5">
                     <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                     <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                     <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                   </div>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-slate-900 border-t border-white/5 shrink-0">
            <form onSubmit={handleSend} className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="chatbot-message-input"
                  name="message"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about campaigns, data, meetings..."
                  className="w-full bg-slate-800 border-none rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow"
                />
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`absolute right-2.5 top-2.5 p-1 rounded-lg transition-all ${
                    isListening 
                      ? 'text-rose-500 bg-rose-500/15 animate-pulse scale-110 shadow shadow-rose-500/30' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Speak (Voice Input)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-xl transition-all shadow-md active:scale-95 shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${isOpen ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-1'} p-4 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center`}
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
    </div>
  );
};

