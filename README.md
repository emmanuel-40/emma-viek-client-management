# VIEK Client Management — Debugging Assessment

A small full-stack **Client Management** application (React + Vite frontend, Node.js +
Express REST API). This repository documents the debugging process for the
intentionally buggy starter application: the issues found, their root causes, the
fixes applied, how the fixes were tested, and the security concerns addressed.

---

## 1. Tech stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Frontend | React 18, Vite 5, JavaScript (JSX)           |
| Backend  | Node.js, Express 4, REST API                 |
| Auth     | JSON Web Tokens (jsonwebtoken) + bcrypt      |
| Testing  | Node.js built-in test runner + supertest     |

---

## 2. Project structure

```
viek-client-management/
├── client/                 # React + Vite frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── styles.css
├── server/                 # Express backend
│   ├── package.json
│   ├── server.js
│   ├── .env.example
│   └── tests/
│       └── api.test.js
└── README.md
```

---

## 3. Getting started

### Backend (runs on http://localhost:4000)

```bash
cd server
npm install
npm start          # or: npm run dev  (auto-restart on changes)
```

### Frontend (runs on http://localhost:5173)

Open a **second** terminal:

```bash
cd client
npm install
npm run dev
```

Then open http://localhost:5173 and log in with the seeded account:

- **Email:** `admin@viek.test`
- **Password:** `password123`

### Run the tests

```bash


## 4. Bugs identified, root causes, and solutions

Each bug is listed with what was observed, why it happened, and the fix.

### Bug 1  Client list never loads (API response shape mismatch)

- **Symptom:** After logging in, the "Clients" list stayed empty even though the
  database had seeded clients.
- **Root cause:** `GET /api/clients` returns `{ data: [...] }`, but the frontend
  read `result.clients` (always `undefined`), then called `.length`/`.map` on it.
- **Fix:** The frontend now reads `result.data` for both clients and projects, and
  the projects endpoint was standardised to also return `{ data }` (it previously
  returned `{ projects }`). The list endpoints now share one consistent contract.

### Bug 2  App crashes on first render (undefined state)

- **Symptom:** The dashboard threw `TypeError: projects.map is not a function`
  because `projects` was rendered before any request completed.
- **Root cause:** `const [projects, setProjects] = useState();` initialised the
  state to `undefined`, and the JSX called `projects.map(...)` unconditionally.
- **Fix:** Initialise with an empty array — `useState([])` — so `.map()` is always
  safe. The clients state already used `[]`; projects now matches it.

### Bug 3  Filtering projects by client always returns nothing

- **Symptom:** Choosing a client in the "Projects" dropdown showed an empty list.
- **Root cause:** `req.query.clientId` is a **string** (e.g. `"1"`), but it was
  compared to the numeric `project.clientId` with `===`. `"1" === 1` is `false`, so
  every project was filtered out.
- **Fix:** Coerce the query value to a number before comparing
  (`Number(clientId)`), with a guard that returns `400` for non-numeric input.

### Bug 4  Deleting a client never works (always "Client not found")

- **Symptom:** Clicking **Delete** returned `404 Client not found` every time.
- **Root cause:** Same type mismatch as Bug 3 — `req.params.id` is a **string**,
  compared to the numeric `client.id` with `!==`. Because `"1" !== 1` is always
  `true`, the filter never removed anything, so the length never changed and the
  endpoint reported "not found".
- **Fix:** Coerce `req.params.id` to a number (`Number(...)`) before filtering, and
  reject non-integer ids with `400`.

### Bug 5  Duplicate client ids after a deletion

- **Symptom:** Adding a client after deleting one could reuse an existing id,
  causing React `key` collisions and data-integrity issues.
- **Root cause:** New ids were generated as `clients.length + 1`, which shrinks
  after a deletion and collides with a remaining id.
- **Fix:** Introduced a monotonic `nextClientId` counter that only ever increases,
  so ids are never reused.

### Bug 6  No frontend error handling (silent failures)

- **Symptom:** If the server was down or returned an error, the UI froze with no
  feedback and the console showed unhandled promise rejections.
- **Root cause:** `fetch` calls had no `try/catch` and did not check
  `response.ok` before reading the body.
- **Fix:** Wrapped every request in `try/catch`, checked `response.ok`, and surfaced
  a user-friendly status message (styled as an error when appropriate). A `401`
  response now clears the token and returns the user to the login screen.

### Bug 7  Frontend build config was missing (React plugin never applied)

- **Symptom:** The project listed `@vitejs/plugin-react` as a dependency but there
  was no `vite.config.js`, so the plugin was never actually used.
- **Root cause:** Missing Vite configuration file.
- **Fix:** Added `client/vite.config.js` wiring up the React plugin and the dev
  server port, and added `build`/`preview` scripts to `client/package.json`.


cd server
npm test
```

---

## 5. Security concerns and how they were addressed

The starter app had several security weaknesses. They were addressed as follows.

### 5.1 Plaintext passwords (fixed)

