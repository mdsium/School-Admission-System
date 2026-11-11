import React, { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  ClassInfo,
  MyHold,
  User,
  AdminOverview,
  AdminApplication,
  getStoredToken,
  getStoredUser,
  saveAuthSession,
  clearAuthSession,
} from "./api";
import { fmt, useCountdown } from "./useCountdown";

const STORAGE_STUDENT_ID = "studentId";
const DEMO_STUDENT_ID = "20152691234567890";
const isValidId = (s: string) => /^\d{17}$/.test(s);
const errMsg = (e: unknown) =>
  e instanceof ApiError ? e.message : "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।";

type Tab =
  | "parent-dash"
  | "classes"
  | "mine"
  | "admin-dash"
  | "admin-classes"
  | "admin-apps"
  | "login"
  | "register";

// ── Helper: shift badge classname
const shiftClass = (shift: string) =>
  shift.includes("Day") ? "shift-day" : shift.includes("Evening") ? "shift-evening" : "shift-morning";

// ── Helper: shift icon
const shiftIcon = (shift: string) =>
  shift.includes("Day") ? "🌤️" : shift.includes("Evening") ? "🌙" : "🌅";

export default function App() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [studentId, setStudentId] = useState<string>(
    () => localStorage.getItem(STORAGE_STUDENT_ID) ?? ""
  );
  const [draftId, setDraftId] = useState(studentId);
  const [tab, setTab] = useState<Tab>(() => {
    const u = getStoredUser();
    if (u?.role === "Admin") return "admin-dash";
    if (u?.role === "Parent") return "parent-dash";
    return "classes";
  });
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [myHoldsCount, setMyHoldsCount] = useState<number>(0);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState<boolean>(false);

  const notify = useCallback((type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => {
    if (user?.mustChangePassword) setShowPasswordChangeModal(true);
    else setShowPasswordChangeModal(false);
  }, [user]);

  useEffect(() => {
    if (!isValidId(studentId)) { setMyHoldsCount(0); return; }
    let mounted = true;
    const fetch = async () => {
      try {
        const holds = await api.myHolds(studentId);
        if (mounted) setMyHoldsCount(holds.filter(h => h.status === "HELD" || h.status === "CONFIRMED").length);
      } catch { /* silent */ }
    };
    fetch();
    const t = setInterval(fetch, 6000);
    return () => { mounted = false; clearInterval(t); };
  }, [studentId]);

  const handleSaveStudentId = (id: string) => {
    localStorage.setItem(STORAGE_STUDENT_ID, id);
    setStudentId(id);
    setDraftId(id);
    notify("ok", `শিক্ষার্থী নম্বর সেট: ${id}`);
  };

  const handleLogout = () => {
    clearAuthSession();
    setUser(null);
    setTab("classes");
    notify("ok", "সফলভাবে লগআউট হয়েছে।");
  };

  const userInitial = (user?.fullName || user?.username || "?").charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      {/* ── TOP NAVBAR ── */}
      <header className="app-header">
        <div className="header-inner">
          {/* Brand */}
          <div className="brand">
            <div className="brand-text">
              <h1>School Admission</h1>
              <small>অনলাইন ভর্তি ব্যবস্থাপনা সিস্টেম</small>
            </div>
          </div>

          {/* Live pill */}
          <div className="live-pill">
            <span className="pulse-dot" />
            সিস্টেম সক্রিয়
          </div>

          {/* Auth controls */}
          <div className="header-actions">
            {user ? (
              <>
                <div className="user-chip">
                  <div className={`user-avatar ${user.role.toLowerCase()}`}>{userInitial}</div>
                  <span className="user-chip-name">{user.fullName || user.username}</span>
                  <span className={`role-pill role-${user.role.toLowerCase()}`}>{user.role}</span>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: "#94a3b8" }} onClick={handleLogout}>
                  লগআউট
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" style={{ color: "#94a3b8", border: "1px solid rgb(255 255 255 / 0.15)" }} onClick={() => setTab("login")}>
                   লগইন
                </button>
                {/* <button className="btn btn-primary btn-sm" onClick={() => setTab("register")}>
                  📝 রেজিস্ট্রেশন
                </button> */}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── STUDENT ID BAR (Parent / Public) ── */}
      {(!user || user.role === "Parent") && (
        <div className="student-id-bar">
          <div className="student-id-inner">
            <span className="student-id-label">👤 শিক্ষার্থী আইডি (১৭ অঙ্কের জন্ম নিবন্ধন):</span>
            <div className="student-id-input-row">
              <input
                id="sid"
                className="student-id-input"
                inputMode="numeric"
                maxLength={17}
                value={draftId}
                onChange={e => setDraftId(e.target.value.replace(/\D/g, ""))}
                placeholder="যেমন: 20152691234567890"
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={!isValidId(draftId) || draftId === studentId}
                onClick={() => handleSaveStudentId(draftId)}
              >
                সেট করুন
              </button>
              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => { setDraftId(DEMO_STUDENT_ID); handleSaveStudentId(DEMO_STUDENT_ID); }}
              >
                ডেমো নম্বর
              </button>
              {isValidId(studentId) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "#64748b", fontSize: "11px" }}
                  onClick={() => { localStorage.removeItem(STORAGE_STUDENT_ID); setStudentId(""); setDraftId(""); }}
                >
                  রিসেট
                </button>
              )}
            </div>
            <span className={`id-status ${draftId.length > 0 && !isValidId(draftId) ? "warn" : isValidId(studentId) ? "ok" : "hint"}`}>
              {draftId.length > 0 && !isValidId(draftId)
                ? `⚠ ${draftId.length}/১৭ অঙ্ক`
                : isValidId(studentId)
                ? `✓ ${studentId}`
                : "আইডি সেট নেই"}
            </span>
          </div>
        </div>
      )}

      {/* ── NAV TABS ── */}
      {tab !== "login" && tab !== "register" && (
        <div className="tabs-wrapper">
          <div className="tabs-inner">
            <nav className="tabs-nav" aria-label="নেভিগেশন">
              {user?.role === "Admin" ? (
                <>
                  <button className={`tab-btn ${tab === "admin-dash" ? "active" : ""}`} onClick={() => setTab("admin-dash")}>
                    📊 Dashboard
                  </button>
                  <button className={`tab-btn ${tab === "admin-classes" ? "active" : ""}`} onClick={() => setTab("admin-classes")}>
                    ⚙️ Class ও Shift
                  </button>
                  <button className={`tab-btn ${tab === "admin-apps" ? "active" : ""}`} onClick={() => setTab("admin-apps")}>
                    📑 আবেদনসমূহ
                  </button>
                  <a className="tab-btn" href="http://localhost:8080/swagger" target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1" }}>
                    📖 API Docs
                  </a>
                </>
              ) : (
                <>
                  {user?.role === "Parent" && (
                    <button className={`tab-btn ${tab === "parent-dash" ? "active" : ""}`} onClick={() => setTab("parent-dash")}>
                      🏠 Dashboard
                    </button>
                  )}
                  <button className={`tab-btn ${tab === "classes" ? "active" : ""}`} onClick={() => setTab("classes")}>
                    📋 শ্রেণি ও আসন
                  </button>
                  <button className={`tab-btn ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>
                    🎓 আমার আবেদন
                    {myHoldsCount > 0 && <span className="tab-badge">{myHoldsCount}</span>}
                  </button>
                  {/* {!user && (
                    <button className={`tab-btn tab-btn--highlight ${tab === "admin-classes" ? "active" : ""}`} onClick={() => setTab("admin-classes")}>
                      ⚙️ Class তৈরি
                    </button>
                  )} */}
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className="toast-container">
          <div className={`toast-bar ${toast.type}`} role="alert">
            <span className="toast-icon">{toast.type === "ok" ? "✓" : "✕"}</span>
            <span style={{ flex: 1 }}>{toast.text}</span>
            <button className="toast-close" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}

      {/* ── MANDATORY PASSWORD CHANGE ── */}
      {showPasswordChangeModal && (
        <ChangePasswordModal
          user={user!}
          onSuccess={updatedUser => {
            setUser(updatedUser);
            setShowPasswordChangeModal(false);
            notify("ok", "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।");
          }}
        />
      )}

      {/* ── VIEWS ── */}
      {tab === "login" && (
        <LoginView
          onSuccess={auth => {
            saveAuthSession(auth);
            setUser(auth.user);
            notify("ok", `স্বাগতম, ${auth.user.fullName || auth.user.username}!`);
            if (auth.user.mustChangePassword) setShowPasswordChangeModal(true);
            setTab(auth.user.role === "Admin" ? "admin-dash" : "parent-dash");
          }}
          goRegister={() => setTab("register")}
        />
      )}

      {tab === "register" && (
        <RegisterView
          onSuccess={auth => {
            saveAuthSession(auth);
            setUser(auth.user);
            notify("ok", "রেজিস্ট্রেশন সফল! স্বাগতম।");
            setTab("parent-dash");
          }}
          goLogin={() => setTab("login")}
        />
      )}

      {tab !== "login" && tab !== "register" && (
        <div className="page-content">
          {tab === "parent-dash" && (
            <ParentDashboard
              user={user}
              studentId={studentId}
              goClasses={() => setTab("classes")}
              goMine={() => setTab("mine")}
              notify={notify}
            />
          )}
          {tab === "classes" && (
            <ClassList
              studentId={isValidId(studentId) ? studentId : ""}
              notify={notify}
              goMine={() => setTab("mine")}
              goSetId={() => document.getElementById("sid")?.focus()}
            />
          )}
          {tab === "mine" && (
            <MyHoldsView
              studentId={isValidId(studentId) ? studentId : ""}
              notify={notify}
              goClasses={() => setTab("classes")}
            />
          )}
          {tab === "admin-dash" && (
            <AdminDashboard
              goClasses={() => setTab("admin-classes")}
              goApps={() => setTab("admin-apps")}
              notify={notify}
            />
          )}
          {tab === "admin-classes" && <AdminClassesView notify={notify} />}
          {tab === "admin-apps" && <AdminApplicationsView notify={notify} />}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 1. AUTH VIEWS
// ============================================================

function LoginView({ onSuccess, goRegister }: { onSuccess: (auth: any) => void; goRegister: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login({ username, password });
      onSuccess(res);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">🔑</div>
          <h2 className="auth-title">সিস্টেমে লগইন করুন</h2>
          <p className="auth-subtitle">Parent বা Admin হিসেবে আপনার অ্যাকাউন্টে প্রবেশ করুন।</p>

          {error && <div className="error-box mb-16">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">ইউজারনেম</label>
              <input className="form-input" type="text" required autoFocus value={username}
                onChange={e => setUsername(e.target.value)} placeholder="admin বা parent username" />
            </div>
            <div className="form-group">
              <label className="form-label">পাসওয়ার্ড</label>
              <input className="form-input" type="password" required value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button className="btn btn-primary btn-lg btn-full" style={{ marginTop: 8 }} disabled={loading}>
              {loading ? "লগইন হচ্ছে…" : "লগইন করুন →"}
            </button>
          </form>

          <div className="auth-demo-box">
            <strong>⚡ ডেমো অ্যাকাউন্ট</strong>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Admin: <code>admin</code> / <code>1234</code></span>
              <button type="button" className="btn-outline-sm"
                onClick={() => { setUsername("admin"); setPassword("1234"); }}>
                অটো-ফিল
              </button>
            </div>
          </div>

          <div className="auth-link-row">
            নতুন অভিভাবক?{" "}
            <button type="button" className="auth-link" onClick={goRegister}>
              অ্যাকাউন্ট তৈরি করুন →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisterView({ onSuccess, goLogin }: { onSuccess: (auth: any) => void; goLogin: () => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.register({ fullName, username, email, password, phoneNumber: phoneNumber || undefined });
      onSuccess(res);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container" style={{ maxWidth: 480 }}>
        <div className="auth-card">
          <div className="auth-logo">📝</div>
          <h2 className="auth-title">অভিভাবক রেজিস্ট্রেশন</h2>
          <p className="auth-subtitle">সন্তানের অনলাইন ভর্তির আবেদন করতে নিবন্ধন করুন।</p>

          {error && <div className="error-box mb-16">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">পূর্ণ নাম *</label>
              <input className="form-input" type="text" required autoFocus value={fullName}
                onChange={e => setFullName(e.target.value)} placeholder="মোঃ রফিকুল ইসলাম" />
            </div>
            <div className="form-group">
              <label className="form-label">ইউজারনেম *</label>
              <input className="form-input" type="text" required value={username}
                onChange={e => setUsername(e.target.value)} placeholder="rofiqul123" />
            </div>
            <div className="form-group">
              <label className="form-label">ইমেইল *</label>
              <input className="form-input" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} placeholder="parent@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">মোবাইল নম্বর (ঐচ্ছিক)</label>
              <input className="form-input" type="tel" value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)} placeholder="01700000000" />
            </div>
            <div className="form-group">
              <label className="form-label">পাসওয়ার্ড * (কমপক্ষে ৪ অক্ষর)</label>
              <input className="form-input" type="password" required minLength={4} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button className="btn btn-primary btn-lg btn-full" style={{ marginTop: 8 }} disabled={loading}>
              {loading ? "নিবন্ধন হচ্ছে…" : "অ্যাকাউন্ট তৈরি করুন →"}
            </button>
          </form>

          <div className="auth-link-row">
            ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
            <button type="button" className="auth-link" onClick={goLogin}>
              লগইন করুন →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ user, onSuccess }: { user: User; onSuccess: (u: User) => void }) {
  const [currentPassword, setCurrentPassword] = useState(user.username === "admin" ? "1234" : "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError("নতুন পাসওয়ার্ড দুটি মিলছে না।"); return; }
    setError(null); setLoading(true);
    try {
      const updated = await api.changePassword({ currentPassword, newPassword });
      onSuccess(updated);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header" style={{ background: "#fef2f2", borderBottomColor: "#fecaca" }}>
          <h3 style={{ color: "#b91c1c" }}>⚠️ ডিফল্ট পাসওয়ার্ড পরিবর্তন আবশ্যক</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
              সুরক্ষার স্বার্থে ডিফল্ট পাসওয়ার্ড (<code>1234</code>) পরিবর্তন করে নতুন পাসওয়ার্ড সেট করুন।
            </p>
            {error && <div className="error-box mb-16">{error}</div>}
            <div className="form-group">
              <label className="form-label">বর্তমান পাসওয়ার্ড</label>
              <input className="form-input" type="password" required value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">নতুন পাসওয়ার্ড</label>
              <input className="form-input" type="password" required minLength={4} value={newPassword}
                onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="form-group">
              <label className="form-label">নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
              <input className="form-input" type="password" required minLength={4} value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "সংরক্ষণ হচ্ছে…" : "পাসওয়ার্ড পরিবর্তন করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// 2. PARENT DASHBOARD
// ============================================================

function ParentDashboard({ user, studentId, goClasses, goMine, notify }: {
  user: User | null; studentId: string;
  goClasses: () => void; goMine: () => void;
  notify: (type: "ok" | "err", text: string) => void;
}) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [holds, setHolds] = useState<MyHold[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cls = await api.listClasses();
        const myH = isValidId(studentId) ? await api.myHolds(studentId) : [];
        if (active) { setClasses(cls); setHolds(myH); }
      } catch (err) { if (active) notify("err", errMsg(err)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [studentId, notify]);

  const activeHolds = holds.filter(h => h.status === "HELD");
  const confirmedHolds = holds.filter(h => h.status === "CONFIRMED");
  const totalAvailable = classes.reduce((s, c) => s + c.availableSeats, 0);

  return (
    <div>
      {/* Hero */}
      <div className="hero-card parent-hero">
        <div className="hero-title">🌿 স্বাগতম, {user?.fullName || "অভিভাবক"}!</div>
        <div className="hero-subtitle">আপনার সন্তানের জন্য পছন্দের শ্রেণিতে সহজেই আসন সংরক্ষণ করুন।</div>
      </div>

      {/* KPI */}
      <div className="stats-grid">
        <div className="stat-card" style={{ "--stat-accent": "var(--warning)" } as any}>
          <div className="stat-icon" style={{ background: "var(--warning-light)" }}>⏳</div>
          <div className="stat-body">
            <div className="stat-val">{loading ? "…" : activeHolds.length}</div>
            <div className="stat-label">চলমান Hold</div>
          </div>
        </div>
        <div className="stat-card" style={{ "--stat-accent": "var(--success)" } as any}>
          <div className="stat-icon" style={{ background: "var(--success-light)" }}>🎓</div>
          <div className="stat-body">
            <div className="stat-val">{loading ? "…" : confirmedHolds.length}</div>
            <div className="stat-label">নিশ্চিত ভর্তি</div>
          </div>
        </div>
        <div className="stat-card" style={{ "--stat-accent": "var(--accent)" } as any}>
          <div className="stat-icon" style={{ background: "var(--accent-light)" }}>🪑</div>
          <div className="stat-body">
            <div className="stat-val">{loading ? "…" : totalAvailable}</div>
            <div className="stat-label">মোট খালি আসন</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#f1f5f9" }}>🏫</div>
          <div className="stat-body">
            <div className="stat-val">{loading ? "…" : classes.length}</div>
            <div className="stat-label">সক্রিয় শ্রেণি</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="action-grid">
        <div className="action-card">
          <div className="action-card-icon" style={{ background: "#eef2ff" }}>📋</div>
          <h3>ভর্তি আবেদন করুন</h3>
          <p>খালি আসনের ভিত্তিতে সকাল, দিন বা সান্ধ্য শিফটে তাৎক্ষণিক সিট বুকিং দিন।</p>
          <button className="btn btn-primary" onClick={goClasses}>
            শ্রেণি ও আসন তালিকা →
          </button>
        </div>
        <div className="action-card">
          <div className="action-card-icon" style={{ background: "var(--success-light)" }}>🎓</div>
          <h3>চলমান আবেদন ও রশিদ</h3>
          <p>সংরক্ষিত আসনের মেয়াদ দেখুন, নিশ্চিত করুন অথবা ভর্তির রশিদ ডাউনলোড করুন।</p>
          <button className="btn btn-secondary" onClick={goMine}>
            আমার আবেদন ({holds.length}) →
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 3. ADMIN DASHBOARD & VIEWS
// ============================================================

function AdminDashboard({ goClasses, goApps, notify }: {
  goClasses: () => void; goApps: () => void;
  notify: (type: "ok" | "err", text: string) => void;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      try {
        const data = await api.adminOverview();
        if (active) setOverview(data);
      } catch (err) { if (active) notify("err", errMsg(err)); }
      finally { if (active) setLoading(false); }
    };
    fetch();
    const t = setInterval(fetch, 6000);
    return () => { active = false; clearInterval(t); };
  }, [notify]);

  const kpi = (val: number | undefined | null) => loading ? "…" : (val ?? 0);

  return (
    <div>
      {/* Hero */}
      <div className="hero-card admin-hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="hero-title">📊 Admin Dashboard</div>
            <div className="hero-subtitle">সকল শ্রেণি, শিফট, আসন ও রিয়েল-টাইম ভর্তি কার্যক্রম তদারকি করুন।</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={goClasses}>➕ নতুন Class</button>
            <a className="btn btn-sm" style={{ background: "rgb(255 255 255 / 0.12)", color: "#fff", border: "1px solid rgb(255 255 255 / 0.2)" }}
              href="http://localhost:8080/swagger" target="_blank" rel="noopener noreferrer">
              📖 API Docs
            </a>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="stats-grid">
        {[
          { icon: "🏫", bg: "#e0e7ff", label: "সক্রিয় ক্লাস", val: kpi(overview?.totalClasses), accent: "var(--primary)" },
          { icon: "☀️", bg: "var(--warning-light)", label: "শিফট সংখ্যা", val: kpi(overview?.totalShifts), accent: "var(--warning)" },
          { icon: "🪑", bg: "#f1f5f9", label: "মোট আসন", val: kpi(overview?.totalSeats), accent: "var(--text-muted)" },
          { icon: "⏳", bg: "var(--danger-light)", label: "Hold আসন", val: kpi(overview?.heldSeats), accent: "var(--danger)" },
          { icon: "✅", bg: "var(--success-light)", label: "নিশ্চিত ভর্তি", val: kpi(overview?.confirmedSeats), accent: "var(--success)" },
          { icon: "🟢", bg: "var(--accent-light)", label: "খালি আসন", val: kpi(overview?.availableSeats), accent: "var(--accent)" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ "--stat-accent": s.accent } as any}>
            <div className="stat-icon" style={{ background: s.bg }}>{s.icon}</div>
            <div className="stat-body">
              <div className="stat-val">{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="action-grid">
        <div className="action-card">
          <div className="action-card-icon" style={{ background: "#eef2ff" }}>⚙️</div>
          <h3>Class ও Shift পরিচালনা</h3>
          <p>শ্রেণি তৈরি করুন, মর্নিং/ডে/সান্ধ্য শিফট নির্ধারণ করুন এবং আসন কোটা পরিবর্তন করুন।</p>
          <button className="btn btn-secondary" onClick={goClasses}>শ্রেণি তালিকা →</button>
        </div>
        <div className="action-card">
          <div className="action-card-icon" style={{ background: "var(--success-light)" }}>📑</div>
          <h3>আবেদনসমূহ (Applications)</h3>
          <p>শিক্ষার্থীদের আইডি, অভিভাবকের নাম ও রিয়েল-টাইম স্ট্যাটাস যাচাই করুন।</p>
          <button className="btn btn-secondary" onClick={goApps}>
            সকল আবেদন ({overview?.totalApplications ?? 0}) →
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminClassesView({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);

  const fetchClasses = useCallback(async () => {
    try {
      const data = await api.listClasses();
      setClasses(data);
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchClasses();
    const t = setInterval(fetchClasses, 6000);
    return () => clearInterval(t);
  }, [fetchClasses]);

  return (
    <div>
      {/* Create form card */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div>
            <div className="section-title">➕ নতুন Class ও Shift তৈরি করুন</div>
            <div className="section-desc">শ্রেণির নাম, শিফট এবং আসন সংখ্যা নির্ধারণ করুন।</div>
          </div>
        </div>
        <CreateClassInline onSuccess={() => { fetchClasses(); notify("ok", "নতুন ক্লাস/শিফট তৈরি হয়েছে।"); }} />
      </div>

      {/* Classes table */}
      <div className="card-flat">
        <div className="card-header">
          <div>
            <h2>🏫 Class ও Shift তালিকা</h2>
            <p className="text-sm text-muted" style={{ marginTop: 2 }}>প্রতিটি শ্রেণির আসন সংখ্যা ও বর্তমান অবস্থা।</p>
          </div>
          <div className="live-pill" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
            <span className="pulse-dot" />
            <span style={{ color: "var(--success-dark)", fontSize: 11 }}>Auto-refresh</span>
          </div>
        </div>

        {loading ? (
          <div className="center-box">তথ্য লোড হচ্ছে…</div>
        ) : classes.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🏫</span>
            <h3>কোনো শ্রেণি নেই</h3>
            <p>উপরের ফর্ম দিয়ে প্রথম শ্রেণি তৈরি করুন।</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>শ্রেণির নাম</th>
                  <th>শিফট</th>
                  <th style={{ textAlign: "center" }}>মোট আসন</th>
                  <th style={{ textAlign: "center" }}>Hold</th>
                  <th style={{ textAlign: "center" }}>নিশ্চিত</th>
                  <th style={{ textAlign: "center" }}>খালি</th>
                  <th style={{ textAlign: "center" }}>অ্যাকশন</th>
                </tr>
              </thead>
              <tbody>
                {classes.map(c => {
                  const shift = c.shift || "Morning Shift";
                  const rawName = c.name.replace(/ - (Morning Shift|Day Shift|Evening Shift)/, "");
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, color: "var(--text-main)" }}>{rawName}</td>
                      <td>
                        <span className={`shift-badge ${shiftClass(shift)}`}>
                          {shiftIcon(shift)} {shift}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 600 }}>{c.totalSeats}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ color: c.heldSeats > 0 ? "var(--warning)" : "var(--text-faint)", fontWeight: 600 }}>
                          {c.heldSeats}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ color: c.confirmedSeats > 0 ? "var(--success)" : "var(--text-faint)", fontWeight: 600 }}>
                          {c.confirmedSeats}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`seat-pill ${c.availableSeats > 0 ? "available" : "full"}`}>
                          {c.availableSeats}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => setEditingClass(c)}>
                          ✏️ এডিট
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingClass && (
        <EditClassModal
          cls={editingClass}
          onClose={() => setEditingClass(null)}
          onSuccess={() => { setEditingClass(null); fetchClasses(); notify("ok", "ক্লাস আপডেট হয়েছে।"); }}
        />
      )}
    </div>
  );
}

function CreateClassInline({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [shift, setShift] = useState("Morning Shift");
  const [totalSeats, setTotalSeats] = useState("60");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const seats = parseInt(totalSeats, 10);
    if (isNaN(seats) || seats <= 0) { setError("আসন সংখ্যা ০-এর বেশি হতে হবে।"); return; }
    setError(null); setLoading(true);
    try {
      await api.adminCreateClass(name, shift, seats);
      setName(""); setTotalSeats("60"); onSuccess();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error-box mb-16">{error}</div>}
      <div className="inline-form-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Class-এর নাম *</label>
          <input className="form-input" type="text" required value={name}
            onChange={e => setName(e.target.value)} placeholder="যেমন: Class 6" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">শিফট</label>
          <select className="form-input form-select" value={shift} onChange={e => setShift(e.target.value)}>
            <option value="Morning Shift">🌅 Morning Shift (প্রভাতি)</option>
            <option value="Day Shift">🌤️ Day Shift (দিবা)</option>
            <option value="Evening Shift">🌙 Evening Shift (সান্ধ্য)</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">মোট আসন</label>
          <input className="form-input" type="number" required min={1} value={totalSeats}
            onChange={e => setTotalSeats(e.target.value)} placeholder="120" />
        </div>
        <button className="btn btn-primary" style={{ height: 42, alignSelf: "flex-end" }}
          disabled={loading || !name.trim()}>
          {loading ? "তৈরি হচ্ছে…" : "তৈরি করুন"}
        </button>
      </div>
    </form>
  );
}

function EditClassModal({ cls, onClose, onSuccess }: { cls: ClassInfo; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(cls.name.replace(/ - (Morning Shift|Day Shift|Evening Shift)/, ""));
  const [shift, setShift] = useState(cls.shift || "Morning Shift");
  const [totalSeats, setTotalSeats] = useState(cls.totalSeats.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const seats = parseInt(totalSeats, 10);
    if (isNaN(seats) || seats <= 0) { setError("আসন সংখ্যা ০-এর বেশি হতে হবে।"); return; }
    setError(null); setLoading(true);
    try {
      await api.adminUpdateClass(cls.id, name, shift, seats);
      onSuccess();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>✏️ Class সম্পাদনা</h3>
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-box mb-16">{error}</div>}
            <div className="form-group">
              <label className="form-label">Class-এর নাম</label>
              <input className="form-input" type="text" required value={name}
                onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">শিফট</label>
              <select className="form-input form-select" value={shift} onChange={e => setShift(e.target.value)}>
                <option value="Morning Shift">🌅 Morning Shift (প্রভাতি)</option>
                <option value="Day Shift">🌤️ Day Shift (দিবা)</option>
                <option value="Evening Shift">🌙 Evening Shift (সান্ধ্য)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">মোট আসন (সক্রিয়: {cls.heldSeats + cls.confirmedSeats})</label>
              <input className="form-input" type="number" required min={cls.heldSeats + cls.confirmedSeats}
                value={totalSeats} onChange={e => setTotalSeats(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>বাতিল</button>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "আপডেট হচ্ছে…" : "সংরক্ষণ করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminApplicationsView({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [apps, setApps] = useState<AdminApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchApps = useCallback(async () => {
    try {
      const data = await api.adminApplications(statusFilter === "ALL" ? undefined : statusFilter);
      setApps(data);
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, notify]);

  useEffect(() => {
    fetchApps();
    const t = setInterval(fetchApps, 6000);
    return () => clearInterval(t);
  }, [fetchApps]);

  const filtered = apps.filter(a => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return a.studentId.includes(term) || (a.parentName && a.parentName.toLowerCase().includes(term));
  });

  const statusLabels: Record<string, string> = {
    ALL: "সকল", HELD: "HELD", CONFIRMED: "CONFIRMED", EXPIRED: "EXPIRED", CANCELLED: "CANCELLED"
  };

  return (
    <div>
      <div className="card-flat">
        <div className="card-header">
          <div>
            <h2>📑 সকল ভর্তির আবেদন</h2>
            <p className="text-sm text-muted" style={{ marginTop: 2 }}>
              রিয়েল-টাইমে সকল শিক্ষার্থীর আবেদনের অবস্থা।
            </p>
          </div>
          <div className="live-pill" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
            <span className="pulse-dot" />
            <span style={{ color: "var(--success-dark)", fontSize: 11 }}>Live</span>
          </div>
        </div>

        <div className="card-body">
          {/* Filters */}
          <div className="filter-bar">
            {["ALL", "HELD", "CONFIRMED", "EXPIRED", "CANCELLED"].map(st => (
              <button key={st} className={`filter-pill ${statusFilter === st ? "active" : ""}`}
                onClick={() => setStatusFilter(st)}>
                {statusLabels[st]}
              </button>
            ))}
          </div>

          {/* Search */}
          <input className="form-input" type="text" style={{ maxWidth: 400, marginBottom: 16 }}
            placeholder="🔍 শিক্ষার্থী আইডি বা অভিভাবকের নাম…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />

          {loading ? (
            <div className="center-box">আবেদন লোড হচ্ছে…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📋</span>
              <h3>কোনো আবেদন নেই</h3>
              <p>অনুসন্ধানের ফলাফল খালি।</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Hold ID</th>
                    <th>শিক্ষার্থী আইডি</th>
                    <th>Class ও Shift</th>
                    <th>অভিভাবক</th>
                    <th style={{ textAlign: "center" }}>স্ট্যাটাস</th>
                    <th>সময়</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.holdId}>
                      <td><code style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{a.holdId.slice(0, 12)}…</code></td>
                      <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{a.studentId}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{a.className}</div>
                        <span className={`shift-badge ${shiftClass(a.shift || "")}`} style={{ marginTop: 2 }}>
                          {a.shift}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{a.parentName || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`status-badge ${a.status}`}>{a.status}</span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {a.status === "CONFIRMED" && a.confirmedAt
                          ? `✅ ${new Date(a.confirmedAt).toLocaleString("bn-BD")}`
                          : `⏱ ${new Date(a.expiresAt).toLocaleTimeString("bn-BD")}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4. CLASS LIST (Parent / Public)
// ============================================================

function ClassList({ studentId, notify, goMine, goSetId }: {
  studentId: string;
  notify: (type: "ok" | "err", text: string) => void;
  goMine: () => void;
  goSetId: () => void;
}) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const fetchClasses = useCallback(async () => {
    try {
      const data = await api.listClasses();
      setClasses(data); setError(null);
    } catch {
      setError("Server-এর সাথে যোগাযোগ করা যাচ্ছে না।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
    const t = setInterval(fetchClasses, 5000);
    return () => clearInterval(t);
  }, [fetchClasses]);

  const handleApply = async (classId: string, className: string) => {
    if (!studentId) { notify("err", "আগে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর সেট করুন।"); goSetId(); return; }
    setApplying(classId);
    try {
      await api.apply(classId, studentId);
      notify("ok", `"${className}"-এ আসন সাময়িকভাবে সংরক্ষিত হয়েছে! মেয়াদ শেষের আগেই নিশ্চিত করুন।`);
      fetchClasses(); goMine();
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="card-flat">
      <div className="card-header">
        <div>
          <h2>📋 উপলব্ধ শ্রেণির তালিকা</h2>
          <p className="text-sm text-muted" style={{ marginTop: 2 }}>
            আগে আবেদন করলে আগে পাবেন — আবেদন করলে নির্দিষ্ট সময়ের জন্য আসন hold থাকবে।
          </p>
        </div>
        <div className="live-pill" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
          <span className="pulse-dot" />
          <span style={{ color: "var(--success-dark)", fontSize: 11 }}>Auto-refresh 5s</span>
        </div>
      </div>

      {error && (
        <div className="card-body">
          <div className="error-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{error}</span>
            <button className="btn btn-secondary btn-xs" onClick={fetchClasses}>আবার চেষ্টা করুন</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="center-box">শ্রেণির তথ্য লোড হচ্ছে…</div>
      ) : classes.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🏫</span>
          <h3>কোনো শ্রেণি পাওয়া যায়নি</h3>
        </div>
      ) : (
        <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>শ্রেণি ও শিফট</th>
                <th style={{ textAlign: "center" }}>মোট</th>
                <th style={{ textAlign: "center" }}>Hold</th>
                <th style={{ textAlign: "center" }}>নিশ্চিত</th>
                <th style={{ textAlign: "center" }}>খালি</th>
                <th style={{ textAlign: "center" }}>আবেদন</th>
              </tr>
            </thead>
            <tbody>
              {classes.map(c => {
                const shift = c.shift || "Morning Shift";
                const rawName = c.name.replace(/ - (Morning Shift|Day Shift|Evening Shift)/, "");
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-main)" }}>{rawName}</div>
                      <span className={`shift-badge ${shiftClass(shift)}`} style={{ marginTop: 3 }}>
                        {shiftIcon(shift)} {shift}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600, color: "var(--text-secondary)" }}>{c.totalSeats}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ color: c.heldSeats > 0 ? "var(--warning)" : "var(--text-faint)", fontWeight: 600 }}>
                        {c.heldSeats}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ color: c.confirmedSeats > 0 ? "var(--success)" : "var(--text-faint)", fontWeight: 600 }}>
                        {c.confirmedSeats}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`seat-pill ${c.availableSeats > 0 ? "available" : "full"}`}>
                        {c.availableSeats}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className={`btn ${c.availableSeats > 0 ? "btn-primary" : "btn-secondary"} btn-sm`}
                        disabled={c.availableSeats === 0 || applying === c.id}
                        onClick={() => handleApply(c.id, rawName)}
                      >
                        {applying === c.id ? "বুকিং…" : c.availableSeats === 0 ? "Seat নেই" : "আবেদন করুন"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 5. MY HOLDS & COUNTDOWN
// ============================================================

function MyHoldsView({ studentId, notify, goClasses }: {
  studentId: string;
  notify: (type: "ok" | "err", text: string) => void;
  goClasses: () => void;
}) {
  const [holds, setHolds] = useState<MyHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<MyHold | null>(null);

  const fetchHolds = useCallback(async () => {
    if (!studentId) { setHolds([]); setLoading(false); return; }
    try {
      const data = await api.myHolds(studentId);
      setHolds(data);
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [studentId, notify]);

  useEffect(() => {
    fetchHolds();
    const t = setInterval(fetchHolds, 5000);
    return () => clearInterval(t);
  }, [fetchHolds]);

  if (!studentId) {
    return (
      <div className="card">
        <div className="empty-state">
          <span className="empty-state-icon">🪪</span>
          <h3>শিক্ষার্থীর আইডি সেট নেই</h3>
          <p>পেজের উপরের ঘরে ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখে "সেট করুন" চাপুন।</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card-flat">
        <div className="card-header">
          <div>
            <h2>🎓 আমার আবেদনসমূহ</h2>
            <p className="text-sm text-muted" style={{ marginTop: 2 }}>
              শিক্ষার্থী আইডি: <code>{studentId}</code>
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={goClasses}>
            ➕ নতুন আবেদন
          </button>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="center-box">আবেদনের তথ্য লোড হচ্ছে…</div>
          ) : holds.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📭</span>
              <h3>কোনো আবেদন নেই</h3>
              <p>এই শিক্ষার্থীর নামে কোনো আবেদন পাওয়া যায়নি।</p>
              <button className="btn btn-primary" onClick={goClasses}>শ্রেণি তালিকা থেকে আবেদন করুন →</button>
            </div>
          ) : (
            <div>
              {holds.map(h => (
                <HoldCard key={h.holdId} hold={h} studentId={studentId}
                  notify={notify} onRefresh={fetchHolds}
                  onViewSlip={() => setSelectedSlip(h)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedSlip && (
        <AdmissionSlipModal hold={selectedSlip} studentId={studentId} onClose={() => setSelectedSlip(null)} />
      )}
    </div>
  );
}

function HoldCard({ hold, studentId, notify, onRefresh, onViewSlip }: {
  hold: MyHold; studentId: string;
  notify: (type: "ok" | "err", text: string) => void;
  onRefresh: () => void; onViewSlip: () => void;
}) {
  const remainingSeconds = useCountdown(hold.expiresAt);
  const isExpired = remainingSeconds <= 0;
  const [processing, setProcessing] = useState(false);
  const effectiveStatus = hold.status === "HELD" && isExpired ? "EXPIRED" : hold.status;

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      await api.confirm(hold.holdId, studentId);
      notify("ok", "ভর্তি ফি সফলভাবে জমা হয়েছে! আসন নিশ্চিত করা হয়েছে।");
      onRefresh();
    } catch (err) { notify("err", errMsg(err)); }
    finally { setProcessing(false); }
  };

  const handleCancel = async () => {
    if (!confirm("আপনি কি নিশ্চিতভাবে আসনটি বাতিল করতে চান?")) return;
    setProcessing(true);
    try {
      await api.cancel(hold.holdId, studentId);
      notify("ok", "আসন সংরক্ষণ বাতিল করা হয়েছে।");
      onRefresh();
    } catch (err) { notify("err", errMsg(err)); }
    finally { setProcessing(false); }
  };

  return (
    <div className={`hold-card ${effectiveStatus}`}>
      <div className="hold-card-stripe" />
      <div className="hold-card-body">
        <div>
          <div className="hold-class-name">{hold.className}</div>
          <div className="hold-id-line">Hold ID: <code>{hold.holdId}</code></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className={`status-badge ${effectiveStatus}`}>{effectiveStatus}</span>
          {effectiveStatus === "HELD" && (
            <span className={`countdown-timer ${remainingSeconds < 60 ? "urgent" : ""}`}>
              ⏱️ {fmt(remainingSeconds)}
            </span>
          )}
        </div>
      </div>
      <div className="hold-card-actions">
        {effectiveStatus === "HELD" && (
          <>
            <button className="btn btn-danger-outline btn-sm" disabled={processing} onClick={handleCancel}>
              বাতিল
            </button>
            <button className="btn btn-success btn-sm" disabled={processing || isExpired} onClick={handleConfirm}>
              {processing ? "প্রক্রিয়াকরণ…" : "✅ ভর্তি নিশ্চিত করুন"}
            </button>
          </>
        )}
        {effectiveStatus === "CONFIRMED" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onViewSlip}>
            🧾 ভর্তি রশিদ দেখুন
          </button>
        )}
        {(effectiveStatus === "EXPIRED" || effectiveStatus === "CANCELLED") && (
          <span className="text-muted text-sm">— এই আবেদনটি আর সক্রিয় নেই।</span>
        )}
      </div>
    </div>
  );
}

function AdmissionSlipModal({ hold, studentId, onClose }: { hold: MyHold; studentId: string; onClose: () => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>🎓 ভর্তি নিশ্চিতকরণ রশিদ</h3>
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="receipt-header">
            <div style={{ fontSize: 36 }}>🏫</div>
            <h4>অনলাইন স্কুল ভর্তি ব্যবস্থা</h4>
            <span className="status-badge CONFIRMED" style={{ marginTop: 6 }}>✅ ভর্তি সফল ও নিশ্চিত</span>
          </div>
          <div>
            {[
              ["শিক্ষার্থী আইডি", studentId],
              ["শ্রেণি ও শিফট", hold.className],
              ["ভর্তি রেফারেন্স", hold.holdId],
              ["ভর্তি অবস্থা", "CONFIRMED ✓"],
            ].map(([label, val]) => (
              <div key={label} className="receipt-row">
                <span className="receipt-label">{label}:</span>
                <span className="receipt-val">{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>বন্ধ করুন</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>🖨️ প্রিন্ট করুন</button>
        </div>
      </div>
    </div>
  );
}
