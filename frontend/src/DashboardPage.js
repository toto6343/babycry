// src/DashboardPage.js
import React, { useEffect, useState } from "react";
import { PYTHON_API_BASE } from "./api";

function DashboardPage() {
  const [infantId, setInfantId] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${PYTHON_API_BASE}/dashboard?infant_id=${infantId}`
      );
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("대시보드 로드 실패", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line
  }, []);

  return (
    <div style={{ padding: "16px" }}>
      <h2>아기 대시보드</h2>

      <div>
        <label>Infant ID: </label>
        <input
          type="number"
          value={infantId}
          onChange={(e) => setInfantId(e.target.value)}
        />
        <button onClick={loadDashboard} disabled={loading}>
          새로고침
        </button>
      </div>

      {loading && <p>불러오는 중...</p>}

      {data && (
        <>
          <h3>요약(summary)</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "8px",
              maxHeight: "200px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(data.summary, null, 2)}
          </pre>

          <h3>최근 이벤트(recent_events)</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "8px",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(data.recent_events, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

export default DashboardPage;
