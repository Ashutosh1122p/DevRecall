import { useState, useEffect, useMemo } from "react";
import {
  Brain,
  Search,
  LoaderCircle,
  CheckCircle2,
  PlusCircle,
  Network,
  RefreshCw,
  ArrowRight,
  User,
  Bug as BugIcon,
  CheckSquare,
  FolderGit2,
  Calendar,
  FileText,
  ShieldCheck,
  Sparkles,
  X,
  Edit,
  Trash2,
  Move,
} from "lucide-react";
import "./App.css";

const LABEL_COLORS = {
  Project: {
    bg: "#eef2ff",
    border: "#6366f1",
    text: "#4338ca",
    badge: "#4f46e5",
  },
  Task: { bg: "#fef3c7", border: "#f59e0b", text: "#b45309", badge: "#d97706" },
  Bug: { bg: "#fee2e2", border: "#ef4444", text: "#b91c1c", badge: "#dc2626" },
  Person: {
    bg: "#ecfdf5",
    border: "#10b981",
    text: "#047857",
    badge: "#059669",
  },
  Decision: {
    bg: "#e0f2fe",
    border: "#0ea5e9",
    text: "#0369a1",
    badge: "#0284c7",
  },
  Session: {
    bg: "#f3e8ff",
    border: "#a855f7",
    text: "#7e22ce",
    badge: "#9333ea",
  },
  Default: {
    bg: "#f1f5f9",
    border: "#94a3b8",
    text: "#475569",
    badge: "#64748b",
  },
};

function getNodeColor(label) {
  return LABEL_COLORS[label] || LABEL_COLORS.Default;
}

function getNodeIcon(label, size = 16) {
  switch (label) {
    case "Project":
      return <FolderGit2 size={size} />;
    case "Task":
      return <CheckSquare size={size} />;
    case "Bug":
      return <BugIcon size={size} />;
    case "Person":
      return <User size={size} />;
    case "Decision":
      return <ShieldCheck size={size} />;
    case "Session":
      return <Calendar size={size} />;
    default:
      return <FileText size={size} />;
  }
}

