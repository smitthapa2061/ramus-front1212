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
  liveState: number; // 0 = knocked, 5 = dead, etc.
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo:string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}


interface UpperProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  backpackInfo?: any | null;
}

const Upper: React.FC<UpperProps> = ({ tournament, round, match, matchData, backpackInfo }) => {
  const [localMatchData, setLocalMatchData] = useState<MatchData | null>(matchData || null);
  const [matchDataId, setMatchDataId] = useState<string | null>(matchData?._id?.toString() || null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [socketStatus, setSocketStatus] = useState<string>('disconnected');
  const [updateCount, setUpdateCount] = useState<number>(0);

  useEffect(() => {
    if (matchData) {
      console.log('Upper: Received new matchData prop, updating local state');
      setLocalMatchData(matchData);
      setMatchDataId(matchData._id?.toString());
      setLastUpdateTime(Date.now());
    }
  }, [matchData]);

  useEffect(() => {
    if (!match?._id || !matchDataId) return;

    console.log('Setting up real-time listeners for Upper - match:', match._id, 'matchData:', matchDataId);

    // Get a fresh socket connection from the manager
    const socketManager = SocketManager.getInstance();
    const freshSocket = socketManager.connect();

    console.log('Socket connected:', freshSocket?.connected);
    console.log('Socket ID:', freshSocket?.id);

    // Update initial status
    setSocketStatus(freshSocket?.connected ? 'connected' : 'disconnected');

    // Test socket connection
    freshSocket.emit('test', 'Upper component connected');

    // Log all incoming events for debugging
    const debugHandler = (eventName: string, data: any) => {
      console.log(`Upper: Received ${eventName}:`, data);
    };

    freshSocket.onAny(debugHandler);

    // Create unique event handler names to avoid conflicts with dashboard
    const upperHandlers = {
      handleLiveUpdate: (data: any) => {
        console.log('Upper: Received liveMatchUpdate for match:', data._id);

        // Check if this update is for the current matchData
        if (data._id?.toString() !== matchDataId) {
          console.log('Upper: liveMatchUpdate not for current matchData, ignoring');
          return;
        }

        console.log('Upper: Updating localMatchData with live API data');
        setLocalMatchData(data);
        setLastUpdateTime(Date.now());
        setUpdateCount(prev => prev + 1);
      },

      handleMatchDataUpdate: (data: any) => {
        console.log('Upper: Received matchDataUpdated:', data);
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
        console.log('Upper: Received playerStatsUpdated:', data);
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
        console.log('Upper: Received team points update:', data);
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
        console.log('Upper: Received teamStatsUpdated:', data);
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
        console.log('Upper: Received bulk team update:', data);
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
        console.log('Upper: Socket connected');
        setSocketStatus('connected');
      },

      handleDisconnect: () => {
        console.log('Upper: Socket disconnected');
        setSocketStatus('disconnected');
      }
    };

    // Listen to all relevant socket events with unique handlers
    freshSocket.on('liveMatchUpdate', upperHandlers.handleLiveUpdate);
    freshSocket.on('matchDataUpdated', upperHandlers.handleMatchDataUpdate);
    freshSocket.on('playerStatsUpdated', upperHandlers.handlePlayerUpdate);
    freshSocket.on('teamPointsUpdated', upperHandlers.handleTeamPointsUpdate);
    freshSocket.on('teamStatsUpdated', upperHandlers.handleTeamStatsUpdate);
    freshSocket.on('bulkTeamUpdate', upperHandlers.handleBulkTeamUpdate);
    freshSocket.on('connect', upperHandlers.handleConnect);
    freshSocket.on('disconnect', upperHandlers.handleDisconnect);

    return () => {
      console.log('Upper: Cleaning up socket listeners');
      // Clean up debug handler
      freshSocket.offAny();

      // Clean up with the exact same handler references
      freshSocket.off('liveMatchUpdate', upperHandlers.handleLiveUpdate);
      freshSocket.off('matchDataUpdated', upperHandlers.handleMatchDataUpdate);
      freshSocket.off('playerStatsUpdated', upperHandlers.handlePlayerUpdate);
      freshSocket.off('teamPointsUpdated', upperHandlers.handleTeamPointsUpdate);
      freshSocket.off('teamStatsUpdated', upperHandlers.handleTeamStatsUpdate);
      freshSocket.off('bulkTeamUpdate', upperHandlers.handleBulkTeamUpdate);
      freshSocket.off('connect', upperHandlers.handleConnect);
      freshSocket.off('disconnect', upperHandlers.handleDisconnect);
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

  // Get top 5 teams by alive players
  const topTeams = useMemo(() => {
    if (!localMatchData) return [];

    console.log('Upper: Recalculating topTeams at', new Date(lastUpdateTime).toLocaleTimeString());

    const useApiHealth = round?.apiEnable === true;

    return localMatchData.teams
      .map(team => {
        const aliveCount = team.players.filter(p => !p.bHasDied).length;
        let wwcd: number;
        if (useApiHealth) {
          wwcd = Math.round(team.players.reduce((sum, p) => sum + (p.health || 0), 0) / 4);
        } else {
          wwcd = Math.round(aliveCount * 25);
        }
        return {
          ...team,
          totalKills: team.players.reduce((sum, p) => sum + (p.killNum || 0), 0),
          aliveCount,
          wwcd,
        };
      })
      .filter(team => team.aliveCount > 0)
      .sort((a, b) => b.aliveCount - a.aliveCount)
      .slice(0, 5);
  }, [localMatchData, lastUpdateTime, round?.apiEnable]);


  if (!localMatchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

 return (
  <div className="w-[1920px] h-[1080px] absolute flex">
    <motion.div
      initial={{ opacity: 0, x: 500 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1, delay: 1 }}
      className="w-[210px] h-[800px] relative top-[0px]"
    >
      <div className="mt-[5px] flex flex-row">
        {topTeams.map((team, index) => {
          const hasLiveState5 =
            team.players.length > 0 &&
            team.players.every((p: any) => parseInt(p.liveState, 10) === 5);

          return (
            <div
              key={team._id}
              style={{ marginLeft: index === 0 ? 0 : "299px" }}
              className={`flex text-white text-[1.7rem] border-b font-bebas-neue relative team-container justify-center scale-150 top-[30px] left-[60px]`}
            >
              <div className="z-10">
                {team.teamLogo && (
                  <img
                    src={team.teamLogo}
                    alt={`${team.teamTag} logo`}
                    className="absolute left-[0px] w-9 h-9"
                    style={{ opacity: hasLiveState5 ? 0.5 : 1 }}
                  />
                )}
              </div>

              <div
                style={{ opacity: hasLiveState5 ? 0.7 : 1 }}
                className="w-[130px] z-0 absolute left-[0px] bg-gradient-to-br from-[#ffffff] to-[#a5a5a5] text-black pl-[40px] text-left font-[payBack]"
              >
                {team.teamTag}
              </div>

              <div className="bg-[#00000086] pl-[7px] w-[80px] relative left-[130px]">
                {team.aliveCount === 0 ? (
                  <div className="w-[60px] flex justify-start gap-1 left-[10px] relative top-[2px] text-white font-[300]">
                    ELIM
                  </div>
                ) : (
                  <div className="w-[60px] flex justify-start gap-1 left-[10px] relative top-[-2px]">
                    {team.players.map((p: any, idx: number) => {
                      const health = parseInt(p.health || "0", 10);
                      const healthMax = parseInt(p.healthMax || "100", 10);
                      const liveState = parseInt(p.liveState, 10);
                      const maxHeight = 36;

                      let barColor = "";
                      if ([0, 1, 2, 3].includes(liveState)) {
                        barColor =
                          health === healthMax
                            ? "bg-gradient-to-r from-[#ffffff] to-[#c2c2c2]"
                            : "bg-yellow-400";
                      } else if (liveState === 4) {
                        barColor = "bg-red-600";
                      } else if (liveState === 5) {
                        barColor = "bg-gray-700";
                      } else {
                        barColor = "bg-transparent";
                      }

                      const barHeight =
                        liveState === 5 ? maxHeight : (health / healthMax) * maxHeight;

                      return (
                        <div
                          key={idx}
                          className="mt-[4px]"
                          style={{
                            width: "10px",
                            height: `${maxHeight}px`,
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            className={barColor}
                            style={{
                              opacity: hasLiveState5 ? 0.8 : 1,
                              width: "100%",
                              height: `${barHeight}px`,
                              position: "absolute",
                              bottom: 0,
                              transition: "height 0.3s ease",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    background: `linear-gradient(to right, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'})`,
                  }}
                  className="bg-black w-[210px] h-[40px] absolute right-[0px] mt-[5px] flex items-center"
                >
                  <img
                    className="w-[12%] absolute ml-[10px]"
                    src="https://res.cloudinary.com/dqckienxj/image/upload/v1753647336/bullet_lpm2no.png"
                    alt=""
                  />
                  <div className="ml-[30px] w-[1000px] left-[0px] text-white relative top-[0px] font-[payBack] flex text-[22px]">
                    TOTAL KILLS
                    <span className="font-[payBack] relative bg-white text-black w-[20%] text-center ml-[10px]">
                      {team.totalKills}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  </div>
 );





};

export default Upper;