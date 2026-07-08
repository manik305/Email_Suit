import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, Recipient, useAppContext } from '../context/AppContext';

interface DataIntegrationPanelProps {
  campaignId: string;
  onRefresh?: () => void;
  onUploadSuccess?: () => void;
}

const REQUIRED_HEADERS = [
  "first name",
  "last name",
  "mail ID",
  "alternative mail ID",
  "title",
  "department",
  "company name",
  "website",
  "LinkedIn ID",
  "industry",
  "state",
  "pin code",
  "country"
];

const DataIntegrationPanel: React.FC<DataIntegrationPanelProps> = ({ campaignId, onRefresh, onUploadSuccess }) => {
  const { refreshData } = useAppContext();
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [leads, setLeads] = useState<Recipient[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch campaign recipients
  const fetchLeads = async () => {
    setLoadingLeads(true);
    try {
      const res = await fetch(`${API_BASE_URL}/data/recipients/by-campaign/${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error("Failed to fetch leads for campaign", err);
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [campaignId]);

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        setFile(droppedFile);
        setStatus(null);
      } else {
        setStatus({ type: 'error', message: 'Unsupported file format. Please upload Excel (.xlsx, .xls) or CSV.' });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus(null);
    }
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const csvContent = REQUIRED_HEADERS.join(",") + "\n" +
      "John,Doe,john.doe@company.com,john.alt@personal.com,Senior Developer,Engineering,Company Inc,https://company.com,linkedin.com/in/johndoe,Software,California,90210,United States\n" +
      "Jane,Smith,jane.smith@enterprise.com,jane.alt@personal.com,Product Manager,Product,Enterprise Corp,https://enterprise.com,linkedin.com/in/janesmith,Technology,New York,10001,United States";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "campaign_leads_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Upload and process the data
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/campaigns/${campaignId}/import-leads`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setStatus({
          type: 'success',
          message: `✨ ${data.rows_added || 0} leads successfully validated and integrated with the campaign!`
        });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchLeads();
        refreshData();
        if (onRefresh) onRefresh();
        if (onUploadSuccess) onUploadSuccess();
      } else {
        setStatus({
          type: 'error',
          message: data.detail || 'Data validation failed. Please check the Excel structure.'
        });
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Network error processing file. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-8 animate-fade-in text-slate-700">
      
      {/* Top section: Intro and Download */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#51A2C3] animate-pulse"></span>
            Strict Excel Validation Engine
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            To ensure high deliverability and precise AI personalization, your Excel sheet must contain exactly the 13 required column headers listed below. Alternative email, state, and LinkedIn links will be automatically verified.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="px-4 py-2.5 bg-white hover:bg-slate-50 text-[#51A2C3] hover:text-[#3F93B5] font-semibold text-xs rounded-xl border border-slate-200 shadow-sm transition-all flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M7 10l5 5m0 0l5-5m-5 5V3"/>
          </svg>
          Download Template
        </button>
      </div>
      
      {/* Visual Schema Data Preview */}
      <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200/60">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span>📊</span>
          Required Database Schema Preview
        </h4>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Ensure your columns correspond exactly to this 13-field sequence. You can download a ready-to-use template, fill it out, and drag-and-drop it into the upload zone below to import your contacts directly into the Supabase database.
        </p>
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-[11px] border-collapse min-w-[1250px] text-slate-700">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-650 font-mono">
                {REQUIRED_HEADERS.map((header) => (
                  <th key={header} className="px-3 py-2.5 font-bold border-r border-slate-200 capitalize">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 font-mono text-slate-600">
                <td className="px-3 py-2.5 border-r border-slate-200">John</td>
                <td className="px-3 py-2.5 border-r border-slate-200">Doe</td>
                <td className="px-3 py-2.5 border-r border-slate-200 text-blue-600">john.doe@company.com</td>
                <td className="px-3 py-2.5 border-r border-slate-200 text-slate-400">john.alt@personal.com</td>
                <td className="px-3 py-2.5 border-r border-slate-200">Senior Developer</td>
                <td className="px-3 py-2.5 border-r border-slate-200">Engineering</td>
                <td className="px-3 py-2.5 border-r border-slate-200">Company Inc</td>
                <td className="px-3 py-2.5 border-r border-slate-200 text-blue-500">https://company.com</td>
                <td className="px-3 py-2.5 border-r border-slate-200 text-blue-500">linkedin.com/in/johndoe</td>
                <td className="px-3 py-2.5 border-r border-slate-200">Software</td>
                <td className="px-3 py-2.5 border-r border-slate-200">California</td>
                <td className="px-3 py-2.5 border-r border-slate-200">90210</td>
                <td className="px-3 py-2.5">United States</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid of upload & list of fields */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: 13 Required Fields (5 cols) */}
        <div className="lg:col-span-5 bg-slate-50/50 border border-slate-200/60 rounded-2xl p-6">
          <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Required Column Headers</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
            {REQUIRED_HEADERS.map((header, idx) => (
              <div key={header} className="flex items-center gap-3 px-3.5 py-2.5 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                  {idx + 1}
                </span>
                <span className="text-xs font-semibold text-slate-700 capitalize">{header}</span>
                <svg className="w-4 h-4 text-emerald-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Upload Target (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-4 min-h-[280px] relative overflow-hidden group ${
              isDragOver 
                ? 'border-blue-400 bg-blue-500/5 shadow-2xl shadow-blue-500/5 scale-[1.01]' 
                : 'border-slate-300 bg-slate-50/10 hover:border-slate-400 hover:bg-slate-100/20'
            }`}
          >
            {/* Visual glow element */}
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-[#51A2C3] group-hover:scale-110 transition-transform shadow-sm">
              <svg className="w-8 h-8 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
            </div>
            
            <div>
              <p className="text-base font-bold text-slate-800">
                {file ? file.name : "Drag & drop your Excel/CSV here"}
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : "Supports XLSX, XLS, and CSV formats"}
              </p>
            </div>

            <button
              type="button"
              className="px-5 py-2 bg-white hover:bg-slate-50 text-slate-650 font-semibold text-xs rounded-xl border border-slate-200 shadow-sm"
            >
              Choose File
            </button>

            <input
              id="data-integration-file-input"
              name="excel_file"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Action and feedback */}
          <div className="space-y-4">
            {status && (
              <div className={`p-4 rounded-xl border text-sm flex gap-3 animate-fade-in ${
                status.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <span className="text-base shrink-0">{status.type === 'success' ? '🚀' : '⚠️'}</span>
                <div className="whitespace-pre-wrap leading-relaxed">{status.message}</div>
              </div>
            )}

            {file && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full py-3.5 bg-gradient-to-r from-[#51A2C3] to-indigo-650 hover:from-[#3f93b5] hover:to-indigo-550 text-white font-bold rounded-2xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-3 text-sm tracking-wide"
              >
                {uploading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Validating & Importing Leads...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Integrate Data & Verify Headers
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Leads Table section */}
      <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h5 className="text-sm font-bold text-slate-800">Integrated Campaign Leads</h5>
            <p className="text-[11px] text-slate-500 mt-0.5">Showing list of validated lead records matching the 13 required parameters</p>
          </div>
          <span className="px-3 py-1 bg-blue-50 text-blue-755 text-xs font-bold rounded-full border border-blue-100">
            {leads.length} leads
          </span>
        </div>

        {loadingLeads ? (
          <div className="p-16 text-center text-slate-500 text-sm">
            <span className="w-6 h-6 border-2 border-slate-300 border-t-[#51A2C3] rounded-full animate-spin inline-block mr-2 align-middle"></span>
            Loading integrated campaign data...
          </div>
        ) : leads.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-sm border-b border-slate-100">
            No integrated leads yet for this campaign. Upload an Excel file with the required headers above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse text-slate-700">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-150">
                  <th className="px-5 py-3.5 font-bold">Contact Name</th>
                  <th className="px-5 py-3.5 font-bold">Emails</th>
                  <th className="px-5 py-3.5 font-bold">Job & Dept</th>
                  <th className="px-5 py-3.5 font-bold">Company & Web</th>
                  <th className="px-5 py-3.5 font-bold">Industry</th>
                  <th className="px-5 py-3.5 font-bold">Location</th>
                  <th className="px-5 py-3.5 font-bold">LinkedIn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {leads.map(lead => (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{lead.name || '—'}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {lead.first_name || '—'} / {lead.last_name || '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{lead.email}</div>
                      {lead.alternative_email && (
                        <div className="text-[10px] text-slate-400 mt-0.5 italic">Alt: {lead.alternative_email}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-700">{lead.designation || '—'}</div>
                      <div className="text-[10px] text-slate-450 mt-0.5">{lead.department || '—'}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-700">{lead.company_name || '—'}</div>
                      {lead.website && (
                        <a 
                          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] text-[#51A2C3] hover:underline mt-0.5 block truncate max-w-[150px]"
                        >
                          {lead.website}
                        </a>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-semibold text-[10px] border border-slate-200">
                        {lead.industry || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-slate-700 font-medium">{lead.region || '—'}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {lead.state || '—'} {lead.pin_code ? `(${lead.pin_code})` : ''}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {lead.linkedin_id ? (
                        <a 
                          href={lead.linkedin_id.startsWith('http') ? lead.linkedin_id : `https://${lead.linkedin_id}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[#51A2C3] hover:text-[#3f93b5] hover:underline flex items-center gap-1 font-semibold"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                          </svg>
                          Profile
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default DataIntegrationPanel;
