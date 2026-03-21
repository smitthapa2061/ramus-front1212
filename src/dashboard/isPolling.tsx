import React, { useState, useEffect } from "react";
import api from "../login/api";
import SocketManager from "./socketManager";

interface Selection {
  _id: string;
  matchId: string;
  roundId: { _id: string; apiEnable: boolean; roundName: string };
  tournamentId: string;
  createdAt: string;
  isSelected: boolean;
  isPollingActive: boolean;
}

const STYLES = `
  @keyframes pm-spin { to { transform: rotate(360deg); } }
  @keyframes pm-pulse { 0%,100% { opacity:1; box-shadow: 0 0 6px #4ade80; } 50% { opacity:0.4; box-shadow: 0 0 2px #4ade80; } }
  @keyframes pm-wave {
    0%   { transform: scaleY(0.3); }
    50%  { transform: scaleY(1);   }
    100% { transform: scaleY(0.3); }
  }

  .pm-wrap {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: 'Orbitron', monospace;
  }

  /* Fetch toggle button */
  .pm-btn {
    position: relative; cursor: pointer;
    width: 36px; height: 20px; border-radius: 10px;
    border: 1px solid; outline: none;
    display: flex; align-items: center;
    padding: 2px 3px;
  }
  .pm-btn.active {
    background: rgba(74,222,128,0.15);
    border-color: rgba(74,222,128,0.5);
    box-shadow: 0 0 8px rgba(74,222,128,0.2);
  }
  .pm-btn.inactive {
    background: rgba(220,38,38,0.1);
    border-color: rgba(220,38,38,0.35);
  }
  .pm-btn.disabled {
    background: rgba(0,0,0,0.3);
    border-color: rgba(255,255,255,0.06);
    cursor: not-allowed; opacity: 0.45;
  }
  .pm-btn.updating {
    background: rgba(245,158,11,0.1);
    border-color: rgba(245,158,11,0.3);
    cursor: wait;
  }

  .pm-thumb {
    width: 14px; height: 14px; border-radius: 50%;
    flex-shrink: 0;
  }
  .pm-btn.active   .pm-thumb { background: #4ade80; box-shadow: 0 0 5px #4ade80; margin-left: auto; }
  .pm-btn.inactive .pm-thumb { background: #ef4444; margin-left: 0; }
  .pm-btn.disabled .pm-thumb { background: #374151; }
  .pm-btn.updating .pm-thumb { background: #f59e0b; margin-left: auto; animation: pm-spin 1s linear infinite; }

  /* Live status dot */
  .pm-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }
  .pm-dot.live    { background: #4ade80; animation: pm-pulse 1.8s ease-in-out infinite; }
  .pm-dot.paused  { background: #374151; }
  .pm-dot.off     { background: #374151; }

  /* Animated bars (data-fetch indicator) — only shown when live */
  .pm-bars {
    display: flex; align-items: flex-end; gap: 2px; height: 14px;
  }
  .pm-bar {
    width: 3px; border-radius: 2px; background: #4ade80;
    animation: pm-wave 1s ease-in-out infinite;
  }
  .pm-bar:nth-child(1) { animation-delay: 0s;    height: 5px;  }
  .pm-bar:nth-child(2) { animation-delay: 0.2s;  height: 10px; }
  .pm-bar:nth-child(3) { animation-delay: 0.4s;  height: 7px;  }
  .pm-bar.static { animation: none; opacity: 0.18; }
`;

