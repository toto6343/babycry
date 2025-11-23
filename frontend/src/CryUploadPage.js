// src/CryUploadPage.js
import React, { useState } from "react";
import { PYTHON_API_BASE } from "./api";

function CryUploadPage() {
  const [file, setFile] = useState(null);
  const [infantId, setInfantId] = useState(1);
  const [guardianId, setGuardianId] = useState(1);
  const [sensitivity, setSensitivity] = useState("balanced");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("파일을 선택해주세요.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("infant_id", infantId);
      formData.append("guardian_id", guardianId);
      formData.append("sensitivity", sensitivity);

      const res = await fetch(`${PYTHON_API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("업로드 중 오류가 발생했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "16px" }}>
      <h2>아기 울음 분석 업로드</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label>오디오 파일 (wav): </label>
          <input
            type="file"
            accept=".wav,.ogg,.mp3"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </div>

        <div>
          <label>Infant ID: </label>
          <input
            type="number"
            value={infantId}
            onChange={(e) => setInfantId(e.target.value)}
          />
        </div>

        <div>
          <label>Guardian ID: </label>
          <input
            type="number"
            value={guardianId}
            onChange={(e) => setGuardianId(e.target.value)}
          />
        </div>

        <div>
          <label>Sensitivity: </label>
          <select
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value)}
          >
            <option value="high">high</option>
            <option value="balanced">balanced</option>
            <option value="precise">precise</option>
          </select>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "분석 중..." : "업로드 & 분석"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: "16px" }}>
          <h3>분석 결과</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "8px",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
          <p>
            <b>울음 원인(reason):</b> {result.reason}
          </p>
          <p>
            <b>심각도(severity):</b> {result.severity}
          </p>
          <p>
            <b>신뢰도(confidence):</b>{" "}
            {result.confidence && result.confidence.toFixed
              ? result.confidence.toFixed(2)
              : result.confidence}
          </p>
          <p>
            <b>isCrying:</b> {result.isCrying ? "true" : "false"}
          </p>

          <h4>추천 행동(recommended_actions)</h4>
          <ul>
            {(result.recommended_actions || []).map((a, idx) => (
              <li key={idx}>
                [{a.action_type}] {a.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CryUploadPage;
