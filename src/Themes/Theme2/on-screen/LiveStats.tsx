import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from "react-router-dom";
import api from "../../../login/api.tsx";
import { decode } from "@msgpack/msgpack";
import { getCache, setCache, removeCache } from "../../../dashboard/cache.tsx";
import SocketManager from "../../../dashboard/socketManager.tsx";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — live-slim
// ═══════════════════════════════════════════════════════════════════════════════

interface TournamentApi {
  _id: string; tournamentName: string; torLogo: string;
  primaryColor: string; secondaryColor: string; overlayBg: string;
}
interface RoundApi { _id: string; roundName: string; apiEnable: boolean; }
interface MatchApi { _id: string; matchName: string; matchNo: number; map: string; }
interface LivePlayerApi {
  _id: string; uId: string; playerName: string; picUrl: string;
  health: number; liveState: number; killNum: number; rank: number;
  isOutsideBlueCircle: boolean; bHasDied: boolean; isFiring: boolean;
}
interface LiveTeamApi {
  _id: string; teamId: string; teamName: string; teamTag: string;
  teamLogo: string; slot: number; placePoints: number; players: LivePlayerApi[];
}
interface MatchDataApi { _id: string; teams: LiveTeamApi[]; }
interface LiveSlimData {
  tournament: TournamentApi; round: RoundApi; match: MatchApi; matchData: MatchDataApi;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — overall-slim
// ═══════════════════════════════════════════════════════════════════════════════

interface OverallPlayerApi {
  uId: string; playerName: string; picUrl: string;
  killNum: number; damage: number; assists: number; knockouts: number;
  [key: string]: any;
}
interface OverallTeamApi {
  teamId: string; teamName: string; teamTag: string; teamLogo: string;
  slot: number; matchCount: number; totalPlacePoints: number;
  totalKills: number; totalPoints: number; players: OverallPlayerApi[];
}
interface OverallSlimData {
  tournament: TournamentApi; round: RoundApi; matchCount: number; teams: OverallTeamApi[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface LiveTeamDerived extends LiveTeamApi {
  totalKills: number; alive: number; totalPoints: number; isAllDead: boolean;
}
interface OverallTeamDerived extends OverallTeamApi { liveRank: number | null; }

// ═══════════════════════════════════════════════════════════════════════════════
// ID NORMALISER
// ═══════════════════════════════════════════════════════════════════════════════

const sid = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val.$oid && typeof val.$oid === 'string') return val.$oid;
  if (val.buffer instanceof Uint8Array && val.buffer.length === 12)
    return Array.from(val.buffer).map((b: any) => b.toString(16).padStart(2, '0')).join('');
  if (val.id instanceof Uint8Array && val.id.length === 12)
    return Array.from(val.id).map((b: any) => b.toString(16).padStart(2, '0')).join('');
  if (val instanceof Uint8Array && val.length === 12)
    return Array.from(val).map((b: any) => b.toString(16).padStart(2, '0')).join('');
  try { const s = val.toString(); if (s !== '[object Object]') return s; } catch (_) {}
  console.warn('[LiveStats] sid() could not stringify:', val);
  return '';
};

// ═══════════════════════════════════════════════════════════════════════════════
// SMART DECODE
// ═══════════════════════════════════════════════════════════════════════════════

const smartDecode = (data: any, contentType = ''): any => {
  if (
    data !== null && typeof data === 'object' &&
    !(data instanceof ArrayBuffer) && !(data instanceof Uint8Array) &&
    !(data?.type === 'Buffer' && Array.isArray(data.data))
  ) return data;

  const bytes = (() => {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data?.type === 'Buffer' && Array.isArray(data.data)) return new Uint8Array(data.data);
    return new Uint8Array(data);
  })();

