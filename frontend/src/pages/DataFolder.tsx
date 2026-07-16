import React, { useState, useEffect } from 'react';
import { useAppContext, API_BASE_URL } from '../context/AppContext';

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

// Suggestions and lookup data
const SUGGESTED_REGIONS = ["US", "IN", "EU", "CA", "UK"];

const ECONOMIC_SECTORS = [
  {
    sector: "Primary Sector (Extraction of Raw Materials)",
    industries: [
      "Agriculture, Forestry & Fishing", "Farming", "crop production", "logging", "commercial fishing", "aquaculture",
      "Mining, Quarrying & Extraction", "Oil and gas extraction", "coal mining", "metal ore mining", "non-metallic mineral mining"
    ]
  },
  {
    sector: "Secondary Sector (Manufacturing & Construction)",
    industries: [
      "Manufacturing", "Heavy Industry", "Automotive", "aerospace", "shipbuilding", "steel", "heavy machinery",
      "Light/Consumer Goods", "Food and beverage", "textiles", "apparel", "electronics", "pharmaceuticals", "chemicals",
      "Construction", "Residential building", "commercial and industrial construction", "civil engineering", "infrastructure",
      "Utilities", "Electricity generation and distribution", "natural gas supply", "water treatment", "waste management"
    ]
  },
  {
    sector: "Tertiary Sector (Services & Commerce)",
    industries: [
      "Finance & Insurance", "Banking", "investment management", "venture capital", "insurance underwriting", "fintech",
      "Healthcare & Social Assistance", "Hospitals", "medical clinics", "pharmaceuticals", "biotechnology", "eldercare", "mental health services",
      "Retail & Wholesale Trade", "E-commerce", "supermarkets", "apparel stores", "distribution networks", "merchant wholesalers",
      "Transportation & Logistics", "Aviation", "maritime shipping", "rail transport", "trucking", "warehousing", "postal and courier services",
      "Hospitality, Tourism & Food Services", "Hotels", "resorts", "travel agencies", "restaurants", "cafes", "event planning",
      "Education & Training", "K-12 schooling", "universities", "vocational training", "corporate learning", "EdTech",
      "Real Estate & Professional Services", "Property management", "consulting (management, strategy, tax)", "legal services", "architecture",
      "Entertainment & Media", "Film and television production", "music industry", "news publishing", "video games", "broadcasting"
    ]
  },
  {
    sector: "Quaternary Sector (Knowledge & Information Technology)",
    industries: [
      "Information Technology (IT) & Software", "Software-as-a-Service (SaaS)", "cloud computing", "cybersecurity", "artificial intelligence", "hardware design",
      "Research & Development (R&D)", "Scientific laboratories", "biotechnology research", "aerospace exploration", "materials science",
      "Telecommunications", "Network providers", "satellite communications", "fiber optics", "wireless infrastructure"
    ]
  }
];

const ORGANIZATIONAL_DEPARTMENTS = [
  { name: "Administration & Governance", desc: "Executive oversight and corporate steering" },
  { name: "Finance & Accounting", desc: "Capital management and financial health" },
  { name: "Human Resources (HR) & People", desc: "Workforce management and company culture" },
  { name: "Sales & Business Development", desc: "Revenue generation and customer acquisition" },
  { name: "Marketing & Communications", desc: "Brand awareness and market positioning" },
  { name: "Engineering & Product", desc: "Creating and maintaining products/services" },
  { name: "Operations & Supply Chain", desc: "Day-to-day business delivery" },
  { name: "Legal, Risk & Compliance", desc: "Legal protection and regulatory adherence" },
  { name: "Customer Success & Support", desc: "Post-purchase customer relations" },
  { name: "Research & Development (R&D)", desc: "Innovation and future product pipeline" }
];

