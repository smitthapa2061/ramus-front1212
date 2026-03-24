import React, { useState, useEffect } from "react";
import api from "../login/api";
import SocketManager from "./socketManager";

interface Selection {
  _id: string;
  matchId: string;
  roundId: {
    _id: string;
    apiEnable: boolean;
    roundName: string;
  };
  tournamentId: string;
  createdAt: string;
  isSelected: boolean;
  isPollingActive: boolean;
}

const PollingManager: React.FC = () => {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState(false);

  // --- Socket setup ---
  useEffect(() => {
    const socketManager = SocketManager.getInstance();
    const socket = socketManager.connect();

    socket.on("pollingStatusUpdated", (updated: Selection) => {
      setSelections((prev) => {
        const newSelections = prev.map((s) =>
          s._id === updated._id
            ? { ...s, isPollingActive: updated.isPollingActive }
            : s
        );

        if (updated._id === activeMatchId) {
          const activeSelection = newSelections.find(s => s._id === activeMatchId);
          const hasApiEnabled = activeSelection?.roundId && typeof activeSelection.roundId === 'object' ? activeSelection.roundId.apiEnable : false;
          const newButtonState = updated.isPollingActive && hasApiEnabled;
          setButtonState(newButtonState);
        }

        return newSelections;
      });
    });

    socket.on("matchSelected", ({ selected }: { selected: Selection }) => {
      setSelections((prev) => {
        const updatedPrev = prev.map(s => ({ ...s, isSelected: false }));
        const index = updatedPrev.findIndex((s) => s._id === selected._id);
        if (index !== -1) {
          updatedPrev[index] = { ...selected, isSelected: true };
          return updatedPrev;
        } else {
          return [...updatedPrev, { ...selected, isSelected: true }];
        }
      });

      setActiveMatchId(selected._id);
      const hasApiEnabled = selected.roundId && typeof selected.roundId === 'object' ? selected.roundId.apiEnable : false;
      setButtonState(selected.isPollingActive && hasApiEnabled);
    });

    socket.on("matchDeselected", ({ matchId }: { matchId: string }) => {
      setSelections((prev) =>
        prev.map((s) =>
          s._id === matchId ? { ...s, isSelected: false, isPollingActive: false } : s
        )
      );

      if (activeMatchId === matchId) {
        setActiveMatchId(null);
      }
    });

    socket.on("matchDeleted", ({ matchId }: { matchId: string }) => {
      setSelections((prev) => prev.filter((s) => s._id !== matchId));

      if (activeMatchId === matchId) {
        setActiveMatchId(null);
      }
    });

    return () => {
      socketManager.disconnect();
    };
  }, [activeMatchId]);

  // --- Fetch initial selections ---
  useEffect(() => {
    api
      .get<Selection[]>("/matchSelection/selected")
      .then((res) => {
        const uniqueSelections = Array.from(
          new Map(res.data.map((item) => [item._id, item])).values()
        );
        setSelections(uniqueSelections);
        if (uniqueSelections.length > 0) {
          const apiEnabledSelections = uniqueSelections.filter(s =>
            s.roundId && typeof s.roundId === 'object' && s.roundId.apiEnable
          );
          const firstSelected = apiEnabledSelections.length > 0
            ? (apiEnabledSelections.find(s => s.isSelected) || apiEnabledSelections[0])
            : (uniqueSelections.find(s => s.isSelected) || uniqueSelections[0]);

          setActiveMatchId(firstSelected._id);
          const hasApiEnabled = firstSelected.roundId && typeof firstSelected.roundId === 'object' ? firstSelected.roundId.apiEnable : false;
          setButtonState(firstSelected.isPollingActive && hasApiEnabled);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // --- Reset button state when active match changes ---
  useEffect(() => {
    setButtonState(false);
  }, [activeMatchId]);

  // --- Toggle polling for current active match ---
  const handleTogglePollingForActive = async () => {
    if (!activeMatchId) return;

    const match = selections.find((s) => s._id === activeMatchId);
    if (!match) return;

    const hasApiEnabled = match.roundId && typeof match.roundId === 'object' ? match.roundId.apiEnable : false;
    if (!hasApiEnabled) return;

    const currentMatch = selections.find((s) => s._id === activeMatchId);
    const newState = !currentMatch?.isPollingActive;
    setButtonState(newState);

    setUpdating(true);
    try {
      const roundId = typeof match.roundId === 'object' ? match.roundId._id : match.roundId;
      await api.patch(
        `/matchSelection/${match.tournamentId}/${roundId}/${match.matchId}/polling`,
        { isPollingActive: newState }
      );

      setSelections((prev) =>
        prev.map((s) =>
          s._id === activeMatchId ? { ...s, isPollingActive: newState } : s
        )
      );
    } catch (err) {
      console.error("Failed to update polling:", err);
      setButtonState(!newState);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 rounded-xl border border-gray-700">
        <div className="w-4 h-4 border-2 border-gray-600 border-t-purple-500 rounded-full animate-spin"></div>
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    );
  }

  if (!activeMatchId) return null;

  const activeSelection = selections.find(s => s._id === activeMatchId);
  const hasApiEnabled = activeSelection && activeSelection.roundId && typeof activeSelection.roundId === 'object' ? activeSelection.roundId.apiEnable : false;

  return (
    <div className="flex items-center gap-3">
      {/* Status Indicator */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${buttonState
          ? 'bg-green-900/20 border-green-500/30'
          : 'bg-gray-800/50 border-gray-700'
        }`}>
        <div className={`w-2 h-2 rounded-full ${buttonState
            ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] animate-pulse'
            : 'bg-gray-500'
          }`}></div>
        <span className={`text-xs font-medium uppercase tracking-wider ${buttonState ? 'text-green-400' : 'text-gray-500'
          }`}>
          {buttonState ? 'LIVE' : 'PAUSED'}
        </span>
      </div>

      {/* Toggle Button */}
      <button
        onClick={handleTogglePollingForActive}
        disabled={updating || !hasApiEnabled}
        className={`
          relative flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200
          ${!hasApiEnabled
            ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed border border-gray-700'
            : buttonState
              ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg shadow-green-900/30 hover:from-green-500 hover:to-green-600 active:scale-[0.98]'
              : 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-900/30 hover:from-red-500 hover:to-red-600 active:scale-[0.98]'
          }
          ${updating ? 'opacity-70' : ''}
        `}
        title={!hasApiEnabled ? 'API not enabled for this round' : ''}
      >
        {updating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>Updating...</span>
          </>
        ) : (
          <>
            {/* Toggle Icon */}
            <div className={`relative w-10 h-5 rounded-full transition-colors ${buttonState ? 'bg-green-400' : 'bg-gray-600'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${buttonState ? 'left-5' : 'left-0.5'}`}></div>
            </div>
         
          </>
        )}
      </button>

      {!hasApiEnabled && (
        <span className="text-xs text-yellow-500/70 italic">API disabled</span>
      )}
    </div>
  );
};

export default PollingManager;