'use client';

import { useEffect, useState, use } from 'react';

interface PendingChange {
  id: string;
  type: string;
  status: string;
  deleteIds: string;
  afterId: string | null;
  newText: string | null;
  originalText: string | null;
  user: { name: string };
  createdAt: string;
}

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [originalText, setOriginalText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    { snippet: string; position: number }[]
  >([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    loadDocument();
    loadPendingChanges();
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        if (data.length > 0) setUserId(data[0].id);
      });
  }, [id]);

  async function loadDocument() {
    try {
      const res = await fetch(`/api/documents/${id}`);
      const data = await res.json();
      setOriginalText(data.text);
      setEditedText(data.text);
      setVersion(data.version);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load document:', err);
      setLoading(false);
    }
  }

  async function loadPendingChanges() {
    try {
      const res = await fetch(`/api/documents/${id}/changes`);
      const data = await res.json();
      setPendingChanges(data);
    } catch (err) {
      console.error('Failed to load pending changes:', err);
    }
  }

  async function submitChanges() {
    if (editedText === originalText) {
      setStatus('No changes to submit.');
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/documents/${id}/changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editedText, version, userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(`Error: ${data.error}`);
        if (res.status === 409) await loadDocument();
        return;
      }

      setStatus(`Submitted ${data.changes} change(s) for review.`);
      // Reset textarea to original — changes are pending, not applied
      setEditedText(originalText);
      await loadPendingChanges();
    } catch (err) {
      console.error('Failed to submit changes:', err);
      setStatus('Error: Failed to submit changes.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangeAction(
    changeId: string,
    action: 'approve' | 'reject'
  ) {
    try {
      const res = await fetch(`/api/documents/${id}/changes/${changeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(`Error: ${data.error}`);
        return;
      }

      // Reload document and pending changes
      await loadDocument();
      await loadPendingChanges();
      setStatus(`Change ${action}d.`);
    } catch (err) {
      console.error(`Failed to ${action} change:`, err);
    }
  }

  function resetChanges() {
    setEditedText(originalText);
    setStatus(null);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(
        `/api/documents/${id}/search?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      setSearchResults(data.matches || []);
    } catch (err) {
      console.error('Search failed:', err);
    }
  }

  function formatChangeDescription(change: PendingChange): string {
    switch (change.type) {
      case 'delete':
        return `Delete "${change.originalText}"`;
      case 'insert':
        return `Insert "${change.newText}"`;
      case 'replace':
        return `Replace "${change.originalText}" → "${change.newText}"`;
      default:
        return change.type;
    }
  }

  const hasChanges = editedText !== originalText;

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <a href="/" className="text-blue-600 hover:underline text-sm">
          ← Back to documents
        </a>
        <span className="text-sm text-gray-500">Version: {version}</span>
      </div>

      {/* User selector */}
      <div className="mb-3">
        <label className="text-sm text-gray-600 mr-2">Editing as:</label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Main layout: editor + pending changes */}
      <div className="flex gap-6">
        {/* Left: textarea editor */}
        <div className="flex-1">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full h-80 p-4 border rounded font-mono text-sm resize-y"
          />

          <div className="flex gap-3 mt-3">
            <button
              onClick={submitChanges}
              disabled={!hasChanges || submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Changes'}
            </button>
            <button
              onClick={resetChanges}
              disabled={!hasChanges}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Reset
            </button>
          </div>

          {status && (
            <div
              className={`mt-3 text-sm ${status.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}
            >
              {status}
            </div>
          )}
        </div>

        {/* Right: pending changes */}
        <div className="w-80">
          <h2 className="text-lg font-semibold mb-3">
            Pending Changes ({pendingChanges.length})
          </h2>
          {pendingChanges.length === 0 ? (
            <p className="text-sm text-gray-500">No pending changes.</p>
          ) : (
            <ul className="space-y-3">
              {pendingChanges.map((change) => (
                <li key={change.id} className="p-3 border rounded text-sm">
                  <div className="font-medium">
                    {formatChangeDescription(change)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    by {change.user.name}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleChangeAction(change.id, 'approve')}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleChangeAction(change.id, 'reject')}
                      className="px-3 py-1 bg-red-600 text-white rounded text-xs"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold mb-3">Search</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search this document..."
            className="flex-1 px-3 py-2 border rounded text-sm"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-800 text-white rounded text-sm"
          >
            Search
          </button>
        </div>
        {searchResults.length > 0 && (
          <ul className="mt-3 space-y-2">
            {searchResults.map((match, i) => (
              <li key={i} className="p-3 bg-gray-50 rounded text-sm font-mono">
                <span className="text-gray-400 text-xs">
                  pos {match.position}:{' '}
                </span>
                {match.snippet}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