const HIERARCHICAL_JOB_TITLES = [
  {
    level: "Executive & C-Suite Leadership (Strategic Level)",
    titles: [
      "Chief Executive Officer (CEO)", "Managing Director", "President",
      "Chief Operating Officer (COO)", "Chief Financial Officer (CFO)",
      "Chief Technology Officer (CTO)", "Chief Information Officer (CIO)",
      "Chief Marketing Officer (CMO)",
      "Chief People Officer (CPO)", "Chief Human Resources Officer (CHRO)",
      "General Counsel", "Chief Legal Officer (CLO)"
    ]
  },
  {
    level: "Vice Presidents & Directors (Tactical/Director Level)",
    titles: [
      "Vice President (VP) of Department", "VP of Sales", "VP of Engineering", "VP of Finance",
      "Executive / Senior VP (EVP/SVP)", "Director of Function",
      "Director of Product", "Director of Talent Acquisition", "Director of Operations",
      "Regional Director", "General Manager"
    ]
  },
  {
    level: "Managers & Team Leads (Operational Level)",
    titles: [
      "Senior Manager", "Manager of Team", "Engineering Manager", "Marketing Manager", "Accounting Manager",
      "Team Lead", "Supervisor", "Project Manager (PM)", "Program Manager"
    ]
  },
  {
    level: "Senior & Mid-Level Professionals (Individual Contributors)",
    titles: [
      "Senior Specialist", "Senior Engineer", "Senior Software Engineer", "Senior Analyst", "Senior Financial Analyst",
      "Mid-Level Specialist", "Professional", "Software Engineer", "Marketing Specialist", "HR Generalist", "Accountant"
    ]
  },
  {
    level: "Entry-Level & Junior Roles (Supportive/Learning Level)",
    titles: [
      "Junior Role", "Associate", "Junior Developer", "HR Associate", "Sales Representative", "Marketing Assistant",
      "Coordinator", "Project Coordinator", "Administrative Officer", "Intern", "Apprentice"
    ]
  }
];

