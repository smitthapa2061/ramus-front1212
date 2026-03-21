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
  _id: string;
  tournamentName: string;
  torLogo: string;
  primaryColor: string;
  secondaryColor: string;
  overlayBg: string;
}

interface RoundApi {
  _id: string;
  roundName: string;
  apiEnable: boolean;
}

interface MatchApi {
  _id: string;
  matchName: string;
  matchNo: number;
  map: string;
}

interface LivePlayerApi {
  _id: string;
  uId: string;
  playerName: string;
  picUrl: string;
  health: number;
  liveState: number;
  killNum: number;
  rank: number;
  isOutsideBlueCircle: boolean;
  bHasDied: boolean;
  isFiring: boolean;
}

interface LiveTeamApi {
  _id: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  placePoints: number;
  players: LivePlayerApi[];
}

interface MatchDataApi {
  _id: string;
  teams: LiveTeamApi[];
}

interface LiveSlimData {
  tournament: TournamentApi;
  round: RoundApi;
  match: MatchApi;
  matchData: MatchDataApi;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — overall-slim
// ═══════════════════════════════════════════════════════════════════════════════

interface OverallPlayerApi {
  uId: string;
  playerName: string;
  picUrl: string;
  killNum: number;
  damage: number;
  assists: number;
  knockouts: number;
  [key: string]: any;
}

interface OverallTeamApi {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  matchCount: number;
  totalPlacePoints: number;
  totalKills: number;
  totalPoints: number;
  players: OverallPlayerApi[];
}

interface OverallSlimData {
  tournament: TournamentApi;
  round: RoundApi;
  matchCount: number;
  teams: OverallTeamApi[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface LiveTeamDerived extends LiveTeamApi {
  totalKills: number;
  alive: number;
  totalPoints: number;
  isAllDead: boolean;
}

interface OverallTeamDerived extends OverallTeamApi {
  liveRank: number | null;
}

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
  try {
    const str = val.toString();
    if (str !== '[object Object]') return str;
  } catch (_) {}
  console.warn('[LiveStats] sid() could not stringify:', val);
  return '';
};

// ═══════════════════════════════════════════════════════════════════════════════
// SMART DECODE — handles both msgpack (arraybuffer) and plain JSON
// ═══════════════════════════════════════════════════════════════════════════════
const smartDecode = (data: any, contentType: string = ''): any => {
  // Already a plain object (axios parsed it without responseType override)
  if (
    data !== null &&
    typeof data === 'object' &&
    !(data instanceof ArrayBuffer) &&
    !(data instanceof Uint8Array) &&
    !(data?.type === 'Buffer' && Array.isArray(data.data))
  ) {
    return data;
  }

  const bytes = (() => {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data?.type === 'Buffer' && Array.isArray(data.data)) return new Uint8Array(data.data);
    return new Uint8Array(data);
  })();

  // Only use msgpack when server explicitly says so
  if (
    contentType.includes('application/x-msgpack') ||
    contentType.includes('application/msgpack')
  ) {
    return decode(bytes);
  }

