import React, { useState, useEffect } from 'react';

const isLocalDev = window.location.port === '5173' || window.location.port === '5174';
const API_BASE = isLocalDev ? 'http://localhost:8000/api/v1' : '/api/v1';

type TimeSlot = {
  time: string;
  available: boolean;
};

type Meeting = {
  meeting_id?: string;
  id?: string;
  title: string;
  date?: string;
  time?: string;
  meet_link?: string;
  sender_email?: string | null;
  scheduled_date?: string;
  scheduled_time?: string;
  duration_minutes?: number;
  google_meet_link?: string;
  organizer?: string;
  attendee_email: string | null;
  status?: string;
};

const MeetingScheduler: React.FC = () => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [description, setDescription] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmationLink, setConfirmationLink] = useState('');
  const [error, setError] = useState('');
  
  const [senderEmail, setSenderEmail] = useState('');

  const getHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Fetch available slots when a date is picked
  useEffect(() => {
    if (!date) return;
    setSelectedSlot('');
    setConfirmationLink('');
    fetch(`${API_BASE}/meetings/available-slots?date=${date}`, { headers: getHeaders() })
      .then(res => res.json())
      .then(data => setSlots(data && Array.isArray(data.slots) ? data.slots : []))
      .catch(() => setSlots([]));
  }, [date]);

  // Fetch existing meetings on mount
  useEffect(() => {
    fetch(`${API_BASE}/meetings/list`, { headers: getHeaders() })
      .then(res => res.json())
      .then(data => setMeetings(data && Array.isArray(data.meetings) ? data.meetings : []))
      .catch(() => {});
  }, [confirmationLink]);

  const handleSchedule = async () => {
    if (!title || !date || !selectedSlot) {
      setError('Please fill in the title, date, and select a time slot.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/meetings/schedule`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getHeaders()
        },
        body: JSON.stringify({
          title,
          date,
          time_slot: selectedSlot,
          duration_minutes: 30,
          attendee_email: attendeeEmail || null,
          description: description || null,
          sender_email: senderEmail || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to schedule meeting');
      }
      const meeting = await res.json();
      setConfirmationLink(meeting.meet_link || meeting.google_meet_link);
      setTitle('');
      setAttendeeEmail('');
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Get tomorrow as minimum date
  const getMinDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          Meeting Scheduler
        </h1>
        <p className="text-slate-400 mt-1">Schedule Google Meet sessions with auto-generated links</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Scheduling Form */}
        <div className="glass rounded-2xl border border-white/5 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            New Meeting
          </h2>

          <div>
            <label htmlFor="meeting-sender-email" className="block text-xs font-medium text-slate-400 mb-1.5">Sender Email Address (optional)</label>
            <input
              id="meeting-sender-email"
              name="sender_email"
              type="email"
              value={senderEmail}
              onChange={e => setSenderEmail(e.target.value)}
              placeholder="sender@example.com"
              className="w-full bg-slate-800/80 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="meeting-title" className="block text-xs font-medium text-slate-400 mb-1.5">Meeting Title</label>
            <input
              id="meeting-title"
              name="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Campaign Strategy Review"
              className="w-full bg-slate-800/80 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="meeting-attendee-email" className="block text-xs font-medium text-slate-400 mb-1.5">Attendee Email (optional)</label>
            <input
              id="meeting-attendee-email"
              name="attendee_email"
              type="email"
              value={attendeeEmail}
              onChange={e => setAttendeeEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full bg-slate-800/80 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="meeting-date" className="block text-xs font-medium text-slate-400 mb-1.5">Select Date</label>
            <input
              id="meeting-date"
              name="meeting_date"
              type="date"
              value={date}
              min={getMinDate()}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-800/80 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
            />
          </div>

          {/* Time Slots Grid */}
          {slots.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Available Time Slots</label>
              <div className="grid grid-cols-4 gap-2">
                {slots.map(slot => (
                  <button
                    key={slot.time}
                    disabled={!slot.available}
                    onClick={() => setSelectedSlot(slot.time)}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                      selectedSlot === slot.time
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 shadow-lg shadow-indigo-500/20'
                        : slot.available
                          ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/5'
                          : 'bg-slate-800/30 text-slate-600 cursor-not-allowed line-through border border-white/5'
                    }`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="meeting-description" className="block text-xs font-medium text-slate-400 mb-1.5">Description (optional)</label>
            <textarea
              id="meeting-description"
              name="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Meeting agenda or notes..."
              rows={2}
              className="w-full bg-slate-800/80 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSchedule}
            disabled={loading || !title || !date || !selectedSlot}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Scheduling...
              </span>
            ) : (
              'Schedule & Generate Meet Link'
            )}
          </button>

          {/* Confirmation Panel */}
          {confirmationLink && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-2 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Meeting Confirmed!
              </div>
              <p className="text-slate-300 text-sm">Date: <span className="text-white font-medium">{date}</span> at <span className="text-white font-medium">{selectedSlot}</span></p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Meet Link:</span>
                <a href={confirmationLink} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm font-mono underline break-all">
                  {confirmationLink}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Scheduled Meetings List */}
        <div className="glass rounded-2xl border border-white/5 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Scheduled Meetings
          </h2>

          {meetings.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No meetings scheduled yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {meetings.map((m, i) => (
                <div key={i} className="bg-slate-800/50 border border-white/5 rounded-xl p-4 space-y-2 hover:border-indigo-500/20 transition-colors">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-white text-sm">{m.title}</h3>
                    <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                      {m.status || 'Scheduled'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <p>📅 {m.scheduled_date || m.date} at {m.scheduled_time || m.time} ({m.duration_minutes || 30}min)</p>
                    <p>👤 Sender: {m.organizer || m.sender_email || "Default"}</p>
                    {m.attendee_email && <p>📧 Client: {m.attendee_email}</p>}
                  </div>
                  <a
                    href={m.google_meet_link || m.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mt-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Join Meet
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingScheduler;
