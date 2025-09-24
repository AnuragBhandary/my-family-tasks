import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import './kanbanboard.css';

/* ---------------- Utils ---------------- */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}
function humanMonth(key) {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

/* ---------------- API helper (no auth) ---------------- */
async function api(method, body) {
  const res = await fetch('/.netlify/functions/tasks', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ---------------- Header ---------------- */
function Header({ onOpenArchives, counts, progress }) {
  return (
    <>
      <header className="app-header" style={{ justifyContent: 'space-between' }}>
        <h1 className="app-title">Anu&apos;s Task Board</h1>

        <div className="header-actions">
          <button
            className="icon-btn tooltip archive-btn"
            data-tip="Archives"
            aria-label="Archives"
            onClick={onOpenArchives}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                 viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true">
              <path d="M3 3h18v4H3V3zm2 6h14v12H5V9zm3 2v2h8v-2H8z"/>
            </svg>
          </button>
        </div>
      </header>

      <div className="progress-row">
        <div className="progress-text">Done {counts.done}/{counts.total}</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
      </div>
    </>
  );
}


/* ---------------- Stars ---------------- */
function Stars({ value, onChange, editable = false }) {
  if (!editable) {
    return (
      <div className="stars readonly" aria-label={`Priority ${value} of 5`}>
        {[1,2,3,4,5].map(n => (
          <span key={n} className={`star ${value >= n ? 'filled' : ''}`} aria-hidden="true">★</span>
        ))}
      </div>
    );
  }
  return (
    <div className="stars" role="radiogroup" aria-label="Priority">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${value >= n ? 'filled' : ''}`}
          aria-label={`Set priority ${n}`}
          aria-checked={value === n}
          role="radio"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChange(n); }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ---------------- Description/priority Modal ---------------- */
function Modal({ task, onClose, onSave }) {
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState(task.priority ?? 3);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => onSave(task.id, { description, priority });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}
           role="dialog" aria-modal="true" aria-labelledby={`edit-desc-${task.id}`}>
        <h2 id={`edit-desc-${task.id}`}>{task.title}</h2>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description..."
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontWeight: 600, color: '#374151' }}>Priority</span>
          <Stars value={priority} onChange={setPriority} editable />
        </div>

        <div className="modal-actions">
          <button onClick={handleSave} className="save-btn">Save</button>
          <button onClick={onClose} className="cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Archives Modal ---------------- */
function ArchivesModal({ archives, onClose }) {
  const months = useMemo(() => {
    const keys = Object.keys(archives || {});
    return keys.sort((a, b) => (a < b ? 1 : -1));
  }, [archives]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content archives-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="archives-title">
        <h2 id="archives-title">Archives</h2>
        {months.length === 0 ? (
          <div className="empty-archives">No archives yet.</div>
        ) : (
          <div className="archives-list">
            {months.map((key) => (
              <div key={key} className="archive-month">
                <div className="archive-month-title">{humanMonth(key)}</div>
                <ul className="archive-list">
                  {(archives[key] || []).map((t) => (
                    <li key={t.id} className="archive-item">
                      <div className="archive-row">
                        <span className="archive-title">{t.title}</span>
                        <span className="archive-date">{formatDate(t.createdAt || t.created_at)}</span>
                      </div>
                      <div className="archive-meta">
                        <span className="archive-stars" aria-hidden="true">
                          {[1,2,3,4,5].map(n => (
                            <span key={n} className={`star ${ (t.priority || 3) >= n ? 'filled' : ''}`}>★</span>
                          ))}
                        </span>
                        <span className="archive-desc">{t.description || '—'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="save-btn">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Draggable card ---------------- */
function TaskCard({ task, isDragging, onClick, onDelete, onUpdateTitle }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id });
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  useEffect(() => { setTitleDraft(task.title); }, [task.title]);

  const saveTitle = () => {
    const trimmed = titleDraft.trim();
    onUpdateTitle(task.id, trimmed || task.title);
    setEditing(false);
  };

  const style = { opacity: isDragging ? 0.35 : 1, cursor: 'grab', position: 'relative' };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="taskCard"
      data-status={task.status}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick(task);
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (confirm(`Delete "${task.title}"?\nThis can’t be undone.`)) onDelete(task.id);
        }
        if (e.key.toLowerCase() === 'e') { e.preventDefault(); setEditing(true); }
      }}
      onClick={() => onClick(task)}
      {...listeners}
      {...attributes}
    >
      <div className="card-meta">
        <span className="date-badge" aria-label={`Created on ${formatDate(task.created_at || task.createdAt)}`}>
          {formatDate(task.created_at || task.createdAt)}
        </span>

        <button
          className="icon-btn delete-btn tooltip"
          data-tip="Delete task"
          aria-label={`Delete ${task.title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${task.title}"?\nThis can’t be undone.`)) onDelete(task.id);
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
               viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true">
            <path d="M9 3v1H4v2h16V4h-5V3H9zm2 6v9h2V9h-2zm-4 0v9h2V9H7zm8 0v9h2V9h-2z"/>
          </svg>
        </button>
      </div>

      <div className="task-title-row">
        {editing ? (
          <input
            className="title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') { setTitleDraft(task.title); setEditing(false); }
            }}
            autoFocus
            aria-label="Edit task title"
          />
        ) : (
          <h3 className="task-title" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
            {task.title}
          </h3>
        )}
      </div>

      <p className="desc">{task.description || '—'}</p>

      {/* READ-ONLY stars on card */}
      <Stars value={task.priority || 3} />
    </div>
  );
}

/* ---------------- Column ---------------- */
function Column({ id, title, tasks, activeId, onCardClick, onDelete, onUpdateTitle }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="column">
      <h2>{title} <span className="count-badge">({tasks.length})</span></h2>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          isDragging={activeId === task.id}
          onClick={onCardClick}
          onDelete={onDelete}
          onUpdateTitle={onUpdateTitle}
        />
      ))}
      {tasks.length === 0 && (<div className="empty-state">Nothing here yet.</div>)}
    </div>
  );
}

