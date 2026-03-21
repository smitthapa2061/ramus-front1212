import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../login/api.tsx';
import PollingManager from './isPolling.tsx';
import {
  FaDiscord, FaTrophy, FaUsers, FaEye,
  FaBroadcastTower, FaCalendarAlt, FaSatelliteDish,
  FaChevronDown, FaChevronRight,
} from 'react-icons/fa';

interface Tournament { _id: string; tournamentName: string; }
interface Round       { _id: string; roundName: string; }
interface Match       { _id: string; matchName?: string; matchNo?: number; _matchNo?: number; }

const THEMES = ['Theme1', 'Theme2', 'Theme3', 'Theme4', 'Theme5'];

// Each view group: icon char, label, accent color, views with short display labels
const VIEW_GROUPS = [
  {
    id: 'match', label: 'MATCH', icon: '⬡', color: '#4ade80', dim: 'rgba(74,222,128,0.07)',
    views: [
      { key: 'MatchSummary', label: 'SUMMARY' }, { key: 'MatchData', label: 'DATA' },
      { key: 'MatchFragrs', label: 'FRAGS' },    { key: 'Lower', label: 'LOWER' },
      { key: 'Upper', label: 'UPPER' },           { key: 'Dom', label: 'DOM' },
      { key: 'LiveStats', label: 'STATS' },        { key: 'LiveFrags', label: 'LIVE FRAGS' },
    ]
  },
  {
    id: 'overall', label: 'OVERALL', icon: '◈', color: '#60a5fa', dim: 'rgba(96,165,250,0.07)',
    views: [
      { key: 'OverAllData', label: 'DATA' },       { key: 'OverallFrags', label: 'FRAGS' },
      { key: 'WwcdStats', label: 'WWCD STATS' },   { key: 'WwcdSummary', label: 'WWCD SUM' },
    ]
  },
  {
    id: 'h2h', label: 'HEAD 2 HEAD', icon: '⇌', color: '#f59e0b', dim: 'rgba(245,158,11,0.07)',
    views: [
      { key: 'playerH2H', label: 'PLAYER' },       { key: 'TeamH2H', label: 'TEAM' },
    ]
  },
  {
    id: 'awards', label: 'AWARDS', icon: '✦', color: '#a78bfa', dim: 'rgba(167,139,250,0.07)',
    views: [
      { key: 'Champions', label: 'CHAMPS' },        { key: '1stRunnerUp', label: '1ST RU' },
      { key: '2ndRunnerUp', label: '2ND RU' },      { key: 'EventMvp', label: 'EVENT MVP' },
      { key: 'mvp', label: 'MVP' },                 { key: 'highlightPoints', label: 'HI-PTS' },
    ]
  },
  {
    id: 'broadcast', label: 'BROADCAST', icon: '⏣', color: '#f87171', dim: 'rgba(248,113,113,0.07)',
    views: [
      { key: 'Alerts', label: 'ALERTS' },           { key: 'CommingUpNext', label: 'UP NEXT' },
      { key: 'ZoneClose', label: 'ZONE' },           { key: 'intro', label: 'INTRO' },
      { key: 'mapPreview', label: 'MAP PREV' },      { key: 'slots', label: 'SLOTS' },
      { key: 'RosterShowCase', label: 'ROSTER' },    { key: 'PlayerSwitch', label: 'PLR SWITCH' },
    ]
  },
  {
    id: 'schedule', label: 'SCHEDULE', icon: '▦', color: '#34d399', dim: 'rgba(52,211,153,0.07)',
    views: [
      { key: '__schedule', label: 'SCHEDULE' },      { key: '__highlight', label: 'HIGHLIGHT' },
    ]
  },
];

