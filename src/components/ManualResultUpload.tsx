import React, { useState } from 'react';
import { getAdminApiHeaders } from '../services/adminAuthService';

export const ManualResultUpload: React.FC = () => {
  const [rawData, setRawData] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleUpload = async () => {
    setStatus('Uploading...');
    try {
      const response = await fetch('/api/admin/upload-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
        body: JSON.stringify({ rawData }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        setStatus(`Successfully uploaded ${result.count} results.`);
        setRawData('');
      } else if (response.status === 401) {
        setStatus('Authentication error (401): Please enter the server ADMIN_API_KEY above to authorize result uploads.');
      } else if (response.status === 503) {
        setStatus('Admin service unavailable (503): ADMIN_API_KEY is not configured on the server.');
      } else {
        setStatus(`Error: ${result.error || result.message || `HTTP ${response.status}`}`);
      }
    } catch (err) {
      setStatus(`Upload failed: ${err instanceof Error ? err.message : 'Network error'}`);
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded text-white">
      <h2 className="text-lg font-bold mb-2">Manual Result Upload</h2>
      <p className="text-sm text-gray-400 mb-2">
        Paste results in format: <code className="bg-gray-700 px-1">Home vs Away|ScoreH|ScoreA|YYYY-MM-DD</code>
      </p>
      <textarea
        className="w-full h-40 p-2 bg-gray-900 border border-gray-700 rounded text-sm mb-2"
        value={rawData}
        onChange={(e) => setRawData(e.target.value)}
        placeholder="USM Blida vs IRB Sidi M Hamed|2|1|2026-09-26"
      />
      <button
        onClick={handleUpload}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded font-bold"
      >
        Upload Results
      </button>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
};
