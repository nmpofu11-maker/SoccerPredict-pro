import React, { useState } from 'react';
import { ManualResultUpload } from './ManualResultUpload';
import { getAdminApiHeaders } from '../services/adminAuthService';

export const ManualFixtureUpload: React.FC = () => {
  const [rawData, setRawData] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleUpload = async (type: 'text' | 'file' | 'url') => {
    setStatus('Uploading...');
    try {
      let response;
      if (type === 'text') {
        // Routed through the real Hollywoodbets-format parser and manifest
        // pipeline (/api/fixtures/ingest-slate) — the same one the automated
        // pipeline and the original working paste-flow both use.
        response = await fetch('/api/fixtures/ingest-slate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
          body: JSON.stringify({ rawText: rawData }),
        });
      } else if (type === 'file' && file) {
        const formData = new FormData();
        formData.append('file', file);
        response = await fetch('/api/admin/upload-fixture-file', {
          method: 'POST',
          headers: getAdminApiHeaders(),
          body: formData,
        });
      } else if (type === 'url') {
        response = await fetch('/api/admin/fetch-fixture-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
          body: JSON.stringify({ url }),
        });
      }

      const result = await response?.json();
      // /api/fixtures/ingest-slate returns { status: 'success', ingestedCount },
      // the file/url endpoints return { success: true, count } — handle both.
      const isSuccess = result?.status === 'success' || result?.success === true;
      const count = result?.ingestedCount ?? result?.count ?? 0;
      if (isSuccess) {
        setStatus(`Successfully ingested ${count} fixtures. They're now live in the app.`);
        setRawData('');
        setFile(null);
        setUrl('');
      } else {
        setStatus(`Error: ${result?.message || result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      setStatus(`Upload failed: ${err instanceof Error ? err.message : 'Unknown server error'}`);
    }
  };

  const handleSyncFromApi = async () => {
    setIsSyncing(true);
    setStatus('Syncing from automated provider pipeline (SportAPI.ai / TheRundown)...');
    try {
      const res = await fetch('/api/admin/run-ingest-now', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() } });
      const data = await res.json();
      if (data.success) {
        setStatus(`Synced ${data.count} fixtures successfully. ${data.message || ''}`);
      } else {
        setStatus(`Error: ${data.message || 'Sync failed'}`);
      }
    } catch (err) {
      setStatus(`API sync failed: ${err instanceof Error ? err.message : 'Unknown server error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="p-4 bg-gray-800 rounded text-white space-y-4">
        <h2 className="text-lg font-bold">Manual Fixture Upload</h2>

        {/* Text Area */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Paste the Hollywoodbets fixture sheet text:</p>
            <textarea className="w-full h-40 p-2 bg-gray-900 border border-gray-700 rounded text-sm" value={rawData} onChange={(e) => setRawData(e.target.value)} placeholder="Paste raw Hollywoodbets slate text here — same format as the site/sheet, no manual reformatting needed." />
            <button onClick={() => handleUpload('text')} className="px-4 py-2 bg-blue-600 rounded font-bold">Upload Text</button>
            <button
              onClick={handleSyncFromApi}
              disabled={isSyncing}
              className="ml-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded font-bold disabled:opacity-50"
              title="Triggers the real automated pipeline (TheSportsDB / API-Football) right now"
            >
              {isSyncing ? 'Syncing...' : 'Sync from API'}
            </button>
        </div>

        {/* File Input */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Or upload a PDF of the fixture sheet:</p>
            <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="w-full" />
            <button onClick={() => handleUpload('file')} disabled={!file} className="px-4 py-2 bg-blue-600 rounded font-bold disabled:opacity-50">Upload PDF</button>
        </div>

        {/* URL Input */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Or a link to a page containing the fixture text (not a live scraper — works best on plain-text/HTML pages, not JS-rendered odds pages):</p>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm" placeholder="https://..." />
            <button onClick={() => handleUpload('url')} disabled={!url} className="px-4 py-2 bg-blue-600 rounded font-bold disabled:opacity-50">Fetch Link</button>
        </div>

        {status && <p className="mt-2 text-sm">{status}</p>}
      </div>
      <ManualResultUpload />
    </div>
  );
};