  // Default: treat as JSON text (your server returns JSON)
  try {
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch (err) {
    // Last resort: try msgpack anyway
    try {
      return decode(bytes);
    } catch {
      console.error('[LiveStats] smartDecode: failed both JSON and msgpack', err);
      return null;
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALISERS
// ═══════════════════════════════════════════════════════════════════════════════

const normaliseLiveTeams = (teams: any[]): LiveTeamApi[] =>
  (teams || []).map((t) => ({
    ...t,
    _id:     sid(t._id),
    teamId:  sid(t.teamId),
    players: (t.players || []).map((p: any) => ({ ...p, _id: sid(p._id) })),
  }));

const normaliseLivePayload = (raw: any): LiveSlimData => ({
  tournament: { ...raw.tournament, _id: sid(raw.tournament?._id) },
  round:      { ...raw.round,      _id: sid(raw.round?._id) },
  match:      { ...raw.match,      _id: sid(raw.match?._id) },
  matchData:  {
    ...raw.matchData,
    _id:   sid(raw.matchData?._id),
    teams: normaliseLiveTeams(raw.matchData?.teams),
  },
});

const normaliseOverallTeams = (teams: any[]): OverallTeamApi[] =>
  (teams || []).map((t) => ({
    ...t,
    teamId:           sid(t.teamId),
    totalPoints:      t.totalPoints      ?? t.total_points       ?? 0,
    totalKills:       t.totalKills       ?? t.total_kills        ?? 0,
    totalPlacePoints: t.totalPlacePoints ?? t.total_place_points ?? 0,
    matchCount:       t.matchCount       ?? t.match_count        ?? 0,
    players:          (t.players || []).map((p: any) => ({ ...p })),
  }));

const normaliseOverallPayload = (raw: any): OverallSlimData => ({
  tournament: { ...raw.tournament, _id: sid(raw.tournament?._id) },
  round:      { ...raw.round,      _id: sid(raw.round?._id) },
  matchCount: raw.matchCount ?? raw.match_count ?? 0,
  teams:      normaliseOverallTeams(raw.teams),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SOCKET BINARY DECODE HELPER
// ═══════════════════════════════════════════════════════════════════════════════

const toUint8 = (encodedData: any): Uint8Array => {
  if (encodedData instanceof Uint8Array) return encodedData;
  if (encodedData instanceof ArrayBuffer) return new Uint8Array(encodedData);
  if (encodedData?.type === 'Buffer' && Array.isArray(encodedData.data))
    return new Uint8Array(encodedData.data);
  return new Uint8Array(encodedData);
};

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACKS
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_TOURNAMENT: TournamentApi = {
  _id: '', tournamentName: '', torLogo: '',
  primaryColor: '#dbb983', secondaryColor: '#583907', overlayBg: '',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const LiveStats: React.FC = () => {
  const { tournamentId, roundId, matchId } = useParams<{
    tournamentId: string;
    roundId: string;
    matchId: string;
  }>();

  const [searchParams] = useSearchParams();
  const followSelected =
    (searchParams.get('followSelected') || 'false').toLowerCase() === 'true';

  // ── State ──────────────────────────────────────────────────────────────────
  const [liveData,    setLiveData]    = useState<LiveSlimData | null>(null);
  const [overallData, setOverallData] = useState<OverallSlimData | null>(null);
  const [liveTs,      setLiveTs]      = useState<number>(Date.now());
  const [overallTs,   setOverallTs]   = useState<number>(Date.now());

  // ── Refs for socket handlers ───────────────────────────────────────────────
  const matchIdRef     = useRef<string>('');
  const matchDataIdRef = useRef<string>('');

  useEffect(() => {
    matchIdRef.current     = liveData?.match?._id     || '';
    matchDataIdRef.current = liveData?.matchData?._id || '';
    console.log('[LiveStats] Refs →', matchIdRef.current, '|', matchDataIdRef.current);
  }, [liveData]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Effect 1 — Initial parallel fetch: live-slim + overall-slim
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!tournamentId || !roundId) return;

    const fetchBoth = async () => {

      // Resolve effective matchId
      let effectiveMatchId = matchId;
      if (followSelected) {
        try {
          const sel = await api.get(
            `public/tournaments/${tournamentId}/rounds/${roundId}/selected-match`
          );
          if (sel.data?.matchId) effectiveMatchId = sel.data.matchId;
        } catch {
          console.warn('[LiveStats] selected-match lookup failed, using URL matchId');
        }
      }

      console.log('[LiveStats] fetchBoth →', { tournamentId, roundId, effectiveMatchId });

      // ── live-slim ──────────────────────────────────────────────────────────
      const fetchLive = effectiveMatchId
        ? (async () => {
            const key    = `liveSlimData-${tournamentId}-${roundId}-${effectiveMatchId}`;
            const cached = getCache(key, 30_000) as LiveSlimData | null;
            if (cached) { setLiveData(cached); setLiveTs(Date.now()); }

            try {
              const res = await api.get(
                `liveData/tournament/${tournamentId}/round/${roundId}/match/${effectiveMatchId}/live-slim`,
                { responseType: 'arraybuffer' }
              );

              const contentType = res.headers?.['content-type'] || '';
              const raw         = smartDecode(res.data, contentType);

              if (!raw) {
                console.error('[LiveStats] live-slim: smartDecode returned null');
                return;
              }

              const newData = normaliseLivePayload(raw);
              console.log('[LiveStats] live-slim fetched → matchId:', newData.match._id,
                '| matchDataId:', newData.matchData._id);

              if (JSON.stringify(cached) !== JSON.stringify(newData)) {
                removeCache(key);
                setCache(key, newData);
                setLiveData(newData);
                setLiveTs(Date.now());
              }
            } catch (err) {
              console.error('[LiveStats] live-slim fetch failed:', err);
            }
          })()
        : Promise.resolve();

      // ── overall-slim ───────────────────────────────────────────────────────
      const fetchOverall = (async () => {
        const key    = `overallSlimData-${tournamentId}-${roundId}`;
        const cached = getCache(key, 30_000) as OverallSlimData | null;
        if (cached) { setOverallData(cached); setOverallTs(Date.now()); }

        try {
          const res = await api.get(
            `overallData/tournament/${tournamentId}/round/${roundId}/overall-slim`,
            { responseType: 'arraybuffer' }
          );

          const contentType = res.headers?.['content-type'] || '';
          const raw         = smartDecode(res.data, contentType);

          if (!raw) {
            console.error('[LiveStats] overall-slim: smartDecode returned null');
            return;
          }

          const newData = normaliseOverallPayload(raw);
          console.log('[LiveStats] overall-slim fetched → teams:', newData.teams.length,
            '| matchCount:', newData.matchCount,
            '| top team pts:', newData.teams[0]?.totalPoints);

          if (JSON.stringify(cached) !== JSON.stringify(newData)) {
            removeCache(key);
            setCache(key, newData);
            setOverallData(newData);
            setOverallTs(Date.now());
          }
        } catch (err) {
          console.error('[LiveStats] overall-slim fetch failed:', err);
        }
      })();

      await Promise.all([fetchLive, fetchOverall]);
    };

    fetchBoth();
  }, [tournamentId, roundId, matchId, followSelected]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Effect 2 — Socket (mounted once, refs prevent stale closures)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const socketManager = SocketManager.getInstance();
    const socket        = socketManager.connect();

    console.log('[LiveStats] Socket mounted. connected:', socket.connected, '| id:', socket.id);

    socket.onAny((eventName: string, ...args: any[]) => {
      console.log(`[LiveStats] Socket event: "${eventName}"`, args);
    });

    // ── overallSlimUpdate ────────────────────────────────────────────────────
    const handleOverallSlimUpdate = (encodedData: any) => {
      try {
        const raw     = smartDecode(toUint8(encodedData));
        const decoded = normaliseOverallPayload(raw);
        setOverallData(decoded);
        setOverallTs(Date.now());
      } catch (err) {
        console.error('[LiveStats] overallSlimUpdate decode failed:', err);
      }
    };

    // ── liveSlimUpdate ───────────────────────────────────────────────────────
    const handleLiveSlimUpdate = (encodedData: any) => {
      try {
        const raw     = smartDecode(toUint8(encodedData));
        const decoded = normaliseLivePayload(raw);
        setLiveData(decoded);
        setLiveTs(Date.now());
      } catch (err) {
        console.error('[LiveStats] liveSlimUpdate decode failed:', err);
      }
    };

    // ── liveMatchUpdate ──────────────────────────────────────────────────────
    const handleLiveUpdate = (incoming: any) => {
      const incomingId = sid(incoming.matchId);
      const currentId  = matchIdRef.current;
      console.log('[LiveStats] liveMatchUpdate incoming:', incomingId, '| ref:', currentId);
      if (!currentId || incomingId !== currentId) return;
      setLiveData((prev) => (prev ? { ...prev, matchData: incoming } : prev));
      setLiveTs(Date.now());
    };

    // ── matchDataUpdated ─────────────────────────────────────────────────────
    const handleMatchDataUpdate = (incoming: any) => {
      const incomingId = sid(incoming.matchDataId);
      const currentId  = matchDataIdRef.current;
      console.log('[LiveStats] matchDataUpdated incoming:', incomingId, '| ref:', currentId);
      if (!currentId || incomingId !== currentId) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matchData: {
            ...prev.matchData,
            teams: prev.matchData.teams.map((team) => {
              if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId))
                return team;
              const changes       = incoming.changes || {};
              const nextTeam: any = { ...team, ...changes };
              if (Array.isArray(changes.players)) {
                const byId       = new Map(changes.players.map((p: any) => [sid(p._id), p]));
                nextTeam.players = team.players.map((p) => {
                  const upd = byId.get(p._id);
                  return upd ? { ...p, ...upd } : p;
                });
              }
              return nextTeam;
            }),
          },
        };
      });
      setLiveTs(Date.now());
    };

    // ── playerStatsUpdated ───────────────────────────────────────────────────
    const handlePlayerUpdate = (incoming: any) => {
      const incomingId = sid(incoming.matchDataId);
      const currentId  = matchDataIdRef.current;
      console.log('[LiveStats] playerStatsUpdated incoming:', incomingId, '| ref:', currentId);
      if (!currentId || incomingId !== currentId) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matchData: {
            ...prev.matchData,
            teams: prev.matchData.teams.map((team) => {
              if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId))
                return team;
              return {
                ...team,
                players: team.players.map((p) =>
                  p._id === sid(incoming.playerId) ? { ...p, ...incoming.updates } : p
                ),
              };
            }),
          },
        };
      });
      setLiveTs(Date.now());
    };

    // ── teamPointsUpdated ────────────────────────────────────────────────────
    const handleTeamPointsUpdate = (incoming: any) => {
      const incomingId = sid(incoming.matchDataId);
      const currentId  = matchDataIdRef.current;
      console.log('[LiveStats] teamPointsUpdated incoming:', incomingId, '| ref:', currentId);
      if (!currentId || incomingId !== currentId) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matchData: {
            ...prev.matchData,
            teams: prev.matchData.teams.map((team) => {
              if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId))
                return team;
              return {
                ...team,
                placePoints: incoming.changes?.placePoints ?? team.placePoints,
              };
            }),
          },
        };
      });
      setLiveTs(Date.now());
    };

    // ── teamStatsUpdated ─────────────────────────────────────────────────────
    const handleTeamStatsUpdate = (incoming: any) => {
      const incomingId = sid(incoming.matchDataId);
      const currentId  = matchDataIdRef.current;
      console.log('[LiveStats] teamStatsUpdated incoming:', incomingId, '| ref:', currentId);
      if (!currentId || incomingId !== currentId) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matchData: {
            ...prev.matchData,
            teams: prev.matchData.teams.map((team) => {
              if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId))
                return team;
              const updatedPlayers = incoming.players
                ? team.players.map((p) => {
                    const upd = incoming.players.find((u: any) => sid(u._id) === p._id);
                    return upd ? { ...p, killNum: upd.killNum } : p;
                  })
                : team.players;
              return { ...team, players: updatedPlayers };
            }),
          },
        };
      });
      setLiveTs(Date.now());
    };

    // ── bulkTeamUpdate ───────────────────────────────────────────────────────
    const handleBulkTeamUpdate = (incoming: any) => {
      const incomingId = sid(incoming.matchDataId);
      const currentId  = matchDataIdRef.current;
      console.log('[LiveStats] bulkTeamUpdate incoming:', incomingId, '| ref:', currentId);
      if (!currentId || incomingId !== currentId) return;
      if (!incoming.changes?.players) return;
      setLiveData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matchData: {
            ...prev.matchData,
            teams: prev.matchData.teams.map((team) => {
              if (team._id !== sid(incoming.teamId) && team.teamId !== sid(incoming.teamId))
                return team;
              const byId = new Map(incoming.changes.players.map((p: any) => [sid(p._id), p]));
              return {
                ...team,
                players: team.players.map((p) => {
                  const upd = byId.get(p._id);
                  return upd ? { ...p, ...upd } : p;
                }),
              };
            }),
          },
        };
      });
      setLiveTs(Date.now());
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
      socket.off('overallSlimUpdate',  handleOverallSlimUpdate);
      socket.off('liveSlimUpdate',     handleLiveSlimUpdate);
      socket.off('liveMatchUpdate',    handleLiveUpdate);
      socket.off('matchDataUpdated',   handleMatchDataUpdate);
      socket.off('playerStatsUpdated', handlePlayerUpdate);
      socket.off('teamPointsUpdated',  handleTeamPointsUpdate);
      socket.off('teamStatsUpdated',   handleTeamStatsUpdate);
      socket.off('bulkTeamUpdate',     handleBulkTeamUpdate);
      socketManager.disconnect();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // Memoised: sorted live teams with derived fields
  // ═══════════════════════════════════════════════════════════════════════════
  const sortedLiveTeams = useMemo((): LiveTeamDerived[] => {
    return (liveData?.matchData?.teams ?? [])
      .map((team) => {
        const totalKills  = team.players.reduce((s, p) => s + (p.killNum || 0), 0);
        const totalPoints = (team.placePoints || 0) + totalKills;
        const isAllDead   = team.players.every((p) => p.liveState === 5 || p.bHasDied);
        return {
          ...team,
          totalKills,
          alive: team.players.filter((p) => p.liveState !== 5).length,
          totalPoints,
          isAllDead,
        };
      })
      .sort((a, b) =>
        b.totalPoints !== a.totalPoints
          ? b.totalPoints - a.totalPoints
          : b.totalKills - a.totalKills
      );
  }, [liveData, liveTs]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Memoised: sorted overall teams enriched with live rank via slot comparison
  // ═══════════════════════════════════════════════════════════════════════════
 const sortedOverallTeams = useMemo((): OverallTeamDerived[] => {
  const liveSlotRank = new Map<number, number>();
  sortedLiveTeams.forEach((t, i) => liveSlotRank.set(t.slot, i + 1));

  // Build a live stats map by slot
  const liveStatsBySlot = new Map<number, { kills: number; points: number }>();
  sortedLiveTeams.forEach((t) => {
    liveStatsBySlot.set(t.slot, {
      kills: t.totalKills,
      points: t.totalPoints,
    });
  });

  return [...(overallData?.teams ?? [])]
    .map((team) => {
      // If overall matchCount is 0, seed from live data
      const liveStats = liveStatsBySlot.get(team.slot);
      const effectiveKills  = team.matchCount === 0 && liveStats
        ? liveStats.kills
        : team.totalKills;
      const effectivePoints = team.matchCount === 0 && liveStats
        ? liveStats.points
        : team.totalPoints;

      return {
        ...team,
        totalKills:  effectiveKills,
        totalPoints: effectivePoints,
        liveRank: liveSlotRank.get(team.slot) ?? null,
      };
    })
    .sort((a, b) =>
      b.totalPoints !== a.totalPoints
        ? b.totalPoints - a.totalPoints
        : b.totalKills - a.totalKills
    );
}, [overallData, sortedLiveTeams, overallTs,liveTs]);
  // ═══════════════════════════════════════════════════════════════════════════
  // Layout helpers
  // ═══════════════════════════════════════════════════════════════════════════

  const tournament = liveData?.tournament ?? overallData?.tournament ?? EMPTY_TOURNAMENT;
  const gradientBg = `linear-gradient(135deg, ${tournament.primaryColor || '#dbb983'}, ${tournament.secondaryColor || '#583907'})`;

  const liveTopTeam      = sortedLiveTeams[0]    ?? null;
  const liveRemaining    = sortedLiveTeams.slice(1);
  const liveBaseRowH     = 50;
  const liveScaleY       = Math.min(1, Math.max(0, 1080 - 250) / (Math.max(1, liveRemaining.length) * liveBaseRowH));

  const overallTopTeam   = sortedOverallTeams[0]  ?? null;
  const overallRemaining = sortedOverallTeams.slice(1);
  const overallBaseRowH  = 50;
  const overallScaleY    = Math.min(1, Math.max(0, 1080 - 250) / (Math.max(1, overallRemaining.length) * overallBaseRowH));

  const matchCount = overallData?.matchCount ?? 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-[1920px] h-[1080px] flex justify-end relative top-[0px]">

      {/* ════════════════════════════════════════════════════════
          LIVE PANEL  (rightmost, 400 px)
      ════════════════════════════════════════════════════════ */}
      <div className="relative w-[400px] h-[1080px] flex flex-col">

        {/* Hero card — top live team */}
        <div
          className="w-[400px] h-[220px] relative overflow-hidden flex-shrink-0"
          style={{ background: gradientBg }}
        >
          <div className="absolute top-[6px] left-[10px] z-30 text-white/50 font-[righteous] text-[0.65rem] tracking-widest uppercase">
            Match Live
          </div>

          {liveTopTeam?.players.map((player, idx) => (
            <div
              key={`lt-${player._id}-${idx}`}
              className="absolute w-[200px] h-[200px]"
              style={{
                left: `${-25 + idx * 85}px`,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 1,
                opacity: liveTopTeam.isAllDead ? 0.4 : 1,
              }}
            >
              <img
                src={player.picUrl || '/def_char.png'}
                alt={player.playerName}
                className="w-full h-full object-cover"
              />
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

        {/* Column headers */}
        <div
          className="w-[400px] h-[30px] text-[1.1rem] font-[Righteous]
                     flex items-center justify-between px-4 font-bold text-black text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}
        >
          <span>#</span>
          <span>TEAM NAME</span>
          <span className="relative left-[50px]">ALIVE</span>
          <span className="relative left-[28px]">PTS</span>
          <span className="relative left-[4px]">KILLS</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-hidden w-[400px]">
          <div style={{ transform: `scaleY(${liveScaleY})`, transformOrigin: 'top right' }}>
            {liveRemaining.map((team, idx) => (
              <div
                key={`lr-${team._id}-${idx}`}
                className="w-full relative flex items-center text-black font-bold border-b border-b-black overflow-visible"
                style={{ height: `${liveBaseRowH}px`, opacity: team.isAllDead ? 0.7 : 1 }}
              >
                <div
                  className="absolute w-[40px] flex items-center justify-center text-white text-[1.5rem]"
                  style={{ height: `${liveBaseRowH}px`, background: gradientBg }}
                >
                  {idx + 2}
                </div>

                <div className="w-[80px] relative left-[4px] h-full ml-[40px] bg-white">
                  <img src={team.teamLogo} alt={team.teamTag} className="w-full h-full object-contain" />
                </div>

                <div className="h-full w-[260px] flex items-center text-black text-[1.5rem] pl-[10px] bg-white">
                  {team.teamTag}
                </div>

                <div className="h-full flex text-white" style={{ background: gradientBg }}>
                  <div className="w-[60px] flex items-center justify-center text-[1.5rem] relative left-[7px]">
                    {team.totalPoints}
                  </div>
                  <div className="w-[60px] flex items-center justify-center text-[1.5rem] text-yellow-200">
                    {team.totalKills}
                  </div>
                </div>
              </div>
            ))}

            <div
              className="w-full h-[30px] font-[Righteous] flex justify-center items-center text-black font-bold"
              style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}
            >
              {tournament.tournamentName}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          OVERALL PANEL  (400 px, left of live panel)
      ════════════════════════════════════════════════════════ */}
      <div className="relative w-[400px] h-[1080px] flex flex-col">

        {/* Hero card — top overall team */}
        <div
          className="w-[400px] h-[220px] relative overflow-hidden flex-shrink-0"
          style={{ background: gradientBg }}
        >
          <div className="absolute top-[6px] left-[10px] z-30 text-white/50 font-[righteous] text-[0.65rem] tracking-widest uppercase">
            Overall · {matchCount} {matchCount === 1 ? 'Match' : 'Matches'}
          </div>

          {overallTopTeam?.players.slice(0, 4).map((player, idx) => (
            <div
              key={`ot-${player.uId}-${idx}`}
              className="absolute w-[200px] h-[200px]"
              style={{ left: `${-25 + idx * 85}px`, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}
            >
              <img
                src={player.picUrl || '/def_char.png'}
                alt={player.playerName}
                className="w-full h-full object-cover"
              />
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

        {/* Column headers */}
        <div
          className="w-[400px] h-[30px] text-[1.1rem] font-[Righteous]
                     flex items-center justify-between px-4 font-bold text-black text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}
        >
          <span>#</span>
          <span>TEAM NAME</span>
          <span className="relative left-[28px]">NOW</span>
          <span className="relative left-[20px]">PTS</span>
          <span className="relative left-[4px]">KILLS</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-hidden w-[400px]">
          <div style={{ transform: `scaleY(${overallScaleY})`, transformOrigin: 'top right' }}>
            {overallRemaining.map((team, idx) => {
              const overallRank = idx + 2;
              const liveBetter  = team.liveRank !== null && team.liveRank <= overallRank;
              return (
                <div
                  key={`or-${team.teamId}-${idx}`}
                  className="w-full relative flex items-center text-black font-bold border-b border-b-black overflow-visible"
                  style={{ height: `${overallBaseRowH}px` }}
                >
                  <div
                    className="absolute w-[40px] flex items-center justify-center text-white text-[1.5rem]"
                    style={{ height: `${overallBaseRowH}px`, background: gradientBg }}
                  >
                    {overallRank}
                  </div>

                  <div className="w-[80px] relative left-[4px] h-full ml-[40px] bg-white">
                    <img src={team.teamLogo} alt={team.teamTag} className="w-full h-full object-contain" />
                  </div>

                  <div className="h-full w-[200px] flex items-center text-black text-[1.5rem] pl-[10px] bg-white">
                    {team.teamTag}
                  </div>

                  {/* NOW column — live rank badge */}
                  <div className="h-full w-[60px] flex items-center justify-center bg-white">
                    {team.liveRank !== null ? (
                      <span
                        className="text-[1rem] font-[righteous] px-[5px] py-[1px] rounded"
                        style={{
                          background: gradientBg,
                          color: '#fff',
                          outline: `2px solid ${liveBetter ? '#4ade80' : '#f87171'}`,
                        }}
                      >
                        #{team.liveRank}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[1.1rem]">—</span>
                    )}
                  </div>

                  <div className="h-full flex text-white" style={{ background: gradientBg }}>
                    <div className="w-[50px] flex items-center justify-center text-[1.5rem]">
                      {team.totalPoints}
                    </div>
                    <div className="w-[50px] flex items-center justify-center text-[1.5rem] text-yellow-200">
                      {team.totalKills}
                    </div>
                  </div>
                </div>
              );
            })}

            <div
              className="w-full h-[30px] font-[Righteous] flex justify-center items-center text-black font-bold"
              style={{ background: 'linear-gradient(to right, #FFD700, #FFA500, #FFD700)' }}
            >
              {overallData?.round?.roundName ?? tournament.tournamentName}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default LiveStats;
