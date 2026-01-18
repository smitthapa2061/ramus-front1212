import React, { useEffect, useState, useRef } from 'react';
import api from '../login/api.tsx';
import PollingManager from './isPolling.tsx';
import { FaDiscord, FaWhatsapp } from 'react-icons/fa';

interface Tournament {
  _id: string;
  tournamentName: string;
}

interface Round {
  _id: string;
  roundName: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

const DisplayHud: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [expandedTournaments, setExpandedTournaments] = useState<string[]>([]);
  const [roundsMap, setRoundsMap] = useState<Record<string, Round[]>>({});
  const [matchesMap, setMatchesMap] = useState<Record<string, Match[]>>({});
  const [expandedRounds, setExpandedRounds] = useState<Record<string, string | null>>({});
  const [selectedMatches, setSelectedMatches] = useState<Record<string, string | null>>({});
  const [selectedScheduleMatches, setSelectedScheduleMatches] = useState<Record<string, string[]>>({});
  const [user, setUser] = useState<any>(null);
  const [pollingKey, setPollingKey] = useState(0); // Force re-render polling component
  // Theme selection per tournament
  const availableThemes = ['Theme1', 'Theme2', 'Theme3', 'Theme4'];
  const [selectedThemeMap, setSelectedThemeMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('selectedThemeMap');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const getSelectedTheme = (tournamentId: string) => selectedThemeMap[tournamentId] || 'Theme1';

  // --- Auth check ---
  const checkAuth = async () => {
    try {
      const { data } = await api.get("/users/me");
      setUser(data);
      return data;
    } catch {
      return null;
    }
  };

  // Fetch tournaments (user-specific)
  useEffect(() => {
    checkAuth();
    api.get('/tournaments')
      .then(res => setTournaments(res.data))
      .catch(() => setTournaments([]));
  }, []);

  // Fetch all selected matches for current user
  useEffect(() => {
    const fetchSelectedMatches = async () => {
      try {
        const res = await api.get('/matchSelection/selected');
        console.log('DisplayHud: Fetched selected matches:', res.data);
        const selectedMap: Record<string, string> = {};
        res.data.forEach((sel: any) => {
          const roundId = typeof sel.roundId === 'object' ? sel.roundId._id : sel.roundId;
          const key = `${sel.tournamentId}_${roundId}`;
          selectedMap[key] = sel.matchId;
          console.log(`DisplayHud: Setting selected match for ${key}: ${sel.matchId} (roundId: ${roundId})`);
        });
        setSelectedMatches(selectedMap);
        console.log('DisplayHud: Final selected matches map:', selectedMap);
      } catch (err) {
        console.error('Error fetching selected matches:', err);
      }
    };
    fetchSelectedMatches();
  }, []);

  // Persist selected theme per tournament
  useEffect(() => {
    try {
      localStorage.setItem('selectedThemeMap', JSON.stringify(selectedThemeMap));
    } catch { }
  }, [selectedThemeMap]);

  // Helper to open the match data viewer for a given graphic
  const openMatchDataViewer = (
    tournamentId: string,
    roundId: string,
    matchId: string,
    theme: string,
    view: string
  ) => {
    if (!matchId) return;
    // Use public route for OBS/browser sources
    const url = `/public/tournament/${tournamentId}/round/${roundId}/match/${matchId}?theme=${encodeURIComponent(theme)}&view=${encodeURIComponent(view)}&followSelected=true`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Helper to open the schedule viewer with selected matches
  const openScheduleViewer = (
    tournamentId: string,
    roundId: string,
    selectedMatchIds: string[],
    theme: string
  ) => {
    if (selectedMatchIds.length === 0) return;
    // For schedule view, we can pass the first match as the main match, but the component will use all matches
    const scheduleMatchesParam = selectedMatchIds.join(',');
    const url = `/public/tournament/${tournamentId}/round/${roundId}/match/${selectedMatchIds[0]}?theme=${encodeURIComponent(theme)}&view=Schedule&followSelected=true&scheduleMatches=${encodeURIComponent(scheduleMatchesParam)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleTournament = (tournamentId: string) => {
    if (expandedTournaments.includes(tournamentId)) {
      setExpandedTournaments(prev => prev.filter(id => id !== tournamentId));
      setExpandedRounds(prev => ({ ...prev, [tournamentId]: null }));
    } else {
      setExpandedTournaments(prev => [...prev, tournamentId]);
      if (!roundsMap[tournamentId]) {
        api.get(`/tournaments/${tournamentId}/rounds`)
          .then(res => setRoundsMap(prev => ({ ...prev, [tournamentId]: res.data })))
          .catch(() => setRoundsMap(prev => ({ ...prev, [tournamentId]: [] })));
      }
    }
  };

  const toggleRound = (tournamentId: string, roundId: string) => {
    const currentExpandedRound = expandedRounds[tournamentId];
    if (currentExpandedRound === roundId) {
      setExpandedRounds(prev => ({ ...prev, [tournamentId]: null }));
    } else {
      setExpandedRounds(prev => ({ ...prev, [tournamentId]: roundId }));

      const key = `${tournamentId}_${roundId}`;
      if (!matchesMap[key]) {
        api.get(`/tournaments/${tournamentId}/rounds/${roundId}/matches`)
          .then(res => setMatchesMap(prev => ({ ...prev, [key]: res.data })))
          .catch(() => setMatchesMap(prev => ({ ...prev, [key]: [] })));
      }
    }
  };

  // Match-specific selection (user-based)
  const onMatchCheckboxChange = async (
    tournamentId: string,
    roundId: string,
    matchId: string,
    checked: boolean
  ) => {
    const key = `${tournamentId}_${roundId}`;

    // Optimistic update: Update local state immediately
    const previousSelectedMatches = { ...selectedMatches };
    setSelectedMatches(prev => ({ ...prev, [key]: checked ? matchId : null }));

    try {
      const res = await api.post('/matchSelection/select', {
        tournamentId,
        roundId,
        matchId
      });

      // Backend returns deselected if user unselected - verify consistency
      if (res.data.deselected) {
        if (checked) {
          // If we tried to check but backend says deselected (e.g. toggle logic), sync with backend
          setSelectedMatches(prev => ({ ...prev, [key]: null }));
        }
      } else {
        if (!checked) {
          // If we tried to uncheck but backend says selected, sync with backend
          setSelectedMatches(prev => ({ ...prev, [key]: matchId }));
        }
      }

      // Force refresh the polling component when match changes
      setPollingKey(prev => prev + 1);
    } catch (err) {
      console.error('Error selecting/deselecting match:', err);
      // Revert to previous state on error
      setSelectedMatches(previousSelectedMatches);
      alert('Failed to update match selection. Please try again.');
    }
  };

  // Schedule match selection (multiple matches for Schedule view)
  const onScheduleMatchCheckboxChange = (
    tournamentId: string,
    roundId: string,
    matchId: string,
    checked: boolean
  ) => {
    const key = `${tournamentId}_${roundId}`;
    setSelectedScheduleMatches(prev => {
      const current = prev[key] || [];
      if (checked) {
        return { ...prev, [key]: [...current, matchId] };
      } else {
        return { ...prev, [key]: current.filter(id => id !== matchId) };
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header/Navigation Bar - Matching Dashboard */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-50">
             <div className="max-w-7xl mx-auto px-6 py-4">
               <div className="flex justify-between items-center">
                 {/* Logo */}
                 <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.href = '/dashboard'}>
                   <img
                     src="./logo.png"
                     alt="ScoreSync Logo"
                     className="w-[70px] h-[70px] rounded-lg shadow-lg"
                   />
                   <div>
                   <h1 className="text-[1rem] font-bold text-white">ESPORTS MANAGEMENT</h1>
                    <h1 className="text-[1rem] font-bold text-white">AND OVERLAY SOFTWARE</h1>
                    </div>
                 </div>
     
                 {/* Navigation Buttons */}
                 <nav className="flex items-center gap-3">
                   <button
                     onClick={() => (window.location.href = '/dashboard')}
                     className="bg-purple-600 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-purple-700 transition-colors"
                   >
                     Tournaments
                   </button>
                   <button
                     onClick={() => window.open('/teams', '_blank', 'noopener,noreferrer')}
                     className="bg-slate-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
                   >
                     Add Teams
                   </button>
                   <button
                     onClick={() => window.open('/displayhud', '_blank', 'noopener,noreferrer')}
                     className="bg-slate-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
                   >
                     Display HUD
                   </button>
                 </nav>
     
                 {/* User Info */}
                 <div className="flex items-center gap-4">
                   {user && (
                     <span className="text-sm text-gray-300 font-medium">
                       Admin: <span className="text-white">{user.username}</span>
                     </span>
                   )}
                   <div className="flex items-center gap-2 text-sm text-gray-300">
                     <span>Help Desk</span>
                     <FaDiscord
                       className="cursor-pointer text-2xl text-gray-300 hover:text-purple-400 transition-colors"
                       onClick={() => window.open('https://discord.com/channels/623776491682922526/1426117227257663558', '_blank')}
                     />
                   </div>
                 </div>
               </div>
             </div>
           </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold text-white mb-8 text-center">Tournament Control Center</h2>
<PollingManager/>
        <div className="space-y-4">
          {tournaments.map(t => (
            <div key={t._id} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all">
              <div
                onClick={() => toggleTournament(t._id)}
                className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-700/30 transition-colors"
              >
                <span className="text-xl font-bold text-white">{t.tournamentName}</span>
                <span className="text-gray-400 text-sm">{expandedTournaments.includes(t._id) ? 'Collapse' : 'Expand'}</span>
              </div>

              {expandedTournaments.includes(t._id) && (
                <div className="p-4 border-t border-slate-700/50 bg-slate-900/30">
                  <div className="flex items-center gap-3 mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/30">
                    <span className="font-semibold text-gray-300">Theme:</span>
                    <select
                      value={getSelectedTheme(t._id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedThemeMap(prev => ({ ...prev, [t._id]: value }));
                      }}
                      className="bg-slate-900 border border-slate-600 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5"
                    >
                      {availableThemes.map(th => (
                        <option key={th} value={th}>{th}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    {roundsMap[t._id]?.length ? roundsMap[t._id].map(r => {
                      const isRoundExpanded = expandedRounds[t._id] === r._id;
                      const key = `${t._id}_${r._id}`;
                      const selectedMatchId = selectedMatches[key];

                      return (
                        <div key={r._id} className="border border-slate-700/50 rounded-lg overflow-hidden">
                          <div
                            onClick={() => toggleRound(t._id, r._id)}
                            className={`p-3 flex justify-between items-center cursor-pointer transition-colors ${isRoundExpanded ? 'bg-slate-700/50' : 'bg-slate-800/30 hover:bg-slate-700/30'}`}
                          >
                            <span className={`font-medium ${isRoundExpanded ? 'text-purple-400' : 'text-gray-200'}`}>{r.roundName}</span>
                            <span className="text-xs text-gray-500">Round</span>
                          </div>

                          {isRoundExpanded && matchesMap[key]?.length > 0 && (
                            <div className="p-4 bg-slate-900/50 border-t border-slate-700/50">
                              {/* Regular match selection */}
                              <div className="mb-6">
                                <div className="font-semibold text-purple-400 mb-3 text-sm uppercase tracking-wider">Select Match for Live Views</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {matchesMap[key].map((m, index) => (
                                    <label key={m._id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${selectedMatchId === m._id ? 'bg-purple-900/30 border-purple-500/50' : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50'}`}>
                                      <input
                                        type="checkbox"
                                        checked={selectedMatchId === m._id}
                                        onChange={e => onMatchCheckboxChange(t._id, r._id, m._id, e.target.checked)}
                                        className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-600 focus:ring-2"
                                      />
                                      <span className="ml-3 text-sm font-medium text-gray-200">{m.matchName || `Match ${index + 1}`}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              {/* Schedule match selection */}
                              <div className="mb-6">
                                <div className="font-semibold text-blue-400 mb-3 text-sm uppercase tracking-wider">Select Matches for Schedule View</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {matchesMap[key].map((m, index) => (
                                    <label key={`schedule-${m._id}`} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${(selectedScheduleMatches[key] || []).includes(m._id) ? 'bg-blue-900/30 border-blue-500/50' : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50'}`}>
                                      <input
                                        type="checkbox"
                                        checked={(selectedScheduleMatches[key] || []).includes(m._id)}
                                        onChange={e => onScheduleMatchCheckboxChange(t._id, r._id, m._id, e.target.checked)}
                                        className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-600 focus:ring-2"
                                      />
                                      <span className="ml-3 text-sm font-medium text-gray-200">{m.matchName || `Match ${index + 1}`}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {isRoundExpanded && matchesMap[key]?.length === 0 && (
                            <div className="p-4 text-center text-gray-500 italic bg-slate-900/50 border-t border-slate-700/50">No matches available</div>
                          )}

                          {isRoundExpanded && (
                            <div className="p-4 bg-slate-800/30 border-t border-slate-700/50">
                              <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                                <div className="text-sm text-gray-400 mb-1">
                                  <span className="font-semibold text-purple-400">Live Match:</span> {selectedMatchId ? (matchesMap[key]?.find((m2: any) => m2._id === selectedMatchId)?.matchName || `Match ${(matchesMap[key]?.find((m2: any) => m2._id === selectedMatchId)?.matchNo || matchesMap[key]?.find((m2: any) => m2._id === selectedMatchId)?._matchNo) || 'N/A'}`) : 'None'}
                                </div>
                                <div className="text-sm text-gray-400">
                                  <span className="font-semibold text-blue-400">Schedule:</span> {(selectedScheduleMatches[key] || []).length > 0 ? (selectedScheduleMatches[key] || []).map(matchId => matchesMap[key]?.find((m2: any) => m2._id === matchId)?.matchName || `Match ${(matchesMap[key]?.find((m2: any) => m2._id === matchId)?.matchNo || matchesMap[key]?.find((m2: any) => m2._id === matchId)?._matchNo) || 'N/A'}`).join(', ') : 'None'}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {['MatchSummary', 'Lower', 'Upper', 'Dom', 'LiveStats', 'LiveFrags', 'Alerts', 'MatchData', 'MatchFragrs', 'CommingUpNext', 'OverAllData', 'OverallFrags', 'WwcdStats', 'WwcdSummary', 'playerH2H', 'TeamH2H', 'Champions', '1stRunnerUp', '2ndRunnerUp', 'EventMvp', 'ZoneClose', 'intro', 'mapPreview', 'slots', 'mvp', 'highlightPoints', 'HighlightSchedule', 'RosterShowCase'].map((viewName) => (
                                  <button
                                    key={viewName}
                                    className="bg-slate-700 hover:bg-purple-600 text-white text-xs font-medium px-3 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 hover:border-purple-500"
                                    disabled={!selectedMatchId}
                                    onClick={() =>
                                      selectedMatchId && openMatchDataViewer(t._id, r._id, selectedMatchId as string, getSelectedTheme(t._id), viewName)
                                    }
                                  >
                                    {viewName}
                                  </button>
                                ))}
                                <button
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
                                  disabled={(selectedScheduleMatches[key] || []).length === 0}
                                  onClick={() =>
                                    openScheduleViewer(t._id, r._id, selectedScheduleMatches[key] || [], getSelectedTheme(t._id))
                                  }
                                >
                                  Schedule ({(selectedScheduleMatches[key] || []).length})
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }) : <div className="text-center py-4 text-gray-500 italic">No rounds available</div>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default DisplayHud;
