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

export default function App() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [studentId, setStudentId] = useState<string>(() => localStorage.getItem(STORAGE_STUDENT_ID) ?? "");
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

  // Check if current user must change password
  useEffect(() => {
    if (user?.mustChangePassword) {
      setShowPasswordChangeModal(true);
    } else {
      setShowPasswordChangeModal(false);
    }
  }, [user]);

  // Keep student holds count in sync
  useEffect(() => {
    if (!isValidId(studentId)) {
      setMyHoldsCount(0);
      return;
    }
    let isMounted = true;
    const fetchCount = async () => {
      try {
        const holds = await api.myHolds(studentId);
        if (isMounted) {
          const active = holds.filter((h) => h.status === "HELD" || h.status === "CONFIRMED");
          setMyHoldsCount(active.length);
        }
      } catch {
        // silent background poll
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [studentId]);

  const handleSaveStudentId = (idToSave: string) => {
    localStorage.setItem(STORAGE_STUDENT_ID, idToSave);
    setStudentId(idToSave);
    setDraftId(idToSave);
    notify("ok", `শিক্ষার্থী নম্বর ${idToSave} সফলভাবে সেট হয়েছে।`);
  };

  const handleClearStudentId = () => {
    localStorage.removeItem(STORAGE_STUDENT_ID);
    setStudentId("");
    setDraftId("");
    notify("ok", "শিক্ষার্থী নম্বর মুছে ফেলা হয়েছে।");
  };

  const handleLogout = () => {
    clearAuthSession();
    setUser(null);
    setTab("classes");
    notify("ok", "সফলভাবে লগআউট হয়েছে।");
  };

  return (
    <div className="container">
      {/* App Header */}
      <header className="card app-header">
        <div className="header-top">
          <div className="brand-title">
            <span style={{ fontSize: "32px" }}>🏫</span>
            <div>
              <h1>School Admission System</h1>
              <div className="brand-subtitle">
                প্রথম এলে প্রথম পাবেন ভিত্তিতে অনলাইন ভর্তি ও সাময়িক আসন সংরক্ষণ ব্যবস্থা
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div className="auto-refresh-pill">
              <span className="pulse-dot"></span>
              <span>সিস্টেম সক্রিয়</span>
            </div>

            {user ? (
              <div className="user-menu">
                <span className={`role-pill ${user.role === "Admin" ? "role-admin" : "role-parent"}`}>
                  {user.role}
                </span>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>{user.fullName || user.username}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                  onClick={handleLogout}
                >
                  লগআউট
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                  onClick={() => setTab("login")}
                >
                  🔑 লগইন (Login)
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                  onClick={() => setTab("register")}
                >
                  📝 রেজিস্ট্রেশন (Parent)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Student Identity Card (Parent / Public View) */}
        {(!user || user.role === "Parent") && (
          <div className="id-box">
            <label className="id-label" htmlFor="sid">
              👤 শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর (Student ID):
            </label>
            <div className="id-input-group">
              <input
                id="sid"
                className="id-input"
                inputMode="numeric"
                maxLength={17}
                value={draftId}
                onChange={(e) => setDraftId(e.target.value.replace(/\D/g, ""))}
                placeholder="যেমন: 20152691234567890"
              />
              <button
                className="btn btn-primary"
                disabled={!isValidId(draftId) || draftId === studentId}
                onClick={() => handleSaveStudentId(draftId)}
              >
                সেট করুন
              </button>
              <button
                type="button"
                className="btn-outline-sm"
                title="টেস্ট করার জন্য ডেমো নম্বর ব্যবহার করুন"
                onClick={() => {
                  setDraftId(DEMO_STUDENT_ID);
                  handleSaveStudentId(DEMO_STUDENT_ID);
                }}
              >
                ডেমো নম্বর বসান
              </button>
              {isValidId(studentId) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                  onClick={handleClearStudentId}
                >
                  রিসেট
                </button>
              )}
            </div>

            <div className="id-status-row">
              {draftId.length > 0 && !isValidId(draftId) ? (
                <span style={{ color: "var(--danger)", fontWeight: 500 }}>
                  ⚠️ {draftId.length}/১৭ অঙ্ক — ঠিক ১৭টি পূর্ণসংখ্যা দিন।
                </span>
              ) : isValidId(studentId) ? (
                <span style={{ color: "var(--success)", fontWeight: 600 }}>
                  ✓ বর্তমান শিক্ষার্থী আইডি: {studentId}
                </span>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>
                  আবেদন ও ভর্তি নিশ্চিত করার পূর্বে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর সেট করুন।
                </span>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Navigation Tabs */}
      <nav className="tabs-nav" aria-label="প্রধান নেভিগেশন">
        {user?.role === "Admin" ? (
          <>
            <button
              className={`tab-btn ${tab === "admin-dash" ? "active" : ""}`}
              onClick={() => setTab("admin-dash")}
            >
              <span>📊 Admin Dashboard</span>
            </button>
            <button
              className={`tab-btn ${tab === "admin-classes" ? "active" : ""}`}
              onClick={() => setTab("admin-classes")}
            >
              <span>⚙️ Class ও Shift পরিচালনা</span>
            </button>
            <button
              className={`tab-btn ${tab === "admin-apps" ? "active" : ""}`}
              onClick={() => setTab("admin-apps")}
            >
              <span>📑 সকল আবেদন (Applications)</span>
            </button>
          </>
        ) : (
          <>
            {user?.role === "Parent" && (
              <button
                className={`tab-btn ${tab === "parent-dash" ? "active" : ""}`}
                onClick={() => setTab("parent-dash")}
              >
                <span>🏠 Parent Dashboard</span>
              </button>
            )}
            <button
              className={`tab-btn ${tab === "classes" ? "active" : ""}`}
              onClick={() => setTab("classes")}
            >
              <span>📋 Class ও আসন তালিকা</span>
            </button>
            <button
              className={`tab-btn ${tab === "mine" ? "active" : ""}`}
              onClick={() => setTab("mine")}
            >
              <span>🎓 আমার আবেদনসমূহ</span>
              {myHoldsCount > 0 && <span className="tab-badge">{myHoldsCount}</span>}
            </button>
            {!user && (
              <button
                className={`tab-btn ${tab === "admin-classes" ? "active" : ""}`}
                onClick={() => setTab("admin-classes")}
              >
                <span>⚙️ Class তৈরি (Admin)</span>
              </button>
            )}
          </>
        )}
      </nav>

      {/* Toast Alert */}
      {toast && (
        <div className={`toast-bar ${toast.type}`} role="alert">
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "16px",
              color: "inherit",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Mandatory Password Change Modal for Default Admin */}
      {showPasswordChangeModal && (
        <ChangePasswordModal
          user={user!}
          onSuccess={(updatedUser) => {
            setUser(updatedUser);
            setShowPasswordChangeModal(false);
            notify("ok", "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।");
          }}
        />
      )}

      {/* Views */}
      {tab === "login" && (
        <LoginView
          onSuccess={(auth) => {
            saveAuthSession(auth);
            setUser(auth.user);
            notify("ok", `স্বাগতম, ${auth.user.fullName || auth.user.username}!`);
            if (auth.user.mustChangePassword) {
              setShowPasswordChangeModal(true);
            }
            setTab(auth.user.role === "Admin" ? "admin-dash" : "parent-dash");
          }}
          goRegister={() => setTab("register")}
        />
      )}

      {tab === "register" && (
        <RegisterView
          onSuccess={(auth) => {
            saveAuthSession(auth);
            setUser(auth.user);
            notify("ok", "রেজিস্ট্রেশন সফল হয়েছে! অভিভাবক হিসেবে স্বাগতম।");
            setTab("parent-dash");
          }}
          goLogin={() => setTab("login")}
        />
      )}

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
          goSetId={() => {
            const sidInput = document.getElementById("sid");
            sidInput?.focus();
          }}
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
  );
}

// ==========================================
// 1. Auth Views (Login & Register)
// ==========================================

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

  const handleQuickAdmin = () => {
    setUsername("admin");
    setPassword("1234");
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2 className="auth-title">🔑 সিস্টেমে লগইন করুন</h2>
        <p className="auth-subtitle">Parent বা School Admin হিসেবে আপনার অ্যাকাউন্টে প্রবেশ করুন।</p>

        {error && <div className="error-box" style={{ marginBottom: "16px" }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>ইউজারনেম বা ইমেইল</label>
            <input
              className="form-input"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="যেমন: admin বা parent@example.com"
            />
          </div>

          <div className="form-group">
            <label>পাসওয়ার্ড</label>
            <input
              className="form-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="আপনার পাসওয়ার্ড লিখুন"
            />
          </div>

          <button className="btn btn-primary" style={{ width: "100%", marginTop: "10px" }} disabled={loading}>
            {loading ? "লগইন হচ্ছে..." : "লগইন করুন"}
          </button>
        </form>

        <div className="auth-demo-box">
          <div style={{ fontWeight: 600, marginBottom: "4px", color: "#334155" }}>⚡ টেস্ট করার জন্য ডেমো অ্যাকাউন্ট:</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Admin: <code>admin</code> / <code>1234</code></span>
            <button type="button" className="btn-outline-sm" onClick={handleQuickAdmin}>
              অটো-ফিল
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px" }}>
          নতুন অভিভাবক?{" "}
          <button
            type="button"
            style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer" }}
            onClick={goRegister}
          >
            অ্যাকাউন্ট তৈরি করুন (Register)
          </button>
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
      const res = await api.register({
        fullName,
        username,
        email,
        password,
        phoneNumber: phoneNumber || undefined,
      });
      onSuccess(res);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2 className="auth-title">📝 অভিভাবক রেজিস্ট্রেশন</h2>
        <p className="auth-subtitle">সন্তানের অনলাইনে ভর্তির আবেদন করতে আপনার তথ্য দিয়ে নিবন্ধন করুন।</p>

        {error && <div className="error-box" style={{ marginBottom: "16px" }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>অভিভাবকের পূর্ণ নাম *</label>
            <input
              className="form-input"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="যেমন: মোঃ রফিকুল ইসলাম"
            />
          </div>

          <div className="form-group">
            <label>ইউজারনেম *</label>
            <input
              className="form-input"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="যেমন: rofiqul"
            />
          </div>

          <div className="form-group">
            <label>ইমেইল এড্রেস *</label>
            <input
              className="form-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
            />
          </div>

          <div className="form-group">
            <label>মোবাইল নম্বর (ঐচ্ছিক)</label>
            <input
              className="form-input"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="01700000000"
            />
          </div>

          <div className="form-group">
            <label>পাসওয়ার্ড * (কমপক্ষে ৪ অক্ষর)</label>
            <input
              className="form-input"
              type="password"
              required
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="একটি শক্তিশালী পাসওয়ার্ড দিন"
            />
          </div>

          <button className="btn btn-primary" style={{ width: "100%", marginTop: "10px" }} disabled={loading}>
            {loading ? "নিবন্ধন হচ্ছে..." : "অ্যাকাউন্ট তৈরি করুন"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px" }}>
          ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
          <button
            type="button"
            style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer" }}
            onClick={goLogin}
          >
            লগইন করুন
          </button>
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
    if (newPassword !== confirmPassword) {
      setError("নতুন পাসওয়ার্ড দুটি মিলছে না।");
      return;
    }
    setError(null);
    setLoading(true);
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
        <div className="modal-header" style={{ background: "#fef2f2" }}>
          <h3 style={{ color: "#b91c1c" }}>⚠️ ডিফল্ট পাসওয়ার্ড পরিবর্তন আবশ্যক</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              সুরক্ষার স্বার্থে প্রথমবার লগইনের পর ডিফল্ট পাসওয়ার্ড (<code>1234</code>) পরিবর্তন করে নতুন পাসওয়ার্ড সেট করুন।
            </p>

            {error && <div className="error-box" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-group">
              <label>বর্তমান পাসওয়ার্ড</label>
              <input
                className="form-input"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>নতুন পাসওয়ার্ড</label>
              <input
                className="form-input"
                type="password"
                required
                minLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="নতুন পাসওয়ার্ড দিন"
              />
            </div>

            <div className="form-group">
              <label>নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
              <input
                className="form-input"
                type="password"
                required
                minLength={4}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="আবার লিখুন"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "সংরক্ষণ হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন ও সংরক্ষণ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. Parent Dashboard
// ==========================================

function ParentDashboard({
  user,
  studentId,
  goClasses,
  goMine,
  notify,
}: {
  user: User | null;
  studentId: string;
  goClasses: () => void;
  goMine: () => void;
  notify: (type: "ok" | "err", text: string) => void;
}) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [holds, setHolds] = useState<MyHold[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const cls = await api.listClasses();
        let myH: MyHold[] = [];
        if (isValidId(studentId)) {
          myH = await api.myHolds(studentId);
        }
        if (active) {
          setClasses(cls);
          setHolds(myH);
        }
      } catch (err) {
        if (active) notify("err", errMsg(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [studentId, notify]);

  const activeHolds = holds.filter((h) => h.status === "HELD");
  const confirmedHolds = holds.filter((h) => h.status === "CONFIRMED");
  const totalAvailableSeats = classes.reduce((sum, c) => sum + c.availableSeats, 0);

  return (
    <div>
      <div className="card" style={{ background: "linear-gradient(135deg, #1e3a8a, #3b82f6)", color: "#ffffff", padding: "24px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>
          স্বাগতম, {user?.fullName || "অভিভাবক"}!
        </h2>
        <p style={{ fontSize: "14px", opacity: 0.9 }}>
          আপনার সন্তানের জন্য সহজে পছন্দের শ্রেণি ও শিফটে আসন সংরক্ষণ এবং ভর্তি নিশ্চিত করুন।
        </p>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#fef3c7" }}>⏳</div>
          <div>
            <div className="stat-val">{activeHolds.length}</div>
            <div className="stat-label">চলমান আসন সংরক্ষণ (Held)</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dcfce7" }}>🎓</div>
          <div>
            <div className="stat-val">{confirmedHolds.length}</div>
            <div className="stat-label">নিশ্চিত ভর্তি (Confirmed)</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dbeafe" }}>🪑</div>
          <div>
            <div className="stat-val">{totalAvailableSeats}</div>
            <div className="stat-label">স্কুলে সর্বমোট খালি আসন</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#f1f5f9" }}>🏫</div>
          <div>
            <div className="stat-val">{classes.length}</div>
            <div className="stat-label">সক্রিয় শ্রেণি ও শিফট</div>
          </div>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📋 ভর্তি আবেদন করুন</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
              খালি আসনের ভিত্তিতে সকাল, দিন বা সান্ধ্য শিফটে তাৎক্ষণিক সিট বুকিং দিন।
            </p>
          </div>
          <button className="btn btn-primary" onClick={goClasses}>
            শ্রেণি ও আসন তালিকা দেখুন →
          </button>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>🎓 চলমান আবেদন ও রশিদ</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
              সংরক্ষিত আসনের মেয়াদ কাউন্টডাউন দেখুন, ফি পরিশোধ করে নিশ্চিত করুন বা রশিদ ডাউনলোড করুন।
            </p>
          </div>
          <button className="btn btn-secondary" onClick={goMine}>
            আমার আবেদনসমূহ দেখুন ({holds.length}) →
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. Admin Dashboard & Views
// ==========================================

function AdminDashboard({
  goClasses,
  goApps,
  notify,
}: {
  goClasses: () => void;
  goApps: () => void;
  notify: (type: "ok" | "err", text: string) => void;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const data = await api.adminOverview();
        if (active) setOverview(data);
      } catch (err) {
        if (active) notify("err", errMsg(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 6000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [notify]);

  return (
    <div>
      <div className="card" style={{ background: "linear-gradient(135deg, #0f172a, #334155)", color: "#ffffff", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>📊 স্কুল অ্যাডমিন ড্যাশবোর্ড</h2>
            <p style={{ fontSize: "13px", opacity: 0.85 }}>
              সকল শ্রেণি, শিফট, আসন সক্ষমতা ও রিয়েল-টাইম ভর্তি কার্যক্রম তদারকি করুন।
            </p>
          </div>
          <button className="btn btn-primary" onClick={goClasses}>
            ➕ নতুন Class বা Shift যোগ করুন
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#e0e7ff" }}>🏫</div>
          <div>
            <div className="stat-val">{overview?.totalClasses ?? "..."}</div>
            <div className="stat-label">মোট সক্রিয় ক্লাস</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#fef3c7" }}>☀️</div>
          <div>
            <div className="stat-val">{overview?.totalShifts ?? "..."}</div>
            <div className="stat-label">কনফিগার করা শিফট</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#f1f5f9" }}>🪑</div>
          <div>
            <div className="stat-val">{overview?.totalSeats ?? "..."}</div>
            <div className="stat-label">মোট আসন সক্ষমতা</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#fee2e2" }}>⏳</div>
          <div>
            <div className="stat-val">{overview?.heldSeats ?? "..."}</div>
            <div className="stat-label">হোল্ডে থাকা আসন</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dcfce7" }}>✅</div>
          <div>
            <div className="stat-val">{overview?.confirmedSeats ?? "..."}</div>
            <div className="stat-label">নিশ্চিত ভর্তি (Confirmed)</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dbeafe" }}>🟢</div>
          <div>
            <div className="stat-val">{overview?.availableSeats ?? "..."}</div>
            <div className="stat-label">বর্তমানে খালি আসন</div>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="card">
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>⚙️ Class ও Shift পরিচালনা</h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
            শ্রেণি তৈরি করুন, মর্নিং/ডে/সান্ধ্য শিফট নির্ধারণ করুন এবং আসন কোটা পরিবর্তন করুন।
          </p>
          <button className="btn btn-secondary" onClick={goClasses}>
            শ্রেণি ও আসন তালিকা খুলুন →
          </button>
        </div>

        <div className="card">
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📑 ভর্তির আবেদনসমূহ (Applications)</h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
            শিক্ষার্থীদের ১৭ অঙ্কের আইডি, অভিভাবকের নাম ও রিয়েল-টাইম স্ট্যাটাস যাচাই করুন।
          </p>
          <button className="btn btn-secondary" onClick={goApps}>
            সকল আবেদন পর্যালোচনা করুন ({overview?.totalApplications ?? 0}) →
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
    const interval = setInterval(fetchClasses, 6000);
    return () => clearInterval(interval);
  }, [fetchClasses]);

  return (
    <div>
      <div className="card">
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "14px" }}>
          ➕ নতুন Class ও Shift তৈরি করুন
        </h3>
        <CreateClassInline
          onSuccess={() => {
            fetchClasses();
            notify("ok", "নতুন ক্লাস/শিফট সফলভাবে তৈরি হয়েছে।");
          }}
        />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>🏫 Class ও Shift তালিকা</h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              প্রতিটি শ্রেণির মর্নিং, ডে বা সান্ধ্য শিফটে আসন সংখ্যা ও বর্তমান অবস্থা।
            </p>
          </div>
        </div>

        {loading ? (
          <div className="center-box">তথ্য লোড হচ্ছে...</div>
        ) : classes.length === 0 ? (
          <div className="center-box">কোনো শ্রেণি পাওয়া যায়নি। উপরের ফর্ম দিয়ে তৈরি করুন।</div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class ও Shift এর নাম</th>
                  <th>শিফট</th>
                  <th style={{ textAlign: "center" }}>মোট আসন</th>
                  <th style={{ textAlign: "center" }}>Hold আসন</th>
                  <th style={{ textAlign: "center" }}>নিশ্চিত</th>
                  <th style={{ textAlign: "center" }}>খালি আসন</th>
                  <th style={{ textAlign: "center" }}>অ্যাকশন</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => {
                  const shift = c.shift || (c.name.includes("Day") ? "Day Shift" : c.name.includes("Evening") ? "Evening Shift" : "Morning Shift");
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>
                        <span className={`shift-badge ${shift.includes("Day") ? "shift-day" : shift.includes("Evening") ? "shift-evening" : "shift-morning"}`}>
                          {shift}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 600 }}>{c.totalSeats}</td>
                      <td style={{ textAlign: "center", color: "var(--warning)", fontWeight: 600 }}>{c.heldSeats}</td>
                      <td style={{ textAlign: "center", color: "var(--success)", fontWeight: 600 }}>{c.confirmedSeats}</td>
                      <td style={{ textAlign: "center", color: c.availableSeats > 0 ? "var(--primary)" : "var(--danger)", fontWeight: 700 }}>
                        {c.availableSeats}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => setEditingClass(c)}
                        >
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
          onSuccess={() => {
            setEditingClass(null);
            fetchClasses();
            notify("ok", "ক্লাসের তথ্য সফলভাবে আপডেট হয়েছে।");
          }}
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
    if (isNaN(seats) || seats <= 0) {
      setError("আসন সংখ্যা ০-এর বেশি পূর্ণসংখ্যা হতে হবে।");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.adminCreateClass(name, shift, seats);
      setName("");
      setTotalSeats("60");
      onSuccess();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr auto", gap: "12px", alignItems: "end" }}>
      {error && <div className="error-box" style={{ gridColumn: "1 / -1" }}>{error}</div>}

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Class-এর নাম *</label>
        <input
          className="form-input"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="যেমন: Class 6"
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>শিফট</label>
        <select className="form-input" value={shift} onChange={(e) => setShift(e.target.value)}>
          <option value="Morning Shift">Morning Shift (প্রভাতি)</option>
          <option value="Day Shift">Day Shift (দিবা)</option>
          <option value="Evening Shift">Evening Shift (সান্ধ্য)</option>
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>মোট আসন</label>
        <input
          className="form-input"
          type="number"
          required
          min={1}
          value={totalSeats}
          onChange={(e) => setTotalSeats(e.target.value)}
          placeholder="120"
        />
      </div>

      <button className="btn btn-primary" style={{ height: "42px" }} disabled={loading || !name.trim()}>
        {loading ? "তৈরি হচ্ছে..." : "Class তৈরি করুন"}
      </button>
    </form>
  );
}



function CreateClassModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [shift, setShift] = useState("Morning Shift");
  const [totalSeats, setTotalSeats] = useState("60");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const seats = parseInt(totalSeats, 10);
    if (isNaN(seats) || seats <= 0) {
      setError("আসন সংখ্যা ০-এর বেশি পূর্ণসংখ্যা হতে হবে।");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.adminCreateClass(name, shift, seats);
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
          <h3>➕ নতুন Class ও Shift তৈরি করুন</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-box" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-group">
              <label>Class-এর নাম (যেমন: Class 6, Class 7)</label>
              <input
                className="form-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="যেমন: Class 6"
              />
            </div>

            <div className="form-group">
              <label>শিফট (Shift)</label>
              <select className="form-input" value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="Morning Shift">Morning Shift (প্রভাতি শিফট)</option>
                <option value="Day Shift">Day Shift (দিবা শিফট)</option>
                <option value="Evening Shift">Evening Shift (সান্ধ্য শিফট)</option>
              </select>
            </div>

            <div className="form-group">
              <label>মোট আসন সংখ্যা (Total Seats)</label>
              <input
                className="form-input"
                type="number"
                required
                min={1}
                value={totalSeats}
                onChange={(e) => setTotalSeats(e.target.value)}
                placeholder="যেমন: 120"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>বাতিল</button>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "তৈরি হচ্ছে..." : "Class তৈরি করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditClassModal({ cls, onClose, onSuccess }: { cls: ClassInfo; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(cls.name.replace(/ - (Morning Shift|Day Shift|Evening Shift)/, ""));
  const [shift, setShift] = useState(cls.shift || (cls.name.includes("Day") ? "Day Shift" : cls.name.includes("Evening") ? "Evening Shift" : "Morning Shift"));
  const [totalSeats, setTotalSeats] = useState(cls.totalSeats.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const seats = parseInt(totalSeats, 10);
    if (isNaN(seats) || seats <= 0) {
      setError("আসন সংখ্যা ০-এর বেশি পূর্ণসংখ্যা হতে হবে।");
      return;
    }
    setError(null);
    setLoading(true);
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
          <h3>✏️ Class ও Shift সম্পাদনা (Edit)</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-box" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-group">
              <label>Class-এর নাম</label>
              <input
                className="form-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>শিফট</label>
              <select className="form-input" value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="Morning Shift">Morning Shift (প্রভাতি)</option>
                <option value="Day Shift">Day Shift (দিবা)</option>
                <option value="Evening Shift">Evening Shift (সান্ধ্য)</option>
              </select>
            </div>

            <div className="form-group">
              <label>মোট আসন সংখ্যা (বর্তমানে সক্রিয়: {cls.heldSeats + cls.confirmedSeats})</label>
              <input
                className="form-input"
                type="number"
                required
                min={cls.heldSeats + cls.confirmedSeats}
                value={totalSeats}
                onChange={(e) => setTotalSeats(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>বাতিল</button>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "আপডেট হচ্ছে..." : "সংরক্ষণ করুন"}
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
    const interval = setInterval(fetchApps, 6000);
    return () => clearInterval(interval);
  }, [fetchApps]);

  const filtered = apps.filter((a) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return a.studentId.includes(term) || (a.parentName && a.parentName.toLowerCase().includes(term));
  });

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>📑 সকল ভর্তির আবেদন ব্যবস্থাপনা</h2>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
          সকল শিক্ষার্থী এবং তাদের আবেদনের রিয়েল-টাইম অবস্থা ও সময়সীমা নিচে প্রদর্শিত হচ্ছে।
        </p>

        {/* Filter Pills */}
        <div className="filter-bar">
          {["ALL", "HELD", "CONFIRMED", "EXPIRED", "CANCELLED"].map((st) => (
            <button
              key={st}
              className={`filter-pill ${statusFilter === st ? "active" : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === "ALL" ? "সকল আবেদন" : st}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ marginBottom: "16px" }}>
          <input
            className="form-input"
            type="text"
            placeholder="🔍 শিক্ষার্থী আইডি বা অভিভাবকের নাম দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="center-box">আবেদনগুলো লোড হচ্ছে...</div>
        ) : filtered.length === 0 ? (
          <div className="center-box">কোনো আবেদন পাওয়া যায়নি।</div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hold ID</th>
                  <th>শিক্ষার্থী আইডি (17 Digit)</th>
                  <th>Class ও Shift</th>
                  <th>অভিভাবক</th>
                  <th style={{ textAlign: "center" }}>অবস্থা</th>
                  <th>মেয়াদ শেষ / নিশ্চিতের সময়</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.holdId}>
                    <td><code>{a.holdId}</code></td>
                    <td style={{ fontWeight: 600 }}>{a.studentId}</td>
                    <td>{a.className} - {a.shift}</td>
                    <td>{a.parentName || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`status-badge status-${a.status.toLowerCase()}`}>
                        {a.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {a.status === "CONFIRMED" && a.confirmedAt
                        ? `নিশ্চিত: ${new Date(a.confirmedAt).toLocaleTimeString()}`
                        : `মেয়াদ: ${new Date(a.expiresAt).toLocaleTimeString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 4. Class List & Apply (Parent / Public View)
// ==========================================

function ClassList({
  studentId,
  notify,
  goMine,
  goSetId,
}: {
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
      setClasses(data);
      setError(null);
    } catch (err) {
      setError("Server-এর সাথে যোগাযোগ করা যাচ্ছে না।");
      notify("err", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchClasses();
    const interval = setInterval(fetchClasses, 5000);
    return () => clearInterval(interval);
  }, [fetchClasses]);

  const handleApply = async (classId: string, className: string) => {
    if (!studentId) {
      notify("err", "আগে পেজের উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর সেট করুন।");
      goSetId();
      return;
    }
    setApplying(classId);
    try {
      await api.apply(classId, studentId);
      notify("ok", `"${className}"-এ সিট সাময়িকভাবে সংরক্ষিত হয়েছে! মেয়াদ শেষ হওয়ার আগেই ফি জমা দিন।`);
      fetchClasses();
      goMine();
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700 }}>📋 উপলব্ধ শ্রেণির তালিকা ও আসন পরিস্থিতি</h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            আগে আবেদন করলে আগে পাবেন — আবেদন করলে নির্দিষ্ট সময়ের জন্য আসন hold থাকবে।
          </p>
        </div>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "4px 8px", fontSize: "12px" }}
            onClick={fetchClasses}
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      )}

      {loading ? (
        <div className="center-box">শ্রেণির তথ্য লোড হচ্ছে...</div>
      ) : classes.length === 0 ? (
        <div className="center-box">কোনো শ্রেণি পাওয়া যায়নি।</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>শ্রেণি ও শিফটের নাম</th>
                <th style={{ textAlign: "center" }}>মোট আসন</th>
                <th style={{ textAlign: "center" }}>Hold এ আছে</th>
                <th style={{ textAlign: "center" }}>ভর্তি নিশ্চিত</th>
                <th style={{ textAlign: "center" }}>খালি আসন</th>
                <th style={{ textAlign: "center" }}>আবেদন</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ textAlign: "center" }}>{c.totalSeats}</td>
                  <td style={{ textAlign: "center", color: "var(--warning)", fontWeight: 600 }}>{c.heldSeats}</td>
                  <td style={{ textAlign: "center", color: "var(--success)", fontWeight: 600 }}>{c.confirmedSeats}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: c.availableSeats > 0 ? "var(--primary)" : "var(--danger)" }}>
                    {c.availableSeats}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: "6px 14px", fontSize: "13px" }}
                      disabled={c.availableSeats === 0 || applying === c.id}
                      onClick={() => handleApply(c.id, c.name)}
                    >
                      {applying === c.id ? "বুকিং হচ্ছে..." : c.availableSeats === 0 ? "Seat নেই" : "আবেদন করুন"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 5. My Holds & Countdown Timer (Parent View)
// ==========================================

function MyHoldsView({
  studentId,
  notify,
  goClasses,
}: {
  studentId: string;
  notify: (type: "ok" | "err", text: string) => void;
  goClasses: () => void;
}) {
  const [holds, setHolds] = useState<MyHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<MyHold | null>(null);

  const fetchHolds = useCallback(async () => {
    if (!studentId) {
      setHolds([]);
      setLoading(false);
      return;
    }
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
    const interval = setInterval(fetchHolds, 5000);
    return () => clearInterval(interval);
  }, [fetchHolds]);

  if (!studentId) {
    return (
      <div className="card center-box">
        <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--danger)", marginBottom: "8px" }}>
          ⚠️ শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর সেট করা নেই।
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
          পেজের উপরের ঘরে শিক্ষার্থীর ১৭ অঙ্কের নম্বর লিখে "সেট করুন" চাপুন।
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700 }}>🎓 শিক্ষার্থী {studentId}-এর আবেদনসমূহ</h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            নিচের তালিকায় আপনার চলমান আসন সংরক্ষণ এবং নিশ্চিত ভর্তির বিবরণ দেখুন।
          </p>
        </div>
        <button className="btn btn-secondary" onClick={goClasses}>
          ➕ অন্য শ্রেণিতে আবেদন করুন
        </button>
      </div>

      {loading ? (
        <div className="center-box">আবেদনের তথ্য লোড হচ্ছে...</div>
      ) : holds.length === 0 ? (
        <div className="center-box">
          <p style={{ marginBottom: "12px", color: "var(--text-muted)" }}>এই শিক্ষার্থীর নামে কোনো আবেদন পাওয়া যায়নি।</p>
          <button className="btn btn-primary" onClick={goClasses}>
            শ্রেণি তালিকা থেকে আবেদন করুন →
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {holds.map((h) => (
            <HoldCard
              key={h.holdId}
              hold={h}
              studentId={studentId}
              notify={notify}
              onRefresh={fetchHolds}
              onViewSlip={() => setSelectedSlip(h)}
            />
          ))}
        </div>
      )}

      {selectedSlip && (
        <AdmissionSlipModal
          hold={selectedSlip}
          studentId={studentId}
          onClose={() => setSelectedSlip(null)}
        />
      )}
    </div>
  );
}

function HoldCard({
  hold,
  studentId,
  notify,
  onRefresh,
  onViewSlip,
}: {
  hold: MyHold;
  studentId: string;
  notify: (type: "ok" | "err", text: string) => void;
  onRefresh: () => void;
  onViewSlip: () => void;
}) {
  const remainingSeconds = useCountdown(hold.expiresAt);
  const isExpired = remainingSeconds <= 0;
  const [processing, setProcessing] = useState(false);

  // If time has expired and status was HELD, effectively it is EXPIRED
  const effectiveStatus = hold.status === "HELD" && isExpired ? "EXPIRED" : hold.status;

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      await api.confirm(hold.holdId, studentId);
      notify("ok", `ভর্তি ফি সফলভাবে জমা হয়েছে! আসন নিশ্চিত করা হয়েছে।`);
      onRefresh();
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("আপনি কি নিশ্চিতভাবে এই আসনটি বাতিল করতে চান? আসনটি অন্যদের জন্য উন্মুক্ত হয়ে যাবে।")) {
      return;
    }
    setProcessing(true);
    try {
      await api.cancel(hold.holdId, studentId);
      notify("ok", "আসন সংরক্ষণ সফলভাবে বাতিল করা হয়েছে।");
      onRefresh();
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="hold-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>{hold.className}</div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            Hold ID: <code>{hold.holdId}</code>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className={`status-badge status-${effectiveStatus.toLowerCase()}`}>
            {effectiveStatus}
          </span>
          {effectiveStatus === "HELD" && (
            <span className={`countdown-timer ${remainingSeconds < 60 ? "urgent" : ""}`}>
              ⏱️ {fmt(remainingSeconds)}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
        {effectiveStatus === "HELD" && (
          <>
            <button
              className="btn btn-danger"
              style={{ padding: "6px 12px", fontSize: "12px" }}
              disabled={processing}
              onClick={handleCancel}
            >
              বাতিল
            </button>
            <button
              className="btn btn-success"
              style={{ padding: "6px 14px", fontSize: "13px" }}
              disabled={processing || isExpired}
              onClick={handleConfirm}
            >
              {processing ? "প্রক্রিয়াকরণ..." : "ভর্তি ফি দিন (Confirm)"}
            </button>
          </>
        )}

        {effectiveStatus === "CONFIRMED" && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
            onClick={onViewSlip}
          >
            🧾 ভর্তি রশিদ দেখুন (Slip)
          </button>
        )}
      </div>
    </div>
  );
}

function AdmissionSlipModal({
  hold,
  studentId,
  onClose,
}: {
  hold: MyHold;
  studentId: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>🎓 ভর্তি নিশ্চিতকরণ রশিদ (Admission Slip)</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: "center", paddingBottom: "16px", borderBottom: "2px dashed var(--border)" }}>
            <div style={{ fontSize: "28px" }}>🏫</div>
            <h4 style={{ fontSize: "17px", fontWeight: 700 }}>অনলাইন স্কুল ভর্তি ব্যবস্থা</h4>
            <span className="status-badge status-confirmed" style={{ marginTop: "6px" }}>ভর্তি সফল ও নিশ্চিত</span>
          </div>

          <div style={{ marginTop: "16px" }}>
            <div className="receipt-row">
              <span className="receipt-label">শিক্ষার্থীর জন্ম নিবন্ধন নম্বর:</span>
              <span className="receipt-val">{studentId}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">শ্রেণি ও শিফট:</span>
              <span className="receipt-val">{hold.className}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">ভর্তি রেফারেন্স আইডি:</span>
              <span className="receipt-val"><code>{hold.holdId}</code></span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">ভর্তি অবস্থা:</span>
              <span className="receipt-val" style={{ color: "var(--success)" }}>CONFIRMED</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>বন্ধ করুন</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            🖨️ প্রিন্ট করুন
          </button>
        </div>
      </div>
    </div>
  );
}
