# DevRecall — Session-Aware Project Copilot

**WeMakeDevs × FalkorDB Graph Hacks 2026**  
**Selected Track:** Track 02 — Agent Memory and Coordination

[![FalkorDB](https://img.shields.io/badge/Graph%20Database-FalkorDB-orange?style=flat-square)](https://falkordb.com/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=flat-square)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-green?style=flat-square)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/API-Express-black?style=flat-square)](https://expressjs.com/)

## Demo Video

**Demo video:** https://youtu.be/V2-x-J1Galg

watch this demonstration video

## Overview

DevRecall is a graph-powered project memory assistant designed to help developers recall previous work sessions, pending tasks, recorded decisions, bugs, and team assignments.

Instead of treating every question as an isolated conversation, DevRecall uses **FalkorDB as its graph memory layer** to represent project information and relationships between recorded entities.

### Key Goals

- **Persistent project memory:** Represent projects, tasks, bugs, people, sessions, and decisions as graph entities.
- **Contextual recall:** Retrieve relevant information from recorded project context.
- **Explainable evidence:** Show graph relationships that support a response.
- **Fact-aware suggestions:** Separate recorded information from suggested next actions.
- **Graceful fallback:** Support deterministic graph-based responses when optional LLM functionality is unavailable, where implemented.

## Selected Track

**Track 02 — Agent Memory and Coordination**

DevRecall explores how an AI project assistant can use a persistent knowledge graph to retain structured context across development sessions and help developers understand what has been recorded about their project.

## Architecture

The application uses a React frontend, a Node.js/Express backend, and FalkorDB as the graph database.

```text
Developer
   |
   v
React Frontend
   |
   v
Node.js / Express API
   |
   +----> FalkorDB Graph Memory
   |          |
   |          +---- Projects
   |          +---- Tasks
   |          +---- Bugs
   |          +---- People
   |          +---- Decisions
   |          +---- Sessions
   |
   +----> Optional LLM Integration
              |
              v
       Grounded Response
```

FalkorDB is the central graph storage layer. The backend retrieves graph records and prepares information for the frontend.

## Knowledge Graph Model

The graph can represent the following entity types, depending on the records created in the application.

| Node label | Purpose |
|---|---|
| `Project` | Represents a project |
| `Task` | Represents a development task |
| `Bug` | Represents a defect or issue |
| `Person` | Represents a team member |
| `Decision` | Represents a recorded technical decision |
| `Session` | Represents a development session |

### Relationship Types

| Relationship | Meaning |
|---|---|
| `HAS_TASK` | A project contains a task |
| `HAS_BUG` | A project tracks a bug |
| `HAS_DECISION` | A project records a decision |
| `MENTIONED` | A session references a task |
| `RECORDED` | A session records a decision |
| `ASSIGNED_TO` | A bug is assigned to a person |

The graph's actual contents depend on the memories recorded in the configured FalkorDB instance.

## Core Features

### 1. Project Memory and Recall

Ask questions about previously recorded project information, such as:

- What work is still pending?
- What happened in the last session?
- Which person is assigned to a bug?
- What decisions have been recorded?

Answers depend on the available graph records and the query support implemented by the backend.

### 2. Evidence-Grounded Responses

DevRecall is designed to use stored graph information as evidence for project-related answers. Its evidence trail can expose relationships used to support a response.

A relationship should not be assumed merely because two records belong to the same project.

### 3. Graph Memory Explorer

The frontend provides a way to inspect graph entities and relationships, helping developers understand how recorded project information is connected.

### 4. Memory Creation

The backend supports recording task or decision memories through its memory API, subject to the validation and duplicate-handling logic implemented in the application.

### 5. Optional LLM Integration

An optional Google Gemini integration may be configured for response generation. When the integration is not configured or a request fails, available graph-based fallback behavior depends on the backend implementation.

## Example Cypher Queries

These are representative FalkorDB/Cypher query patterns for exploring project memory. Check the current backend implementation before assuming every example is used verbatim.

### Inspect graph nodes

```cypher
MATCH (n)
RETURN id(n) AS id, labels(n) AS labels, properties(n) AS properties;
```

### Inspect graph relationships

```cypher
MATCH (a)-[r]->(b)
RETURN
  id(a) AS fromId,
  labels(a) AS fromLabels,
  type(r) AS relationship,
  id(b) AS toId,
  labels(b) AS toLabels;
```

### Find pending tasks

```cypher
MATCH (t:Task)
WHERE toLower(toString(t.status)) = 'pending'
RETURN
  id(t) AS id,
  coalesce(t.title, t.task, '') AS title,
  t.status AS status;
```

### Find bug assignments

```cypher
MATCH (b:Bug)-[:ASSIGNED_TO]->(p:Person)
RETURN b.title AS bug, p.name AS assignee;
```

## Tech Stack

- **Graph database:** FalkorDB
- **Backend:** Node.js and Express
- **Frontend:** React and Vite
- **Language:** JavaScript
- **Database client:** `falkordb`
- **Configuration:** `dotenv`
- **Optional LLM:** Google Gemini API

## Local Setup

### Prerequisites

- Node.js and npm
- Access to a FalkorDB instance
- Git

A Gemini API key is optional if the application supports graph-based fallback without it.

### 1. Clone the repository

```bash
git clone https://github.com/Ashutosh1122p/DevRecall.git
cd DevRecall
```

### 2. Configure the backend

Create a `.env` file inside `backend/`. Use the connection format supported by your installed FalkorDB client and configured server.

Example configuration:

```env
FALKORDB_URL=your_falkordb_connection_url
FALKORDB_GRAPH=devrecall
PORT=5000

# Optional: configure only if using Gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=your_supported_gemini_model
```

Use the variable names expected by `backend/server.js`. If your backend uses host/port settings instead of a connection URL, follow its existing configuration.

**Security:** Never commit `.env` files, passwords, or API keys to GitHub.

### 3. Install backend dependencies

```bash
cd backend
npm install
```

### 4. Install frontend dependencies

Open a second terminal:

```bash
cd frontend
npm install
```

### 5. Start the backend

From the backend directory:

```bash
npm start
```

Check the startup message for the actual backend URL and port.

### 6. Start the frontend

From the frontend directory:

```bash
npm run dev
```

Open the local URL printed by Vite, commonly `http://localhost:5173`.

## API Overview

The following endpoints describe the intended API surface. Confirm availability and request formats against the current `backend/server.js`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | Backend health check, if configured |
| `GET` | `/api/graph` | Retrieve graph topology, if configured |
| `GET` | `/api/recall` | Submit a recall question through query parameters, if supported |
| `POST` | `/api/recall` | Submit a recall question in a JSON body, if supported |
| `POST` | `/api/memory` | Create a task or decision memory, if configured |
| `PUT` | `/api/memory` | Update a memory, if configured |

## Configuration and Troubleshooting

### FalkorDB connection issues

- Confirm the database instance is active.
- Check the hostname, port, username, and password.
- Use the connection scheme supported by your FalkorDB deployment.
- Review backend logs for authentication or TLS errors.

### Gemini API issues

- Verify the API key and model configuration if Gemini is enabled.
- Check provider quotas and rate limits.
- Do not expose API keys in source files, screenshots, or public commits.

### Frontend connection issues

- Confirm the backend is running.
- Check the API base URL used by the frontend.
- Review browser developer tools and backend logs for failed requests.

## AI Assistant Disclosure

AI-assisted development tools were used during the development process, including Antigravity for coding assistance and documentation support.

The developer remains responsible for reviewing the submitted code, verifying behavior, testing the application, and ensuring that the project meets the hackathon's requirements.

## Submission Checklist

- [ ] Verify that the GitHub repository is public or accessible to the evaluators.
- [ ] Test the application using the intended FalkorDB instance.
- [ ] Verify the documented API endpoints against the current code.
- [ ] Record and add the demo video link.
- [ ] Confirm that no real credentials or `.env` files are committed.
- [ ] Confirm the selected track in the hackathon submission portal.
- [ ] Review the final README and repository contents before submission.

---

**Built for Graph Hacks 2026 — WeMakeDevs × FalkorDB**