const PollingManager: React.FC = () => {
  const [selections,     setSelections]     = useState<Selection[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [updating,       setUpdating]       = useState(false);
  const [activeMatchId,  setActiveMatchId]  = useState<string | null>(null);
  const [buttonState,    setButtonState]    = useState(false);

  // Socket setup
  useEffect(() => {
    const sm = SocketManager.getInstance();
    const socket = sm.connect();

    socket.on("pollingStatusUpdated", (updated: Selection) => {
      setSelections(prev => {
        const next = prev.map(s => s._id === updated._id ? { ...s, isPollingActive: updated.isPollingActive } : s);
        if (updated._id === activeMatchId) {
          const sel = next.find(s => s._id === activeMatchId);
          const api = typeof sel?.roundId === 'object' ? sel.roundId.apiEnable : false;
          setButtonState(updated.isPollingActive && api);
        }
        return next;
      });
    });

    socket.on("matchSelected", ({ selected }: { selected: Selection }) => {
      setSelections(prev => {
        const cleared = prev.map(s => ({ ...s, isSelected: false }));
        const idx = cleared.findIndex(s => s._id === selected._id);
        if (idx !== -1) { cleared[idx] = { ...selected, isSelected: true }; return cleared; }
        return [...cleared, { ...selected, isSelected: true }];
      });
      setActiveMatchId(selected._id);
      const api = typeof selected.roundId === 'object' ? selected.roundId.apiEnable : false;
      setButtonState(selected.isPollingActive && api);
    });

    socket.on("matchDeselected", ({ matchId }: { matchId: string }) => {
      setSelections(prev => prev.map(s => s._id === matchId ? { ...s, isSelected: false, isPollingActive: false } : s));
      if (activeMatchId === matchId) setActiveMatchId(null);
    });

    socket.on("matchDeleted", ({ matchId }: { matchId: string }) => {
      setSelections(prev => prev.filter(s => s._id !== matchId));
      if (activeMatchId === matchId) setActiveMatchId(null);
    });

    return () => { sm.disconnect(); };
  }, [activeMatchId]);

  // Initial fetch
  useEffect(() => {
    api.get<Selection[]>("/matchSelection/selected")
      .then(res => {
        const uniq = Array.from(new Map(res.data.map(i => [i._id, i])).values());
        setSelections(uniq);
        if (uniq.length > 0) {
          const apiEnabled = uniq.filter(s => typeof s.roundId === 'object' ? s.roundId.apiEnable : false);
          const first = apiEnabled.length > 0
            ? (apiEnabled.find(s => s.isSelected) || apiEnabled[0])
            : (uniq.find(s => s.isSelected) || uniq[0]);
          setActiveMatchId(first._id);
          const hasApi = typeof first.roundId === 'object' ? first.roundId.apiEnable : false;
          setButtonState(first.isPollingActive && hasApi);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setButtonState(false); }, [activeMatchId]);

  const handleToggle = async () => {
    if (!activeMatchId || updating) return;
    const match = selections.find(s => s._id === activeMatchId);
    if (!match) return;
    const hasApi = typeof match.roundId === 'object' ? match.roundId.apiEnable : false;
    if (!hasApi) return;

    const newState = !match.isPollingActive;
    setButtonState(newState);
    setUpdating(true);
    try {
      const rId = typeof match.roundId === 'object' ? match.roundId._id : match.roundId;
      await api.patch(`/matchSelection/${match.tournamentId}/${rId}/${match.matchId}/polling`, { isPollingActive: newState });
      setSelections(prev => prev.map(s => s._id === activeMatchId ? { ...s, isPollingActive: newState } : s));
    } catch {
      setButtonState(!newState);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="pm-wrap">
          <div style={{ width: 14, height: 14, border: '2px solid rgba(74,222,128,0.15)', borderTopColor: '#4ade80', borderRadius: '50%', animation: 'pm-spin 0.8s linear infinite' }} />
        </div>
      </>
    );
  }

  if (!activeMatchId) return null;

  const activeSelection  = selections.find(s => s._id === activeMatchId);
  const hasApi           = activeSelection && typeof activeSelection.roundId === 'object' ? activeSelection.roundId.apiEnable : false;
  const isLive           = buttonState && hasApi;
  const btnClass         = updating ? 'updating' : !hasApi ? 'disabled' : isLive ? 'active' : 'inactive';

  const title = !hasApi
    ? 'API disabled for this round'
    : isLive
      ? 'Fetching live data — click to pause'
      : 'Data fetch paused — click to start';

  return (
    <>
      <style>{STYLES}</style>
      <div className="pm-wrap" title={title}>

        {/* Animated bars — visible only when live */}
        <div className="pm-bars">
          <div className={`pm-bar${isLive ? '' : ' static'}`} />
          <div className={`pm-bar${isLive ? '' : ' static'}`} />
          <div className={`pm-bar${isLive ? '' : ' static'}`} />
        </div>

        {/* Status dot */}
        <div className={`pm-dot${isLive ? ' live' : ' paused'}`} />

        {/* Toggle switch */}
        <button
          className={`pm-btn ${btnClass}`}
          onClick={handleToggle}
          disabled={updating || !hasApi}
          title={title}
        >
          <div className="pm-thumb" />
        </button>

      </div>
    </>
  );
};

export default PollingManager;
