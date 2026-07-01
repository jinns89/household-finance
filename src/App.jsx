import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabase";

// ── Constants ──
const EXP_CATS = [
  "제일(원리금상환)", "롯데(메인생활1)", "신한(서브생활1)",
  "현대(서브생활1)", "개인용돈", "여행", "기타(댓글달기)",
];
const INC_CATS = ["진수월급", "아름월급", "현금"];

const COLORS = {
  "제일(원리금상환)": "#6366f1", "롯데(메인생활1)": "#f43f5e",
  "신한(서브생활1)": "#3b82f6", "현대(서브생활1)": "#10b981",
  "개인용돈": "#f59e0b", "여행": "#8b5cf6", "기타(댓글달기)": "#94a3b8",
  "진수월급": "#0ea5e9", "아름월급": "#ec4899", "현금": "#84cc16",
  "파킹(토스)": "#f59e0b", "예적금(토스)": "#3b82f6",
  "주식+달러": "#8b5cf6", "주식+달러+금": "#8b5cf6",
  "네이버CMA": "#10b981", "여행모임통장(토스)": "#06b6d4",
  "주택청약": "#64748b", "퇴직금IRP(진수)": "#f43f5e",
  "연금저축": "#ec4899", "연금저축(진수)": "#ec4899",
  "연금저축(아름)": "#d946ef", "ISA(아름)": "#14b8a6",
  "주식+CMA(진수)": "#6366f1",
};

const SHORT = {
  "제일(원리금상환)": "원리금", "롯데(메인생활1)": "롯데",
  "신한(서브생활1)": "신한", "현대(서브생활1)": "현대",
  "개인용돈": "용돈", "여행": "여행", "기타(댓글달기)": "기타",
  "진수월급": "진수", "아름월급": "아름", "현금": "현금",
};

const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];

// Asset groups
const SAVINGS_NAMES = ["예적금(토스)", "주택청약", "네이버CMA", "파킹(토스)", "여행모임통장(토스)"];
const INVEST_NAMES = [
  "주식+달러", "주식+달러+금", "연금저축", "연금저축(진수)", "연금저축(아름)",
  "ISA(아름)", "주식+CMA(진수)", "퇴직금IRP(진수)",
];


// ── Helpers ──
function tl(dateStr) {
  const d = new Date(dateStr);
  return d.getFullYear() + "." + (d.getMonth() + 1) + "월";
}

function dayStr(dateStr) {
  return DAYS_KR[new Date(dateStr).getDay()];
}

function won(n) {
  if (n < 0) return "-" + Math.abs(n).toLocaleString("ko-KR") + "원";
  return n.toLocaleString("ko-KR") + "원";
}

function wonShort(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 100000000) {
    const eok = Math.floor(abs / 100000000);
    const man = Math.floor((abs % 100000000) / 10000);
    return sign + eok + "억" + (man > 0 ? " " + man.toLocaleString() + "만" : "");
  }
  if (abs >= 10000) {
    return sign + Math.floor(abs / 10000).toLocaleString() + "만";
  }
  return won(n);
}

