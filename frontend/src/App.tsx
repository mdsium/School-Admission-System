import React, { useCallback, useEffect, useState } from "react";
import { api, ApiError, ClassInfo, MyHold } from "./api";
import { fmt, useCountdown } from "./useCountdown";

const STORAGE_KEY = "studentId";
const DEMO_STUDENT_ID = "20152691234567890";
const isValidId = (s: string) => /^\d{17}$/.test(s);
const errMsg = (e: unknown) =>
  e instanceof ApiError ? e.message : "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।";

type Tab = "classes" | "mine" | "admin";

export default function App() {
  const [studentId, setStudentId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [draftId, setDraftId] = useState(studentId);
  const [tab, setTab] = useState<Tab>("classes");
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [myHoldsCount, setMyHoldsCount] = useState<number>(0);

  const notify = useCallback((type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const loggedIn = isValidId(studentId);

  // Sync holds count periodically if logged in
  useEffect(() => {
    if (!loggedIn) {
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
  }, [studentId, loggedIn]);

  const handleSaveStudentId = (idToSave: string) => {
    localStorage.setItem(STORAGE_KEY, idToSave);
    setStudentId(idToSave);
    setDraftId(idToSave);
    notify("ok", `শিক্ষার্থী নম্বর ${idToSave} সফলভাবে সেট হয়েছে।`);
  };

  const handleClearStudentId = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStudentId("");
    setDraftId("");
    notify("ok", "শিক্ষার্থী নম্বর মুছে ফেলা হয়েছে।");
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
          <div className="auto-refresh-pill">
            <span className="pulse-dot"></span>
            <span>সিস্টেম সক্রিয়</span>
          </div>
        </div>

        {/* Student Identity Card */}
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
            {loggedIn && (
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
                ⚠️ {draftId.length}/১৭ অঙ্ক — ঠিক ১৭টি পূর্ণসংখ্যা দিতে হবে।
              </span>
            ) : loggedIn ? (
              <span style={{ color: "var(--success)", fontWeight: 600 }}>
                ✓ বর্তমান শিক্ষার্থী আইডি: {studentId}
              </span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>
                আবেদন ও ভর্তি নিশ্চিত করার পূর্বে শিক্ষার্থীর ১৭ অঙ্কের নম্বর দিন।
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="tabs-nav" aria-label="প্রধান নেভিগেশন">
        <button
          className={`tab-btn ${tab === "classes" ? "active" : ""}`}
          onClick={() => setTab("classes")}
        >
          <span>📋 সকল Class ও আসন তালিকা</span>
        </button>
        <button
          className={`tab-btn ${tab === "mine" ? "active" : ""}`}
          onClick={() => setTab("mine")}
        >
          <span>🎓 আমার আবেদনসমূহ</span>
          {myHoldsCount > 0 && <span className="tab-badge">{myHoldsCount}</span>}
        </button>
        <button
          className={`tab-btn ${tab === "admin" ? "active" : ""}`}
          onClick={() => setTab("admin")}
        >
          <span>⚙️ Class তৈরি (Admin)</span>
        </button>
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

      {/* Active Tab Views */}
      {tab === "classes" && (
        <ClassList
          studentId={loggedIn ? studentId : ""}
          notify={notify}
          goMine={() => setTab("mine")}
        />
      )}
      {tab === "mine" && (
        <MyApplications
          studentId={loggedIn ? studentId : ""}
          notify={notify}
          goClasses={() => setTab("classes")}
        />
      )}
      {tab === "admin" && <Admin notify={notify} onClassCreated={() => setTab("classes")} />}
    </div>
  );
}

type Notify = (t: "ok" | "err", s: string) => void;

/* ---------------- Class list component ---------------- */

function ClassList({
  studentId,
  notify,
  goMine,
}: {
  studentId: string;
  notify: Notify;
  goMine: () => void;
}) {
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const data = await api.listClasses();
      setClasses(data);
      setError("");
      setLastRefreshed(new Date().toLocaleTimeString("bn-BD"));
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000); // 5s auto-polling as required
    return () => clearInterval(timer);
  }, [load]);

  const apply = async (c: ClassInfo) => {
    if (!studentId) {
      notify("err", "আগে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর সেট করুন।");
      return;
    }
    setBusy(c.id);
    try {
      await api.apply(c.id, studentId);
      notify("ok", `"${c.name}"-এ seat সাময়িকভাবে hold করা হয়েছে! মেয়াদের মধ্যে ফি দিন।`);
      goMine();
    } catch (e) {
      notify("err", errMsg(e));
      load();
    } finally {
      setBusy(null);
    }
  };

  if (error && !classes) return <ErrorBox text={error} retry={load} />;
  if (!classes) return <div className="card center-box"><p>Class তালিকা লোড হচ্ছে…</p></div>;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h2 style={{ fontSize: "18px", color: "#1e293b" }}>বিদ্যমান Class ও শিফটের আসন পরিস্থিতি</h2>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            প্রতি ৫ সেকেন্ড পর পর স্বয়ংক্রিয়ভাবে আসন সংখ্যা হালনাগাদ হচ্ছে
          </span>
        </div>
        {lastRefreshed && (
          <span className="auto-refresh-pill">
            <span className="pulse-dot"></span>
            <span>সর্বশেষ আপডেট: {lastRefreshed}</span>
          </span>
        )}
      </div>

      {classes.length === 0 ? (
        <div className="center-box">
          <p style={{ color: "var(--text-muted)", marginBottom: "12px" }}>
            এখনো কোনো Class তৈরি করা হয়নি।
          </p>
          <p style={{ fontSize: "13px" }}>
            উপরের <strong>Class তৈরি (Admin)</strong> ট্যাব থেকে নতুন Class যোগ করুন।
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Class ও Shift</th>
                <th style={{ textAlign: "center" }}>মোট আসন</th>
                <th style={{ textAlign: "center" }}>Hold-এ আছে</th>
                <th style={{ textAlign: "center" }}>ভর্তি নিশ্চিত</th>
                <th style={{ textAlign: "center" }}>খালি আসন</th>
                <th style={{ textAlign: "right" }}>পদক্ষেপ</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const isFull = c.availableSeats === 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>ID: {c.id}</div>
                    </td>
                    <td style={{ textAlign: "center" }}>{c.totalSeats}</td>
                    <td style={{ textAlign: "center", color: "#b45309", fontWeight: 600 }}>
                      {c.heldSeats}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--success)", fontWeight: 600 }}>
                      {c.confirmedSeats}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`seat-pill ${isFull ? "empty" : "available"}`}>
                        {isFull ? "আসন পূর্ণ" : `${c.availableSeats} টি খালি`}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-primary"
                        disabled={!studentId || isFull || busy === c.id}
                        onClick={() => apply(c)}
                        title={!studentId ? "উপরে শিক্ষার্থী আইডি সেট করুন" : isFull ? "আসন ফাঁকা নেই" : "আবেদন করুন"}
                      >
                        {busy === c.id
                          ? "অপেক্ষা করুন…"
                          : isFull
                          ? "Seat নেই"
                          : "আবেদন করুন"}
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

/* ---------------- My applications component ---------------- */

function MyApplications({
  studentId,
  notify,
  goClasses,
}: {
  studentId: string;
  notify: Notify;
  goClasses: () => void;
}) {
  const [holds, setHolds] = useState<MyHold[] | null>(null);
  const [error, setError] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<MyHold | null>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const data = await api.myHolds(studentId);
      setHolds(data);
      setError("");
    } catch (e) {
      setError(errMsg(e));
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!studentId) {
    return (
      <div className="card center-box">
        <p style={{ color: "var(--danger)", fontWeight: 600, marginBottom: "8px" }}>
          ⚠️ শিক্ষার্থী আইডি সেট করা নেই
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
          আবেদন দেখতে বা নতুন আবেদন করতে উপরে আপনার ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিন।
        </p>
      </div>
    );
  }

  if (error && !holds) return <ErrorBox text={error} retry={load} />;
  if (!holds) return <div className="card center-box"><p>আপনার আবেদন লোড হচ্ছে…</p></div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h2 style={{ fontSize: "18px", color: "#1e293b" }}>
            শিক্ষার্থী ({studentId})-এর সকল আবেদন
          </h2>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            ব্রাউজার রিফ্রেশ বা বন্ধ করে পুনরায় ঢুকলেও চলমান আবেদনসমূহ অপরিবর্তিত থাকবে
          </span>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ fontSize: "13px" }}>
          🔄 রিফ্রেশ করুন
        </button>
      </div>

      {holds.length === 0 ? (
        <div className="card center-box">
          <p style={{ color: "var(--text-muted)", marginBottom: "12px" }}>
            এই শিক্ষার্থীর নামে বর্তমানে কোনো আবেদন নেই।
          </p>
          <button className="btn btn-primary" onClick={goClasses}>
            Class তালিকা দেখে আবেদন করুন
          </button>
        </div>
      ) : (
        <div>
          {holds.map((h) => (
            <HoldCard
              key={h.holdId}
              hold={h}
              studentId={studentId}
              notify={notify}
              reload={load}
              onViewReceipt={() => setSelectedReceipt(h)}
            />
          ))}
        </div>
      )}

      {/* Confirmation Slip / Receipt Modal */}
      {selectedReceipt && (
        <div className="modal-overlay" onClick={() => setSelectedReceipt(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-header">
              <span style={{ fontSize: "32px" }}>🎓</span>
              <h2>অনলাইন ভর্তি নিশ্চিতকরণ স্লিপ</h2>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                অফিসিয়াল ভর্তি রসিদ · অননুরোকম টেক-হোম অ্যাসাইনমেন্ট
              </p>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">শিক্ষার্থীর জন্ম নিবন্ধন নম্বর:</span>
              <span className="receipt-val">{studentId}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">Class ও Shift:</span>
              <span className="receipt-val">{selectedReceipt.className}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">আবেদন / Hold ID:</span>
              <span className="receipt-val">{selectedReceipt.holdId}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">ভর্তির অবস্থা:</span>
              <span className="receipt-val" style={{ color: "var(--success)" }}>
                ভর্তি নিশ্চিত (CONFIRMED) ✔
              </span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">ভর্তি ফি স্ট্যাটাস:</span>
              <span className="receipt-val" style={{ color: "var(--success)" }}>
                পরিশোধিত (PAID)
              </span>
            </div>

            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                className="btn btn-secondary"
                onClick={() => window.print()}
                title="প্রিন্ট করুন"
              >
                🖨️ প্রিন্ট / সেভ করুন
              </button>
              <button className="btn btn-primary" onClick={() => setSelectedReceipt(null)}>
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  HELD: "Hold করা আছে",
  CONFIRMED: "ভর্তি নিশ্চিত ✔",
  EXPIRED: "মেয়াদ শেষ ✕",
  CANCELLED: "বাতিলকৃত ✕",
};

function HoldCard({
  hold,
  studentId,
  notify,
  reload,
  onViewReceipt,
}: {
  hold: MyHold;
  studentId: string;
  notify: Notify;
  reload: () => void;
  onViewReceipt: () => void;
}) {
  const left = useCountdown(hold.status === "HELD" ? hold.expiresAt : undefined);
  const [busy, setBusy] = useState(false);

  // Status requirement: When countdown reaches 0, immediately flip to EXPIRED on UI
  // and disable the "ভর্তি ফি দিন" button without page reload!
  const isHeld = hold.status === "HELD";
  const isExpiredByTimer = isHeld && left === 0;
  const currentStatus = isExpiredByTimer ? "EXPIRED" : hold.status;

  // Auto-reload once timer expires to synchronize state with server
  useEffect(() => {
    if (isExpiredByTimer) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpiredByTimer]);

  const act = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    try {
      await fn();
      notify("ok", okText);
    } catch (e) {
      notify("err", errMsg(e));
    } finally {
      setBusy(false);
      reload();
    }
  };

  const handleCancel = () => {
    if (window.confirm(`আপনি কি নিশ্চিত যে "${hold.className}"-এর আসন সংরক্ষণটি বাতিল করতে চান?`)) {
      act(() => api.cancel(hold.holdId, studentId), "আবেদন সফলভাবে বাতিল করা হয়েছে।");
    }
  };

  return (
    <div className={`card hold-card ${currentStatus}`}>
      <div className="hold-info">
        <h3>{hold.className}</h3>
        <div className="hold-meta">
          <span className={`status-badge ${currentStatus}`}>
            {STATUS_LABEL[currentStatus]}
          </span>

          {currentStatus === "HELD" && (
            <span
              className={`countdown-timer ${left <= 60 ? "urgent" : ""}`}
              aria-label="মেয়াদ শেষ হতে বাকি সময়"
            >
              ⏱️ {fmt(left)} বাকি
            </span>
          )}

          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Hold ID: {hold.holdId}
          </span>
        </div>

        {currentStatus === "EXPIRED" && (
          <p style={{ fontSize: "13px", color: "var(--danger)", marginTop: "8px" }}>
            মেয়াদের মধ্যে ভর্তি ফি না দেওয়ায় আসনটি অন্যদের জন্য উন্মুক্ত হয়ে গেছে। প্রয়োজন হলে পুনরায় আবেদন করুন।
          </p>
        )}
      </div>

      <div className="hold-actions">
        {currentStatus === "HELD" && (
          <>
            <button
              className="btn btn-success"
              disabled={busy || left === 0}
              onClick={() =>
                act(
                  () => api.confirm(hold.holdId, studentId),
                  "ভর্তি ফি পরিশোধ ও আসন নিশ্চিত হয়েছে! 🎉"
                )
              }
            >
              💳 ভর্তি ফি দিন
            </button>
            <button
              className="btn btn-danger-outline"
              disabled={busy}
              onClick={handleCancel}
            >
              আবেদন বাতিল
            </button>
          </>
        )}

        {currentStatus === "CONFIRMED" && (
          <button className="btn btn-primary" onClick={onViewReceipt}>
            📄 ভর্তি স্লিপ দেখুন
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Admin create class component ---------------- */

function Admin({
  notify,
  onClassCreated,
}: {
  notify: Notify;
  onClassCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("");
  const [busy, setBusy] = useState(false);

  const parsedSeats = Number(seats);
  const isValid = name.trim().length > 0 && Number.isInteger(parsedSeats) && parsedSeats > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setBusy(true);
    try {
      await api.createClass(name.trim(), parsedSeats);
      notify("ok", `Class "${name.trim()}" (${parsedSeats} আসন) সফলভাবে তৈরি হয়েছে!`);
      setName("");
      setSeats("");
      onClassCreated();
    } catch (err) {
      notify("err", errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: "18px", color: "#1e293b", marginBottom: "8px" }}>
        নতুন Class ও Shift তৈরি (School Admin)
      </h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
        প্রতিটি shift (যেমন মর্নিং ও ডে শিফট) আলাদা ক্লাস হিসেবে নিজস্ব আসন সংখ্যা নিয়ে তৈরি হবে।
      </p>

      <form onSubmit={handleSubmit} style={{ maxWidth: "560px" }}>
        <div className="form-group">
          <label htmlFor="clsName">Class ও Shift-এর নাম:</label>
          <input
            id="clsName"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="যেমন: Class 6 – Morning Shift"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="clsSeats">মোট আসন সংখ্যা (Total Seats):</label>
          <input
            id="clsSeats"
            className="form-input"
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))}
            placeholder="যেমন: 120"
            required
          />
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
          <button className="btn btn-primary" disabled={!isValid || busy}>
            {busy ? "তৈরি হচ্ছে…" : "Class তৈরি করুন"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ErrorBox({ text, retry }: { text: string; retry: () => void }) {
  return (
    <div className="card center-box">
      <p style={{ color: "var(--danger)", fontWeight: 600, marginBottom: "12px" }}>
        ⚠️ {text}
      </p>
      <button className="btn btn-secondary" onClick={retry}>
        আবার চেষ্টা করুন
      </button>
    </div>
  );
}
