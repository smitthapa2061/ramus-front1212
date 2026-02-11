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
  teamId?: string;
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

interface LiveStatsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: any;
}

const LiveStats: React.FC<LiveStatsProps> = ({ tournament, round, match, matchData, overallData }) => {
  const [localMatchData, setLocalMatchData] = useState<MatchData | null>(matchData || null);
  const [matchDataId, setMatchDataId] = useState<string | null>(matchData?._id?.toString() || null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [socketStatus, setSocketStatus] = useState<string>('disconnected');
  const [updateCount, setUpdateCount] = useState<number>(0);
  const [overallMap, setOverallMap] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (matchData) {
      console.log('LiveStats: Received new matchData prop, updating local state');
      setLocalMatchData(matchData);
      setMatchDataId(matchData._id?.toString());
      setLastUpdateTime(Date.now());
    }
  }, [matchData]);

  useEffect(() => {
    if (!match?._id || !matchDataId) return;

    console.log('Setting up real-time listeners for LiveStats - match:', match._id, 'matchData:', matchDataId);

    // Get a fresh socket connection from the manager
    const socketManager = SocketManager.getInstance();
    const freshSocket = socketManager.connect();

    console.log('Socket connected:', freshSocket?.connected);
    console.log('Socket ID:', freshSocket?.id);

    // Update initial status
    setSocketStatus(freshSocket?.connected ? 'connected' : 'disconnected');

    // Test socket connection
    freshSocket.emit('test', 'LiveStats component connected');

    // Log all incoming events for debugging
    const debugHandler = (eventName: string, data: any) => {
      console.log(`LiveStats: Received ${eventName}:`, data);
    };

    freshSocket.onAny(debugHandler);

    // Create unique event handler names to avoid conflicts with dashboard
    const liveStatsHandlers = {
      handleLiveUpdate: (data: any) => {
        console.log('LiveStats: Received liveMatchUpdate for match:', data._id);

        // Check if this update is for the current matchData
        if (data._id?.toString() !== matchDataId) {
          console.log('LiveStats: liveMatchUpdate not for current matchData, ignoring');
          return;
        }

        console.log('LiveStats: Updating localMatchData with live API data');
        setLocalMatchData(data);
        setLastUpdateTime(Date.now());
        setUpdateCount(prev => prev + 1);
      },

      handleMatchDataUpdate: (data: any) => {
        console.log('LiveStats: Received matchDataUpdated:', data);
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
        console.log('LiveStats: Received playerStatsUpdated:', data);
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
        console.log('LiveStats: Received team points update:', data);
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
        console.log('LiveStats: Received teamStatsUpdated:', data);
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
        console.log('LiveStats: Received bulk team update:', data);
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
        console.log('LiveStats: Socket connected');
        setSocketStatus('connected');
      },

      handleDisconnect: () => {
        console.log('LiveStats: Socket disconnected');
        setSocketStatus('disconnected');
      }
    };

    // Listen to all relevant socket events with unique handlers
    freshSocket.on('liveMatchUpdate', liveStatsHandlers.handleLiveUpdate);
    freshSocket.on('matchDataUpdated', liveStatsHandlers.handleMatchDataUpdate);
    freshSocket.on('playerStatsUpdated', liveStatsHandlers.handlePlayerUpdate);
    freshSocket.on('teamPointsUpdated', liveStatsHandlers.handleTeamPointsUpdate);
    freshSocket.on('teamStatsUpdated', liveStatsHandlers.handleTeamStatsUpdate);
    freshSocket.on('bulkTeamUpdate', liveStatsHandlers.handleBulkTeamUpdate);
    freshSocket.on('connect', liveStatsHandlers.handleConnect);
    freshSocket.on('disconnect', liveStatsHandlers.handleDisconnect);

    return () => {
      console.log('LiveStats: Cleaning up socket listeners');
      // Clean up debug handler
      freshSocket.offAny();

      // Clean up with the exact same handler references
      freshSocket.off('liveMatchUpdate', liveStatsHandlers.handleLiveUpdate);
      freshSocket.off('matchDataUpdated', liveStatsHandlers.handleMatchDataUpdate);
      freshSocket.off('playerStatsUpdated', liveStatsHandlers.handlePlayerUpdate);
      freshSocket.off('teamPointsUpdated', liveStatsHandlers.handleTeamPointsUpdate);
      freshSocket.off('teamStatsUpdated', liveStatsHandlers.handleTeamStatsUpdate);
      freshSocket.off('bulkTeamUpdate', liveStatsHandlers.handleBulkTeamUpdate);
      freshSocket.off('connect', liveStatsHandlers.handleConnect);
      freshSocket.off('disconnect', liveStatsHandlers.handleDisconnect);
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

  useEffect(() => {
    if (overallData && Array.isArray(overallData.teams) && match?.matchNo !== 1) {
      const map = new Map<string, any>();
      for (const t of overallData.teams) {
        const key = t.teamId?.toString?.() || t.teamId;
        if (!key) continue;
        map.set(key, {
          placePoints: t.placePoints || 0,
          players: Array.isArray(t.players) ? t.players : [],
        });
      }
      setOverallMap(map);
    } else {
      setOverallMap(new Map());
    }
  }, [overallData, match?.matchNo]);

  const sortedTeams = useMemo(() => {
    if (!localMatchData) return [];

    return localMatchData.teams
      .map(team => {
        const teamKey = (team as any).teamId?.toString?.() || (team as any).teamId || team._id;
        const overall = overallMap.get(teamKey);
        const liveKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
        const overallKills = overall && Array.isArray(overall.players)
          ? overall.players.reduce((s: number, p: any) => s + (p.killNum || 0), 0)
          : 0;
        const totalPoints = (match?.matchNo === 1 ? 0 : (overall?.placePoints || 0)) + (team.placePoints || 0) + liveKills + (match?.matchNo === 1 ? 0 : overallKills);
        const isAllDead = team.players.every(player => player.liveState === 5 || player.bHasDied);

        return {
          ...team,
          totalKills: liveKills,
          alive: team.players.filter(p => p.liveState !== 5).length,
          totalPoints,
          isAllDead,
        } as any;
      })
      .sort((a: any, b: any) => {
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }
        return b.totalKills - a.totalKills;
      });
  }, [localMatchData, overallMap, match?.matchNo, lastUpdateTime]);

  const baseHealthBar = 36; // original health bar height

  if (!localMatchData) {
    return (
      <div style={{ color: "red", padding: 20, fontWeight: "bold" }}>No match data</div>
    );
  }

  const primaryColor = tournament.primaryColor || "#6b21a8"; // fallback purple
  const secondaryColor = tournament.secondaryColor || "#c084fc"; // fallback light purple

  return (
    <div className="w-[1920px] h-[1080px] absolute flex justify-end ">
      <motion.div
        initial={{ opacity: 0, x: 500 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, delay: 1 }}
        className="w-[330px] h-[800px] relative top-[0px]"
      >
        {/* Header */}
        <div
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${primaryColor}, ${secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
            backgroundSize: "cover",
            backgroundBlendMode: "screen",
          }}
          className="w-full h-[30px] relative top-[5px]"
        >
          <div className="text-white flex text-[1rem] font-[supermolot] font-[100] justify-center tracking-wider ml-[30px] pt-[10px] w-full scale-y-[1] relative">

            <div className="absolute left-[40px] top-0">TEAM</div>
            <div className="absolute left-[125px] top-0">STATUS</div>
             <div className="absolute left-[210px] top-0">KILLS</div>
            <div className="absolute left-[265px] top-0">PTS</div>
          </div>
        </div>

        {/* Teams List */}
        <div className="mt-[5px]">
          {sortedTeams.map((team, index) => {
            // Calculate total kills
            const totalKills = team.players.reduce(
              (sum: number, p: Player) => sum + (p.killNum || 0),
              0
            );

            // Determine if all players have liveState === 5 (dead)
            const hasLiveState5 =
              team.players.length > 0 &&
              team.players.every((p: Player) => parseInt(p.liveState.toString(), 10) === 5);

            return (
              <div
                className={`flex bg-[#202020f9] justify-between px-4 text-white text-[1.7rem] border-b font-[AGENCYB] relative team-container`}
              >
                {/* Index */}
                <div
                  className="w-[50px] text-center absolute left-0"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${primaryColor}, ${secondaryColor})`,
                    opacity: hasLiveState5 ? 0.5 : 1,
                  }}
                >
                  {index + 1}
                </div>

                {/* Team Logo */}
                <div className="z-10">
                  {team.teamLogo && (
                    <img
                      src={team.teamLogo}
                      alt={`${team.teamTag} logo`}
                      className="absolute left-[53px] w-9 h-9"
                      style={{ opacity: hasLiveState5 ? 0.5 : 1 }}
                    />
                  )}
                </div>

                {/* Team Name */}
                <div
                  style={{ opacity: hasLiveState5 ? 0.7 : 1 }}
                  className="w-[130px] z-0 absolute left-[50px] text-white pl-[40px] text-left"
                >
                  {team.teamTag}
                </div>

                {/* Alive / Player Health Bars or MISS */}
                {team.players.length === 0 ? (
                  <div className="w-[60px] flex justify-start gap-1 left-[-84px] relative top-[2px] text-white font-[300]">
                    MISS
                  </div>
                ) : (
                  <div className="w-[60px] flex justify-start gap-1 left-[-90px] relative top-[-2px]">
                    {team.players.map((p: Player, idx: number) => {
                      const isDead = p.liveState === 5 || p.bHasDied;
                      const isAlive = [0, 1, 2, 3].includes(p.liveState);
                      const isKnocked = p.liveState === 4;
                      const useApiHealth = round?.apiEnable === true;

                      let barHeight = 0;
                      let barColor = '';

                      if (useApiHealth) {
                        if (isDead) {
                          barHeight = baseHealthBar;
                          barColor = '#4a4a4a';
                        }
                        else if (isKnocked) {
                          const healthRatio = Math.max(
                            0,
                            Math.min(1, p.health / (p.healthMax || 100))
                          );
                          barHeight = healthRatio * baseHealthBar;
                          barColor = "red"; // 🔥 Knocked → PRIMARY
                        }
                        else if (isAlive) {
                          const healthRatio = Math.max(
                            0,
                            Math.min(1, p.health / (p.healthMax || 100))
                          );
                          barHeight = healthRatio * baseHealthBar;
                          barColor = "white"; // ❤️ Alive → SECONDARY
                        }
                      }
                      else {
                        if (isDead) {
                          barHeight = baseHealthBar;
                          barColor = '#4a4a4a';
                        }
                        else if (isKnocked) {
                          barHeight = baseHealthBar;
                          barColor = "red"; // 🔥 Knocked → PRIMARY
                        }
                        else if (isAlive) {
                          barHeight = baseHealthBar;
                          barColor = "white"; // ❤️ Alive → SECONDARY
                        }
                      }

                      const maxHeight = 36;

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
                              backgroundColor: barColor
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
  <div
                  style={{ opacity: hasLiveState5 ? 0.8 : 1 }}
                  className="absolute left-[255px]"
                >
                  {team.totalKills}  
                </div>
                {/* Total Points */}
                <div
                  style={{ opacity: hasLiveState5 ? 0.8 : 1 }}
                  className="absolute left-[295px]"
                >
                   {team.totalPoints}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${primaryColor}, ${secondaryColor})`,
          }}
          className="w-[310px] bg-white h-[20px] mt-0 flex items-center"
        >
          <div className="w- h-[100%] relative left-[20px] flex pl-[10px] ">
            <div className="font-[supermolot] text-white font-[300] mr-[10px] pr-[7px]">
              ALIVE
            </div>
            <div className="w-[12px] h-[12px] mt-[4px] bg-white relative left-[-10px]"></div>
          </div>
          <div className="w-[300px] h-[100%] relative left-[20px] bg-gradient-to-l from-[#ffffff] to-[#a5a5a5] flex pl-[10px]">
            <div className="font-[supermolot] text-black font-[300] mr-[10px] pr-[7px] ">
              KNOCK
            </div>
            <div className="w-[12px] h-[12px] mt-[4px] bg-red-600 relative left-[-10px]"></div>
            <div className="font-[supermolot] text-black font-[300] mr-[10px] pr-[7px] pl-[16px]">
              DEAD
            </div>
            <div className="w-[12px] h-[12px] mt-[4px] bg-[#4a4a4a] relative left-[-10px]"></div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LiveStats;
