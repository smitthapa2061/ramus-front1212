import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FaTrash, FaEdit } from "react-icons/fa";
import { useParams } from "react-router-dom";
import api from "../login/api.tsx"; // Axios instance with withCredentials

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

// Memoized Team Row Component to prevent unnecessary re-renders
const TeamRow = React.memo(({
  team,
  isSelected,
  slot,
  onToggle,
  onSlotChange
}: {
  team: Team;
  isSelected: boolean;
  slot: number | null;
  onToggle: (id: string) => void;
  onSlotChange: (id: string, val: string) => void;
}) => {
  return (
    <div className="flex items-center justify-between p-2 hover:bg-slate-700/50 rounded-md transition-colors mb-1">
      <label className="flex items-center cursor-pointer flex-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(team._id)}
          className="mr-3 w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
        />
        <span className="text-gray-200 text-sm">{team.teamFullName}</span>
      </label>
    </div>
  );
});

const Group = React.forwardRef<GroupRef, GroupProps>(({ onSelectionChange }, ref) => {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  const [showForm, setShowForm] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<SelectedTeam[]>([]);

  // Use ref for group name to prevent re-renders on typing
  const groupNameRef = useRef<HTMLInputElement>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const CACHE_KEY = `groups_cache_${tournamentId}`;

  // Expose openForm to parent
  React.useImperativeHandle(ref, () => ({
    openForm: async () => {
      setShowForm(true);
      await fetchTeams();
      clearForm();
    }
  }));

  // Fetch teams
  const fetchTeams = async () => {
    try {
      const res = await api.get("/teams");
      setTeams(res.data);
    } catch (err: any) {
      console.error("Failed to fetch teams:", err);
      if (err.response?.status === 401) alert("Unauthorized. Please login.");
    }
  };

  // Fetch groups with cache
  const fetchGroups = useCallback(async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          setGroups(JSON.parse(cached));
          return;
        }
      }

      const res = await api.get(`/tournaments/${tournamentId}/groups`);
      setGroups(res.data);

      // Save to cache
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

  const handleCheckboxChange = useCallback((teamId: string) => {
    setSelectedTeams((prev) => {
      const exists = prev.find((t) => t.teamId === teamId);
      if (exists) return prev.filter((t) => t.teamId !== teamId);

      const nextSlot = prev.length > 0 ? Math.max(...prev.map((t) => t.slot || 0)) + 1 : 1;
      return [...prev, { teamId, slot: nextSlot }];
    });
  }, []);

  const handleSlotChange = useCallback((teamId: string, slotValue: string) => {
    const slotNum = slotValue === "" ? null : parseInt(slotValue, 10);
    setSelectedTeams((prev) =>
      prev.map((t) => (t.teamId === teamId ? { ...t, slot: slotNum } : t))
    );
  }, []);

  const openFormForEditGroup = async (group: Group) => {
    await fetchTeams(); // Ensure teams are loaded for editing
    if (groupNameRef.current) groupNameRef.current.value = group.groupName;

    if (group.slots && group.slots.length > 0) {
      const preSelected = group.slots.map((slot) => ({
        teamId: slot.team._id,
        slot: slot.slot,
      }));
      setSelectedTeams(preSelected);
    } else {
      setSelectedTeams([]);
    }
    setEditingGroupId(group._id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const name = groupNameRef.current?.value || "";
    if (!name.trim()) return alert("Group name is required.");
    if (selectedTeams.length === 0) return alert("Select at least one team.");

    for (const t of selectedTeams) {
      if (t.slot === null || isNaN(t.slot)) {
        return alert("Please assign a valid slot number for all selected teams.");
      }
    }

    // Verify all selected teams still exist in the teams array
    const invalidTeams = selectedTeams.filter(st =>
      !teams.find(t => t._id === st.teamId)
    );

    if (invalidTeams.length > 0) {
      alert('Some selected teams no longer exist. Please refresh and try again.');
      await fetchTeams(); // Refresh team list
      return;
    }

    try {
      const payload = {
        groupName: name,
        slots: selectedTeams.map(({ teamId, slot }) => ({ team: teamId, slot })),
      };

      if (editingGroupId) {
        await api.put(`/tournaments/${tournamentId}/groups/${editingGroupId}`, payload);
      } else {
        await api.post(`/tournaments/${tournamentId}/groups`, payload);
      }

      clearForm();
      setShowForm(false);

      // Force refresh from API to update cache
      fetchGroups(true);
    } catch (err: any) {
      console.error("Failed to submit group:", err);
      const errorMsg = err.response?.data?.message || "Failed to submit group. Please try again.";
      const missingTeams = err.response?.data?.missingTeamIds;

      if (missingTeams && missingTeams.length > 0) {
        alert(`${errorMsg}\n\nMissing team IDs: ${missingTeams.join(', ')}\n\nPlease refresh the page and try again.`);
        await fetchTeams(); // Refresh team list
      } else {
        alert(errorMsg);
      }
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm("Are you sure you want to delete this group?")) return;

    try {
      await api.delete(`/tournaments/${tournamentId}/groups/${groupId}`);
      fetchGroups(true); // refresh after deletion
    } catch (err: any) {
      console.error("Failed to delete group:", err);
      alert(err.response?.data?.message || "Failed to delete group. Try again.");
    }
  };

  // Notify parent of selected group IDs
  useEffect(() => {
    if (onSelectionChange) {
      const selectedGroupIds = groups.map((g) => g._id);
      onSelectionChange(selectedGroupIds);
    }
  }, [groups, selectedTeams, onSelectionChange]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const filteredTeams = useMemo(() => {
    return teams.filter((team) =>
      team.teamFullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      team.teamTag.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [teams, searchTerm]);

  if (!showForm) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl w-full max-w-7xl relative flex flex-col max-h-[90vh]">

        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
          <h3 className="text-2xl font-bold text-white">
            {editingGroupId ? "Edit Group" : "Manage Groups"}
          </h3>
          <button
            onClick={() => setShowForm(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 space-y-8">

          {/* Create/Edit Section */}
          <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700/50">
            <h4 className="text-lg font-semibold text-purple-400 mb-4">
              {editingGroupId ? "Edit Group Details" : "Create New Group"}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Group Name</label>
                <input
                  type="text"
                  ref={groupNameRef}
                  placeholder="e.g. Group A"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Search Teams</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by team name or tag..."
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Team Selection Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col h-[600px]">
                <label className="text-sm text-gray-400 mb-2">Available Teams</label>
                <div className="flex-1 overflow-y-auto border border-slate-700 rounded-lg bg-slate-800 p-2 custom-scrollbar">
                  {filteredTeams.map((team) => {
                    const isSelected = !!selectedTeams.find((t) => t.teamId === team._id);
                    const selectedTeam = selectedTeams.find((t) => t.teamId === team._id);

                    return (
                      <TeamRow
                        key={team._id}
                        team={team}
                        isSelected={isSelected}
                        slot={selectedTeam ? selectedTeam.slot : null}
                        onToggle={handleCheckboxChange}
                        onSlotChange={handleSlotChange}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col h-[600px]">
                <label className="text-sm text-gray-400 mb-2">Selected Teams & Slots</label>
                <div className="flex-1 overflow-y-auto border border-slate-700 rounded-lg bg-slate-800 p-2 custom-scrollbar">
                  {selectedTeams.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center italic mt-10">No teams selected</p>
                  ) : (
                    selectedTeams.map((t) => {
                      const team = teams.find((team) => team._id === t.teamId);
                      return (
                        <div key={t.teamId} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-md mb-1 border border-slate-700/50">
                          <div className="flex items-center flex-1 mr-2">
                            {team?.logo && (
                              <img
                                src={team.logo}
                                alt={`${team.teamFullName} logo`}
                                className="w-8 h-8 rounded-full object-cover mr-3 border border-slate-600"
                                loading="lazy"
                              />
                            )}
                            <span className="text-gray-200 text-sm truncate">{team?.teamFullName}</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            placeholder="#"
                            value={t.slot ?? ""}
                            onChange={(e) => handleSlotChange(t.teamId, e.target.value)}
                            className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-center text-sm focus:ring-1 focus:ring-purple-500 outline-none"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  clearForm();
                  setEditingGroupId(null);
                }}
                className="px-6 py-2.5 rounded-lg font-medium text-gray-300 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-6 py-2.5 rounded-lg font-medium text-white bg-purple-600 hover:bg-purple-700 shadow-lg transition-all"
              >
                {editingGroupId ? "Update Group" : "Create Group"}
              </button>
            </div>
          </div>

          {/* Existing Groups Section */}
          <div>
            <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
              Existing Groups
            </h4>
            <div className="space-y-3">
              {groups.map((group) => (
                <details key={group._id} className="group/details bg-slate-900/30 border border-slate-700/50 rounded-xl overflow-hidden transition-all hover:border-slate-600/50">
                  <summary className="cursor-pointer font-medium flex justify-between items-center px-5 py-4 hover:bg-slate-800/50 transition-colors">
                    <span className="text-white text-lg">{group.groupName}</span>
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openFormForEditGroup(group);
                        }}
                        className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all"
                        title="Edit Group"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <FaEdit size={16} />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group._id);
                        }}
                        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white transition-all"
                        title="Delete Group"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <FaTrash size={16} />
                      </button>
                    </div>
                  </summary>

                  <div className="px-6 py-4 bg-slate-950/30 border-t border-slate-800">
                    <ul className="space-y-1 text-gray-400">
                      {group.slots && group.slots.length > 0 ? (
                        group.slots
                          .sort((a, b) => a.slot - b.slot)
                          .map((slot) => (
                            <li key={slot._id} className="flex items-center">
                              {slot.team?.logo && (
                                <img
                                  src={slot.team.logo}
                                  alt={`${slot.team.teamFullName} logo`}
                                  className="w-6 h-6 rounded-full object-cover mr-2 border border-slate-600"
                                  loading="lazy"
                                />
                              )}
                              <span className="text-gray-300">{slot.team ? slot.team.teamFullName : "Unknown Team"}</span>
                              <span className="text-purple-500 ml-2 text-sm font-mono">(Slot {slot.slot})</span>
                            </li>
                          ))
                      ) : (
                        <li className="text-sm text-gray-500 italic">No teams assigned</li>
                      )}
                    </ul>
                  </div>
                </details>
              ))}
              {groups.length === 0 && (
                <div className="text-center py-8 text-gray-500 bg-slate-900/30 rounded-xl border border-slate-700/30 border-dashed">
                  No groups created yet.
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="mt-6 pt-4 border-t border-slate-700 flex justify-end">
          <button
            onClick={() => setShowForm(false)}
            className="px-6 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
});

export default Group;

