import React, { useEffect, useRef, useState } from 'react';
import { useAppContext, API_BASE_URL } from '../context/AppContext';

export const PlotlyDashboard: React.FC = () => {
  const { state } = useAppContext();
  const { campaigns, recipients } = state;
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);
  const industryChartRef = useRef<HTMLDivElement>(null);
  const deptChartRef = useRef<HTMLDivElement>(null);

  const handleExportWordReport = async () => {
    const storedPid = localStorage.getItem('selected_project_id');
    if (!storedPid) return;
    const token = localStorage.getItem('access_token');
    
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${storedPid}/report`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Project_Executive_Report.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert("Failed to download executive report.");
      }
    } catch (err) {
      console.error("Error exporting report:", err);
      alert("Error generating report. Please check server connection.");
    }
  };

  // Load Plotly from CDN dynamically
  useEffect(() => {
    if ((window as any).Plotly) {
      setPlotlyLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-2.32.0.min.js';
    script.async = true;
    script.onload = () => setPlotlyLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Helper to group and normalize departments
  const normalizeDept = (d: string): string => {
    const val = d.trim().toLowerCase();
    if (val.includes('marketing')) return 'Marketing';
    if (val.includes('finance') || val.includes('accounting')) return 'Finance';
    if (val.includes('sales product') || val.includes('product')) return 'Sales Product';
    if (val.includes('sales') || val.includes('bizdev') || val.includes('business development')) return 'Sales';
    if (val.includes('executive') || val.includes('operations') || val.includes('ops') || val.includes('admin')) return 'Executive';
    if (val.includes('it') || val.includes('tech') || val.includes('engineering') || val.includes('information technology')) return 'IT';
    return 'Other';
  };

  // Process data for Industry Verticals and Departments
  const getIndustryData = () => {
    const counts: Record<string, number> = {};
    recipients.forEach(r => {
      const ind = r.industry || 'Unclassified';
      counts[ind] = (counts[ind] || 0) + 1;
    });

    const categories = Object.keys(counts);
    // If database is empty, supply realistic sandbox data
    if (categories.length === 0) {
      return {
        x: ['IT/Tech', 'Healthcare', 'Finance', 'Retail', 'Manufacturing', 'Other'],
        y: [450, 310, 280, 190, 120, 95]
      };
    }

    const sorted = categories.map(cat => ({ name: cat, count: counts[cat] }))
      .sort((a, b) => b.count - a.count);

    if (sorted.length > 5) {
      const top5 = sorted.slice(0, 5);
      const otherCount = sorted.slice(5).reduce((sum, item) => sum + item.count, 0);
      return {
        x: [...top5.map(item => item.name), 'Other'],
        y: [...top5.map(item => item.count), otherCount]
      };
    }

    return {
      x: sorted.map(item => item.name),
      y: sorted.map(item => item.count)
    };
  };

  const getDepartmentData = () => {
    const counts: Record<string, number> = {
      'IT': 0,
      'Marketing': 0,
      'Finance': 0,
      'Sales': 0,
      'Sales Product': 0,
      'Executive': 0,
      'Other': 0
    };

    recipients.forEach(r => {
      const dept = r.department || 'IT';
      const norm = normalizeDept(dept);
      counts[norm] = (counts[norm] || 0) + 1;
    });

    const categoriesOrder = ['IT', 'Marketing', 'Finance', 'Sales', 'Sales Product', 'Executive', 'Other'];

    if (recipients.length === 0) {
      return {
        labels: categoriesOrder,
        values: [420, 290, 350, 180, 150, 220, 90]
      };
    }

    const categories = categoriesOrder.filter(cat => counts[cat] > 0);
    if (categories.length === 0) {
      return {
        labels: categoriesOrder,
        values: [420, 290, 350, 180, 150, 220, 90]
      };
    }

    return {
      labels: categories,
      values: categories.map(cat => counts[cat] || 0)
    };
  };

  // Render 2D Charts
  useEffect(() => {
    if (!plotlyLoaded) return;
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;

    const indData = getIndustryData();
    const deptData = getDepartmentData();

    // 1. Industry 2D Bar Chart
    const industryTrace = {
      x: indData.x,
      y: indData.y,
      type: 'bar',
      marker: {
        color: '#2563eb', // Indigo Blue 600
        opacity: 0.85,
        line: {
          color: '#1d4ed8', // Darker Blue 700
          width: 1
        }
      },
      text: indData.y.map(val => `${val} Leads`),
      textposition: 'auto',
      hoverinfo: 'text'
    };

    const industryLayout = {
      title: {
        text: 'Industry Vertical Lead Analysis',
        font: { family: 'Inter, sans-serif', size: 14, color: '#1e293b', weight: 'bold' }
      },
      autosize: true,
      margin: { l: 50, r: 20, b: 60, t: 40 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      xaxis: { 
        title: 'Industry Vertical', 
        titlefont: { size: 11, color: '#64748b', weight: 'bold' }, 
        tickfont: { size: 9, color: '#64748b' },
        gridcolor: '#e2e8f0'
      },
      yaxis: { 
        title: 'Lead Count', 
        titlefont: { size: 11, color: '#64748b', weight: 'bold' }, 
        tickfont: { size: 9, color: '#64748b' },
        gridcolor: '#e2e8f0'
      }
    };

    // 2. Department 2D Donut (Pie) Chart
    const deptTrace = {
      labels: deptData.labels,
      values: deptData.values,
      type: 'pie',
      hole: 0.45,
      marker: {
        colors: ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#cbd5e1'], // custom indigo-purple palette + grey for Other
      },
      textinfo: 'percent',
      textposition: 'inside',
      hoverinfo: 'label+value+percent'
    };

    const deptLayout = {
      title: {
        text: 'Department Lead Distribution',
        font: { family: 'Inter, sans-serif', size: 14, color: '#1e293b', weight: 'bold' }
      },
      autosize: true,
      margin: { l: 20, r: 20, b: 20, t: 40 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      showlegend: true,
      legend: {
        orientation: 'h',
        y: -0.1,
        font: { size: 10, color: '#64748b' }
      }
    };

    const config = { responsive: true, displayModeBar: false };

    if (industryChartRef.current) {
      Plotly.newPlot(industryChartRef.current, [industryTrace], industryLayout, config);
    }
    if (deptChartRef.current) {
      Plotly.newPlot(deptChartRef.current, [deptTrace], deptLayout, config);
    }

    // Resize listener
    const handleResize = () => {
      if (industryChartRef.current) Plotly.Plots.resize(industryChartRef.current);
      if (deptChartRef.current) Plotly.Plots.resize(deptChartRef.current);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [plotlyLoaded, campaigns, recipients]);

  return (
    <div className="space-y-8">
      {/* Table section listing campaigns & database data info */}
      <div className="glass-panel p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Outbound Campaigns Database</h3>
            <p className="text-xs text-slate-500 mt-1">Real-time status of marketing sequences and list sizes</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportWordReport}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-[0.99] transition-all flex items-center gap-2"
            >
              📄 Export Executive Word Report
            </button>
            <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold border border-blue-100">
              Total: {campaigns.length} Campaigns
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                <th className="pb-3 pt-2 font-bold">Campaign Name</th>
                <th className="pb-3 pt-2 font-bold">Target Segment</th>
                <th className="pb-3 pt-2 font-bold">Linked Mailer</th>
                <th className="pb-3 pt-2 font-bold">Created Date</th>
                <th className="pb-3 pt-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                    No campaigns created yet. Start by setting up a campaign.
                  </td>
                </tr>
              ) : (
                campaigns.map(c => (
                  <tr key={c.id} className="text-slate-700 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 font-semibold text-slate-900">{c.name}</td>
                    <td className="py-3 text-slate-500">{c.target_segment || 'All Leads'}</td>
                    <td className="py-3 text-slate-500">{c.email_config_id ? '✔️ Linked' : '❌ Unlinked'}</td>
                    <td className="py-3 text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                        c.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' 
                          : 'bg-slate-100 text-slate-650 border border-slate-200'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2D Graphical Representation (Plotly 2D visual panels) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Industry verticals chart panel */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[360px] bg-white border border-slate-200/60 shadow-sm">
          {!plotlyLoaded ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 text-sm">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-4" />
              Loading Graph Plotter...
            </div>
          ) : (
            <div ref={industryChartRef} className="w-full h-full min-h-[320px]" />
          )}
        </div>

        {/* Contacts department spread panel */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[360px] bg-white border border-slate-200/60 shadow-sm">
          {!plotlyLoaded ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 text-sm">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-purple-500 rounded-full animate-spin mb-4" />
              Loading Graph Plotter...
            </div>
          ) : (
            <div ref={deptChartRef} className="w-full h-full min-h-[320px]" />
          )}
        </div>
      </div>
    </div>
  );
};