function parseMonthKey(m) {
  const p = m.match(/(\d+)\.(\d+)/);
  return p ? parseInt(p[1]) * 100 + parseInt(p[2]) : 0;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pctBadge(current, prev) {
  if (!prev || prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const isUp = pct >= 0;
  return {
    text: (isUp ? "+" : "") + pct.toFixed(1) + "%",
    color: isUp ? "#059669" : "#dc2626",
    bg: isUp ? "#f0fdf4" : "#fef2f2",
  };
}


// ── Styles ──
const card = {
  background: "#fff",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

const inputSt = {
  padding: "11px 13px",
  borderRadius: 9,
  border: "1.5px solid #e2e8f0",
  fontSize: 14,
  fontWeight: 500,
  color: "#0f172a",
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

// ═══════════════════════════════════════════
// APP
// ═══════════════════════════════════════════
export default function App() {
  const [data, setData] = useState([]);
  const [assets, setAssets] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("home");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() + "." + (now.getMonth() + 1) + "월";
  });

  // Form
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState("expense");
  const [editId, setEditId] = useState(null);
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fCat, setFCat] = useState("롯데(메인생활1)");
  const [fAmt, setFAmt] = useState("");
  const [fMemo, setFMemo] = useState("");

  // Investment memos: { "2026.6월": { "주식+달러+금": "손익률 13%", ... } }
  const [investMemos, setInvestMemos] = useState({});
  const [editingItem, setEditingItem] = useState(null); // asset name being edited
  const [itemDraft, setItemDraft] = useState("");

  // Asset editing
  const [editingAsset, setEditingAsset] = useState(null); // asset name being amount-edited
  const [assetDraft, setAssetDraft] = useState("");
  const [addingAsset, setAddingAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetAmt, setNewAssetAmt] = useState("");
  const [newAssetGroup, setNewAssetGroup] = useState("savings"); // savings or invest

  // ── Supabase Data Layer ──
  useEffect(() => {
    async function load() {
      // Load transactions
      const { data: txns } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: true });
      if (txns) {
        setData(txns.map((t) => ({
          id: t.id, date: t.date, category: t.category,
          amount: t.amount, memo: t.memo || "", type: t.type,
        })));
      }

      // Load assets
      const { data: ast } = await supabase
        .from("assets")
        .select("*");
      if (ast) {
        setAssets(ast.map((a) => ({ id: a.id, name: a.name, month: a.month, amount: a.amount })));
      }

      // Load invest memos
      const { data: memos } = await supabase
        .from("invest_memos")
        .select("*");
      if (memos) {
        const obj = {};
        memos.forEach((m) => {
          if (!obj[m.month]) obj[m.month] = {};
          obj[m.month][m.asset_name] = m.memo;
        });
        setInvestMemos(obj);
      }

      setReady(true);
    }
    load();
  }, []);

  // Transaction CRUD
  const addTransaction = useCallback(async (entry) => {
    const row = { type: entry.type, date: entry.date, category: entry.category, amount: entry.amount, memo: entry.memo || "" };
    const { data: inserted } = await supabase.from("transactions").insert(row).select().single();
    if (inserted) setData((prev) => [...prev, { ...inserted, memo: inserted.memo || "" }]);
  }, []);

  const updateTransaction = useCallback(async (id, entry) => {
    const row = { type: entry.type, date: entry.date, category: entry.category, amount: entry.amount, memo: entry.memo || "" };
    await supabase.from("transactions").update(row).eq("id", id);
    setData((prev) => prev.map((e) => e.id === id ? { ...e, ...row } : e));
  }, []);

  const deleteTransaction = useCallback(async (id) => {
    await supabase.from("transactions").delete().eq("id", id);
    setData((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Asset save (upsert)
  const saveAssets = useCallback(async (next) => {
    setAssets(next);
  }, []);

  // Invest memo save
  const saveItemMemo = useCallback(async (monthKey, itemName, text) => {
    const monthData = investMemos[monthKey] || {};
    const next = { ...investMemos, [monthKey]: { ...monthData, [itemName]: text } };
    setInvestMemos(next);
    await supabase.from("invest_memos").upsert(
      { month: monthKey, asset_name: itemName, memo: text },
      { onConflict: "month,asset_name" }
    );
  }, [investMemos]);

  // ── Derived ──
  const allMonths = useMemo(() => {
    const s = new Set();
    data.forEach((e) => s.add(tl(e.date)));
    assets.forEach((a) => s.add(a.month));
    // Always include current real-world month
    const now = new Date();
    s.add(now.getFullYear() + "." + (now.getMonth() + 1) + "월");
    return [...s].sort((a, b) => parseMonthKey(a) - parseMonthKey(b));
  }, [data, assets]);

  const mExp = useMemo(
    () => data.filter((e) => e.type === "expense" && tl(e.date) === month)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data, month]
  );
  const mInc = useMemo(
    () => data.filter((e) => e.type === "income" && tl(e.date) === month)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data, month]
  );
  const mAst = useMemo(
    () => assets.filter((a) => a.month === month).sort((a, b) => b.amount - a.amount),
    [assets, month]
  );

  const totExp = mExp.reduce((s, e) => s + e.amount, 0);
  const totInc = mInc.reduce((s, e) => s + e.amount, 0);
  const totAst = mAst.reduce((s, a) => s + a.amount, 0);
  const balance = totInc - totExp;

  // Asset groups
  const savingsItems = mAst.filter((a) => SAVINGS_NAMES.includes(a.name));
  const investItems = mAst.filter((a) => INVEST_NAMES.includes(a.name));
  const totSavings = savingsItems.reduce((s, a) => s + a.amount, 0);
  const totInvest = investItems.reduce((s, a) => s + a.amount, 0);

  // Previous month comparison
  const prevMonth = useMemo(() => {
    const idx = allMonths.indexOf(month);
    return idx > 0 ? allMonths[idx - 1] : null;
  }, [allMonths, month]);

  const prevAst = useMemo(() => {
    if (!prevMonth) return null;
    const items = assets.filter((a) => a.month === prevMonth);
    const total = items.reduce((s, a) => s + a.amount, 0);
    const savings = items.filter((a) => SAVINGS_NAMES.includes(a.name)).reduce((s, a) => s + a.amount, 0);
    const invest = items.filter((a) => INVEST_NAMES.includes(a.name)).reduce((s, a) => s + a.amount, 0);
    return { total, savings, invest };
  }, [assets, prevMonth]);

  // YTD: Jan of selected year as baseline
  const janAst = useMemo(() => {
    const yr = month.match(/^(\d+)\./)?.[1];
    if (!yr) return null;
    const janKey = yr + ".1월";
    const items = assets.filter((a) => a.month === janKey);
    if (items.length === 0) return null;
    const total = items.reduce((s, a) => s + a.amount, 0);
    const savings = items.filter((a) => SAVINGS_NAMES.includes(a.name)).reduce((s, a) => s + a.amount, 0);
    const invest = items.filter((a) => INVEST_NAMES.includes(a.name)).reduce((s, a) => s + a.amount, 0);
    return { total, savings, invest };
  }, [assets, month]);

  // Asset trend - same year as selected month only
  const assetTrend = useMemo(() => {
    const selectedYear = month.match(/^(\d+)\./)?.[1] || "";
    const byMonth = {};
    assets.forEach((a) => {
      byMonth[a.month] = (byMonth[a.month] || 0) + a.amount;
    });
    return allMonths
      .filter((m) => m.startsWith(selectedYear + ".") && byMonth[m])
      .map((m) => ({ month: m, total: byMonth[m] }));
  }, [assets, allMonths, month]);

  const expByCat = useMemo(() => {
    const m = {};
    mExp.forEach((e) => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return EXP_CATS.filter((c) => m[c]).map((c) => ({ c, a: m[c] })).sort((a, b) => b.a - a.a);
  }, [mExp]);

  const incByCat = useMemo(() => {
    const m = {};
    mInc.forEach((e) => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return INC_CATS.filter((c) => m[c]).map((c) => ({ c, a: m[c] })).sort((a, b) => b.a - a.a);
  }, [mInc]);

  // ── Asset actions ──
  async function updateAssetAmount(assetName, monthKey, newAmount) {
    // Upsert to Supabase
    const { data: upserted } = await supabase
      .from("assets")
      .upsert({ name: assetName, month: monthKey, amount: newAmount }, { onConflict: "name,month" })
      .select()
      .single();

    // Update local state
    const exists = assets.find((a) => a.name === assetName && a.month === monthKey);
    if (exists) {
      setAssets((prev) => prev.map((a) =>
        a.name === assetName && a.month === monthKey ? { ...a, amount: newAmount, id: upserted?.id || a.id } : a
      ));
    } else {
      setAssets((prev) => [...prev, { id: upserted?.id, name: assetName, month: monthKey, amount: newAmount }]);
    }
  }

  // Get item template: all unique asset names from the most recent month that has data
  const assetTemplate = useMemo(() => {
    const allNames = [...new Set(assets.map((a) => a.name))];
    return allNames;
  }, [assets]);

  // For current month: get existing values, or 0 for template items
  const currentSavings = useMemo(() => {
    return assetTemplate
      .filter((name) => SAVINGS_NAMES.includes(name))
      .map((name) => {
        const entry = mAst.find((a) => a.name === name);
        return { name, amount: entry ? entry.amount : 0, hasData: !!entry };
      });
  }, [assetTemplate, mAst]);

  const currentInvest = useMemo(() => {
    return assetTemplate
      .filter((name) => INVEST_NAMES.includes(name))
      .map((name) => {
        const entry = mAst.find((a) => a.name === name);
        return { name, amount: entry ? entry.amount : 0, hasData: !!entry };
      });
  }, [assetTemplate, mAst]);

  // ── Form actions ──
  function resetForm() {
    setFDate(new Date().toISOString().slice(0, 10));
    setFCat("롯데(메인생활1)");
    setFAmt("");
    setFMemo("");
    setEditId(null);
  }

  function openAdd(type) {
    resetForm();
    setFormType(type);
    setFCat(type === "income" ? "진수월급" : "롯데(메인생활1)");
    setFormOpen(true);
  }

  function openEdit(entry) {
    setEditId(entry.id);
    setFormType(entry.type);
    setFDate(entry.date);
    setFCat(entry.category);
    setFAmt(String(entry.amount));
    setFMemo(entry.memo || "");
    setFormOpen(true);
  }

  async function handleSave() {
    const amt = parseInt((fAmt || "0").replace(/[^0-9]/g, ""));
    if (!amt) return;
    const entry = {
      date: fDate,
      category: fCat,
      amount: amt,
      memo: fMemo,
      type: formType,
    };
    if (editId) {
      await updateTransaction(editId, entry);
    } else {
      await addTransaction(entry);
    }
    setMonth(tl(fDate));
    resetForm();
    setFormOpen(false);
  }

  async function handleDel() {
    await deleteTransaction(editId);
    resetForm();
    setFormOpen(false);
  }

  // ── Render ──
  if (!ready) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "system-ui", color: "#94a3b8" }}>
        불러오는 중...
      </div>
    );
  }

  const cats = formType === "income" ? INC_CATS : EXP_CATS;

  return (
    <div style={{
      fontFamily: "'Pretendard', system-ui, -apple-system, sans-serif",
      background: "#f8fafc", minHeight: "100vh",
      maxWidth: 480, margin: "0 auto",
      position: "relative", paddingBottom: 68,
    }}>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "14px 20px 10px", position: "sticky", top: 0, zIndex: 10,
      }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>
          아름 💜 진수네
        </h1>
        {!formOpen && (() => {
          // Group months by year
          const byYear = {};
          allMonths.forEach((m) => {
            const yr = m.match(/^(\d+)\./)?.[1] || "?";
            if (!byYear[yr]) byYear[yr] = [];
            byYear[yr].push(m);
          });
          const years = Object.keys(byYear).sort((a, b) => a - b);

          return (
            <div style={{ display: "flex", gap: 4, marginTop: 10, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
              {years.map((yr, yi) => (
                <div key={yr} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {yi > 0 && (
                    <div style={{ width: 1, height: 18, background: "#cbd5e1", flexShrink: 0, margin: "0 2px" }} />
                  )}
                  <span style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#94a3b8",
                    padding: "4px 6px",
                  }}>
                    {yr}
                  </span>
                  {byYear[yr].map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMonth(m); setEditingItem(null); }}
                      style={{
                        flexShrink: 0, padding: "4px 11px", borderRadius: 14,
                        border: "none", fontSize: 12,
                        fontWeight: month === m ? 700 : 500,
                        background: month === m ? "#0f172a" : "#f1f5f9",
                        color: month === m ? "#fff" : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {m.replace(/^\d+\./, "")}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ===== FORM ===== */}
      {formOpen && (
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              {editId ? "수정" : formType === "income" ? "수입 추가" : "지출 추가"}
            </h2>
            <button
              onClick={() => { resetForm(); setFormOpen(false); }}
              style={{ background: "none", border: "none", fontSize: 13, color: "#94a3b8", cursor: "pointer" }}
            >
              취소
            </button>
          </div>

          {!editId && (
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {["expense", "income"].map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setFormType(t);
                    setFCat(t === "income" ? "진수월급" : "롯데(메인생활1)");
                  }}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: formType === t ? "#0f172a" : "#f1f5f9",
                    color: formType === t ? "#fff" : "#64748b",
                  }}
                >
                  {t === "expense" ? "지출" : "수입"}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 }}>날짜</div>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={inputSt} />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 }}>카테고리</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {cats.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFCat(c)}
                    style={{
                      padding: "6px 13px", borderRadius: 7, cursor: "pointer",
                      fontSize: 12, fontWeight: 600,
                      border: fCat === c
                        ? "2px solid " + (COLORS[c] || "#6366f1")
                        : "2px solid #e2e8f0",
                      background: fCat === c
                        ? (COLORS[c] || "#6366f1") + "18"
                        : "#fff",
                      color: fCat === c
                        ? (COLORS[c] || "#6366f1")
                        : "#64748b",
                    }}
                  >
                    {SHORT[c] || c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 }}>금액</div>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={fAmt ? parseInt(fAmt.replace(/[^0-9]/g, "") || "0").toLocaleString() : ""}
                  onChange={(e) => setFAmt(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ ...inputSt, paddingRight: 34, fontSize: 17, fontWeight: 700 }}
                />
                <span style={{
                  position: "absolute", right: 13, top: "50%",
                  transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13, fontWeight: 600,
                }}>원</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 }}>
                메모 <span style={{ color: "#cbd5e1", fontWeight: 400 }}>(선택)</span>
              </div>
              <input
                type="text"
                placeholder="내역 메모"
                value={fMemo}
                onChange={(e) => setFMemo(e.target.value)}
                style={inputSt}
              />
            </div>

            <button
              onClick={handleSave}
              style={{
                marginTop: 4, padding: "13px 0", borderRadius: 11,
                border: "none", background: "#0f172a", color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}
            >
              {editId ? "수정 완료" : "저장"}
            </button>

            {editId && (
              <button
                onClick={handleDel}
                style={{
                  padding: "11px 0", borderRadius: 11,
                  border: "1.5px solid #fecaca", background: "#fff",
                  color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                삭제
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== HOME ===== */}
      {!formOpen && tab === "home" && (
        <div style={{ padding: "14px 18px" }}>
          {/* Expense / Income */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>지출</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{wonShort(totExp)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>수입</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#059669", marginTop: 2 }}>{wonShort(totInc)}</div>
            </div>
          </div>

          {/* Balance */}
          <div style={{
            ...card,
            background: balance >= 0 ? "#f0fdf4" : "#fef2f2",
            border: balance >= 0 ? "1px solid #bbf7d0" : "1px solid #fecaca",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: balance >= 0 ? "#166534" : "#991b1b" }}>
                잔액
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: balance >= 0 ? "#059669" : "#dc2626" }}>
                {balance >= 0 ? "+" : ""}{wonShort(balance)}
              </span>
            </div>
          </div>

          {/* Expense categories */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>지출 카테고리</div>
            {expByCat.length === 0 && (
              <div style={{ color: "#cbd5e1", fontSize: 12, padding: "8px 0" }}>데이터 없음</div>
            )}
            {expByCat.map((item) => (
              <div key={item.c} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{SHORT[item.c]}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{wonShort(item.a)}</span>
                </div>
                <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: (expByCat[0] ? (item.a / expByCat[0].a) * 100 : 0) + "%",
                    height: "100%", background: COLORS[item.c] || "#94a3b8", borderRadius: 3,
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Income breakdown */}
          {incByCat.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>수입 구성</div>
              {incByCat.map((item) => (
                <div key={item.c} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "5px 0", borderBottom: "1px solid #f1f5f9",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: COLORS[item.c] || "#94a3b8" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{SHORT[item.c]}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{wonShort(item.a)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Assets */}
          {mAst.length > 0 && (
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>자산 현황</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{wonShort(totAst)}</span>
              </div>
              {mAst.map((a, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "4px 0",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: COLORS[a.name] || "#94a3b8" }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{a.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{wonShort(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== EXPENSE TAB ===== */}
      {!formOpen && tab === "expense" && (
        <div style={{ padding: "14px 18px" }}>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{month} 총 지출</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{won(totExp)}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
              {expByCat.map((item) => (
                <span key={item.c} style={{
                  padding: "3px 9px", borderRadius: 5,
                  background: (COLORS[item.c] || "#94a3b8") + "14",
                  fontSize: 11, fontWeight: 600, color: COLORS[item.c] || "#94a3b8",
                }}>
                  {SHORT[item.c]} {wonShort(item.a)}
                </span>
              ))}
            </div>
          </div>
          {mExp.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
              이 달의 지출 없음
            </div>
          )}
          {mExp.map((e) => (
            <div
              key={e.id}
              onClick={() => openEdit(e)}
              style={{
                background: "#fff", borderRadius: 12, padding: "13px 15px",
                marginBottom: 7, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 11,
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ width: 4, height: 32, borderRadius: 2, background: COLORS[e.category] || "#94a3b8", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{SHORT[e.category] || e.category}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{won(e.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {e.date.slice(5).replace("-", "/")} {dayStr(e.date)}
                  </span>
                  {e.memo && (
                    <span style={{ fontSize: 11, color: "#94a3b8", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.memo}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== INCOME TAB ===== */}
      {!formOpen && tab === "income" && (
        <div style={{ padding: "14px 18px" }}>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{month} 총 수입</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#059669", marginTop: 2 }}>+{won(totInc)}</div>
          </div>
          {mInc.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
              이 달의 수입 없음
            </div>
          )}
          {mInc.map((e) => (
            <div
              key={e.id}
              onClick={() => openEdit(e)}
              style={{
                background: "#fff", borderRadius: 12, padding: "13px 15px",
                marginBottom: 7, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 11,
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ width: 4, height: 32, borderRadius: 2, background: COLORS[e.category] || "#94a3b8", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{SHORT[e.category] || e.category}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>+{won(e.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {e.date.slice(5).replace("-", "/")} {dayStr(e.date)}
                  </span>
                  {e.memo && (
                    <span style={{ fontSize: 11, color: "#94a3b8", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.memo}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== ASSETS TAB ===== */}
      {!formOpen && tab === "assets" && (
        <div style={{ padding: "14px 18px" }}>
          {/* Total */}
          <div style={card}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{month} 총 자산</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{wonShort(totAst)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {prevAst && (() => {
                const b = pctBadge(totAst, prevAst.total);
                return b ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: b.color, background: b.bg, padding: "2px 8px", borderRadius: 4 }}>
                    전월 {b.text}
                  </span>
                ) : null;
              })()}
              {janAst && month !== (month.match(/^(\d+)\./)?.[1] + ".1월") && (() => {
                const b = pctBadge(totAst, janAst.total);
                return b ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", background: "#eef2ff", padding: "2px 8px", borderRadius: 4 }}>
                    연간 {b.text}
                  </span>
                ) : null;
              })()}
            </div>
          </div>

          {/* Asset Trend Chart */}
          {assetTrend.length > 1 && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 8 }}>자산 추이 {month.match(/^(\d+)\./)?.[1]}년</div>
              {(() => {
                const maxVal = Math.max(...assetTrend.map((d) => d.total));
                const minVal = Math.min(...assetTrend.map((d) => d.total));
                const range = maxVal - minVal || 1;
                const padTop = 28;
                const padBot = 18;
                const chartH = 130;
                const bodyH = chartH - padTop - padBot;
                const padL = 45;
                const padR = 45;
                const W = 440;
                const usableW = W - padL - padR;
                const pts = assetTrend.map((d, i) => {
                  const x = padL + (assetTrend.length === 1 ? usableW / 2 : (i / (assetTrend.length - 1)) * usableW);
                  const y = padTop + bodyH - ((d.total - minVal) / range) * bodyH;
                  return { x, y, ...d };
                });
                const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                const areaPath = linePath + ` L ${pts[pts.length - 1].x} ${padTop + bodyH} L ${pts[0].x} ${padTop + bodyH} Z`;
                return (
                  <svg viewBox={`0 0 ${W} ${chartH}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Area fill */}
                    <path d={areaPath} fill="url(#assetGrad)" opacity="0.12" />
                    {/* Line */}
                    <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    {/* Dots + value labels + month labels */}
                    {pts.map((p, i) => {
                      const isCur = p.month === month;
                      return (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r={isCur ? 5 : 3.5} fill={isCur ? "#6366f1" : "#a5b4fc"} stroke="#fff" strokeWidth="2" />
                          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fontWeight="700" fill="#6366f1">
                            {wonShort(p.total)}
                          </text>
                          <text x={p.x} y={chartH - 3} textAnchor="middle" fontSize="10" fontWeight={isCur ? 800 : 500} fill={isCur ? "#0f172a" : "#94a3b8"}>
                            {p.month.replace(/^\d+\./, "")}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>
          )}

          {assetTemplate.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
              자산 데이터가 없어요
            </div>
          )}

          {assetTemplate.length > 0 && (
            <>
              {/* ── Ratio Bar: 예적금 vs 투자 ── */}
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 12 }}>자산 구성</div>
                {/* Stacked bar */}
                {(totSavings + totInvest) > 0 && (
                  <>
                    <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
                      {totSavings > 0 && (
                        <div style={{
                          width: (totSavings / (totSavings + totInvest) * 100) + "%",
                          background: "linear-gradient(135deg, #3b82f6, #60a5fa)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {totSavings / (totSavings + totInvest) > 0.15 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
                              {(totSavings / (totSavings + totInvest) * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                      {totInvest > 0 && (
                        <div style={{
                          width: (totInvest / (totSavings + totInvest) * 100) + "%",
                          background: "linear-gradient(135deg, #8b5cf6, #a78bfa)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {totInvest / (totSavings + totInvest) > 0.15 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
                              {(totInvest / (totSavings + totInvest) * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Legend */}
                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: "#3b82f6" }} />
                        <span style={{ fontSize: 12, color: "#475569" }}>예적금</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{wonShort(totSavings)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: "#8b5cf6" }} />
                        <span style={{ fontSize: 12, color: "#475569" }}>투자</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{wonShort(totInvest)}</span>
                      </div>
                    </div>
                  </>
                )}
                {(totSavings + totInvest) === 0 && (
                  <div style={{ fontSize: 12, color: "#cbd5e1", padding: "4px 0" }}>금액을 입력하면 비율이 표시돼요</div>
                )}
              </div>

              {/* ── 예적금 Section ── */}
              {currentSavings.length > 0 && (
                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6" }}>예적금</span>
                      {prevAst && totSavings > 0 && (() => {
                        const b = pctBadge(totSavings, prevAst.savings);
                        return b ? <span style={{ fontSize: 10, fontWeight: 700, color: b.color }}>{"전월" + b.text}</span> : null;
                      })()}
                      {janAst && totSavings > 0 && month !== (month.match(/^(\d+)\./)?.[1] + ".1월") && (() => {
                        const b = pctBadge(totSavings, janAst.savings);
                        return b ? <span style={{ fontSize: 10, fontWeight: 600, color: "#6366f1" }}>연간{"전월" + b.text}</span> : null;
                      })()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{totSavings > 0 ? wonShort(totSavings) : "-"}</span>
                  </div>
                  {currentSavings.map((a, i) => {
                    const isEd = editingAsset === "s-" + a.name;
                    return (
                      <div key={i} style={{ padding: "6px 0", borderBottom: i < currentSavings.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        {isEd ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#475569", flex: 1 }}>{a.name}</span>
                            <input
                              type="text" inputMode="numeric" autoFocus
                              value={assetDraft ? parseInt(assetDraft.replace(/[^0-9]/g, "") || "0").toLocaleString() : ""}
                              onChange={(e) => setAssetDraft(e.target.value.replace(/[^0-9]/g, ""))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault();
                                  const v = parseInt((assetDraft || "0").replace(/[^0-9]/g, ""));
                                  if (v > 0) updateAssetAmount(a.name, month, v);
                                  setEditingAsset(null);
                                }
                              }}
                              style={{ width: 110, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #93c5fd", fontSize: 12, fontWeight: 700, textAlign: "right", outline: "none" }}
                            />
                            <button onClick={() => { const v = parseInt((assetDraft || "0").replace(/[^0-9]/g, "")); if (v > 0) updateAssetAmount(a.name, month, v); setEditingAsset(null); }} style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>확인</button>
                          </div>
                        ) : (
                          <div onClick={() => { setEditingAsset("s-" + a.name); setAssetDraft(a.amount > 0 ? String(a.amount) : ""); }} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{a.name}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: a.amount > 0 ? "#0f172a" : "#cbd5e1" }}>
                              </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── 투자 Section with per-item memos ── */}
              {currentInvest.length > 0 && (
                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6" }}>투자</span>
                      {prevAst && totInvest > 0 && (() => {
                        const b = pctBadge(totInvest, prevAst.invest);
                        return b ? <span style={{ fontSize: 10, fontWeight: 700, color: b.color }}>{"전월" + b.text}</span> : null;
                      })()}
                      {janAst && totInvest > 0 && month !== (month.match(/^(\d+)\./)?.[1] + ".1월") && (() => {
                        const b = pctBadge(totInvest, janAst.invest);
                        return b ? <span style={{ fontSize: 10, fontWeight: 600, color: "#6366f1" }}>연간{"전월" + b.text}</span> : null;
                      })()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{totInvest > 0 ? wonShort(totInvest) : "-"}</span>
                  </div>
                  {currentInvest.map((a, i) => {
                    const memo = (investMemos[month] || {})[a.name] || "";
                    const isEditing = editingItem === a.name;
                    return (
                      <div key={i} style={{
                        padding: "8px 0",
                        borderBottom: i < currentInvest.length - 1 ? "1px solid #f1f5f9" : "none",
                      }}>
                        {/* Item row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div
                            onClick={() => {
                              if (isEditing) return;
                              setEditingItem(a.name);
                              setItemDraft(memo);
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1 }}
                          >
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: COLORS[a.name] || "#8b5cf6" }} />
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{a.name}</span>
                          </div>
                          {editingAsset === "i-" + a.name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                type="text" inputMode="numeric" autoFocus
                                value={assetDraft ? parseInt(assetDraft.replace(/[^0-9]/g, "") || "0").toLocaleString() : ""}
                                onChange={(e) => setAssetDraft(e.target.value.replace(/[^0-9]/g, ""))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault();
                                    const v = parseInt((assetDraft || "0").replace(/[^0-9]/g, ""));
                                    if (v > 0) updateAssetAmount(a.name, month, v);
                                    setEditingAsset(null);
                                  }
                                }}
                                style={{ width: 100, padding: "3px 6px", borderRadius: 5, border: "1.5px solid #c4b5fd", fontSize: 12, fontWeight: 700, textAlign: "right", outline: "none" }}
                              />
                              <button onClick={() => { const v = parseInt((assetDraft || "0").replace(/[^0-9]/g, "")); if (v > 0) updateAssetAmount(a.name, month, v); setEditingAsset(null); }} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "#7c3aed", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>확인</button>
                            </div>
                          ) : (
                            <div
                              onClick={() => { setEditingAsset("i-" + a.name); setAssetDraft(a.amount > 0 ? String(a.amount) : ""); }}
                              style={{ cursor: "pointer", textAlign: "right" }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: a.amount > 0 ? "#0f172a" : "#cbd5e1" }}>
                                {a.amount > 0 ? wonShort(a.amount) : "미입력"}</div>
                              {a.amount > 0 && a.prevAmt > 0 && (() => { const p = ((a.amount - a.prevAmt) / a.prevAmt * 100); return <span style={{fontSize:9,fontWeight:600,color:p>=0?"#059669":"#dc2626",marginRight:4}}>{p>=0?"+":""}{p.toFixed(1)}%</span>; })()}
                              {a.amount > 0 && a.janAmt > 0 && month !== (month.match(/^(\d+)\./)?.[1] + '.1월') && (() => { const p = ((a.amount - a.janAmt) / a.janAmt * 100); return <span style={{fontSize:9,fontWeight:600,color:"#6366f1"}}>연{p>=0?"+":""}{p.toFixed(1)}%</span>; })()}
                            </div>
                          )}
                        </div>
                        {/* Memo display */}
                        {memo && !isEditing && (
                          <div
                            onClick={() => { setEditingItem(a.name); setItemDraft(memo); }}
                            style={{
                              marginTop: 4, marginLeft: 12, padding: "5px 10px",
                              borderRadius: 6, background: "#f5f3ff", cursor: "pointer",
                              fontSize: 12, lineHeight: 1.5, color: "#6d28d9",
                            }}
                          >
                            {memo}
                          </div>
                        )}
                        {/* No memo hint */}
                        {!memo && !isEditing && (
                          <div
                            onClick={() => { setEditingItem(a.name); setItemDraft(""); }}
                            style={{
                              marginTop: 2, marginLeft: 12,
                              fontSize: 11, color: "#cbd5e1", cursor: "pointer",
                            }}
                          >
                            + 메모 추가
                          </div>
                        )}
                        {/* Edit mode */}
                        {isEditing && (
                          <div style={{ marginTop: 6, marginLeft: 12 }}>
                            <input
                              type="text"
                              autoFocus
                              value={itemDraft}
                              onChange={(e) => setItemDraft(e.target.value)}
                              placeholder="손익률, 평가금액, 메모 등(Shift+Enter로 줄바꿈)"
                              style={{
                                width: "100%", padding: "7px 10px", borderRadius: 6,
                                border: "1.5px solid #c4b5fd", fontSize: 12,
                                color: "#0f172a", background: "#faf8ff",
                                outline: "none", boxSizing: "border-box",
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault();
                                  saveItemMemo(month, a.name, itemDraft);
                                  setEditingItem(null);
                                }
                              }}
                            />
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <button
                                onClick={() => { saveItemMemo(month, a.name, itemDraft); setEditingItem(null); }}
                                style={{
                                  padding: "5px 14px", borderRadius: 6, border: "none",
                                  background: "#7c3aed", color: "#fff", fontSize: 11,
                                  fontWeight: 600, cursor: "pointer",
                                }}
                              >
                                저장
                              </button>
                              <button
                                onClick={() => setEditingItem(null)}
                                style={{
                                  padding: "5px 14px", borderRadius: 6, border: "1px solid #e2e8f0",
                                  background: "#fff", color: "#64748b", fontSize: 11,
                                  fontWeight: 600, cursor: "pointer",
                                }}
                              >
                                취소
                              </button>
                              {memo && (
                                <button
                                  onClick={() => { saveItemMemo(month, a.name, ""); setEditingItem(null); }}
                                  style={{
                                    padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca",
                                    background: "#fff", color: "#ef4444", fontSize: 11,
                                    fontWeight: 600, cursor: "pointer",
                                  }}
                                >
                                  삭제
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* ===== BOTTOM NAV ===== */}
      {!formOpen && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 480, background: "#fff",
          borderTop: "1px solid #e2e8f0", display: "flex", zIndex: 20,
        }}>
          {[
            { id: "home", label: "홈", icon: "⌂" },
            { id: "expense", label: "지출", icon: "↑" },
            { id: "add", label: "", icon: "+" },
            { id: "income", label: "수입", icon: "↓" },
            { id: "assets", label: "자산", icon: "◆" },
          ].map((item) => {
            if (item.id === "add") {
              return (
                <button
                  key="add"
                  onClick={() => openAdd("expense")}
                  style={{
                    flex: 1, padding: "8px 0", border: "none", background: "none", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center",
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: "#0f172a",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 300, marginTop: -14,
                    boxShadow: "0 2px 10px rgba(15,23,42,0.25)",
                  }}>+</div>
                </button>
              );
            }
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                style={{
                  flex: 1, padding: "10px 0 8px", border: "none", background: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1, color: active ? "#0f172a" : "#94a3b8" }}>{item.icon}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? "#0f172a" : "#94a3b8" }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