- **Issue:** Passwords were stored in clear text in the `users` array and compared
  directly (`item.password === password`). Anyone with access to the data had every
  credential.
- **Fix:** Passwords are now stored as **bcrypt hashes** (`bcryptjs`). Login uses
  `bcrypt.compare`, and the hash is never sent to the client.

### 5.2 Static, shared authentication token (fixed)

- **Issue:** The API issued a hard-coded `"demo-token"` and the `authenticate`
  middleware only checked `authorization === "Bearer demo-token"`. Anyone who knew
  that string had permanent, full access — there was no identity, expiry, or way to
  revoke it.
- **Fix:** The server now issues a **signed JWT** (`jsonwebtoken`) containing the
  user id/email and an expiry (`JWT_EXPIRES_IN`, default 2h). The middleware verifies
  the signature and expiry. The signing secret comes from `JWT_SECRET` (see 5.5).

### 5.3 Password leaked in the login response (fixed)

- **Issue:** `/api/login` returned the entire `user` object, including the
  `password` field, straight to the browser.
- **Fix:** The response now returns a sanitized `publicUser` object
  (`{ id, name, email }`). A test explicitly asserts that `password`/`passwordHash`
  are never present.

### 5.4 Wide-open CORS (fixed)

- **Issue:** `app.use(cors())` allowed requests from **any** origin.
- **Fix:** CORS is restricted to the known frontend origin (`CLIENT_ORIGIN`, default
  `http://localhost:5173`), limited to the methods and headers the app uses.

### 5.5 Secrets and configuration (improved)

- **Issue:** Hard-coded port and a static token; no place for real secrets.
- **Fix:** `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_ORIGIN`, and `NODE_ENV`
  are now read from environment variables (see `server/.env.example`). When
  `JWT_SECRET` is not set, the app logs a security warning and uses a development
  default.

### 5.6 Error messages leaking internals (improved)

- **Issue:** The error handler returned `err.message` for any failure, which can
  leak stack/implementation details.
- **Fix:** Malformed JSON returns a clean `400`. In production (`NODE_ENV=production`)
  internal errors return a generic `"Internal server error"` message, while detailed
  messages are logged server-side only.

### 5.7 Recommendations for a production deployment

The following are out of scope for this in-memory demo but are recommended before a
real production release:

- Move data to a **real database** and hash passwords with a strong cost factor.
- Store the JWT secret and other credentials in a **secret manager**, never in code.
- Serve the frontend over **HTTPS** and consider httpOnly, secure cookies (or
  short-lived access tokens + refresh tokens) instead of `localStorage`.
- Add **rate limiting / brute-force protection** on the login endpoint.
- Add **input validation** middleware (e.g. `express-validator`/`zod`), output
  sanitisation, and security headers via `helmet`.
- Add authorization checks so users can only act on their own data.



---

## 6. Testing

### Automated tests (`cd server && npm test`)

A supertest suite (`server/tests/api.test.js`) covers the fixes end-to-end against
the running Express app. **Result: 18 tests, 0 failures.**

- **Authentication:** invalid credentials → `401`; login response does not leak the
  password/hash; the token is a signed JWT (not `"demo-token"`); missing and forged
  tokens → `401`.
- **Clients API:** list returns `{ data }`; add returns `201` with the new client;
  missing fields → `400`; invalid email → `400`; delete by numeric id succeeds
  (regression for Bug 4); deleting a non-existent id → `404`; ids are not reused
  after deletion (regression for Bug 5).
- **Projects API:** no filter returns all 3; `clientId=1` returns the 2 matching
  projects (regression for Bug 3); `clientId=2` returns 1; non-numeric filter → `400`.
- **Error handling:** malformed JSON → `400` (no crash); unknown `/api` route → JSON `404`.

### Manual / smoke test

The server was started and exercised with real HTTP requests to confirm:

1. `POST /api/login` with the seeded credentials returns a signed JWT and a
   password-free user object.
2. `GET /api/clients` (with the token) returns the seeded clients under `data`.
3. `GET /api/projects?clientId=1` returns only client 1's projects.

The frontend was also built for production (`npm run build` in `client/`) to confirm
it compiles cleanly with the new Vite/React configuration.


## 7. Reflection

- **The issue that required the most investigation:** the two **string-vs-number
  comparison bugs** (project filtering and client deletion). They looked like
  "feature not working" problems, but the root cause was subtle: Express provides
  `req.params` and `req.query` values as **strings**, so `"1" === 1` is `false`.
  This silently broke delete (always `404`) and filtering (always empty) without
  throwing an obvious error. Tracing it required understanding where the values
  originate and how strict equality treats different types.

- **General debugging approach:** I first ran/mentally traced each feature to observe
  the symptom, then followed the data from the UI (`App.jsx`) through the API request
  to the server handler to find where the actual value or shape diverged from what
  was expected. For each fix I confirmed existing behaviour still worked by adding a
  regression test. I committed the work in small, focused commits so each change is
  easy to review.

- **Anything unresolved:** No known functional issues remain. The remaining items are
  production-hardening recommendations (Section 5.7) rather than bugs.

