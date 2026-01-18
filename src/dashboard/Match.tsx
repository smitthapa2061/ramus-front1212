import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../login/api.tsx'; // <-- your axios instance

interface Match {
  _id: string;
  matchNo: number;
  time: string;
  map: string;
  groups?: {
    _id: string;
    groupName: string;
    slots?: {
      _id: string;
      slot: number;
      team: {
        _id: string;
        teamFullName: string;
      };
    }[];
  }[];
}

interface GroupData {
  _id: string;
  groupName: string;
  slots?: {
    _id: string;
    slot: number;
    team: {
      _id: string;
      teamFullName: string;
    };
  }[];
}

const Match: React.FC = () => {
  const { tournamentId, roundId } = useParams<{ tournamentId: string; roundId: string }>();
  const navigate = useNavigate();

  const [matches, setMatches] = useState<Match[]>([]);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newMatchNo, setNewMatchNo] = useState<number>(1);
  const [newTime, setNewTime] = useState<string>('00:00');
  const [newMap, setNewMap] = useState<string>('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const [editMatchId, setEditMatchId] = useState<string | null>(null);
  const [editMatchNo, setEditMatchNo] = useState<number>(1);
  const [editTime, setEditTime] = useState<string>('00:00');
  const [editMap, setEditMap] = useState<string>('');

  // ---- Cache refs ----
  const matchesCache = useRef<Record<string, Match[]>>({});
  const groupsCache = useRef<Record<string, GroupData[]>>({});

  const to24HourFormat = (time: string) => {
    if (!time) return '00:00';
    if (!time.includes('AM') && !time.includes('PM')) return time;
    const [t, modifier] = time.split(' ');
    let [hours, minutes] = t.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const fetchData = async () => {
    if (!tournamentId || !roundId) return;
    const cacheKey = `${tournamentId}-${roundId}`;
    setLoading(true);

    // Check cache first
    if (matchesCache.current[cacheKey]) {
      setMatches(matchesCache.current[cacheKey]);
      if (groupsCache.current[tournamentId]) {
        setGroups(groupsCache.current[tournamentId]);
      }
      setLoading(false);
      return;
    }

    try {
      const matchesPromise = api.get(`/tournaments/${tournamentId}/rounds/${roundId}/matches`);
      const groupsPromise = groupsCache.current[tournamentId]
        ? Promise.resolve({ data: groupsCache.current[tournamentId] })
        : api.get(`/tournaments/${tournamentId}/groups`);

      const [matchesRes, groupsRes] = await Promise.all([matchesPromise, groupsPromise]);

      setMatches(matchesRes.data);
      setGroups(groupsRes.data);

      // Save to cache
      matchesCache.current[cacheKey] = matchesRes.data;
      groupsCache.current[tournamentId] = groupsRes.data;

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tournamentId, roundId]);

  const [isCreating, setIsCreating] = useState(false);

  // ----- Add Match -----
  const handleAddMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMap.trim()) return alert('Please enter the map name.');
    if (!newTime) return alert('Please enter a valid time.');
    if (selectedGroupIds.length === 0) return alert('Select at least one group.');

    setIsCreating(true);
    try {
      const res = await api.post(`/tournaments/${tournamentId}/rounds/${roundId}/matches`, {
        matchNo: newMatchNo,
        time: newTime,
        map: newMap.trim(),
        groupIds: selectedGroupIds,
      });

      const addedMatch = {
        ...res.data.match,
        groups: groups.filter((g) => selectedGroupIds.includes(g._id)),
      };

      // Clear frontend cache
      delete matchesCache.current[`${tournamentId}-${roundId}`];

      setMatches((prev) => [...prev, addedMatch]);

      setNewMatchNo(newMatchNo + 1);
      setNewTime('00:00');
      setNewMap('');
      setSelectedGroupIds([]);
      setShowAddForm(false);
    } catch (err: any) {
      alert(err.message || 'Error adding match');
    } finally {
      setIsCreating(false);
    }
  };

  // ----- Edit Match -----
  const startEdit = (match: Match) => {
    setEditMatchId(match._id);
    setEditMatchNo(match.matchNo);
    setEditTime(to24HourFormat(match.time));
    setEditMap(match.map);
  };

  const handleUpdateMatch = async (matchId: string) => {
    if (!editMap.trim()) return alert('Please enter the map name.');
    if (!editTime) return alert('Please enter a valid time.');

    try {
      const res = await api.put(`/tournaments/${tournamentId}/rounds/${roundId}/matches/${matchId}`, {
        matchNo: editMatchNo,
        time: editTime,
        map: editMap.trim(),
        groupIds: selectedGroupIds, // Assuming groups might be editable in future, but keeping simple for now
      });

      // Clear frontend cache
      delete matchesCache.current[`${tournamentId}-${roundId}`];

      setMatches((prev) => prev.map((m) => (m._id === matchId ? res.data : m)));

      setEditMatchId(null);
    } catch (err: any) {
      alert(err.message || 'Error updating match');
    }
  };

  // ----- Delete Match -----
  const handleDeleteMatch = async (matchId: string) => {
    if (!window.confirm('Are you sure you want to delete this match?')) return;

    try {
      await api.delete(`/tournaments/${tournamentId}/rounds/${roundId}/matches/${matchId}`);

      // Clear frontend cache
      delete matchesCache.current[`${tournamentId}-${roundId}`];

      setMatches((prev) => prev.filter((m) => m._id !== matchId));
    } catch (err: any) {
      alert(err.message || 'Error deleting match');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
          <p className="text-purple-400 font-medium animate-pulse text-lg">Loading Matches...</p>
        </div>
      </div>
    );
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <p className="text-red-500 font-semibold text-xl">Error: {error}</p>
    </div>
  );

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans">
      <div className="max-w-5xl mx-auto pt-8">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">Matches</h2>
            <p className="text-gray-400 mt-1">Manage matches for this round</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className={`px-6 py-3 rounded-lg font-medium shadow-lg transition-all ${showAddForm
              ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
          >
            {showAddForm ? 'Cancel' : '+ Add Match'}
          </button>
        </div>

        {showAddForm && (
          <div className="mb-8 p-8 border border-slate-700/50 rounded-xl bg-slate-800/50 backdrop-blur-sm shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-xl font-bold mb-6 text-white border-b border-slate-700 pb-4">Add New Match</h3>
            <form onSubmit={handleAddMatch} className="space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label htmlFor="newMatchNo" className="block mb-2 text-sm font-medium text-gray-400">
                    Match Number
                  </label>
                  <input
                    id="newMatchNo"
                    type="number"

                    value={newMatchNo}
                    onChange={(e) => setNewMatchNo(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="newTime" className="block mb-2 text-sm font-medium text-gray-400">
                    Match Time
                  </label>
                  <input
                    id="newTime"
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="newMap" className="block mb-2 text-sm font-medium text-gray-400">
                    Map Name
                  </label>
                  <select
                    id="newMap"
                    value={newMap}
                    onChange={(e) => setNewMap(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none"
                    required
                  >
                    <option value="" className="bg-slate-800">Select a map</option>
                    <option value="Erangel" className="bg-slate-800">Erangel</option>
                    <option value="Miramar" className="bg-slate-800">Miramar</option>
                    <option value="Sanhok" className="bg-slate-800">Sanhok</option>
                    <option value="Rondo" className="bg-slate-800">Rondo</option>
                    <option value="Bermuda" className="bg-slate-800">Bermuda</option>
                    <option value="Alpine" className="bg-slate-800">Alpine</option>
                    <option value="Nexterra" className="bg-slate-800">Nexterra</option>
                    <option value="Purgatory" className="bg-slate-800">Purgatory</option>
                    <option value="Kalahari" className="bg-slate-800">Kalahari</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="block mb-3 text-sm font-medium text-gray-400">Select Groups</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {groups.map((group) => (
                    <label
                      key={group._id}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${selectedGroupIds.includes(group._id)
                        ? 'bg-purple-600/20 border-purple-500 text-white'
                        : 'bg-slate-900/30 border-slate-700 text-gray-400 hover:bg-slate-800'
                        }`}
                    >
                      <input
                        type="checkbox"
                        value={group._id}
                        checked={selectedGroupIds.includes(group._id)}
                        onChange={() => {
                          if (selectedGroupIds.includes(group._id)) {
                            setSelectedGroupIds(selectedGroupIds.filter((id) => id !== group._id));
                          } else {
                            setSelectedGroupIds([...selectedGroupIds, group._id]);
                          }
                        }}
                        className="mr-3 w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                      />
                      <span className="truncate">{group.groupName}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className={`w-full py-3 rounded-lg font-bold shadow-lg transition-all mt-4 flex items-center justify-center gap-2 ${isCreating
                  ? 'bg-purple-600/50 cursor-not-allowed text-gray-300'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
              >
                {isCreating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  'Create Match'
                )}
              </button>
            </form>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/30 border-dashed">
            <p className="text-xl text-gray-500 font-medium">No matches scheduled yet.</p>
            <p className="text-gray-600 mt-2">Click "Add Match" to get started.</p>
          </div>
        ) : (
          <ul className="space-y-4 pb-12">
            {matches.map((match) => (
              <li
                key={match._id}
                onClick={() => {
                  if (editMatchId !== match._id) {
                    navigate(`/tournaments/${tournamentId}/rounds/${roundId}/matches/${match._id}`);
                  }
                }}
                className="group relative bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-xl p-6 transition-all duration-200 backdrop-blur-sm shadow-lg hover:shadow-xl cursor-pointer"
              >
                {editMatchId === match._id ? (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        type="number"
                        min={1}
                        value={editMatchNo}
                        onChange={(e) => setEditMatchNo(parseInt(e.target.value) || 1)}
                        className="px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-purple-500"
                        placeholder="Match No"
                      />
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-purple-500"
                      />
                      <select
                        value={editMap}
                        onChange={(e) => setEditMap(e.target.value)}
                        className="px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="" className="bg-slate-800">Select Map</option>
                        <option value="Erangel" className="bg-slate-800">Erangel</option>
                        <option value="Miramar" className="bg-slate-800">Miramar</option>
                        <option value="Sanhok" className="bg-slate-800">Sanhok</option>
                        <option value="Rondo" className="bg-slate-800">Rondo</option>
                        <option value="Bermuda" className="bg-slate-800">Bermuda</option>
                        <option value="Alpine" className="bg-slate-800">Alpine</option>
                        <option value="Nexterra" className="bg-slate-800">Nexterra</option>
                        <option value="Purgatory" className="bg-slate-800">Purgatory</option>
                        <option value="Kalahari" className="bg-slate-800">Kalahari</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setEditMatchId(null)}
                        className="px-4 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateMatch(match._id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-lg"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 bg-purple-500/20 text-purple-300 text-xs font-bold rounded-full border border-purple-500/30">
                          MATCH {match.matchNo}
                        </span>
                        <span className="text-gray-400 text-sm flex items-center gap-1">
                          🕒 {match.time}
                        </span>
                      </div>

                      <h3 className="text-xl font-bold text-white mb-1">{match.map}</h3>

                      {match.groups && match.groups.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {match.groups.map((g) => (
                            <span key={g._id} className="px-2 py-1 bg-slate-700/50 text-gray-300 text-xs rounded border border-slate-600/30">
                              {g.groupName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(match);
                        }}
                        className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMatch(match._id);
                        }}
                        className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600 hover:text-white transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Match;
