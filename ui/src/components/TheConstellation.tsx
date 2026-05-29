// ui/src/components/TheConstellation.tsx
// Knowledge graph visualisation — force-directed node network.
// Nodes coloured by epistemic state. Built on React Flow (@xyflow/react).

import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSession } from '../lib/store';

// ── State colour map ──────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  MASTER:              { bg: 'rgba(99,102,241,0.18)',  border: '#6366f1', text: '#a5b4fc' },
  EXPLORING:           { bg: 'rgba(34,211,238,0.18)',  border: '#22d3ee', text: '#67e8f9' },
  UNDERSTANDS:         { bg: 'rgba(16,185,129,0.18)',  border: '#10b981', text: '#6ee7b7' },
  BELIEVES_INCORRECTLY:{ bg: 'rgba(239,68,68,0.18)',   border: '#ef4444', text: '#fca5a5' },
  INCUBATING:          { bg: 'rgba(245,158,11,0.18)',  border: '#f59e0b', text: '#fcd34d' },
  UNKNOWN:             { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.15)', text: 'rgba(255,255,255,0.35)' },
};

// ── Custom node component ────────────────────────────────────────────────────

function ConceptNode({ data }: { data: { label: string; state: string; isZpd: boolean } }) {
  const colors = STATE_COLORS[data.state] ?? STATE_COLORS.UNKNOWN;
  return (
    <div style={{
      padding: '6px 12px',
      background: colors.bg,
      border:     `1px solid ${colors.border}`,
      borderRadius: 20,
      fontSize:   11,
      fontWeight: data.state !== 'UNKNOWN' && data.state !== 'MASTER' ? 600 : 400,
      color:      colors.text,
      fontFamily: 'var(--font-mono)',
      whiteSpace: 'nowrap',
      boxShadow:  data.isZpd ? `0 0 10px ${colors.border}40` : 'none',
      transition: 'all 0.3s ease',
      cursor:     'default',
      outline:    data.isZpd ? `2px solid ${colors.border}60` : 'none',
      outlineOffset: 2,
    }}>
      {data.label}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  concept: ConceptNode as unknown as NodeTypes['concept'],
};

// ── Layout — simple grid-based initial position ───────────────────────────────

function layoutNodes(
  concepts: Array<{ id: string; label: string; state: string }>,
  zpd:      string[],
): Node[] {
  const cols  = Math.ceil(Math.sqrt(concepts.length)) || 1;
  const gapX  = 160, gapY = 80;

  return concepts.map((c, i) => ({
    id:       c.id,
    type:     'concept',
    position: { x: (i % cols) * gapX - (cols * gapX) / 2, y: Math.floor(i / cols) * gapY },
    data:     { label: c.label || c.id, state: c.state, isZpd: zpd.includes(c.id) },
    draggable: true,
  }));
}

function buildEdges(
  edges: Array<{ src: string; dst: string; relation: string; is_master: number }>,
): Edge[] {
  return edges.map((e, i) => ({
    id:           `e-${i}-${e.src}-${e.dst}`,
    source:       e.src,
    target:       e.dst,
    label:        e.relation,
    animated:     e.is_master === 0,   // student edges animate
    style:        {
      stroke:     e.is_master === 1 ? 'rgba(99,102,241,0.35)' : 'rgba(34,211,238,0.5)',
      strokeWidth: e.is_master === 1 ? 1.5 : 2,
      strokeDasharray: e.is_master === 0 ? '4 2' : undefined,
    },
    labelStyle: {
      fontSize: 8, fill: 'rgba(255,255,255,0.25)',
      fontFamily: 'var(--font-mono)',
    },
    labelBgStyle: { fill: 'transparent' },
    type: 'default',
  }));
}

// ── TheConstellation ──────────────────────────────────────────────────────────

export default function TheConstellation() {
  const { graph, zpd } = useSession(s => ({ graph: s.graph, zpd: s.zpd }));

  const initialNodes = useMemo(() => {
    if (!graph) return [];
    return layoutNodes(graph.concepts, zpd);
  }, [graph, zpd]);

  const initialEdges = useMemo(() => {
    if (!graph) return [];
    return buildEdges(graph.edges);
  }, [graph]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Update when graph changes
  const derivedNodes = useMemo(() => {
    if (!graph) return nodes;
    return layoutNodes(graph.concepts, zpd);
  }, [graph, zpd]); // eslint-disable-line react-hooks/exhaustive-deps

  const derivedEdges = useMemo(() => {
    if (!graph) return edges;
    return buildEdges(graph.edges);
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const { stats } = graph ?? { stats: null };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
          color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          Knowledge Constellation
        </span>
        {stats && (
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              ['MASTER', String(stats.master),       'var(--state-master)'],
              ['MAPPED', String(stats.studentMapped),'var(--state-exploring)'],
              ['EDGES',  String(stats.studentEdges), 'var(--state-understands)'],
            ].map(([l, v, c]) => (
              <span key={l} style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                <span style={{ color: c, fontWeight: 600 }}>{v}</span> {l}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Graph */}
      <div style={{ flex: 1, position: 'relative' }}>
        {!graph || graph.concepts.length === 0 ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', gap: 10,
          }}>
            <div style={{ fontSize: 28, opacity: 0.3 }}>⬡</div>
            <div style={{ fontSize: 12 }}>
              {graph ? 'Activate a seed to map the constellation.' : 'Loading…'}
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={derivedNodes}
            edges={derivedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--bg-void)' }}
          >
            <Background variant={BackgroundVariant.Dots}
              gap={24} size={1} color="rgba(255,255,255,0.04)" />
            <Controls
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}
            />
            <MiniMap
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              nodeColor={n => {
                const state = (n?.data as { state: string } | undefined)?.state;
                return STATE_COLORS[state || 'UNKNOWN']?.border ?? '#444';
              }}
              maskColor="rgba(5,5,8,0.6)"
            />
          </ReactFlow>
        )}
      </div>

      {/* Legend */}
      <div style={{
        flexShrink: 0, padding: '8px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 12, flexWrap: 'wrap',
        background: 'var(--bg-elevated)',
      }}>
        {Object.entries({
          'Master':    'MASTER',
          'Exploring': 'EXPLORING',
          'Understands':'UNDERSTANDS',
          'Incorrect': 'BELIEVES_INCORRECTLY',
          'Incubating':'INCUBATING',
        }).map(([label, state]) => {
          const c = STATE_COLORS[state];
          return (
            <span key={state} style={{
              fontSize: 9, color: c.text, display: 'flex', alignItems: 'center', gap: 4,
              textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: c.border, display: 'inline-block',
              }} />
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