  if (contentType.includes('application/x-msgpack') || contentType.includes('application/msgpack'))
    return decode(bytes);

  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch {
    try { return decode(bytes); }
    catch (e) { console.error('[LiveStats] smartDecode failed:', e); return null; }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALISERS  ← deep field logging lives here so we catch the problem at source
// ═══════════════════════════════════════════════════════════════════════════════

const normaliseLiveTeams = (teams: any[]): LiveTeamApi[] =>
  (teams || []).map((t) => ({
    ...t,
    _id:    sid(t._id),
    teamId: sid(t.teamId),
    players: (t.players || []).map((p: any) => ({ ...p, _id: sid(p._id) })),
  }));

const normaliseLivePayload = (raw: any): LiveSlimData => ({
  tournament: { ...raw.tournament, _id: sid(raw.tournament?._id) },
  round:      { ...raw.round,      _id: sid(raw.round?._id) },
  match:      { ...raw.match,      _id: sid(raw.match?._id) },
  matchData:  { ...raw.matchData,  _id: sid(raw.matchData?._id), teams: normaliseLiveTeams(raw.matchData?.teams) },
});

const normaliseOverallTeams = (teams: any[]): OverallTeamApi[] => {
  if (!teams?.length) {
    console.warn('[LiveStats][normalise] overall teams array empty/missing:', teams);
    return [];
  }
  return teams.map((t, i) => {
    // ── FULL RAW FIELD DUMP — tells us the exact key names the server sends ──
    console.log(`[LiveStats][normalise] overall raw[${i}] teamTag="${t.teamTag}" allKeys:`, Object.keys(t));
    console.log(`[LiveStats][normalise] overall raw[${i}] points candidates:`,
      { totalPoints: t.totalPoints, total_points: t.total_points },
      '| kills candidates:', { totalKills: t.totalKills, total_kills: t.total_kills },
      '| matchCount candidates:', { matchCount: t.matchCount, match_count: t.match_count });

    const totalPoints      = t.totalPoints      ?? t.total_points       ?? 0;
    const totalKills       = t.totalKills       ?? t.total_kills        ?? 0;
    const totalPlacePoints = t.totalPlacePoints ?? t.total_place_points ?? 0;
    const matchCount       = t.matchCount       ?? t.match_count        ?? 0;

    console.log(`[LiveStats][normalise] overall resolved[${i}] "${t.teamTag}" → pts=${totalPoints} kills=${totalKills} matchCount=${matchCount}`);

    return {
      ...t,
      teamId: sid(t.teamId),
      totalPoints, totalKills, totalPlacePoints, matchCount,
      players: (t.players || []).map((p: any) => ({ ...p })),
    };
  });
};

const normaliseOverallPayload = (raw: any): OverallSlimData => {
  console.log('[LiveStats][normalise] overall payload top-level keys:', Object.keys(raw));
  console.log('[LiveStats][normalise] overall payload matchCount raw:', raw.matchCount,
    '| match_count:', raw.match_count, '| teams count:', raw.teams?.length);
  if (raw.teams?.[0])
    console.log('[LiveStats][normalise] overall teams[0] raw (first 500 chars):',
      JSON.stringify(raw.teams[0]).slice(0, 500));

  return {
    tournament: { ...raw.tournament, _id: sid(raw.tournament?._id) },
    round:      { ...raw.round,      _id: sid(raw.round?._id) },
    matchCount: raw.matchCount ?? raw.match_count ?? 0,
    teams:      normaliseOverallTeams(raw.teams),
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const toUint8 = (d: any): Uint8Array => {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (d?.type === 'Buffer' && Array.isArray(d.data)) return new Uint8Array(d.data);
  return new Uint8Array(d);
};

const shallowEqualTeams = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ta = a[i]; const tb = b[i];
    if (ta._id !== tb._id || ta.placePoints !== tb.placePoints || ta.players?.length !== tb.players?.length) return false;
    for (let j = 0; j < (ta.players?.length ?? 0); j++) {
      const pa = ta.players[j]; const pb = tb.players[j];
      if (pa._id !== pb._id || pa.killNum !== pb.killNum || pa.liveState !== pb.liveState || pa.bHasDied !== pb.bHasDied) return false;
    }
  }
  return true;
};

const EMPTY_TOURNAMENT: TournamentApi = {
  _id: '', tournamentName: '', torLogo: '', primaryColor: '#dbb983', secondaryColor: '#583907', overlayBg: '',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const LiveStats: React.FC = () => {
  const { tournamentId, roundId, matchId } = useParams<{
    tournamentId: string; roundId: string; matchId: string;
  }>();
  const [searchParams] = useSearchParams();
  const followSelected = (searchParams.get('followSelected') || 'false').toLowerCase() === 'true';

  const [liveData,    setLiveData]    = useState<LiveSlimData    | null>(null);
  const [overallData, setOverallData] = useState<OverallSlimData | null>(null);

  const matchIdRef     = useRef('');
  const matchDataIdRef = useRef('');

  useEffect(() => {
    const nextMatch     = liveData?.match?._id     || '';
    const nextMatchData = liveData?.matchData?._id || '';
    if (matchIdRef.current !== nextMatch || matchDataIdRef.current !== nextMatchData) {
      matchIdRef.current     = nextMatch;
      matchDataIdRef.current = nextMatchData;
      console.log('[LiveStats] Refs updated → match:', nextMatch, '| matchData:', nextMatchData);
    }
  }, [liveData]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!tournamentId || !roundId) return;

    const fetchBoth = async () => {
      let effectiveMatchId = matchId;
      if (followSelected) {
        try {
          const sel = await api.get(`public/tournaments/${tournamentId}/rounds/${roundId}/selected-match`);
          if (sel.data?.matchId) effectiveMatchId = sel.data.matchId;
        } catch { console.warn('[LiveStats] selected-match lookup failed'); }
      }
      console.log('[LiveStats] fetchBoth →', { tournamentId, roundId, effectiveMatchId });

      // overall first — no dependency on live data
      const fetchOverall = (async () => {
        const key    = `overallSlimData-${tournamentId}-${roundId}`;
        const cached = getCache(key, 30_000) as OverallSlimData | null;
        if (cached) {
          console.log('[LiveStats] overall CACHE HIT teams:', cached.teams.length,
            'matchCount:', cached.matchCount, 'top pts:', cached.teams[0]?.totalPoints);
          setOverallData(cached);
        }

        try {
          const res = await api.get(
            `overallData/tournament/${tournamentId}/round/${roundId}/overall-slim`,
            { responseType: 'arraybuffer' }
          );

          // ── raw HTTP inspection ────────────────────────────────────────────
          console.log('[LiveStats] overall HTTP status:', res.status,
            '| content-type:', res.headers?.['content-type'],
            '| data type:', typeof res.data,
            res.data instanceof ArrayBuffer ? '(ArrayBuffer)' :
            res.data instanceof Uint8Array  ? '(Uint8Array)'  : '(other)');

          const raw = smartDecode(res.data, res.headers?.['content-type'] || '');
          if (!raw) { console.error('[LiveStats] overall smartDecode → null'); return; }

          // ── raw decoded inspection ─────────────────────────────────────────
          console.log('[LiveStats] overall RAW type:', typeof raw,
            '| top keys:', Object.keys(raw),
            '| matchCount:', raw.matchCount, '| match_count:', raw.match_count,
            '| teams.length:', raw.teams?.length);
          if (raw.teams?.[0])
            console.log('[LiveStats] overall RAW teams[0]:', JSON.stringify(raw.teams[0]).slice(0, 500));

          const newData = normaliseOverallPayload(raw);
          console.log('[LiveStats] overall NORMALISED teams:', newData.teams.length,
            '| matchCount:', newData.matchCount,
            '| top team:', newData.teams[0]?.teamTag,
            '| top pts:', newData.teams[0]?.totalPoints,
            '| top kills:', newData.teams[0]?.totalKills);

          const sameCount = cached?.teams?.length === newData.teams.length;
          const samePts   = cached?.teams?.[0]?.totalPoints === newData.teams[0]?.totalPoints;
          if (!cached || !sameCount || !samePts) {
            removeCache(key); setCache(key, newData);
            setOverallData(newData);
            console.log('[LiveStats] overall setState called');
          } else {
            console.log('[LiveStats] overall unchanged vs cache — skipping setState');
          }
        } catch (err) { console.error('[LiveStats] overall fetch failed:', err); }
      })();

      // live-slim
      const fetchLive = effectiveMatchId
        ? (async () => {
            const key    = `liveSlimData-${tournamentId}-${roundId}-${effectiveMatchId}`;
            const cached = getCache(key, 30_000) as LiveSlimData | null;
            if (cached) { console.log('[LiveStats] live CACHE HIT matchId:', cached.match._id); setLiveData(cached); }

            try {
              const res = await api.get(
                `liveData/tournament/${tournamentId}/round/${roundId}/match/${effectiveMatchId}/live-slim`,
                { responseType: 'arraybuffer' }
              );
              const raw = smartDecode(res.data, res.headers?.['content-type'] || '');
              if (!raw) { console.error('[LiveStats] live smartDecode → null'); return; }

              const newData = normaliseLivePayload(raw);
              console.log('[LiveStats] live fetched matchId:', newData.match._id,
                '| matchDataId:', newData.matchData._id, '| teams:', newData.matchData.teams.length);

              const changed = !cached || cached.matchData._id !== newData.matchData._id
                || !shallowEqualTeams(cached.matchData.teams, newData.matchData.teams);
              if (changed) { removeCache(key); setCache(key, newData); setLiveData(newData); }
            } catch (err) { console.error('[LiveStats] live fetch failed:', err); }
          })()
        : Promise.resolve();

      await Promise.all([fetchOverall, fetchLive]);
    };

    fetchBoth();
  }, [tournamentId, roundId, matchId, followSelected]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCKET
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const socketManager = SocketManager.getInstance();
    const socket        = socketManager.connect();
    console.log('[LiveStats] Socket mounted. connected:', socket.connected);
    socket.onAny((ev: string, ...args: any[]) => console.log(`[LiveStats] Socket: "${ev}"`, args));

    const handleOverallSlimUpdate = (enc: any) => {
      try {
        const decoded = normaliseOverallPayload(smartDecode(toUint8(enc)));
        console.log('[LiveStats] socket overallSlimUpdate teams:', decoded.teams.length, 'matchCount:', decoded.matchCount);
        setOverallData(decoded);  
      } catch (e) { console.error('[LiveStats] overallSlimUpdate error:', e); }
    };

    const handleLiveSlimUpdate = (enc: any) => {
      try {
        const decoded = normaliseLivePayload(smartDecode(toUint8(enc)));
        console.log('[LiveStats] socket liveSlimUpdate matchId:', decoded.match._id);
        setLiveData(decoded);
      } catch (e) { console.error('[LiveStats] liveSlimUpdate error:', e); }
    };

    const handleLiveUpdate = (incoming: any) => {
      if (!matchIdRef.current || sid(incoming.matchId) !== matchIdRef.current) return;
      setLiveData((prev) => prev ? { ...prev, matchData: incoming } : prev);
    };

    const handleMatchDataUpdate = (incoming: any) => {
      if (!matchDataIdRef.current || sid(incoming.matchDataId) !== matchDataIdRef.current) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return { ...prev, matchData: { ...prev.matchData, teams: prev.matchData.teams.map((team) => {
          if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId)) return team;
          const changes = incoming.changes || {};
          const next: any = { ...team, ...changes };
          if (Array.isArray(changes.players)) {
            const byId = new Map(changes.players.map((p: any) => [sid(p._id), p]));
            next.players = team.players.map((p) => { const u = byId.get(p._id); return u ? { ...p, ...u } : p; });
          }
          return next;
        })}};
      });
    };

    const handlePlayerUpdate = (incoming: any) => {
      if (!matchDataIdRef.current || sid(incoming.matchDataId) !== matchDataIdRef.current) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return { ...prev, matchData: { ...prev.matchData, teams: prev.matchData.teams.map((team) => {
          if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId)) return team;
          return { ...team, players: team.players.map((p) => p._id === sid(incoming.playerId) ? { ...p, ...incoming.updates } : p) };
        })}};
      });
    };

    const handleTeamPointsUpdate = (incoming: any) => {
      if (!matchDataIdRef.current || sid(incoming.matchDataId) !== matchDataIdRef.current) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return { ...prev, matchData: { ...prev.matchData, teams: prev.matchData.teams.map((team) => {
          if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId)) return team;
          return { ...team, placePoints: incoming.changes?.placePoints ?? team.placePoints };
        })}};
      });
    };

    const handleTeamStatsUpdate = (incoming: any) => {
      if (!matchDataIdRef.current || sid(incoming.matchDataId) !== matchDataIdRef.current) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return { ...prev, matchData: { ...prev.matchData, teams: prev.matchData.teams.map((team) => {
          if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId)) return team;
          const updatedPlayers = incoming.players
            ? team.players.map((p) => { const u = incoming.players.find((x: any) => sid(x._id) === p._id); return u ? { ...p, killNum: u.killNum } : p; })
            : team.players;
          return { ...team, players: updatedPlayers };
        })}};
      });
    };

    const handleBulkTeamUpdate = (incoming: any) => {
      if (!matchDataIdRef.current || sid(incoming.matchDataId) !== matchDataIdRef.current) return;
      if (!incoming.changes?.players) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return { ...prev, matchData: { ...prev.matchData, teams: prev.matchData.teams.map((team) => {
          if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId)) return team;
          const byId = new Map(incoming.changes.players.map((p: any) => [sid(p._id), p]));
          return { ...team, players: team.players.map((p) => { const u = byId.get(p._id); return u ? { ...p, ...u } : p; }) };
        })}};
      });
    };

    socket.on('overallSlimUpdate',  handleOverallSlimUpdate);
    socket.on('liveSlimUpdate',     handleLiveSlimUpdate);
    socket.on('liveMatchUpdate',    handleLiveUpdate);
    socket.on('matchDataUpdated',   handleMatchDataUpdate);
    socket.on('playerStatsUpdated', handlePlayerUpdate);
    socket.on('teamPointsUpdated',  handleTeamPointsUpdate);
    socket.on('teamStatsUpdated',   handleTeamStatsUpdate);
    socket.on('bulkTeamUpdate',     handleBulkTeamUpdate);

    return () => {
      console.log('[LiveStats] Socket cleanup');
      socket.offAny();
      ['overallSlimUpdate','liveSlimUpdate','liveMatchUpdate','matchDataUpdated',
       'playerStatsUpdated','teamPointsUpdated','teamStatsUpdated','bulkTeamUpdate']
        .forEach(e => socket.off(e));
      socketManager.disconnect();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMOS
  // ═══════════════════════════════════════════════════════════════════════════

  const sortedLiveTeams = useMemo((): LiveTeamDerived[] => {
    const teams = liveData?.matchData?.teams;
    if (!teams?.length) return [];
    return teams
      .map((team) => {
        const totalKills  = team.players.reduce((s, p) => s + (p.killNum || 0), 0);
        const totalPoints = (team.placePoints || 0) + totalKills;
        return { ...team, totalKills, alive: team.players.filter((p) => p.liveState !== 5).length,
          totalPoints, isAllDead: team.players.every((p) => p.liveState === 5 || p.bHasDied) };
      })
      .sort((a, b) => b.totalPoints !== a.totalPoints ? b.totalPoints - a.totalPoints : b.totalKills - a.totalKills);
  }, [liveData]);

  // slot→rank and slot→stats from live panel (independent memo)
  const liveSlotMaps = useMemo(() => {
    const rankBySlot  = new Map<number, number>();
    const statsBySlot = new Map<number, { kills: number; points: number }>();
    sortedLiveTeams.forEach((t, i) => {
      rankBySlot.set(t.slot, i + 1);
      statsBySlot.set(t.slot, { kills: t.totalKills, points: t.totalPoints });
    });
    return { rankBySlot, statsBySlot };
  }, [sortedLiveTeams]);

  // overall panel — runs independently when overallData arrives, no live dep
  const sortedOverallTeams = useMemo((): OverallTeamDerived[] => {
    const teams = overallData?.teams;
    if (!teams?.length) {
      console.log('[LiveStats][memo] no overall teams. overallData=', overallData);
      return [];
    }

    const { rankBySlot, statsBySlot } = liveSlotMaps;
    console.log('[LiveStats][memo] sortedOverallTeams → teams:', teams.length,
      '| matchCount:', overallData!.matchCount,
      '| live slots available:', rankBySlot.size,
      '| teams[0] storedPts:', teams[0]?.totalPoints,
      '| teams[0] storedKills:', teams[0]?.totalKills);

    return [...teams]
      .map((team) => {
        const liveStats   = statsBySlot.get(team.slot);
        const useLiveSeed = overallData!.matchCount === 0 && !!liveStats;
        const effectiveKills  = useLiveSeed ? liveStats!.kills  : team.totalKills;
        const effectivePoints = useLiveSeed ? liveStats!.points : team.totalPoints;

        console.log(`[LiveStats][memo] team "${team.teamTag}" slot=${team.slot}`,
          `matchCount=${overallData!.matchCount} useLiveSeed=${useLiveSeed}`,
          `stored pts=${team.totalPoints} → effective pts=${effectivePoints}`);

        return { ...team, totalKills: effectiveKills, totalPoints: effectivePoints,
          liveRank: rankBySlot.get(team.slot) ?? null };
      })
      .sort((a, b) => b.totalPoints !== a.totalPoints ? b.totalPoints - a.totalPoints : b.totalKills - a.totalKills);
  }, [overallData, liveSlotMaps]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  const tournament = liveData?.tournament ?? overallData?.tournament ?? EMPTY_TOURNAMENT;
  const gradientBg = useMemo(
    () => `linear-gradient(135deg, ${tournament.primaryColor || '#dbb983'}, ${tournament.secondaryColor || '#583907'})`,
    [tournament.primaryColor, tournament.secondaryColor]
  );

  const liveTopTeam      = sortedLiveTeams[0]   ?? null;
  const liveRemaining    = sortedLiveTeams.slice(1);
  const liveBaseRowH     = 50;
  const liveScaleY       = useMemo(
    () => Math.min(1, (1080 - 250) / (Math.max(1, liveRemaining.length) * liveBaseRowH)),
    [liveRemaining.length]
  );

  const overallTopTeam   = sortedOverallTeams[0] ?? null;
  const overallRemaining = sortedOverallTeams.slice(1);
  const overallBaseRowH  = 50;
  const overallScaleY    = useMemo(
    () => Math.min(1, (1080 - 250) / (Math.max(1, overallRemaining.length) * overallBaseRowH)),
    [overallRemaining.length]
  );

  const matchCount = overallData?.matchCount ?? 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-[1920px] h-[1080px] flex justify-end relative top-[0px]">

      {/* ── LIVE PANEL ───────────────────────────────────────────────────── */}
      <div className="relative w-[400px] h-[1080px] flex flex-col">
        <div className="w-[400px] h-[220px] relative overflow-hidden flex-shrink-0" style={{ background: gradientBg }}>
          <div className="absolute top-[6px] left-[10px] z-30 text-white/50 font-[righteous] text-[0.65rem] tracking-widest uppercase">
            Match Live
          </div>
          {liveTopTeam?.players.map((player, idx) => (
            <div key={`lt-${player._id}-${idx}`} className="absolute w-[200px] h-[200px]"
              style={{ left: `${-25 + idx * 85}px`, top: '50%', transform: 'translateY(-50%)', zIndex: 1, opacity: liveTopTeam.isAllDead ? 0.4 : 1 }}>
              <img src={player.picUrl || '/def_char.png'} alt={player.playerName} className="w-full h-full object-cover" />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/70 to-black z-10 h-[100px] top-[120px]" />
          {liveTopTeam && (
            <div className="absolute w-full h-[40px] top-[180px] z-20 font-[righteous] text-[1.5rem] flex items-center">
              <div className="text-white relative left-[20px] w-[30px]">1</div>
              <div className="w-[40px] relative left-[20px]">
                <img src={liveTopTeam.teamLogo} alt={liveTopTeam.teamTag} className="w-full h-full" />
              </div>
              <div className="w-[1px] h-[90%] bg-white relative left-[22px]" />
              <div className="relative left-[30px] flex-1 text-white">{liveTopTeam.teamTag}</div>
              <div className="text-white relative left-[-2px] w-[40px] text-center">{liveTopTeam.totalPoints}</div>
              <div className="text-white relative left-[12px] w-[40px] text-center mr-[20px]">{liveTopTeam.totalKills}</div>
            </div>
          )}
        </div>

        <div className="w-[400px] h-[30px] text-[1.1rem] font-[Righteous] flex items-center justify-between px-4 font-bold text-black text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}>
          <span>#</span><span>TEAM NAME</span>
          <span className="relative left-[50px]">ALIVE</span>
          <span className="relative left-[28px]">PTS</span>
          <span className="relative left-[4px]">KILLS</span>
        </div>

        <div className="flex-1 overflow-hidden w-[400px]">
          <div style={{ transform: `scaleY(${liveScaleY})`, transformOrigin: 'top right' }}>
            {liveRemaining.map((team, idx) => (
              <div key={`lr-${team._id}-${idx}`}
                className="w-full relative flex items-center text-black font-bold border-b border-b-black overflow-visible"
                style={{ height: `${liveBaseRowH}px`, opacity: team.isAllDead ? 0.7 : 1 }}>
                <div className="absolute w-[40px] flex items-center justify-center text-white text-[1.5rem]"
                  style={{ height: `${liveBaseRowH}px`, background: gradientBg }}>{idx + 2}</div>
                <div className="w-[80px] relative left-[4px] h-full ml-[40px] bg-white">
                  <img src={team.teamLogo} alt={team.teamTag} className="w-full h-full object-contain" />
                </div>
                <div className="h-full w-[260px] flex items-center text-black text-[1.5rem] pl-[10px] bg-white">{team.teamTag}</div>
                <div className="h-full flex text-white" style={{ background: gradientBg }}>
                  <div className="w-[60px] flex items-center justify-center text-[1.5rem] relative left-[7px]">{team.totalPoints}</div>
                  <div className="w-[60px] flex items-center justify-center text-[1.5rem] text-yellow-200">{team.totalKills}</div>
                </div>
              </div>
            ))}
            <div className="w-full h-[30px] font-[Righteous] flex justify-center items-center text-black font-bold"
              style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}>
              {tournament.tournamentName}
            </div>
          </div>
        </div>
      </div>

      {/* ── OVERALL PANEL ────────────────────────────────────────────────── */}
      <div className="relative w-[400px] h-[1080px] flex flex-col">
        <div className="w-[400px] h-[220px] relative overflow-hidden flex-shrink-0" style={{ background: gradientBg }}>
          <div className="absolute top-[6px] left-[10px] z-30 text-white/50 font-[righteous] text-[0.65rem] tracking-widest uppercase">
            Overall · {matchCount} {matchCount === 1 ? 'Match' : 'Matches'}
          </div>
          {overallTopTeam?.players.slice(0, 4).map((player, idx) => (
            <div key={`ot-${player.uId}-${idx}`} className="absolute w-[200px] h-[200px]"
              style={{ left: `${-25 + idx * 85}px`, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
              <img src={player.picUrl || '/def_char.png'} alt={player.playerName} className="w-full h-full object-cover" />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/70 to-black z-10 h-[100px] top-[120px]" />
          {overallTopTeam && (
            <div className="absolute w-full h-[40px] top-[180px] z-20 font-[righteous] text-[1.5rem] flex items-center">
              <div className="text-white relative left-[20px] w-[30px]">1</div>
              <div className="w-[40px] relative left-[20px]">
                <img src={overallTopTeam.teamLogo} alt={overallTopTeam.teamTag} className="w-full h-full" />
              </div>
              <div className="w-[1px] h-[90%] bg-white relative left-[22px]" />
              <div className="relative left-[30px] flex-1 text-white">{overallTopTeam.teamTag}</div>
              <div className="text-white relative left-[-2px] w-[40px] text-center">{overallTopTeam.totalPoints}</div>
              <div className="text-white relative left-[12px] w-[40px] text-center mr-[20px]">{overallTopTeam.totalKills}</div>
            </div>
          )}
        </div>

        <div className="w-[400px] h-[30px] text-[1.1rem] font-[Righteous] flex items-center justify-between px-4 font-bold text-black text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}>
          <span>#</span><span>TEAM NAME</span>
          <span className="relative left-[28px]">NOW</span>
          <span className="relative left-[20px]">PTS</span>
          <span className="relative left-[4px]">KILLS</span>
        </div>

        <div className="flex-1 overflow-hidden w-[400px]">
          <div style={{ transform: `scaleY(${overallScaleY})`, transformOrigin: 'top right' }}>
            {overallRemaining.map((team, idx) => {
              const overallRank = idx + 2;
              const liveBetter  = team.liveRank !== null && team.liveRank <= overallRank;
              return (
                <div key={`or-${team.teamId}-${idx}`}
                  className="w-full relative flex items-center text-black font-bold border-b border-b-black overflow-visible"
                  style={{ height: `${overallBaseRowH}px` }}>
                  <div className="absolute w-[40px] flex items-center justify-center text-white text-[1.5rem]"
                    style={{ height: `${overallBaseRowH}px`, background: gradientBg }}>{overallRank}</div>
                  <div className="w-[80px] relative left-[4px] h-full ml-[40px] bg-white">
                    <img src={team.teamLogo} alt={team.teamTag} className="w-full h-full object-contain" />
                  </div>
                  <div className="h-full w-[200px] flex items-center text-black text-[1.5rem] pl-[10px] bg-white">{team.teamTag}</div>
                  <div className="h-full w-[60px] flex items-center justify-center bg-white">
                    {team.liveRank !== null ? (
                      <span className="text-[1rem] font-[righteous] px-[5px] py-[1px] rounded"
                        style={{ background: gradientBg, color: '#fff', outline: `2px solid ${liveBetter ? '#4ade80' : '#f87171'}` }}>
                        #{team.liveRank}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[1.1rem]">—</span>
                    )}
                  </div>
                  <div className="h-full flex text-white" style={{ background: gradientBg }}>
                    <div className="w-[50px] flex items-center justify-center text-[1.5rem]">{team.totalPoints}</div>
                    <div className="w-[50px] flex items-center justify-center text-[1.5rem] text-yellow-200">{team.totalKills}</div>
                  </div>
                </div>
              );
            })}
            <div className="w-full h-[30px] font-[Righteous] flex justify-center items-center text-black font-bold"
              style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}>
              {overallData?.round?.roundName ?? tournament.tournamentName}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default LiveStats;
