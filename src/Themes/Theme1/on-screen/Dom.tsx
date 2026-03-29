import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SocketManager from '../../../dashboard/socketManager.tsx';

interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
  day?: string;
  primaryColor?: string;
  secondaryColor?: string;
  overlayBg?: string;
}

interface Round {
  _id: string;
  roundName: string;
  apiEnable?: boolean;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamTag: string;
  teamId?: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface DomProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const Dom: React.FC<DomProps> = React.memo(({ tournament, round, match, matchData }) => {
  const [localMatchData, setLocalMatchData] = useState<MatchData | null>(matchData || null);
  const [matchDataId, setMatchDataId] = useState<string | null>(matchData?._id?.toString() || null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [displayedPlayer, setDisplayedPlayer] = useState<(Player & { teamTag: string; teamLogo: string; milestone: string }) | null>(null);

  // Refs to prevent loops
  const prevDataRef = useRef<any[]>([]);
  const prevKillsMap = useRef<{ [key: string]: number }>({});
  const displayTimerRef = useRef<number | null>(null);
  const firstBloodTriggered = useRef(false);
  const previousDeadPlayersRef = useRef<Player[]>([]);


  // Handle socket updates with loop prevention
  // ✅ Ref to always hold the latest match data (no re-renders)
const matchDataRef = useRef<MatchData | null>(matchData || null);
useEffect(() => {
  matchDataRef.current = localMatchData;
}, [localMatchData]);

// ✅ Socket update handler (no loop)
const handleSocketUpdate = useCallback((data: any) => {
  const currentData = matchDataRef.current;
  let updatedMatchData: MatchData | null = currentData;

  if (data._id?.toString() === matchDataId && data.teams) {
    updatedMatchData = data;
  } else if (data.matchDataId === matchDataId && data.teamId && data.players) {
    if (currentData) {
      updatedMatchData = {
        ...currentData,
        teams: currentData.teams.map(team =>
          team._id === data.teamId || team.teamId === data.teamId
            ? {
                ...team,
                players: team.players.map(player =>
                  data.players.find((p: any) => p._id === player._id)
                    ? { ...player, ...data.players.find((p: any) => p._id === player._id) }
                    : player
                )
              }
            : team
        )
      };
    }
  } else if (data.matchDataId === matchDataId && data.teamId && data.changes?.players) {
    if (currentData) {
      updatedMatchData = {
        ...currentData,
        teams: currentData.teams.map(team =>
          team._id === data.teamId || team.teamId === data.teamId
            ? {
                ...team,
                players: team.players.map(player => {
                  const update = data.changes.players.find((p: any) => p._id?.toString() === player._id?.toString());
                  return update ? { ...player, ...update } : player;
                })
              }
            : team
        )
      };
    }
  }

  if (updatedMatchData) {
    const combinedData = updatedMatchData.teams
      .flatMap(team => team.players.map(player => ({ _id: player._id, killNum: player.killNum || 0 })))
      .sort((a, b) => a._id.localeCompare(b._id));

    const prevDataSorted = prevDataRef.current.sort((a: any, b: any) => a._id.localeCompare(b._id));

    if (JSON.stringify(combinedData) !== JSON.stringify(prevDataSorted)) {
      console.log("Dom: Kill data changed, updating localMatchData");
      prevDataRef.current = combinedData;
      setLocalMatchData(updatedMatchData);
      matchDataRef.current = updatedMatchData; // ✅ keep ref updated

      // Process alerts only when data changes
      let alertData = null;
      let triggered = false;
      let alertReason = '';

      // Log all players with changed data
      const allPlayers = updatedMatchData.teams.flatMap(team => team.players);
    const changedPlayers = allPlayers.filter(player => {
  const prevKills = prevKillsMap.current[player.playerName] ?? 0;
  return player.killNum > prevKills; // ✅ only count kill increases
});


      console.log("Dom: Latest player changes:");
      changedPlayers.forEach(player => {
        const prevKills = prevKillsMap.current[player.playerName] || 0;
        const prevDied = previousDeadPlayersRef.current.some(p => p.playerName === player.playerName);
        console.log(`  ${player.playerName}: kills ${prevKills} -> ${player.killNum}`);
      });

      // Check for first blood - only the first player to get their first kill gets this milestone
      if (!firstBloodTriggered.current) {
        for (const team of updatedMatchData.teams) {
          for (const player of team.players) {
            const playerName = player.playerName;
            const currentKills = player.killNum || 0;
            const previousKills = prevKillsMap.current[playerName] || 0;

            if (currentKills === 1 && previousKills === 0) {
              alertData = {
                ...player,
                teamTag: team.teamTag,
                teamLogo: team.teamLogo,
                milestone: 'FIRST BLOOD'
              };
              alertReason = 'FIRST BLOOD';
              triggered = true;
              firstBloodTriggered.current = true;
              break;
            }
          }
          if (triggered) break;
        }
      }


      // Check for kill streaks - show the latest achievement reached (reverse order to get most recent)
      if (!triggered) {
        // Process teams in reverse order
        for (let teamIndex = updatedMatchData.teams.length - 1; teamIndex >= 0; teamIndex--) {
          const team = updatedMatchData.teams[teamIndex];
          // Process players in reverse order
          for (let playerIndex = team.players.length - 1; playerIndex >= 0; playerIndex--) {
            const player = team.players[playerIndex];
            const playerName = player.playerName;
            const currentKills = player.killNum || 0;
            const previousKills = prevKillsMap.current[playerName] || 0;

            if (currentKills > previousKills) {
              if (currentKills >= 8 && previousKills < 8) {
                alertData = {
                  ...player,
                  teamTag: team.teamTag,
                  teamLogo: team.teamLogo,
                  milestone: 'UNSTOPPABLE'
                };
                alertReason = 'UNSTOPPABLE';
                triggered = true;
                break;
              } else if (currentKills >= 5 && previousKills < 5) {
                alertData = {
                  ...player,
                  teamTag: team.teamTag,
                  teamLogo: team.teamLogo,
                  milestone: 'RAMPAGE'
                };
                alertReason = 'RAMPAGE';
                triggered = true;
                break;
              } else if (currentKills >= 3 && previousKills < 3) {
                alertData = {
                  ...player,
                  teamTag: team.teamTag,
                  teamLogo: team.teamLogo,
                  milestone: 'DOMINATION'
                };
                alertReason = 'DOMINATION';
                triggered = true;
                break;
              }
            }
          }
          if (triggered) break;
        }
      }

      // Update kills map
      updatedMatchData.teams.forEach(team => {
        team.players.forEach(player => {
          prevKillsMap.current[player.playerName] = player.killNum || 0;
        });
      });

      if (triggered && alertData) {
        setDisplayedPlayer(alertData);
        setIsVisible(true);
        if (displayTimerRef.current) {
          clearTimeout(displayTimerRef.current);
        }
        displayTimerRef.current = window.setTimeout(() => {
          setIsVisible(false);
          setDisplayedPlayer(null);
          displayTimerRef.current = null;
        }, 6000);
        console.log(`Dom: Triggering alert for ${alertData.playerName} - ${alertReason}`);
      }
    } else {
      console.log("Dom: Kill data unchanged, skipping update");
    }
  }
}, [matchDataId]); // ✅ removed localMatchData dependency

// ✅ Socket setup — only runs once per matchDataId
useEffect(() => {
  if (!matchDataId) return;

  const socketManager = SocketManager.getInstance();
  const socket = socketManager.connect();

  const events = [
    "liveMatchUpdate",
    "matchDataUpdated",
    "playerStatsUpdated",
    "teamStatsUpdated",
    "bulkTeamUpdate",
  ];

  events.forEach(evt => socket.off(evt)); // clear before attach
  events.forEach(evt => socket.on(evt, handleSocketUpdate));

  return () => {
    events.forEach(evt => socket.off(evt));
    socketManager.disconnect();
  };
}, [matchDataId, handleSocketUpdate]);


  if (!localMatchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  if (!isVisible || !displayedPlayer) {
    return null;
  }

  return (
    <div className="w-[1920px] h-[1080px] flex justify-start items-center relative  ">
      <AnimatePresence>
        {isVisible && displayedPlayer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.5 }}
            className="w-[300px] h-[300px] bg-[#0000009d] absolute top-[340px] left-0"
          >
            {/* Team Logo */}
            <div className="w-[120px] h-[120px]">
              <div
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                }}
                className='w-[70%] h-[70%] bg-white relative left-[240px] top-[-30px]'
              >
                <img
                  src={displayedPlayer.teamLogo || "/def_logo.png"}
                  alt={displayedPlayer.teamTag}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Player Image */}
            <div className="w-[300px] h-[290px] relative top-[-110px]">
              <img
                src={displayedPlayer.picUrl || '/def_char.png'}
                alt={displayedPlayer.playerName}
                className="w-full h-full"
              />
            </div>

            {/* Player Info */}
            <div className="flex-1 text-center">
              {/* Kill Streak Message */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                }}
                className="text-4xl font-bold text-yellow-400 p-[10px] w-[300px] tracking-wider font-[Righteous] relative top-[-120px]"
              >
                {displayedPlayer.milestone}
              </div>

              {/* Player Name */}
              <div className="text-2xl font-bold text-black bg-white w-[300px] h-[40px] top-[-133px] relative">
                {displayedPlayer.playerName}
              </div>

              {/* Kill Count */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                }}
                className="text-4xl font-bold text-white relative top-[-140px]"
              >
                {displayedPlayer.killNum} KILLS
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Dom;


