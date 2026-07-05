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
  description?: string;
};

const MeetingScheduler: React.FC = () => {
  const selectedProjectId = localStorage.getItem('selected_project_id') || '';

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
  
  // Edit mode state
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);

  const getHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Fetch available slots when a date is picked
  useEffect(() => {
    if (!date) return;
    setSelectedSlot('');
    setConfirmationLink('');
    const slotsUrl = selectedProjectId 
      ? `${API_BASE}/meetings/available-slots?date=${date}&project_id=${selectedProjectId}` 
      : `${API_BASE}/meetings/available-slots?date=${date}`;
    fetch(slotsUrl, { headers: getHeaders() })
      .then(res => res.json())
      .then(data => setSlots(data && Array.isArray(data.slots) ? data.slots : []))
      .catch(() => setSlots([]));
  }, [date, selectedProjectId]);

  // Fetch existing meetings on mount
  useEffect(() => {
    const listUrl = selectedProjectId 
      ? `${API_BASE}/meetings/list?project_id=${selectedProjectId}` 
      : `${API_BASE}/meetings/list`;
    fetch(listUrl, { headers: getHeaders() })
      .then(res => res.json())
      .then(data => setMeetings(data && Array.isArray(data.meetings) ? data.meetings : []))
      .catch(() => {});
  }, [confirmationLink, selectedProjectId]);

  const resetForm = () => {
    setEditingMeetingId(null);
    setTitle('');
    setDate('');
    setSelectedSlot('');
    setAttendeeEmail('');
    setSenderEmail('');
    setDescription('');
  };

  const handleSchedule = async () => {
    if (!title || !date || !selectedSlot) {
      setError('Please fill in the title, date, and select a time slot.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const url = editingMeetingId 
        ? `${API_BASE}/meetings/${editingMeetingId}` 
        : `${API_BASE}/meetings/schedule`;
      const method = editingMeetingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
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
          project_id: selectedProjectId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to submit meeting details');
      }
      
      const meeting = await res.json();
      if (editingMeetingId) {
        alert('✅ Meeting booking updated successfully!');
      } else {
        setConfirmationLink(meeting.meet_link || meeting.google_meet_link);
      }
      resetForm();

      // Refresh list
      const listUrl = selectedProjectId 
        ? `${API_BASE}/meetings/list?project_id=${selectedProjectId}` 
        : `${API_BASE}/meetings/list`;
      fetch(listUrl, { headers: getHeaders() })
        .then(res => res.json())
        .then(data => setMeetings(data && Array.isArray(data.meetings) ? data.meetings : []))
        .catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (m: Meeting) => {
    setEditingMeetingId(m.id || m.meeting_id || null);
    setTitle(m.title);
    setDate(m.scheduled_date || m.date || '');
    setSelectedSlot(m.scheduled_time || m.time || '');
    setAttendeeEmail(m.attendee_email || '');
    setSenderEmail(m.sender_email || '');
    setDescription(m.description || '');
  };

  const handleDelete = async (meetingId: string) => {
    if (!window.confirm("Are you sure you want to cancel and delete this meeting?")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        alert('🗑️ Meeting booking cancelled and deleted.');
        // Refresh list
        const listRes = await fetch(`${API_BASE}/meetings/list`, { headers: getHeaders() });
        const listData = await listRes.json();
        setMeetings(listData && Array.isArray(listData.meetings) ? listData.meetings : []);
      } else {
        const err = await res.json();
        alert(`❌ Failed to delete meeting: ${err.detail || 'Server error'}`);
      }
    } catch (e) {
      alert('❌ Network error deleting meeting.');
    }
  };

  // Get tomorrow as minimum date
  const getMinDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  return (
    <div className="space-y-8 pb-20 text-slate-700">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-blue-600">
          Meeting Scheduler
        </h1>
        <p className="text-slate-500 mt-1">Schedule Google Meet sessions with auto-generated links</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Scheduling Form */}
        <div className="glass-panel rounded-2xl p-6 space-y-5 bg-white border border-slate-200/60 shadow-sm">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {editingMeetingId ? 'Edit Meeting Details' : 'New Meeting'}
            </h2>
            {editingMeetingId && (
              <button 
                onClick={resetForm}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold rounded-lg text-xs transition"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div>
            <label htmlFor="meeting-sender-email" className="block text-xs font-semibold text-slate-600 mb-1.5">Sender Email Address (optional)</label>
            <input
              id="meeting-sender-email"
              name="sender_email"
              type="email"
              value={senderEmail}
              onChange={e => setSenderEmail(e.target.value)}
              placeholder="sender@example.com"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="meeting-title" className="block text-xs font-semibold text-slate-600 mb-1.5">Meeting Title</label>
            <input
              id="meeting-title"
              name="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Campaign Strategy Review"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="meeting-attendee-email" className="block text-xs font-semibold text-slate-600 mb-1.5">Attendee Email (optional)</label>
            <input
              id="meeting-attendee-email"
              name="attendee_email"
              type="email"
              value={attendeeEmail}
              onChange={e => setAttendeeEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="meeting-date" className="block text-xs font-semibold text-slate-600 mb-1.5">Select Date</label>
            <input
              id="meeting-date"
              name="meeting_date"
              type="date"
              value={date}
              min={getMinDate()}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 [color-scheme:light]"
            />
          </div>

          {/* Time Slots Grid */}
          {slots.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Available Time Slots</label>
              <div className="grid grid-cols-4 gap-2">
                {slots.map(slot => (
                  <button
                    key={slot.time}
                    disabled={!slot.available && slot.time !== selectedSlot}
                    onClick={() => setSelectedSlot(slot.time)}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                      selectedSlot === slot.time
                        ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-md shadow-blue-500/10'
                        : slot.available
                          ? 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                          : 'bg-slate-100/50 text-slate-400 cursor-not-allowed line-through border border-slate-100'
                    }`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="meeting-description" className="block text-xs font-semibold text-slate-600 mb-1.5">Description (optional)</label>
            <textarea
              id="meeting-description"
              name="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Meeting agenda or notes..."
              rows={2}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 text-rose-700 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            onClick={handleSchedule}
            disabled={loading || !title || !date || !selectedSlot}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-500/25 disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                {editingMeetingId ? 'Updating...' : 'Scheduling...'}
              </span>
            ) : (
              editingMeetingId ? 'Update Meeting Details' : 'Schedule & Generate Meet Link'
            )}
          </button>

          {/* Confirmation Panel */}
          {confirmationLink && (
            <div className="bg-emerald-50 border border-emerald-250/60 rounded-xl p-4 space-y-2 animate-fade-in text-emerald-900">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Meeting Confirmed!
              </div>
              <p className="text-slate-700 text-sm">Date: <span className="text-slate-900 font-bold">{date}</span> at <span className="text-slate-900 font-bold">{selectedSlot}</span></p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Meet Link:</span>
                <a href={confirmationLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-750 text-sm font-semibold underline break-all">
                  {confirmationLink}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Scheduled Meetings List */}
        <div className="glass-panel rounded-2xl p-6 space-y-4 bg-white border border-slate-200/60 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Scheduled Meetings
          </h2>

          {meetings.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium">No meetings scheduled yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {meetings.map((m) => {
                const meetingId = m.id || m.meeting_id || '';
                return (
                  <div key={meetingId} className="bg-slate-50/60 border border-slate-200 rounded-xl p-4 space-y-2 hover:border-blue-300 hover:bg-slate-50 transition-colors shadow-sm">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-800 text-sm">{m.title}</h3>
                      <span className="text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-250/40 px-2 py-0.5 rounded-full font-bold">
                        {m.status || 'Scheduled'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>📅 {m.scheduled_date || m.date} at {m.scheduled_time || m.time} ({m.duration_minutes || 30}min)</p>
                      <p>👤 Sender: {m.organizer || m.sender_email || "Default"}</p>
                      {m.attendee_email && <p>📧 Client: {m.attendee_email}</p>}
                      {m.description && <p className="italic text-slate-500">📝 {m.description}</p>}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                      <a
                        href={m.google_meet_link || m.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-750 font-bold"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Join Meet
                      </a>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditClick(m)}
                          className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-xs font-semibold flex items-center gap-1"
                          title="Edit Meeting"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(meetingId)}
                          className="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded text-xs font-semibold flex items-center gap-1"
                          title="Delete Meeting"
                        >
                          🗑️ Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingScheduler;
