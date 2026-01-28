import React, { useEffect, useState, useMemo } from 'react';
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
  
  // Live stats fields
  health: number;
  healthMax: number;
  liveState: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
  damage:string
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface LiveFragsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const LiveFrags: React.FC<LiveFragsProps> = ({ tournament, round, match, matchData }) => {
  const [localMatchData, setLocalMatchData] = useState<MatchData | null>(matchData || null);
  const [matchDataId, setMatchDataId] = useState<string | null>(matchData?._id?.toString() || null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [socketStatus, setSocketStatus] = useState<string>('disconnected');
  const [updateCount, setUpdateCount] = useState<number>(0);
  const [showKills, setShowKills] = useState<boolean>(true);

  useEffect(() => {
    if (matchData) {
      console.log('LiveFrags: Received new matchData prop, updating local state');
      setLocalMatchData(matchData);
      setMatchDataId(matchData._id?.toString());
      setLastUpdateTime(Date.now());
    }
  }, [matchData]);

  useEffect(() => {
    if (!match?._id || !matchDataId) return;

    console.log('Setting up real-time listeners for LiveFrags - match:', match._id, 'matchData:', matchDataId);

    // Get a fresh socket connection from the manager
    const socketManager = SocketManager.getInstance();
    const freshSocket = socketManager.connect();

    console.log('Socket connected:', freshSocket?.connected);
    console.log('Socket ID:', freshSocket?.id);

    // Update initial status
    setSocketStatus(freshSocket?.connected ? 'connected' : 'disconnected');

    // Test socket connection
    freshSocket.emit('test', 'LiveFrags component connected');

    // Log all incoming events for debugging
    const debugHandler = (eventName: string, data: any) => {
      console.log(`LiveFrags: Received ${eventName}:`, data);
    };

    freshSocket.onAny(debugHandler);

    // Create unique event handler names to avoid conflicts with dashboard
    const liveFragsHandlers = {
      handleLiveUpdate: (data: any) => {
        console.log('LiveFrags: Received liveMatchUpdate for match:', data._id);

        // Check if this update is for the current matchData
        if (data._id?.toString() !== matchDataId) {
          console.log('LiveFrags: liveMatchUpdate not for current matchData, ignoring');
          return;
        }

        console.log('LiveFrags: Updating localMatchData with live API data');
        setLocalMatchData(data);
        setLastUpdateTime(Date.now());
        setUpdateCount(prev => prev + 1);
      },

      handleMatchDataUpdate: (data: any) => {
        console.log('LiveFrags: Received matchDataUpdated:', data);
        if (data.matchDataId === matchDataId) {
          setLocalMatchData((prev: MatchData | null) => {
            if (!prev) return prev;
            const updatedTeams = prev.teams.map((team: any) => {
              // Check both _id and teamId for team matching
              if (team._id === data.teamId || team.teamId === data.teamId) {
                const changes = data.changes || {};
                const nextTeam: any = { ...team, ...changes };
                if (Array.isArray(changes.players)) {
                  const updatesById = new Map(
                    changes.players.map((p: any) => [p._id?.toString?.() || p._id, p])
                  );
                  nextTeam.players = team.players.map((p: Player) => {
                    const key = p._id?.toString?.() || p._id;
                    const upd = updatesById.get(key);
                    return upd ? { ...p, ...upd } : p;
                  });
                }
                return nextTeam;
              }
              return team;
            });
            return { ...prev, teams: updatedTeams };
          });
          setLastUpdateTime(Date.now());
          setUpdateCount(prev => prev + 1);
        }
      },

      handlePlayerUpdate: (data: any) => {
        console.log('LiveFrags: Received playerStatsUpdated:', data);
        if (data.matchDataId === matchDataId) {
          setLocalMatchData((prev: MatchData | null) => {
            if (!prev) return prev;
            return {
              ...prev,
              teams: prev.teams.map((team: any) => {
                // Check both _id and teamId for team matching
                if (team._id === data.teamId || team.teamId === data.teamId) {
                  return {
                    ...team,
                    players: team.players.map((player: Player) =>
                      player._id === data.playerId
                        ? { ...player, ...data.updates }
                        : player
                    ),
                  };
                }
                return team;
              }),
            };
          });
          setLastUpdateTime(Date.now());
        }
      },

      handleTeamPointsUpdate: (data: any) => {
        console.log('LiveFrags: Received team points update:', data);
        if (data.matchDataId === matchDataId) {
          setLocalMatchData((prev: MatchData | null) => {
            if (!prev) return prev;
            return {
              ...prev,
              teams: prev.teams.map((team: any) => {
                // Check both _id and teamId for team matching
                if (team._id === data.teamId || team.teamId === data.teamId) {
                  return {
                    ...team,
                    placePoints: data.changes?.placePoints ?? team.placePoints,
                  };
                }
                return team;
              }),
            };
          });
          setLastUpdateTime(Date.now());
        }
      },

      handleTeamStatsUpdate: (data: any) => {
        console.log('LiveFrags: Received teamStatsUpdated:', data);
        if (data.matchDataId === matchDataId) {
          setLocalMatchData((prev: MatchData | null) => {
            if (!prev) return prev;
            return {
              ...prev,
              teams: prev.teams.map((team: any) => {
                // Check both _id and teamId for team matching
                if (team._id === data.teamId || team.teamId === data.teamId) {
                  // Update player kill numbers if provided
                  const updatedPlayers = data.players ?
                    team.players.map((player: any) => {
                      const playerUpdate = data.players.find((p: any) => p._id === player._id);
                      return playerUpdate ? { ...player, killNum: playerUpdate.killNum } : player;
                    }) : team.players;

                  return {
                    ...team,
                    players: updatedPlayers,
                  };
                }
                return team;
              }),
            };
          });
          setLastUpdateTime(Date.now());
        }
      },

      handleBulkTeamUpdate: (data: any) => {
        console.log('LiveFrags: Received bulk team update:', data);
        if (data.matchDataId === matchDataId) {
          setLocalMatchData((prev: MatchData | null) => {
            if (!prev) return prev;
            return {
              ...prev,
              teams: prev.teams.map((team: any) => {
                // Check both _id and teamId for team matching
                if ((team._id === data.teamId || team.teamId === data.teamId) && data.changes?.players) {
                  const playerUpdates = new Map(
                    data.changes.players.map((p: any) => [p._id?.toString?.() || p._id, p])
                  );
                  return {
                    ...team,
                    players: team.players.map((player: Player) => {
                      const key = player._id?.toString?.() || player._id;
                      const update = playerUpdates.get(key);
                      return update ? { ...player, ...update } : player;
                    }),
                  };
                }
                return team;
              }),
            };
          });
          setLastUpdateTime(Date.now());
        }
      },

      handleConnect: () => {
        console.log('LiveFrags: Socket connected');
        setSocketStatus('connected');
      },

      handleDisconnect: () => {
        console.log('LiveFrags: Socket disconnected');
        setSocketStatus('disconnected');
      }
    };

    // Listen to all relevant socket events with unique handlers
    freshSocket.on('liveMatchUpdate', liveFragsHandlers.handleLiveUpdate);
    freshSocket.on('matchDataUpdated', liveFragsHandlers.handleMatchDataUpdate);
    freshSocket.on('playerStatsUpdated', liveFragsHandlers.handlePlayerUpdate);
    freshSocket.on('teamPointsUpdated', liveFragsHandlers.handleTeamPointsUpdate);
    freshSocket.on('teamStatsUpdated', liveFragsHandlers.handleTeamStatsUpdate);
    freshSocket.on('bulkTeamUpdate', liveFragsHandlers.handleBulkTeamUpdate);
    freshSocket.on('connect', liveFragsHandlers.handleConnect);
    freshSocket.on('disconnect', liveFragsHandlers.handleDisconnect);

    return () => {
      console.log('LiveFrags: Cleaning up socket listeners');
      // Clean up debug handler
      freshSocket.offAny();

      // Clean up with the exact same handler references
      freshSocket.off('liveMatchUpdate', liveFragsHandlers.handleLiveUpdate);
      freshSocket.off('matchDataUpdated', liveFragsHandlers.handleMatchDataUpdate);
      freshSocket.off('playerStatsUpdated', liveFragsHandlers.handlePlayerUpdate);
      freshSocket.off('teamPointsUpdated', liveFragsHandlers.handleTeamPointsUpdate);
      freshSocket.off('teamStatsUpdated', liveFragsHandlers.handleTeamStatsUpdate);
      freshSocket.off('bulkTeamUpdate', liveFragsHandlers.handleBulkTeamUpdate);
      freshSocket.off('connect', liveFragsHandlers.handleConnect);
      freshSocket.off('disconnect', liveFragsHandlers.handleDisconnect);
      // Notify socket manager that this component is done with the socket
      socketManager.disconnect();
    };
  }, [match?._id, matchDataId]);

  // Add effect to handle prop changes and force re-render
  useEffect(() => {
    if (matchData && matchData._id?.toString() !== matchDataId) {
      console.log('MatchData prop changed, updating local state');
      setLocalMatchData(matchData);
      setMatchDataId(matchData._id?.toString());
    }
  }, [matchData, matchDataId]);

  // Toggle between kills and damage every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setShowKills(prev => !prev);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Get top 5 players by kills - recalculated on every localMatchData change
  const topPlayers = useMemo(() => {
    if (!localMatchData) return [];

    console.log('LiveFrags: Recalculating topPlayers at', new Date(lastUpdateTime).toLocaleTimeString());

    const allPlayers = localMatchData.teams.flatMap(team => {
      const isTeamAllDead = team.players.every(player => player.bHasDied || player.liveState === 5);
      return team.players.map(player => ({ ...player, teamTag: team.teamTag, teamLogo: team.teamLogo, isTeamAllDead }));
    });

    return allPlayers
      .sort((a, b) => b.killNum - a.killNum)
      .slice(0, 5);
  }, [localMatchData, lastUpdateTime]);

  if (!localMatchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <text className="text-white text-2xl">No match data</text>
      </div>
    );
  }


  return (
    <div className="w-[1920px] h-[1080px] bg-transparent flex justify-end items-center relative ">

     
      {/* Top 5 Players Display */}
      <div className="w-[500px] h-[200px] ">
     
<div className='text-black text-[1.5rem] font-[Righteous] bg-white  w-[250px] p-[2px] mb-[10px] relative left-[250px] text-center'>
  MATCH FRAGGERS
</div>
        <div className="space-y-4 w-[500px] ]">
          {topPlayers.map((player, index) => {
            // Calculate health percentage based on API enable
            let healthPercentage = 100;
            if (round?.apiEnable) {
              healthPercentage = player.healthMax > 0 ? Math.max(0, Math.min(100, (player.health / player.healthMax) * 100)) : 0;
            } else {
              healthPercentage = player.bHasDied ? 0 : 100;
            }

            // Check player status
            const isAlive = [0, 1, 2, 3].includes(player.liveState);
            const isKnocked = player.liveState === 4;
            const isDead = player.bHasDied || player.liveState === 5;

            // Determine bar color and status
            let barColor = 'bg-gray-500';
            let statusText = 'Dead';

            if (isDead) {
              barColor = 'bg-gray-500';
              statusText = 'Dead';
            } else if (isKnocked) {
              barColor = 'bg-red-500';
              statusText = 'Knocked';
            } else if (isAlive) {
              if (healthPercentage > 75) barColor = 'bg-green-500';
              else if (healthPercentage > 50) barColor = 'bg-yellow-500';
              else if (healthPercentage > 25) barColor = 'bg-orange-500';
              else barColor = 'bg-red-500';
              statusText = `${Math.round(healthPercentage)}%`;
            }

            return (
              <div
                key={player._id}
                className="  flex items-center "
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#333'}, ${tournament.secondaryColor || '#666'})`,
                  opacity: player.isTeamAllDead ? 0.5 : 1
                }}
              >
                {/* Rank */}
                <div className="text-yellow-400 text-2xl font-bold  mr-[-10px] pl-[10px] font-[Righteous]">
                  #{index + 1}
                </div>

                {/* Player Avatar */}
                <div className="w-[100px] h-[100px] ">
                  <img
                    src={player.picUrl || '/def_char.png'}
                    alt={player.playerName}
                    className="w-full h-full "
                  />
                </div>

                {/* Player Info */}
                <div className="flex-1">
                  <div className="text-white text-[1.5rem]  font-bold font-[Righteous]">{player.playerName}</div>
                  <div className="text-white text-[1rem] font-[Righteous] font-bold">{player.teamTag}</div>

                  {/* Health Bar */}
                  <div className="w-[150px] bg-gray-700 rounded-full h-4 mt-2">
                    <div
                      className={`h-4 rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${isDead ? 0 : isKnocked ? 100 : healthPercentage}%` }}
                    />
                  </div>

                  
                </div>
<div className='w-[80px] absolute left-[1710px]'>

<img src={player.teamLogo} alt="" className='w-[100%] h-[100%] object-contain' />
</div>
                {/* Kills/Damage Toggle */}
                <div className='flex text-white text-2xl font-bold mr-4 flex-col font-[Righteous]'>
                  <div className='absolute left-[1860px] text-yellow-400 '>
                    {showKills ? player.killNum : player.damage}
                  </div>
                  <div className='relative top-[25px]'>
                    {showKills ? 'KILLS' : 'DAMAGE'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LiveFrags;
