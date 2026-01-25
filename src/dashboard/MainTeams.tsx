import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback, useMemo, useDeferredValue, useTransition, startTransition } from 'react';
import { flushSync } from 'react-dom';
import axios from 'axios';
import { FaTrash, FaEdit, FaDiscord, FaWhatsapp, FaUpload } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import api from '../login/api.tsx';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.tsx';

interface Player {
  _id?: string;
  playerName: string;
  playerId?: string;
  photo?: string;
}

interface Team {
  _id: string;
  teamFullName: string;
  teamTag: string;
  logo?: string;
  players: Player[];
}

const EMPTY_SET = new Set<string>();

const TeamForm = React.memo(({
  form,
  setForm,
  playersForm,
  setPlayersForm,
  handleTeamInputChange,
  handlePlayerChange,
  addPlayerInput,
  removePlayerInput,
  handleSubmit,
  editingTeamId,
  resetForm,
  handleLogoUpload,
  handlePlayerPhotoUpload
}: {
  form: { teamFullName: string; teamTag: string; logo: string };
  setForm: React.Dispatch<React.SetStateAction<{ teamFullName: string; teamTag: string; logo: string }>>;
  playersForm: Player[];
  setPlayersForm: React.Dispatch<React.SetStateAction<Player[]>>;
  handleTeamInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePlayerChange: (index: number, e: ChangeEvent<HTMLInputElement>) => void;
  addPlayerInput: () => void;
  removePlayerInput: (index: number) => void;
  handleSubmit: (e: FormEvent) => void;
  editingTeamId: string | null;
  resetForm: () => void;
  handleLogoUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePlayerPhotoUpload: (index: number, e: ChangeEvent<HTMLInputElement>) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 mb-8 shadow-xl">
      <h3 className="text-xl font-bold text-white mb-4">
        {editingTeamId ? t('teams.form.editTitle') : t('teams.form.createTitle')}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="teamFullName"
          placeholder="Team Full Name"
          value={form.teamFullName}
          onChange={handleTeamInputChange}
          required
          className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          autoFocus
        />
        <input
          type="text"
          name="teamTag"
          placeholder="Team Tag"
          value={form.teamTag}
          onChange={handleTeamInputChange}
          required
          className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
        />
        <label htmlFor="modal-team-logo-upload" className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white cursor-pointer hover:bg-slate-800/50 focus-within:ring-2 focus-within:ring-purple-500 transition-all w-full">
          <FaUpload size={16} />
          {t('teams.form.uploadLogo')}
        </label>
        <input
          id="modal-team-logo-upload"
          type="file"
          accept="image/*"
          onChange={handleLogoUpload}
          className="hidden"
        />
        {form.logo && (
          <img
            src={form.logo}
            alt="Logo Preview"
            className="w-24 h-24 object-contain my-2 rounded-lg border border-slate-600"
            loading="lazy"
            onError={(e) => e.currentTarget.src = './logo.png'}
          />
        )}

        <h4 className="font-semibold text-white mt-4">{t('teams.form.players')}</h4>
        {playersForm.map((player, index) => (
          <div key={player._id || index} className="flex gap-2 mb-2 items-center">
            <input
              type="text"
              name="playerName"
              placeholder={t('teams.form.playerName')}
              value={player.playerName}
              onChange={(e) => handlePlayerChange(index, e)}
              required
              className="px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all flex-grow"
            />
            <input
              type="text"
              name="playerId"
              placeholder={t('teams.form.playerId')}
              value={player.playerId}
              onChange={(e) => handlePlayerChange(index, e)}
              className="px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all w-36"
            />
            <label htmlFor={`player-photo-${index}`} className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white cursor-pointer hover:bg-slate-800/50 focus-within:ring-2 focus-within:ring-purple-500 transition-all w-40">
              <FaUpload size={10} />
              {t('teams.form.uploadPhoto')}
            </label>
            <input
              id={`player-photo-${index}`}
              type="file"
              accept="image/*"
              onChange={(e) => handlePlayerPhotoUpload(index, e)}
              className="hidden"
            />
            {player.photo && (
              <img
                src={player.photo}
                alt="Player Photo Preview"
                className="w-12 h-12 rounded-full object-cover border-2 border-slate-600"
                loading="lazy"
                onError={(e) => e.currentTarget.src = './def_char.png'}
              />
            )}
            {playersForm.length > 1 && (
              <button
                type="button"
                onClick={() => removePlayerInput(index)}
                className="p-2.5 bg-red-600 rounded-lg hover:bg-red-700 transition-colors text-white"
                title="Remove player"
              >
                <FaTrash />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addPlayerInput}
          className="bg-green-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-green-700 transition-colors mb-4"
        >
          {t('teams.form.addPlayer')}
        </button>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="bg-purple-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-purple-700 transition-colors">
            {editingTeamId ? t('teams.form.updateTeam') : t('teams.form.createTeam')}
          </button>
          {editingTeamId && (
            <button type="button" onClick={resetForm} className="bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-slate-600 transition-colors">
              {t('teams.form.cancel')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

const SearchInput = React.memo(({ onSearchChange }: { onSearchChange: (query: string) => void }) => {
  const { t } = useTranslation();
  const [localQuery, setLocalQuery] = useState('');

  const [, startTransition] = useTransition();

  useEffect(() => {
    const timeout = setTimeout(() => {
      startTransition(() => onSearchChange(localQuery));
    }, localQuery === '' ? 0 : 300);
    return () => clearTimeout(timeout);
  }, [localQuery, onSearchChange]);

  return (
    <input
      type="text"
      placeholder={t('teams.search.placeholder')}
      value={localQuery}
      onChange={(e) => setLocalQuery(e.target.value)}
      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all mb-6"
    />
  );
});

const PlayerRow = React.memo(({
  player,
  isSelected,
  togglePlayer,
  deletePlayer,
  isDeleting,
  teamId
}: {
  player: Player;
  isSelected: boolean;
  togglePlayer: (playerId: string) => void;
  deletePlayer: (teamId: string, playerId: string) => void;
  isDeleting: boolean;
  teamId: string;
}) => {
  return (
    <li className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-slate-700/30 transition-colors group">
      <div className="flex items-center gap-3 flex-grow">
        <div
          onClick={() => togglePlayer(player._id!)}
          className={`w-5 h-5 rounded-md flex items-center justify-center cursor-pointer transition-all duration-200 flex-shrink-0 ${isSelected ? 'bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.5)]' : 'bg-slate-700 border border-slate-600 hover:border-purple-500'}`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
            </svg>
          )}
        </div>
        {player.photo && (
          <img
            src={player.photo}
            alt={player.playerName}
            className="w-7 h-7 rounded-full object-cover border-2 border-slate-600"
            loading="lazy"
            onError={(e) => e.currentTarget.src = './def_char.png'}
          />
        )}
        <span className="text-gray-300">
          <strong className="text-white">{player.playerName}</strong>
          {player.playerId && <span className="text-gray-500 text-xs ml-1">({player.playerId})</span>}
        </span>
      </div>
      {player._id && (
        <button
          onClick={() => deletePlayer(teamId, player._id!)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100"
          title="Delete Player"
          disabled={isDeleting}
        >
          <FaTrash size={12} />
        </button>
      )}
    </li>
  );
});

const TeamCard = React.memo(({
  team,
  selectedForTeam,
  setSelectedPlayersPerTeam,
  startEditTeam,
  deleteTeam,
  deletePlayer,
  deleteSelectedPlayers,
  deletingPlayerIds,
  deletingTeamIds,
  isVisible
}: {
  team: Team;
  selectedForTeam: Set<string>;
  setSelectedPlayersPerTeam: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
  startEditTeam: (team: Team) => void;
  deleteTeam: (id: string) => void;
  deletePlayer: (teamId: string, playerId: string) => void;
  deleteSelectedPlayers: (teamId: string) => void;
  deletingPlayerIds: Set<string>;
  deletingTeamIds: Set<string>;
  isVisible: boolean;
}) => {
  const { t } = useTranslation();
  const togglePlayer = useCallback((playerId: string) => {
    setSelectedPlayersPerTeam((prev) => {
      const newSet = new Set(prev[team._id] || []);
      if (newSet.has(playerId)) newSet.delete(playerId);
      else newSet.add(playerId);
      return { ...prev, [team._id]: newSet };
    });
  }, [team._id, setSelectedPlayersPerTeam]);

  return (
    <div
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all flex flex-col group hover:border-slate-600"
      style={{ display: isVisible ? 'flex' : 'none' }}
    >
      {team.logo && (
        <img
          src={team.logo}
          alt={`${team.teamFullName} logo`}
          className="w-20 h-20 object-contain mb-3 mx-auto rounded-lg"
          loading="lazy"
          onError={(e) => e.currentTarget.src = './logo.png'}
        />
      )}
      <h4 className="font-bold text-white text-center text-lg mb-1">
        {team.teamFullName}
      </h4>
      <p className="text-purple-400 text-center text-sm mb-4">({team.teamTag})</p>

      <div className="w-full mt-2 flex-grow">
        <h5 className="font-semibold text-gray-300 text-sm mb-2">{t('teams.teamCard.players')}</h5>
        {team.players.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('teams.teamCard.noPlayers')}</p>
        ) : (
          <ul className="text-sm space-y-2">
            {team.players.map((player) => (
              <PlayerRow
                key={player._id || player.playerName}
                player={player}
                isSelected={selectedForTeam.has(player._id!)}
                togglePlayer={togglePlayer}
                deletePlayer={deletePlayer}
                isDeleting={deletingPlayerIds.has(player._id!)}
                teamId={team._id}
              />
            ))}
          </ul>
        )}
        {selectedForTeam.size > 0 && (
          <button
            onClick={() => deleteSelectedPlayers(team._id)}
            className="bg-red-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-red-700 transition-colors mt-3 w-full text-sm"
          >
            {t('teams.teamCard.deleteSelected')} ({selectedForTeam.size})
          </button>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700/50 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => startEditTeam(team)}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 rounded-xl hover:from-blue-500 hover:to-blue-600 transition-all text-white font-medium text-sm shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          aria-label={`Edit team ${team.teamFullName}`}
        >
          <FaEdit size={14} /> {t('teams.teamCard.edit')}
        </button>
        <button
          onClick={() => deleteTeam(team._id)}
          className="flex-1 bg-gradient-to-r from-red-600 to-red-700 px-4 py-2.5 rounded-xl hover:from-red-500 hover:to-red-600 transition-all text-white font-medium text-sm shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          aria-label={`Delete team ${team.teamFullName}`}
          disabled={deletingTeamIds.has(team._id)}
        >
          <FaTrash size={12} /> {t('teams.teamCard.delete')}
        </button>
      </div>
    </div>
  );
});

const FormContainer = React.memo(({
  showForm,
  setShowForm,
  editingTeamId,
  setEditingTeamId,
  teams,
  setTeams
}: {
  showForm: boolean;
  setShowForm: React.Dispatch<React.SetStateAction<boolean>>;
  editingTeamId: string | null;
  setEditingTeamId: React.Dispatch<React.SetStateAction<string | null>>;
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
}) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({ teamFullName: '', teamTag: '', logo: '' });
  const [playersForm, setPlayersForm] = useState<Player[]>([
    { playerName: '', playerId: '', photo: '' },
  ]);

  const resetForm = useCallback(() => {
    setEditingTeamId(null);
    setForm({ teamFullName: '', teamTag: '', logo: '' });
    setPlayersForm([{ playerName: '', playerId: '', photo: '' }]);
    setShowForm(false);
  }, [setEditingTeamId, setShowForm]);

  const handleTeamInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handlePlayerChange = useCallback((index: number, e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPlayersForm((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [name]: value };
      return copy;
    });
  }, []);

  const addPlayerInput = useCallback(() => {
    setPlayersForm((prev) => [...prev, { playerName: '', playerId: '', photo: '' }]);
  }, []);

  const removePlayerInput = useCallback((index: number) => {
    setPlayersForm((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleLogoUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadToCloudinary(file, "teams/logos", "team_logo");
      setForm((prev) => ({ ...prev, logo: url }));
    } catch (err) {
      alert("Upload failed");
    }
  }, []);

  const handlePlayerPhotoUpload = useCallback(async (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadToCloudinary(file, "players/photos", "player_photo");
      setPlayersForm((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], photo: url };
        return copy;
      });
    } catch (err) {
      alert("Upload failed");
    }
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();

    if (playersForm.some((p) => p.playerName.trim() === '')) {
      alert('Please fill in all player names');
      return;
    }

    try {
      const payload = { ...form, players: playersForm };
      if (editingTeamId) {
        const res = await api.put(`/teams/${editingTeamId}`, payload);
        setTeams((prev) =>
          prev.map((team) => (team._id === editingTeamId ? res.data : team))
        );
      } else {
        const res = await api.post('/teams', payload);
        setTeams((prev) => [...prev, res.data]);
      }
      resetForm();
    } catch (err) {
      alert('Failed to save team');
      console.error(err);
    }
  }, [form, playersForm, editingTeamId, setTeams, resetForm]);

  useEffect(() => {
    if (editingTeamId) {
      const team = teams.find(t => t._id === editingTeamId);
      if (team) {
        setForm({
          teamFullName: team.teamFullName,
          teamTag: team.teamTag,
          logo: team.logo || '',
        });
        setPlayersForm(team.players.length ? team.players : [{ playerName: '', playerId: '', photo: '' }]);
        setShowForm(true);
      }
    }
  }, [editingTeamId, teams, setShowForm]);

  useEffect(() => {
    if (editingTeamId) {
      const team = teams.find(t => t._id === editingTeamId);
      if (team) {
        setPlayersForm(team.players.length ? team.players : [{ playerName: '', playerId: '', photo: '' }]);
      }
    }
  }, [teams, editingTeamId]);

  // If editing, show as modal; otherwise show as inline form
  if (editingTeamId) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-2 sm:p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl relative flex flex-col max-h-[95vh] sm:max-h-[90vh]">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-700">
            <h3 className="text-xl sm:text-2xl font-bold text-white">{t('teams.form.editTitle')}</h3>
            <button
              onClick={resetForm}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {/* Modal Body - Scrollable */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                name="teamFullName"
                placeholder={t('teams.form.teamName')}
                value={form.teamFullName}
                onChange={handleTeamInputChange}
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                autoFocus
              />
              <input
                type="text"
                name="teamTag"
                placeholder={t('teams.form.teamTag')}
                value={form.teamTag}
                onChange={handleTeamInputChange}
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
              <label htmlFor="team-logo-upload" className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white cursor-pointer hover:bg-slate-800/50 focus-within:ring-2 focus-within:ring-purple-500 transition-all">
                <FaUpload size={16} />
                {t('teams.form.uploadLogo')}
              </label>
              <input
                id="team-logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              {form.logo && (
                <img
                  src={form.logo}
                  alt="Logo Preview"
                  className="w-20 h-20 object-contain rounded-lg border border-slate-600 mx-auto"
                  loading="lazy"
                />
              )}

              <h4 className="font-semibold text-purple-400 mt-4 text-sm uppercase tracking-wider">{t('teams.form.players')}</h4>
              {playersForm.map((player, index) => (
                <div key={player._id || index} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-slate-900/30 p-3 rounded-lg border border-slate-700/30 mb-2">
                  <input
                    type="text"
                    name="playerName"
                    placeholder={t('teams.form.playerName')}
                    value={player.playerName}
                    onChange={(e) => handlePlayerChange(index, e)}
                    required
                    className="px-3 py-2 bg-slate-800 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all w-full sm:flex-grow text-sm"
                  />
                  <input
                    type="text"
                    name="playerId"
                    placeholder={t('teams.form.playerId')}
                    value={player.playerId}
                    onChange={(e) => handlePlayerChange(index, e)}
                    className="px-3 py-2 bg-slate-800 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all w-full sm:w-24 text-sm"
                  />
                  <label htmlFor={`modal-player-photo-${index}`} className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 border border-slate-600/50 rounded-lg text-white cursor-pointer hover:bg-slate-700 focus-within:ring-2 focus-within:ring-purple-500 transition-all w-full sm:w-28 text-sm">
                    <FaUpload size={12} />
                    {t('teams.form.uploadPhoto')}
                  </label>
                  <input
                    id={`modal-player-photo-${index}`}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePlayerPhotoUpload(index, e)}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2 sm:ml-auto">
                    {player.photo && (
                      <img
                        src={player.photo}
                        alt="Player Photo Preview"
                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-600"
                        loading="lazy"
                        onError={(e) => e.currentTarget.src = './def_char.png'}
                      />
                    )}
                    {playersForm.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePlayerInput(index)}
                        className="p-2 bg-red-600/20 rounded-lg hover:bg-red-600/40 transition-colors text-red-400"
                        title="Remove player"
                      >
                        <FaTrash size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addPlayerInput}
                className="bg-green-600/20 text-green-400 font-medium px-4 py-2 rounded-lg hover:bg-green-600/30 transition-colors text-sm border border-green-600/30"
              >
                {t('teams.form.addPlayer')}
              </button>

              {/* Modal Footer */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-700 mt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full sm:flex-1 px-5 py-2.5 rounded-xl font-medium text-gray-300 bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  {t('teams.form.cancel')}
                </button>
                <button
                  type="submit"
                  className="w-full sm:flex-1 px-5 py-2.5 rounded-xl font-medium text-white bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-900/20 transition-all"
                >
                  {t('teams.form.updateTeam')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Show inline form for creating new team
  return (
    <div style={{ display: showForm ? 'block' : 'none' }}>
      <TeamForm form={form} setForm={setForm} playersForm={playersForm} setPlayersForm={setPlayersForm} handleTeamInputChange={handleTeamInputChange} handlePlayerChange={handlePlayerChange} addPlayerInput={addPlayerInput} removePlayerInput={removePlayerInput} handleSubmit={handleSubmit} editingTeamId={editingTeamId} resetForm={resetForm} handleLogoUpload={handleLogoUpload} handlePlayerPhotoUpload={handlePlayerPhotoUpload} />
    </div>
  );
});

const Teams: React.FC = () => {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [selectedPlayersPerTeam, setSelectedPlayersPerTeam] = useState<Record<string, Set<string>>>({});
  const [user, setUser] = useState<any>(null);
  const [deferredSearchQuery, setDeferredSearchQuery] = useState('');

  const [deletingPlayerIds, setDeletingPlayerIds] = useState<Set<string>>(new Set());
  const [deletingTeamIds, setDeletingTeamIds] = useState<Set<string>>(new Set());

  // Refs for memoized handlers to avoid re-renders
  const deletingTeamIdsRef = React.useRef(deletingTeamIds);
  const deletingPlayerIdsRef = React.useRef(deletingPlayerIds);
  const selectedPlayersPerTeamRef = React.useRef(selectedPlayersPerTeam);

  useEffect(() => {
    deletingTeamIdsRef.current = deletingTeamIds;
  }, [deletingTeamIds]);

  useEffect(() => {
    deletingPlayerIdsRef.current = deletingPlayerIds;
  }, [deletingPlayerIds]);

  useEffect(() => {
    selectedPlayersPerTeamRef.current = selectedPlayersPerTeam;
  }, [selectedPlayersPerTeam]);

  useEffect(() => {
    selectedPlayersPerTeamRef.current = selectedPlayersPerTeam;
  }, [selectedPlayersPerTeam]);

  const filteredTeamIds = useMemo(() => {
    const ids = new Set<string>();
    teams.forEach(team => {
      if (team.teamFullName.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
        team.teamTag.toLowerCase().includes(deferredSearchQuery.toLowerCase())) {
        ids.add(team._id);
      }
    });
    return ids;
  }, [teams, deferredSearchQuery]);

  const handleAddTeamClick = useCallback(() => {
    flushSync(() => {
      if (showForm) {
        setShowForm(false);
        setEditingTeamId(null);
      } else {
        setShowForm(true);
      }
    });
  }, [showForm]);

  const startEditTeam = useCallback((team: Team) => {
    setEditingTeamId(team._id);
  }, []);

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

  useEffect(() => {
    checkAuth();
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const res = await api.get<Team[]>('/teams');
      setTeams(res.data);
    } catch (err) {
      console.error('Fetch teams failed:', err);
    }
  };

  // Navigation button handlers
  const goToTournaments = () => {
    window.location.href = '/dashboard'; // adjust route as needed
  };
  const goToAddTeams = () => {
    setShowForm(true);
  };
  const goToDisplayHUD = () => {
    window.location.href = '/displayhud'; // adjust route as needed
  };



  const deleteTeam = useCallback(async (id: string) => {
    if (!window.confirm('Delete this team?')) return;
    if (deletingTeamIdsRef.current.has(id)) return;

    setDeletingTeamIds((prev) => new Set(prev).add(id));
    setTeams((prev) => prev.filter((team) => team._id !== id));

    try {
      await api.delete(`/teams/${id}`);
    } catch (err) {
      alert('Failed to delete team');
      console.error(err);
      fetchTeams();
    } finally {
      setDeletingTeamIds((prev) => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
    }
  }, []);

  const deletePlayer = useCallback(async (teamId: string, playerId: string) => {
    if (!window.confirm('Delete this player?')) return;
    if (deletingPlayerIdsRef.current.has(playerId)) return;

    setDeletingPlayerIds((prev) => new Set(prev).add(playerId));
    try {
      await api.delete(`/teams/${teamId}/players/${playerId}`);

      setTeams((prev) =>
        prev.map((team) =>
          team._id === teamId
            ? { ...team, players: team.players.filter((p) => p._id !== playerId) }
            : team
        )
      );

    } catch (err) {
      alert('Failed to delete player');
      console.error(err);
    } finally {
      setDeletingPlayerIds((prev) => {
        const copy = new Set(prev);
        copy.delete(playerId);
        return copy;
      });
    }
  }, []);

  const deleteSelectedPlayers = useCallback(async (teamId: string) => {
    const selectedSet = selectedPlayersPerTeamRef.current[teamId];
    if (!selectedSet || selectedSet.size === 0) return;
    if (!window.confirm('Delete selected players?')) return;

    const playerIdsArray = Array.from(selectedSet);

    try {
      await api.delete(`/teams/${teamId}/players`, {
        data: { playerIds: playerIdsArray },
      });

      setTeams((prev) =>
        prev.map((team) =>
          team._id === teamId
            ? { ...team, players: team.players.filter((p) => !selectedSet.has(p._id!)) }
            : team
        )
      );


      // Clear selection for this team only
      setSelectedPlayersPerTeam((prev) => ({ ...prev, [teamId]: new Set() }));
    } catch (err) {
      alert('Failed to delete selected players');
      console.error(err);
    }
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header/Navigation Bar - Matching Dashboard */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
                {/* Logo */}
                <div className="flex items-center gap-3">
                  <img
                    src="./logo.png"
                    alt="ScoreSync Logo"
                    className="w-[70px] h-[70px] rounded-lg shadow-lg"
                  />
                  <div>
                  <h1 className="text-[1rem] font-bold text-white">{t('dashboard.header.title')}</h1>
                   <h1 className="text-[1rem] font-bold text-white">{t('dashboard.header.subtitle')}</h1>
                   </div>
                </div>
    
                {/* Navigation Buttons */}
                <nav className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
                  <button
                    onClick={() => (window.location.href = '/dashboard')}
                    className="bg-purple-600 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    {t('dashboard.nav.tournaments')}
                  </button>
                  <button
                    onClick={() => window.open('/teams', '_blank', 'noopener,noreferrer')}
                    className="bg-slate-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    {t('dashboard.nav.teams')}
                  </button>
                  <button
                    onClick={() => window.open('/displayhud', '_blank', 'noopener,noreferrer')}
                    className="bg-slate-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    {t('dashboard.nav.hud')}
                  </button>
                </nav>
    
                {/* User Info */}
                <div className="flex items-center gap-2 md:gap-4">
                  {user && (
                    <span className="text-sm text-gray-300 font-medium">
                      {t('dashboard.header.admin')}<span className="text-white">{user.username}</span>
                    </span>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span>{t('dashboard.header.help')}</span>
                    <FaDiscord
                      className="cursor-pointer text-2xl text-gray-300 hover:text-purple-400 transition-colors"
                      onClick={() => window.open('https://discord.com/channels/623776491682922526/1426117227257663558', '_blank')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </header>
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">{t('teams.header.title')}</h2>
          <p className="text-gray-400">{t('teams.header.subtitle')}</p>
        </div>

        {/* Add Team Button */}
        <button
          onClick={handleAddTeamClick}
          className="bg-purple-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors mb-6 shadow-lg"
        >
          {showForm ? t('teams.form.cancel') : editingTeamId ? t('teams.form.editTitle') : '+ ' + t('dashboard.nav.teams')}
        </button>

        <FormContainer showForm={showForm} setShowForm={setShowForm} editingTeamId={editingTeamId} setEditingTeamId={setEditingTeamId} teams={teams} setTeams={setTeams} />


        {/* Teams List */}
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-white mb-4">{t('dashboard.nav.teams')}</h3>
          <SearchInput onSearchChange={setDeferredSearchQuery} />
        </div>

        <div style={{ display: filteredTeamIds.size === 0 ? 'block' : 'none' }}>
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-400 mb-2">{t('teams.messages.noTeams')}</h3>
            <p className="text-gray-500 mb-6">{t('teams.messages.createFirst')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" style={{ display: filteredTeamIds.size > 0 ? 'grid' : 'none' }}>
          {teams.map((team) => (
            <TeamCard
              key={team._id}
              team={team}
              selectedForTeam={selectedPlayersPerTeam[team._id] || EMPTY_SET}
              setSelectedPlayersPerTeam={setSelectedPlayersPerTeam}
              startEditTeam={startEditTeam}
              deleteTeam={deleteTeam}
              deletePlayer={deletePlayer}
              deleteSelectedPlayers={deleteSelectedPlayers}
              deletingPlayerIds={deletingPlayerIds}
              deletingTeamIds={deletingTeamIds}
              isVisible={filteredTeamIds.has(team._id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
};

export default Teams;
