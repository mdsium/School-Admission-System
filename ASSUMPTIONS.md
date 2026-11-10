# ASSUMPTIONS & DESIGN DECISIONS

This document describes the architectural assumptions, domain decisions, and concurrency design choices made for the **School Admission System**.

---

## 1. Core Domain Assumptions

1. **Student Identity (No Login)**:
   - As per the brief, authentication is purely identity-based using the student's 17-digit birth registration number (`X-Student-Id` header).
   - Validation strictly enforces exactly 17 ASCII digits.
   - For real production systems, OTP or SSO with password/biometrics would be layered on top; for this evaluation exercise, this lightweight, stateless identity model matches the specification perfectly.

2. **Single Live Application per Class**:
   - A student may have at most **one live application** (`HELD` or `CONFIRMED`) per class.
   - A student *can* apply to different classes (or different shifts of the same grade) concurrently, as each shift is modeled as an independent "class" with its own seat allocation.
   - If an application expires or is explicitly cancelled by the student, the student is allowed to apply again for that class.

3. **Seat Accounting & Available Seat Invariant**:
   - `availableSeats = totalSeats − confirmedSeats − activeHeldSeats`
   - Active held seats are defined as `Status == HELD AND ExpiresAt > now_utc`.
   - Any hold where `ExpiresAt <= now_utc` immediately ceases to consume seat capacity, even before the background sweeper updates its status column.

4. **Hold Expiry Architecture (Lazy Enforcement + Background Sweeper)**:
   - **Correctness never depends on a background timer or polling job.**
   - All seat-counting queries, hold creations, and confirmations evaluate `ExpiresAt > DateTime.UtcNow`. Therefore, at the precise millisecond a hold expires, its seat is instantaneously available to new applicants.
   - A hosted background service (`ExpirySweeper`) runs every 10 seconds solely as a housekeeping mechanism to flip stale rows to `EXPIRED` for database tidiness.

5. **Payment Simulation (Confirm Endpoint)**:
   - Per the brief, clicking "ভর্তি ফি দিন" (Pay Fee) simulates successful payment.
   - Only the original applicant (owner) whose student ID matches the hold can confirm.
   - Confirmation is only allowed while the hold is in `HELD` status and not expired.
   - Confirming an already confirmed hold returns `409 Conflict`.
   - Repeated/duplicate confirm requests do not increase `confirmedSeats` multiple times.

6. **Cancellation**:
   - Only the applicant who holds the reservation can cancel it (`DELETE /holds/{holdId}`).
   - Cancelling a `HELD` reservation immediately transitions it to `CANCELLED` (frees the seat) and returns `204 No Content`.
   - Cancelling an already `CONFIRMED` admission returns `409 Conflict` (school policy: confirmed admissions cannot be self-cancelled without administrative refund processing).
   - Cancelling an already expired or cancelled hold is idempotent and returns `204 No Content`.

7. **Error Codes & Status Codes**:
   - `400 Bad Request`: Invalid or malformed inputs (non-17-digit student ID, negative or zero total seats, empty class name).
   - `403 Forbidden`: Attempting to confirm or cancel a hold belonging to a different student ID.
   - `404 Not Found`: Unknown class ID or hold ID.
   - `409 Conflict`: Business rule conflicts (seats exhausted, duplicate active hold by same student, hold expired, or already confirmed).
   - `500 Internal Server Error`: Reserved only for unhandled system failures; all expected edge cases return appropriate 4xx status codes.

8. **Data Persistence Across Restarts**:
   - In compliance with Section 1.5 Rule 6 ("App restart হলে কোনো data হারাবে না, docker compose down করে আবার docker compose up দিলেও"), the database data is persisted using a named Docker volume (`pgdata:/var/lib/postgresql/data`).
   - `EnsureCreatedAsync()` creates the schema on the initial boot and safely preserves existing schema and data on subsequent restarts.

9. **Identifiers**:
   - Classes and Holds use prefixed alphanumeric IDs (`c_...` and `h_...`) to match the assignment examples, offering human-friendly URL readability.

---

## 2. Bonus: Multi-Process Concurrency Guarantee

### Scenario:
Two or more separate backend processes running on different ports (e.g., behind a load balancer or as independent instances) against the same PostgreSQL database.

### How Concurrency Safety (Rule 1: "Never Oversell") is Guaranteed:

1. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**:
   - Before evaluating seat availability or inserting/updating holds, the transaction issues:
     ```sql
     SELECT 1 FROM classes WHERE "Id" = @classId FOR UPDATE;
     ```
   - In PostgreSQL, `FOR UPDATE` acquires an exclusive row lock on the class record.
   - **Engine-Level Serialization**: If Instance A on port 8080 and Instance B on port 8081 both receive simultaneous hold requests for the same class, one transaction will acquire the row lock while the other transaction is queued in PostgreSQL until the first commits or rolls back.
   - This ensures the read-check-write cycle (`Count(held + confirmed) -> Compare with totalSeats -> Insert hold`) is completely atomic across all backend instances.
   - Different classes run on distinct row locks and therefore execute concurrently without blocking each other.

2. **Database-Level Partial Unique Index**:
   - To guard against race conditions where the same student submits multiple parallel requests across different backend processes simultaneously, PostgreSQL enforces a partial unique constraint:
     ```sql
     CREATE UNIQUE INDEX ux_holds_one_live_per_student_class 
     ON holds ("ClassId", "StudentId") 
     WHERE "Status" IN ('HELD', 'CONFIRMED');
     ```
   - Even if application-level locking were somehow bypassed, PostgreSQL guarantees at the storage engine level that a student can never obtain duplicate active holds in the same class.

---

## 3. Bonus: Automated Frontend Testing
- Comprehensive end-to-end component tests are written using **Vitest** and **React Testing Library**.
- The tests verify:
  1. Class listing and real-time seat availability rendering.
  2. Disabling the "আবেদন করুন" button when a class has 0 available seats.
  3. Proper validation and persistence of 17-digit student IDs in `localStorage`.
  4. Graceful Bengali error display and retry mechanics when the backend is unreachable (zero blank pages).
  5. Admin class creation form validation and submission.
