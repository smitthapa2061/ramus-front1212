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
                milestone: 'İLK KAN'
              };
              alertReason = 'İLK KAN';
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
                  milestone: '7. SKOR'
                };
                alertReason = '7. SKOR';
                triggered = true;
                break;
              } else if (currentKills >= 5 && previousKills < 5) {
                alertData = {
                  ...player,
                  teamTag: team.teamTag,
                  teamLogo: team.teamLogo,
                  milestone: '5. SKOR'
                };
                alertReason = '5. SKOR';
                triggered = true;
                break;
              } else if (currentKills >= 3 && previousKills < 3) {
                alertData = {
                  ...player,
                  teamTag: team.teamTag,
                  teamLogo: team.teamLogo,
                  milestone: '3. SKOR'
                };
                alertReason = '3. SKOR';
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
          // Wait for exit animation to complete before clearing displayedPlayer
          setTimeout(() => {
            setDisplayedPlayer(null);
            displayTimerRef.current = null;
          }, 60000000);
        }, 60000000);
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
    return null;
  }

  if (!isVisible || !displayedPlayer) {
    return null;
  }

return (
  <div className="w-[1920px] h-[1080px] text-white p-8 relative">
    <AnimatePresence>
      {isVisible && displayedPlayer && (
        <motion.div
          key={displayedPlayer._id}
          initial={{ x: -600, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -600, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-[400px] h-[450px]  absolute top-[500px] left-[-10px]"
        >
          <div className="w-full h-full relative">
            
            <div 
              style={{
                backgroundImage: `linear-gradient(to left top, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
              }}
              className="w-[100%] h-full "
            />

         
            {/* Player + Background Team Logo */}
            <div className="absolute top-[5px] w-[475px] h-[175px]">
                 {/* Existing small team logo (UNCHANGED) */}
            <img 
              src={displayedPlayer.teamLogo} 
              alt=""  
              className='w-[80px] h-[80px] absolute top-[2px] left-[307px] flex justify-center'
            />

              {/* Background Team Logo */}
              <img
                src={displayedPlayer.teamLogo}
                alt=""
                className="absolute inset-0 w-[300px] h-[300px] grayscale opacity-30  left-[50px] top-[20px]"
              />

              {/* Player Image */}
              <img
                src={displayedPlayer.picUrl || "/def_char.avif"}
                alt="Player or Team Logo"
                className="w-full h-full object-contain absolute z-0 scale-[2.2] left-[-30px] top-[-10px]"
              />
               <div
              className="w-[82%] h-[100%] absolute top-[270px] left-[10px] text-center"
              style={{
                backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
              }}
            >
             <div
              style={{
      backgroundImage: `url('/theme3assets/lines.avif')`,
      backgroundSize: '300px',
      backgroundRepeat: 'repeat',
      
    }}
             className="w-[100%] h-[25%] bg-black relative overflow-hidden " >
  
  


</div>
<div className='font-[TUNGSTEN] text-[70px]' >
  {displayedPlayer.playerName.toUpperCase()}
</div>

              <div 
                    style={{
      backgroundImage: `url('/theme3assets/lines.avif')`,
      backgroundSize: '300px',
      backgroundRepeat: 'repeat',
      
    }}
              className='w-[100%] h-[25%] bg-black absolute top-[133px] font-[AGENCYB] text-[38px]'>
                <div className='relative top-[-7px]'>  {displayedPlayer.milestone.toUpperCase()} </div>
              
              </div>
            </div>

            </div>

         

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);




});

export default Dom;


