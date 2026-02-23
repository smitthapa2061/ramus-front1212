import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
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
  day?:string
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
  damage?: string;
  survivalTime?: number;
  assists?: number;
  
  // Live stats fields
  health: number;
  healthMax: number;
  liveState: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
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

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  const [localMatchData, setLocalMatchData] = useState<MatchData | null>(matchData || null);
  const [matchDataId, setMatchDataId] = useState<string | null>(matchData?._id?.toString() || null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [socketStatus, setSocketStatus] = useState<string>('disconnected');
  const [updateCount, setUpdateCount] = useState<number>(0);
  const [selectedView, setSelectedView] = useState<'fragers' | 'teams'>('fragers');

  useEffect(() => {
    if (matchData) {
      console.log('MatchFragrs: Received new matchData prop, updating local state');
      setLocalMatchData(matchData);
      setMatchDataId(matchData._id?.toString());
      setLastUpdateTime(Date.now());
    }
  }, [matchData]);

  useEffect(() => {
    if (!match?._id || !matchDataId) return;

    console.log('Setting up real-time listeners for MatchFragrs - match:', match._id, 'matchData:', matchDataId);
    
    // Get a fresh socket connection from the manager
    const socketManager = SocketManager.getInstance();
    const freshSocket = socketManager.connect();
    
    console.log('Socket connected:', freshSocket?.connected);
    console.log('Socket ID:', freshSocket?.id);
    
    // Update initial status
    setSocketStatus(freshSocket?.connected ? 'connected' : 'disconnected');
    
    // Test socket connection
    freshSocket.emit('test', 'MatchFragrs component connected');
    
    // Log all incoming events for debugging
    const debugHandler = (eventName: string, data: any) => {
      console.log(`MatchFragrs: Received ${eventName}:`, data);
    };
    
    freshSocket.onAny(debugHandler);

    // Create unique event handler names to avoid conflicts with dashboard
    const matchFragrsHandlers = {
      handleLiveUpdate: (data: any) => {
        console.log('MatchFragrs: Received liveMatchUpdate for match:', data.matchId);
        
        // The data is the entire MatchData object, so we need to check if it matches our current match
        if (data.matchId?.toString() === match._id?.toString()) {
          console.log('MatchFragrs: Updating localMatchData with live API data');
          setLocalMatchData(data);
          setLastUpdateTime(Date.now());
          setUpdateCount(prev => prev + 1);
        }
      },

      handleMatchDataUpdate: (data: any) => {
        console.log('MatchFragrs: Received matchDataUpdated:', data);
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
        console.log('MatchFragrs: Received playerStatsUpdated:', data);
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
        console.log('MatchFragrs: Received team points update:', data);
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
        console.log('MatchFragrs: Received teamStatsUpdated:', data);
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
        console.log('MatchFragrs: Received bulk team update:', data);
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
        console.log('MatchFragrs: Socket connected');
        setSocketStatus('connected');
      },

      handleDisconnect: () => {
        console.log('MatchFragrs: Socket disconnected');
        setSocketStatus('disconnected');
      }
    };

    // Listen to all relevant socket events with unique handlers
    freshSocket.on('liveMatchUpdate', matchFragrsHandlers.handleLiveUpdate);
    freshSocket.on('matchDataUpdated', matchFragrsHandlers.handleMatchDataUpdate);
    freshSocket.on('playerStatsUpdated', matchFragrsHandlers.handlePlayerUpdate);
    freshSocket.on('teamPointsUpdated', matchFragrsHandlers.handleTeamPointsUpdate);
    freshSocket.on('teamStatsUpdated', matchFragrsHandlers.handleTeamStatsUpdate);
    freshSocket.on('bulkTeamUpdate', matchFragrsHandlers.handleBulkTeamUpdate);
    freshSocket.on('connect', matchFragrsHandlers.handleConnect);
    freshSocket.on('disconnect', matchFragrsHandlers.handleDisconnect);

    return () => {
      console.log('MatchFragrs: Cleaning up socket listeners');
      // Clean up debug handler
      freshSocket.offAny();
      
      // Clean up with the exact same handler references
      freshSocket.off('liveMatchUpdate', matchFragrsHandlers.handleLiveUpdate);
      freshSocket.off('matchDataUpdated', matchFragrsHandlers.handleMatchDataUpdate);
      freshSocket.off('playerStatsUpdated', matchFragrsHandlers.handlePlayerUpdate);
      freshSocket.off('teamPointsUpdated', matchFragrsHandlers.handleTeamPointsUpdate);
      freshSocket.off('teamStatsUpdated', matchFragrsHandlers.handleTeamStatsUpdate);
      freshSocket.off('bulkTeamUpdate', matchFragrsHandlers.handleBulkTeamUpdate);
      freshSocket.off('connect', matchFragrsHandlers.handleConnect);
      freshSocket.off('disconnect', matchFragrsHandlers.handleDisconnect);
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

  // Typed text helper using Framer Motion
  const renderTyped = (text: string, className?: string, delayBase: number = 0) => {
    const letters = Array.from(text || '');
    return (
      <motion.span
        className={className}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.03, delayChildren: delayBase } }
        }}
      >
        {letters.map((char, i) => (
          <motion.span
            key={i}
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            className="inline-block"
          >
            {char}
          </motion.span>
        ))}
      </motion.span>
    );
  };

  // Variants for staggered card reveal
  const cardVariants = {
    hidden: { opacity: 0, y: 120 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as any } }
  };

  

  // Get top 5 players by kills, then damage, then assists - recalculated on every localMatchData change
  const topPlayers = useMemo(() => {
    if (!localMatchData) return [];
    
    console.log('MatchFragrs: Recalculating topPlayers at', new Date(lastUpdateTime).toLocaleTimeString());
    
    const allPlayers = localMatchData.teams.flatMap(team => {
      const teamTotalKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
      return team.players.map(player => ({ 
        ...player,
        killNum: Number(player.killNum || 0),
        // damage can be string or number coming from backend
        numericDamage: Number((player as any).damage ?? 0) || 0,
        assists: Number((player as any).assists ?? 0) || 0,
        teamTag: team.teamTag, 
        teamLogo: team.teamLogo,
        teamPoints: team.placePoints,
        teamTotalKills
      }));
    });

    const sorted = allPlayers.sort((a: any, b: any) => {
      if (b.killNum !== a.killNum) return b.killNum - a.killNum; // priority 1: kills
      if (b.numericDamage !== a.numericDamage) return b.numericDamage - a.numericDamage; // priority 2: damage
      if (b.assists !== a.assists) return b.assists - a.assists; // priority 3: assists
      return 0;
    });

    return sorted.slice(0, 5);
  }, [localMatchData, lastUpdateTime]);

  // Get sorted teams by points and kills - recalculated on every localMatchData change
  const sortedTeams = useMemo(() => {
    if (!localMatchData) return [];
    
    console.log('MatchFragrs: Recalculating sortedTeams at', new Date(lastUpdateTime).toLocaleTimeString());
    
    return localMatchData.teams
      .map(team => ({
        ...team,
        totalKills: team.players.reduce((sum, p) => sum + (p.killNum || 0), 0),
        alive: team.players.filter(p => p.liveState !== 5 && !p.bHasDied).length,
        totalDamage: team.players.reduce((sum, p) => sum + (parseInt(p.damage || '0') || 0), 0),
      }))
      .sort((a, b) => {
        // Sort by points first (descending), then by kills (descending)
        if (b.placePoints !== a.placePoints) {
          return b.placePoints - a.placePoints;
        }
        return b.totalKills - a.totalKills;
      });
  }, [localMatchData, lastUpdateTime]);

  if (!localMatchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No match data available</div>
      </div>
    );
  }

  return (
    
    <div className="w-[1920px] h-[1080px]  relative overflow-hidden">
      {/* Background Pattern */}
      <motion.div 
        className="absolute inset-0 opacity-10"
       
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Header */}
      <motion.div className="relative z-10  text-center left-[600px] top-[100px] text-[5rem] font-bebas font-[300]"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between mb-[60px]">
          <div className="flex items-center space-x-4 ">
          
            <div>
              <h1 className=" font-bold font-[awaking] whitespace-pre text-[8rem]  bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)]  tracking-wider "


              >
              TOP FRAGGERS
              </h1>
              {round && match && (
                <motion.p
                  className="text-white text-[3rem] font-[AGENCYB] whitespace-pre p-[0px]"
                  initial={{ backgroundColor: 'rgba(255,0,0,0.2)' }}
                  animate={{ backgroundColor: ['rgba(255,0,0,0.25)','rgba(255,0,0,0.45)','rgba(255,0,0,0.25)'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                  }}
                >
              {renderTyped(
  `${round.roundName} - DAY${(round as any).day ? ` ${round.day}` : ''} - MATCH ${match.matchNo || match._matchNo}`,
  undefined,
  0.35
)}
                </motion.p>
              )}
            
            </div>
          </div>

    
        </div>


      </motion.div>

      {/* Content Area */}
      <div className="relative z-10 ">
        {selectedView === 'fragers' ? (
          /* Top Fraggers View */
          <div className="">
           

            <motion.div className="grid grid-cols-5 gap-[0px]"
            
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.18, delayChildren: 0.50 } }
              }}
            >
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

                const contribution = player.teamTotalKills > 0 
                  ? Math.min(100, Math.round((player.killNum / player.teamTotalKills) * 100))
                  : 0;

                return (
                  <motion.div
                  style={{
                      clipPath: "polygon(10% 2%, 100% -30%, 100% 80%, 85% 100%, 0 100%)",
                    background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                  }}
                    key={player._id}
                    className="flex flex-col  bg-gray-900 w-[300px] h-[500px] relative top-[150px] left-[40px]"
                  
                    variants={cardVariants}
                  >
                    {/* Rank */}
                    <div className="text-yellow-400 text-2xl font-bold font-[Righteous] ml-[20px] ">#{index + 1}</div>
                    <div className='w-[249px] h-[1px] bg-white relative left-[50px] top-[-15px]'></div>
                    <div className='w-[60px] absolute left-[235px] top-[30px]'><img src={player.teamLogo} alt="" className='aboslute' /></div>
<div className='w-[250px] absolute left-[20px] opacity-40'><img src={player.teamLogo} alt="" className='aboslute' /></div>
                    {/* Player Avatar */}
                    <div className="w-[300px] h-[300px] ml-[0px] absolute z-0">
                      <img
                        src={player.picUrl || '/def_char2.avif'}
                        alt={player.playerName}
                        className="w-full h-full "
                      />
                    </div>

                    {/* Player Info */}
                    <div className="text-center z-10 relative top-[220px]">
                      <div className="text-black pt-[0px] text-[1.8rem] font-bold font-[Righteous] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] w-[300px] h-[50px]">{player.playerName}</div>
                      <div className="text-gray-300 text-[15px] font-[Righteous] absolute w-[100%] h-[55%] border-b-2  bg-[#00000099]">esports athlete for {player.teamTag}</div>
                    </div>

                    {/* Health Bar */}
                   
                   

                    {/* Stats */}
                    <div className=" text-[2rem] w-full text-center absolute top-[330px] font-bebas  font-[500] bg-[#00000099] flex justify-center">
                      <div>
                        <div className="text-yellow-400  text-[4rem] ">{player.killNum} <span className='text-white'>KILLS</span></div>
                   
                      </div>
                    
                    
                    </div>

                    {/* Contribution */}
                    <div className="w-full absolute top-[450px]">
                      <div className="flex  text-xs text-gray-300 font-[Righteous] mb-1 items-center justify-center">
                        <span className='text-[1rem] '>Contribution</span>
                        <span className=' text-center text-[1rem] ml-[10px]'>{contribution}%</span>
                      </div>
                      <div className="w-[90%] bg-gray-700 rounded-full h-2 relative left-[10px] ">
                        <div className="h-2 rounded-full bg-yellow-400 transition-all duration-500" style={{ width: `${contribution}%` }} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        ) : (
          /* Team Rankings View */
          <div className="space-y-4">
          
          </div>
        )}
      </div>

    </div>
  );
};

export default MatchFragrs;
