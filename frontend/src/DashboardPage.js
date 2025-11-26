// src/DashboardPage.js
import React, { useEffect, useState } from "react";
import { NODE_API_BASE } from "./api";

function DashboardPage() {
  const [infantId, setInfantId] = useState(1);

  const [editingActionId, setEditingActionId] = useState(null);
  const [editDetail, setEditDetail] = useState("");
  const [editResult, setEditResult] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Node 액션 대시보드 데이터
  const [actionsData, setActionsData] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(false);

  // Node /api/actions/dashboard 호출
  const loadActionsDashboard = async () => {
    setActionsLoading(true);
    try {
      const res = await fetch(
        `${NODE_API_BASE}/actions/dashboard?infantId=${infantId}`
      );
      const json = await res.json();
      setActionsData(json);
    } catch (err) {
      console.error("액션 대시보드 로드 실패", err);
    } finally {
      setActionsLoading(false);
    }
  };

  // 새로고침 버튼
  const handleRefresh = () => {
    loadActionsDashboard();
  };

  const startEdit = (action) => {
    setEditingActionId(action.actionId);
    setEditDetail(action.actionDetail || "");
    setEditResult(action.result || "");
  };

  const cancelEdit = () => {
    setEditingActionId(null);
    setEditDetail("");
    setEditResult("");
  };

  const saveEdit = async () => {
    if (!editDetail.trim()) {
      alert("조치 내용을 입력해주세요.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(
        `${NODE_API_BASE}/actions/${editingActionId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionDetail: editDetail.trim(),
            result: editResult || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "수정 실패");
      }
      cancelEdit();
      // 리스트 새로고침
      await loadActionsDashboard();
    } catch (err) {
      alert("수정 중 오류: " + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteAction = async (actionId) => {
    if (!window.confirm("이 조치 기록을 삭제할까요?")) return;

    try {
      const res = await fetch(`${NODE_API_BASE}/actions/${actionId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "삭제 실패");
      }
      // 삭제 후 새로고침
      await loadActionsDashboard();
    } catch (err) {
      alert("삭제 중 오류: " + err.message);
    }
  };

  // infantId 변경될 때마다 새로 로드
  useEffect(() => {
    loadActionsDashboard();
    // eslint-disable-next-line
  }, [infantId]);

  return (
    <div style={{ padding: "16px", maxWidth: 1000, margin: "0 auto" }}>
      <h2>아기 대시보드</h2>

      {/* 상단 컨트롤 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 8 }}>
          Infant ID:{" "}
          <input
            type="number"
            value={infantId}
            onChange={(e) => setInfantId(e.target.value)}
            style={{ width: 80 }}
          />
        </label>
        <button
          onClick={handleRefresh}
          disabled={actionsLoading}
          style={{ padding: "4px 10px" }}
        >
          {actionsLoading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      {/* Node 액션 대시보드 영역 */}
      <div>
        {actionsLoading && <p>조치 기록 불러오는 중...</p>}

        {actionsData && actionsData.events && (
          <div>
            <h3>조치 기록 (GPT 추천 + 보호자 행동)</h3>

            {actionsData.events.length === 0 && (
              <p style={{ color: "#777" }}>
                아직 기록된 울음 이벤트가 없습니다.
              </p>
            )}

            {actionsData.events.map((ev) => (
              <div
                key={ev.eventId}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 12,
                  background: "#fafafa",
                }}
              >
                {/* 이벤트 기본 정보 */}
                <div style={{ marginBottom: 4 }}>
                  <b>이벤트 #{ev.eventId}</b>{" "}
                  / 울음 타입: {ev.cryType || "-"} / 심각도:{" "}
                  {ev.severity || "-"} / 신뢰도:{" "}
                  {ev.confidence != null ? ev.confidence : "-"}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>
                  시간: {ev.eventTime}
                </div>

                {/* GPT 추천 조치 */}
                {ev.notification && (
                  <div style={{ marginTop: 8 }}>
                    <b>GPT 추천 조치:</b>
                    <div
                      style={{
                        background: "#f9f9f9",
                        padding: 6,
                        borderRadius: 4,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {ev.notification.actionText ||
                        "(저장된 추천 문장이 없습니다.)"}
                    </div>
                  </div>
                )}

                {/* 기존 보호자 조치 리스트 */}
                {ev.actions && ev.actions.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <b>기록된 보호자 조치:</b>
                    <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                      {ev.actions.map((a) => {
                        const isEditing = editingActionId === a.actionId;
                        return (
                          <li key={a.actionId} style={{ marginBottom: 6 }}>
                            {isEditing ? (
                              <div
                                style={{
                                  border: "1px solid #ccc",
                                  padding: 6,
                                }}
                              >
                                <textarea
                                  value={editDetail}
                                  onChange={(e) =>
                                    setEditDetail(e.target.value)
                                  }
                                  rows={2}
                                  style={{
                                    width: "100%",
                                    padding: 4,
                                    marginBottom: 4,
                                  }}
                                />
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    marginBottom: 4,
                                  }}
                                >
                                  <select
                                    value={editResult}
                                    onChange={(e) =>
                                      setEditResult(e.target.value)
                                    }
                                    style={{ padding: 4 }}
                                  >
                                    <option value="">
                                      결과 선택 (선택)
                                    </option>
                                    <option value="success">성공</option>
                                    <option value="partial">
                                      조금 효과 있음
                                    </option>
                                    <option value="fail">실패</option>
                                  </select>
                                </div>
                                <div
                                  style={{ display: "flex", gap: 8 }}
                                >
                                  <button
                                    type="button"
                                    onClick={saveEdit}
                                    disabled={savingEdit}
                                    style={{ padding: "4px 10px" }}
                                  >
                                    {savingEdit
                                      ? "저장 중..."
                                      : "수정 저장"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    style={{ padding: "4px 10px" }}
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div>
                                  {a.actionDetail}
                                  {a.result && (
                                    <> (결과: {a.result})</>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#777",
                                  }}
                                >
                                  {a.executedAt}
                                </div>
                                <div
                                  style={{
                                    marginTop: 4,
                                    display: "flex",
                                    gap: 8,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => startEdit(a)}
                                    style={{
                                      padding: "2px 8px",
                                      fontSize: 12,
                                    }}
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteAction(a.actionId)
                                    }
                                    style={{
                                      padding: "2px 8px",
                                      fontSize: 12,
                                      color: "red",
                                    }}
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* 보호자 조치 새로 기록하는 폼 */}
                <ActionForm
                  eventId={ev.eventId}
                  onSaved={loadActionsDashboard}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 각 이벤트 카드 안에서 쓰는 “조치 기록 입력 폼”
 */
function ActionForm({ eventId, onSaved }) {
  const [detail, setDetail] = useState("");
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!detail.trim()) {
      setError("조치 내용을 입력해주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`${NODE_API_BASE}/actions/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          actionDetail: detail.trim(),
          result: result || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "저장 실패");
      }
      setDetail("");
      setResult("");
      onSaved && onSaved();
    } catch (err) {
      setError("저장 중 오류: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <textarea
        placeholder="실제로 어떤 조치를 했는지 적어주세요."
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={2}
        style={{ width: "100%", padding: 4 }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          style={{ padding: 4 }}
        >
          <option value="">결과 선택 (선택)</option>
          <option value="success">성공</option>
          <option value="partial">조금 효과 있음</option>
          <option value="fail">실패</option>
        </select>
        <button
          type="submit"
          disabled={saving}
          style={{ padding: "6px 12px" }}
        >
          {saving ? "저장 중..." : "조치 기록"}
        </button>
      </div>
      {error && (
        <div style={{ color: "red", fontSize: 12 }}>{error}</div>
      )}
    </form>
  );
}

export default DashboardPage;
