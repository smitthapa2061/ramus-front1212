import axios from "axios";

const api = axios.create({
  baseURL: "https://test-back-8nbz.onrender.com/api",
  withCredentials: true,  // MUST BE HERE ONLY
  headers: {
    'Content-Type': 'application/json',
  }
});

export default api;

