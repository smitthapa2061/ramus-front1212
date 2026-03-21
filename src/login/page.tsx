import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import api from "./api";


// eslint-disable-next-line @typescript-eslint/no-unused-vars
// Interface for user data from the API
interface UserData {
  _id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
  sessionId?: string;
  sessionCookie?: string | null;
}


const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const navigate = useNavigate();



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();


    setLoading(true);
    setError("");
    setDebugInfo("");

    // Basic validation
    if (!email || !password) {
      setError(t('login.validation.emailRequired'));
      setLoading(false);
      return;
    }

    try {
      console.log("Attempting login with:", { email });

      const response = await api.post("/users/login", { email, password });
      const responseData = response.data;

      console.log("Login successful:", responseData);

      // Store user data and session ID in localStorage
      if (responseData.user && responseData.user._id) {
        const { _id, username, email, isAdmin } = responseData.user;

        localStorage.setItem("user", JSON.stringify({
          _id,
          username,
          email,
          isAdmin
        }));

        if (responseData.sessionId) {
          localStorage.setItem("sessionId", responseData.sessionId);
        }

        // Navigate to dashboard on success
        navigate("/dashboard");
      } else {
        throw new Error("Invalid response format from server");
      }

    } catch (err: any) {
      console.error("Login error:", err);

      // Enhanced error handling
      let errorMessage = "Login failed. Please try again.";

      if (err.response) {
        // Server responded with an error status
        errorMessage = err.response.data?.message ||
          err.response.statusText ||
          `Error: ${err.response.status}`;
      } else if (err.request) {
        // Request was made but no response received
        errorMessage = "No response from server. Please check your connection.";
      } else {
        // Something else happened
        errorMessage = err.message || "An unexpected error occurred.";
      }

      setError(errorMessage);

      // Debug info for development
      if (process.env.NODE_ENV !== 'production') {
        setDebugInfo(JSON.stringify({
          error: err.message,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
        }, null, 2));
      }
    } finally {
      setLoading(false);
    }
  };



return (
  <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
    
    {/* Background glow effects */}
    <div className="absolute w-[500px] h-[500px] bg-green-500/20 blur-[120px] top-[-100px] left-[-100px] animate-pulse"></div>
    <div className="absolute w-[400px] h-[400px] bg-green-700/20 blur-[120px] bottom-[-100px] right-[-100px] animate-pulse"></div>

    {/* Main container */}
    <div className="w-full max-w-5xl grid md:grid-cols-2 bg-black/70 backdrop-blur-xl border border-green-700/30 rounded-2xl shadow-2xl overflow-hidden">

      {/* Left esports panel */}
      <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-green-900/40 to-black p-10 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,150,0.15),transparent_70%)]"></div>

        <img
          src="./file.jpg"
          alt="logo"
          className="w-24 h-24 mb-6 z-10 drop-shadow-[0_0_15px_rgba(0,255,150,0.6)]"
        />

       

        <p className="text-gray-400 text-center mt-3 text-sm z-10">
          Real-time esports control panel & analytics
        </p>
      </div>

      {/* Right login panel */}
      <div className="p-8 md:p-10">
        
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-green-400 mb-2">
          WELCOME 
          </h1>
         
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-500/10 border border-red-500/40 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          
          {/* Email */}
          <div className="group">
            <input
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="w-full px-4 py-3 bg-black/60 border border-green-700/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 group-hover:border-green-500"
            />
          </div>

          {/* Password */}
          <div className="group">
            <input
              type="password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="w-full px-4 py-3 bg-black/60 border border-green-700/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 group-hover:border-green-500"
            />
          </div>

          <div className="flex justify-end">
            <a href="/forgot-password" className="text-xs text-green-400 hover:text-green-300">
              {t('login.forgotPassword')}
            </a>
          </div>

          {/* Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg font-semibold text-white tracking-wide transition-all duration-300 ${
              loading
                ? "bg-green-900 opacity-50 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 hover:shadow-[0_0_20px_rgba(0,255,150,0.5)]"
            }`}
          >
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>

        {/* Footer */}
       
      </div>
    </div>
  </div>
);
};

export default Login;
