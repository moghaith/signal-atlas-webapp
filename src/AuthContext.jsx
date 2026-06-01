import { createContext, useCallback, useContext, useState } from "react";
import { login as apiLogin, createAccount as apiCreate } from "./data/profileService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sa_profile")) || null; }
    catch { return null; }
  });

  const login = useCallback(async (username, password) => {
    const data = await apiLogin({ username, password });
    const p = data.profile || data;
    setProfile(p);
    localStorage.setItem("sa_profile", JSON.stringify(p));
    return p;
  }, []);

  const register = useCallback(async (username, password, device_id) => {
    const p = await apiCreate({ username, password, device_id });
    setProfile(p);
    localStorage.setItem("sa_profile", JSON.stringify(p));
    return p;
  }, []);

  const logout = useCallback(() => {
    setProfile(null);
    localStorage.removeItem("sa_profile");
  }, []);

  const refreshProfile = useCallback((updated) => {
    setProfile(updated);
    localStorage.setItem("sa_profile", JSON.stringify(updated));
  }, []);

  return (
    <AuthContext.Provider value={{ profile, login, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
