import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../login/api';
import { socket } from "./socket"; // shared socket
import SocketManager from './socketManager';
import { requestQueue, UpdateBatcher } from './requestQueue';

// Retry utility with exponential backoff
const retryWithBackoff = async (fn: () => Promise<any>, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if ((error.response?.status === 429 || error.response?.status === 500) && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};



interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  damage?: number;
  survivalTime?: number;
  assists?: number;
  [key: string]: any; // optional for unknown fields
}

interface Team {
  _id: string;
  teamId?: string;
  teamName: string;
  teamTag?: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  [key: string]: any;
}

interface MatchData {
  _id: string;
  teams: Team[];
  [key: string]: any;
}



const MatchDataViewer: React.FC = () => {
  const { tournamentId, roundId, matchId } = useParams<{
    tournamentId: string;
    roundId: string;
    matchId: string;
  }>();

  const [matchData, setMatchData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedTeam, setHighlightedTeam] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'slot' | 'placePoints'>('slot');
  const [editingTeam, setEditingTeam] = useState<null | {
    teamIndex: number;
    teamId: string;
    teamName: string;
  }>(null);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [savingRoster, setSavingRoster] = useState(false);

  const teamRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const matchCacheRef = useRef<Record<string, any>>({});
  const lastUpdateRef = useRef<Record<string, number>>({});
  const setTeamRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) teamRefs.current[id] = el;
  };

  const fetchMatchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata`;
      const response = await api.get(url);
      const data = response.data;

      // Normalize team IDs so _id always exists
      setMatchData({
        ...data,
        teams: Array.isArray(data?.teams)
          ? data.teams.map((team: Team) => ({
            ...team,
            _id: team?._id || team?.teamId || null,
            placePoints: team.placePoints ?? 0,
          }))
          : [],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch match data');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, roundId, matchId]);

  useEffect(() => {
    if (!tournamentId || !roundId || !matchId) return;
    fetchMatchData();
  }, [tournamentId, roundId, matchId, fetchMatchData]);

  useEffect(() => {
    if (!socket) return;

    console.log('MatchDataController: Setting up socket listeners');

    const handleLiveMatchUpdate = (data: any) => {
      if (!data) return;

      const incomingMatchId = typeof data.matchId === 'object' && data.matchId?._id ? data.matchId._id : data.matchId;
      if (incomingMatchId?.toString?.() !== matchId?.toString?.()) return;

      setMatchData({
        ...data,
        teams: Array.isArray(data?.teams)
          ? data.teams.map((team: any) => ({
              ...team,
              _id: team?._id || team?.teamId || null,
              placePoints: team.placePoints ?? 0,
            }))
          : [],
      });
    };

    const handleTeamUpdate = (data: any) => {
      setMatchData((prevData: any) => {
        if (!prevData?.teams) return prevData;

        const updatedTeams = prevData.teams.map((team: any) => {
          if (team._id !== data.teamId) return team;

          const changes = data?.changes || {};
          // Start with shallow merge for non-array fields
          const nextTeam: any = { ...team, ...changes };

          // If server sent a partial players array (e.g., only {_id, bHasDied}), deep-merge by id
          if (Array.isArray(changes.players)) {
            const updatesById = new Map(
              changes.players.map((p: any) => [p._id?.toString?.() || p._id, p])
            );
            nextTeam.players = (team.players || []).map((p: any) => {
              const key = p._id?.toString?.() || p._id;
              const upd = updatesById.get(key);
              return upd ? { ...p, ...upd } : p; // preserve existing fields like playerName
            });
          }

          return nextTeam;
        });

        return { ...prevData, teams: updatedTeams };
      });
    };

    const handlePlayerUpdate = (data: any) => {
      setMatchData((prevData: any) => {
        if (!prevData?.teams) return prevData;

        return {
          ...prevData,
          teams: prevData.teams.map((team: any) => {
            if (team._id !== data.teamId) return team;

            return {
              ...team,
              players: team.players.map((player: any) =>
                player._id === data.playerId
                  ? { ...player, ...data.updates } // merge updated fields
                  : player
              ),
            };
          }),
        };
      });
    };

    // 🔹 Register socket listeners
    socket.on('liveMatchUpdate', handleLiveMatchUpdate);
    socket.on('matchDataUpdated', handleTeamUpdate);
    socket.on('playerStatsUpdated', handlePlayerUpdate);

    // 🔹 Cleanup on unmount
    return () => {
      console.log('MatchDataController: Cleaning up socket listeners');
      socket.off('liveMatchUpdate', handleLiveMatchUpdate);
      socket.off('matchDataUpdated', handleTeamUpdate);
      socket.off('playerStatsUpdated', handlePlayerUpdate);
      // Notify socket manager that this component is done with the socket
      SocketManager.getInstance().disconnect();
    };
  }, []);

  // Create batchers for different types of updates with proper accumulators
  const killUpdateBatcher = useRef(new UpdateBatcher<{ change: number }>(
    3000, // Significantly increased to prevent rapid requests
    (existing, newUpdate) => ({ change: existing.change + newUpdate.change })
  ));
  const pointsUpdateBatcher = useRef(new UpdateBatcher<{ points: number }>(4000)); // Significantly increased
  const deathUpdateBatcher = useRef(new UpdateBatcher<{ bHasDied: boolean }>(2500)); // Significantly increased

  const updateKillCount = async (teamIndex: number, playerIndex: number, change: number) => {
    if (!matchData) return;

    const now = Date.now();
    const key = `${teamIndex}-${playerIndex}`;
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < 200) return;
    lastUpdateRef.current[key] = now;

    const team = matchData.teams[teamIndex];
    const player = team.players[playerIndex];

    // Calculate new killNum, clamp at 0
    const newKillNum = Math.max(0, player.killNum + change);
    const actualChange = newKillNum - player.killNum;

    // Update local state immediately (optimistic update)
    setMatchData((prevData: any) => {
      if (!prevData) return prevData;

      const updatedTeams = [...prevData.teams];
      updatedTeams[teamIndex] = {
        ...team,
        players: team.players.map((p: Player, idx: number) =>
          idx === playerIndex
            ? { ...p, killNum: newKillNum }
            : p
        ),
      };

      return { ...prevData, teams: updatedTeams };
    });

    // Only send update if actualChange is not zero
    if (actualChange === 0) return;

    // Use the batcher to accumulate changes
    killUpdateBatcher.current.batch(
      `${teamIndex}-${playerIndex}`,
      { change: actualChange },
      async (batchedUpdate) => {
        await retryWithBackoff(() =>
          api.patch(
            `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${matchData._id}/team/${team._id}/player/${player._id}/stats`,
            { killNumChange: batchedUpdate.change }
          )
        );
      }
    );
  };

  // Use the direct function for immediate UI response
  const throttledUpdateKillCount = updateKillCount;



  const savePlacePoints = async (teamId: string, teamIndex: number, newPoints: number) => {
    if (!matchData) return;

    const now = Date.now();
    const key = `${teamId}-points`;
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < 300) return;
    lastUpdateRef.current[key] = now;

    // Update local state immediately
    setMatchData((prevData: any) => {
      if (!prevData?.teams?.[teamIndex]) return prevData;

      const updatedTeams = [...prevData.teams];
      updatedTeams[teamIndex] = {
        ...updatedTeams[teamIndex],
        placePoints: typeof newPoints === 'number' ? newPoints : 0,
      };

      return { ...prevData, teams: updatedTeams };
    });

    // Use batcher to prevent rapid requests
    pointsUpdateBatcher.current.batch(
      `${teamId}-points`,
      { points: newPoints },
      async (batchedUpdate) => {
        await retryWithBackoff(() =>
          api.patch(
            `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${matchData._id}/team/${teamId}/points`,
            { placePoints: batchedUpdate.points }
          )
        );
      }
    );
  };



  const openChangePlayers = async (teamIndex: number, teamId: string, teamName: string) => {
    try {
      // Open modal immediately for responsiveness
      setEditingTeam({ teamIndex, teamId, teamName });
      setPlayersLoading(true);

      // Use cached match if available; otherwise fetch only this match by id
      let currentMatch = matchCacheRef.current[String(matchId)];
      if (!currentMatch) {
        const matchRes = await api.get(`/matches/${matchId}`);
        currentMatch = matchRes.data;
        matchCacheRef.current[String(matchId)] = currentMatch;
      }

      // Derive roster from current match groups
      const group = (currentMatch.groups || []).find((grp: any) =>
        grp.slots?.some((slot: any) => slot.team && slot.team._id === teamId)
      );
      if (!group) throw new Error('Group for team not found');

      const teamSlot = group.slots.find((slot: any) => slot.team && slot.team._id === teamId);
      if (!teamSlot) throw new Error('Team not found in group');

      const playersForTeam = (teamSlot.team.players || []).filter((p: any) => p && p.playerName && p._id);

      // Preselected players from current state (no extra fetch)
      const preselectedPlayers = (matchData?.teams?.[teamIndex]?.players || []).filter((p: any) => p && p.playerName && p._id);

      const normalizeName = (name: string) => name.trim().toLowerCase();

      const preselectedMap = new Map<string, any>();
      preselectedPlayers.forEach((p: Player) => preselectedMap.set(normalizeName(p.playerName), p));

      const filteredAvailablePlayers = playersForTeam.filter((p: Player) => {
        const normalized = normalizeName(p.playerName);
        const pre = preselectedMap.get(normalized);
        return !(pre && pre._id !== p._id);
      });

      const combinedPlayersMap = new Map<string, any>();
      [...preselectedPlayers, ...filteredAvailablePlayers].forEach((p: any) => {
        combinedPlayersMap.set(p._id.toString(), p);
      });
      const combinedPlayers = Array.from(combinedPlayersMap.values());

      setAvailablePlayers(combinedPlayers);
      const selectedPlayerIds = preselectedPlayers
        .map((p: Player) => p._id.toString())
        .filter((id: string) => combinedPlayersMap.has(id));
      setSelectedPlayers(selectedPlayerIds);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch team players');
    } finally {
      setPlayersLoading(false);
    }
  };

  const saveChangedPlayers = async () => {
    if (!editingTeam || selectedPlayers.length < 1 || selectedPlayers.length > 4) {
      alert('Please select between 1 and 4 players.');
      return;
    }

    setSavingRoster(true);
    try {
      const oldPlayers = matchData.teams[editingTeam.teamIndex].players.map((p: any) => p._id.toString());
      const newPlayers = selectedPlayers.map((id) => id.toString());

      // --- Modified replacement logic for any number of players ---
      const removed = oldPlayers.filter((id: string) => !newPlayers.includes(id));

      const added = newPlayers.filter(id => !oldPlayers.includes(id));

      // Pair up as many as possible for replacement
      const replacements = removed
        .map((oldId: string, idx: number) => ({
          oldPlayerId: oldId,
          newPlayerId: added[idx] as string | undefined,
        }))
        .filter((pair: { oldPlayerId: string; newPlayerId?: string }) => pair.newPlayerId !== undefined);

      if (replacements.length > 0) {
        const url = `/matchdata/${matchData._id}/team/${editingTeam.teamId}/replace`;
        await api.put(url, { replacements });
      }

      // If there are extra added players, add them
      if (added.length > removed.length) {
        const extraAdded = added.slice(removed.length);
        if (extraAdded.length > 0) {
          const url = `/matchdata/${matchData._id}/team/${editingTeam.teamId}/player/add`;
          await api.post(url, { newPlayerIds: extraAdded });
        }
      }

      // If there are extra removed players, remove them
      if (removed.length > added.length) {
        const extraRemoved = removed.slice(added.length);
        if (extraRemoved.length > 0) {
          const url = `/matchdata/${matchData._id}/team/${editingTeam.teamId}/players/remove`;
          await api.delete(url, { data: { playerIds: extraRemoved } });
        }
      }
      // --- End of modified replacement logic ---

      // Update state locally without resetting existing players stats
      setMatchData((prev: any) => {
        if (!prev) return prev;
        const updatedTeams = [...prev.teams];

        const currentPlayers = updatedTeams[editingTeam.teamIndex].players;

        const newPlayersWithStats = selectedPlayers.map((id) => {
          // If player already exists → preserve stats
          const existing = currentPlayers.find((p: any) => p._id.toString() === id);
          if (existing) return existing;

          // If player is new → create blank stats object
          const fromAvailable = availablePlayers.find(p => p._id.toString() === id);
          if (fromAvailable) {
            return {
              ...fromAvailable,
              killNum: 0,
              damage: 0,
              survivalTime: 0,
              assists: 0,
              bHasDied: false,
              // add any other fields your backend initializes for a new player
            };
          }

          return null;
        }).filter(Boolean);

        updatedTeams[editingTeam.teamIndex] = {
          ...updatedTeams[editingTeam.teamIndex],
          players: newPlayersWithStats
        };

        return { ...prev, teams: updatedTeams };
      });

      setEditingTeam(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update players');
    } finally {
      setSavingRoster(false);
    }
  };

  const togglePlayerDeath = async (teamIndex: number, playerIndex: number) => {
    if (!matchData) return;

    const now = Date.now();
    const key = `${teamIndex}-${playerIndex}-death`;
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < 250) return;
    lastUpdateRef.current[key] = now;

    const team = matchData.teams[teamIndex];
    const player = team.players[playerIndex];
    const newBHasDied = !player.bHasDied;

    // Optimistic UI
    setMatchData((prev: MatchData | null) => {
      if (!prev) return prev;

      const updatedTeams = [...prev.teams];
      updatedTeams[teamIndex] = {
        ...team,
        players: team.players.map((p: Player, idx: number) =>
          idx === playerIndex ? { ...p, bHasDied: newBHasDied } : p
        ),
      };

      return { ...prev, teams: updatedTeams };
    });

    // Use batcher to prevent rapid requests
    deathUpdateBatcher.current.batch(
      `${teamIndex}-${playerIndex}-death`,
      { bHasDied: newBHasDied },
      async (batchedUpdate) => {
        await retryWithBackoff(() =>
          api.patch(
            `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${matchData._id}/team/${team._id}/player/${player._id}/stats`,
            { bHasDied: batchedUpdate.bHasDied }
          )
        );
      }
    );
  };

  // Toggle all players in a team using bulk update with request queue
  const toggleAllPlayersDeath = async (teamIndex: number) => {
    if (!matchData) return;

    const now = Date.now();
    const key = `team-${teamIndex}-all-death`;
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < 500) return;
    lastUpdateRef.current[key] = now;

    const team = matchData.teams[teamIndex];
    const newValue = !team.players.every((p: Player) => p.bHasDied);

    // Optimistic UI
    setMatchData((prev: MatchData | null) => {
      if (!prev) return prev;
      const updatedTeams = [...prev.teams];
      updatedTeams[teamIndex] = {
        ...team,
        players: team.players.map((p: Player) => ({ ...p, bHasDied: newValue })),
      };
      return { ...prev, teams: updatedTeams };
    });

    // Use request queue to prevent rapid bulk updates
    requestQueue.add(async () => {
      await api.patch(
        `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${matchData._id}/team/${team._id}/bulk`,
        { bHasDied: newValue }
      );
    }).catch((err) => {
      console.error('Failed to toggle all players death:', err);
    });
  };


  // Sorting logic for teams grid only (memoized)
  const sortedTeams = useMemo(() => {
    const teams = [...(matchData?.teams ?? [])];
    teams.sort((a: any, b: any) => {
      if (sortBy === 'slot') {
        return (a.slot ?? 0) - (b.slot ?? 0);
      } else {
        // Sort descending by placePoints
        return (b.placePoints ?? 0) - (a.placePoints ?? 0);
      }
    });
    return teams;
  }, [matchData?.teams, sortBy]);

  // Totals for header (memoized)
  const totalTeams = useMemo(() => (
    (matchData?.teams || []).filter((team: any) => team.players.some((p: any) => !p.bHasDied)).length
  ), [matchData?.teams]);

  const totalPlayers = useMemo(() => (
    (matchData?.teams || []).reduce((sum: number, team: any) => sum + team.players.filter((p: any) => !p.bHasDied).length, 0)
  ), [matchData?.teams]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
          <p className="text-purple-400 font-medium animate-pulse text-lg">Loading Match Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 max-w-md text-center">
          <p className="text-red-400 font-semibold text-lg">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!matchData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-gray-400 font-medium text-lg">No match data found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans">
      {/* Sticky header + navigation */}
      <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 shadow-xl">
        {/* Stats Header */}
        <div className="flex justify-center items-center gap-8 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3 bg-slate-800/50 px-6 py-3 rounded-xl border border-slate-700">
            <span className="text-gray-400 text-sm uppercase tracking-wider font-medium">Teams Alive</span>
            <span className="text-3xl font-bold text-white">{totalTeams}</span>
          </div>
          <div className="w-px h-12 bg-slate-700"></div>
          <div className="flex items-center gap-3 bg-slate-800/50 px-6 py-3 rounded-xl border border-slate-700">
            <span className="text-gray-400 text-sm uppercase tracking-wider font-medium">Players Alive</span>
            <span className="text-3xl font-bold text-green-400">{totalPlayers}</span>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex flex-wrap gap-2 justify-center py-3 px-4 max-w-6xl mx-auto">
          {matchData.teams.map((team: any) => {
            const allPlayersDead = team.players.length > 0 && team.players.every((p: any) => p.bHasDied);

            return (
              <button
                key={team._id}
                onClick={() => {
                  const currentTeamId = team._id;
                  setHighlightedTeam(currentTeamId);
                  setTimeout(() => {
                    const el = teamRefs.current[currentTeamId];
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 0);
                  setTimeout(() => {
                    setHighlightedTeam(prev => prev === currentTeamId ? null : prev);
                  }, 1500);
                }}
                className={`
                  px-3 py-1.5 rounded-lg font-bold text-sm transition-all duration-200 border shadow-sm
                  ${allPlayersDead
                    ? 'bg-red-900/30 text-red-400 border-red-900/50 hover:bg-red-900/50'
                    : 'bg-slate-800 text-gray-300 border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600'
                  }
                  ${highlightedTeam === team._id ? 'ring-2 ring-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] scale-105 bg-slate-700 text-white' : ''}
                `}
              >
                Slot {team.slot}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content container */}
      <div className="container mx-auto px-4 py-6 max-w-[1800px]">
        {/* Sort dropdown */}
        <div className="flex justify-end mb-6">
          <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-700 backdrop-blur-sm">
            <label className="text-purple-400 font-bold text-sm uppercase tracking-wider">Sort by:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'slot' | 'placePoints')}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer text-sm"
            >
              <option value="slot" className="bg-slate-800">Slot Number</option>
              <option value="placePoints" className="bg-slate-800">Placement Points</option>
            </select>
          </div>
        </div>

        {/* Teams grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sortedTeams.map((team: any) => {
            // Find the ACTUAL index in matchData.teams (not the sorted index)
            const teamIndex = matchData.teams.findIndex((t: any) => t._id === team._id);
            const allPlayersDied = team.players.every((p: any) => p.bHasDied);
            const totalKills = team.players.reduce((sum: number, player: any) => sum + (player.killNum ?? 0), 0);
            const totalPoints = (team.placePoints ?? 0) + totalKills;

            return (
              <div
                key={team._id}
                ref={setTeamRef(team._id)}
                className={`
                  relative rounded-2xl p-5 transition-all duration-300 group
                  ${highlightedTeam === team._id
                    ? 'bg-slate-800 border-2 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.2)] scale-[1.02]'
                    : 'bg-slate-800/40 border border-slate-700 hover:bg-slate-800/60 hover:border-slate-600 hover:shadow-xl'
                  }
                  ${allPlayersDied ? 'border-red-900/50' : ''}
                `}
              >
                {/* Team Header */}
                <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-700/50">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-700/50 text-yellow-300 text-xl font-mono px-2 py-0.5 rounded border border-slate-600/50 font-bold">
                        {team.slot}
                      </span>
                      <h4 className="text-xl font-bold text-white truncate max-w-[180px]" title={team.teamName}>
                        {team.teamName}
                      </h4>
                    </div>
                    {team.teamTag && (
                      <span className="text-sm text-purple-400 font-medium tracking-wide">[{team.teamTag}]</span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <label className="flex items-center gap-2 cursor-pointer group/check">
                      <span className={`text-xs font-bold transition-colors ${allPlayersDied ? 'text-red-500' : 'text-gray-500 group-hover/check:text-gray-400'}`}>
                        ELIMINATED
                      </span>
                      <div
                        onClick={() => toggleAllPlayersDeath(teamIndex)}
                        className={`relative w-10 h-5 rounded-full transition-all duration-300 cursor-pointer ${allPlayersDied ? 'bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-700 hover:bg-slate-600'}`}
                        title="Mark all players as Died"
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 ${allPlayersDied ? 'left-5 bg-white' : 'left-0.5 bg-gray-400'}`}></div>
                      </div>
                    </label>

                    <button
                      onClick={() => openChangePlayers(teamIndex, team.teamId || team._id, team.teamName)}
                      className="text-xs bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg transition-colors border border-blue-600/20"
                    >
                      Edit Roster
                    </button>
                  </div>
                </div>

                {/* Points Section */}
                <div className="flex items-center justify-between mb-4 bg-slate-900/30 p-3 rounded-xl border border-slate-700/30">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm font-medium">Place Points:</span>
                    <input
                      type="number"
                      min={0}
                      value={team.placePoints ?? 0}
                      onChange={(e) => {
                        const val = e.target.value;
                        const numVal = val === '' ? 0 : parseInt(val, 10);
                        setMatchData((prev: MatchData | null) => {
                          if (!prev) return prev;
                          const updatedTeams = [...prev.teams];
                          updatedTeams[teamIndex] = {
                            ...updatedTeams[teamIndex],
                            placePoints: isNaN(numVal) ? 0 : numVal,
                          };
                          return { ...prev, teams: updatedTeams };
                        });
                      }}
                      onBlur={(e) => {
                        const val = e.target.value;
                        const numVal = val === '' ? 0 : parseInt(val, 10);
                        if (!isNaN(numVal)) {
                          savePlacePoints(team._id, teamIndex, numVal);
                        }
                      }}
                      className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-center text-white font-bold focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div className="flex flex-col items-end">
                      <span className="text-gray-500 text-xs uppercase">Kills</span>
                      <span className="text-yellow-500 font-bold text-lg">{totalKills}</span>
                    </div>
                    <div className="w-px bg-slate-700"></div>
                    <div className="flex flex-col items-end">
                      <span className="text-gray-500 text-xs uppercase">Total</span>
                      <span className="text-green-400 font-bold text-lg">{totalPoints}</span>
                    </div>
                  </div>
                </div>

                {/* Players List */}
                <div className="space-y-2">
                  {team.players.map((player: any, playerIndex: number) => (
                    <div
                      key={player._id}
                      className={`
                        flex items-center gap-3 p-2.5 rounded-lg transition-colors border
                        ${player.bHasDied
                          ? 'bg-red-900/10 border-red-900/20'
                          : 'bg-slate-700/30 border-slate-700/30 hover:bg-slate-700/50'
                        }
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${player.bHasDied ? 'text-red-400/70 line-through' : 'text-gray-200'}`}>
                          {player.playerName}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => throttledUpdateKillCount(teamIndex, playerIndex, -1)}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors border border-slate-600 hover:border-red-800"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-bold text-yellow-500">
                          {player.killNum ?? 0}
                        </span>
                        <button
                          onClick={() => throttledUpdateKillCount(teamIndex, playerIndex, 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-800 hover:bg-green-900/30 text-gray-400 hover:text-green-400 transition-colors border border-slate-600 hover:border-green-800"
                        >
                          +
                        </button>
                      </div>

                      <div className="w-px h-6 bg-slate-700/50 mx-1"></div>

                      <div
                        onClick={() => togglePlayerDeath(teamIndex, playerIndex)}
                        className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 ${player.bHasDied ? 'bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-green-600 shadow-[0_0_10px_rgba(34,197,94,0.4)]'}`}
                        title={player.bHasDied ? 'Click to mark ALIVE' : 'Click to mark DEAD'}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-md ${player.bHasDied ? 'left-7' : 'left-1'}`}></div>
                        <span className={`absolute text-[8px] font-bold transition-all duration-200 top-1.5 ${player.bHasDied ? 'left-1.5 text-red-200' : 'right-1 text-green-200'}`}>
                          {player.bHasDied ? '💀' : '✓'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Change Players Modal */}
      {editingTeam && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative flex flex-col max-h-[90vh]">
            <h3 className="text-2xl font-bold text-white mb-2">Edit Roster</h3>
            <p className="text-purple-400 font-medium mb-6">{editingTeam.teamName}</p>

            {playersLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-400">Loading players...</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto mb-6 pr-2">
                  <p className="text-sm text-gray-400 mb-4">Select 1-4 players:</p>
                  <div className="space-y-2">
                    {availablePlayers.map((player) => {
                      const playerIdStr = player._id.toString();
                      const isChecked = selectedPlayers.includes(playerIdStr);
                      return (
                        <label
                          key={playerIdStr}
                          className={`
                            flex items-center p-3 rounded-lg border cursor-pointer transition-all
                            ${isChecked
                              ? 'bg-purple-600/20 border-purple-500 text-white'
                              : 'bg-slate-900/50 border-slate-700 text-gray-400 hover:bg-slate-800'
                            }
                          `}
                        >
                          <div
                            onClick={() => {
                              if (isChecked) {
                                console.log('Unchecked player id:', playerIdStr);
                                setSelectedPlayers(selectedPlayers.filter(id => id !== playerIdStr));
                              } else {
                                if (selectedPlayers.length >= 4) {
                                  alert('Please untick a player before selecting another.');
                                  return;
                                }
                                console.log('Checked player id:', playerIdStr);
                                setSelectedPlayers([...selectedPlayers, playerIdStr]);
                              }
                            }}
                            className={`w-5 h-5 rounded-md mr-3 flex items-center justify-center transition-all duration-200 cursor-pointer flex-shrink-0 ${isChecked ? 'bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.5)]' : 'bg-slate-700 border border-slate-600 hover:border-slate-500'}`}
                          >
                            {isChecked && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                              </svg>
                            )}
                          </div>
                          <span className="font-medium">{player.playerName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                  <button
                    onClick={() => setEditingTeam(null)}
                    className="px-5 py-2.5 rounded-xl font-medium text-gray-300 bg-slate-700 hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveChangedPlayers}
                    disabled={savingRoster}
                    className={`px-5 py-2.5 rounded-xl font-medium text-white shadow-lg shadow-purple-900/20 transition-all flex items-center gap-2 ${savingRoster ? 'bg-purple-700 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                  >
                    {savingRoster ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Saving...
                      </>
                    ) : (
                      'Save Roster'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchDataViewer;