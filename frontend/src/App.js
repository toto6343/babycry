// src/App.js
import React, { useState } from "react";
import CryUploadPage from "./CryUploadPage";
import DashboardPage from "./DashboardPage";
import ReportPage from "./ReportPage";

function App() {
  const [page, setPage] = useState("upload");

  return (
    <div>
      <header style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
        <button onClick={() => setPage("upload")}>울음 업로드</button>
        <button onClick={() => setPage("dashboard")}>대시보드</button>
        <button onClick={() => setPage("report")}>자동 보고서</button>
      </header>

      {page === "upload" && <CryUploadPage />}
      {page === "dashboard" && <DashboardPage />}
      {page === "report" && <ReportPage />}
    </div>
  );
}

export default App;
