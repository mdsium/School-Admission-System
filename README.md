# School Admission Management System (অনলাইন স্কুল ভর্তি ব্যবস্থা)

An enterprise-ready, high-concurrency online admission system designed for private schools. The system allocates seats strictly on a **First-Come, First-Served (FCFS)** basis with time-limited seat holds, role-based authentication (Parent & Administrator), and real-time dashboard analytics.

Developed as part of the **Assistant Software Engineer Recruitment** take-home assignment for **Onnorokom Projukti Limited**.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| **Backend** | C# (.NET 8 Minimal API, Entity Framework Core, Npgsql) |
| **Database** | PostgreSQL 16 |
| **Concurrency Control** | Pessimistic Row Locking (`SELECT ... FOR UPDATE`), Partial Unique Indexes |
| **Frontend** | React 18, TypeScript, Vite |
| **UI Features** | Responsive Bangla & English UI, Real-time Countdown, Automatic Polling, Admission Slip Modal |
| **Containerization** | Docker & Docker Compose |
| **Storage** | PostgreSQL Persistent Volume |

---

## 👥 User Roles & Access Control

| Feature | Parent (অভিভাবক) | Administrator (স্কুল অ্যাডমিন) |
|---|---|---|
| **Registration** | ✅ Public registration | ❌ Created through database seeding |
| **Login** | ✅ Username/email and password | ✅ Secure admin login |
| **Dashboard** | 🏠 Parent dashboard (applications and receipts) | 📊 Admin dashboard (KPIs and real-time statistics) |
| **Manage Classes** | ❌ No permission | ✅ Create, edit, and configure seat quotas |
| **Manage Shifts** | ❌ No permission | ✅ Create Morning, Day, and Evening shifts |
| **Apply for Admission** | ✅ Apply using a 17-digit birth registration number | ✅ Manage and monitor applications |
| **Seat Holds & Countdown** | ✅ Real-time timer and fee payment simulation | ✅ Monitor active and expired holds |
| **Manage Admissions** | 🎓 Manage personal applications | 📑 View all applications and student details |

---

## 🔐 Initial Administrator Account

The initial administrator account is automatically created through database seeding.

| Property | Value |
|---|---|
| **Username** | `admin` |
| **Default Password** | `1234` |
| **Role** | `Admin` |

### Security Policy

- Passwords are stored as secure hashes using **PBKDF2-HMAC-SHA512**.
- The administrator must change the default password after the first login.
- The `mustChangePassword: true` policy enforces the mandatory password update.

---

## 🚀 Quick Start with Docker

The entire application stack can be started with a single command.

### Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose

### 1. Clone the Repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_PROJECT_DIRECTORY>
```

### 2. Start the Application

```bash
docker compose up --build
```

### 3. Access the Services

Once all containers are running, access the application using the following URLs:

| Service | URL | Description |
|---|---|---|
| **Frontend** | http://localhost:3000 | React SPA for Parents and Administrators |
| **Backend API** | http://localhost:8080 | ASP.NET Core REST API |
| **Database** | `localhost:5432` | PostgreSQL Database |

### Database Configuration

| Property | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `admission` |
| Username | `postgres` |
| Password | `postgres` |

> **Note:** Application data is preserved across container restarts using the named Docker volume `school_admission_pgdata`.
>
> Running `docker compose down` does not delete the named volume. However, `docker compose down -v` will remove it and delete the persisted database data.

---

## ⚙️ Environment Variables & Configuration

The application supports environment-based configuration.

| Variable | Target Service | Default Value | Description |
|---|---|---|---|
| `HOLD_DURATION_SECONDS` | Backend | `600` | Temporary seat hold duration (10 minutes) |
| `DB_CONNECTION_STRING` | Backend | `Host=db;Port=5432;...` | PostgreSQL connection string |
| `CORS_ORIGINS` | Backend | `http://localhost:3000,http://localhost:5173` | Allowed browser origins |
| `JWT_SECRET` | Backend | Auto-generated 64-character key | Secret key for signing JWT tokens |
| `API_URL` | Frontend | `http://localhost:8080` | Backend API URL used by the browser |

