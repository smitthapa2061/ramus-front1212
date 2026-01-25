import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { FaTrash, FaEdit } from 'react-icons/fa';
import Group, { GroupRef } from './GroupsData.tsx';
import api from '../login/api.tsx';
import { socket } from './socket.tsx';

interface RoundData {
  _id: string;
  roundName: string;
  roundNumber: number;
  tournamentId?: string;
  day?: string;
  apiEnable?: boolean;
}

const Round: React.FC = () => {
  const { t } = useTranslation();
  const { tournamentId } = useParams<{ tournamentId?: string }>();
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = tournamentId ? `rounds-${tournamentId}` : 'rounds-user';
  const groupRef = useRef<GroupRef>(null);

  // Modal & form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [roundName, setRoundName] = useState('');
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [day, setDay] = useState('');
  const [apiEnable, setApiEnable] = useState(false);

  // Edit states
  const [editRoundId, setEditRoundId] = useState<string | null>(null);
  const [editRoundName, setEditRoundName] = useState('');
  const [editRoundNumber, setEditRoundNumber] = useState<number>(1);
  const [editDay, setEditDay] = useState('');
  const [editApiEnable, setEditApiEnable] = useState(false);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch fresh data, don't use cache for now to ensure apiEnable updates are visible
      let url = tournamentId
        ? `/tournaments/${tournamentId}/rounds`
        : '/user/rounds';

      const { data } = await api.get(url);
      console.log('Fetched rounds:', data); // Debug log
      setRounds(data);
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch rounds');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, cacheKey]);

  useEffect(() => {
    fetchRounds();

    // Listen for real-time round updates
    socket.on('roundUpdated', () => {
      // Clear cache and refetch
      sessionStorage.removeItem(cacheKey);
      fetchRounds();
    });
    return () => {
      socket.off('roundUpdated', fetchRounds);
    };
  }, [tournamentId, cacheKey, fetchRounds]);

  const openAddModal = () => {
    setShowAddModal(true);
    setRoundName('');
    setRoundNumber(rounds.length + 1);
    setDay('');
    setApiEnable(false);
  };

  const closeAddModal = () => setShowAddModal(false);

  const handleAddRound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundName) return;

    try {
      const url = tournamentId
        ? `/tournaments/${tournamentId}/rounds`
        : '/tournaments/undefined/rounds';
      await api.post(url, {
        roundName,
        roundNumber,
        day,
        apiEnable,
      });

      // Clear cache and refetch to get updated apiEnable states
      sessionStorage.removeItem(cacheKey);
      await fetchRounds();

      closeAddModal();
    } catch (err: any) {
      alert(err.message || 'Error creating round');
    }
  };

  const handleDelete = async (roundId: string) => {
    if (!window.confirm('Are you sure you want to delete this round?')) return;
    try {
      const url = tournamentId
        ? `/tournaments/${tournamentId}/rounds/${roundId}`
        : `/rounds/${roundId}`;
      await api.delete(url);

      const updatedRounds = rounds.filter(r => r._id !== roundId);
      setRounds(updatedRounds);
      sessionStorage.setItem(cacheKey, JSON.stringify(updatedRounds));
    } catch (err: any) {
      alert(err.message || 'Error deleting round');
    }
  };

  const handleEditClick = (round: RoundData) => {
    setEditRoundId(round._id);
    setEditRoundName(round.roundName);
    setEditRoundNumber(round.roundNumber);
    setEditDay(round.day || '');
    setEditApiEnable(round.apiEnable || false);
  };

  const handleUpdate = async (roundId: string) => {
    try {
      const url = tournamentId
        ? `/tournaments/${tournamentId}/rounds/${roundId}`
        : `/rounds/${roundId}`;
      await api.put(url, {
        roundName: editRoundName,
        roundNumber: editRoundNumber,
        day: editDay,
        apiEnable: editApiEnable,
      });

      // Clear cache and refetch to get updated apiEnable states
      sessionStorage.removeItem(cacheKey);
      await fetchRounds();

      setEditRoundId(null);
    } catch (err: any) {
      alert(err.message || 'Error updating round');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
          <p className="text-purple-400 font-medium animate-pulse text-lg">Loading Rounds...</p>
        </div>
      </div>
    );
  }
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans">
      <div className="relative z-10 max-w-5xl mx-auto pt-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-white">{t('rounds.title')}</h2>
          <div className="flex gap-3">
            <button
              className="px-6 py-3 rounded-lg text-white font-medium shadow-lg transition-all bg-blue-600 hover:bg-blue-700"
              onClick={() => groupRef.current?.openForm()}
            >
              <span className="text-xl mr-2">+</span> {t('rounds.addGroup')}
            </button>
            <button
              className="px-6 py-3 rounded-lg text-white font-medium shadow-lg transition-all bg-purple-600 hover:bg-purple-700"
              onClick={openAddModal}
            >
              <span className="text-xl mr-2">+</span> {t('rounds.addRound')}
            </button>
          </div>
        </div>

        <Group ref={groupRef} />

        {/* Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <form onSubmit={handleAddRound} className="bg-slate-800 border border-slate-700 p-8 rounded-xl shadow-2xl w-full max-w-md relative overflow-hidden">
              <h3 className="text-xl font-bold mb-6 text-white">{t('rounds.addNewRound')}</h3>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">{t('rounds.roundName')}</label>
                  <input
                    type="text"
                    placeholder="e.g. Grand Finals"
                    value={roundName}
                    onChange={e => setRoundName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">{t('rounds.day')}</label>
                  <input
                    type="text"
                    placeholder="e.g. Day 1"
                    value={day}
                    onChange={e => setDay(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>

                <label className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors group">
                  <input
                    type="checkbox"
                    checked={apiEnable}
                    onChange={e => setApiEnable(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-600 text-red-600 focus:ring-red-500 bg-slate-900/50"
                  />
                  <span className="font-bold text-red-400 group-hover:text-red-300 transition-colors">{t('rounds.enableApi')}</span>
                </label>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  className="flex-1 px-4 py-3 rounded-lg font-medium text-gray-300 bg-slate-700 hover:bg-slate-600 transition-colors"
                  onClick={closeAddModal}
                >
                  {t('rounds.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 rounded-lg font-medium text-white bg-purple-600 hover:bg-purple-700 shadow-lg transition-all"
                >
                  {t('rounds.saveRound')}
                </button>
              </div>
            </form>
          </div>
        )}

        <ul className="space-y-4 pb-12">
          {rounds.map(round => (
            <li key={round._id} className="group relative bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-xl p-5 transition-all duration-200 backdrop-blur-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5">
              {editRoundId === round._id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 ml-1 mb-1 block">{t('rounds.name')}</label>
                      <input
                        type="text"
                        value={editRoundName}
                        onChange={e => setEditRoundName(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 ml-1 mb-1 block">{t('rounds.day')}</label>
                      <input
                        type="text"
                        value={editDay}
                        onChange={e => setEditDay(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-red-400 font-bold p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                    <input
                      type="checkbox"
                      checked={editApiEnable}
                      onChange={e => setEditApiEnable(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-900/50 border-gray-600 text-red-600 focus:ring-red-500"
                    />
                    {t('rounds.enableApi')}
                  </label>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors shadow-lg shadow-green-900/20"
                      onClick={() => handleUpdate(round._id)}
                    >
                      {t('rounds.saveChanges')}
                     </button>
                     <button
                       className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-gray-300 font-medium transition-colors"
                       onClick={() => setEditRoundId(null)}
                     >
                       {t('rounds.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-1.5">
                      {tournamentId ? (
                        <Link
                          to={`/tournaments/${tournamentId}/rounds/${round._id}/matches`}
                          className="hover:text-purple-400 transition-colors flex items-center gap-3"
                        >
                          <span className="px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-400 text-sm font-mono border border-purple-500/30">#{round.roundNumber}</span>
                          {round.roundName}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-3">
                          <span className="px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-400 text-sm font-mono border border-purple-500/30">#{round.roundNumber}</span>
                          {round.roundName}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-400 ml-1">
                      <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-md">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        {round.day || t('rounds.noDaySet')}
                      </span>
                      {round.apiEnable && (
                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                          {t('rounds.apiActive')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-4 group-hover:translate-x-0">
                    <button
                      onClick={() => handleEditClick(round)}
                      className="p-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors"
                      title="Edit"
                    >
                      <FaEdit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(round._id)}
                      className="p-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white transition-colors"
                      title="Delete"
                    >
                      <FaTrash size={16} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Round;
