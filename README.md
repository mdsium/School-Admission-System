# School Admission Management System (অনলাইন স্কুল ভর্তি ব্যবস্থা)

An enterprise-ready, high-concurrency online admission system designed for private schools where seats are allocated strictly on a **"First-Come, First-Served"** basis with **time-limited seat holds**, role-based authentication (**Parent & Administrator**), and real-time dashboard analytics.

Developed as part of the **Assistant Software Engineer Recruitment** take-home assignment for **Onnorokom Projukti Limited**.

---

## 🛠️ Technology Stack

- **Backend**: C# (.NET 8 Minimal API, Entity Framework Core with Npgsql, JWT Bearer Authentication, ASP.NET Core PasswordHasher)
- **Database**: PostgreSQL 16 (Pessimistic row locking `SELECT ... FOR UPDATE`, partial unique indexes, persistent volume)
- **Frontend**: React 18 + TypeScript + Vite (Responsive Bangla & English UI, real-time countdown, automatic polling, admission slip modal, parent & admin dashboards)
- **Containerization**: Docker & Docker Compose (Multi-stage production builds, persistent storage)

---

## 👥 User Roles & Access Control

| Feature | Parent (অভিভাবক) | Administrator (স্কুল অ্যাডমিন) |
|---|---|---|
| **Registration** | ✅ পাবলিক রেজিস্ট্রেশন উন্মুক্ত | ❌ পাবলিক রেজিস্ট্রেশন বন্ধ (অটো সিডিং দ্বারা তৈরি) |
| **Login** | ✅ ইউজারনেম/ইমেইল ও পাসওয়ার্ড | ✅ সুরক্ষিত অ্যাডমিন লগইন |
| **Dashboard** | 🏠 Parent Dashboard (আবেদন সারাংশ ও রশিদ) | 📊 Admin Dashboard (KPI মেট্রিক্স ও রিয়েল-টাইম পরিসংখ্যান) |
| **Manage Classes** | ❌ অনুমতি নেই | ✅ ক্লাস তৈরি, এডিট ও আসন কোটা নির্ধারণ |
| **Manage Shifts** | ❌ অনুমতি নেই | ✅ Morning / Day / Evening শিফট তৈরি ও আসন বণ্টন |
| **Apply for Admission** | ✅ ১৭-ডিজিটের জন্ম নিবন্ধন দিয়ে আবেদন | ✅ পরিচালনা ও তদারকি |
| **Seat Holds & Countdown** | ✅ রিয়েল-টাইম টাইমার ও ফি পরিশোধ | ✅ সকল সক্রিয় ও মেয়াদোত্তীর্ণ হোল্ড পর্যবেক্ষণ |
| **Manage Admissions** | 🎓 নিজের আবেদনসমূহ পরিচালনা | 📑 সকল আবেদন ও শিক্ষার্থীর বিস্তারিত তথ্য |

### 🔐 Initial Admin Account (Seeded in Database)
- **Username**: `admin`
- **Default Password**: `1234`
- **Role**: `Admin`
- **Security Policy**: পাসওয়ার্ডটি ডাটাবেজে সিকিউর হ্যাশ (PBKDF2-HMAC-SHA512) আকারে সংরক্ষিত থাকে। প্রথমবার লগইনের পর সিস্টেমে প্রবেশ করার জন্য **ডিফল্ট পাসওয়ার্ড পরিবর্তন বাধ্যতামূলক** (`mustChangePassword: true` পলিসি দ্বারা এনফোর্সড)।

---

## 🚀 Quick Start with Docker

The entire stack runs with a single command:

```bash
docker compose up --build
```

Once running, access the services:

