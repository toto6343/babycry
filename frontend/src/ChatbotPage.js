// src/ChatbotPage.js
import React, { useState } from "react";
import { PYTHON_API_BASE } from "./api";

function ChatbotPage() {
  const [infantId, setInfantId] = useState(1);
  const [guardianId, setGuardianId] = useState(1);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]); // {role: 'user'|'assistant', content: string}
  const [loading, setLoading] = useState(false);
  const [lastMeta, setLastMeta] = useState(null); // 긴급도/추천 액션 등

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      role: "user",
      content: input.trim(),
    };

    // 화면에 먼저 유저 메시지 추가
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    setLastMeta(null);

    try {
      const res = await fetch(`${PYTHON_API_BASE}/chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          infant_id: Number(infantId),
          guardian_id: Number(guardianId),
          message: userMessage.content,
          history: newHistory, // backend ChatbotService가 기대하는 형식: [{role, content}, ...]
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "API error");
      }

      const data = await res.json();

      // assistant 메시지 추가
      const assistantMsg = {
        role: "assistant",
        content: data.response,
        urgency_level: data.urgency_level,
        suggested_actions: data.suggested_actions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setLastMeta({
        urgency_level: data.urgency_level,
        suggested_actions: data.suggested_actions,
      });
    } catch (err) {
      const errorMsg = {
        role: "assistant",
        content: `오류가 발생했어요: ${err.message}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const urgencyColor = (level) => {
    if (!level) return "black";
    const v = String(level).toLowerCase();
    if (v.includes("emergency")) return "red";
    if (v.includes("high")) return "orangered";
    if (v.includes("medium")) return "orange";
    return "green";
  };

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: "0 auto" }}>
      <h2>육아 상담 챗봇 👶</h2>

      <div style={{ marginBottom: 8 }}>
        <label style={{ marginRight: 8 }}>
          Infant ID:{" "}
          <input
            type="number"
            value={infantId}
            onChange={(e) => setInfantId(e.target.value)}
            style={{ width: 80 }}
          />
        </label>
        <label>
          Guardian ID:{" "}
          <input
            type="number"
            value={guardianId}
            onChange={(e) => setGuardianId(e.target.value)}
            style={{ width: 80 }}
          />
        </label>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 8,
          height: 400,
          overflowY: "auto",
          marginBottom: 8,
          background: "#fafafa",
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#777" }}>
            아래 입력창에 고민을 적고 엔터를 눌러보세요.
            <br />
            예: “아기가 밤에 자주 깨는데 어떻게 해야 할까요?”
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                maxWidth: "70%",
                padding: 8,
                borderRadius: 8,
                background:
                  m.role === "user" ? "#cce5ff" : "white",
                border:
                  m.role === "assistant" ? "1px solid #ddd" : "none",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.role === "assistant" && m.urgency_level && (
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 4,
                    color: urgencyColor(m.urgency_level),
                  }}
                >
                  긴급도: {m.urgency_level}
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
      </div>

      {lastMeta && lastMeta.suggested_actions && lastMeta.suggested_actions.length > 0 && (
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 8,
            marginBottom: 8,
            background: "#fffdf5",
          }}
        >
          <b>추천 조치:</b>
          <ul>
            {lastMeta.suggested_actions.map((a, i) => (
              <li key={i}>
                [{a.action_type}] {a.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={sendMessage} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="상담하고 싶은 내용을 입력하세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
          {loading ? "응답 대기..." : "전송"}
        </button>
      </form>
    </div>
  );
}

export default ChatbotPage;
