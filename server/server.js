import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const PORT = process.env.PORT || 4000;

// --- Configuration 
// In production these MUST be provided via environment variables.
const JWT_SECRET =
  process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const IS_PROD = process.env.NODE_ENV === "production";

if (!process.env.JWT_SECRET) {
  console.warn(
    "[security] JWT_SECRET not set. Using an insecure development default. " +
      "Set JWT_SECRET in the environment before deploying."
  );
}

// --- Middleware 
// Restrict CORS to the known frontend origin instead of allowing any origin.
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

const users = [
  {
    id: 1,
    name: "Admin User",
    email: "admin@viek.test",
    // Store only a bcrypt hash of the password, never the plaintext.
    passwordHash: bcrypt.hashSync("password123", 10),
  },
];

// Monotonic id source so ids are never reused after a deletion
// (the original used clients.length + 1, which produced duplicate ids
// once a client was removed).
let nextClientId = 1;
let clients = [
  {
    id: nextClientId++,
    name: "Acme Limited",
    email: "contact@acme.test",
  },
  {
    id: nextClientId++,
    name: "Bright Solutions",
    email: "hello@bright.test",
  },
];

const projects = [
  {
    id: 1,
    name: "Website Development",
    clientId: 1,
  },
  {
    id: 2,
    name: "Mobile Application",
    clientId: 2,
  },
  {
    id: 3,
    name: "UI/UX Design",
    clientId: 1,
  },
];

// --- Helpers 
// Wrap async route handlers so rejected promises reach the error middleware.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Never expose the password hash on the wire.
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});

// Login
app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = users.find((item) => item.email === email);
    // Always run a comparison to reduce user-enumeration timing signals.
    const hash = user ? user.passwordHash : bcrypt.hashSync("dummy", 10);
    const passwordMatches = await bcrypt.compare(String(password), hash);

    if (!user || !passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Issue a signed, expiring JWT instead of a static shared token.
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Return a sanitized user object (no password/hash).
    res.json({ token, user: publicUser(user) });
  })
);

// Authentication middleware
// Verifies a signed, expiring JWT instead of comparing against a shared
// static token.
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }
}

// Get clients
app.get("/api/clients", authenticate, (req, res) => {
  res.json({
    data: clients,
  });
});

// Add client
app.post("/api/clients", authenticate, (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim() : "";

  if (!name || !email) {
    return res.status(400).json({
      message: "Name and email are required",
    });
  }
  // Basic server-side email validation.
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({
      message: "A valid email is required",
    });
  }
  const newClient = {
    id: nextClientId++,
    name,
    email,
  };
  clients.push(newClient);
  res.status(201).json({
    data: newClient,
  });
});

// Delete client
app.delete("/api/clients/:id", authenticate, (req, res) => {
  // req.params.id is a string; coerce to a number so the comparison against
  // the numeric client.id works (previously delete always returned 404).
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({
      message: "Invalid client id",
    });
  }
  const originalLength = clients.length;
  clients = clients.filter((client) => client.id !== id);
  if (clients.length === originalLength) {
    return res.status(404).json({
      message: "Client not found",
    });
  }
  res.json({
    message: "Client deleted successfully",
  });
});

// Get projects
app.get("/api/projects", authenticate, (req, res) => {
  const { clientId } = req.query;
  let result = projects;
  if (clientId) {
    // req.query values are strings; coerce to a number so the filter matches
    // the numeric project.clientId (previously filtering returned nothing).
    const parsed = Number(clientId);
    if (Number.isNaN(parsed)) {
      return res.status(400).json({
        message: "Invalid clientId filter",
      });
    }
    result = projects.filter((project) => project.clientId === parsed);
  }
  // Standardise the response shape as { data } to match the other list
  // endpoints (previously this returned { projects }, which the client did
  // not read correctly).
  res.json({
    data: result,
  });
});

// Error handler
// Converts thrown/parse errors into JSON. Internal messages are only exposed
// outside production to avoid leaking implementation details.
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Invalid JSON body",
    });
  }
  console.error(err);
  res.status(500).json({
    message: IS_PROD ? "Internal server error" : err?.message || "Server error",
  });
});

// Only start listening when run directly (not when imported by tests).
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
export { app };