/* ---------------- Main Board ---------------- */
function KanbanBoard() {
  const [tasks, setTasks] = useState([]);
  const [archives, setArchives] = useState({});
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [showArchives, setShowArchives] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Initial load: archive rollover (idempotent) then fetch
  useEffect(() => {
    (async () => {
      try {
        await api('POST', { action: 'archive_rollover' });
      } catch (e) {
        console.error('Rollover failed (safe to ignore first run):', e);
      }
      try {
        const data = await api('GET');
        setTasks(data.tasks || []);
        setArchives(data.archives || {});
      } catch (e) {
        console.error('Load failed:', e);
      }
    })();
  }, []);

  const counts = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    review: tasks.filter(t => t.status === 'review').length,
    done: tasks.filter(t => t.status === 'done').length,
  };
  const progress = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;

  const activeTask = tasks.find((t) => t.id === activeId);
  const byStatus = (status) => tasks.filter((t) => t.status === status);

  const addTask = async (e) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    try {
      const created = await api('POST', { action: 'create', title });
      setTasks(prev => [created, ...prev]);
      setNewTaskTitle('');
    } catch (e) {
      alert('Error creating task.');
      console.error(e);
    }
  };

  const deleteTask = async (id) => {
    try {
      await api('DELETE', { id });
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert('Error deleting task.');
      console.error(e);
    }
  };

  const updateTask = async (id, updates) => {
    try {
      const updated = await api('PATCH', { id, ...updates });
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...updated } : t)));
    } catch (e) {
      alert('Error updating task.');
      console.error(e);
    }
  };

  const onDragStart = (event) => setActiveId(event.active.id);
  const onDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const newStatus = over.id;
    if (typeof newStatus !== 'string') return;
    const id = active.id;
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status: newStatus } : t))); // optimistic
    await updateTask(id, { status: newStatus });
  };

  const saveModalEdits = async (id, { description, priority }) => {
    await updateTask(id, { description, priority });
    setEditingTask(null);
  };

  const updateTitle = async (id, newTitle) => {
    await updateTask(id, { title: newTitle });
  };

  return (
    <>
      <Header
        onReset={() => window.location.reload()}
        onOpenArchives={() => setShowArchives(true)}
        counts={counts}
        progress={progress}
      />

      {editingTask && (
        <Modal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={saveModalEdits}
        />
      )}

      {showArchives && (
        <ArchivesModal
          archives={archives}
          onClose={() => setShowArchives(false)}
        />
      )}

      <div className="form-container">
        <form onSubmit={addTask} className="task-form">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="task-input"
            aria-label="New task title"
          />
          <button type="submit" className="add-task-btn">Add Task</button>
        </form>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetection={closestCenter}
      >
        <div className="board">
          <Column
            id="todo"
            title="To-Do"
            tasks={byStatus('todo')}
            activeId={activeId}
            onCardClick={setEditingTask}
            onDelete={deleteTask}
            onUpdateTitle={updateTitle}
          />
          <Column
            id="review"
            title="In Review"
            tasks={byStatus('review')}
            activeId={activeId}
            onCardClick={setEditingTask}
            onDelete={deleteTask}
            onUpdateTitle={updateTitle}
          />
          <Column
            id="done"
            title="Done"
            tasks={byStatus('done')}
            activeId={activeId}
            onCardClick={setEditingTask}
            onDelete={deleteTask}
            onUpdateTitle={updateTitle}
          />
        </div>

        <DragOverlay adjustScale={false} dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {activeId ? (
            <div className="taskCard overlayCard" data-status={activeTask?.status}>
              <div className="card-meta">
                <span className="date-badge">{formatDate(activeTask?.created_at || activeTask?.createdAt)}</span>
                <span className="icon-btn delete-btn" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                       viewBox="0 0 24 24" fill="currentColor"><path d="M9 3v1H4v2h16V4h-5V3H9zm2 6v9h2V9h-2zm-4 0v9h2V9H7zm8 0v9h2V9h-2z"/></svg>
                </span>
              </div>
              <div className="task-title-row">
                <h3 className="task-title">{activeTask?.title}</h3>
              </div>
              <p className="desc">{activeTask?.description || '—'}</p>
              <div className="stars readonly" aria-label="Priority (preview)">
                {[1,2,3,4,5].map(n => (
                  <span key={n}
                        className={`star ${ (activeTask?.priority || 3) >= n ? 'filled' : ''}`}
                        aria-hidden="true">★</span>
                ))}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

export default KanbanBoard;
