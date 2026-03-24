import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FaTrash, FaEdit, FaTimes, FaSearch, FaChevronDown, FaChevronUp } from "react-icons/fa";
import { useParams } from "react-router-dom";
import api from "../login/api.tsx";

interface Team {
  _id: string;
  teamFullName: string;
  teamTag: string;
  logo?: string;
}

interface Slot {
  _id: string;
  slot: number;
  team: Team;
}

interface Group {
  _id: string;
  groupName: string;
  slots?: Slot[];
}

interface SelectedTeam {
  teamId: string;
  slot: number | null;
}

interface GroupProps {
  onSelectionChange?: (groupIds: string[]) => void;
}

export interface GroupRef {
  openForm: () => void;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');

  .gd-root { font-family: 'Rajdhani', sans-serif; }
  .gd-root *, .gd-root *::before, .gd-root *::after { box-sizing: border-box; }

  /* ── Overlay ── */
  .gd-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,4,1,0.95);
    backdrop-filter: blur(18px);
    display: flex; align-items: stretch;
  }

  /* ── 3-column split ── */
  .gd-col-draft  { width: 40%; display: flex; flex-direction: column; background: #010a03; border-right: 1px solid rgba(74,222,128,0.12); overflow: hidden; }
  .gd-col-roster { width: 28%; display: flex; flex-direction: column; background: #000d02; border-right: 1px solid rgba(74,222,128,0.12); overflow: hidden; }
  .gd-col-groups { width: 32%; display: flex; flex-direction: column; background: #000802; overflow: hidden; }

  /* ── Column header ── */
  .gd-col-hdr {
    padding: 18px 22px 16px; border-bottom: 1px solid rgba(74,222,128,0.1);
    flex-shrink: 0;
  }

  .gd-col-hdr-top {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
  }

  .gd-col-label {
    font-family: 'Orbitron', monospace; font-size: 9px; font-weight: 700;
    letter-spacing: 2.5px; color: #4ade80;
    display: flex; align-items: center; gap: 8px;
  }
  .gd-col-label::before {
    content: ''; width: 3px; height: 12px;
    background: #4ade80; border-radius: 2px;
    box-shadow: 0 0 6px rgba(74,222,128,0.7);
  }

  .gd-close-x {
    width: 28px; height: 28px; border-radius: 7px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: #4b5563; cursor: pointer; font-size: 13px;
    display: flex; align-items: center; justify-content: center;
  }
  .gd-close-x:hover { background: rgba(220,38,38,0.12); color: #f87171; border-color: rgba(220,38,38,0.3); }

  /* ── Search ── */
  .gd-search-wrap { position: relative; }
  .gd-search {
    width: 100%; padding: 9px 14px 9px 34px;
    background: rgba(0,0,0,0.6); border: 1px solid rgba(74,222,128,0.18);
    border-radius: 8px; color: #d1d5db;
    font-family: 'Rajdhani', sans-serif; font-size: 14px; outline: none;
  }
  .gd-search::placeholder { color: #1f2937; }
  .gd-search:focus { border-color: rgba(74,222,128,0.5); box-shadow: 0 0 0 2px rgba(74,222,128,0.07); }
  .gd-search-ic {
    position: absolute; left: 11px; top: 50%;
    transform: translateY(-50%); color: #1f2937; pointer-events: none; font-size: 11px;
  }

  /* ── Team card grid ── */
  .gd-card-grid {
    flex: 1; overflow-y: auto; padding: 14px 16px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
    align-content: start;
    scrollbar-width: thin; scrollbar-color: rgba(74,222,128,0.1) transparent;
  }
  .gd-card-grid::-webkit-scrollbar { width: 3px; }
  .gd-card-grid::-webkit-scrollbar-thumb { background: rgba(74,222,128,0.15); border-radius: 4px; }

  /* ── Team card ── */
  .gd-card {
    position: relative; cursor: pointer;
    background: rgba(0,0,0,0.55); border: 1px solid rgba(74,222,128,0.1);
    border-radius: 10px; padding: 14px 8px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    text-align: center; user-select: none;
  }
  .gd-card:hover { border-color: rgba(74,222,128,0.38); background: rgba(74,222,128,0.04); box-shadow: 0 0 12px rgba(74,222,128,0.07); }
  .gd-card.gd-sel { border-color: #4ade80; background: rgba(74,222,128,0.09); box-shadow: 0 0 16px rgba(74,222,128,0.14), inset 0 0 10px rgba(74,222,128,0.04); }
  .gd-card.gd-sel::after {
    content: '✓'; position: absolute; top: 5px; right: 6px;
    font-size: 9px; font-weight: 900; color: #000;
    background: #4ade80; border-radius: 50%;
    width: 15px; height: 15px; line-height: 15px; text-align: center;
  }
  .gd-slot-pip {
    position: absolute; top: 5px; left: 5px;
    font-family: 'Orbitron', monospace; font-size: 8px; font-weight: 900;
    color: #000; background: #4ade80; border-radius: 3px; padding: 1px 5px;
  }

  .gd-logo-box {
    width: 44px; height: 44px; border-radius: 10px;
    background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.12);
    display: flex; align-items: center; justify-content: center; overflow: hidden;
  }
  .gd-card.gd-sel .gd-logo-box { border-color: rgba(74,222,128,0.5); box-shadow: 0 0 8px rgba(74,222,128,0.2); }
  .gd-logo-img { width: 100%; height: 100%; object-fit: cover; }
  .gd-logo-txt { font-family: 'Orbitron', monospace; font-size: 12px; font-weight: 900; color: #4ade80; opacity: 0.4; }

  .gd-card-tag { font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700; color: #4ade80; letter-spacing: 0.5px; }
  .gd-card-fullname {
    font-family: 'Barlow Condensed', sans-serif; font-size: 11px; font-weight: 600;
    color: #4b5563; line-height: 1.2;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  /* ── Draft count bar ── */
  .gd-count-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 18px; border-top: 1px solid rgba(74,222,128,0.07); flex-shrink: 0;
  }
  .gd-count-txt { font-family: 'Orbitron', monospace; font-size: 9px; color: #1f2937; letter-spacing: 1px; }
  .gd-count-n { color: #4ade80; font-size: 13px; font-weight: 900; }

  /* ── Roster (middle column) ── */
  .gd-roster-name-input {
    width: 100%; padding: 10px 13px;
    background: rgba(0,0,0,0.7); border: 1px solid rgba(74,222,128,0.22);
    border-radius: 8px; color: #fff;
    font-family: 'Orbitron', monospace; font-size: 12px; font-weight: 700;
    letter-spacing: 1px; outline: none;
  }
  .gd-roster-name-input::placeholder { color: #1a2e1e; font-weight: 400; font-family: 'Rajdhani', sans-serif; font-size: 13px; letter-spacing: 0; }
  .gd-roster-name-input:focus { border-color: rgba(74,222,128,0.6); box-shadow: 0 0 0 2px rgba(74,222,128,0.08); }

  .gd-roster-scroll {
    flex: 1; overflow-y: auto; padding: 12px 16px;
    scrollbar-width: thin; scrollbar-color: rgba(74,222,128,0.1) transparent;
  }
  .gd-roster-scroll::-webkit-scrollbar { width: 3px; }
  .gd-roster-scroll::-webkit-scrollbar-thumb { background: rgba(74,222,128,0.15); border-radius: 4px; }

  .gd-sec-lbl {
    font-family: 'Orbitron', monospace; font-size: 8px; letter-spacing: 2px;
    color: #1a2e1e; text-transform: uppercase; margin-bottom: 10px;
    display: flex; align-items: center; gap: 8px;
  }
  .gd-sec-lbl::after { content: ''; flex: 1; height: 1px; background: rgba(74,222,128,0.07); }

  /* ── Roster slot row ── */
  .gd-slot-row {
    display: flex; align-items: center; gap: 8px;
    background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.16);
    border-radius: 9px; padding: 8px 10px; margin-bottom: 5px;
  }
  .gd-slot-num {
    font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 900;
    background: #4ade80; color: #000;
    border-radius: 5px; min-width: 30px; height: 26px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    box-shadow: 0 0 6px rgba(74,222,128,0.35);
  }
  .gd-slot-logo { width: 26px; height: 26px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(74,222,128,0.2); flex-shrink: 0; }
  .gd-slot-nlogo {
    width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
    background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.12);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Orbitron', monospace; font-size: 8px; color: #4ade80; opacity: 0.4;
  }
  .gd-slot-info { flex: 1; min-width: 0; }
  .gd-slot-tag { font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700; color: #4ade80; }
  .gd-slot-full { font-size: 11px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gd-slot-num-edit {
    width: 40px; padding: 4px 5px; text-align: center;
    background: rgba(0,0,0,0.7); border: 1px solid rgba(74,222,128,0.25);
    border-radius: 5px; color: #4ade80;
    font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700; outline: none;
  }
  .gd-slot-num-edit:focus { border-color: #4ade80; }
  .gd-slot-rm {
    width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
    background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.18);
    color: #ef4444; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .gd-slot-rm:hover { background: rgba(220,38,38,0.25); border-color: rgba(220,38,38,0.4); }

  /* ── Roster footer ── */
  .gd-roster-footer {
    padding: 12px 16px; border-top: 1px solid rgba(74,222,128,0.1);
    display: flex; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.5);
  }
  .gd-btn-submit {
    flex: 1;
    background: linear-gradient(135deg, #16a34a, #15803d);
    color: #fff; border: 1px solid rgba(74,222,128,0.45);
    font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700;
    letter-spacing: 1px; padding: 11px; border-radius: 8px; cursor: pointer;
  }
  .gd-btn-submit:hover { box-shadow: 0 0 16px rgba(74,222,128,0.28); }
  .gd-btn-ghost {
    background: rgba(0,0,0,0.45); color: #4b5563;
    border: 1px solid rgba(255,255,255,0.07);
    font-family: 'Rajdhani', sans-serif; font-size: 13px; font-weight: 600;
    padding: 11px 12px; border-radius: 8px; cursor: pointer;
  }
  .gd-btn-ghost:hover { color: #9ca3af; background: rgba(255,255,255,0.04); }

  /* ── Groups column ── */
  .gd-groups-scroll {
    flex: 1; overflow-y: auto; padding: 12px 16px;
    scrollbar-width: thin; scrollbar-color: rgba(74,222,128,0.1) transparent;
  }
  .gd-groups-scroll::-webkit-scrollbar { width: 3px; }
  .gd-groups-scroll::-webkit-scrollbar-thumb { background: rgba(74,222,128,0.12); border-radius: 4px; }

  /* ── Group block ── */
  .gd-group-block {
    background: rgba(0,0,0,0.4); border: 1px solid rgba(74,222,128,0.1);
    border-radius: 12px; overflow: hidden; margin-bottom: 10px;
  }
  .gd-group-block:hover { border-color: rgba(74,222,128,0.24); }

  .gd-group-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 16px; cursor: pointer; user-select: none;
  }

  .gd-group-hdr-l { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; }

  .gd-group-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 5px #4ade80; flex-shrink: 0; }

  .gd-group-title {
    font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700;
    color: #e5e7eb; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .gd-group-badge {
    font-family: 'Orbitron', monospace; font-size: 9px; font-weight: 700;
    color: #4ade80; background: rgba(74,222,128,0.1);
    border: 1px solid rgba(74,222,128,0.2);
    border-radius: 4px; padding: 1px 7px; flex-shrink: 0;
  }

  .gd-group-hdr-r { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }

  .gd-ic { width: 26px; height: 26px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .gd-ic-e { background: rgba(37,99,235,0.6); }
  .gd-ic-e:hover { background: rgba(37,99,235,0.9); box-shadow: 0 0 8px rgba(59,130,246,0.3); }
  .gd-ic-d { background: rgba(220,38,38,0.6); }
  .gd-ic-d:hover { background: rgba(220,38,38,0.9); box-shadow: 0 0 8px rgba(239,68,68,0.3); }
  .gd-chevron-ic { color: #1f2937; font-size: 10px; margin-left: 2px; }

  /* ── Expanded team list ── */
  .gd-team-list {
    border-top: 1px solid rgba(74,222,128,0.08);
    background: rgba(0,0,0,0.25);
    padding: 8px 14px 12px;
  }

  /* ── Team list row (spacious) ── */
  .gd-tl-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px;
    border-radius: 9px;
    border: 1px solid transparent;
    margin-bottom: 4px;
  }
  .gd-tl-row:last-child { margin-bottom: 0; }
  .gd-tl-row:hover { background: rgba(74,222,128,0.04); border-color: rgba(74,222,128,0.12); }

  /* Slot number pill */
  .gd-tl-slot {
    font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 900;
    color: #000; background: #4ade80;
    border-radius: 5px; min-width: 34px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; letter-spacing: 0.5px;
    box-shadow: 0 0 5px rgba(74,222,128,0.3);
  }

  /* Team logo */
  .gd-tl-logo {
    width: 36px; height: 36px; border-radius: 8px; object-fit: cover;
    border: 1px solid rgba(74,222,128,0.2); flex-shrink: 0;
  }
  .gd-tl-nlogo {
    width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
    background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.12);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Orbitron', monospace; font-size: 10px; color: #4ade80; opacity: 0.4;
  }

  /* Team info */
  .gd-tl-info { flex: 1; min-width: 0; }
  .gd-tl-tag {
    font-family: 'Orbitron', monospace; font-size: 12px; font-weight: 700;
    color: #e5e7eb; letter-spacing: 0.5px; line-height: 1.2;
  }
  .gd-tl-name {
    font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 600;
    color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Divider between rows */
  .gd-tl-divider {
    height: 1px; background: rgba(74,222,128,0.05); margin: 0 2px;
  }

  /* ── Empty ── */
  .gd-empty {
    text-align: center; padding: 22px 10px;
    color: #1f2937; font-family: 'Orbitron', monospace;
    font-size: 9px; letter-spacing: 1.5px;
    border: 1px dashed rgba(74,222,128,0.07); border-radius: 8px;
  }
`;

// ── Main Component ─────────────────────────────────────────────────────────────
const Group = React.forwardRef<GroupRef, GroupProps>(({ onSelectionChange }, ref) => {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  const [showForm, setShowForm]       = useState(false);
  const [teams, setTeams]             = useState<Team[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<SelectedTeam[]>([]);
  const groupNameRef                  = useRef<HTMLInputElement>(null);
  const [groups, setGroups]           = useState<Group[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm]   = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const CACHE_KEY = `groups_cache_${tournamentId}`;

  React.useImperativeHandle(ref, () => ({
    openForm: async () => {
      setShowForm(true);
      await fetchTeams();
      clearForm();
    }
  }));

  const fetchTeams = async () => {
    try {
      const res = await api.get("/teams");
      setTeams(res.data);
    } catch (err: any) {
      console.error("Failed to fetch teams:", err);
      if (err.response?.status === 401) alert("Unauthorized. Please login.");
    }
  };

  const fetchGroups = useCallback(async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) { setGroups(JSON.parse(cached)); return; }
      }
      const res = await api.get(`/tournaments/${tournamentId}/groups`);
      setGroups(res.data);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
    } catch (err: any) {
      console.error("Failed to fetch groups:", err);
      if (err.response?.status === 401) alert("Unauthorized. Please login.");
    }
  }, [tournamentId, CACHE_KEY]);

  const clearForm = () => {
    if (groupNameRef.current) groupNameRef.current.value = "";
    setSelectedTeams([]);
    setEditingGroupId(null);
    setSearchTerm("");
  };

  const toggleTeam = useCallback((teamId: string) => {
    setSelectedTeams(prev => {
      const exists = prev.find(t => t.teamId === teamId);
      if (exists) return prev.filter(t => t.teamId !== teamId);
      const nextSlot = prev.length > 0 ? Math.max(...prev.map(t => t.slot || 0)) + 1 : 1;
      return [...prev, { teamId, slot: nextSlot }];
    });
  }, []);

  const handleSlotChange = useCallback((teamId: string, val: string) => {
    const slotNum = val === "" ? null : parseInt(val, 10);
    setSelectedTeams(prev => prev.map(t => t.teamId === teamId ? { ...t, slot: slotNum } : t));
  }, []);

  const openFormForEditGroup = async (group: Group) => {
    await fetchTeams();
    if (groupNameRef.current) groupNameRef.current.value = group.groupName;
    setSelectedTeams((group.slots || []).filter((s): s is Slot & {team: Team} => !!s.team).map(s => ({ teamId: s.team._id, slot: s.slot })));
    setEditingGroupId(group._id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const name = groupNameRef.current?.value || "";
    if (!name.trim()) return alert("Group name is required.");
    if (selectedTeams.length === 0) return alert("Select at least one team.");
    for (const t of selectedTeams) {
      if (t.slot === null || isNaN(t.slot)) return alert("Please assign a valid slot for all teams.");
    }
    const invalid = selectedTeams.filter(st => !teams.find(t => t._id === st.teamId));
    if (invalid.length > 0) { alert("Some teams no longer exist. Refresh and try again."); await fetchTeams(); return; }
    try {
      const payload = { groupName: name, slots: selectedTeams.map(({ teamId, slot }) => ({ team: teamId, slot })) };
      if (editingGroupId) {
        await api.put(`/tournaments/${tournamentId}/groups/${editingGroupId}`, payload);
      } else {
        await api.post(`/tournaments/${tournamentId}/groups`, payload);
      }
      clearForm(); setShowForm(false); fetchGroups(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to submit group.";
      const missing = err.response?.data?.missingTeamIds;
      if (missing?.length > 0) { alert(`${msg}\nMissing: ${missing.join(', ')}`); await fetchTeams(); }
      else alert(msg);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm("Delete this group?")) return;
    try {
      await api.delete(`/tournaments/${tournamentId}/groups/${groupId}`);
      fetchGroups(true);
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to delete group.");
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (onSelectionChange) onSelectionChange(groups.map(g => g._id));
  }, [groups, selectedTeams, onSelectionChange]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const filteredTeams = useMemo(() =>
    teams.filter(t =>
      t.teamFullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.teamTag.toLowerCase().includes(searchTerm.toLowerCase())
    ), [teams, searchTerm]);

  if (!showForm) return null;

  return (
    <>
      <style>{STYLES}</style>
      <div className="gd-root gd-overlay">

        {/* ══════════════ COL 1 — DRAFT BOARD ══════════════ */}
        <div className="gd-col-draft">
          <div className="gd-col-hdr">
            <div className="gd-col-hdr-top">
              <span className="gd-col-label">{editingGroupId ? 'EDIT MODE' : 'DRAFT BOARD'}</span>
              <button className="gd-close-x" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="gd-search-wrap">
              <FaSearch className="gd-search-ic" />
              <input
                type="text" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search teams…" className="gd-search"
              />
            </div>
          </div>

          <div className="gd-card-grid">
            {filteredTeams.length === 0 ? (
              <div className="gd-empty" style={{ gridColumn: '1/-1' }}>NO TEAMS FOUND</div>
            ) : filteredTeams.map(team => {
              const sel = selectedTeams.find(t => t.teamId === team._id);
              const isSelected = !!sel;
              return (
                <div
                  key={team._id}
                  className={`gd-card${isSelected ? ' gd-sel' : ''}`}
                  onClick={() => toggleTeam(team._id)}
                >
                  {isSelected && sel?.slot != null && (
                    <span className="gd-slot-pip">S{sel.slot}</span>
                  )}
                  <div className="gd-logo-box">
                    {team.logo
                      ? <img src={team.logo} alt="" className="gd-logo-img" loading="lazy" />
                      : <span className="gd-logo-txt">{team.teamTag?.slice(0, 2)}</span>
                    }
                  </div>
                  <span className="gd-card-tag">{team.teamTag}</span>
                  <span className="gd-card-fullname">{team.teamFullName}</span>
                </div>
              );
            })}
          </div>

          <div className="gd-count-bar">
            <span className="gd-count-txt">
              SELECTED &nbsp;<span className="gd-count-n">{selectedTeams.length}</span>/{teams.length}
            </span>
            <span className="gd-count-txt" style={{ color: '#0d2414' }}>CLICK TO TOGGLE</span>
          </div>
        </div>

        {/* ══════════════ COL 2 — ROSTER ══════════════ */}
        <div className="gd-col-roster">
          <div className="gd-col-hdr">
            <div className="gd-col-hdr-top">
              <span className="gd-col-label">GROUP ROSTER</span>
            </div>
            <input
              type="text" ref={groupNameRef}
              placeholder="Group name…"
              className="gd-roster-name-input"
            />
          </div>

          <div className="gd-roster-scroll">
            <div className="gd-sec-lbl">SLOT ASSIGNMENTS</div>
            {selectedTeams.length === 0 ? (
              <div className="gd-empty">SELECT TEAMS FROM THE DRAFT BOARD</div>
            ) : (
              [...selectedTeams]
                .sort((a, b) => (a.slot || 0) - (b.slot || 0))
                .map(sel => {
                  const team = teams.find(t => t._id === sel.teamId);
                  return (
                    <div key={sel.teamId} className="gd-slot-row">
                      <div className="gd-slot-num">{sel.slot ?? '?'}</div>
                      {team?.logo
                        ? <img src={team.logo} alt="" className="gd-slot-logo" loading="lazy" />
                        : <div className="gd-slot-nlogo">{team?.teamTag?.slice(0, 2)}</div>
                      }
                      <div className="gd-slot-info">
                        <div className="gd-slot-tag">{team?.teamTag}</div>
                        <div className="gd-slot-full">{team?.teamFullName}</div>
                      </div>
                      <input
                        type="number" min={1} value={sel.slot ?? ""}
                        onChange={e => handleSlotChange(sel.teamId, e.target.value)}
                        className="gd-slot-num-edit" title="Slot"
                      />
                      <button className="gd-slot-rm" onClick={() => toggleTeam(sel.teamId)} title="Remove">
                        <FaTimes size={8} />
                      </button>
                    </div>
                  );
                })
            )}
          </div>

          <div className="gd-roster-footer">
            <button className="gd-btn-ghost" onClick={clearForm}>Clear</button>
            <button className="gd-btn-submit" onClick={handleSubmit}>
              {editingGroupId ? 'UPDATE' : 'CREATE'}
            </button>
            <button className="gd-btn-ghost" onClick={() => setShowForm(false)}>Close</button>
          </div>
        </div>

        {/* ══════════════ COL 3 — EXISTING GROUPS ══════════════ */}
        <div className="gd-col-groups">
          <div className="gd-col-hdr">
            <div className="gd-col-hdr-top">
              <span className="gd-col-label">EXISTING GROUPS</span>
              <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 10, color: '#4ade80', fontWeight: 900 }}>
                {groups.length}
              </span>
            </div>
          </div>

          <div className="gd-groups-scroll">
            {groups.length === 0 ? (
              <div className="gd-empty">NO GROUPS CREATED YET</div>
            ) : groups.map(group => {
              const isExpanded = expandedGroups.has(group._id);
              const sorted = [...(group.slots || [])].sort((a, b) => a.slot - b.slot);

              return (
                <div key={group._id} className="gd-group-block">

                  {/* Group header row */}
                  <div className="gd-group-hdr" onClick={() => toggleExpand(group._id)}>
                    <div className="gd-group-hdr-l">
                      <span className="gd-group-dot" />
                      <span className="gd-group-title">{group.groupName}</span>
                      <span className="gd-group-badge">{sorted.length}T</span>
                    </div>
                    <div className="gd-group-hdr-r">
                      <button
                        className="gd-ic gd-ic-e"
                        onClick={e => { e.stopPropagation(); openFormForEditGroup(group); }}
                        onMouseDown={e => e.preventDefault()}
                        title="Edit"
                      >
                        <FaEdit color="#fff" size={11} />
                      </button>
                      <button
                        className="gd-ic gd-ic-d"
                        onClick={e => { e.stopPropagation(); handleDeleteGroup(group._id); }}
                        onMouseDown={e => e.preventDefault()}
                        title="Delete"
                      >
                        <FaTrash color="#fff" size={11} />
                      </button>
                      <span className="gd-chevron-ic">
                        {isExpanded ? <FaChevronUp size={9} /> : <FaChevronDown size={9} />}
                      </span>
                    </div>
                  </div>

                  {/* Expanded — spacious team list */}
                  {isExpanded && (
                    <div className="gd-team-list">
                      {sorted.length === 0 ? (
                        <div className="gd-empty" style={{ padding: '14px' }}>NO TEAMS ASSIGNED</div>
                      ) : sorted.map((slot, idx) => (
                        <React.Fragment key={slot._id}>
                          <div className="gd-tl-row">
                            {/* Slot number */}
                            <div className="gd-tl-slot">S{slot.slot}</div>

                            {/* Logo */}
                            {slot.team?.logo
                              ? <img src={slot.team.logo} alt="" className="gd-tl-logo" loading="lazy" />
                              : (
                                <div className="gd-tl-nlogo">
                                  {slot.team?.teamTag?.slice(0, 2)}
                                </div>
                              )
                            }

                            {/* Team info */}
                            <div className="gd-tl-info">
                              <div className="gd-tl-tag">{slot.team?.teamTag || '—'}</div>
                              <div className="gd-tl-name">{slot.team?.teamFullName || 'Unknown Team'}</div>
                            </div>
                          </div>
                          {idx < sorted.length - 1 && <div className="gd-tl-divider" />}
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
});

export default Group;