### Quick Expiry Demo

To test the temporary seat hold expiration feature with a 30-second duration:

**Linux / macOS:**

```bash
HOLD_DURATION_SECONDS=30 docker compose up --build
```

**Windows PowerShell:**

```powershell
$env:HOLD_DURATION_SECONDS="30"
docker compose up --build
```

---

## 🏛️ System Architecture

The application follows a three-tier architecture.

```text
┌─────────────────────────┐
│       React 18 SPA      │
│                         │
│  - Parent Dashboard     │
│  - Admin Dashboard      │
│  - 17-Digit Student ID  │
│  - Live Seat Polling    │
│  - Real-Time Countdown  │
└────────────┬────────────┘
             │ HTTP / JSON
             ▼
┌──────────────────────────────────┐
│      ASP.NET Core Web API        │
│             (:8080)              │
│                                  │
│  - Minimal APIs                  │
│  - JWT Authentication            │
│  - AuthService                   │
│  - AdmissionService              │
│  - ExpirySweeper                 │
└────────────┬─────────────────────┘
             │ SQL
             ▼
┌─────────────────────────┐
│      PostgreSQL 16      │
│                         │
│  - Classes Table        │
│  - Holds Table          │
│  - Users Table          │
│  - Row-Level Locking    │
│  - Partial Unique Index │
└─────────────────────────┘
```

---

## 🔒 Concurrency & Seat Allocation Strategy

### 1. Zero Overselling Guarantee

The system uses PostgreSQL pessimistic row-level locking to prevent multiple parents from acquiring the same available seat.

When multiple parents apply simultaneously, all seat-related operations (`CreateHold`, `ConfirmHold`, and `CancelHold`) execute inside explicit database transactions.

The system locks the relevant class row:

```sql
SELECT 1
FROM classes
WHERE "Id" = @classId
FOR UPDATE;
```

**How it works:**

1. A transaction acquires a row-level lock on the selected class.
2. The system counts currently active holds and confirmed admissions.
3. Available seats are calculated against the total seat capacity.
4. If a seat is available, a new hold is created.
5. The transaction commits and releases the lock.
6. Other concurrent transactions proceed sequentially.

**Benefits:**

- Prevents seat overselling.
- Ensures consistent seat allocation.
- Supports high-concurrency admission requests.
- Works across multiple backend instances connected to the same PostgreSQL database.

### 2. Partial Unique Index

A partial unique index prevents a student from holding or confirming multiple seats in the same class simultaneously.

```sql
CREATE UNIQUE INDEX ux_holds_one_live_per_student_class
ON holds ("ClassId", "StudentId")
WHERE "Status" IN ('HELD', 'CONFIRMED');
```

This provides an additional database-level integrity guarantee.

### 3. Time-Independent Expiry Strategy

A temporary seat hold is considered active only when:

```csharp
Status == "HELD" && ExpiresAt > DateTime.UtcNow
```

**Expiry handling:**

- Seat availability is calculated using the actual expiration timestamp.
- Expired holds no longer occupy seats.
- Confirmation checks the expiration timestamp before accepting an admission.
- The hosted background service `ExpirySweeper` periodically updates expired records to `EXPIRED`.

This approach ensures that seat availability does not depend on the background service running at the exact expiration time.

---

## 📡 REST API Documentation

All API endpoints communicate using JSON.

### 1. Authentication Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new parent |
| `POST` | `/api/auth/login` | Public | Authenticate using username and password |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current user information |
| `POST` | `/api/auth/change-password` | Authenticated | Change password and clear `mustChangePassword` |

**Registration payload:**

```json
{
  "fullName": "Parent Name",
  "username": "parent123",
  "email": "parent@example.com",
  "password": "SecurePassword123"
}
```

