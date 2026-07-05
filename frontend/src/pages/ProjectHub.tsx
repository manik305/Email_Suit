import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import digioClickLogo from '../assets/Digio-click-logo.jpeg';

const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
const API_BASE_URL = isLocalDev ? 'http://localhost:8000/api/v1' : '/api/v1';

interface Project {
  id: string;
  name: string;
  created_at: string;
}

interface ProjectMember {
  id: string;
  user_id: string;
  user_email?: string;
  project_id: string;
  role: string;
  created_at: string;
}

const ProjectHubPage: React.FC = () => {
  const navigate = useNavigate();
  const authLevel = localStorage.getItem('auth_level');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMembers, setProjectMembers] = useState<Record<string, ProjectMember[]>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Email input and role states for adding members per project
  const [memberEmailInputs, setMemberEmailInputs] = useState<Record<string, string>>({});
  const [memberRoleInputs, setMemberRoleInputs] = useState<Record<string, string>>({});

  // Strict route guard: only admins/super admins can access this page
  useEffect(() => {
    if (authLevel !== 'admin') {
      navigate('/dashboard');
    }
  }, [authLevel, navigate]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchProjectsAndMembers = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/projects/`, { headers });
      if (!res.ok) throw new Error('Failed to load projects list.');
      
      const data: Project[] = await res.json();
      setProjects(data);

      // Fetch members for each project
      const membersMap: Record<string, ProjectMember[]> = {};
      await Promise.all(
        data.map(async (p) => {
          try {
            const mRes = await fetch(`${API_BASE_URL}/projects/${p.id}/members`, { headers });
            if (mRes.ok) {
              const mData = await mRes.json();
              membersMap[p.id] = mData;
            }
          } catch (err) {
            console.error(`Error loading members for project ${p.id}`, err);
          }
        })
      );
      setProjectMembers(membersMap);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error connecting to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLevel === 'admin') {
      fetchProjectsAndMembers();
    }
  }, [authLevel]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setSubmitting(true);
    setErrorMessage('');
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/projects/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: newProjectName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Could not create project.');
      }

      showToast(`📁 Project "${newProjectName}" created successfully!`);
      setNewProjectName('');
      await fetchProjectsAndMembers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating project.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (projectId: string) => {
    const email = memberEmailInputs[projectId] || '';
    const role = memberRoleInputs[projectId] || 'member';

    if (!email.trim()) return;

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to assign member access.');
      }

      showToast(`👤 Member "${email}" assigned access successfully!`);
      
      // Clear inputs
      setMemberEmailInputs(prev => ({ ...prev, [projectId]: '' }));
      
      // Refresh data
      await fetchProjectsAndMembers();
    } catch (err: any) {
      alert(err.message || 'Error assigning project access.');
    }
  };

  const handleRemoveMember = async (projectId: string, userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to revoke access for "${email}"?`)) return;

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error('Failed to revoke access.');

      showToast(`🗑️ Revoked access for "${email}".`);
      await fetchProjectsAndMembers();
    } catch (err: any) {
      alert(err.message || 'Error revoking access.');
    }
  };

  const handleEnterProject = (projectId: string) => {
    localStorage.setItem('selected_project_id', projectId);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen w-full p-6 md:p-12 font-inter relative overflow-hidden bg-[#E2EFEC] flex flex-col items-center justify-start" style={{
      backgroundImage: `
        radial-gradient(at 0% 0%, #E3EFE5 0px, transparent 50%),
        radial-gradient(at 50% 0%, #FAF6EA 0px, transparent 50%),
        radial-gradient(at 100% 0%, #E5EEF0 0px, transparent 50%),
        radial-gradient(at 100% 100%, #FAF6EA 0px, transparent 50%),
        radial-gradient(at 0% 100%, #E2EDF2 0px, transparent 50%)
      `
    }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[100] px-5 py-3 bg-[#FCFAF5] border border-[#E2DCBE] rounded-xl text-sm text-slate-800 shadow-xl animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* Header Info */}
      <div className="w-full max-w-6xl mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <img src={digioClickLogo} alt="Digio Click Logo" className="w-8 h-8 object-contain rounded-lg shadow-sm border border-slate-100 bg-white p-0.5" />
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-none">Digio Click</h1>
              <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold block mt-0.5">Project Selection Hub</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('auth_level');
            localStorage.removeItem('user_email');
            window.location.href = '/';
          }}
          className="px-4 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition active:scale-[0.98] shadow-sm"
        >
          Logout
        </button>
      </div>

      {/* Page Title */}
      <div className="text-center mb-10 max-w-xl">
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Active Workspaces</h2>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          Create business projects, manage agent member permissions, or select a workspace to launch outreach campaigns.
        </p>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: PROJECTS GRID (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-6">
          {loading ? (
            <div className="text-center p-16 bg-white rounded-3xl border border-slate-200 shadow-sm text-slate-500 font-semibold text-sm">
              Loading active workspaces...
            </div>
          ) : errorMessage ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-semibold">
              ⚠️ {errorMessage}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center p-16 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
              No projects created yet. Use the project builder on the right to start.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.map((p) => {
                const members = projectMembers[p.id] || [];
                return (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between h-[360px]">
                    <div className="space-y-4">
                      
                      {/* Project Meta */}
                      <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                        <div>
                          <h3 className="text-base font-bold text-slate-800 tracking-tight line-clamp-1">{p.name}</h3>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Created: {new Date(p.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-[9px] uppercase tracking-wider">
                          Active
                        </span>
                      </div>

                      {/* Access List / Member lookup */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Granted Access List ({members.length})</span>
                        
                        <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                          {members.length === 0 ? (
                            <span className="text-[10px] text-slate-400 italic">No team members assigned access yet.</span>
                          ) : (
                            members.map((m) => (
                              <div key={m.id} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-1.5 rounded-xl text-xs">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[10px] truncate font-medium text-slate-600" title={m.user_email}>
                                    {m.user_email}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                    m.role === 'manager' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {m.role}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleRemoveMember(p.id, m.user_id, m.user_email || 'Unknown')}
                                  className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded"
                                  title="Revoke access"
                                >
                                  ✕
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Member Add and Action button container */}
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      
                      {/* Inline Grant Access form */}
                      <div className="flex gap-1.5">
                        <input
                          type="email"
                          placeholder="Team member work email"
                          value={memberEmailInputs[p.id] || ''}
                          onChange={(e) => setMemberEmailInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#4BA7C9]"
                        />
                        <select
                          value={memberRoleInputs[p.id] || 'member'}
                          onChange={(e) => setMemberRoleInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="bg-white border border-slate-200 rounded-lg px-1 text-[10px] font-semibold text-slate-600 focus:outline-none"
                        >
                          <option value="member">Member</option>
                          <option value="manager">Manager</option>
                        </select>
                        <button
                          onClick={() => handleAddMember(p.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-[10px] transition"
                        >
                          Grant
                        </button>
                      </div>

                      {/* Enter workspace button */}
                      <button
                        onClick={() => handleEnterProject(p.id)}
                        className="w-full py-2.5 bg-[#51A2C3] hover:bg-[#3F93B5] text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                      >
                        Enter Workspace →
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: PROJECT BUILDER (lg:col-span-4) */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-xl">📁</span>
              <h3 className="text-base font-bold text-slate-800">Workspace Builder</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Create a new client or business campaign project boundary. This scopes SMTP relays, contact lists, and scheduled sequences separately.
            </p>

            <form onSubmit={handleCreateProject} className="space-y-4 pt-2">
              <div className="space-y-1 text-xs">
                <label htmlFor="projectName" className="block font-bold text-slate-500 uppercase tracking-wider">Project Name *</label>
                <input
                  required
                  id="projectName"
                  type="text"
                  placeholder="e.g. EU outreach segment"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4BA7C9] focus:border-[#4BA7C9]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-750 text-white font-bold rounded-xl text-xs transition shadow-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
              >
                {submitting ? 'Creating Workspace...' : 'Create Project Workspace'}
              </button>
            </form>
          </div>
        </div>

      </div>

    </div>
  );
};

export default ProjectHubPage;
