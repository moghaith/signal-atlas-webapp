import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import logo from "../assets/logo_transparent_with_border.png";
import "./LoginPage.css";

export default function LoginPage({ onClose, onDone }) {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState("login"); // login | register

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (mode === "register") {
      if (!username.trim()) {
        setError("Username is required.");
        return;
      }

      if (!password) {
        setError("Password is required.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, username.trim());
      }

      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="lp-overlay" onClick={onClose}>
      <div className="lp-card" onClick={(e) => e.stopPropagation()}>

        {/* HEADER */}
        <div className="lp-header">
          <img src={logo} alt="Signal Atlas" className="lp-logo" />

          <h2 className="lp-title">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h2>

          <p className="lp-subtitle">
            {mode === "login"
              ? "Sign in to continue"
              : "Join Signal Atlas"}
          </p>
        </div>

        {/* FIELDS */}
        <div className="lp-fields">

          {/* EMAIL */}
          <div className="lp-field-group">
            <label className="lp-label">Email</label>
            <input
              className="lp-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Enter Email"
              autoFocus
              maxLength={100}
            />
          </div>

          {/* USERNAME (REGISTER ONLY) */}
          {mode === "register" && (
            <div className="lp-field-group">
              <label className="lp-label">Username</label>
              <input
                className="lp-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Choose a username"
                maxLength={50}
              />
            </div>
          )}

          {/* PASSWORD */}
          <div className="lp-field-group">
            <label className="lp-label">Password</label>

            <div className="lp-password-wrap">
              <input
                className="lp-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Enter Password"
              />

              <button
                type="button"
                className="lp-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* CONFIRM PASSWORD (REGISTER ONLY) */}
          {mode === "register" && (
            <div className="lp-field-group">
              <label className="lp-label">Confirm Password</label>

              <div className="lp-password-wrap">
                <input
                  className="lp-input"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Re-enter Password"
                />

                <button
                  type="button"
                  className="lp-password-toggle"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* ERROR */}
        {error && <div className="lp-error">{error}</div>}

        {/* SUBMIT */}
        <button
          className="lp-submit"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading
            ? mode === "login"
              ? "Signing in..."
              : "Creating account..."
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>

        {/* SWITCH MODE */}
        <div className="lp-switch">
          {mode === "login" ? (
            <button
              type="button"
              onClick={() => setMode("register")}
              className="lp-switch-btn"
            >
              New here? Create an account
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="lp-switch-btn"
            >
              Already have an account? Sign in
            </button>
          )}
        </div>

        {/* CLOSE */}
        <button className="lp-close" onClick={onClose}>
          ✕
        </button>

      </div>
    </div>
  );
}
