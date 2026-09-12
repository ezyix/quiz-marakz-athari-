"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import "../admin.css";
import { getAdminSession, saveAdminSession } from "../session";

const ADMIN_EMAIL = "admin@markazul.athari.com";
const ADMIN_PASSWORD = "10044";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (getAdminSession()) {
      router.replace("/admin");
    }
  }, [router]);

  const handleLogin = (event) => {
    event.preventDefault();

    if (email.trim().toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      setLoginError("Incorrect email or password.");
      return;
    }

    saveAdminSession();
    router.replace("/admin");
  };

  return (
    <main className="admin-login-page">

      <div className="admin-header">
                <div>
        <Image src="/logo.png" alt="logo" width="43" height="50" style={{ marginRight: "5px" }} /><Image src="/brand name.png" alt="Al Markazul Athari" width="130" height="40" />
                </div>
      </div>
       
      <div className="admin-login-card">
        <h1>Admin sign in</h1>
        <p className="admin-login-copy">Access the live quiz dashboard.</p>

        <form onSubmit={handleLogin} className="admin-login-form">
          <label htmlFor="admin-email">Email address</label>
          <input
            id="admin-email"
            type="email"
            value={email}
            placeholder="admin@markazul.athari.com"
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />

          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            placeholder="eg: 123456"
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {loginError && <p className="admin-form-error">{loginError}</p>}

          <button type="submit" className="admin-primary-button">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
