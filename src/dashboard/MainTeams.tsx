import React, {
  useState, useEffect, ChangeEvent, FormEvent,
  useCallback, useMemo, useTransition, memo
} from 'react';
import { flushSync } from 'react-dom';
import { FaTrash, FaEdit, FaDiscord, FaUpload, FaTrophy, FaUsers, FaEye } from 'react-icons/fa';
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

const CYBER_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&display=swap');
  .cyber-root * { font-family: 'Rajdhani', sans-serif; }
  .orbitron { font-family: 'Orbitron', monospace; }
  .sidebar-btn {
    display: flex; flex-direction: column; align-items: center;
    color: #6b7280; cursor: pointer;
    padding: 10px; border-radius: 12px; width: 64px;
    border: 1px solid transparent; background: transparent;
    transition: color 0.2s, background 0.2s, border-color 0.2s, box-shadow 0.2s;
  }
  .sidebar-btn:hover {
    color: #4ade80; background: rgba(74,222,128,0.08);
    border-color: rgba(74,222,128,0.3); box-shadow: 0 0 16px rgba(74,222,128,0.2);
  }
  .sidebar-btn.active {
    color: #4ade80; background: rgba(74,222,128,0.12);
    border-color: rgba(74,222,128,0.5); box-shadow: 0 0 20px rgba(74,222,128,0.3);
  }
  .glass-dark {
    background: rgba(0,0,0,0.55); backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(74,222,128,0.3);
  }
  .neon-border {
    border: 1px solid rgba(74,222,128,0.4);
    box-shadow: 0 0 12px rgba(74,222,128,0.12), inset 0 0 10px rgba(74,222,128,0.03);
  }
  .input-cyber {
    width: 100%; padding: 11px 14px;
    background: rgba(0,0,0,0.6); border: 1px solid rgba(74,222,128,0.3);
    border-radius: 8px; color: #fff; font-family: 'Rajdhani', sans-serif;
    font-size: 14px; letter-spacing: 0.4px;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none; box-sizing: border-box;
  }
  .input-cyber::placeholder { color: rgba(156,163,175,0.55); }
  .input-cyber:focus {
    border-color: rgba(74,222,128,0.8);
    box-shadow: 0 0 0 3px rgba(74,222,128,0.12), 0 0 14px rgba(74,222,128,0.15);
  }
  .btn-primary {
    background: linear-gradient(135deg, #16a34a, #15803d);
    color: #fff; border: 1px solid rgba(74,222,128,0.5);
    font-family: 'Orbitron', monospace; font-size: 11px;
    letter-spacing: 1px; padding: 10px 20px; border-radius: 8px;
    cursor: pointer; font-weight: 600;
    transition: background 0.2s, box-shadow 0.2s;
  }
  .btn-primary:hover {
    background: linear-gradient(135deg, #15803d, #166534);
    box-shadow: 0 0 18px rgba(74,222,128,0.35);
  }
  .btn-ghost {
    background: rgba(0,0,0,0.5); color: #9ca3af;
    border: 1px solid rgba(74,222,128,0.2);
    font-family: 'Rajdhani', sans-serif; font-size: 14px;
    padding: 10px 20px; border-radius: 8px;
    cursor: pointer; font-weight: 600;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }
  .btn-ghost:hover {
    background: rgba(74,222,128,0.08); color: #4ade80;
    border-color: rgba(74,222,128,0.4);
  }
  .btn-danger {
    background: rgba(220,38,38,0.15); color: #f87171;
    border: 1px solid rgba(220,38,38,0.3);
    font-family: 'Rajdhani', sans-serif; font-size: 13px;
    padding: 8px 14px; border-radius: 8px;
    cursor: pointer; font-weight: 600;
    transition: background 0.2s, box-shadow 0.2s;
  }
  .btn-danger:hover { background: rgba(220,38,38,0.3); box-shadow: 0 0 12px rgba(220,38,38,0.25); }
  .btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-blue {
    background: rgba(37,99,235,0.15); color: #60a5fa;
    border: 1px solid rgba(37,99,235,0.3);
    font-family: 'Rajdhani', sans-serif; font-size: 13px;
    padding: 8px 14px; border-radius: 8px;
    cursor: pointer; font-weight: 600;
    transition: background 0.2s, box-shadow 0.2s;
  }
  .btn-blue:hover { background: rgba(37,99,235,0.3); box-shadow: 0 0 12px rgba(37,99,235,0.25); }
  .btn-green-ghost {
    background: rgba(74,222,128,0.08); color: #4ade80;
    border: 1px solid rgba(74,222,128,0.25);
    font-family: 'Rajdhani', sans-serif; font-size: 13px;
    padding: 8px 16px; border-radius: 8px;
    cursor: pointer; font-weight: 600;
    transition: background 0.2s, box-shadow 0.2s;
  }
  .btn-green-ghost:hover { background: rgba(74,222,128,0.15); box-shadow: 0 0 10px rgba(74,222,128,0.18); }
  .scan-line {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none; z-index: 999; opacity: 0.022;
    background: repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(74,222,128,0.4) 2px, rgba(74,222,128,0.4) 4px
    );
  }
  .hex-bg {
    position: fixed; inset: 0; pointer-events: none;
    background-image: radial-gradient(circle, rgba(74,222,128,0.06) 1px, transparent 1px);
    background-size: 40px 40px; z-index: 0;
  }
  .tag {
    display: inline-block; background: rgba(74,222,128,0.1);
    border: 1px solid rgba(74,222,128,0.25); color: #4ade80; font-size: 10px;
    padding: 2px 7px; border-radius: 4px;
    font-family: 'Orbitron', monospace; letter-spacing: 0.5px;
  }
  .team-card {
    background: rgba(255,255,255,0.03); backdrop-filter: blur(16px);
    border: 1px solid rgba(74,222,128,0.15); border-radius: 16px; overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .team-card:hover {
    border-color: rgba(74,222,128,0.4);
    box-shadow: 0 0 28px rgba(74,222,128,0.18), 0 16px 36px rgba(0,0,0,0.4);
  }
  .team-card .card-actions { opacity: 0; transition: opacity 0.2s; }
  .team-card:hover .card-actions { opacity: 1; }
  .player-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; border-radius: 7px; transition: background 0.15s;
  }
  .player-row:hover { background: rgba(74,222,128,0.06); }
  .player-row .del-btn { opacity: 0; transition: opacity 0.15s; }
  .player-row:hover .del-btn { opacity: 1; }
  .checkbox-cyber {
    width: 18px; height: 18px; border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .checkbox-cyber.checked {
    background: #16a34a; box-shadow: 0 0 8px rgba(74,222,128,0.45); border: 1px solid #4ade80;
  }
  .checkbox-cyber.unchecked {
    background: rgba(0,0,0,0.4); border: 1px solid rgba(74,222,128,0.3);
  }
  .checkbox-cyber.unchecked:hover { border-color: #4ade80; }
  .player-form-row {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    background: rgba(0,0,0,0.35); border: 1px solid rgba(74,222,128,0.12);
    border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
  }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.82);
    backdrop-filter: blur(10px); display: flex; align-items: center;
    justify-content: center; z-index: 200; padding: 16px;
  }
  .modal-box {
    width: 100%; max-width: 640px; max-height: 92vh; overflow-y: auto;
    border-radius: 18px; background: rgba(5,10,5,0.96);
    border: 1px solid rgba(74,222,128,0.35);
    box-shadow: 0 0 50px rgba(74,222,128,0.1), 0 40px 80px rgba(0,0,0,0.7);
    display: flex; flex-direction: column;
  }
  .modal-box::-webkit-scrollbar { width: 6px; }
  .modal-box::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
  .modal-box::-webkit-scrollbar-thumb { background: rgba(74,222,128,0.3); border-radius: 3px; }
  .close-btn {
    background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.2);
    border-radius: 8px; padding: 6px 8px; cursor: pointer; color: #9ca3af;
    display: flex; align-items: center; transition: color 0.15s, background 0.15s;
  }
  .close-btn:hover { color: #fff; background: rgba(74,222,128,0.15); }
`;

/* ─────────────────────────────────────────────
   PlayerRow
───────────────────────────────────────────── */
const PlayerRow = memo(({
  player, isSelected, onToggle, onDelete, isDeleting, teamId,
}: {
  player: Player;
  isSelected: boolean;
  onToggle: (playerId: string) => void;
  onDelete: (teamId: string, playerId: string) => void;
  isDeleting: boolean;
  teamId: string;
}) => {
  const handleToggle = useCallback(() => onToggle(player._id!), [player._id, onToggle]);
  const handleDelete = useCallback(() => onDelete(teamId, player._id!), [teamId, player._id, onDelete]);

  return (
    <li className="player-row">
      <div className={`checkbox-cyber ${isSelected ? 'checked' : 'unchecked'}`} onClick={handleToggle}>
        {isSelected && (
          <svg width="10" height="10" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      {player.photo && (
        <img src={player.photo} alt={player.playerName}
          style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover',
            border: '1px solid rgba(74,222,128,0.3)', flexShrink: 0 }}
          loading="lazy" onError={(e) => e.currentTarget.src = './def_char.png'} />
      )}
      <span style={{ flex: 1, fontSize: 12, color: '#d1d5db', minWidth: 0 }}>
        <strong style={{ color: '#fff' }}>{player.playerName}</strong>
        {player.playerId && (
          <span style={{ color: '#6b7280', fontSize: 10, marginLeft: 3 }}>({player.playerId})</span>
        )}
      </span>
      {player._id && (
        <button className="del-btn" onClick={handleDelete} disabled={isDeleting}
          style={{ padding: '3px 5px', background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.22)', borderRadius: 5,
            cursor: 'pointer', color: '#f87171', transition: 'background 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(220,38,38,0.28)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(220,38,38,0.12)')}>
          <FaTrash size={9} />
        </button>
      )}
    </li>
  );
});

/* ─────────────────────────────────────────────
   TeamCard
───────────────────────────────────────────── */
const TeamCard = memo(({
  team, onEdit, onDelete, onDeletePlayer, onDeleteSelectedPlayers,
  deletingTeamIds, deletingPlayerIds,
}: {
  team: Team;
  onEdit: (team: Team) => void;
  onDelete: (id: string) => void;
  onDeletePlayer: (teamId: string, playerId: string) => void;
  onDeleteSelectedPlayers: (teamId: string, playerIds: string[]) => Promise<void>;
  deletingTeamIds: Set<string>;
  deletingPlayerIds: Set<string>;
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // When team.players changes (e.g. after deletion), prune stale selected ids
  useEffect(() => {
    setSelected((prev) => {
      const validIds = new Set(team.players.map((p) => p._id!).filter(Boolean));
const pruned = new Set(Array.from(prev).filter((id) => validIds.has(id)));      return pruned.size === prev.size ? prev : pruned;
    });
  }, [team.players]);

  const togglePlayer = useCallback((playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    if (!window.confirm('Delete selected players?')) return;
    try {
      await onDeleteSelectedPlayers(team._id, Array.from(selected));
      setSelected(new Set());
    } catch {
      // error already handled + alerted in root
    }
  }, [selected, team._id, onDeleteSelectedPlayers]);

  const handleEdit = useCallback(() => onEdit(team), [onEdit, team]);
  const handleDelete = useCallback(() => onDelete(team._id), [onDelete, team._id]);

  return (
    <div className="team-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 3, flexShrink: 0,
        background: 'linear-gradient(90deg, #4ade80, #166534, transparent)' }} />
      <div style={{ padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* Logo + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
          {team.logo ? (
            <img src={team.logo} alt={team.teamFullName}
              style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 10,
                marginBottom: 8, border: '1px solid rgba(74,222,128,0.3)' }}
              loading="lazy" onError={(e) => e.currentTarget.src = './logo.png'} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 10, marginBottom: 8,
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaUsers size={22} style={{ color: '#4ade80', opacity: 0.5 }} />
            </div>
          )}
          <span className="tag" style={{ marginBottom: 5 }}>TEAM</span>
          <h4 className="orbitron font-bold text-white text-center"
            style={{ fontSize: 13, letterSpacing: 0.5, marginBottom: 2 }}>
            {team.teamFullName}
          </h4>
          <span style={{ color: '#4ade80', fontSize: 11, fontFamily: 'Orbitron, monospace', opacity: 0.8 }}>
            [{team.teamTag}]
          </span>
        </div>

        {/* Players */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: 1, marginBottom: 6,
            fontFamily: 'Orbitron, monospace',
            borderBottom: '1px solid rgba(74,222,128,0.1)', paddingBottom: 5 }}>
            PLAYERS ({team.players.length})
          </div>
          {team.players.length === 0 ? (
            <p style={{ color: '#4b5563', fontSize: 12, textAlign: 'center', padding: '6px 0' }}>
              {t('teams.teamCard.noPlayers')}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0,
              display: 'flex', flexDirection: 'column', gap: 1 }}>
              {team.players.map((player) => (
                <PlayerRow
                  key={player._id || player.playerName}
                  player={player}
                  isSelected={selected.has(player._id!)}
                  onToggle={togglePlayer}
                  onDelete={onDeletePlayer}
                  isDeleting={deletingPlayerIds.has(player._id!)}
                  teamId={team._id}
                />
              ))}
            </ul>
          )}
          {selected.size > 0 && (
            <button className="btn-danger"
              style={{ width: '100%', marginTop: 8, fontSize: 12 }}
              onClick={handleDeleteSelected}>
              {t('teams.teamCard.deleteSelected')} ({selected.size})
            </button>
          )}
        </div>

        {/* Edit / Delete */}
        <div className="card-actions"
          style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10,
            borderTop: '1px solid rgba(74,222,128,0.1)' }}>
          <button className="btn-blue"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onClick={handleEdit}>
            <FaEdit size={12} /> {t('teams.teamCard.edit')}
          </button>
          <button className="btn-danger"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onClick={handleDelete} disabled={deletingTeamIds.has(team._id)}>
            <FaTrash size={11} /> {t('teams.teamCard.delete')}
          </button>
        </div>
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────
   SearchInput
───────────────────────────────────────────── */
const SearchInput = memo(({ onSearchChange }: { onSearchChange: (q: string) => void }) => {
  const { t } = useTranslation();
  const [localQuery, setLocalQuery] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => onSearchChange(localQuery));
    }, localQuery === '' ? 0 : 300);
    return () => clearTimeout(id);
  }, [localQuery, onSearchChange]);

  return (
    <div style={{ position: 'relative', maxWidth: 420 }}>
      <svg style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
        color: '#4ade80', opacity: 0.5, pointerEvents: 'none' }}
        width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input type="text" placeholder={t('teams.search.placeholder')}
        value={localQuery} onChange={(e) => setLocalQuery(e.target.value)}
        className="input-cyber" style={{ paddingLeft: 38 }} />
    </div>
  );
});

/* ─────────────────────────────────────────────
   TeamForm (inline create)
───────────────────────────────────────────── */
const TeamForm = memo(({
  form, playersForm, handleTeamInputChange, handlePlayerChange,
  addPlayerInput, removePlayerInput, handleSubmit, editingTeamId,
  resetForm, handleLogoUpload, handlePlayerPhotoUpload,
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
    <div className="glass-dark neon-border rounded-2xl p-6 mb-8" style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span className="tag">NEW</span>
        <h3 className="orbitron text-white font-bold" style={{ fontSize: 16 }}>
          {editingTeamId ? t('teams.form.editTitle') : t('teams.form.createTitle')}
        </h3>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="text" name="teamFullName"
          placeholder={t('teams.form.teamName') || 'Team Full Name'}
          value={form.teamFullName} onChange={handleTeamInputChange} required autoFocus className="input-cyber" />
        <input type="text" name="teamTag"
          placeholder={t('teams.form.teamTag') || 'Team Tag'}
          value={form.teamTag} onChange={handleTeamInputChange} required className="input-cyber" />
        <label htmlFor="inline-team-logo-upload" className="input-cyber"
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <FaUpload size={14} style={{ color: '#4ade80' }} />
          {t('teams.form.uploadLogo')}
        </label>
        <input id="inline-team-logo-upload" type="file" accept="image/*"
          onChange={handleLogoUpload} style={{ display: 'none' }} />
        {form.logo && (
          <img src={form.logo} alt="Logo Preview"
            style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 10,
              border: '1px solid rgba(74,222,128,0.4)' }}
            loading="lazy" onError={(e) => e.currentTarget.src = './logo.png'} />
        )}
        <div style={{ fontSize: 10, color: '#4ade80', letterSpacing: 1,
          fontFamily: 'Orbitron, monospace', marginTop: 4, marginBottom: 2 }}>
          {t('teams.form.players').toUpperCase()}
        </div>
        {playersForm.map((player, index) => (
          <div key={player._id || index} className="player-form-row">
            <input type="text" name="playerName"
              placeholder={t('teams.form.playerName')} value={player.playerName}
              onChange={(e) => handlePlayerChange(index, e)} required
              className="input-cyber" style={{ flex: '1 1 160px', width: 'auto' }} />
            <input type="text" name="playerId"
              placeholder={t('teams.form.playerId')} value={player.playerId}
              onChange={(e) => handlePlayerChange(index, e)}
              className="input-cyber" style={{ flex: '0 0 110px', width: 110 }} />
            <label htmlFor={`inline-player-photo-${index}`} className="input-cyber"
              style={{ flex: '0 0 130px', width: 130, display: 'flex', alignItems: 'center',
                gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <FaUpload size={11} style={{ color: '#4ade80' }} />
              {t('teams.form.uploadPhoto')}
            </label>
            <input id={`inline-player-photo-${index}`} type="file" accept="image/*"
              onChange={(e) => handlePlayerPhotoUpload(index, e)} style={{ display: 'none' }} />
            {player.photo && (
              <img src={player.photo} alt="Preview"
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
                  border: '1px solid rgba(74,222,128,0.4)', flexShrink: 0 }}
                loading="lazy" onError={(e) => e.currentTarget.src = './def_char.png'} />
            )}
            {playersForm.length > 1 && (
              <button type="button" onClick={() => removePlayerInput(index)}
                className="btn-danger" style={{ padding: '6px 10px', flexShrink: 0 }}>
                <FaTrash size={11} />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addPlayerInput} className="btn-green-ghost"
          style={{ alignSelf: 'flex-start' }}>
          + {t('teams.form.addPlayer')}
        </button>
        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button type="submit" className="btn-primary">
            {editingTeamId ? t('teams.form.updateTeam') : t('teams.form.createTeam')}
          </button>
          {editingTeamId && (
            <button type="button" onClick={resetForm} className="btn-ghost">
              {t('teams.form.cancel')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

/* ─────────────────────────────────────────────
   FormContainer (create inline / edit modal)
───────────────────────────────────────────── */
const FormContainer = memo(({
  showForm, setShowForm, editingTeamId, setEditingTeamId, teams, setTeams,
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
  const [playersForm, setPlayersForm] = useState<Player[]>([{ playerName: '', playerId: '', photo: '' }]);

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
    setPlayersForm((prev) => { const c = [...prev]; c[index] = { ...c[index], [name]: value }; return c; });
  }, []);

  const addPlayerInput = useCallback(() => {
    setPlayersForm((prev) => [...prev, { playerName: '', playerId: '', photo: '' }]);
  }, []);

  const removePlayerInput = useCallback((index: number) => {
    setPlayersForm((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleLogoUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { const url = await uploadToCloudinary(file, 'teams/logos', 'team_logo'); setForm((p) => ({ ...p, logo: url })); }
    catch { alert('Upload failed'); }
  }, []);

  const handlePlayerPhotoUpload = useCallback(async (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const url = await uploadToCloudinary(file, 'players/photos', 'player_photo');
      setPlayersForm((prev) => { const c = [...prev]; c[index] = { ...c[index], photo: url }; return c; });
    } catch { alert('Upload failed'); }
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (playersForm.some((p) => p.playerName.trim() === '')) { alert('Please fill in all player names'); return; }
    try {
      const payload = { ...form, players: playersForm };
      if (editingTeamId) {
        const res = await api.put(`/teams/${editingTeamId}`, payload);
        setTeams((prev) => prev.map((t) => (t._id === editingTeamId ? res.data : t)));
      } else {
        const res = await api.post('/teams', payload);
        setTeams((prev) => [...prev, res.data]);
      }
      resetForm();
    } catch (err) { alert('Failed to save team'); console.error(err); }
  }, [form, playersForm, editingTeamId, setTeams, resetForm]);

  useEffect(() => {
    if (editingTeamId) {
      const team = teams.find((t) => t._id === editingTeamId);
      if (team) {
        setForm({ teamFullName: team.teamFullName, teamTag: team.teamTag, logo: team.logo || '' });
        setPlayersForm(team.players.length ? team.players : [{ playerName: '', playerId: '', photo: '' }]);
        setShowForm(true);
      }
    }
  }, [editingTeamId, teams, setShowForm]);

  useEffect(() => {
    if (editingTeamId) {
      const team = teams.find((t) => t._id === editingTeamId);
      if (team) setPlayersForm(team.players.length ? team.players : [{ playerName: '', playerId: '', photo: '' }]);
    }
  }, [teams, editingTeamId]);

  if (editingTeamId) {
    return (
      <div className="modal-overlay">
        <div className="modal-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 16px', borderBottom: '1px solid rgba(74,222,128,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tag">EDIT</span>
              <h3 className="orbitron text-white font-bold" style={{ fontSize: 16 }}>
                {t('teams.form.editTitle')}
              </h3>
            </div>
            <button className="close-btn" onClick={resetForm}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" name="teamFullName" autoFocus
                placeholder={t('teams.form.teamName') || 'Team Full Name'}
                value={form.teamFullName} onChange={handleTeamInputChange} required className="input-cyber" />
              <input type="text" name="teamTag"
                placeholder={t('teams.form.teamTag') || 'Team Tag'}
                value={form.teamTag} onChange={handleTeamInputChange} required className="input-cyber" />
              <label htmlFor="modal-team-logo-upload" className="input-cyber"
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <FaUpload size={14} style={{ color: '#4ade80' }} />
                {t('teams.form.uploadLogo')}
              </label>
              <input id="modal-team-logo-upload" type="file" accept="image/*"
                onChange={handleLogoUpload} style={{ display: 'none' }} />
              {form.logo && (
                <img src={form.logo} alt="Logo"
                  style={{ width: 68, height: 68, objectFit: 'contain', borderRadius: 10,
                    border: '1px solid rgba(74,222,128,0.4)', alignSelf: 'center' }}
                  loading="lazy" onError={(e) => e.currentTarget.src = './logo.png'} />
              )}
              <div style={{ fontSize: 10, color: '#4ade80', letterSpacing: 1,
                fontFamily: 'Orbitron, monospace', marginTop: 4 }}>
                {t('teams.form.players').toUpperCase()}
              </div>
              {playersForm.map((player, index) => (
                <div key={player._id || index} className="player-form-row">
                  <input type="text" name="playerName"
                    placeholder={t('teams.form.playerName')} value={player.playerName}
                    onChange={(e) => handlePlayerChange(index, e)} required
                    className="input-cyber" style={{ flex: '1 1 140px', width: 'auto' }} />
                  <input type="text" name="playerId"
                    placeholder={t('teams.form.playerId')} value={player.playerId}
                    onChange={(e) => handlePlayerChange(index, e)}
                    className="input-cyber" style={{ flex: '0 0 100px', width: 100 }} />
                  <label htmlFor={`modal-player-photo-${index}`} className="input-cyber"
                    style={{ flex: '0 0 120px', width: 120, display: 'flex', alignItems: 'center',
                      gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <FaUpload size={11} style={{ color: '#4ade80' }} />
                    {t('teams.form.uploadPhoto')}
                  </label>
                  <input id={`modal-player-photo-${index}`} type="file" accept="image/*"
                    onChange={(e) => handlePlayerPhotoUpload(index, e)} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                    {player.photo && (
                      <img src={player.photo} alt="Preview"
                        style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover',
                          border: '1px solid rgba(74,222,128,0.4)' }}
                        loading="lazy" onError={(e) => e.currentTarget.src = './def_char.png'} />
                    )}
                    {playersForm.length > 1 && (
                      <button type="button" onClick={() => removePlayerInput(index)}
                        className="btn-danger" style={{ padding: '6px 9px' }}>
                        <FaTrash size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" onClick={addPlayerInput} className="btn-green-ghost"
                style={{ alignSelf: 'flex-start' }}>
                + {t('teams.form.addPlayer')}
              </button>
              <div style={{ display: 'flex', gap: 10, paddingTop: 8,
                borderTop: '1px solid rgba(74,222,128,0.12)', marginTop: 4 }}>
                <button type="button" onClick={resetForm} className="btn-ghost" style={{ flex: 1 }}>
                  {t('teams.form.cancel')}
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  {t('teams.form.updateTeam')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: showForm ? 'block' : 'none' }}>
      <TeamForm form={form} setForm={setForm} playersForm={playersForm} setPlayersForm={setPlayersForm}
        handleTeamInputChange={handleTeamInputChange} handlePlayerChange={handlePlayerChange}
        addPlayerInput={addPlayerInput} removePlayerInput={removePlayerInput}
        handleSubmit={handleSubmit} editingTeamId={editingTeamId} resetForm={resetForm}
        handleLogoUpload={handleLogoUpload} handlePlayerPhotoUpload={handlePlayerPhotoUpload} />
    </div>
  );
});

/* ─────────────────────────────────────────────
   Teams — root
───────────────────────────────────────────── */
const Teams: React.FC = () => {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingPlayerIds, setDeletingPlayerIds] = useState<Set<string>>(new Set());
  const [deletingTeamIds, setDeletingTeamIds] = useState<Set<string>>(new Set());

  const deletingTeamIdsRef = React.useRef(deletingTeamIds);
  const deletingPlayerIdsRef = React.useRef(deletingPlayerIds);
  useEffect(() => { deletingTeamIdsRef.current = deletingTeamIds; }, [deletingTeamIds]);
  useEffect(() => { deletingPlayerIdsRef.current = deletingPlayerIds; }, [deletingPlayerIds]);

  const fetchTeams = useCallback(async () => {
    try { const res = await api.get<Team[]>('/teams'); setTeams(res.data); }
    catch (err) { console.error('Fetch teams failed:', err); }
  }, []);

  useEffect(() => {
    api.get('/users/me').then(({ data }) => setUser(data)).catch(() => {});
    fetchTeams();
  }, [fetchTeams]);

  const visibleTeams = useMemo(() => {
    if (!searchQuery) return teams;
    const q = searchQuery.toLowerCase();
    return teams.filter((t) =>
      t.teamFullName.toLowerCase().includes(q) || t.teamTag.toLowerCase().includes(q)
    );
  }, [teams, searchQuery]);

  const handleSearchChange = useCallback((q: string) => setSearchQuery(q), []);

  const handleAddTeamClick = useCallback(() => {
    flushSync(() => {
      if (showForm) { setShowForm(false); setEditingTeamId(null); }
      else setShowForm(true);
    });
  }, [showForm]);

  const startEditTeam = useCallback((team: Team) => setEditingTeamId(team._id), []);

  const deleteTeam = useCallback(async (id: string) => {
    if (!window.confirm('Delete this team?')) return;
    if (deletingTeamIdsRef.current.has(id)) return;
    setDeletingTeamIds((prev) => new Set(prev).add(id));
    setTeams((prev) => prev.filter((t) => t._id !== id));
    try { await api.delete(`/teams/${id}`); }
    catch (err) { alert('Failed to delete team'); console.error(err); fetchTeams(); }
    finally { setDeletingTeamIds((prev) => { const c = new Set(prev); c.delete(id); return c; }); }
  }, [fetchTeams]);

  const deletePlayer = useCallback(async (teamId: string, playerId: string) => {
    if (!window.confirm('Delete this player?')) return;
    if (deletingPlayerIdsRef.current.has(playerId)) return;
    setDeletingPlayerIds((prev) => new Set(prev).add(playerId));
    try {
      await api.delete(`/teams/${teamId}/players/${playerId}`);
      // ✅ Update parent state immediately so the card re-renders with player removed
      setTeams((prev) => prev.map((t) =>
        t._id === teamId ? { ...t, players: t.players.filter((p) => p._id !== playerId) } : t
      ));
    } catch (err) { alert('Failed to delete player'); console.error(err); }
    finally { setDeletingPlayerIds((prev) => { const c = new Set(prev); c.delete(playerId); return c; }); }
  }, []);

  // ✅ Root owns the API call + state update; TeamCard just clears its local selection
  const deleteSelectedPlayers = useCallback(async (teamId: string, playerIds: string[]) => {
    try {
      await api.delete(`/teams/${teamId}/players`, { data: { playerIds } });
      // ✅ This triggers TeamCard to re-render with updated players prop,
      //    which triggers the useEffect that prunes stale selected ids
      setTeams((prev) => prev.map((t) =>
        t._id === teamId
          ? { ...t, players: t.players.filter((p) => !playerIds.includes(p._id!)) }
          : t
      ));
    } catch (err) {
      alert('Failed to delete selected players');
      console.error(err);
      throw err; // re-throw so TeamCard's catch fires and does NOT clear selection
    }
  }, []);

  return (
    <div className="cyber-root min-h-screen"
      style={{ background: 'linear-gradient(135deg, #052005 0%, #000000 50%, #052005 100%)' }}>
      <style>{CYBER_STYLES}</style>

      <div className="scan-line" />
      <div className="hex-bg" />
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(74,222,128,0.09), transparent)' }} />

      {/* ── SIDEBAR ── */}
      <div style={{
        position: 'fixed', left: 0, top: 0, height: '100%', width: 78, zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 0', gap: 8,
        background: 'rgba(0,0,0,0.88)', borderRight: '1px solid rgba(74,222,128,0.2)',
        backdropFilter: 'blur(24px)', boxShadow: '4px 0 24px rgba(0,0,0,0.6)'
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(74,222,128,0.45)', background: 'rgba(74,222,128,0.08)',
          boxShadow: '0 0 10px rgba(74,222,128,0.18)' }}>
          <img src="./logo.png" alt="logo" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }} />
        </div>
        {user && (
          <div style={{ width: 50, padding: '4px 2px', borderRadius: 8, marginBottom: 4,
            background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%',
              background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
            <span style={{ fontSize: 9, color: '#4ade80', letterSpacing: '0.5px', fontWeight: 700,
              maxWidth: 46, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', textAlign: 'center', padding: '0 3px' }}>
              {user.username}
            </span>
          </div>
        )}
        <div style={{ width: 40, height: 1, background: 'rgba(74,222,128,0.2)', margin: '2px 0 6px' }} />
        <button className="sidebar-btn" onClick={() => (window.location.href = '/dashboard')}>
          <FaTrophy size={20} />
          <span style={{ fontSize: 10, marginTop: 4, letterSpacing: '0.5px', fontWeight: 600 }}>TOUR</span>
        </button>
        <button className="sidebar-btn active">
          <FaUsers size={20} />
          <span style={{ fontSize: 10, marginTop: 4, letterSpacing: '0.5px', fontWeight: 600 }}>TEAMS</span>
        </button>
        <button className="sidebar-btn" onClick={() => window.open('/displayhud', '_blank', 'noopener,noreferrer')}>
          <FaEye size={20} />
          <span style={{ fontSize: 10, marginTop: 4, letterSpacing: '0.5px', fontWeight: 600 }}>HUD</span>
        </button>
        <div style={{ flex: 1 }} />
        <button className="sidebar-btn"
          onClick={() => window.open('https://discord.com/channels/623776491682922526/1426117227257663558', '_blank')}>
          <FaDiscord size={20} />
          <span style={{ fontSize: 10, marginTop: 4, letterSpacing: '0.5px', fontWeight: 600 }}>HELP</span>
        </button>
      </div>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: 78, padding: '32px 28px', position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="tag">TEAMS</span>
          </div>
          <h2 className="orbitron font-black text-white"
            style={{ fontSize: 26, letterSpacing: 1, marginBottom: 4 }}>
            {t('teams.header.title')}
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>{t('teams.header.subtitle')}</p>
        </div>

        <button className="btn-primary" style={{ padding: '12px 28px', marginBottom: 28 }}
          onClick={handleAddTeamClick}>
          {showForm ? t('teams.form.cancel') : `+ ${t('dashboard.nav.teams')}`}
        </button>

        <FormContainer showForm={showForm} setShowForm={setShowForm}
          editingTeamId={editingTeamId} setEditingTeamId={setEditingTeamId}
          teams={teams} setTeams={setTeams} />

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span className="tag">ROSTER</span>
            <h3 className="orbitron font-bold text-white" style={{ fontSize: 15 }}>
              {t('dashboard.nav.teams')}
            </h3>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4b5563',
              fontFamily: 'Orbitron, monospace' }}>
              {visibleTeams.length} / {teams.length}
            </span>
          </div>
          <SearchInput onSearchChange={handleSearchChange} />
        </div>

        {visibleTeams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
              background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(74,222,128,0.1)' }}>
              <FaUsers size={28} style={{ color: '#4ade80', opacity: 0.6 }} />
            </div>
            <h3 className="orbitron font-bold text-white" style={{ fontSize: 17, marginBottom: 8 }}>
              {t('teams.messages.noTeams')}
            </h3>
            <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
              {t('teams.messages.createFirst')}
            </p>
            <button className="btn-primary" style={{ padding: '12px 32px' }}
              onClick={() => setShowForm(true)}>
              + {t('dashboard.nav.teams')}
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: 18
          }}>
            {visibleTeams.map((team) => (
              <TeamCard
                key={team._id}
                team={team}
                onEdit={startEditTeam}
                onDelete={deleteTeam}
                onDeletePlayer={deletePlayer}
                onDeleteSelectedPlayers={deleteSelectedPlayers}
                deletingTeamIds={deletingTeamIds}
                deletingPlayerIds={deletingPlayerIds}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Teams;