import React, { useState } from 'react';
import { ManualResultUpload } from './ManualResultUpload';

export const ManualFixtureUpload: React.FC = () => {
  const [rawData, setRawData] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleUpload = async (type: 'text' | 'file' | 'url') => {
    setStatus('Uploading...');
    try {
      let response;
      if (type === 'text') {
        const lines = rawData.split('\n').filter(line => line.trim() !== '');
        response = await fetch('/api/admin/upload-fixtures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawData: lines }),
        });
      } else if (type === 'file' && file) {
        const formData = new FormData();
        formData.append('file', file);
        response = await fetch('/api/admin/upload-fixture-file', {
          method: 'POST',
          body: formData,
        });
      } else if (type === 'url') {
        response = await fetch('/api/admin/fetch-fixture-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
      }

      const result = await response?.json();
      if (result?.success) {
        setStatus(`Successfully uploaded ${result.count} fixtures.`);
        setRawData('');
        setFile(null);
        setUrl('');
      } else {
        setStatus(`Error: ${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      setStatus('Failed to connect to server.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="p-4 bg-gray-800 rounded text-white space-y-4">
        <h2 className="text-lg font-bold">Manual Fixture Upload</h2>
        
        {/* Text Area */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Paste fixtures:</p>
            <textarea className="w-full h-40 p-2 bg-gray-900 border border-gray-700 rounded text-sm" value={rawData} onChange={(e) => setRawData(e.target.value)} placeholder="17:00|USM BLIDA|IRB SIDI M HAMED|ALGERIA, LIGUE 2|2026-09-26" />
            <button onClick={() => handleUpload('text')} className="px-4 py-2 bg-blue-600 rounded font-bold">Upload Text</button>
        <button
          onClick={async () => {
             setStatus('Syncing...');
             const res = await fetch('/api/admin/sync-fixtures-from-api', { method: 'POST' });
             const data = await res.json();
             if (data.success) setStatus(`Synced ${data.count} fixtures.`);
             else setStatus(`Error: ${data.error}`);
          }}
          className="ml-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded font-bold"
        >
          Sync from API
        </button>
        </div>

        {/* File Input */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Or upload PDF:</p>
            <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="w-full" />
            <button onClick={() => handleUpload('file')} className="px-4 py-2 bg-blue-600 rounded font-bold">Upload PDF</button>
        </div>

        {/* URL Input */}
        <div className="space-y-2">
            <p className="text-sm text-gray-400">Or from Link:</p>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm" placeholder="https://..." />
            <button onClick={() => handleUpload('url')} className="px-4 py-2 bg-blue-600 rounded font-bold">Fetch Link</button>
        </div>
        
        {status && <p className="mt-2 text-sm">{status}</p>}
      </div>
      <ManualResultUpload />
    </div>
  );
};