const DataFolderPage: React.FC = () => {
  const { state, uploadFileToBackend, refreshData } = useAppContext();
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast]           = useState<string|null>(null);
  
  // Campaign LQP target constraints state
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [targetTitles, setTargetTitles] = useState<string[]>([]);
  const [targetDepts, setTargetDepts] = useState<string[]>([]);
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [targetRegion, setTargetRegion] = useState<string>('US');
  const [isLqpActive, setIsLqpActive] = useState(false);

  // Search filter states
  const [searchTitleQuery, setSearchTitleQuery] = useState('');
  const [searchDeptQuery, setSearchDeptQuery] = useState('');
  const [searchIndQuery, setSearchIndQuery] = useState('');

  // Custom text input states
  const [customTitleInput, setCustomTitleInput] = useState('');
  const [customDeptInput, setCustomDeptInput] = useState('');
  const [customIndInput, setCustomIndInput] = useState('');

  // Spreadsheet row state
  const [spreadsheetRows, setSpreadsheetRows] = useState<any[]>([]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // Sync spreadsheet rows with backend recipients when campaign or backend state changes
  useEffect(() => {
    let filtered = [...state.recipients];
    if (selectedCampaignId) {
      filtered = filtered.filter(r => r.campaign_id === selectedCampaignId);
    }
    setSpreadsheetRows(filtered);
  }, [state.recipients, selectedCampaignId]);

  // Sync initial target criteria when campaign is selected
  useEffect(() => {
    if (selectedCampaignId) {
      const camp = state.campaigns.find(c => c.id === selectedCampaignId);
      if (camp) {
        setTargetRegion(camp.target_region || 'US');
        setTargetTitles(camp.icp_titles || []);
        setTargetDepts(camp.icp_departments || []);
        setTargetIndustries(camp.icp_industries || []);
        setIsLqpActive(!!camp.icp_active);
      }
    } else {
      setTargetTitles([]);
      setTargetDepts([]);
      setTargetIndustries([]);
      setIsLqpActive(false);
    }
  }, [selectedCampaignId, state.campaigns]);

  // Save LQP Target settings
  const handleSaveLqpSettings = async () => {
    if (!selectedCampaignId) {
      alert('Please select a campaign first.');
      return;
    }
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/campaigns/${selectedCampaignId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          icp_titles: targetTitles,
          icp_departments: targetDepts,
          icp_industries: targetIndustries,
          target_region: targetRegion,
          icp_active: isLqpActive,
        }),
      });

      if (res.ok) {
        showToast('✅ Campaign LQP Target Settings saved successfully!');
        await refreshData();
      } else {
        const errText = await res.text();
        showToast(`❌ Failed to save LQP settings: ${errText}`);
      }
    } catch (err) {
      console.error(err);
      showToast('❌ Network error saving LQP settings.');
    }
  };

  // Toggle helpers
  const toggleTitleSelection = (title: string) => {
    setTargetTitles(prev => prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]);
  };

  const toggleDeptSelection = (dept: string) => {
    setTargetDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  };

  const toggleIndustrySelection = (ind: string) => {
    setTargetIndustries(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]);
  };

  // Handle cell edits in the local spreadsheet state
  const handleCellChange = (rowId: string, field: string, value: string) => {
    setSpreadsheetRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  // Check if a row violates campaign target LQP bounds
  const checkLqpViolation = (row: any) => {
    if (!isLqpActive) return { isViolated: false, reason: '' };

    const titleVal = (row.title || row.designation || '').trim().toLowerCase();
    const deptVal = (row.department || '').trim().toLowerCase();
    const countryVal = (row.country || '').trim().toLowerCase();
    const stateVal = (row.state || '').trim().toLowerCase();
    const indVal = (row.industry || '').trim().toLowerCase();

    // Check titles
    if (targetTitles.length > 0 && titleVal !== '') {
      const matchedTitle = targetTitles.some(t => titleVal.includes(t.toLowerCase()) || t.toLowerCase().includes(titleVal));
      if (!matchedTitle) {
        return { isViolated: true, reason: `Title "${row.title || row.designation}" does not match target profile bounds.` };
      }
    }

    // Check departments
    if (targetDepts.length > 0 && deptVal !== '') {
      const matchedDept = targetDepts.some(d => deptVal.includes(d.toLowerCase()) || d.toLowerCase().includes(deptVal));
      if (!matchedDept) {
        return { isViolated: true, reason: `Department "${row.department}" does not match target departments.` };
      }
    }

    // Check industries
    if (targetIndustries.length > 0 && indVal !== '') {
      const matchedInd = targetIndustries.some(i => indVal.includes(i.toLowerCase()) || i.toLowerCase().includes(indVal));
      if (!matchedInd) {
        return { isViolated: true, reason: `Industry "${row.industry}" does not match target industries.` };
      }
    }

    // Check region (state/country)
    if (targetRegion && (countryVal !== '' || stateVal !== '')) {
      const isRegionMatch = countryVal.includes(targetRegion.toLowerCase()) || 
                            targetRegion.toLowerCase().includes(countryVal) ||
                            stateVal.includes(targetRegion.toLowerCase()) ||
                            targetRegion.toLowerCase().includes(stateVal);
      if (!isRegionMatch) {
        return { isViolated: true, reason: `Region/Country does not match target region "${targetRegion}".` };
      }
    }

    return { isViolated: false, reason: '' };
  };

  // Add row to spreadsheet grid
  const handleAddRow = () => {
    const newRow = {
      id: `new-${Date.now()}`,
      first_name: '',
      last_name: '',
      email: '',
      alternative_email: '',
      title: '',
      department: '',
      company_name: '',
      website: '',
      linkedin_url: '',
      industry: '',
      state: '',
      zip_code: '',
      country: '',
      campaign_id: selectedCampaignId || null,
      status: 'pending'
    };
    setSpreadsheetRows(prev => [newRow, ...prev]);
  };

  // Save row changes to backend database
  const handleSaveRow = async (row: any) => {
    if (!row.email || !row.email.includes('@')) {
      showToast('❌ Invalid email address.');
      return;
    }

    const { isViolated, reason } = checkLqpViolation(row);
    if (isViolated) {
      alert(`⚠️ Validation Error: Database entry violates campaign LQP constraints.\n\nDetails: ${reason}`);
      return;
    }

    try {
      const isNew = String(row.id).startsWith('new-');
      const url = isNew 
        ? `${API_BASE_URL}/data/recipients`
        : `${API_BASE_URL}/data/recipients/${row.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const payload = {
        email: row.email,
        name: row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        alternative_email: row.alternative_email || null,
        title: row.title || row.designation || null,
        department: row.department || null,
        company_name: row.company_name || null,
        website: row.website || null,
        linkedin_url: row.linkedin_url || row.linkedin_id || null,
        industry: row.industry || null,
        state: row.state || null,
        zip_code: row.zip_code || row.pin_code || null,
        country: row.country || null,
        campaign_id: row.campaign_id || null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast('✅ Lead database record saved.');
        await refreshData();
      } else {
        const err = await res.json();
        showToast(`❌ Failed to save: ${err.detail || 'Server error'}`);
      }
    } catch {
      showToast('❌ Network error saving database record.');
    }
  };

  // Delete row
  const handleDeleteRow = async (id: string) => {
    if (String(id).startsWith('new-')) {
      setSpreadsheetRows(prev => prev.filter(r => r.id !== id));
      return;
    }

    if (!window.confirm("Are you sure you want to delete this lead record?")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/data/recipients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('🗑️ Lead record deleted successfully.');
        await refreshData();
      } else {
        showToast('❌ Failed to delete lead.');
      }
    } catch {
      showToast('❌ Network error during deletion.');
    }
  };

  // Download Blank CSV Template
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

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  const handleUpload = async (file: File) => {
    showToast('⏳ Uploading and processing leads...');
    try {
      const res = await uploadFileToBackend(file, selectedCampaignId);
      if (res && res.success) {
        showToast(`✅ Ingestion complete: Added ${res.rows_added} leads. Skipped ${res.duplicates_skipped} duplicates.`);
      } else {
        showToast(`❌ Upload failed: ${res?.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      showToast(`❌ Upload failed: ${err.message || 'Error'}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    if (!selectedCampaignId) {
      showToast('❌ Please select a campaign before uploading leads.');
      return;
    }
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCampaignId) {
      showToast('❌ Please select a campaign before uploading leads.');
      return;
    }
    if (e.target.files?.[0]) handleUpload(e.target.files[0]);
  };


  const handleResetDatabase = async () => {
    if (!window.confirm("⚠️ WARNING: Are you sure you want to completely wipe all tables and reset the database? All campaigns, leads, and configs will be permanently deleted. This cannot be undone.")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/data/database/reset`, { method: 'DELETE' });
      if (res.ok) {
        await refreshData();
        showToast('🗑️ Database has been successfully reset.');
      } else {
        const err = await res.json();
        showToast(`❌ Reset failed: ${err.detail || 'unknown error'}`);
      }
    } catch {
      showToast('❌ Failed to reset database.');
    }
  };

  return (
    <div className="space-y-6 pb-20 text-slate-700">
      {toast && (
        <div className="fixed top-6 right-6 z-[100] px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 shadow-xl animate-fade-in">
          {toast}
        </div>
      )}

      {/* Top Header Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600">
            Lead Data Hub
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Upload spreadsheets or configure target Lead Qualification Profiles (LQP).</p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-blue-600 font-bold text-xs rounded-xl border border-slate-200 shadow-sm transition-all flex items-center gap-2"
          >
            📥 Blank CSV Template
          </button>
          <button
            onClick={handleResetDatabase}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl border border-rose-200 transition-all flex items-center gap-2"
          >
            🗑️ Reset Database
          </button>
        </div>
      </div>

      {/* Campaign LQP Targeting Configuration Panel */}
      <div className="glass-panel p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>⚙️</span> Campaign Lead Qualification Profile (LQP) Target Settings
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Filter inbound leads by checking titles, departments, industries and regions.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${isLqpActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
              {isLqpActive ? 'Target LQP Verified' : 'Inbound Filters Idle'}
            </span>
            <button
              onClick={handleSaveLqpSettings}
              disabled={!selectedCampaignId}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
            >
              💾 Save Target LQP
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Campaign Selector & Settings */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-650 mb-1.5 uppercase tracking-wide">Select Campaign</label>
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- View All Leads --</option>
                {state.campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-650 mb-1.5 uppercase tracking-wide">Target Region / Country</label>
              <select
                value={targetRegion}
                onChange={e => setTargetRegion(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SUGGESTED_REGIONS.map(reg => (
                  <option key={reg} value={reg}>{reg} (Regional Match)</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-700">Enforce LQP Validation</span>
              <button
                type="button"
                onClick={() => setIsLqpActive(!isLqpActive)}
                disabled={!selectedCampaignId}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isLqpActive ? 'bg-blue-650' : 'bg-slate-300'} disabled:opacity-50`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isLqpActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Target Job Titles Lookup */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col h-[270px]">
            <label className="block text-xs font-bold text-slate-650 mb-1.5 uppercase tracking-wide">Target Job Titles</label>
            <input
              type="text"
              placeholder="🔍 Search suggested titles..."
              value={searchTitleQuery}
              onChange={(e) => setSearchTitleQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 mb-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {HIERARCHICAL_JOB_TITLES.map((group) => {
                const filteredTitles = group.titles.filter(t => t.toLowerCase().includes(searchTitleQuery.toLowerCase()));
                if (filteredTitles.length === 0) return null;
                return (
                  <div key={group.level} className="space-y-1">
                    <span className="text-[9px] font-extrabold text-slate-450 uppercase tracking-wider block">{group.level}</span>
                    <div className="flex flex-wrap gap-1">
                      {filteredTitles.map(title => {
                        const isSelected = targetTitles.includes(title);
                        return (
                          <button
                            type="button"
                            key={title}
                            onClick={() => toggleTitleSelection(title)}
                            className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-100'}`}
                          >
                            {title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200">
              <input
                type="text"
                placeholder="Add custom title..."
                value={customTitleInput}
                onChange={(e) => setCustomTitleInput(e.target.value)}
                className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const val = customTitleInput.trim();
                  if (val && !targetTitles.includes(val)) {
                    setTargetTitles(prev => [...prev, val]);
                    setCustomTitleInput('');
                  }
                }}
                className="p-1 px-2.5 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-750"
              >
                +
              </button>
            </div>
          </div>

          {/* Target Departments Lookup */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col h-[270px]">
            <label className="block text-xs font-bold text-slate-650 mb-1.5 uppercase tracking-wide">Target Departments</label>
            <input
              type="text"
              placeholder="🔍 Search departments..."
              value={searchDeptQuery}
              onChange={(e) => setSearchDeptQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 mb-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {ORGANIZATIONAL_DEPARTMENTS.filter(d => d.name.toLowerCase().includes(searchDeptQuery.toLowerCase())).map((dept) => {
                const isSelected = targetDepts.includes(dept.name);
                return (
                  <button
                    type="button"
                    key={dept.name}
                    title={dept.desc}
                    onClick={() => toggleDeptSelection(dept.name)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-bold border transition flex justify-between items-center ${isSelected ? 'bg-indigo-650 text-white border-indigo-650 bg-indigo-600' : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-100'}`}
                  >
                    <span>{dept.name}</span>
                    <span className="text-[8px] opacity-75 font-normal ml-2 truncate max-w-[120px]">{dept.desc}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200">
              <input
                type="text"
                placeholder="Add custom dept..."
                value={customDeptInput}
                onChange={(e) => setCustomDeptInput(e.target.value)}
                className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const val = customDeptInput.trim();
                  if (val && !targetDepts.includes(val)) {
                    setTargetDepts(prev => [...prev, val]);
                    setCustomDeptInput('');
                  }
                }}
                className="p-1 px-2.5 bg-indigo-600 text-white font-bold rounded-lg text-xs hover:bg-indigo-750"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Target Industries Selector */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col h-[270px]">
          <label className="block text-xs font-bold text-slate-650 mb-1.5 uppercase tracking-wide">Target Industries (Economy Sectors)</label>
          <input
            type="text"
            placeholder="🔍 Search sectors or industries..."
            value={searchIndQuery}
            onChange={(e) => setSearchIndQuery(e.target.value)}
            className="w-full px-2.5 py-1.5 mb-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {ECONOMIC_SECTORS.map((group) => {
              const filteredInds = group.industries.filter(i => i.toLowerCase().includes(searchIndQuery.toLowerCase()));
              if (filteredInds.length === 0) return null;
              return (
                <div key={group.sector} className="space-y-1">
                  <span className="text-[9px] font-extrabold text-slate-450 uppercase tracking-wider block">{group.sector}</span>
                  <div className="flex flex-wrap gap-1">
                    {filteredInds.map(ind => {
                      const isSelected = targetIndustries.includes(ind);
                      return (
                        <button
                          type="button"
                          key={ind}
                          onClick={() => toggleIndustrySelection(ind)}
                          className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition ${isSelected ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-100'}`}
                        >
                          {ind}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200">
            <input
              type="text"
              placeholder="Add custom industry..."
              value={customIndInput}
              onChange={(e) => setCustomIndInput(e.target.value)}
              className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => {
                const val = customIndInput.trim();
                if (val && !targetIndustries.includes(val)) {
                  setTargetIndustries(prev => [...prev, val]);
                  setCustomIndInput('');
                }
              }}
              className="p-1 px-2.5 bg-sky-600 text-white font-bold rounded-lg text-xs hover:bg-sky-750"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Spreadsheet / Lead Database Grid */}
      <div className="glass-panel rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
        {/* Table Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-slate-800">Spreadsheet Lead Editor</h2>
            <p className="text-xs text-slate-500 mt-0.5">Double-click or type inside cells to edit database records directly</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddRow}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-md"
            >
              ➕ Add Lead Row
            </button>
          </div>
        </div>

        {/* Excel Interactive Spreadsheet Grid */}
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] border-slate-250">
          <table className="w-full text-left text-[11px] border-collapse min-w-[1550px]">
            <thead>
              <tr className="bg-slate-100/90 text-slate-500 font-mono text-[10px] uppercase font-bold sticky top-0 z-10 border-b border-slate-200">
                <th className="px-3 py-2 border-r border-slate-200 w-12 text-center">Row</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[110px]">First Name</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[110px]">Last Name</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[180px]">Mail ID</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[180px]">Alternative Mail</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[130px]">Title (Designation)</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[120px]">Department</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[130px]">Company Name</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[130px]">Website</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[140px]">LinkedIn ID</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[110px]">Industry</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[80px]">State</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[80px]">Pin Code</th>
                <th className="px-3 py-2 border-r border-slate-200 w-[90px]">Country</th>
                <th className="px-3 py-2 w-[160px] text-center">Spreadsheet Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {spreadsheetRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400 font-medium">
                    No matching database records found. Click "Add Lead Row" above to start entering details.
                  </td>
                </tr>
              ) : (
                spreadsheetRows.map((row, index) => {
                  const { isViolated, reason } = checkLqpViolation(row);
                  return (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-slate-50 transition-colors ${isViolated ? 'bg-rose-50/50 hover:bg-rose-50' : ''}`}
                    >
                      {/* Row Index */}
                      <td className="px-3 py-1.5 border-r border-slate-150 text-center font-mono text-slate-400 bg-slate-50/30">
                        {index + 1}
                      </td>

                      {/* First Name Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.first_name || ''}
                          onChange={e => handleCellChange(row.id, 'first_name', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Last Name Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.last_name || ''}
                          onChange={e => handleCellChange(row.id, 'last_name', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Mail ID Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.email || ''}
                          onChange={e => handleCellChange(row.id, 'email', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent font-medium text-slate-900"
                        />
                      </td>

                      {/* Alt Mail ID Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.alternative_email || ''}
                          onChange={e => handleCellChange(row.id, 'alternative_email', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Title Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.title || row.designation || ''}
                          onChange={e => handleCellChange(row.id, 'title', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Department Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.department || ''}
                          onChange={e => handleCellChange(row.id, 'department', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent font-semibold"
                        />
                      </td>

                      {/* Company Name Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.company_name || ''}
                          onChange={e => handleCellChange(row.id, 'company_name', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Website Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.website || ''}
                          onChange={e => handleCellChange(row.id, 'website', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent text-blue-600 underline"
                        />
                      </td>

                      {/* LinkedIn Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.linkedin_url || row.linkedin_id || ''}
                          onChange={e => handleCellChange(row.id, 'linkedin_url', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent text-slate-500"
                        />
                      </td>

                      {/* Industry Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.industry || ''}
                          onChange={e => handleCellChange(row.id, 'industry', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* State Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.state || ''}
                          onChange={e => handleCellChange(row.id, 'state', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Pin Code Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.zip_code || row.pin_code || ''}
                          onChange={e => handleCellChange(row.id, 'zip_code', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Country Cell */}
                      <td className="p-0 border-r border-slate-150">
                        <input
                          type="text"
                          value={row.country || ''}
                          onChange={e => handleCellChange(row.id, 'country', e.target.value)}
                          className="w-full h-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-blue-500 bg-transparent"
                        />
                      </td>

                      {/* Row Actions & Error Indicators */}
                      <td className="px-3 py-1 text-center flex items-center justify-center gap-2">
                        {isViolated ? (
                          <span 
                            className="text-red-500 font-bold cursor-help text-[13px]" 
                            title={`LQP Violation: ${reason}`}
                          >
                            ⚠️
                          </span>
                        ) : null}
                        <button
                          onClick={() => handleSaveRow(row)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-[9px]"
                          title="Save changes to DB"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[9px]"
                          title="Delete Lead"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Drag and Drop Lead Importer Box */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span>📂</span> Import Bulk Lead Sheets
        </h3>
        <div
          className={`p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all duration-300 ${dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-slate-300 hover:border-slate-400 bg-slate-50/20'}`}
          onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        >
          <input id="bulk-lead-file" type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleChange}/>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-500">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
          </div>
          <h4 className="text-sm font-bold mb-1 text-slate-800">Drop your CSV/Excel lead list here</h4>
          <p className="text-slate-500 mb-4 text-[11px]">Supports sheets matching the 13 required headers shown above.</p>
          <button 
            onClick={() => document.getElementById('bulk-lead-file')?.click()}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 active:scale-[0.99]"
          >
            Select Spreadsheet File
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataFolderPage;
