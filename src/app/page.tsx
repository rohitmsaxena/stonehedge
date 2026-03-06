'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Document {
  id: string;
  title: string;
  version: number;
  user: { name: string };
  createdAt: string;
}

interface SearchMatch {
  documentId: string;
  documentTitle: string;
  snippet: string;
  position: number;
}

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch('/api/documents')
      .then((res) => res.json())
      .then((data) => {
        setDocuments(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch documents:', err);
        setLoading(false);
      });
  }, []);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`
      );
      const data = await res.json();
      setSearchResults(data.matches || []);
      setSearchTotal(data.total || 0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Stonehedge</h1>

      {/* Global search */}
      <div className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search across all documents..."
            className="flex-1 px-3 py-2 border rounded text-sm"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">
              {searchTotal} result{searchTotal !== 1 ? 's' : ''} found
            </h2>
            <ul className="space-y-2">
              {searchResults.map((match, i) => (
                <li key={i} className="p-3 border rounded">
                  <Link
                    href={`/documents/${match.documentId}`}
                    className="text-blue-600 hover:underline text-sm font-medium"
                  >
                    {match.documentTitle}
                  </Link>
                  <div className="text-sm font-mono text-gray-700 mt-1">
                    {match.snippet}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {searchResults.length === 0 &&
          searchTotal === 0 &&
          searchQuery &&
          !searching && (
            <p className="mt-3 text-sm text-gray-500">No results found.</p>
          )}
      </div>

      {/* Document list */}
      <h2 className="text-lg font-semibold mb-3">Documents</h2>
      {documents.length === 0 ? (
        <p className="text-gray-500">
          No documents found. Run prisma db seed first.
        </p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="block p-4 border rounded hover:bg-gray-50"
              >
                <div className="font-medium">{doc.title}</div>
                <div className="text-sm text-gray-500">
                  by {doc.user.name} · version {doc.version}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