function truncate(str, max = 22) {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function EditMemoryForm({ node, initialAssignee, fields, persons, project, onSave, onCancel, saving, success, error }) {
  const [values, setValues] = useState(() => ({
    title: node?.properties?.title || node?.properties?.task || node?.properties?.decision || node?.properties?.name || "",
    summary: node?.properties?.summary || "",
    description: node?.properties?.description || "",
    status: node?.properties?.status || "",
    priority: node?.properties?.priority || "",
    dueDate: node?.properties?.dueDate || "",
    date: node?.properties?.date || "",
    name: node?.properties?.name || "",
    assignee: initialAssignee || "",
  }));
  const [formError, setFormError] = useState("");

  function displayTitle() {
    return node?.title || node?.properties?.name || node?.properties?.task || node?.properties?.decision || `Node #${node?.id}`;
  }

  function buildUpdates() {
    const updates = {};
    for (const f of fields) {
      if (f.type === "assignee") {
        updates.assignee = values.assignee == null ? "" : String(values.assignee).trim();
        continue;
      }
      if (f.type === "textarea" || f.type === "text") {
        const v = String(values[f.key] || "").trim();
        if (v !== "") updates[f.key] = v;
      } else if (f.type === "select") {
        const v = String(values[f.key] || "").trim();
        if (v !== "") updates[f.key] = v;
      } else if (f.type === "date") {
        const v = String(values[f.key] || "").trim();
        updates[f.key] = v === "" ? null : v;
      }
    }
    return updates;
  }

  function validate() {
    for (const f of fields) {
      if (f.type === "assignee") continue;
      if (f.required && !String(values[f.key] || "").trim()) {
        return `${f.label} is required.`;
      }
    }
    if (node?.label === "Session") {
      const updates = buildUpdates();
      if (!updates.summary && updates.date == null) {
        return "Summary is required for a session.";
      }
    }
    return null;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError("");
    onSave(buildUpdates());
  }

  return (
    <form className="memory-form edit-memory-form" onSubmit={handleSubmit}>
      <div className="inspector-header">
        <div className="inspector-title">
          <Edit size={14} />
          <span>Edit {node?.label}</span>
        </div>
        <button
          type="button"
          className="close-btn"
          onClick={onCancel}
          title="Cancel editing"
        >
          <X size={16} />
        </button>
      </div>
      <p className="form-desc">
        Updating <strong>{displayTitle()}</strong> in <strong>{project}</strong>.
      </p>
      <div className="form-field">
        <label>
          FalkorDB ID:
          <span className="node-id-tag">{node?.id}</span>
        </label>
      </div>
      {fields.map((f) => {
        if (f.type === "assignee") {
          return (
            <div key={f.key} className="form-field">
              <label>
                {f.label}
                <select
                  value={values.assignee || ""}
                  onChange={(e) => setValues({ ...values, assignee: e.target.value })}
                >
                  <option value="">(Unassign)</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.name || ""}>
                      {p.name || ""}
                    </option>
                  ))}
                </select>
                <span className="form-desc">
                  Existing Person nodes only; shared people are never deleted.
                </span>
              </label>
            </div>
          );
        }
        return (
          <div key={f.key} className="form-field">
            <label>
              {f.label}
              {f.required && <span className="required"> *</span>}
              {f.type === "textarea" ? (
                <textarea
                  value={values[f.key] || ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  rows={3}
                />
              ) : f.type === "select" ? (
                <select
                  value={values[f.key] || ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                >
                  <option value="">Select...</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type}
                  value={values[f.key] || ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </label>
            {f.required && <span className="form-desc">Required</span>}
          </div>
        );
      })}
      <div className="form-actions">
        <button type="button" className="toggle-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={16} /> : "Save Changes"}
        </button>
      </div>
      {success && <div className="success-banner">{success}</div>}
      {formError && <div className="error-banner">{formError}</div>}
      {error && <div className="error-banner">{error}</div>}
    </form>
  );
}

function App() {
  const [question, setQuestion] = useState("");
  const [memories, setMemories] = useState([]);
  const [answer, setAnswer] = useState("");
  const [recordedFacts, setRecordedFacts] = useState("");
  const [suggestedAction, setSuggestedAction] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Memory creation state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formType, setFormType] = useState("task");
  const [formAssignee, setFormAssignee] = useState("");
  const [formRelation, setFormRelation] = useState("");
  const [formRelatedTitle, setFormRelatedTitle] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formStatus, setFormStatus] = useState("todo");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  // Project management state
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("DevRecall");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectSuccess, setProjectSuccess] = useState("");
  const [projectError, setProjectError] = useState("");
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);

  // Graph Memory Explorer state
  const [graphData, setGraphData] = useState({
    nodes: [],
    edges: [],
    stats: { nodeCount: 0, edgeCount: 0, labels: [], relationshipTypes: [] },
  });
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [graphViewMode, setGraphViewMode] = useState("map"); // "map" | "cards"

  // Shared Person nodes (used for reassignment dropdowns).
  const [persons, setPersons] = useState([]);

  // Edit memory form state.
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState("");
  const [editError, setEditError] = useState("");

  // Relationship action state.
  const [removingRelId, setRemovingRelId] = useState(null);
  const [newRelType, setNewRelType] = useState("");
  const [newRelTargetId, setNewRelTargetId] = useState(null);
  const [relSaving, setRelSaving] = useState(false);
  const [relError, setRelError] = useState("");

  // Move to project state.
  const [moveTargetProject, setMoveTargetProject] = useState("");
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [moveSaving, setMoveSaving] = useState(false);

  // Permanent delete confirmation state.
  const [deletingNodeId, setDeletingNodeId] = useState(null);

  async function fetchProjects() {
    try {
      const res = await fetch("http://localhost:5000/api/projects");
      if (!res.ok) throw new Error("Could not load projects");
      const data = await res.json();
      const list = Array.isArray(data.projects) ? data.projects : [];
      setProjects(list);
      const active = list.filter((p) => !p.archived);
      if (
        active.length > 0 &&
        !active.some((p) => p.name === selectedProject)
      ) {
        setSelectedProject(
          active.some((p) => p.name === "DevRecall")
            ? "DevRecall"
            : active[0].name,
        );
      }
    } catch (err) {
      setProjectError(err.message || "Could not load projects");
    }
  }

  async function handleCreateProject(e) {
    e.preventDefault();
    const name = newProjectName.trim();
    if (name.length < 2) {
      setProjectError("Project name must be at least 2 characters long.");
      return;
    }

    setProjectSaving(true);
    setProjectError("");
    setProjectSuccess("");

    try {
      const res = await fetch("http://localhost:5000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newProjectDescription.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create project");

      setProjects((current) =>
        [...current, data.project].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSelectedProject(data.project.name);
      setProjectSuccess(`Project "${data.project.name}" created successfully.`);
      setNewProjectName("");
      setNewProjectDescription("");
      setShowProjectForm(false);
      fetchGraphData();
    } catch (err) {
      setProjectError(err.message || "Could not create project");
    } finally {
      setProjectSaving(false);
    }
  }

  async function handleArchiveProject() {
    const project = projects.find((p) => p.name === selectedProject);
    if (!project || project.archived) return;

    const confirmed = window.confirm(
      `Archive "${project.name}"? It will be hidden from the active project list. All graph data and memories will be preserved, and you can restore it later.`,
    );
    if (!confirmed) return;

    setProjectActionBusy(true);
    setProjectError("");
    setProjectSuccess("");
    try {
      const res = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(project.name)}/archive`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not archive project");

      const active = projects.filter(
        (p) => !p.archived && p.name !== project.name,
      );
      if (active.length === 0) {
        throw new Error(
          "The project was not archived because at least one active project must remain.",
        );
      }
      setProjects((current) =>
        current.map((p) => (p.name === project.name ? data.project : p)),
      );
      setSelectedProject(
        active.some((p) => p.name === "DevRecall")
          ? "DevRecall"
          : active[0].name,
      );
      setProjectSuccess(
        `Project "${project.name}" archived. Its graph data and memories are preserved.`,
      );
      setShowArchivedProjects(true);
      fetchGraphData();
    } catch (err) {
      setProjectError(err.message || "Could not archive project");
      fetchProjects();
    } finally {
      setProjectActionBusy(false);
    }
  }

  async function handleRestoreProject(project) {
    if (!project?.archived) return;
    const confirmed = window.confirm(
      `Restore "${project.name}" to the active project list?`,
    );
    if (!confirmed) return;

    setProjectActionBusy(true);
    setProjectError("");
    setProjectSuccess("");
    try {
      const res = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(project.name)}/archive`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: false }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not restore project");
      setProjects((current) =>
        current.map((p) => (p.name === project.name ? data.project : p)),
      );
      setSelectedProject(project.name);
      setProjectSuccess(
        `Project "${project.name}" restored. Its existing memories are available again.`,
      );
      fetchGraphData();
    } catch (err) {
      setProjectError(err.message || "Could not restore project");
    } finally {
      setProjectActionBusy(false);
    }
  }

  async function fetchGraphData(projectName = selectedProject) {
    setGraphLoading(true);
    setGraphError("");
    try {
      const res = await fetch(`http://localhost:5000/api/graph?projectName=${encodeURIComponent(projectName)}`);
      if (!res.ok) {
        throw new Error("Failed to load graph data from FalkorDB");
      }
      const data = await res.json();
      setGraphData({
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        edges: Array.isArray(data.edges) ? data.edges : [],
        stats: data.stats || {
          nodeCount: 0,
          edgeCount: 0,
          labels: [],
          relationshipTypes: [],
        },
      });
    } catch (err) {
      setGraphError(err.message || "Could not retrieve graph from FalkorDB");
    } finally {
      setGraphLoading(false);
    }
  }

  async function fetchPersons() {
    try {
      const res = await fetch("http://localhost:5000/api/persons");
      if (!res.ok) throw new Error("Could not load people");
      const data = await res.json();
      setPersons(Array.isArray(data.persons) ? data.persons : []);
    } catch {
      // People are optional for reassignment; fail silently so the editor still opens.
    }
  }

  useEffect(() => {
    let ignore = false;
    async function loadInitialGraph() {
      try {
        const res = await fetch(`http://localhost:5000/api/graph?projectName=${encodeURIComponent(selectedProject)}`);
        if (!res.ok) throw new Error("Failed to load graph data from FalkorDB");
        const data = await res.json();
        if (!ignore) {
          setGraphData({
            nodes: Array.isArray(data.nodes) ? data.nodes : [],
            edges: Array.isArray(data.edges) ? data.edges : [],
            stats: data.stats || {
              nodeCount: 0,
              edgeCount: 0,
              labels: [],
              relationshipTypes: [],
            },
          });
        }
      } catch (err) {
        if (!ignore) {
          setGraphError(
            err.message || "Could not retrieve graph from FalkorDB",
          );
        }
      }
    }
    loadInitialGraph();
    fetchProjects();
    fetchPersons();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    fetchGraphData(selectedProject);
  }, [selectedProject]);

  async function recallMemory(customQuestion) {
    setLoading(true);
    setError("");
    setAnswer("");
    setRecordedFacts("");
    setSuggestedAction("");
    setEvidence(null);
    setMemories([]);

    const text = customQuestion !== undefined ? customQuestion : question;

    try {
      const url = text.trim()
        ? `http://localhost:5000/api/recall?question=${encodeURIComponent(text.trim())}&projectName=${encodeURIComponent(selectedProject)}`
        : `http://localhost:5000/api/recall?projectName=${encodeURIComponent(selectedProject)}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : data.memories || [];
      setMemories(list);
      if (data.answer) {
        setAnswer(data.answer);
      }
      if (data.recordedFacts) {
        setRecordedFacts(data.recordedFacts);
      }
      if (data.suggestedAction) {
        setSuggestedAction(data.suggestedAction);
      }
      if (data.evidence) {
        setEvidence(data.evidence);
      }

      if (list.length === 0 && !data.answer) {
        setError("No relevant memories found in the graph.");
      }
    } catch {
      setError("Could not connect to the backend. Check that it is running.");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickQuestion(q) {
    setQuestion(q);
    recallMemory(q);
  }

  async function handleSaveMemory(e) {
    e.preventDefault();
    if (!formTitle.trim()) {
      setSaveError("Title is required.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const res = await fetch("http://localhost:5000/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          title: formTitle.trim(),
          summary: formSummary.trim(),
          status: formStatus,
          assignee: formAssignee.trim(),
          relation: formRelation,
          relatedTitle: formRelatedTitle.trim(),
          projectName: selectedProject,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save memory");
      }

      setSaveSuccess(
        `Successfully ${data.action} ${data.memory.type}: "${data.memory.title}" in ${selectedProject} graph!`,
      );
      setFormTitle("");
      setFormSummary("");
      setFormAssignee("");
      setFormRelation("");
      setFormRelatedTitle("");

      // Refresh graph explorer to display newly created node and relationship
      fetchGraphData();

      // Automatically recall new memory to verify retrieval
      const queryToRefresh =
        formType === "task"
          ? "What work is still pending?"
          : "What decision did we make?";
      setQuestion(queryToRefresh);
      recallMemory(queryToRefresh);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- Edit Memory ----------

  function openEditNode() {
    if (!selectedNode) return;
    setEditingNodeId(selectedNode.id);
    setEditSuccess("");
    setEditError("");
    const el = document.getElementById("graph-explorer-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  function handleEditCancel() {
    setEditingNodeId(null);
  }

  async function handleEditSave(updates) {
    if (!selectedNode) return;
    setEditError("");
    setEditSuccess("");
    setEditSaving(true);
    try {
      const res = await fetch(`http://localhost:5000/api/memory/${selectedNode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: selectedProject, updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update memory");

      setEditSuccess(`Saved changes to "${nodeDisplayTitle(selectedNode)}".`);
      await fetchGraphData();
      const stillThere = graphData.nodes.find((n) => n.id === selectedNode.id);
      if (stillThere) setSelectedNodeId(selectedNode.id);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  // ---------- Relationships ----------

  async function handleRemoveRelationship(edge) {
    if (!selectedNode) return;
    const confirmed = window.confirm(
      `Remove the "${edge.type}" relationship from "${edge.fromTitle}" to "${edge.toTitle}"?\n\nThis deletes only the relationship, not the nodes.`
    );
    if (!confirmed) return;
    setRemovingRelId(edge.id);
    setRelError("");
    setRelSaving(true);
    try {
      const res = await fetch("http://localhost:5000/api/relationship", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: edge.from, toId: edge.to, type: edge.type, projectName: selectedProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove relationship");
      await fetchGraphData();
    } catch (err) {
      setRelError(err.message);
    } finally {
      setRemovingRelId(null);
      setRelSaving(false);
    }
  }

  async function handleAddRelationship() {
    if (!selectedNode) return;
    setRelError("");
    if (!newRelType || !newRelTargetId) {
      setRelError("Select a relationship type and a target node.");
      return;
    }
    if (newRelTargetId === selectedNode.id) {
      setRelError("A node cannot be related to itself.");
      return;
    }
    setRelSaving(true);
    try {
      const res = await fetch("http://localhost:5000/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: selectedNode.id, toId: newRelTargetId, type: newRelType, projectName: selectedProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create relationship");
      setNewRelType("");
      setNewRelTargetId(null);
      await fetchGraphData();
    } catch (err) {
      setRelError(err.message);
    } finally {
      setRelSaving(false);
    }
  }

  // ---------- Move to Project ----------

  async function handleMoveToProject() {
    if (!selectedNode) return;
    if (selectedNode.label === "Project") {
      setEditError("Project nodes cannot be moved.");
      return;
    }
    const targets = projects.filter((p) => !p.archived && p.name !== selectedProject);
    if (targets.length === 0) {
      setEditError("No other active project exists to move this memory to.");
      return;
    }
    setMoveTargetProject("");
    setMoveConfirm(true);
  }

  async function handleMoveConfirm(e) {
    e.preventDefault();
    if (!selectedNode || !moveTargetProject) return;
    const title = nodeDisplayTitle(selectedNode);
    setMoveSaving(true);
    try {
      const res = await fetch(`http://localhost:5000/api/memory/${selectedNode.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: selectedProject, targetProjectName: moveTargetProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not move memory");

      setMoveSaving(false);
      setMoveConfirm(false);
      setMoveTargetProject("");
      setSelectedNodeId(null);
      await fetchGraphData();
      const cross = Array.isArray(data.preservedRelationships)
        ? data.preservedRelationships.filter((r) => !r.projects || !r.projects.includes(moveTargetProject)).length
        : 0;
      setEditSuccess(
        `"${title}" moved from ${selectedProject} to ${moveTargetProject}. ${data.preservedRelationships?.length ?? 0} relationship(s) preserved${
          cross > 0 ? ` (${cross} now connect across projects)` : ""
        }.`
      );
    } catch (err) {
      setEditError(err.message);
    } finally {
      setMoveSaving(false);
    }
  }

  // ---------- Archive / Restore / Delete Memory ----------

  async function handleArchiveMemory(archive) {
    if (!selectedNode) return;
    if (selectedNode.label === "Person") {
      setEditError("Person nodes are shared across projects and cannot be archived.");
      return;
    }
    const confirmed = window.confirm(
      `${archive ? "Archive" : "Restore"} "${nodeDisplayTitle(selectedNode)}"?`
    );
    if (!confirmed) return;
    setEditSaving(true);
    try {
      const res = await fetch(`http://localhost:5000/api/memory/${selectedNode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: selectedProject, updates: { archived: archive } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not ${archive ? "archive" : "restore"} memory`);
      await fetchGraphData();
      setEditSuccess(`"${nodeDisplayTitle(selectedNode)}" ${archive ? "archived" : "restored"}.`);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteMemory() {
    if (!selectedNode) return;
    if (selectedNode.label === "Person") {
      setEditError("Person nodes are shared across projects and cannot be deleted.");
      return;
    }
    const confirmed = window.confirm(
      `Permanently delete "${nodeDisplayTitle(selectedNode)}" (${selectedNode.label})?\n\nThis removes the node and its relationships. Shared people and other connected nodes are preserved.`
    );
    if (!confirmed) return;
    setDeletingNodeId(selectedNode.id);
    setRelSaving(true);
    try {
      const res = await fetch(
        `http://localhost:5000/api/memory/${selectedNode.id}?confirm=true&projectName=${encodeURIComponent(selectedProject)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete memory");
      await fetchGraphData();
      setSelectedNodeId(null);
      setEditSuccess(`"${nodeDisplayTitle(selectedNode)}" deleted.`);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setDeletingNodeId(null);
      setRelSaving(false);
    }
  }

  // Calculate SVG layout coordinates for nodes deterministically
  const nodePositions = useMemo(() => {
    const nodes = graphData.nodes || [];
    if (nodes.length === 0) return new Map();

    const positions = new Map();
    const width = 800;
    const height = 420;
    const centerX = width / 2;
    const centerY = height / 2;

    const projectNodes = nodes.filter((n) => n.label === "Project");
    const otherNodes = nodes.filter((n) => n.label !== "Project");

    if (projectNodes.length > 0) {
      projectNodes.forEach((p, idx) => {
        const offset = (idx - (projectNodes.length - 1) / 2) * 80;
        positions.set(p.id, { x: centerX + offset, y: centerY });
      });

      const radiusX = 290;
      const radiusY = 140;
      const count = otherNodes.length;

      otherNodes.forEach((node, i) => {
        const angle = (i / Math.max(count, 1)) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radiusX * Math.cos(angle);
        const y = centerY + radiusY * Math.sin(angle);
        positions.set(node.id, { x, y });
      });
    } else {
      const radiusX = 280;
      const radiusY = 135;
      const count = nodes.length;

      nodes.forEach((node, i) => {
        const angle = (i / Math.max(count, 1)) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radiusX * Math.cos(angle);
        const y = centerY + radiusY * Math.sin(angle);
        positions.set(node.id, { x, y });
      });
    }

    return positions;
  }, [graphData.nodes]);

  // Set of node IDs that form the active supporting evidence trail
  const evidenceNodeIds = useMemo(() => {
    const ids = new Set();
    if (!evidence?.trail || evidence.trail.length === 0) return ids;

    evidence.trail.forEach((hop) => {
      const hopFromClean = (hop.from?.title || "")
        .replace(/^Session\s+/i, "")
        .toLowerCase();
      const matchFrom = graphData.nodes.find(
        (n) =>
          n.label === hop.from.label &&
          ((n.title || "").toLowerCase().includes(hopFromClean) ||
            (n.properties?.name || "").toLowerCase().includes(hopFromClean) ||
            (n.properties?.title || "").toLowerCase().includes(hopFromClean)),
      );
      if (matchFrom) ids.add(matchFrom.id);

      const hopToClean = (hop.to?.title || "")
        .replace(/^Session\s+/i, "")
        .toLowerCase();
      const matchTo = graphData.nodes.find(
        (n) =>
          n.label === hop.to.label &&
          ((n.title || "").toLowerCase().includes(hopToClean) ||
            (n.properties?.title || "").toLowerCase().includes(hopToClean) ||
            (n.properties?.task || "").toLowerCase().includes(hopToClean) ||
            (n.properties?.decision || "").toLowerCase().includes(hopToClean) ||
            (n.properties?.name || "").toLowerCase().includes(hopToClean)),
      );
      if (matchTo) ids.add(matchTo.id);
    });

    return ids;
  }, [evidence, graphData.nodes]);

  function handleSelectNodeByTitle(title, label) {
    if (!title) return;
    const cleanTitle = title.replace(/^Session\s+/i, "").toLowerCase();
    const match = graphData.nodes.find((n) => {
      const matchLabel = !label || n.label === label;
      const nTitle = (n.title || "").toLowerCase();
      const pName = (n.properties?.name || "").toLowerCase();
      const pTitle = (n.properties?.title || "").toLowerCase();
      const pTask = (n.properties?.task || "").toLowerCase();
      const pDecision = (n.properties?.decision || "").toLowerCase();
      const pDate = (n.properties?.date || "").toLowerCase();

      return (
        matchLabel &&
        (nTitle.includes(cleanTitle) ||
          cleanTitle.includes(nTitle) ||
          pName === cleanTitle ||
          pTitle === cleanTitle ||
          pTask === cleanTitle ||
          pDecision === cleanTitle ||
          pDate === cleanTitle)
      );
    });

    if (match) {
      setSelectedNodeId(match.id);
      const el = document.getElementById("graph-explorer-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  }

  const selectedNode = useMemo(() => {
    if (selectedNodeId === null) return null;
    return graphData.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graphData.nodes]);

  const selectedNodeEdges = useMemo(() => {
    if (selectedNodeId === null) return { incoming: [], outgoing: [] };
    return {
      incoming: graphData.edges.filter((e) => e.to === selectedNodeId),
      outgoing: graphData.edges.filter((e) => e.from === selectedNodeId),
    };
  }, [selectedNodeId, graphData.edges]);

  const filteredEdges = useMemo(() => {
    if (selectedFilter === "All") return graphData.edges;
    return graphData.edges.filter(
      (e) => e.fromLabel === selectedFilter || e.toLabel === selectedFilter,
    );
  }, [selectedFilter, graphData.edges]);

  const filterCounts = useMemo(() => {
    const counts = { All: graphData.nodes.length };
    graphData.nodes.forEach((n) => {
      counts[n.label] = (counts[n.label] || 0) + 1;
    });
    return counts;
  }, [graphData.nodes]);

  // Relationship endpoint rules (mirrors backend validation).
  const RELATIONSHIP_RULES = {
    HAS_TASK: { sources: ["Project"], targets: ["Task"] },
    HAS_DECISION: { sources: ["Project"], targets: ["Decision"] },
    HAS_SESSION: { sources: ["Project"], targets: ["Session"] },
    HAS_BUG: { sources: ["Project"], targets: ["Bug"] },
    ASSIGNED_TO: { sources: ["Task", "Bug"], targets: ["Person"] },
    MENTIONED: { sources: ["Session"], targets: ["Task", "Bug"] },
    RECORDED: { sources: ["Session"], targets: ["Decision"] },
    DEPENDS_ON: { sources: ["Task"], targets: ["Task"] },
    RESOLVED_BY: { sources: ["Bug"], targets: ["Task"] },
  };

  // Current assignee of the selected Task or Bug (from ASSIGNED_TO edge).
  function currentAssignee() {
    if (!selectedNode || (selectedNode.label !== "Task" && selectedNode.label !== "Bug")) return null;
    const rel = selectedNodeEdges.outgoing.find((e) => e.type === "ASSIGNED_TO");
    if (!rel) return null;
    const person = graphData.nodes.find((n) => n.id === rel.to && n.label === "Person");
    return person ? (person.properties?.name || person.title || "") : null;
  }

  // Editable fields per node label, matching backend EDITABLE_FIELDS.
  const EDIT_FIELDS = {
    Task: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "summary", label: "Summary / Context", type: "textarea" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "status", label: "Status", type: "select", options: ["todo", "in_progress", "blocked", "completed"] },
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "critical"] },
      { key: "dueDate", label: "Due Date", type: "date" },
      { key: "assignee", label: "Assignee", type: "assignee" },
    ],
    Bug: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "summary", label: "Summary / Context", type: "textarea" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "status", label: "Status", type: "select", options: ["open", "in_progress", "blocked", "resolved"] },
      { key: "assignee", label: "Assignee", type: "assignee" },
    ],
    Decision: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "summary", label: "Summary / Context", type: "textarea" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "status", label: "Status", type: "select", options: ["recorded", "approved"] },
    ],
    Session: [
      { key: "summary", label: "Summary / Context", type: "textarea", required: true },
      { key: "date", label: "Date", type: "date" },
    ],
    Person: [
      { key: "name", label: "Name", type: "text", required: true },
    ],
  };

  function relationshipTypesFor(label) {
    return Object.entries(RELATIONSHIP_RULES)
      .filter(([, rule]) => rule.sources.includes(label))
      .map(([type]) => type);
  }

  function targetLabelsFor(type) {
    return RELATIONSHIP_RULES[type]?.targets || [];
  }

  function targetNodesFor(type) {
    const allowed = new Set(targetLabelsFor(type));
    return graphData.nodes.filter(
      (n) => n.id !== selectedNodeId && allowed.has(n.label)
    );
  }

  function nodeDisplayTitle(node) {
    return node.title || node.properties?.name || node.properties?.task || node.properties?.decision || `Node #${node.id}`;
  }

  return (
    <main className="app">
      <header className="header">
        <div className="logo">
          <Brain size={26} />
        </div>
        <div>
          <h1>DevRecall</h1>
          <p>Your project's connected memory</p>
        </div>
        <span className="status">FalkorDB Graph</span>
      </header>

      <section className="hero">
        <p className="eyebrow">PROJECT MEMORY AGENT</p>
        <h2>Never lose track of your work.</h2>
        <p>
          Ask questions to retrieve pending tasks, assigned bugs, or decisions
          from your FalkorDB graph.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            recallMemory();
          }}
        >
          <Search size={20} />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask: What work is still pending?"
            aria-label="Ask about project memory"
          />
          <button disabled={loading} type="submit">
            {loading ? <LoaderCircle className="spin" size={18} /> : "Recall"}
          </button>
        </form>

        <div className="examples">
          <span className="examples-label">Copilot Questions:</span>
          <button
            type="button"
            className="example-btn copilot-btn"
            onClick={() =>
              handleQuickQuestion("What happened in our last session?")
            }
          >
            Last session summary
          </button>
          <button
            type="button"
            className="example-btn copilot-btn"
            onClick={() =>
              handleQuickQuestion(
                "What is still pending from the previous session?",
              )
            }
          >
            Pending from session
          </button>
          <button
            type="button"
            className="example-btn copilot-btn"
            onClick={() =>
              handleQuickQuestion(
                "Which decisions affect the unresolved login bug?",
              )
            }
          >
            Decisions & Login Bug
          </button>
          <button
            type="button"
            className="example-btn copilot-btn"
            onClick={() =>
              handleQuickQuestion(
                "What should I work on next, based on our recorded project context?",
              )
            }
          >
            Next priority action
          </button>
          <button
            type="button"
            className="example-btn copilot-btn"
            onClick={() =>
              handleQuickQuestion(
                "What did we decide earlier, and what related task remains unfinished?",
              )
            }
          >
            Decisions & Unfinished tasks
          </button>
        </div>

        <div className="project-toolbar">
          <label className="project-select-label">
            Current project :
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              aria-label="Select project for new memories"
            >
              {projects.filter((project) => !project.archived).length === 0 && (
                <option value="DevRecall">DevRecall</option>
              )}
              {projects
                .filter((project) => !project.archived)
                .map((project) => (
                  <option key={project.name} value={project.name}>
                    {project.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="toggle-btn"
            disabled={
              projectActionBusy ||
              projects.filter((p) => !p.archived).length <= 1
            }
            title={
              projects.filter((p) => !p.archived).length <= 1
                ? "Keep at least one active project"
                : "Archive selected project without deleting its data"
            }
            onClick={handleArchiveProject}
          >
            {projectActionBusy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <FolderGit2 size={16} />
            )}
            Archive Selected
          </button>
          <button
            type="button"
            className="toggle-btn"
            onClick={() => {
              setShowProjectForm((open) => !open);
              setProjectError("");
              setProjectSuccess("");
            }}
          >
            <PlusCircle size={16} />
            {showProjectForm ? "Cancel New Project" : "+ Add New Project"}
          </button>
        </div>

        {showProjectForm && (
          <form
            className="memory-form project-form"
            onSubmit={handleCreateProject}
          >
            <h4>Create a New Project</h4>
            <p className="form-desc">
              This adds a separate Project node to FalkorDB. Existing project
              data will remain unchanged.
            </p>
            <div className="form-field">
              <label>
                Project name
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. EvalX — AI Exam Evaluation"
                  required
                  minLength={2}
                />
              </label>
            </div>
            <div className="form-field">
              <label>
                Description
                <input
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="What is this project about?"
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={projectSaving}>
                {projectSaving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  "Create Project"
                )}
              </button>
            </div>
          </form>
        )}
        <div className="archived-projects-toolbar">
          <button
            type="button"
            className="toggle-btn"
            onClick={() => setShowArchivedProjects((show) => !show)}
          >
            {showArchivedProjects
              ? "Hide Archived Projects"
              : `Show Archived Projects (${projects.filter((p) => p.archived).length})`}
          </button>
        </div>
        {showArchivedProjects && projects.some((p) => p.archived) && (
          <div className="archived-project-list">
            <h4>Archived projects</h4>
            <p className="form-desc">
              Archived projects are hidden from the active selector. Their graph
              nodes, relationships, and memories remain stored.
            </p>
            {projects
              .filter((p) => p.archived)
              .map((project) => (
                <div className="archived-project-row" key={project.name}>
                  <div>
                    <strong>{project.name}</strong>
                    {project.description && (
                      <p className="form-desc">{project.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="toggle-btn"
                    disabled={projectActionBusy}
                    onClick={() => handleRestoreProject(project)}
                  >
                    Restore
                  </button>
                </div>
              ))}
          </div>
        )}
        {projectSuccess && (
          <div className="success-banner">{projectSuccess}</div>
        )}
        {projectError && <div className="error-banner">{projectError}</div>}

        <div className="section-toggle">
          <button
            type="button"
            className="toggle-btn"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <PlusCircle size={16} />
            {showAddForm ? "Hide Memory Form" : "+ Record New Memory"}
          </button>
        </div>

        {showAddForm && (
          <form className="memory-form" onSubmit={handleSaveMemory}>
            <h4>Explicitly Record Project Memory</h4>
            <p className="form-desc">
              Record a task, decision, session, bug, person, or note in <strong>{selectedProject}</strong>. Relationships are saved to the graph.
            </p>

            <div className="form-row">
              <label>
                Memory Type:
                <select
                  value={formType}
                  onChange={(e) => {
                    const t = e.target.value;
                    setFormType(t);
                    if (t === "decision") setFormStatus("recorded");
                    else if (t === "session") setFormStatus("recorded");
                    else if (t === "bug") setFormStatus("open");
                    else if (t === "task") setFormStatus("todo");
                    else setFormStatus("recorded");
                  }}
                >
                  <option value="task">Task (e.g. pending work)</option>
                  <option value="decision">Decision</option>
                  <option value="session">Session</option>
                  <option value="bug">Bug</option>
                  <option value="person">Person</option>
                  <option value="note">Note / Knowledge</option>
                  <option value="milestone">Milestone</option>
                  <option value="question">Question / Issue</option>
                </select>
              </label>

              <label>
                Status:
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                >
                  {formType === "task" ? (
                    <>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="completed">Completed</option>
                    </>
                  ) : formType === "bug" ? (
                    <>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="resolved">Resolved</option>
                    </>
                  ) : (
                    <>
                      <option value="recorded">Recorded</option>
                      <option value="approved">Approved</option>
                    </>
                  )}
                </select>
              </label>
            </div>

            <div className="form-field">
              <label>
                Title:
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={
                    formType === "task" ? "e.g. Document authentication API" : formType === "bug" ? "e.g. Login token expires early" : formType === "session" ? "e.g. Debugged authentication flow" : formType === "person" ? "e.g. Rahul" : "Enter a clear title"
                  }
                  required
                />
              </label>
            </div>

            <div className="form-field">
              <label>
                Summary / Context:
                <input
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  placeholder="Context, session notes, or rationale..."
                />
              </label>
            </div>

            {(formType === "session" || formType === "task" || formType === "bug") && (
              <div className="form-row">
                <label>
                  Link relationship (optional):
                  <select value={formRelation} onChange={(e) => setFormRelation(e.target.value)}>
                    <option value="">Only connect to this project</option>
                    {formType === "session" && <option value="MENTIONED">MENTIONED — session discusses task/bug</option>}
                    {formType === "session" && <option value="RECORDED">RECORDED — session records decision</option>}
                    {formType === "task" && <option value="DEPENDS_ON">DEPENDS_ON — task depends on another task</option>}
                    {formType === "bug" && <option value="RESOLVED_BY">RESOLVED_BY — bug fixed by a task</option>}
                  </select>
                </label>
                {formRelation && (
                  <label>
                    Related item title:
                    <input value={formRelatedTitle} onChange={(e) => setFormRelatedTitle(e.target.value)} placeholder={formRelation === "MENTIONED" ? "Existing Task or Bug title" : formRelation === "RECORDED" ? "Existing Decision title" : formRelation === "DEPENDS_ON" ? "Existing Task title" : "Existing fix Task title"} required />
                  </label>
                )}
              </div>
            )}

            {(formType === "bug" || formType === "task") && (
              <div className="form-field">
                <label>Assign to (optional):
                  <input value={formAssignee} onChange={(e) => setFormAssignee(e.target.value)} placeholder="Person / teammate name — creates ASSIGNED_TO link" />
                </label>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  "Save to Graph"
                )}
              </button>
            </div>

            {saveSuccess && <div className="success-banner">{saveSuccess}</div>}
            {saveError && <div className="error-banner">{saveError}</div>}
          </form>
        )}
      </section>

      {/* RECALL RESULTS & EVIDENCE TRAIL */}
      <section className="results">
        <h3>Retrieved memories</h3>

        {loading && <p>Searching graph memory...</p>}
        {error && <p className="message">{error}</p>}

        {answer && (
          <div className="answer-card">
            <div className="answer-header">
              <span className="answer-label">Agent Answer</span>
              {evidence?.llmAssisted ? (
                <span className="llm-badge">
                  LLM Grounded · {evidence.model}
                </span>
              ) : (
                <span className="grounded-badge">Graph Grounded</span>
              )}
            </div>
            <p className="answer-text">{answer}</p>

            {/* Structured Facts vs Suggestion Distinction */}
            {(recordedFacts || suggestedAction) && (
              <div className="copilot-breakdown-container">
                {recordedFacts && (
                  <div className="copilot-facts-card">
                    <div className="copilot-card-header">
                      <ShieldCheck size={14} className="facts-icon" />
                      <span className="copilot-card-badge facts-badge">
                        Recorded Graph Facts
                      </span>
                    </div>
                    <p className="copilot-card-text">{recordedFacts}</p>
                  </div>
                )}

                {suggestedAction && (
                  <div className="copilot-suggestion-card">
                    <div className="copilot-card-header">
                      <Sparkles size={14} className="suggestion-icon" />
                      <span className="copilot-card-badge suggestion-badge">
                        Suggested Next Action
                      </span>
                      <span className="rec-tag">Recommendation</span>
                    </div>
                    <p className="copilot-card-text">{suggestedAction}</p>
                  </div>
                )}
              </div>
            )}

            {/* Evidence Trail Component */}
            {evidence?.trail && evidence.trail.length > 0 ? (
              <div className="evidence-trail-section">
                <div className="evidence-trail-header">
                  <div className="evidence-trail-title">
                    <Sparkles size={15} />
                    <span>Supporting Evidence Trail</span>
                  </div>
                  <span className="trail-count-badge">
                    {evidence.trail.length}{" "}
                    {evidence.trail.length === 1
                      ? "graph relationship"
                      : "graph relationships"}
                  </span>
                </div>
                <p className="evidence-trail-sub">
                  Grounding records retrieved from FalkorDB supporting this
                  answer (click any node to locate in Graph Explorer):
                </p>

                <div className="trail-hops-grid">
                  {evidence.trail.map((hop, idx) => {
                    const fromColors = getNodeColor(hop.from.label);
                    const toColors = getNodeColor(hop.to.label);
                    return (
                      <div key={idx} className="trail-hop-card">
                        <div
                          className="node-chip clickable-chip"
                          onClick={() =>
                            handleSelectNodeByTitle(
                              hop.from.title,
                              hop.from.label,
                            )
                          }
                          title={`Click to view ${hop.from.label} in Graph Explorer`}
                          style={{
                            background: fromColors.bg,
                            borderColor: fromColors.border,
                            color: fromColors.text,
                          }}
                        >
                          {getNodeIcon(hop.from.label, 14)}
                          <span className="node-chip-label">
                            {hop.from.label}:
                          </span>
                          <span
                            className="node-chip-title"
                            title={hop.from.title}
                          >
                            {hop.from.title}
                          </span>
                        </div>

                        <div className="trail-edge-connector">
                          <span className="rel-badge">{hop.relationship}</span>
                          <ArrowRight size={14} className="rel-arrow" />
                        </div>

                        <div
                          className="node-chip clickable-chip"
                          onClick={() =>
                            handleSelectNodeByTitle(hop.to.title, hop.to.label)
                          }
                          title={`Click to view ${hop.to.label} in Graph Explorer`}
                          style={{
                            background: toColors.bg,
                            borderColor: toColors.border,
                            color: toColors.text,
                          }}
                        >
                          {getNodeIcon(hop.to.label, 14)}
                          <span className="node-chip-label">
                            {hop.to.label}:
                          </span>
                          <span
                            className="node-chip-title"
                            title={hop.to.title}
                          >
                            {hop.to.title}
                          </span>
                          {hop.to.status && (
                            <span
                              className={`status-pill status-${hop.to.status.toLowerCase()}`}
                            >
                              {hop.to.status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              evidence && (
                <div className="evidence-empty-note">
                  <ShieldCheck size={14} />
                  <span>
                    Grounding verification: {evidence.recordCount || 0} matching
                    records in FalkorDB graph memory.
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {memories.map((memory, index) => (
          <article
            className="memory"
            key={`${memory.task || memory.title}-${index}`}
          >
            <CheckCircle2 size={22} />
            <div>
              <h4>{memory.task || memory.title}</h4>
              <p>{memory.summary}</p>
              <small>
                {memory.type ? `[${memory.type}] ` : ""}
                {memory.date ? `Session: ${memory.date} · ` : ""}
                {memory.status ? `Status: ${memory.status}` : ""}
                {memory.assignee ? ` · Assignee: ${memory.assignee}` : ""}
                {memory.project ? ` · Project: ${memory.project}` : ""}
              </small>
            </div>
          </article>
        ))}
      </section>

      {/* GRAPH MEMORY EXPLORER */}
      <section className="graph-explorer" id="graph-explorer-section">
        <div className="explorer-header">
          <div>
            <div className="explorer-title-row">
              <Network size={22} className="explorer-icon" />
              <h3>Graph Memory Explorer</h3>
              <span className="live-graph-badge">Live FalkorDB Graph</span>
            </div>
            <p className="explorer-desc">
              Explore nodes and verified relationships stored in FalkorDB Cloud
              (graph: devrecall).
            </p>
          </div>

          <div className="explorer-controls">
            <div className="view-toggle">
              <button
                type="button"
                className={`view-btn ${graphViewMode === "map" ? "active" : ""}`}
                onClick={() => setGraphViewMode("map")}
              >
                Topology Map
              </button>
              <button
                type="button"
                className={`view-btn ${graphViewMode === "cards" ? "active" : ""}`}
                onClick={() => setGraphViewMode("cards")}
              >
                Relationships
              </button>
            </div>

            <button
              type="button"
              className="refresh-btn"
              onClick={fetchGraphData}
              disabled={graphLoading}
              title="Refresh graph from FalkorDB"
            >
              <RefreshCw size={14} className={graphLoading ? "spin" : ""} />
              {graphLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Graph Stats Bar */}
        <div className="graph-stats-bar">
          <div className="stat-pill">
            <strong>{graphData.stats.nodeCount}</strong> Nodes
          </div>
          <div className="stat-pill">
            <strong>{graphData.stats.edgeCount}</strong> Relationships
          </div>
          <div className="stats-divider" />
          <div className="node-type-stats">
            {["Project", "Task", "Bug", "Person", "Decision", "Session"].map(
              (lbl) => {
                const count = filterCounts[lbl] || 0;
                if (count === 0) return null;
                const color = getNodeColor(lbl);
                return (
                  <span
                    key={lbl}
                    className="type-tag"
                    style={{
                      background: color.bg,
                      color: color.text,
                      borderColor: color.border,
                    }}
                  >
                    {getNodeIcon(lbl, 12)}
                    {lbl} ({count})
                  </span>
                );
              },
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="explorer-filters">
          <span className="filter-label">Filter:</span>
          {[
            "All",
            "Project",
            "Task",
            "Bug",
            "Person",
            "Decision",
            "Session",
          ].map((lbl) => {
            const count = filterCounts[lbl] || 0;
            const isSelected = selectedFilter === lbl;
            return (
              <button
                key={lbl}
                type="button"
                className={`filter-pill ${isSelected ? "active" : ""}`}
                onClick={() => setSelectedFilter(lbl)}
              >
                {lbl}
                <span className="pill-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Loading State */}
        {graphLoading && graphData.nodes.length === 0 && (
          <div className="graph-state-container">
            <LoaderCircle className="spin" size={28} />
            <p>Retrieving graph memory topology from FalkorDB Cloud...</p>
          </div>
        )}

        {/* Error State */}
        {graphError && (
          <div className="graph-error-banner">
            <p>
              <strong>Graph Connection Error:</strong> {graphError}
            </p>
            <button
              type="button"
              onClick={fetchGraphData}
              className="retry-btn"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!graphLoading && !graphError && graphData.nodes.length === 0 && (
          <div className="graph-state-container empty-graph">
            <Network size={36} className="empty-icon" />
            <h4>No memories found in graph</h4>
            <p>
              The FalkorDB graph "devrecall" currently contains no nodes or
              relationships. Use the "+ Record New Memory" form above to create
              your first task or decision.
            </p>
          </div>
        )}

        {/* Main Graph Content */}
        {!graphLoading && graphData.nodes.length > 0 && (
          <>
            {graphViewMode === "map" ? (
              <div className="svg-container">
                <svg
                  viewBox="0 0 800 420"
                  className="graph-svg"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <marker
                      id="graph-arrow"
                      viewBox="0 0 10 10"
                      refX="28"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#94a3b8" />
                    </marker>
                    <marker
                      id="graph-arrow-active"
                      viewBox="0 0 10 10"
                      refX="28"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#4f46e5" />
                    </marker>
                    <marker
                      id="graph-arrow-evidence"
                      viewBox="0 0 10 10"
                      refX="28"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#f59e0b" />
                    </marker>
                  </defs>

                  {/* Edges */}
                  {graphData.edges.map((edge) => {
                    const fromPos = nodePositions.get(edge.from);
                    const toPos = nodePositions.get(edge.to);
                    if (!fromPos || !toPos) return null;

                    const isEdgeActive =
                      selectedNodeId === edge.from ||
                      selectedNodeId === edge.to;
                    const isEvidenceEdge =
                      evidenceNodeIds.has(edge.from) &&
                      evidenceNodeIds.has(edge.to);
                    const isFilterMatch =
                      selectedFilter === "All" ||
                      edge.fromLabel === selectedFilter ||
                      edge.toLabel === selectedFilter;

                    const midX = (fromPos.x + toPos.x) / 2;
                    const midY = (fromPos.y + toPos.y) / 2;
                    const labelWidth = Math.max(
                      64,
                      edge.type.length * 6.5 + 14,
                    );

                    const strokeColor = isEdgeActive
                      ? "#4f46e5"
                      : isEvidenceEdge
                        ? "#f59e0b"
                        : isFilterMatch
                          ? "#94a3b8"
                          : "#e2e8f0";

                    const markerEndUrl = isEdgeActive
                      ? "url(#graph-arrow-active)"
                      : isEvidenceEdge
                        ? "url(#graph-arrow-evidence)"
                        : "url(#graph-arrow)";

                    return (
                      <g key={edge.id} className="svg-edge-group">
                        <line
                          x1={fromPos.x}
                          y1={fromPos.y}
                          x2={toPos.x}
                          y2={toPos.y}
                          stroke={strokeColor}
                          strokeWidth={
                            isEdgeActive ? 2.5 : isEvidenceEdge ? 2 : 1.5
                          }
                          strokeDasharray={
                            edge.type === "MENTIONED" ? "4 3" : undefined
                          }
                          markerEnd={markerEndUrl}
                          opacity={isFilterMatch ? 1 : 0.25}
                        />
                        <g
                          transform={`translate(${midX}, ${midY})`}
                          opacity={isFilterMatch ? 1 : 0.2}
                        >
                          <rect
                            x={-labelWidth / 2}
                            y="-9"
                            width={labelWidth}
                            height="18"
                            rx="9"
                            fill="white"
                            stroke={
                              isEdgeActive
                                ? "#4f46e5"
                                : isEvidenceEdge
                                  ? "#f59e0b"
                                  : "#cbd5e1"
                            }
                            strokeWidth={
                              isEdgeActive || isEvidenceEdge ? "1.5" : "1"
                            }
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="8.5"
                            fontWeight="700"
                            fill={
                              isEdgeActive
                                ? "#4338ca"
                                : isEvidenceEdge
                                  ? "#b45309"
                                  : "#64748b"
                            }
                          >
                            {edge.type}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {graphData.nodes.map((node) => {
                    const pos = nodePositions.get(node.id);
                    if (!pos) return null;

                    const isSelected = selectedNodeId === node.id;
                    const isEvidence = evidenceNodeIds.has(node.id);
                    const isFilterMatch =
                      selectedFilter === "All" || node.label === selectedFilter;
                    const colors = getNodeColor(node.label);

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        className="svg-node-group"
                        onClick={() =>
                          setSelectedNodeId(isSelected ? null : node.id)
                        }
                        style={{
                          cursor: "pointer",
                          opacity: isFilterMatch ? 1 : 0.25,
                        }}
                      >
                        {isSelected && (
                          <circle
                            r="28"
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="3"
                            strokeDasharray="4 2"
                            className="selected-pulse"
                          />
                        )}
                        {isEvidence && !isSelected && (
                          <circle
                            r="27"
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2.5"
                            strokeDasharray="4 2"
                            className="evidence-pulse"
                          />
                        )}
                        <circle
                          r="22"
                          fill={colors.bg}
                          stroke={
                            isSelected
                              ? "#4f46e5"
                              : isEvidence
                                ? "#f59e0b"
                                : colors.border
                          }
                          strokeWidth={isSelected || isEvidence ? "3" : "2"}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="9.5"
                          fontWeight="800"
                          fill={colors.text}
                        >
                          {node.label.slice(0, 4).toUpperCase()}
                        </text>
                        <text
                          textAnchor="middle"
                          y="34"
                          fontSize="11"
                          fontWeight="600"
                          fill="#1e293b"
                          className="svg-node-title"
                        >
                          {truncate(node.title, 18)}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div className="canvas-hint">
                  <span>
                    Click any node to inspect properties and connected
                    relationships · Golden rings indicate active query evidence
                  </span>
                </div>
              </div>
            ) : (
              /* Relationship Cards View */
              <div className="relationships-grid">
                {filteredEdges.length === 0 ? (
                  <div className="empty-filter-note">
                    <p>
                      No relationships found involving "{selectedFilter}" nodes.
                    </p>
                  </div>
                ) : (
                  filteredEdges.map((edge) => {
                    const fromColors = getNodeColor(edge.fromLabel);
                    const toColors = getNodeColor(edge.toLabel);
                    return (
                      <div key={edge.id} className="rel-card">
                        <div
                          className="node-chip"
                          style={{
                            background: fromColors.bg,
                            borderColor: fromColors.border,
                            color: fromColors.text,
                          }}
                        >
                          {getNodeIcon(edge.fromLabel, 14)}
                          <span className="node-chip-label">
                            {edge.fromLabel}:
                          </span>
                          <span
                            className="node-chip-title"
                            title={edge.fromTitle}
                          >
                            {edge.fromTitle}
                          </span>
                        </div>

                        <div className="rel-card-arrow">
                          <span className="rel-badge">{edge.type}</span>
                          <ArrowRight size={14} className="rel-arrow" />
                        </div>

                        <div
                          className="node-chip"
                          style={{
                            background: toColors.bg,
                            borderColor: toColors.border,
                            color: toColors.text,
                          }}
                        >
                          {getNodeIcon(edge.toLabel, 14)}
                          <span className="node-chip-label">
                            {edge.toLabel}:
                          </span>
                          <span
                            className="node-chip-title"
                            title={edge.toTitle}
                          >
                            {edge.toTitle}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Selected Node Inspector Panel */}
            {selectedNode && (
              <div className="node-inspector">
                <div className="inspector-header">
                  <div className="inspector-title">
                    <span
                      className="inspector-type-badge"
                      style={{
                        background: getNodeColor(selectedNode.label).bg,
                        color: getNodeColor(selectedNode.label).text,
                        borderColor: getNodeColor(selectedNode.label).border,
                      }}
                    >
                      {getNodeIcon(selectedNode.label, 14)}
                      {selectedNode.label}
                    </span>
                    <h4>{selectedNode.title}</h4>
                    <span className="node-id-tag">ID: {selectedNode.id}</span>
                    {selectedNode.properties?.archived && (
                      <span
                        className="inspector-type-badge"
                        style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }}
                      >
                        Archived
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="close-btn"
                    onClick={() => setSelectedNodeId(null)}
                    title="Close inspector"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="inspector-content">
                  <div className="inspector-props">
                    <h5>FalkorDB Node Properties</h5>
                    <div className="props-list">
                      {(selectedNode.label === "Task" || selectedNode.label === "Bug") && currentAssignee() && (
                        <div className="prop-row">
                          <span className="prop-key">Assignee:</span>
                          <span className="prop-val">{currentAssignee()}</span>
                        </div>
                      )}
                      {Object.entries(selectedNode.properties || {}).map(
                        ([k, v]) => (
                          <div key={k} className="prop-row">
                            <span className="prop-key">{k}:</span>
                            <span className="prop-val">{String(v)}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="inspector-relations">
                    <h5>Connected Graph Relationships</h5>
                    <div className="relations-summary">
                      {selectedNodeEdges.incoming.length === 0 &&
                      selectedNodeEdges.outgoing.length === 0 ? (
                        <p className="no-rel">
                          No direct relationships found for this node.
                        </p>
                      ) : (
                        <>
                          {selectedNodeEdges.outgoing.map((e) => (
                            <div key={e.id} className="rel-item outgoing">
                              <span className="direction-tag">OUT</span>
                              <span className="rel-type">-[{e.type}]-&gt;</span>
                              <span className="target-node">
                                {e.toLabel}: <strong>{e.toTitle}</strong>
                              </span>
                              <button
                                type="button"
                                className="remove-rel-btn"
                                disabled={removingRelId === e.id || relSaving}
                                onClick={() => handleRemoveRelationship(e)}
                                title={`Remove ${e.type} relationship`}
                              >
                                {removingRelId === e.id ? (
                                  <LoaderCircle className="spin" size={12} />
                                ) : (
                                  "Remove"
                                )}
                              </button>
                            </div>
                          ))}
                          {selectedNodeEdges.incoming.map((e) => (
                            <div key={e.id} className="rel-item incoming">
                              <span className="direction-tag">IN</span>
                              <span className="target-node">
                                {e.fromLabel}: <strong>{e.fromTitle}</strong>
                              </span>
                              <span className="rel-type">-[{e.type}]-&gt;</span>
                              <span className="target-node">this</span>
                              <button
                                type="button"
                                className="remove-rel-btn"
                                disabled={removingRelId === e.id || relSaving}
                                onClick={() => handleRemoveRelationship(e)}
                                title={`Remove ${e.type} relationship`}
                              >
                                {removingRelId === e.id ? (
                                  <LoaderCircle className="spin" size={12} />
                                ) : (
                                  "Remove"
                                )}
                              </button>
                            </div>
                          ))}
                          {editingNodeId !== selectedNodeId &&
                          relationshipTypesFor(selectedNode.label).length > 0 && (
                            <div className="rel-item add-rel">
                              <span className="direction-tag">ADD</span>
                              <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                                <select
                                  value={newRelType}
                                  onChange={(e) => setNewRelType(e.target.value)}
                                  disabled={relSaving}
                                >
                                  <option value="">Relationship type</option>
                                  {relationshipTypesFor(selectedNode.label).map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                                <select
                                  value={newRelTargetId || ""}
                                  onChange={(e) => setNewRelTargetId(Number(e.target.value) || null)}
                                  disabled={!newRelType || relSaving}
                                >
                                  <option value="">Target node</option>
                                  {targetNodesFor(newRelType).map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {nodeDisplayTitle(n)} ({n.label})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                className="add-rel-btn"
                                disabled={!newRelType || !newRelTargetId || relSaving}
                                onClick={handleAddRelationship}
                              >
                                {relSaving ? <LoaderCircle className="spin" size={12} /> : "Create"}
                              </button>
                            </div>
                          )}
                          {relError && <p className="message">{relError}</p>}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {editingNodeId === selectedNodeId ? (
                  <EditMemoryForm
                    node={selectedNode}
                    initialAssignee={currentAssignee()}
                    fields={EDIT_FIELDS[selectedNode.label] || []}
                    persons={persons}
                    project={selectedProject}
                    onSave={handleEditSave}
                    onCancel={handleEditCancel}
                    saving={editSaving}
                    success={editSuccess}
                    error={editError}
                  />
                ) : (
                  <div className="inspector-actions">
                    {selectedNode.label === "Task" || selectedNode.label === "Bug" ? (
                      <>
                        <button
                          type="button"
                          className="action-btn edit-btn"
                          onClick={openEditNode}
                          disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                        >
                          <Edit size={14} />
                          Edit Memory
                        </button>
                        {selectedNode.properties?.archived ? (
                          <button
                            type="button"
                            className="action-btn restore-btn"
                            onClick={() => handleArchiveMemory(false)}
                            disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                          >
                            Restore Memory
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="action-btn archive-btn"
                            onClick={() => handleArchiveMemory(true)}
                            disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                          >
                            Archive Memory
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-btn move-btn"
                          onClick={handleMoveToProject}
                          disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                        >
                          <Move size={14} />
                          Move to Project
                        </button>
                      </>
                    ) : selectedNode.label === "Person" ? (
                      <button
                        type="button"
                        className="action-btn edit-btn"
                        onClick={openEditNode}
                        disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                      >
                        <Edit size={14} />
                        Edit Name
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="action-btn edit-btn"
                          onClick={openEditNode}
                          disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                        >
                          <Edit size={14} />
                          Edit Memory
                        </button>
                        {selectedNode.properties?.archived ? (
                          <button
                            type="button"
                            className="action-btn restore-btn"
                            onClick={() => handleArchiveMemory(false)}
                            disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                          >
                            Restore Memory
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="action-btn archive-btn"
                            onClick={() => handleArchiveMemory(true)}
                            disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                          >
                            Archive Memory
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-btn move-btn"
                          onClick={handleMoveToProject}
                          disabled={editSaving || relSaving || moveSaving || deletingNodeId === selectedNode.id}
                        >
                          <Move size={14} />
                          Move to Project
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="action-btn danger-btn"
                      onClick={handleDeleteMemory}
                      disabled={
                        editSaving ||
                        relSaving ||
                        moveSaving ||
                        deletingNodeId === selectedNode.id ||
                        selectedNode.label === "Person"
                      }
                    >
                      {deletingNodeId === selectedNode.id ? (
                        <LoaderCircle className="spin" size={14} />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Permanently Delete
                    </button>
                  </div>
                )}
              </div>
            )}

            {moveConfirm && selectedNode && (
              <div className="memory-form move-project-form">
                <div className="inspector-header">
                  <div className="inspector-title">
                    <Move size={16} />
                    <span>Move to Project</span>
                  </div>
                  <button
                    type="button"
                    className="close-btn"
                    onClick={() => setMoveConfirm(false)}
                    title="Cancel move"
                  >
                    <X size={16} />
                  </button>
                </div>
                <p className="form-desc">
                  Move <strong>{nodeDisplayTitle(selectedNode)}</strong> from{" "}
                  <strong>{selectedProject}</strong> to another project. The node
                  itself is transferred (not cloned); its project ownership edge
                  is repointed and other relationships are preserved where valid.
                </p>
                <form onSubmit={handleMoveConfirm}>
                  <div className="form-field">
                    <label>
                      Target project:
                      <select
                        value={moveTargetProject}
                        onChange={(e) => setMoveTargetProject(e.target.value)}
                        required
                      >
                        <option value="">Select a project</option>
                        {projects
                          .filter((p) => !p.archived && p.name !== selectedProject)
                          .map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => setMoveConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={moveSaving}>
                      {moveSaving ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        "Confirm Move"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default App;
