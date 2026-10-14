import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Ensure the app does not auto-listen during tests.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { default: app } = await import("../server.js");

let server;
let token;

const agent = () => request(server);

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  // Log in once and reuse the token for authenticated requests.
  const res = await agent()
    .post("/api/login")
    .send({ email: "admin@viek.test", password: "password123" });
  token = res.body.token;
  assert.ok(token, "login should return a token");
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe("Authentication", () => {
  test("rejects invalid credentials with 401", async () => {
    const res = await agent()
      .post("/api/login")
      .send({ email: "admin@viek.test", password: "wrong-password" });
    assert.equal(res.status, 401);
    assert.match(res.body.message, /invalid email or password/i);
  });

  test("does not leak the password or hash in the response", async () => {
    const res = await agent()
      .post("/api/login")
      .send({ email: "admin@viek.test", password: "password123" });
    assert.equal(res.status, 200);
    assert.ok(res.body.user);
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.user.email, "admin@viek.test");
  });

  test("returns a signed JWT (not the static demo token)", async () => {
    const res = await agent()
      .post("/api/login")
      .send({ email: "admin@viek.test", password: "password123" });
    assert.equal(res.status, 200);
    assert.notEqual(res.body.token, "demo-token");
    // JWTs have three base64url segments separated by dots.
    assert.equal(res.body.token.split(".").length, 3);
  });

  test("requires a token for protected routes", async () => {
    const res = await agent().get("/api/clients");
    assert.equal(res.status, 401);
  });

  test("rejects a malformed/forged token", async () => {
    const res = await agent()
      .get("/api/clients")
      .set("Authorization", "Bearer not-a-real-token");
    assert.equal(res.status, 401);
  });
});

describe("Clients API", () => {
  test("returns the seeded clients under the data key", async () => {
    const res = await agent()
      .get("/api/clients")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data), "response should contain a data array");
    assert.ok(res.body.data.length >= 2);
  });

  test("adds a new client and returns it under the data key", async () => {
    const res = await agent()
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Client", email: "test@client.test" });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.name, "Test Client");
    assert.equal(res.body.data.email, "test@client.test");
    assert.equal(typeof res.body.data.id, "number");
  });

  test("rejects a client with missing fields", async () => {
    const res = await agent()
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "", email: "" });
    assert.equal(res.status, 400);
  });

  test("rejects a client with an invalid email", async () => {
    const res = await agent()
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "No Email", email: "not-an-email" });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /email/i);
  });

  test("deletes a client by numeric id (regression: string/number coercion)", async () => {
    // Create then delete, proving the numeric comparison now works.
    const created = await agent()
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "To Delete", email: "delete@client.test" });
    const id = created.body.data.id;

    const res = await agent()
      .delete(`/api/clients/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.body.message, /deleted successfully/i);
  });

  test("returns 404 when deleting a client that does not exist", async () => {
    const res = await agent()
      .delete("/api/clients/999999")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 404);
  });

  test("does not reuse ids after a deletion", async () => {
    const a = await agent()
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Client A", email: "a@client.test" });
    const idA = a.body.data.id;

    await agent().delete(`/api/clients/${idA}`).set("Authorization", `Bearer ${token}`);

    const b = await agent()
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Client B", email: "b@client.test" });
    // The new id must be greater than the deleted one (monotonic).
    assert.ok(b.body.data.id > idA, "ids should not be reused after deletion");
  });
});

describe("Projects API", () => {
  test("returns all projects when no filter is applied", async () => {
    const res = await agent()
      .get("/api/projects")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 3);
  });

  test("filters projects by clientId (regression: string/number coercion)", async () => {
    const res = await agent()
      .get("/api/projects?clientId=1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.data.every((p) => p.clientId === 1));
  });

  test("returns a single project for clientId=2", async () => {
    const res = await agent()
      .get("/api/projects?clientId=2")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, "Mobile Application");
  });

  test("returns 400 for a non-numeric clientId filter", async () => {
    const res = await agent()
      .get("/api/projects?clientId=abc")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 400);
  });
});

describe("Error handling", () => {
  test("returns 400 for malformed JSON instead of crashing", async () => {
    const res = await agent()
      .post("/api/login")
      .set("Content-Type", "application/json")
      .send("{ this is not valid json ");
    assert.equal(res.status, 400);
    assert.match(res.body.message, /invalid json/i);
  });

  test("returns 404 JSON for unknown API routes", async () => {
    const res = await agent()
      .get("/api/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 404);
    assert.ok(res.body.message);
  });
});