// ── Styles ─────────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Barlow+Condensed:wght@400;600;700;800&display=swap');

  .hd-root { font-family: 'Barlow Condensed', sans-serif; }
  .hd-root *, .hd-root *::before, .hd-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .hd-orb { font-family: 'Orbitron', monospace !important; }
  .hd-mono { font-family: 'Share Tech Mono', monospace !important; }

  /* ── Page canvas ── */
  .hd-page {
    min-height: 100vh; display: flex;
    background: #020804;
    color: #fff;
  }

  /* Deep grid texture */
  .hd-page::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      linear-gradient(rgba(74,222,128,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(74,222,128,0.03) 1px, transparent 1px);
    background-size: 32px 32px;
  }

  /* Vignette glow */
  .hd-page::after {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse 60% 50% at 50% 0%, rgba(74,222,128,0.07) 0%, transparent 70%),
      radial-gradient(ellipse 30% 60% at 0% 50%, rgba(74,222,128,0.04) 0%, transparent 60%);
  }

  /* ── Icon rail ── */
  .hd-rail {
    position: fixed; left: 0; top: 0; bottom: 0; width: 60px; z-index: 100;
    display: flex; flex-direction: column; align-items: center; padding: 16px 0;
    background: rgba(0,0,0,0.92);
    border-right: 1px solid rgba(74,222,128,0.12);
  }
  .hd-logo-wrap {
    width: 36px; height: 36px; border-radius: 8px; overflow: hidden;
    background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.18);
    margin-bottom: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }
  .hd-user-pip {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    margin-bottom: 10px;
  }
  .hd-online-dot { width: 5px; height: 5px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 5px #4ade80; }
  .hd-user-initials { font-family: 'Orbitron', monospace; font-size: 8px; color: #4ade80; font-weight: 700; }
  .hd-rail-sep { width: 28px; height: 1px; background: rgba(74,222,128,0.12); margin: 6px 0; }

  .hd-rib {
    width: 44px; height: 44px; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 3px; border-radius: 8px; cursor: pointer;
    border: 1px solid transparent; color: #2d3748; background: transparent;
  }
  .hd-rib:hover { color: #4ade80; background: rgba(74,222,128,0.06); border-color: rgba(74,222,128,0.2); }
  .hd-rib.on { color: #4ade80; background: rgba(74,222,128,0.1); border-color: rgba(74,222,128,0.35); }
  .hd-rib span { font-family: 'Orbitron', monospace; font-size: 7px; font-weight: 700; letter-spacing: 0.5px; }
  .hd-rail-foot { margin-top: auto; }

  /* ── Left panel — tournament navigator ── */
  .hd-nav {
    position: fixed; left: 60px; top: 0; bottom: 0; width: 240px; z-index: 90;
    display: flex; flex-direction: column;
    background: rgba(0,3,1,0.95);
    border-right: 1px solid rgba(74,222,128,0.1);
  }

  .hd-nav-top {
    padding: 20px 18px 14px; border-bottom: 1px solid rgba(74,222,128,0.08); flex-shrink: 0;
  }
  .hd-nav-eyebrow { font-family: 'Orbitron', monospace; font-size: 8px; font-weight: 700; letter-spacing: 2.5px; color: #1a3320; margin-bottom: 4px; }
  .hd-nav-heading { font-family: 'Orbitron', monospace; font-size: 14px; font-weight: 900; color: #fff; letter-spacing: 0.5px; }

  /* Polling strip inside nav */
  .hd-poll-row {
    display: flex; align-items: center; gap: 7px; margin-top: 10px;
    padding: 7px 10px; border-radius: 7px;
    background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.12);
  }
  .hd-poll-dot { width: 5px; height: 5px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 4px #4ade80; animation: hd-blink 2s ease-in-out infinite; }
  @keyframes hd-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .hd-poll-txt { font-family: 'Orbitron', monospace; font-size: 8px; color: #4ade80; letter-spacing: 1px; font-weight: 700; }

  .hd-nav-scroll { flex: 1; overflow-y: auto; padding: 10px 10px 20px; scrollbar-width: thin; scrollbar-color: rgba(74,222,128,0.1) transparent; }
  .hd-nav-scroll::-webkit-scrollbar { width: 3px; }
  .hd-nav-scroll::-webkit-scrollbar-thumb { background: rgba(74,222,128,0.12); border-radius: 4px; }

  /* Tournament entry */
  .hd-t-entry { margin-bottom: 4px; }
  .hd-t-head {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 10px; border-radius: 8px; cursor: pointer; user-select: none;
    border: 1px solid transparent;
  }
  .hd-t-head:hover { background: rgba(74,222,128,0.04); border-color: rgba(74,222,128,0.1); }
  .hd-t-head.open { background: rgba(74,222,128,0.06); border-color: rgba(74,222,128,0.18); }
  .hd-t-accent { width: 3px; border-radius: 2px; height: 24px; background: rgba(74,222,128,0.15); flex-shrink: 0; }
  .hd-t-head.open .hd-t-accent { background: #4ade80; box-shadow: 0 0 5px rgba(74,222,128,0.5); }
  .hd-t-info { flex: 1; min-width: 0; }
  .hd-t-name { font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700; color: #6b7280; letter-spacing: 0.3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hd-t-head.open .hd-t-name { color: #e5e7eb; }
  .hd-t-sub { font-size: 10px; color: #1f2937; margin-top: 1px; }
  .hd-t-chev { color: #1f2937; flex-shrink: 0; }
  .hd-t-head.open .hd-t-chev { color: #4ade80; }

  /* Round items */
  .hd-rounds { padding: 4px 0 4px 18px; }
  .hd-r-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px; border-radius: 6px; cursor: pointer; user-select: none;
    border: 1px solid transparent; margin-bottom: 2px;
  }
  .hd-r-item:hover { background: rgba(74,222,128,0.04); border-color: rgba(74,222,128,0.12); }
  .hd-r-item.sel { background: rgba(74,222,128,0.09); border-color: rgba(74,222,128,0.35); }
  .hd-r-name { font-family: 'Orbitron', monospace; font-size: 9px; font-weight: 700; color: #374151; letter-spacing: 0.3px; }
  .hd-r-item.sel .hd-r-name { color: #4ade80; }
  .hd-r-live { display: flex; align-items: center; gap: 3px; }
  .hd-r-live-dot { width: 5px; height: 5px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 4px #4ade80; }
  .hd-r-live-txt { font-family: 'Orbitron', monospace; font-size: 7px; color: #4ade80; font-weight: 700; }

  /* ── Main surface ── */
  .hd-surface { margin-left: 300px; position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }

  /* ── Top command bar ── */
  .hd-cmdbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(0,3,1,0.96); border-bottom: 1px solid rgba(74,222,128,0.12);
    backdrop-filter: blur(20px);
    display: flex; align-items: stretch; min-height: 56px;
  }

  .hd-cmdbar-left {
    flex: 1; display: flex; align-items: center; gap: 0;
    padding: 0 24px; border-right: 1px solid rgba(74,222,128,0.08);
  }
  .hd-cmd-round { font-family: 'Orbitron', monospace; font-size: 15px; font-weight: 900; color: #fff; letter-spacing: 0.5px; }
  .hd-cmd-tour { font-family: 'Barlow Condensed', sans-serif; font-size: 13px; color: #374151; font-weight: 600; margin-left: 14px; letter-spacing: 0.5px; }
  .hd-cmd-none { font-family: 'Orbitron', monospace; font-size: 11px; color: #1a2e1e; letter-spacing: 2px; }

  .hd-cmdbar-mid {
    display: flex; align-items: center; gap: 16px; padding: 0 20px;
    border-right: 1px solid rgba(74,222,128,0.08);
  }

  /* Live/Schedule status chips */
  .hd-status-chip {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 6px; border: 1px solid;
  }
  .hd-status-chip.live  { background: rgba(74,222,128,0.07); border-color: rgba(74,222,128,0.2); }
  .hd-status-chip.sched { background: rgba(96,165,250,0.07); border-color: rgba(96,165,250,0.2); }
  .hd-chip-label { font-family: 'Orbitron', monospace; font-size: 8px; letter-spacing: 1px; font-weight: 700; }
  .hd-chip-val   { font-family: 'Share Tech Mono', monospace; font-size: 12px; font-weight: 700; }
  .hd-chip-dot   { width: 6px; height: 6px; border-radius: 50%; }

  .hd-cmdbar-right { display: flex; align-items: center; gap: 10px; padding: 0 20px; }
  .hd-theme-label { font-family: 'Orbitron', monospace; font-size: 8px; color: #1a3320; letter-spacing: 1.5px; }
  .hd-theme-sel {
    background: rgba(0,0,0,0.6); border: 1px solid rgba(74,222,128,0.2);
    border-radius: 6px; color: #4ade80; padding: 5px 10px;
    font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700; outline: none; cursor: pointer;
  }
  .hd-theme-sel option { background: #010a03; }

  /* ── Match selector bar ── */
  .hd-matchbar {
    padding: 14px 24px; border-bottom: 1px solid rgba(74,222,128,0.08);
    background: rgba(0,0,0,0.3); display: flex; gap: 20px;
  }

  .hd-match-zone { display: flex; flex-direction: column; gap: 8px; }
  .hd-match-zone-hdr { display: flex; align-items: center; gap: 6px; }
  .hd-mz-icon { font-size: 11px; }
  .hd-mz-label { font-family: 'Orbitron', monospace; font-size: 8px; font-weight: 700; letter-spacing: 1.5px; }
  .hd-mz-sub   { font-size: 10px; color: #374151; font-weight: 600; }

  .hd-mchips { display: flex; flex-wrap: wrap; gap: 5px; }
  .hd-mchip {
    padding: 5px 13px; border-radius: 5px; cursor: pointer; user-select: none;
    font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    background: rgba(0,0,0,0.5); border: 1px solid rgba(74,222,128,0.1); color: #2d3748;
    display: flex; align-items: center; gap: 5px;
  }
  .hd-mchip:hover { border-color: rgba(74,222,128,0.3); color: #6b7280; }
  .hd-mchip.live-on  { background: rgba(74,222,128,0.12); border-color: #4ade80; color: #4ade80; box-shadow: 0 0 10px rgba(74,222,128,0.15); }
  .hd-mchip.sched-on { background: rgba(96,165,250,0.12); border-color: #60a5fa; color: #60a5fa; }
  .hd-mchip-ind { width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid currentColor; flex-shrink: 0; }
  .hd-mchip.live-on  .hd-mchip-ind { background: #4ade80; }
  .hd-mchip.sched-on .hd-mchip-ind { background: #60a5fa; border-radius: 2px; }

  .hd-match-sep { width: 1px; background: rgba(74,222,128,0.08); align-self: stretch; }

  /* ── Switcher panel (main content) ── */
  .hd-switcher { flex: 1; padding: 20px 24px 40px; display: flex; flex-direction: column; gap: 20px; }

  /* Empty */
  .hd-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; padding: 60px;
  }
  .hd-empty-icon {
    width: 80px; height: 80px; border-radius: 50%;
    background: rgba(74,222,128,0.04); border: 1px solid rgba(74,222,128,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 32px; color: rgba(74,222,128,0.2);
  }
  .hd-empty-h { font-family: 'Orbitron', monospace; font-size: 14px; color: #1a2e1e; letter-spacing: 2px; }
  .hd-empty-p { font-size: 13px; color: #0d1a10; }

  /* ── View group section ── */
  .hd-vg { display: flex; flex-direction: column; gap: 10px; }

  .hd-vg-header {
    display: flex; align-items: center; gap: 10px;
  }
  .hd-vg-icon {
    width: 32px; height: 32px; border-radius: 7px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; border: 1px solid; font-style: normal;
  }
  .hd-vg-title { font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 900; letter-spacing: 2px; }
  .hd-vg-count { font-family: 'Orbitron', monospace; font-size: 9px; font-weight: 700; opacity: 0.4; }
  .hd-vg-line { flex: 1; height: 1px; }

  /* ── The actual overlay launch tiles ── */
  .hd-tiles { display: flex; flex-wrap: wrap; gap: 7px; }

  .hd-tile {
    position: relative; cursor: pointer;
    display: flex; flex-direction: column; align-items: flex-start;
    padding: 12px 14px 10px; border-radius: 9px;
    border: 1px solid; min-width: 100px;
    background: rgba(0,0,0,0.5);
    user-select: none; overflow: hidden;
  }

  /* top edge glow line */
  .hd-tile::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--tc); opacity: 0.0;
  }
  .hd-tile:hover::before { opacity: 0.7; }
  .hd-tile.enabled:hover { background: rgba(0,0,0,0.7); }
  .hd-tile:not(.enabled) { cursor: not-allowed; }

  .hd-tile-num {
    font-family: 'Share Tech Mono', monospace; font-size: 9px;
    opacity: 0.3; margin-bottom: 6px; letter-spacing: 0.5px;
  }
  .hd-tile-name {
    font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 900;
    letter-spacing: 0.5px; line-height: 1.3;
  }
  .hd-tile-key {
    font-family: 'Share Tech Mono', monospace; font-size: 9px; opacity: 0.35; margin-top: 4px;
  }

  /* Corner indicator when active/hovered */
  .hd-tile-corner {
    position: absolute; top: 7px; right: 8px;
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--tc); opacity: 0;
  }
  .hd-tile.enabled:hover .hd-tile-corner { opacity: 0.8; box-shadow: 0 0 5px var(--tc); }

  /* Press effect */
  .hd-tile.enabled:active { transform: scale(0.97); }

  /* Schedule tiles are wider */
  .hd-tile.sched-tile { flex-direction: row; align-items: center; gap: 12px; min-width: 160px; }
  .hd-tile.sched-tile .hd-tile-name { font-size: 11px; }

  /* Disabled overlay */
  .hd-tile:not(.enabled)::after {
    content: ''; position: absolute; inset: 0;
    background: rgba(0,0,0,0.4); border-radius: inherit;
  }

  /* ── Divider ── */
  .hd-sep { height: 1px; background: linear-gradient(90deg, transparent, rgba(74,222,128,0.12), transparent); }

  /* ── Loading ── */
  .hd-loading {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #020804; flex-direction: column; gap: 14px;
  }
  .hd-spinner { width: 40px; height: 40px; border: 2px solid rgba(74,222,128,0.1); border-top-color: #4ade80; border-radius: 50%; animation: hd-spin 1s linear infinite; }
  @keyframes hd-spin { to { transform: rotate(360deg); } }
  .hd-spin-txt { font-family: 'Orbitron', monospace; font-size: 10px; color: #4ade80; letter-spacing: 2px; }
`;

// ── Component ──────────────────────────────────────────────────────────────────
const DisplayHud: React.FC = () => {
  const { t: translate } = useTranslation();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [expandedTours, setExpandedTours] = useState<string[]>([]);
  const [roundsMap,  setRoundsMap]  = useState<Record<string, Round[]>>({});
  const [matchesMap, setMatchesMap] = useState<Record<string, Match[]>>({});
  const [activeRound, setActiveRound] = useState<{ tId: string; rId: string } | null>(null);
  const [selectedMatches,  setSelectedMatches]  = useState<Record<string, string | null>>({});
  const [selectedSchedule, setSelectedSchedule] = useState<Record<string, string[]>>({});
  const [user, setUser]         = useState<any>(null);
  const [pollingKey, setPollingKey] = useState(0);
  const [themeMap, setThemeMap] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('selectedThemeMap'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  const getTheme = (tId: string) => themeMap[tId] || 'Theme1';

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data)).catch(() => {});
    api.get('/tournaments').then(r => setTournaments(r.data)).catch(() => setTournaments([]));
    api.get('/matchSelection/selected').then(r => {
      const map: Record<string, string> = {};
      r.data.forEach((s: any) => {
        const rId = typeof s.roundId === 'object' ? s.roundId._id : s.roundId;
        map[`${s.tournamentId}_${rId}`] = s.matchId;
      });
      setSelectedMatches(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    try { localStorage.setItem('selectedThemeMap', JSON.stringify(themeMap)); } catch {}
  }, [themeMap]);

  const toggleTournament = (tId: string) => {
    if (expandedTours.includes(tId)) {
      setExpandedTours(p => p.filter(id => id !== tId));
      if (activeRound?.tId === tId) setActiveRound(null);
    } else {
      setExpandedTours(p => [...p, tId]);
      if (!roundsMap[tId]) {
        api.get(`/tournaments/${tId}/rounds`).then(r => setRoundsMap(p => ({ ...p, [tId]: r.data }))).catch(() => setRoundsMap(p => ({ ...p, [tId]: [] })));
      }
    }
  };

  const selectRound = (tId: string, rId: string) => {
    if (activeRound?.tId === tId && activeRound?.rId === rId) { setActiveRound(null); return; }
    setActiveRound({ tId, rId });
    const key = `${tId}_${rId}`;
    if (!matchesMap[key]) {
      api.get(`/tournaments/${tId}/rounds/${rId}/matches`)
        .then(r => setMatchesMap(p => ({ ...p, [key]: r.data })))
        .catch(() => setMatchesMap(p => ({ ...p, [key]: [] })));
    }
  };

  const toggleLiveMatch = async (tId: string, rId: string, mId: string, checked: boolean) => {
    const key = `${tId}_${rId}`;
    const prev = { ...selectedMatches };
    setSelectedMatches(p => ({ ...p, [key]: checked ? mId : null }));
    try {
      const res = await api.post('/matchSelection/select', { tournamentId: tId, roundId: rId, matchId: mId });
      if (res.data.deselected && checked) setSelectedMatches(p => ({ ...p, [key]: null }));
      else if (!res.data.deselected && !checked) setSelectedMatches(p => ({ ...p, [key]: mId }));
      setPollingKey(p => p + 1);
    } catch {
      setSelectedMatches(prev);
      alert('Failed to update match selection. Please try again.');
    }
  };

  const toggleSchedMatch = (tId: string, rId: string, mId: string, checked: boolean) => {
    const key = `${tId}_${rId}`;
    setSelectedSchedule(p => {
      const cur = p[key] || [];
      return { ...p, [key]: checked ? [...cur, mId] : cur.filter(id => id !== mId) };
    });
  };

  const openView = (tId: string, rId: string, mId: string, theme: string, view: string) => {
    if (!mId) return;
    window.open(`/public/tournament/${tId}/round/${rId}/match/${mId}?theme=${encodeURIComponent(theme)}&view=${encodeURIComponent(view)}&followSelected=true`, '_blank', 'noopener,noreferrer');
  };

  const openSchedule = (tId: string, rId: string, mIds: string[], theme: string, view: string) => {
    if (!mIds.length) return;
    window.open(`/public/tournament/${tId}/round/${rId}/match/${mIds[0]}?theme=${encodeURIComponent(theme)}&view=${view}&followSelected=true&scheduleMatches=${encodeURIComponent(mIds.join(','))}`, '_blank', 'noopener,noreferrer');
  };

  // Derived active-round state
  const ar       = activeRound;
  const arKey    = ar ? `${ar.tId}_${ar.rId}` : '';
  const arTour   = ar ? tournaments.find(t => t._id === ar.tId) : null;
  const arRound  = ar ? roundsMap[ar.tId]?.find(r => r._id === ar.rId) : null;
  const arMatches = ar ? (matchesMap[arKey] || []) : [];
  const arLive   = ar ? (selectedMatches[arKey] || null) : null;
  const arSched  = ar ? (selectedSchedule[arKey] || []) : [];
  const arTheme  = ar ? getTheme(ar.tId) : 'Theme1';

  const liveMatchObj = arLive ? arMatches.find(m => m._id === arLive) : null;

  // Tile click handler
  const handleTileClick = (groupId: string, viewKey: string) => {
    if (!ar) return;
    if (groupId === 'schedule') {
      if (viewKey === '__schedule')   openSchedule(ar.tId, ar.rId, arSched, arTheme, 'Schedule');
      if (viewKey === '__highlight')  openSchedule(ar.tId, ar.rId, arSched, arTheme, 'HighlightSchedule');
    } else {
      if (!arLive) return;
      openView(ar.tId, ar.rId, arLive, arTheme, viewKey);
    }
  };

  const isTileEnabled = (groupId: string) => {
    if (groupId === 'schedule') return arSched.length > 0;
    return !!arLive;
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="hd-root hd-page">

        {/* ── Icon Rail ── */}
        <div className="hd-rail">
          <div className="hd-logo-wrap">
            <img src="./file.jpg" alt="logo" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 6 }} />
          </div>
          {user && (
            <div className="hd-user-pip">
              <div className="hd-online-dot" />
              <span className="hd-user-initials">{user.username?.slice(0, 3).toUpperCase()}</span>
            </div>
          )}
          <div className="hd-rail-sep" />
          <button className="hd-rib" onClick={() => window.location.href = '/dashboard'}>
            <FaTrophy size={16} /><span>TOUR</span>
          </button>
          <button className="hd-rib" onClick={() => window.open('/teams', '_blank', 'noopener,noreferrer')}>
            <FaUsers size={16} /><span>TEAMS</span>
          </button>
          <button className="hd-rib on">
            <FaEye size={16} /><span>HUD</span>
          </button>
          <div className="hd-rail-foot">
            <div className="hd-rail-sep" />
            <button className="hd-rib" onClick={() => window.open('https://discord.com/channels/623776491682922526/1426117227257663558', '_blank')}>
              <FaDiscord size={16} /><span>HELP</span>
            </button>
          </div>
        </div>

        {/* ── Tournament Navigator ── */}
        <div className="hd-nav">
          <div className="hd-nav-top">
            <div className="hd-orb hd-nav-eyebrow">BROADCAST CONTROL</div>
            <div className="hd-orb hd-nav-heading">HUD CTRL</div>
            <div className="hd-poll-row">
              <div className="hd-poll-dot" />
              <span className="hd-orb hd-poll-txt">LIVE SYNC</span>
              <PollingManager key={pollingKey} />
            </div>
          </div>

          <div className="hd-nav-scroll">
            {tournaments.length === 0 && (
              <div style={{ padding: '24px 10px', textAlign: 'center', fontFamily: 'Orbitron,monospace', fontSize: 9, color: '#0d1a10', letterSpacing: 1 }}>
                NO TOURNAMENTS
              </div>
            )}
            {tournaments.map(t => {
              const isExp = expandedTours.includes(t._id);
              return (
                <div key={t._id} className="hd-t-entry">
                  <div className={`hd-t-head${isExp ? ' open' : ''}`} onClick={() => toggleTournament(t._id)}>
                    <div className="hd-t-accent" />
                    <div className="hd-t-info">
                      <div className="hd-orb hd-t-name">{t.tournamentName}</div>
                      <div className="hd-t-sub">{roundsMap[t._id]?.length ? `${roundsMap[t._id].length} rounds` : 'tap to expand'}</div>
                    </div>
                    <span className="hd-t-chev">
                      {isExp ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                    </span>
                  </div>

                  {isExp && (
                    <div className="hd-rounds">
                      {roundsMap[t._id]?.length ? roundsMap[t._id].map(r => {
                        const key = `${t._id}_${r._id}`;
                        const isSel = activeRound?.tId === t._id && activeRound?.rId === r._id;
                        const hasLive = !!selectedMatches[key];
                        return (
                          <div key={r._id} className={`hd-r-item${isSel ? ' sel' : ''}`} onClick={() => selectRound(t._id, r._id)}>
                            <span className="hd-orb hd-r-name">{r.roundName}</span>
                            {hasLive && (
                              <div className="hd-r-live">
                                <div className="hd-r-live-dot" />
                                <span className="hd-r-live-txt">ON AIR</span>
                              </div>
                            )}
                          </div>
                        );
                      }) : (
                        <div style={{ padding: '8px 10px', fontFamily: 'Orbitron,monospace', fontSize: 8, color: '#0d1a10', letterSpacing: 1 }}>NO ROUNDS</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Main Surface ── */}
        <div className="hd-surface">

          {/* Command bar */}
          <div className="hd-cmdbar">
            <div className="hd-cmdbar-left">
              {ar
                ? <>
                    <span className="hd-orb hd-cmd-round">{arRound?.roundName}</span>
                    <span className="hd-cmd-tour">{arTour?.tournamentName}</span>
                  </>
                : <span className="hd-orb hd-cmd-none">SELECT A ROUND</span>
              }
            </div>

            <div className="hd-cmdbar-mid">
              {/* LIVE chip */}
              <div className="hd-status-chip live">
                <div className="hd-chip-dot" style={{ background: arLive ? '#4ade80' : '#1a3320', boxShadow: arLive ? '0 0 5px #4ade80' : 'none' }} />
                <span className="hd-orb hd-chip-label" style={{ color: '#4ade80' }}>LIVE</span>
                <span className="hd-mono hd-chip-val" style={{ color: arLive ? '#4ade80' : '#1a3320' }}>
                  {liveMatchObj ? `M${liveMatchObj.matchNo ?? liveMatchObj._matchNo ?? '?'}` : '—'}
                </span>
              </div>
              {/* SCHED chip */}
              <div className="hd-status-chip sched">
                <div className="hd-chip-dot" style={{ background: arSched.length > 0 ? '#60a5fa' : '#1a2340', boxShadow: arSched.length > 0 ? '0 0 5px #60a5fa' : 'none' }} />
                <span className="hd-orb hd-chip-label" style={{ color: '#60a5fa' }}>SCHED</span>
                <span className="hd-mono hd-chip-val" style={{ color: arSched.length > 0 ? '#60a5fa' : '#1a2340' }}>
                  {arSched.length > 0 ? `${arSched.length} SEL` : '—'}
                </span>
              </div>
            </div>

            <div className="hd-cmdbar-right">
              <span className="hd-orb hd-theme-label">THEME</span>
              <select
                className="hd-theme-sel"
                value={ar ? arTheme : 'Theme1'}
                disabled={!ar}
                onChange={e => ar && setThemeMap(p => ({ ...p, [ar.tId]: e.target.value }))}
              >
                {THEMES.map(th => <option key={th} value={th}>{th}</option>)}
              </select>
            </div>
          </div>

          {!ar ? (
            <div className="hd-empty">
              <div className="hd-empty-icon"><FaSatelliteDish /></div>
              <div className="hd-orb hd-empty-h">NO ROUND SELECTED</div>
              <p className="hd-empty-p">Pick a tournament and round from the navigator</p>
            </div>
          ) : (
            <>
              {/* Match selector bar */}
              {arMatches.length > 0 && (
                <div className="hd-matchbar">
                  {/* LIVE zone */}
                  <div className="hd-match-zone">
                    <div className="hd-match-zone-hdr">
                      <FaBroadcastTower size={11} style={{ color: '#4ade80' }} />
                      <span className="hd-orb hd-mz-label" style={{ color: '#4ade80' }}>LIVE MATCH</span>
                      <span className="hd-mz-sub">single</span>
                    </div>
                    <div className="hd-mchips">
                      {arMatches.map(m => {
                        const on = arLive === m._id;
                        return (
                          <div key={m._id} className={`hd-mchip${on ? ' live-on' : ''}`} onClick={() => toggleLiveMatch(ar.tId, ar.rId, m._id, !on)}>
                            <div className="hd-mchip-ind" />
                            M{m.matchNo ?? m._matchNo ?? '?'}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="hd-match-sep" />

                  {/* SCHEDULE zone */}
                  <div className="hd-match-zone">
                    <div className="hd-match-zone-hdr">
                      <FaCalendarAlt size={11} style={{ color: '#60a5fa' }} />
                      <span className="hd-orb hd-mz-label" style={{ color: '#60a5fa' }}>SCHEDULE</span>
                      <span className="hd-mz-sub">multi</span>
                    </div>
                    <div className="hd-mchips">
                      {arMatches.map(m => {
                        const on = arSched.includes(m._id);
                        return (
                          <div key={`s-${m._id}`} className={`hd-mchip${on ? ' sched-on' : ''}`} onClick={() => toggleSchedMatch(ar.tId, ar.rId, m._id, !on)}>
                            <div className="hd-mchip-ind" style={{ borderRadius: 2 }} />
                            M{m.matchNo ?? m._matchNo ?? '?'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Switcher panel ── */}
              <div className="hd-switcher">
                {arMatches.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', fontFamily: 'Orbitron,monospace', fontSize: 10, color: '#0d1a10', letterSpacing: 1 }}>
                    NO MATCHES IN THIS ROUND
                  </div>
                ) : (
                  VIEW_GROUPS.map((group, gi) => {
                    const enabled = isTileEnabled(group.id);
                    return (
                      <React.Fragment key={group.id}>
                        {gi > 0 && <div className="hd-sep" />}
                        <div className="hd-vg">
                          {/* Group header */}
                          <div className="hd-vg-header">
                            <div className="hd-vg-icon" style={{ color: group.color, borderColor: `${group.color}30`, background: `${group.color}0d` }}>
                              {group.icon}
                            </div>
                            <span className="hd-orb hd-vg-title" style={{ color: enabled ? group.color : '#1a2e1a' }}>
                              {group.label}
                            </span>
                            <span className="hd-orb hd-vg-count" style={{ color: group.color }}>
                              {group.views.length}
                            </span>
                            <div className="hd-vg-line" style={{ background: `linear-gradient(90deg, ${group.color}20, transparent)` }} />
                          </div>

                          {/* Tile grid */}
                          <div className="hd-tiles">
                            {group.views.map((v, vi) => (
                              <div
                                key={v.key}
                                className={`hd-tile${enabled ? ' enabled' : ''}`}
                                style={{
                                  '--tc': group.color,
                                  borderColor: enabled ? `${group.color}25` : 'rgba(255,255,255,0.04)',
                                  color: enabled ? group.color : '#1a2e1a',
                                } as React.CSSProperties}
                                onClick={() => enabled && handleTileClick(group.id, v.key)}
                              >
                                <div className="hd-tile-corner" />
                                <div className="hd-tile-num">{String(vi + 1).padStart(2, '0')}</div>
                                <div className="hd-tile-name">{v.label}</div>
                                <div className="hd-tile-key">{v.key}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default DisplayHud;
