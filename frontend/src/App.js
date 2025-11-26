// src/App.js
import React, { useState } from "react";
import CryUploadPage from "./CryUploadPage";
import DashboardPage from "./DashboardPage";
import ReportPage from "./ReportPage";
import ChatbotPage from "./ChatbotPage";

function App() {
  // 처음 화면을 챗봇으로 보고 싶으면 "chatbot" 으로 바꿔도 됨
  const [page, setPage] = useState("upload");

  return (
    <div>
      <header style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
        <button onClick={() => setPage("upload")}>울음 업로드</button>
        <button onClick={() => setPage("dashboard")}>대시보드</button>
        <button onClick={() => setPage("report")}>자동 보고서</button>
        <button onClick={() => setPage("chatbot")}>육아 상담 챗봇</button>
      </header>

      {page === "upload" && <CryUploadPage />}
      {page === "dashboard" && <DashboardPage />}
      {page === "report" && <ReportPage />}
      {page === "chatbot" && <ChatbotPage />}
    </div>
  );
}

export default App;
