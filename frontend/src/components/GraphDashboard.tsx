import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../context/AppContext';

interface GraphNode {
  id: string;
  label: string;
  type: 'campaign' | 'company' | 'department' | 'title' | 'lead';
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  parentId?: string;
  properties?: any;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: any;
}

export const GraphDashboard: React.FC<{ campaignId: string; projectId?: string }> = ({ campaignId, projectId }) => {
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<GraphEdge[]>([]);
  
  const [hierarchyNodes, setHierarchyNodes] = useState<GraphNode[]>([]);
  const [hierarchyEdges, setHierarchyEdges] = useState<GraphEdge[]>([]);
  
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'hot' | 'lead' | 'cold' | 'negative' | 'bounce'>('all');
  const [isGraphConnected, setIsGraphConnected] = useState(false);

  // Physics constants
  const kRepulsion = 8000;
  const kAttraction = 0.08;
  const kDesiredLength = 80;
  const kGravity = 0.05;
  const width = 800;
  const height = 550;

  const [simulatedNodes, setSimulatedNodes] = useState<GraphNode[]>([]);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 1. Fetch campaigns and lead details
  const fetchGraphData = useCallback(() => {
    setLoading(true);
    setErr('');
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_BASE_URL}/campaigns/${campaignId}/graph`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setRawNodes(d.nodes ?? []);
        setRawEdges(d.edges ?? []);
        setIsGraphConnected(d.connected ?? false);
        setLoading(false);
      })
      .catch(e => {
        setErr(`Failed to query Neo4j graph: ${e}`);
        setLoading(false);
      });
  }, [campaignId]);

  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  // 2. Build the Company -> Department -> Title -> Lead Hierarchy
  useEffect(() => {
    if (rawNodes.length === 0) return;

    const campaignNode = rawNodes.find(n => n.type === 'campaign');
    if (!campaignNode) return;

    const processedNodes: GraphNode[] = [campaignNode];
    const processedEdges: GraphEdge[] = [];

    const companyKeys = new Set<string>();
    const deptKeys = new Set<string>();
    const titleKeys = new Set<string>();

    const leads = rawNodes.filter(n => n.type === 'lead');

    leads.forEach(l => {
      const companyName = l.properties?.companyName || l.properties?.company_name || 'Unclassified Company';
      const department = l.properties?.department || 'Other';
      const title = l.properties?.title || 'Prospect';

      const companyId = `company_${companyName.replace(/\s+/g, '_')}`;
      const deptId = `dept_${companyName.replace(/\s+/g, '_')}_${department.replace(/\s+/g, '_')}`;
      const titleId = `title_${companyName.replace(/\s+/g, '_')}_${department.replace(/\s+/g, '_')}_${title.replace(/\s+/g, '_')}`;

      // A. Create Company Node
      if (!companyKeys.has(companyId)) {
        companyKeys.add(companyId);
        processedNodes.push({
          id: companyId,
          label: companyName,
          type: 'company',
          parentId: campaignNode.id
        });
        processedEdges.push({
          id: `edge_${campaignNode.id}_${companyId}`,
          source: campaignNode.id,
          target: companyId,
          type: 'TARGETED_COMPANY'
        });
      }

      // B. Create Department Node
      if (!deptKeys.has(deptId)) {
        deptKeys.add(deptId);
        processedNodes.push({
          id: deptId,
          label: department,
          type: 'department',
          parentId: companyId
        });
        processedEdges.push({
          id: `edge_${companyId}_${deptId}`,
          source: companyId,
          target: deptId,
          type: 'HAS_DEPARTMENT'
        });
      }

      // C. Create Title Node
      if (!titleKeys.has(titleId)) {
        titleKeys.add(titleId);
        processedNodes.push({
          id: titleId,
          label: title,
          type: 'title',
          parentId: deptId
        });
        processedEdges.push({
          id: `edge_${deptId}_${titleId}`,
          source: deptId,
          target: titleId,
          type: 'HAS_TITLE'
        });
      }

      // D. Link Lead Node to Title Node parent
      l.parentId = titleId;
      processedNodes.push(l);

      processedEdges.push({
        id: `edge_${titleId}_${l.id}`,
        source: titleId,
        target: l.id,
        type: 'HELD_BY'
      });
    });

    // E. Add Response and Referral edges
    rawEdges.forEach(re => {
      const srcId = typeof re.source === 'string' ? re.source : (re.source as any).id;
      const tgtId = typeof re.target === 'string' ? re.target : (re.target as any).id;

      if (re.type === 'RESPONDED') {
        processedEdges.push({
          id: re.id,
          source: srcId,
          target: campaignNode.id,
          type: 'RESPONDED',
          properties: re.properties
        });
      } else if (re.type.startsWith('REFERRED')) {
        processedEdges.push({
          id: re.id,
          source: srcId,
          target: tgtId,
          type: re.type,
          properties: re.properties
        });
      }
    });

    // Expand campaign and companies by default
    setExpandedNodeIds(prev => {
      if (prev.size > 0) return prev;
      const initial = new Set<string>();
      initial.add(campaignNode.id);
      companyKeys.forEach(id => initial.add(id));
      return initial;
    });

    setHierarchyNodes(processedNodes);
    setHierarchyEdges(processedEdges);
  }, [rawNodes, rawEdges]);

  // 3. Compute Visible Elements (respecting search paths and collapsed folders)
  const getVisibleElements = useCallback(() => {
    if (hierarchyNodes.length === 0) return { nodes: [], edges: [] };

    const campaignNode = hierarchyNodes.find(n => n.type === 'campaign');
    if (!campaignNode) return { nodes: [], edges: [] };

    const visibleNodeIds = new Set<string>();
    visibleNodeIds.add(campaignNode.id);

    // Initial pass based on manual expansion
    hierarchyNodes.forEach(n => {
      if (n.type === 'company' && n.parentId === campaignNode.id && expandedNodeIds.has(campaignNode.id)) {
        visibleNodeIds.add(n.id);
      }
    });

    hierarchyNodes.forEach(n => {
      if (n.type === 'department' && n.parentId && expandedNodeIds.has(n.parentId) && visibleNodeIds.has(n.parentId)) {
        visibleNodeIds.add(n.id);
      }
    });

    hierarchyNodes.forEach(n => {
      if (n.type === 'title' && n.parentId) {
        const parentDept = hierarchyNodes.find(dn => dn.id === n.parentId);
        if (parentDept && expandedNodeIds.has(parentDept.id) && visibleNodeIds.has(parentDept.id)) {
          visibleNodeIds.add(n.id);
        }
      }
    });

    hierarchyNodes.forEach(n => {
      if (n.type === 'lead' && n.parentId) {
        const parentTitle = hierarchyNodes.find(tn => tn.id === n.parentId);
        if (parentTitle && expandedNodeIds.has(parentTitle.id) && visibleNodeIds.has(parentTitle.id)) {
          const cat = n.properties?.responseCategory || 'unclassified';
          if (filterType === 'all' || cat === filterType) {
            visibleNodeIds.add(n.id);
          }
        }
      }
    });

    // Search Path Override: if search query matches, auto-reveal complete chain
    const isSearchActive = searchQuery.trim().length > 0;
    if (isSearchActive) {
      hierarchyNodes.forEach(n => {
        if (n.type === 'lead') {
          const email = (n.properties?.email || '').toLowerCase();
          const name = (n.properties?.name || '').toLowerCase();
          if (email.includes(searchQuery.toLowerCase()) || name.includes(searchQuery.toLowerCase())) {
            visibleNodeIds.add(n.id);
            let curr = n;
            while (curr.parentId) {
              visibleNodeIds.add(curr.parentId);
              const parent = hierarchyNodes.find(pn => pn.id === curr.parentId);
              if (!parent) break;
              curr = parent;
            }
          }
        }
      });
    }

    const filteredNodes = hierarchyNodes.filter(n => visibleNodeIds.has(n.id));
    const filteredEdges = hierarchyEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [hierarchyNodes, hierarchyEdges, expandedNodeIds, searchQuery, filterType]);

  const { nodes: visibleNodes, edges: visibleEdges } = getVisibleElements();

  // 4. Force-directed Physics Simulation Loop
  useEffect(() => {
    if (visibleNodes.length === 0) return;

    // Seed positions. If new, pop them smoothly out of their parent node
    const initializedNodes: GraphNode[] = visibleNodes.map((n, idx) => {
      const existing = simulatedNodes.find(pn => pn.id === n.id);
      if (existing && existing.x !== undefined) return existing;

      let px = width / 2;
      let py = height / 2;
      if (n.parentId) {
        const parentNode = simulatedNodes.find(pn => pn.id === n.parentId);
        if (parentNode && parentNode.x !== undefined) {
          px = parentNode.x;
          py = parentNode.y!;
        }
      }

      const angle = Math.random() * 2 * Math.PI;
      const radius = 30 + Math.random() * 20;
      return {
        ...n,
        x: px + Math.cos(angle) * radius,
        y: py + Math.sin(angle) * radius
      };
    });

    let animationFrameId: number;

    const tick = () => {
      // A. Repulsive forces
      for (let i = 0; i < initializedNodes.length; i++) {
        const n1 = initializedNodes[i];
        for (let j = i + 1; j < initializedNodes.length; j++) {
          const n2 = initializedNodes[j];
          const dx = n2.x! - n1.x!;
          const dy = n2.y! - n1.y!;
          const distSq = dx * dx + dy * dy + 0.1;
          const dist = Math.sqrt(distSq);
          if (dist < 220) {
            const force = kRepulsion / distSq;
            const fx = force * (dx / dist);
            const fy = force * (dy / dist);
            if (n1.fx === undefined || n1.fx === null) { n1.x! -= fx; n1.y! -= fy; }
            if (n2.fx === undefined || n2.fx === null) { n2.x! += fx; n2.y! += fy; }
          }
        }
      }

      // B. Attractive forces
      visibleEdges.forEach(e => {
        const sourceNode = initializedNodes.find(n => n.id === e.source);
        const targetNode = initializedNodes.find(n => n.id === e.target);
        if (sourceNode && targetNode) {
          const dx = targetNode.x! - sourceNode.x!;
          const dy = targetNode.y! - sourceNode.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - kDesiredLength) * kAttraction;
          const fx = force * (dx / dist);
          const fy = force * (dy / dist);
          if (sourceNode.fx === undefined || sourceNode.fx === null) { sourceNode.x! += fx; sourceNode.y! += fy; }
          if (targetNode.fx === undefined || targetNode.fx === null) { targetNode.x! -= fx; targetNode.y! -= fy; }
        }
      });

      // C. Gravity center force & boundary check
      const cx = width / 2;
      const cy = height / 2;
      initializedNodes.forEach(n => {
        if (n.fx !== undefined && n.fx !== null) {
          n.x = n.fx;
          n.y = n.fy!;
        } else {
          n.x! += (cx - n.x!) * kGravity;
          n.y! += (cy - n.y!) * kGravity;
        }

        n.x = Math.max(30, Math.min(width - 30, n.x!));
        n.y = Math.max(30, Math.min(height - 30, n.y!));
      });

      setSimulatedNodes([...initializedNodes]);
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [visibleNodes, visibleEdges]);

  // Drag triggers
  const handleMouseDown = (e: React.MouseEvent, node: GraphNode) => {
    e.preventDefault();
    setDraggingNode(node.id);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      node.fx = x;
      node.fy = y;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingNode) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSimulatedNodes(prev => prev.map(n => {
        if (n.id === draggingNode) {
          n.fx = x;
          n.fy = y;
          n.x = x;
          n.y = y;
        }
        return n;
      }));
    }
  };

  const handleMouseUp = () => {
    if (draggingNode) {
      setSimulatedNodes(prev => prev.map(n => {
        if (n.id === draggingNode) {
          n.fx = null;
          n.fy = null;
        }
        return n;
      }));
      setDraggingNode(null);
    }
  };

  // Node Clicking / Interactive Tree Toggle
  const handleNodeClick = (node: GraphNode) => {
    if (node.type === 'lead') {
      setSelectedNode(node);
      return;
    }

    setExpandedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  };

  // Helper properties
  const getNodeColor = (node: GraphNode) => {
    if (node.type === 'campaign') return 'url(#campaignGrad)';
    if (node.type === 'company') return '#8B5CF6';      // Violet/Purple
    if (node.type === 'department') return '#06B6D4';   // Cyan/Teal
    if (node.type === 'title') return '#6366F1';        // Indigo
    
    // Lead Node Response Class
    const cat = node.properties?.responseCategory;
    if (cat === 'hot') return '#F97316';       // orange
    if (cat === 'lead') return '#10B981';      // emerald
    if (cat === 'cold') return '#60A5FA';      // blue
    if (cat === 'negative') return '#EF4444';  // red
    if (cat === 'bounce') return '#6B7280';    // gray
    const status = node.properties?.status;
    if (status === 'sent') return '#818CF8';   // indigo
    return '#94A3B8';                          // slate
  };

  const getNodeSize = (node: GraphNode) => {
    if (node.type === 'campaign') return 24;
    if (node.type === 'company') return 18;
    if (node.type === 'department') return 14;
    if (node.type === 'title') return 11;
    return 8;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin mb-4" />
        Mapping Graph Relationships...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Warning Alert banner */}
      {!isGraphConnected && (
        <div className="bg-[#FAF7EA] border border-[#E2DCBE] p-4 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#786D3B]">
            <span className="text-sm">⚠️</span>
            <span>
              <strong>Neo4j Cloud Database is not connected.</strong> Serving simulated sandbox graph. Add valid `NEO4J_URI` settings in your environment to link live data.
            </span>
          </div>
          <button onClick={fetchGraphData} className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-bold transition">
            Retry Connection
          </button>
        </div>
      )}

      {/* Filter panel */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-150 rounded-2xl">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 w-60"
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All Responses</option>
            <option value="hot">🔥 Hot Leads</option>
            <option value="lead">🟢 Leads</option>
            <option value="cold">❄️ Cold</option>
            <option value="negative">👎 Negative</option>
            <option value="bounce">🚫 Bounces</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 block"/> Campaign</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] block"/> Company</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4] block"/> Dept</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#6366F1] block"/> Title</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#F97316] block"/> Hot</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#10B981] block"/> Lead</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SVG visualizer canvas */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl overflow-hidden relative shadow-sm min-h-[550px]">
          <svg
            ref={svgRef}
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="select-none cursor-grab active:cursor-grabbing"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              <radialGradient id="campaignGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#60A5FA" />
                <stop offset="100%" stopColor="#3B82F6" />
              </radialGradient>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#3b82f6" floodOpacity="0.15" />
              </filter>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="18"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#CBD5E1" />
              </marker>
              <marker
                id="arrow-responded"
                viewBox="0 0 10 10"
                refX="20"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
              </marker>
            </defs>

            {/* Render lines */}
            {visibleEdges.map(e => {
              const src = simulatedNodes.find(n => n.id === e.source);
              const tgt = simulatedNodes.find(n => n.id === e.target);
              if (!src || !tgt) return null;

              const isResponded = e.type === 'RESPONDED';
              const isReferral = e.type.startsWith('REFERRED');

              return (
                <g key={e.id}>
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={isResponded ? '#10B981' : isReferral ? '#818CF8' : '#E2E8F0'}
                    strokeWidth={isResponded ? 2.5 : isReferral ? 2 : 1.5}
                    strokeDasharray={isResponded || isReferral ? '0' : '3 3'}
                    markerEnd={`url(#${isResponded ? 'arrow-responded' : 'arrow'})`}
                    className="transition-all"
                  />
                  {isReferral && (
                    <text
                      x={((src.x ?? 0) + (tgt.x ?? 0)) / 2}
                      y={((src.y ?? 0) + (tgt.y ?? 0)) / 2 - 5}
                      textAnchor="middle"
                      className="fill-slate-400 font-bold text-[8px] uppercase tracking-wider"
                    >
                      {e.type === 'REFERRED_DIRECTLY' ? 'Direct Ref' : 'Dept Ref'}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Render node circles */}
            {simulatedNodes.filter(n => visibleNodes.some(vn => vn.id === n.id)).map(n => {
              const isSelected = selectedNode?.id === n.id;
              const size = getNodeSize(n);
              const isExpanded = expandedNodeIds.has(n.id);
              const expandable = n.type !== 'lead';

              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="transition-transform duration-75"
                >
                  {/* Collapsed double border indicator */}
                  {expandable && !isExpanded && (
                    <circle
                      r={size + 5}
                      fill="none"
                      stroke={getNodeColor(n)}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                      className="animate-[spin_20s_linear_infinite]"
                    />
                  )}

                  <circle
                    r={size}
                    fill={getNodeColor(n)}
                    stroke={isSelected ? '#2563EB' : '#FFFFFF'}
                    strokeWidth={isSelected ? 3.5 : 2}
                    filter={n.type === 'campaign' ? 'url(#shadow)' : undefined}
                    onMouseDown={e => handleMouseDown(e, n)}
                    onClick={() => handleNodeClick(n)}
                    className="cursor-pointer transition-all hover:scale-110 active:scale-95"
                  />

                  {/* Expanded icon indicator inside the circle */}
                  {expandable && (
                    <text
                      y={3}
                      textAnchor="middle"
                      className="fill-white font-black pointer-events-none select-none text-[9px]"
                    >
                      {isExpanded ? '−' : '+'}
                    </text>
                  )}

                  <text
                    y={size + 13}
                    textAnchor="middle"
                    className={`font-semibold fill-slate-700 pointer-events-none select-none tracking-tight ${
                      n.type === 'campaign' ? 'text-[11px] font-black uppercase' :
                      n.type === 'company' ? 'text-[9px] font-bold text-slate-800' :
                      'text-[8px] text-slate-500'
                    }`}
                  >
                    {n.label.length > 15 ? `${n.label.slice(0, 13)}...` : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Details Side Panel Inspector */}
        <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-3xl p-5 shadow-sm min-h-[550px] flex flex-col">
          <h3 className="font-bold text-slate-800 text-sm mb-4 border-b border-slate-150 pb-2 uppercase tracking-wider flex items-center gap-1.5">
            <span>🏢</span> Organization Inspector
          </h3>

          {selectedNode ? (
            <div className="flex-1 flex flex-col justify-between text-xs text-slate-700">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase ${
                    selectedNode.properties?.responseCategory === 'hot' ? 'bg-orange-100 text-orange-700' :
                    selectedNode.properties?.responseCategory === 'lead' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {selectedNode.properties?.responseCategory ? 'REPLIED LEAD' : 'TARGETED CONTACT'}
                  </span>
                  {selectedNode.properties?.status && (
                    <span className="text-[10px] font-medium text-slate-400">
                      Status: <strong className="text-slate-655 uppercase">{selectedNode.properties.status}</strong>
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="font-black text-slate-800 text-base leading-tight">{selectedNode.label}</h4>
                  {selectedNode.properties?.email && (
                    <span className="text-slate-400 mt-1 block font-medium select-all">{selectedNode.properties.email}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {selectedNode.properties?.companyName && (
                    <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-0.5">
                      <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Company</span>
                      <span className="font-black text-slate-800">{selectedNode.properties.companyName}</span>
                    </div>
                  )}

                  {selectedNode.properties?.department && (
                    <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-0.5">
                      <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Department</span>
                      <span className="font-bold text-slate-800">{selectedNode.properties.department}</span>
                    </div>
                  )}

                  {selectedNode.properties?.title && (
                    <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-0.5">
                      <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Job Title</span>
                      <span className="font-semibold text-slate-800">{selectedNode.properties.title}</span>
                    </div>
                  )}
                </div>

                {/* Reply details card */}
                {selectedNode.properties?.responseCategory && (
                  <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Classification</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                        selectedNode.properties.responseCategory === 'hot' ? 'bg-orange-100 text-orange-700' :
                        selectedNode.properties.responseCategory === 'lead' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {selectedNode.properties.responseCategory}
                      </span>
                    </div>

                    {visibleEdges.find(e => e.source === selectedNode.id && e.type === 'RESPONDED')?.properties?.text && (
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic text-[11px] text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                        "{visibleEdges.find(e => e.source === selectedNode.id && e.type === 'RESPONDED')?.properties?.text}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200/50 mt-4">
                <span className="text-[9px] text-slate-400 block italic leading-snug">
                  Interactive hierarchical tree groupings: click on Companies, Departments, and Job Titles to expand or collapse details. Select targeted prospects to inspect profiles.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-6">
              <span className="text-2xl mb-2">🏢</span>
              <p className="text-xs font-semibold">Interactive Workspace</p>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-normal">
                Click on <strong>Company</strong> (+), <strong>Department</strong> (+), or <strong>Title</strong> (+) nodes to expand their sub-nodes.
              </p>
              <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                Select any individual <strong>Lead</strong> node (colored circles) to inspect their details in this panel.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
