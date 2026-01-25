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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Login card with subtle glassmorphism */}
      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-8 rounded-xl shadow-xl">
          {/* Logo/Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-purple-600 mb-4 shadow-lg">
              <img
                src="./logo.png"
                alt="ScoreSync Logo"
                className="w-[70px] h-[70px] rounded-lg shadow-lg"
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">{t('login.title')}</h1>
            <p className="text-gray-400 text-sm">{t('login.subtitle')}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 text-red-100 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-semibold text-sm">{t('login.error')}</p>
                  <p className="text-sm opacity-90 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                {t('login.email')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                {t('login.password')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <a href="/forgot-password" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
                {t('login.forgotPassword')}
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-lg text-white font-semibold shadow-lg transition-all ${loading
                ? 'bg-slate-700 cursor-not-allowed opacity-60'
                : 'bg-purple-600 hover:bg-purple-700 transition-colors'
                }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('login.signingIn')}
                </span>
              ) : t('login.signIn')}
            </button>
          </form>

          {/* Debug information - can be toggled or removed in production */}
          {process.env.NODE_ENV !== 'production' && debugInfo && (
            <div className="mt-6 p-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-xs overflow-auto max-h-40">
              <details>
                <summary className="font-medium cursor-pointer text-gray-400 hover:text-gray-300 transition-colors">Debug Information</summary>
                <pre className="mt-2 whitespace-pre-wrap text-gray-500">{debugInfo}</pre>
              </details>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              {t('login.noAccount')}{' '}
              <a href="/register" className="text-purple-400 hover:text-purple-300 font-semibold transition-colors hover:underline">
                {t('login.signUp')}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
