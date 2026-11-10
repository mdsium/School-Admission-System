# School Admission System (অনলাইন স্কুল ভর্তি ব্যবস্থা)

An enterprise-ready, high-concurrency online admission system designed for private schools where seats are allocated strictly on a **"First-Come, First-Served"** basis with **time-limited seat holds**.

Developed as part of the **Assistant Software Engineer Recruitment** take-home assignment for **Onnorokom Projukti Limited**.

---

## 🛠️ Technology Stack

- **Backend**: C# (.NET 8 Minimal API, Entity Framework Core with Npgsql)
- **Database**: PostgreSQL 16 (Pessimistic row locking, partial unique indexes, persistent volume)
- **Frontend**: React 18 + TypeScript + Vite (Clean modern UI, real-time countdown, automatic polling, Bengali localized error messages)
- **Containerization**: Docker & Docker Compose (Multi-stage production builds, persistent storage)

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
│  - 17-digit Student ID  │   Header: X-Student-Id   │    (Minimal APIs + EF Core)      │   Row Locking &    │  - classes table        │
│  - Live Seat Polling    │ <─────────────────────── │    - AdmissionService            │   Transactions     │  - holds table          │
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

All endpoints speak JSON. Student operations require the `X-Student-Id` header (17-digit birth registration number).

| # | Method | Path | Required Header | Description |
|---|---|---|---|---|
| 1 | `POST` | `/classes` | — | Create a new class/shift (`{ name, totalSeats }`) |
| 2 | `GET` | `/classes` | — | List all classes with `heldSeats`, `confirmedSeats`, `availableSeats` |
| 3 | `GET` | `/classes/{classId}` | — | Get single class seat status |
| 4 | `POST` | `/classes/{classId}/holds` | `X-Student-Id` | Apply for a class seat (returns 201 or 409 if full/duplicate) |
| 5 | `GET` | `/holds/{holdId}` | — | Get hold details (`HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`) |
| 6 | `POST` | `/holds/{holdId}/confirm` | `X-Student-Id` | Confirm admission (simulates payment) |
| 7 | `DELETE` | `/holds/{holdId}` | `X-Student-Id` | Cancel application (204 No Content) |
| 8 | `GET` | `/me/holds` | `X-Student-Id` | List all applications belonging to the student |

---

## 🧪 Automated Testing

### 1. Backend Tests (.NET 8 / xUnit)

The backend test suite includes:
- **Concurrency Integration Tests**: Simulates 50–100 parallel requests contending for limited seats against real PostgreSQL to prove zero overselling.
- **Domain Unit Tests**: Tests student ID validation, seat math calculations, and business rule edge cases.

To run the backend tests:
```bash
# Start test database container
docker compose up -d db

# Create test database (if not already created)
docker exec $(docker compose ps -q db) psql -U postgres -c "CREATE DATABASE admission_test;"

# Run tests
cd backend
dotnet test
```

To run the fast domain unit tests (which do not require PostgreSQL):
```bash
cd backend
dotnet test --filter "FullyQualifiedName~DomainUnitTests"
```

### 2. Frontend Tests (React 18 / Vitest)

The frontend test suite uses **Vitest** and **React Testing Library** to verify:
- Class listing and seat availability display.
- Disabling apply button when a class has 0 seats available.
- 17-digit student birth registration number validation.
- User-friendly Bengali error rendering and recovery when backend is offline.
- Admin class creation form validation.

To run frontend tests:
```bash
cd frontend
npm install
npm test
```

---

## 📂 Project Structure

```
├── docker-compose.yml              # Root Docker Compose orchestrating DB, Backend, and Frontend
├── README.md                       # Comprehensive project guide and documentation
├── ASSUMPTIONS.md                  # Detailed design decisions and bonus concurrency analysis
├── AI_USAGE.md                     # Transparent AI tool usage disclosure and review notes
├── backend/
│   ├── Dockerfile                  # Multi-stage .NET 8 build and runtime container
│   ├── Admission.Api/              # ASP.NET Core Minimal API
│   │   ├── Program.cs              # Endpoint routing and middleware pipeline
│   │   ├── AdmissionService.cs     # Business logic, PostgreSQL row locking (FOR UPDATE)
│   │   ├── AppDbContext.cs         # EF Core entity modeling and partial unique indexes
│   │   ├── Domain.cs               # Entity definitions and HoldStatus enum
│   │   └── ExpirySweeper.cs        # Background hosted service for database housekeeping
│   └── Admission.Tests/            # Automated test suite
│       ├── ConcurrencyTests.cs     # Real multi-threaded concurrency and expiry integration tests
│       └── DomainUnitTests.cs      # Domain validation and calculation unit tests
└── frontend/
    ├── Dockerfile                  # Multi-stage Vite build with Nginx production server
    ├── nginx.conf                  # Nginx configuration with runtime config injection
    ├── docker-entrypoint.sh        # Shell entrypoint injecting API_URL dynamically
    ├── src/
    │   ├── App.tsx                 # Main application with tabbed screens and live timer
    │   ├── api.ts                  # Typed API client with Bengali error mapping
    │   ├── useCountdown.ts         # Real-time hold expiration countdown hook
    │   ├── ErrorBoundary.tsx       # React error boundary preventing blank screen errors
    │   ├── App.test.tsx            # Vitest automated UI tests
    │   └── styles.css              # Modern, responsive styles with accessible typography
    └── package.json
```
