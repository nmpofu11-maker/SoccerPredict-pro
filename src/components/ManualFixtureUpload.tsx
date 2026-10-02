import React, { useState } from 'react';
import { ManualResultUpload } from './ManualResultUpload';
import { getAdminApiHeaders, setAdminApiKey, hasAdminApiKey } from '../services/adminAuthService';
import { Key, CheckCircle2 } from 'lucide-react';

export const ManualFixtureUpload: React.FC = () => {
  const [operatorKeyInput, setOperatorKeyInput] = useState('');
  const [keySavedMessage, setKeySavedMessage] = useState(hasAdminApiKey() ? 'saved for this session' : '');
  const [rawData, setRawData] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSaveKey = () => {
    if (!operatorKeyInput.trim()) return;
    setAdminApiKey(operatorKeyInput.trim());
    setOperatorKeyInput('');
    setKeySavedMessage('saved for this session');
  };

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

      const result = await response?.json().catch(() => ({}));
      // /api/fixtures/ingest-slate returns { status: 'success', ingestedCount },
      // the file/url endpoints return { success: true, count } — handle both.
      const isSuccess = (response?.ok && (result?.status === 'success' || result?.success === true));
      const count = result?.ingestedCount ?? result?.count ?? 0;
      if (isSuccess) {
        setStatus(`Successfully ingested ${count} fixtures. They're now live in the app.`);
        setRawData('');
        setFile(null);
        setUrl('');
      } else {
        if (response?.status === 401) {
          setStatus('Authentication error (401): Please enter the server ADMIN_API_KEY above to authorize uploads.');
        } else if (response?.status === 503) {
          setStatus('Admin service unavailable (503): ADMIN_API_KEY is not configured on the server.');
        } else {
          const errorDetail = result?.message || result?.error || (response ? `Server error (HTTP ${response.status})` : 'No response from server');
          setStatus(`Error: ${errorDetail}`);
        }
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
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatus(`Synced ${data.count} fixtures successfully. ${data.message || ''}`);
      } else if (res.status === 401) {
        setStatus('Authentication error (401): Please enter the server ADMIN_API_KEY above to authorize sync operations.');
      } else if (res.status === 503) {
        setStatus('Admin service unavailable (503): ADMIN_API_KEY is not configured on the server.');
      } else {
        setStatus(`Error: ${data.message || data.error || `HTTP ${res.status}`}`);
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
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-700">
          <h2 className="text-lg font-bold">Manual Fixture Upload</h2>
          
          {/* Operator API Key Input */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-900 px-2 py-1 rounded border border-gray-700">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <input
                type="password"
                value={operatorKeyInput}
                onChange={(e) => setOperatorKeyInput(e.target.value)}
                placeholder="Enter ADMIN_API_KEY..."
                className="bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none w-36 sm:w-48"
              />
            </div>
            <button
              onClick={handleSaveKey}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-xs font-bold rounded cursor-pointer"
            >
              Save key
            </button>
            {keySavedMessage && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
                <CheckCircle2 className="w-3 h-3" />
                {keySavedMessage}
              </span>
            )}
          </div>
        </div>

        {/* Text Area */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Paste the Hollywoodbets fixture sheet text:</p>
            <textarea className="w-full h-40 p-2 bg-gray-900 border border-gray-700 rounded text-sm" value={rawData} onChange={(e) => setRawData(e.target.value)} placeholder="Paste raw Hollywoodbets slate text here — same format as the site/sheet, no manual reformatting needed." />
            <button onClick={() => handleUpload('text')} className="px-4 py-2 bg-blue-600 rounded font-bold cursor-pointer">Upload Text</button>
            <button
              onClick={handleSyncFromApi}
              disabled={isSyncing}
              className="ml-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded font-bold disabled:opacity-50 cursor-pointer"
              title="Triggers the real automated pipeline (TheSportsDB / API-Football) right now"
            >
              {isSyncing ? 'Syncing...' : 'Sync from API'}
            </button>
        </div>

        {/* File Input */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Or upload a PDF of the fixture sheet:</p>
            <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="w-full" />
            <button onClick={() => handleUpload('file')} disabled={!file} className="px-4 py-2 bg-blue-600 rounded font-bold disabled:opacity-50 cursor-pointer">Upload PDF</button>
        </div>

        {/* URL Input */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Or a link to a page containing the fixture text (not a live scraper — works best on plain-text/HTML pages, not JS-rendered odds pages):</p>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm" placeholder="https://..." />
            <button onClick={() => handleUpload('url')} disabled={!url} className="px-4 py-2 bg-blue-600 rounded font-bold disabled:opacity-50 cursor-pointer">Fetch Link</button>
        </div>

        {status && <p className="mt-2 text-sm">{status}</p>}
      </div>
      <ManualResultUpload />
    </div>
  );
};