**Login payload:**

```json
{
  "username": "admin",
  "password": "1234"
}
```

### 2. Administrator Endpoints

All administrator endpoints require authentication and the `Admin` role.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/overview` | Dashboard KPIs and admission statistics |
| `GET` | `/api/admin/classes` | List all classes and seat information |
| `POST` | `/api/admin/classes` | Create a class with shifts and seat capacity |
| `PUT` | `/api/admin/classes/{classId}` | Update class details and seat capacity |
| `GET` | `/api/admin/applications` | View all applications with optional status filters |

**Supported application status filters:**

- `HELD`
- `CONFIRMED`
- `EXPIRED`
- `CANCELLED`

### 3. Parent & Public Admission Endpoints

| # | Method | Endpoint | Required Header | Description |
|---|---|---|---|---|
| 1 | `GET` | `/classes` | — | List classes with seat availability |
| 2 | `GET` | `/classes/{classId}` | — | Retrieve individual class details |
| 3 | `POST` | `/classes/{classId}/holds` | `X-Student-Id` | Apply for a temporary seat hold |
| 4 | `GET` | `/holds/{holdId}` | — | Retrieve hold information and status |
| 5 | `POST` | `/holds/{holdId}/confirm` | `X-Student-Id` | Confirm admission (simulated payment) |
| 6 | `DELETE` | `/holds/{holdId}` | `X-Student-Id` | Cancel an application |
| 7 | `GET` | `/me/holds` | `X-Student-Id` | Retrieve all student applications |

**Important:** The parent admission flow uses a 17-digit birth registration number.

**Note:** The parent-facing admission endpoints above reflect the documented admission contract. Class creation is handled through the administrator endpoints.

---

## 🧪 Automated Testing

The project includes automated backend and frontend test suites.

### 1. Backend Tests (.NET 8 / xUnit)

The backend test suite includes:

**Concurrency Integration Tests**
- Simulates parallel admission requests against limited seat capacity.
- Verifies that concurrent requests cannot oversell available seats.
- Tests database-level concurrency behavior using PostgreSQL.

**Domain & Authentication Unit Tests**

18 unit tests cover:

- 17-digit student ID validation.
- Seat availability calculations.
- Password hashing.
- Mandatory administrator password change.
- Parent role enforcement.
- Shift display formatting.

**Run Backend Tests:**

```bash
dotnet test backend/Admission.Tests/Admission.Tests.csproj --filter "FullyQualifiedName~DomainUnitTests"
```

### 2. Frontend Tests (React 18 / Vitest)

The frontend test suite uses **Vitest** and **React Testing Library**.

Test coverage includes:

- Class listing and seat availability display.
- Disabling the Apply button when no seats are available.
- 17-digit birth registration number validation.
- Bengali error message rendering.
- Retry recovery when the backend is offline.
- Administrator class creation form validation.
- Login and demo credential auto-fill.
- Parent registration form validation.

**Run Frontend Tests:**

```bash
npm --prefix frontend test -- --run
```

---

## 📁 Project Structure

```text
School-Admission-Management-System/
│
├── backend/
│   ├── Admission.API/
│   ├── Admission.Tests/
│   └── ...
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── docker-compose.yml
├── README.md
└── ...
```

*Adjust this structure to match the actual repository.*

---

## 🔮 Future Improvements

- Integrate a real payment gateway.
- Add SMS and email admission notifications.
- Implement advanced admission reporting and analytics.
- Add audit logs for administrator activities.
- Introduce automated load testing for large-scale admission periods.
- Add admission document uploads and verification.

---

## 👨‍💻 Project Information

**Project:** School Admission Management System  
**Backend:** ASP.NET Core 8  
**Frontend:** React 18 + TypeScript  
**Database:** PostgreSQL 16

---

**Developed with C#, ASP.NET Core, PostgreSQL, React, TypeScript, and Docker.**