| Service | URL | Description |
|---|---|---|
| **Frontend** | [http://localhost:3000](http://localhost:3000) | React SPA for Parents & School Admin |
| **Backend API** | [http://localhost:8080](http://localhost:8080) | ASP.NET Core REST API |
| **Database** | `localhost:5432` | PostgreSQL (Database: `admission`, User/Password: `postgres`) |

> [!NOTE]
> All application data is preserved across container restarts (`docker compose down` and subsequent `docker compose up`) using the named volume `school_admission_pgdata`.

---

## ⚙️ Environment Variables & Configuration

The application is fully configurable through environment variables:

| Variable | Target Service | Default Value | Description |
|---|---|---|---|
| `HOLD_DURATION_SECONDS` | Backend | `600` (10 mins) | Time in seconds for temporary seat holds |
| `DB_CONNECTION_STRING` | Backend | `Host=db;Port=5432;...` | PostgreSQL connection string |
| `CORS_ORIGINS` | Backend | `http://localhost:3000,http://localhost:5173` | Allowed browser origins |
| `JWT_SECRET` | Backend | Auto-generated 64-char key | Secret key for signing authentication tokens |
| `API_URL` | Frontend | `http://localhost:8080` | Backend API URL used by the client browser |

### Quick Expiry Demo:
To test the hold expiration and UI timer with a 30-second hold duration:
```bash
HOLD_DURATION_SECONDS=30 docker compose up --build
```

---

## 🏛️ System Architecture & Concurrency Strategy

```
┌─────────────────────────┐       HTTP / JSON        ┌──────────────────────────────────┐        SQL         ┌─────────────────────────┐
│       React 18 SPA      │ ───────────────────────> │    ASP.NET Core Web API (:8080)  │ ─────────────────> │      PostgreSQL 16      │
│  - Parent & Admin Dash  │   Header: X-Student-Id   │    (Minimal APIs + EF Core + JWT)│   Row Locking &    │  - classes table        │
│  - 17-digit Student ID  │   Header: Authorization  │    - AuthService                 │   Transactions     │  - holds table          │
│  - Live Seat Polling    │ <─────────────────────── │    - AdmissionService            │                    │  - users table          │
│  - Real-Time Countdown  │                          │    - ExpirySweeper (Background)  │ <───────────────── │  - Partial Unique Index │
└─────────────────────────┘                          └──────────────────────────────────┘                    └─────────────────────────┘
```

### 1. Zero Overselling Guarantee (High Concurrency)
- When thousands of parents apply simultaneously, all seat mutations (`CreateHold`, `ConfirmHold`, `CancelHold`) run inside an explicit transaction with a row-level lock:
  ```sql
  SELECT 1 FROM classes WHERE "Id" = @classId FOR UPDATE;
  ```
- **Serialization by PostgreSQL**: PostgreSQL serializes all writes for the same class. The sequence `count current live seats -> compare with totalSeats -> insert hold` cannot interleave with competing requests.
- **Multi-Process Concurrency (Bonus)**: Even if multiple backend instances run on different ports against the same database, the lock resides inside PostgreSQL engine memory, ensuring absolute safety across all instances.
- **Partial Unique Index**:
  ```sql
  CREATE UNIQUE INDEX ux_holds_one_live_per_student_class 
  ON holds ("ClassId", "StudentId") 
  WHERE "Status" IN ('HELD', 'CONFIRMED');
  ```
  Guarantees that a student can never hold or confirm more than one seat per class at the same time.

### 2. Time-Independent Expiry Strategy
- A hold is considered live only if `Status == HELD` and `ExpiresAt > now_utc`.
- Every seat count and confirmation checks this condition in real-time. Thus, expired seats are released the exact millisecond `ExpiresAt` passes, without requiring any manual API calls or dependent timers.
- A hosted background service (`ExpirySweeper`) periodically marks stale rows as `EXPIRED` for clean database hygiene.

---

## 📡 REST API Contract

All endpoints speak JSON. 

### 1. Authentication Endpoints
| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new Parent user (`fullName`, `username`, `email`, `password`) |
| `POST` | `/api/auth/login` | Public | Log in with credentials (`username`, `password`), returns JWT and user profile |
| `GET` | `/api/auth/me` | Authenticated | Get current authenticated user details |
| `POST` | `/api/auth/change-password` | Authenticated | Change password and clear `mustChangePassword` flag |

### 2. Administrator Endpoints (Requires Admin Role)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/overview` | Dashboard summary (total classes, shifts, seats, holds, confirmed, available) |
| `GET` | `/api/admin/classes` | List all classes with shift and capacity details |
| `POST` | `/api/admin/classes` | Create new class with Morning / Day / Evening shift and seats |
| `PUT` | `/api/admin/classes/{classId}` | Edit class name, shift, or update seat capacity |
| `GET` | `/api/admin/applications` | View all applications with optional status filter (`HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`) |

### 3. Parent & Public Admission Contract (§1.4)
| # | Method | Path | Required Header | Description |
|---|---|---|---|---|
| 1 | `POST` | `/classes` | — | Create a new class/shift (`{ name, totalSeats }`) |
| 2 | `GET` | `/classes` | — | List all classes with `heldSeats`, `confirmedSeats`, `availableSeats` |
| 3 | `GET` | `/classes/{classId}` | — | Get single class seat status |
| 4 | `POST` | `/classes/{classId}/holds` | `X-Student-Id` | Apply for a class seat (returns 201 or 409 if full/duplicate) |
| 5 | `GET` | `/holds/{holdId}` | — | Get hold details (`HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`) |
| 6 | `POST` | `/holds/{holdId}/confirm` | `X-Student-Id` | Confirm admission (simulates fee payment) |
| 7 | `DELETE` | `/holds/{holdId}` | `X-Student-Id` | Cancel application (204 No Content) |
| 8 | `GET` | `/me/holds` | `X-Student-Id` | List all applications belonging to the student |

---

## 🧪 Automated Testing

### 1. Backend Tests (.NET 8 / xUnit)
The backend test suite includes:
- **Concurrency Integration Tests**: Simulates parallel requests contending for limited seats against PostgreSQL to prove zero overselling.
- **Domain & Auth Unit Tests**: 18 unit tests covering 17-digit student ID validation, seat math calculations, password hashing, mandatory admin password change, parent role enforcement, and shift display formatting.

To run the backend tests:
```bash
# Run domain & auth unit tests:
dotnet test backend/Admission.Tests/Admission.Tests.csproj --filter "FullyQualifiedName~DomainUnitTests"
```

### 2. Frontend Tests (React 18 / Vitest)
The frontend test suite uses **Vitest** and **React Testing Library** to verify:
- Class listing and seat availability display.
- Disabling apply button when a class has 0 seats available.
- 17-digit student birth registration number validation.
- User-friendly Bengali error rendering and retry recovery when backend is offline.
- Admin class creation form validation.
- Login and demo credential auto-fill.
- Parent registration form.

To run frontend tests:
```bash
npm --prefix frontend test -- --run
```
#   S c h o o l - A d m i s s i o n - S y s t e m  
 