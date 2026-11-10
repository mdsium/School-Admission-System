# AI Usage Disclosure

## 1. Tools & Scope of Use
- **Tool Used:** Gemini / Anthropic Claude / AI Coding Assistants.
- **Scope:**
  - Generating initial project boilerplate for .NET 8 Web API and Vite React SPA.
  - Formulating PostgreSQL schema definitions and drafting xUnit concurrency tests.
  - Assisting with Bengali localization strings and CSS styling components.

---

## 2. Issues Encountered with AI & How They Were Caught and Resolved

1. **Missing Field in `GET /classes/{classId}` API Response**:
   - **AI Mistake:** The generated endpoint returned `{ c.Id, c.Name, c.TotalSeats, c.HeldSeats, c.ConfirmedSeats }`, omitting `availableSeats`.
   - **How I Caught It:** During a meticulous review of the assignment specification (Page 3 §1.4), the specification explicitly states:
     ```json
     { "id": "c_123", "name": "Class 6 - Morning Shift", "totalSeats": 120, "heldSeats": 15, "confirmedSeats": 80, "availableSeats": 25 }
     ```
     The brief emphasized: *"Response-এ বাড়তি field যোগ করতে পারেন, কিন্তু নিচের কোনো field বাদ দিতে বা তার নাম বদলাতে পারবেন না।"*
   - **Resolution:** Updated `Program.cs` to explicitly serialize `availableSeats = c.AvailableSeats`.

2. **Misinterpretation of Docker Compose Data Persistence (Rule 6)**:
   - **AI Mistake:** The AI initially assumed data should be wiped on `docker compose down`, omitting volume mapping with a comment: `# No volume on purpose: docker compose down wipes data`.
   - **How I Caught It:** Re-read Bengali requirement Section 1.5 Rule 6:
     *"App restart হলে কোনো data হারাবে না, docker compose down করে আবার docker compose up দিলেও।"*
     The requirement explicitly demanded that data must **survive** a `docker compose down` and subsequent `docker compose up`.
   - **Resolution:** Added a persistent named volume (`pgdata:/var/lib/postgresql/data`) to `docker-compose.yml`, ensuring zero data loss upon container restarts.

3. **xUnit Class Fixture Constructor Parameter Bug**:
   - **AI Mistake:** AI wrote `public AppFactory(int holdSeconds = 600)` and registered it with `IClassFixture<AppFactory>`.
   - **How I Caught It:** Running `dotnet test` resulted in:
     `Class fixture type 'Admission.Tests.AppFactory' had one or more unresolved constructor arguments: Int32 holdSeconds`.
     xUnit's default fixture activator does not support optional constructor arguments for class fixtures.
   - **Resolution:** Refactored `AppFactory` to provide a clean parameterless constructor and created dedicated subclasses (`ShortHoldFactory`) with proper configuration overrides.

4. **Vite API URL Default Fallback**:
   - **AI Mistake:** In `api.ts`, the fallback URL was hardcoded to `http://localhost:5000`.
   - **How I Caught It:** Specification Section 1.2 requires the backend to run on `http://localhost:8080`.
   - **Resolution:** Updated default client fallback to `http://localhost:8080`.

---

## 3. Decisions & Code Ownership
- Evaluated and verified the database concurrency model (`SELECT ... FOR UPDATE` row locks within ACID transactions).
- Personally designed the user interface flow, countdown timer expiration logic, admission receipt slip, and bilingual error messaging.
- Verified test coverage for race conditions, invalid inputs, and real-time expiration.
