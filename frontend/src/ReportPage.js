// src/ReportPage.js
import React, { useState } from "react";
import { NODE_API_BASE } from "./api";

function ReportPage() {
  const [infantId, setInfantId] = useState(1);
  const [startDate, setStartDate] = useState("2025-11-01");
  const [endDate, setEndDate] = useState("2025-11-30");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setReport(null);
    try {
      const url = `${NODE_API_BASE}/reports/auto?infantId=${infantId}&startDate=${startDate}&endDate=${endDate}`;
      const res = await fetch(url);
      const json = await res.json();
      setReport(json);
    } catch (err) {
      console.error("보고서 로드 실패", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "16px" }}>
      <h2>자동 보고서</h2>
      <div>
        <label>Infant ID: </label>
        <input
          type="number"
          value={infantId}
          onChange={(e) => setInfantId(e.target.value)}
        />
      </div>
      <div>
        <label>Start Date: </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <div>
        <label>End Date: </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      <button onClick={loadReport} disabled={loading}>
        {loading ? "생성 중..." : "보고서 생성"}
      </button>

      {report && (
        <div style={{ marginTop: "16px" }}>
          <h3>AI 보고서</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f5f5f5",
              padding: "8px",
            }}
          >
            {report.aiReport || "(aiReport 필드 이름은 실제 응답에 맞춰 수정 필요)"}
          </pre>

          <h4>원본 데이터(summaryData)</h4>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "8px",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(report.summaryData || report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ReportPage;
