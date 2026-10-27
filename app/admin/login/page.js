"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import "../admin.css";
import { getAdminSession } from "../session";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdminSession().then((authenticated) => {
      if (authenticated && !cancelled) {
        router.replace("/admin");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to sign in.");
      }

      router.replace("/admin");
    } catch (error) {
      setLoginError(error.message || "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
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

          <button
            type="submit"
            className="admin-primary-button"
            disabled={isSubmitting}
            aria-label={isSubmitting ? "Signing in" : undefined}
          >
            {isSubmitting ? <span className="admin-loading-dots" aria-hidden="true"><span /><span /><span /></span> : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
