import { useState } from "react";
import { apiRequest } from "../api";
import { InlineError } from "../components/Panel";

export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({
    username: "admin",
    password: "admin123",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest({
        method: "POST",
        url: "/auth/login",
        data: form,
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <div className="login-card">
        <h1>Dable Retail Suite</h1>
        <p>Invoice-first shop management (fully local)</p>
        <form onSubmit={submit} className="grid-form">
          <label>
            Username
            <input
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <InlineError message={error} />
          <small>Default credentials: `admin` / `admin123`</small>
        </form>
      </div>
    </main>
  );
}
