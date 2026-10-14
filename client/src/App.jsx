import { useEffect, useState } from "react";

const API_URL = "http://localhost:4000/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [email, setEmail] = useState("admin@viek.test");
  const [password, setPassword] = useState("password123");
  const [clients, setClients] = useState([]);
  // FIX: initialise as an empty array so .map() is always safe to call
  // (previously this was useState() -> undefined).
  const [projects, setProjects] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function setStatus(text, error = false) {
    setMessage(text);
    setIsError(error);
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setClients([]);
    setProjects([]);
    setSelectedClient("");
    setStatus("");
  }

  async function login(event) {
    event.preventDefault();
    setStatus("");
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus(result.message || "Login failed", true);
        return;
      }
      localStorage.setItem("token", result.token);
      setToken(result.token);
      setPassword("");
    } catch (error) {
      setStatus("Unable to reach the server. Please try again.", true);
    }
  }

  async function loadClients() {
    try {
      const response = await fetch(`${API_URL}/clients`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.status === 401) {
        logout();
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setStatus(result.message || "Failed to load clients", true);
        return;
      }
      // FIX: the API returns { data }, not { clients }.
      setClients(result.data || []);
    } catch (error) {
      setStatus("Unable to reach the server. Please try again.", true);
    }
  }

  async function loadProjects() {
    try {
      const url = selectedClient
        ? `${API_URL}/projects?clientId=${encodeURIComponent(
            selectedClient
          )}`
        : `${API_URL}/projects`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.status === 401) {
        logout();
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setStatus(result.message || "Failed to load projects", true);
        return;
      }
      // FIX: the API returns { data }, not { projects }.
      setProjects(result.data || []);
    } catch (error) {
      setStatus("Unable to reach the server. Please try again.", true);
    }
  }

  async function addClient(event) {
    event.preventDefault();
    setStatus("");
    try {
      const response = await fetch(`${API_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: clientName,
          email: clientEmail,
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) {
        setStatus(result.message || "Failed to add client", true);
        return;
      }
      setStatus("Client added successfully");
      setClientName("");
      setClientEmail("");
      loadClients();
    } catch (error) {
      setStatus("Unable to reach the server. Please try again.", true);
    }
  }

  async function deleteClient(id) {
    setStatus("");
    try {
      const response = await fetch(`${API_URL}/clients/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) {
        setStatus(result.message || "Failed to delete client", true);
        return;
      }
      setStatus(result.message || "Client deleted successfully");
      // If the deleted client was the active filter, reset the filter.
      if (String(selectedClient) === String(id)) {
        setSelectedClient("");
      }
      loadClients();
    } catch (error) {
      setStatus("Unable to reach the server. Please try again.", true);
    }
  }

  useEffect(() => {
    if (token) {
      loadClients();
      loadProjects();
    }
  }, [token, selectedClient]);

  if (!token) {
    return (
      <div className="container">
        <div className="card">
          <h1>VIEK Client Management</h1>
          <h2>Login</h2>
          <form onSubmit={login}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <button type="submit">Login</button>
          </form>
          {message && (
            <p className={isError ? "message error" : "message"}>
              {message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row">
        <h1>VIEK Client Management</h1>
        <button type="button" className="secondary" onClick={logout}>
          Log out
        </button>
      </div>
      <div className="card">
        <h2>Add Client</h2>
        <form onSubmit={addClient}>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client name"
          />
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="Client email"
          />
          <button type="submit">Add Client</button>
        </form>
        {message && (
          <p className={isError ? "message error" : "message"}>
            {message}
          </p>
        )}
      </div>
      <div className="card">
        <h2>Clients</h2>
        {clients.length === 0 ? (
          <p>No clients found.</p>
        ) : (
          <ul>
            {clients.map((client) => (
              <li key={client.id}>
                <strong>{client.name}</strong>
                <span>{client.email}</span>
                <button onClick={() => deleteClient(client.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h2>Projects</h2>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
        >
          <option value="">All Clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <strong>{project.name}</strong>
              <span>Client ID: {project.clientId}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;

