import React, { useState, ChangeEvent, FormEvent, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FaEdit, FaTrash, FaDiscord, FaUpload } from "react-icons/fa";
import api from "../login/api"; // Axios instance with withCredentials
import { socket } from "./socket"; // socket instance
import { setCache, getCache, removeCache } from "./cache"; // ✅ caching utils
import { uploadToCloudinary } from '../utils/cloudinaryUpload.tsx';

interface TournamentFormState {
  tournamentName: string;
  torLogo: string;
  primaryColor: string;
  secondaryColor: string;
  overlayBg: string;
}

interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo: string;
  primaryColor: string;
  secondaryColor: string;
  overlayBg: string;
}

const GLOBAL_CACHE_KEY = "auth_user";
const CACHE_KEY_BASE = "tournaments";

const Dashboard: React.FC = () => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TournamentFormState>({
    tournamentName: "",
    torLogo: "",
    primaryColor: "",
    secondaryColor: "",
    overlayBg: "",
  });

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editForm, setEditForm] = useState<Partial<Tournament>>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  const handleTorLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadToCloudinary(file, "tournaments/logos", "team_logo");
      setForm((prev) => ({ ...prev, torLogo: url }));
    } catch (err) {
      alert("Upload failed");
    }
  };

  // --- Auth check (cached) ---
  const checkAuth = async () => {
    console.log("checkAuth called");
    const cachedUser = getCache(GLOBAL_CACHE_KEY, 1000 * 60 * 5);
    console.log("Cached user:", cachedUser);
    if (cachedUser) return cachedUser;

    try {
      console.log("Making API call to /users/me");
      const { data } = await api.get("/users/me");
      console.log("API response:", data);
      setCache(GLOBAL_CACHE_KEY, data);
      return data;
    } catch (err) {
      console.error("Auth check failed:", err);
      // Clear cache on auth failure
      removeCache(GLOBAL_CACHE_KEY);
      return null;
    }
  };

  // --- Fetch tournaments with caching (per user) ---
  const fetchTournaments = async () => {
    console.log("fetchTournaments called");
    const userData = await checkAuth();
    console.log("checkAuth returned:", userData);
    if (!userData) {
      console.log("No user data, redirecting to login");
      navigate("/login");
      return;
    }
    setUser(userData);

    // Join user room for live updates
    socket.emit('join', userData._id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const key = `${CACHE_KEY_BASE}_${userData._id}`;

    // Try cache first (10 minutes TTL)
    const cached = getCache(CACHE_KEY_BASE, 1000 * 60 * 10);
    if (cached) {
      setTournaments(cached);
      return;
    }

    // Fetch from API if cache missing or expired
    try {
      const { data } = await api.get<Tournament[]>("/tournaments");
      setTournaments(data);
      setCache(CACHE_KEY_BASE, data);
    } catch (err: any) {
      console.error("Error fetching tournaments:", err.response?.data?.message || err.message);
    }
  };

  useEffect(() => {
    console.log("Dashboard useEffect triggered");
    fetchTournaments();

    const handleNewTournament = (tournament: Tournament) => {
      setTournaments((prev) => {
        // avoid duplicates
        if (prev.find((t) => t._id === tournament._id)) return prev;
        const updated = [...prev, tournament];
        setCache(CACHE_KEY_BASE, updated);
        return updated;
      });
    };

    socket.on("newTournament", handleNewTournament);

    return () => {
      socket.off("newTournament", handleNewTournament);
    };
  }, []);

  // --- Create handlers ---
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/tournaments", form);
      const updated = [...tournaments, data];
      setTournaments(updated);
      setCache(CACHE_KEY_BASE, updated);
      setForm({
        tournamentName: "",
        torLogo: "",
        primaryColor: "",
        secondaryColor: "",
        overlayBg: "",
      });
      setShowForm(false);
      alert("Tournament created successfully!");
    } catch (err: any) {
      console.error("Error creating tournament:", err.response?.data?.message || err.message);
      alert("Error creating tournament");
    }
  };

  // --- Edit handlers ---
  const handleEdit = (id: string) => {
    const tournament = tournaments.find((t) => t._id === id);
    if (tournament) {
      setEditingTournament(tournament);
      setEditForm(tournament);
      setShowEditModal(true);
    }
  };

  const handleEditChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingTournament) return;

    try {
      const { data: updatedTournament } = await api.put<Tournament>(
        `/tournaments/${editingTournament._id}`,
        editForm
      );

      const updated = tournaments.map((t) =>
        t._id === updatedTournament._id ? updatedTournament : t
      );
      setTournaments(updated);
      setCache(CACHE_KEY_BASE, updated);
      setEditingTournament(null);
      setShowEditModal(false);
      alert("Tournament updated successfully");
    } catch (err: any) {
      console.error("Edit error:", err.response?.data?.message || err.message);
      alert("Failed to update tournament");
    }
  };

  // --- Delete handler ---
  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this tournament?")) return;

    try {
      await api.delete(`/tournaments/${id}`);
      const updated = tournaments.filter((t) => t._id !== id);
      setTournaments(updated);
      setCache(CACHE_KEY_BASE, updated);
      alert("Tournament deleted successfully");
    } catch (err: any) {
      console.error("Delete error:", err.response?.data?.message || err.message);
      alert("Failed to delete tournament");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header/Navigation Bar */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img
                src="./logo.png"
                alt="ScoreSync Logo"
                className="w-[70px] h-[70px] rounded-lg shadow-lg"
              />
              <div>
                <h1 className="text-[1rem] font-bold text-white">ESPORTS MANAGEMENT</h1>
                <h1 className="text-[1rem] font-bold text-white">AND OVERLAY SOFTWARE</h1>
              </div>
            </div>

            {/* Navigation Buttons */}
            <nav className="flex items-center gap-3">
              <button
                onClick={() => (window.location.href = '/dashboard')}
                className="bg-purple-600 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Tournaments
              </button>
              <button
                onClick={() => window.open('/teams', '_blank', 'noopener,noreferrer')}
                className="bg-slate-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Add Teams
              </button>
              <button
                onClick={() => window.open('/displayhud', '_blank', 'noopener,noreferrer')}
                className="bg-slate-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Display HUD
              </button>
            </nav>

            {/* User Info */}
            <div className="flex items-center gap-4">
              {user && (
                <span className="text-sm text-gray-300 font-medium">
                  Admin: <span className="text-white">{user.username}</span>
                </span>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <span>Help Desk</span>
                <FaDiscord
                  className="cursor-pointer text-2xl text-gray-300 hover:text-purple-400 transition-colors"
                  onClick={() => window.open('https://discord.com/channels/623776491682922526/1426117227257663558', '_blank')}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Tournament Dashboard</h2>
          <p className="text-gray-400">Manage your tournaments and configurations</p>
        </div>

        {/* Add Tournament Button */}
        <button
          className="bg-purple-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors mb-6 shadow-lg"
          onClick={() => setShowForm(!showForm)}
        >
          + Add Tournament
        </button>

        {/* --- Create Form --- */}
        {showForm && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 mb-8 shadow-xl max-w-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Create New Tournament</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  name="tournamentName"
                  placeholder="Tournament Name"
                  value={form.tournamentName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label htmlFor="tournament-logo-upload" className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white cursor-pointer hover:bg-slate-800/50 focus-within:ring-2 focus-within:ring-purple-500 transition-all w-full">
                  <FaUpload size={16} />
                  Upload Tournament Logo
                </label>
                <input
                  id="tournament-logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleTorLogoUpload}
                  className="hidden"
                />
                {form.torLogo && (
                  <img
                    src={form.torLogo}
                    alt="Tournament Logo Preview"
                    className="w-24 h-24 object-contain my-2 rounded-lg border border-slate-600"
                    loading="lazy"
                    onError={(e) => e.currentTarget.src = './logo.png'}
                  />
                )}
              </div>
              {[
                { name: "primaryColor", placeholder: "Primary Color (e.g., #ffffff)" },
                { name: "secondaryColor", placeholder: "Secondary Color (e.g., #000000)" },
                { name: "overlayBg", placeholder: "Overlay Background (e.g., #1a1a1a)" },
              ].map((field) => (
                <div key={field.name}>
                  <input
                    type="text"
                    name={field.name}
                    placeholder={field.placeholder}
                    value={(form as any)[field.name]}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-purple-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Create Tournament
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* --- Tournament List --- */}
        {tournaments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t) => (
              <div
                key={t._id}
                className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow relative group"
              >
                {/* Action Buttons */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(t._id)}
                    className="p-2 bg-blue-600/80 rounded-lg hover:bg-blue-600 transition-colors"
                    title="Edit"
                  >
                    <FaEdit className="text-white" size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(t._id)}
                    className="p-2 bg-red-600/80 rounded-lg hover:bg-red-600 transition-colors"
                    title="Delete"
                  >
                    <FaTrash className="text-white" size={18} />
                  </button>
                </div>

                {/* Tournament Content */}
                <Link to={`/tournaments/${t._id}/rounds`} className="block">
                  <div className="mb-4">
                    {t.torLogo && (
                      <img
                        src={t.torLogo}
                        alt={t.tournamentName}
                        className="w-16 h-16 rounded-lg object-cover mb-3"
                      />
                    )}
                    <h3
                      className="text-xl font-bold mb-2 hover:underline"
                      style={{ color: t.primaryColor || '#ffffff' }}
                    >
                      {t.tournamentName}
                    </h3>
                  </div>

                  {/* Color Preview */}
                  <div className="flex gap-2 mt-4">
                    <div
                      className="w-8 h-8 rounded border border-slate-600"
                      style={{ backgroundColor: t.primaryColor }}
                      title="Primary Color"
                    />
                    <div
                      className="w-8 h-8 rounded border border-slate-600"
                      style={{ backgroundColor: t.secondaryColor }}
                      title="Secondary Color"
                    />
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-400 mb-2">No tournaments yet</h3>
            <p className="text-gray-500 mb-6">Get started by creating your first tournament</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-purple-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Create Tournament
            </button>
          </div>
        )}
      </main>

      {/* --- Edit Modal --- */}
      {showEditModal && editingTournament && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-4">Edit Tournament</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  name="tournamentName"
                  value={editForm.tournamentName || ""}
                  onChange={handleEditChange}
                  placeholder="Tournament Name"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label htmlFor="edit-tournament-logo-upload" className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white cursor-pointer hover:bg-slate-800/50 focus-within:ring-2 focus-within:ring-purple-500 transition-all w-full">
                  <FaUpload size={16} />
                  Upload Tournament Logo
                </label>
                <input
                  id="edit-tournament-logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const url = await uploadToCloudinary(file, "tournaments/logos", "team_logo");
                      setEditForm((prev) => ({ ...prev, torLogo: url }));
                    } catch (err) {
                      alert("Upload failed");
                    }
                  }}
                  className="hidden"
                />
                {editForm.torLogo && (
                  <img
                    src={editForm.torLogo}
                    alt="Tournament Logo Preview"
                    className="w-24 h-24 object-contain my-2 rounded-lg border border-slate-600"
                    loading="lazy"
                    onError={(e) => e.currentTarget.src = './logo.png'}
                  />
                )}
              </div>
              {["primaryColor", "secondaryColor", "overlayBg"].map(
                (field) => (
                  <div key={field}>
                    <input
                      type="text"
                      name={field}
                      value={(editForm as any)[field] || ""}
                      onChange={handleEditChange}
                      placeholder={field.replace(/([A-Z])/g, " $1").trim()}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                )
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-green-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTournament(null);
                    setShowEditModal(false);
                  }}
                  className="bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;