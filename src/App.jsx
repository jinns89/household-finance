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
  // "YYYY-MM-DD" 문자열은 시간대 영향 없이 그대로 해석
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
  if (p) return parseInt(p[1]) + "." + parseInt(p[2]) + "월";
  const d = new Date(dateStr);
  return d.getFullYear() + "." + (d.getMonth() + 1) + "월";
}

// 한국(로컬) 기준 오늘 날짜 "YYYY-MM-DD" (toISOString은 UTC라 오전 9시 전엔 하루 밀림)
function localToday() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// 선택된 월("2026.10월")에 맞는 기본 날짜: 이번 달이면 오늘, 아니면 그 달 1일
function defaultDateFor(monthKey) {
  const today = localToday();
  if (!monthKey || tl(today) === monthKey) return today;
  const p = /^(\d+)\.(\d+)/.exec(monthKey);
  if (!p) return today;
  return p[1] + "-" + String(parseInt(p[2])).padStart(2, "0") + "-01";
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

// ── Donut chart (SVG, 라이브러리 없음) ──
function Donut({ items, total, centerLabel, centerColor = "#0f172a" }) {
  const size = 132, stroke = 20, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {total > 0 && items.map((it) => {
        const len = (it.a / total) * C;
        const gap = items.length > 1 ? Math.min(2, len / 3) : 0;
        const el = (
          <circle
            key={it.c}
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={COLORS[it.c] || "#94a3b8"} strokeWidth={stroke}
            strokeDasharray={`${Math.max(len - gap, 0)} ${C}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x="50%" y="45%" textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}>{centerLabel}</text>
      <text x="50%" y="59%" textAnchor="middle" style={{ fontSize: 14, fill: centerColor, fontWeight: 800 }}>{wonShort(total)}</text>
    </svg>
  );
}

function DonutCard({ title, items, total, centerLabel, centerColor }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: "#cbd5e1", fontSize: 12, padding: "8px 0" }}>데이터 없음</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Donut items={items} total={total} centerLabel={centerLabel} centerColor={centerColor} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {items.map((it) => (
              <div key={it.c} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[it.c] || "#94a3b8", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", flex: 1, whiteSpace: "nowrap" }}>{SHORT[it.c] || it.c}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", width: 40, textAlign: "right" }}>
                  {total > 0 ? Math.round((it.a / total) * 100) : 0}%
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8", width: 52, textAlign: "right", whiteSpace: "nowrap" }}>
                  {wonShort(it.a)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 자산 항목 추가 행 ──
function AddItemRow({ color, placeholder, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(name.trim());
    setBusy(false);
    if (ok) { setName(""); setOpen(false); }
  }
  if (!open) {
    return (
      <div onClick={() => setOpen(true)} style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color, cursor: "pointer" }}>
        + 항목 추가
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
      <input
        autoFocus value={name} placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        style={{ flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 6, border: "1.5px solid " + color + "66", fontSize: 12, outline: "none" }}
      />
      <button onClick={submit} disabled={busy} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: color, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>추가</button>
      <button onClick={() => { setOpen(false); setName(""); }} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>취소</button>
    </div>
  );
}

// ═══════════════════════════════════════════
// APP
// ═══════════════════════════════════════════
export default function App() {
  const [data, setData] = useState([]);
  const [assets, setAssets] = useState([]);
  const [assetItems, setAssetItems] = useState([]); // asset_items: { name, grp: savings|invest|debt, hidden }
  const [showHidden, setShowHidden] = useState(false);
  const [trendMode, setTrendMode] = useState("total"); // 자산 추이: total | net
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("home");
  const [homePeriod, setHomePeriod] = useState("month"); // 홈 도넛 기간: month | year
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() + "." + (now.getMonth() + 1) + "월";
  });

  // Form
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState("expense");
  const [editId, setEditId] = useState(null);
  const [fDate, setFDate] = useState(() => localToday());
  const [fCat, setFCat] = useState("롯데(메인생활1)");
  const [fAmt, setFAmt] = useState("");
  const [fMemo, setFMemo] = useState("");

  // Investment memos: { "2026.6월": { "주식+달러+금": "손익률 13%", ... } }
  const [investMemos, setInvestMemos] = useState({});
  const [editingItem, setEditingItem] = useState(null); // asset name being edited
  const [itemDraft, setItemDraft] = useState("");

  // Asset editing
  const [editingAsset, setEditingAsset] = useState(null); // asset name being amount-edited
  const [showPrev, setShowPrev] = useState(false);
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

      // Load asset item groups (테이블이 아직 없으면 무시하고 기본 목록으로 동작)
      const { data: items, error: itemsErr } = await supabase.from("asset_items").select("*");
      if (items && !itemsErr) {
        setAssetItems(items.map((i) => ({ name: i.name, grp: i.grp, hidden: !!i.hidden })));
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
  // 항목 그룹 판별: asset_items 우선, 없으면 기존 고정 목록
  const groupOf = useCallback((name) => {
    const it = assetItems.find((i) => i.name === name);
    if (it) return it.grp;
    if (INVEST_NAMES.includes(name)) return "invest";
    return "savings";
  }, [assetItems]);

  // mAst = 자산(부채 제외), mDebt = 부채
  const mAst = useMemo(
    () => assets.filter((a) => a.month === month && groupOf(a.name) !== "debt").sort((a, b) => b.amount - a.amount),
    [assets, month, groupOf]
  );
  const mDebt = useMemo(
    () => assets.filter((a) => a.month === month && groupOf(a.name) === "debt").sort((a, b) => b.amount - a.amount),
    [assets, month, groupOf]
  );

  const totExp = mExp.reduce((s, e) => s + e.amount, 0);
  const totInc = mInc.reduce((s, e) => s + e.amount, 0);
  const totAst = mAst.reduce((s, a) => s + a.amount, 0);
  const totDebt = mDebt.reduce((s, a) => s + a.amount, 0);
  const netWorth = totAst - totDebt;
  const balance = totInc - totExp;

  // Asset groups
  const savingsItems = mAst.filter((a) => groupOf(a.name) === "savings");
  const investItems = mAst.filter((a) => groupOf(a.name) === "invest");
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
    const sumG = (g) => items.filter((a) => groupOf(a.name) === g).reduce((s, a) => s + a.amount, 0);
    const savings = sumG("savings"), invest = sumG("invest"), debt = sumG("debt");
    const total = savings + invest;
    return { total, savings, invest, debt, net: total - debt };
  }, [assets, prevMonth, groupOf]);

  // YTD: Jan of selected year as baseline
  const janAst = useMemo(() => {
    const yr = month.match(/^(\d+)\./)?.[1];
    if (!yr) return null;
    const janKey = yr + ".1월";
    const items = assets.filter((a) => a.month === janKey);
    if (items.length === 0) return null;
    const sumG = (g) => items.filter((a) => groupOf(a.name) === g).reduce((s, a) => s + a.amount, 0);
    const savings = sumG("savings"), invest = sumG("invest"), debt = sumG("debt");
    const total = savings + invest;
    return { total, savings, invest, debt, net: total - debt };
  }, [assets, month, groupOf]);

  // Asset trend - same year as selected month only
  const assetTrend = useMemo(() => {
    const selectedYear = month.match(/^(\d+)\./)?.[1] || "";
    const byMonth = {}, debtByMonth = {};
    assets.forEach((a) => {
      if (groupOf(a.name) === "debt") debtByMonth[a.month] = (debtByMonth[a.month] || 0) + a.amount;
      else byMonth[a.month] = (byMonth[a.month] || 0) + a.amount;
    });
    return allMonths
      .filter((m) => m.startsWith(selectedYear + ".") && byMonth[m])
      .map((m) => ({ month: m, total: byMonth[m], debt: debtByMonth[m] || 0, net: byMonth[m] - (debtByMonth[m] || 0) }));
  }, [assets, allMonths, month, groupOf]);

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

  // ── 연간 집계 (선택된 월의 연도 기준) ──
  const selYear = month.match(/^(\d+)\./)?.[1] || "";
  const yearStats = useMemo(() => {
    const yExp = data.filter((e) => e.type === "expense" && tl(e.date).startsWith(selYear + "."));
    const yInc = data.filter((e) => e.type === "income" && tl(e.date).startsWith(selYear + "."));
    const sumBy = (arr, cats) => {
      const m = {};
      arr.forEach((e) => { m[e.category] = (m[e.category] || 0) + e.amount; });
      const known = cats.filter((c) => m[c]).map((c) => ({ c, a: m[c] }));
      const etc = Object.keys(m).filter((c) => !cats.includes(c)).map((c) => ({ c, a: m[c] }));
      return [...known, ...etc].sort((a, b) => b.a - a.a);
    };
    const months = new Set([...yExp, ...yInc].map((e) => parseInt(tl(e.date).match(/\.(\d+)/)[1])));
    const ms = [...months].sort((a, b) => a - b);
    return {
      exp: yExp.reduce((s, e) => s + e.amount, 0),
      inc: yInc.reduce((s, e) => s + e.amount, 0),
      expByCat: sumBy(yExp, EXP_CATS),
      incByCat: sumBy(yInc, INC_CATS),
      range: ms.length ? (ms[0] === ms[ms.length - 1] ? ms[0] + "월" : ms[0] + "~" + ms[ms.length - 1] + "월") : "",
    };
  }, [data, selYear]);

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
  // 숨긴 항목은 그 달에 값이 있을 때만 표시 (과거 기록은 그대로 보임)
  const assetTemplate = useMemo(() => {
    const allNames = [...new Set([...assets.map((a) => a.name), ...assetItems.map((i) => i.name)])];
    const hasData = new Set(assets.filter((a) => a.month === month).map((a) => a.name));
    return allNames.filter((n) => hasData.has(n) || !assetItems.find((i) => i.name === n)?.hidden);
  }, [assets, assetItems, month]);

  const hiddenItems = useMemo(() => assetItems.filter((i) => i.hidden), [assetItems]);

  // For current month: get existing values, or 0 for template items
  const currentSavings = useMemo(() => {
    const prevItems = prevMonth ? assets.filter((a) => a.month === prevMonth) : [];
    return assetTemplate
      .filter((name) => groupOf(name) === "savings")
      .map((name) => {
        const entry = mAst.find((a) => a.name === name);
        const prev = prevItems.find((a) => a.name === name);
        return { name, amount: entry ? entry.amount : 0, hasData: !!entry, prevAmt: prev ? prev.amount : 0 };
      });
  }, [assetTemplate, mAst, assets, prevMonth, groupOf]);

  const currentDebt = useMemo(() => {
    const prevItems = prevMonth ? assets.filter((a) => a.month === prevMonth) : [];
    return assetTemplate
      .filter((name) => groupOf(name) === "debt")
      .map((name) => {
        const entry = mDebt.find((a) => a.name === name);
        const prev = prevItems.find((a) => a.name === name);
        return { name, amount: entry ? entry.amount : 0, hasData: !!entry, prevAmt: prev ? prev.amount : 0 };
      });
  }, [assetTemplate, mDebt, assets, prevMonth, groupOf]);

  const currentInvest = useMemo(() => {
    const yr = month.match(/^(\d+)\./)?.[1];
    const janKey = yr ? yr + ".1월" : null;
    const prevItems = prevMonth ? assets.filter((a) => a.month === prevMonth) : [];
    const janItems = janKey ? assets.filter((a) => a.month === janKey) : [];
    return assetTemplate
      .filter((name) => groupOf(name) === "invest")
      .map((name) => {
        const entry = mAst.find((a) => a.name === name);
        const prev = prevItems.find((a) => a.name === name);
        const jan = janItems.find((a) => a.name === name);
        return { name, amount: entry ? entry.amount : 0, hasData: !!entry, prevAmt: prev ? prev.amount : 0, janAmt: jan ? jan.amount : 0 };
      });
  }, [assetTemplate, mAst, assets, prevMonth, month, groupOf]);

  // ── 자산 항목 관리 ──
  async function addAssetItem(rawName, grp) {
    const name = rawName.trim();
    if (!name) return false;
    const existing = assetItems.find((i) => i.name === name);
    if ((existing && !existing.hidden) || (!existing && assets.some((a) => a.name === name))) {
      alert("이미 있는 항목 이름이에요.");
      return false;
    }
    const { error } = await supabase.from("asset_items").upsert({ name, grp, hidden: false }, { onConflict: "name" });
    if (error) {
      alert("항목 추가에 실패했어요. Supabase에 asset_items 테이블이 있는지 확인해주세요.\n\n" + error.message);
      return false;
    }
    setAssetItems((prev) => [...prev.filter((i) => i.name !== name), { name, grp, hidden: false }]);
    return true;
  }

  async function setItemHidden(name, hidden) {
    const grp = groupOf(name);
    if (hidden) {
      const hasNow = assets.some((a) => a.name === name && a.month === month);
      const msg = "'" + name + "' 항목을 목록에서 숨길까요?\n\n값을 입력하지 않은 달에는 더 이상 안 보이고, 지난 기록은 그대로 남아요."
        + (hasNow ? "\n(" + month + "은 이미 값이 있어서 이번 달엔 계속 보여요)" : "")
        + "\n맨 아래 '숨긴 항목'에서 언제든 다시 표시할 수 있어요.";
      if (!window.confirm(msg)) return;
    }
    const { error } = await supabase.from("asset_items").upsert({ name, grp, hidden }, { onConflict: "name" });
    if (error) {
      alert("변경에 실패했어요. Supabase에 asset_items 테이블이 있는지 확인해주세요.\n\n" + error.message);
      return;
    }
    setAssetItems((prev) => [...prev.filter((i) => i.name !== name), { name, grp, hidden }]);
    setEditingItem(null);
  }

  // ── Form actions ──
  function resetForm() {
    setFDate(localToday());
    setFCat("롯데(메인생활1)");
    setFAmt("");
    setFMemo("");
    setEditId(null);
  }

  function openAdd(type) {
    resetForm();
    setFormType(type);
    setFCat(type === "income" ? "진수월급" : "롯데(메인생활1)");
    setFDate(defaultDateFor(month)); // 선택된 월 기준으로 날짜 세팅
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
              {fDate && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>
                  <b style={{ color: "#0f172a" }}>{tl(fDate).replace(/^(\d+)\./, "$1년 ")}</b> 내역으로 저장돼요
                </div>
              )}
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
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{month.replace(/^\d+\./, "")} 지출</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{wonShort(totExp)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{month.replace(/^\d+\./, "")} 수입</div>
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
                {month.replace(/^\d+\./, "")} 손익
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: balance >= 0 ? "#059669" : "#dc2626" }}>
                {balance >= 0 ? "+" : ""}{wonShort(balance)}
              </span>
            </div>
          </div>

          {/* Yearly summary */}
          {(() => {
            const yBal = yearStats.inc - yearStats.exp;
            return (
              <div style={{ ...card, background: "#0f172a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{selYear}년 누적</span>
                  {yearStats.range && <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{yearStats.range}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { l: "총 지출", v: wonShort(yearStats.exp), c: "#fda4af" },
                    { l: "총 수입", v: wonShort(yearStats.inc), c: "#6ee7b7" },
                    { l: "총 손익", v: (yBal >= 0 ? "+" : "") + wonShort(yBal), c: yBal >= 0 ? "#fff" : "#fca5a5" },
                  ].map((x) => (
                    <div key={x.l}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>{x.l}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: x.c, marginTop: 2, whiteSpace: "nowrap" }}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Donut period toggle */}
          <div style={{ display: "flex", background: "#e2e8f0", borderRadius: 9, padding: 3, marginBottom: 12 }}>
            {[
              { id: "month", label: month.replace(/^\d+\./, "") + " 비중" },
              { id: "year", label: selYear + "년 비중" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setHomePeriod(p.id)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 700,
                  background: homePeriod === p.id ? "#fff" : "transparent",
                  color: homePeriod === p.id ? "#0f172a" : "#64748b",
                  boxShadow: homePeriod === p.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <DonutCard
            title="지출 카테고리"
            items={homePeriod === "year" ? yearStats.expByCat : expByCat}
            total={homePeriod === "year" ? yearStats.exp : totExp}
            centerLabel="지출"
          />
          <DonutCard
            title="수입 구성"
            items={homePeriod === "year" ? yearStats.incByCat : incByCat}
            total={homePeriod === "year" ? yearStats.inc : totInc}
            centerLabel="수입"
            centerColor="#059669"
          />

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
              {totDebt > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>부채</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#e11d48" }}>-{wonShort(totDebt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>순자산</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{wonShort(netWorth)}</span>
                  </div>
                </div>
              )}
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
            {totDebt > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>부채</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#e11d48", marginTop: 2 }}>-{wonShort(totDebt)}</div>
                  {prevAst && prevAst.debt > 0 && totDebt < prevAst.debt && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#059669", marginTop: 1 }}>전월보다 {wonShort(prevAst.debt - totDebt)} 줄었어요</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>순자산</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: netWorth >= 0 ? "#0f172a" : "#e11d48", marginTop: 2 }}>{wonShort(netWorth)}</div>
                  {prevAst && prevAst.debt > 0 && (() => {
                    const d = netWorth - prevAst.net;
                    return d !== 0 ? (
                      <div style={{ fontSize: 10, fontWeight: 700, color: d > 0 ? "#059669" : "#dc2626", marginTop: 1 }}>전월 {d > 0 ? "+" : "-"}{wonShort(Math.abs(d))}</div>
                    ) : null;
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Asset Trend Chart */}
          {assetTrend.length > 1 && (
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>자산 추이 {month.match(/^(\d+)\./)?.[1]}년</span>
                {assetTrend.some((d) => d.debt > 0) && (
                  <span style={{ display: "flex", background: "#f1f5f9", borderRadius: 6, padding: 2 }}>
                    {[{ id: "total", l: "총자산" }, { id: "net", l: "순자산" }].map((o) => (
                      <button key={o.id} onClick={() => setTrendMode(o.id)} style={{
                        padding: "3px 9px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700,
                        background: trendMode === o.id ? "#fff" : "transparent", color: trendMode === o.id ? "#0f172a" : "#94a3b8",
                      }}>{o.l}</button>
                    ))}
                  </span>
                )}
              </div>
              {(() => {
                const hasDebt = assetTrend.some((d) => d.debt > 0);
                const valOf = (d) => (hasDebt && trendMode === "net" ? d.net : d.total);
                const maxVal = Math.max(...assetTrend.map(valOf));
                const minVal = Math.min(...assetTrend.map(valOf));
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
                  const y = padTop + bodyH - ((valOf(d) - minVal) / range) * bodyH;
                  return { x, y, ...d, total: valOf(d) };
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

              {/* ── 예적금 Section with per-item memos ── */}
              {(
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
                        return b ? <span style={{ fontSize: 10, fontWeight: 600, color: "#6366f1" }}>연간 {b.text}</span> : null;
                      })()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{totSavings > 0 ? wonShort(totSavings) : "-"}</span>
                  </div>
                  {currentSavings.map((a, i) => {
                    const memo = (investMemos[month] || {})[a.name] || "";
                    const isEditing = editingItem === "s-" + a.name;
                    return (
                      <div key={i} style={{
                        padding: "8px 0",
                        borderBottom: i < currentSavings.length - 1 ? "1px solid #f1f5f9" : "none",
                      }}>
                        {/* Item row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div
                            onClick={() => {
                              if (isEditing) return;
                              setEditingItem("s-" + a.name);
                              setItemDraft(memo);
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1 }}
                          >
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: COLORS[a.name] || "#3b82f6" }} />
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{a.name}</span>
                          </div>
                          {editingAsset === "s-" + a.name ? (
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
                                style={{ width: 100, padding: "3px 6px", borderRadius: 5, border: "1.5px solid #93c5fd", fontSize: 12, fontWeight: 700, textAlign: "right", outline: "none" }}
                              />
                              <button onClick={() => { const v = parseInt((assetDraft || "0").replace(/[^0-9]/g, "")); if (v > 0) updateAssetAmount(a.name, month, v); setEditingAsset(null); }} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>확인</button>
                            </div>
                          ) : (
                            <div
                              onClick={() => { setEditingAsset("s-" + a.name); setAssetDraft(a.amount > 0 ? String(a.amount) : ""); }}
                              style={{ cursor: "pointer", textAlign: "right" }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: a.amount > 0 ? "#0f172a" : "#cbd5e1" }}>
                                {a.amount > 0 ? wonShort(a.amount) : "미입력"}</div>

                            </div>
                          )}
                        </div>
                        {/* Memo display */}
                        {memo && !isEditing && (
                          <div
                            onClick={() => { setEditingItem("s-" + a.name); setItemDraft(memo); }}
                            style={{
                              marginTop: 4, marginLeft: 12, padding: "5px 10px",
                              borderRadius: 6, background: "#eff6ff", cursor: "pointer", whiteSpace: "pre-wrap",
                              fontSize: 12, lineHeight: 1.5, color: "#0369a1",
                            }}
                          >
                            {memo}
                          </div>
                        )}
                        {/* No memo hint */}
                        {!memo && !isEditing && (
                          <div
                            onClick={() => { setEditingItem("s-" + a.name); setItemDraft(""); }}
                            style={{
                              marginTop: 2, marginLeft: 12,
                              fontSize: 11, color: "#cbd5e1", cursor: "pointer",
                            }}
                          >
                            + 메모 추가
                          </div>
                        )}
                        {a.prevAmt > 0 && (<div style={{display:"flex",justifyContent:"space-between",marginTop:4,marginLeft:12}}><span style={{fontSize:10,color:"#94a3b8"}}>{prevMonth}</span><span style={{fontSize:10,color:"#94a3b8"}}>{wonShort(a.prevAmt)}{a.amount>0&&a.amount!==a.prevAmt?(a.amount>a.prevAmt?" ▲":" ▼"):""}</span></div>)}
                        {/* Edit mode */}
                        {isEditing && (
                          <div style={{ marginTop: 6, marginLeft: 12 }}>
                            <textarea
                              autoFocus
                              value={itemDraft}
                              onChange={(e) => setItemDraft(e.target.value)}
                              placeholder="이자율, 만기일, 메모 등" rows={3}
                              style={{
                                width: "100%", padding: "7px 10px", borderRadius: 6,
                                border: "1.5px solid #93c5fd", fontSize: 12,
                                color: "#0f172a", background: "#f0f9ff",
                                outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault();
                                  saveItemMemo(month, a.name, itemDraft);
                                  setEditingItem(null);
                                }
                              }}
                            ></textarea>
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <button
                                onClick={() => { saveItemMemo(month, a.name, itemDraft); setEditingItem(null); }}
                                style={{
                                  padding: "5px 14px", borderRadius: 6, border: "none",
                                  background: "#3b82f6", color: "#fff", fontSize: 11,
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
                              <button
                                onClick={() => setItemHidden(a.name, true)}
                                style={{
                                  marginLeft: "auto", padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0",
                                  background: "#fff", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer",
                                }}
                              >
                                목록에서 숨기기
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <AddItemRow color="#3b82f6" placeholder="예: 적금(카카오)" onAdd={(n) => addAssetItem(n, "savings")} />
                </div>
              )}

              {/* ── 투자 Section with per-item memos ── */}
              {(
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
                        return b ? <span style={{ fontSize: 10, fontWeight: 600, color: "#6366f1" }}>연간 {b.text}</span> : null;
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
                              {a.amount>0&&a.prevAmt>0&&(()=>{const p=((a.amount-a.prevAmt)/a.prevAmt*100);return <div style={{fontSize:9,fontWeight:600,color:p>=0?"#059669":"#dc2626"}}>전월{p>=0?"+":""}{p.toFixed(1)}%</div>})()}

                            </div>
                          )}
                        </div>
                        {/* Memo display */}
                        {memo && !isEditing && (
                          <div
                            onClick={() => { setEditingItem(a.name); setItemDraft(memo); }}
                            style={{
                              marginTop: 4, marginLeft: 12, padding: "5px 10px",
                              borderRadius: 6, background: "#f5f3ff", cursor: "pointer", whiteSpace: "pre-wrap",
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
                        {a.prevAmt > 0 && (<div style={{display:"flex",justifyContent:"space-between",marginTop:4,marginLeft:12}}><span style={{fontSize:10,color:"#94a3b8"}}>{prevMonth}</span><span style={{fontSize:10,color:"#94a3b8"}}>{wonShort(a.prevAmt)}{a.amount>0&&a.amount!==a.prevAmt?(a.amount>a.prevAmt?" ▲":" ▼"):""}</span></div>)}
                        {/* Edit mode */}
                        {isEditing && (
                          <div style={{ marginTop: 6, marginLeft: 12 }}>
                            <textarea
                              autoFocus
                              value={itemDraft}
                              onChange={(e) => setItemDraft(e.target.value)}
                              placeholder="손익률, 평가금액, 메모 등" rows={3}
                              style={{
                                width: "100%", padding: "7px 10px", borderRadius: 6,
                                border: "1.5px solid #c4b5fd", fontSize: 12,
                                color: "#0f172a", background: "#faf8ff",
                                outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault();
                                  saveItemMemo(month, a.name, itemDraft);
                                  setEditingItem(null);
                                }
                              }}
                            ></textarea>
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
                              <button
                                onClick={() => setItemHidden(a.name, true)}
                                style={{
                                  marginLeft: "auto", padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0",
                                  background: "#fff", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer",
                                }}
                              >
                                목록에서 숨기기
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <AddItemRow color="#8b5cf6" placeholder="예: 연금저축(진수)" onAdd={(n) => addAssetItem(n, "invest")} />
                </div>
              )}

              {/* ── 부채 Section ── */}
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: currentDebt.length ? 10 : 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#e11d48" }}>부채</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: totDebt > 0 ? "#e11d48" : "#0f172a" }}>{totDebt > 0 ? "-" + wonShort(totDebt) : "-"}</span>
                </div>
                {currentDebt.length === 0 && (
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>대출 잔액을 추가하면 순자산과 상환 추이를 볼 수 있어요</div>
                )}
                {currentDebt.map((a, i) => {
                  const open = editingItem === "d-" + a.name;
                  const diff = a.amount > 0 && a.prevAmt > 0 ? a.amount - a.prevAmt : 0;
                  return (
                    <div key={a.name} style={{ padding: "8px 0", borderBottom: i < currentDebt.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div onClick={() => setEditingItem(open ? null : "d-" + a.name)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, background: "#e11d48" }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{a.name}</span>
                        </div>
                        {editingAsset === "d-" + a.name ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input
                              type="text" inputMode="numeric" autoFocus
                              value={assetDraft ? parseInt(assetDraft.replace(/[^0-9]/g, "") || "0").toLocaleString() : ""}
                              onChange={(e) => setAssetDraft(e.target.value.replace(/[^0-9]/g, ""))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault();
                                  const v = parseInt((assetDraft || "0").replace(/[^0-9]/g, ""));
                                  if (v > 0) updateAssetAmount(a.name, month, v);
                                  setEditingAsset(null);
                                }
                              }}
                              style={{ width: 100, padding: "3px 6px", borderRadius: 5, border: "1.5px solid #fda4af", fontSize: 12, fontWeight: 700, textAlign: "right", outline: "none" }}
                            />
                            <button onClick={() => { const v = parseInt((assetDraft || "0").replace(/[^0-9]/g, "")); if (v > 0) updateAssetAmount(a.name, month, v); setEditingAsset(null); }} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "#e11d48", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>확인</button>
                          </div>
                        ) : (
                          <div onClick={() => { setEditingAsset("d-" + a.name); setAssetDraft(a.amount > 0 ? String(a.amount) : ""); }} style={{ cursor: "pointer", textAlign: "right" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: a.amount > 0 ? "#0f172a" : "#cbd5e1" }}>{a.amount > 0 ? wonShort(a.amount) : "미입력"}</div>
                            {diff !== 0 && (
                              <div style={{ fontSize: 9, fontWeight: 700, color: diff < 0 ? "#059669" : "#dc2626" }}>
                                {diff < 0 ? "▼ " + wonShort(-diff) + " 상환" : "▲ " + wonShort(diff) + " 증가"}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {a.prevAmt > 0 && !open && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, marginLeft: 12 }}>
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>{prevMonth}</span>
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>{wonShort(a.prevAmt)}</span>
                        </div>
                      )}
                      {open && (
                        <div style={{ marginTop: 6, marginLeft: 12 }}>
                          <button onClick={() => setItemHidden(a.name, true)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                            목록에서 숨기기 (상환 완료 등)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <AddItemRow color="#e11d48" placeholder="예: 주택담보대출" onAdd={(n) => addAssetItem(n, "debt")} />
              </div>

              {/* ── 숨긴 항목 ── */}
              {hiddenItems.length > 0 && (
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <span onClick={() => setShowHidden(!showHidden)} style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", cursor: "pointer" }}>
                    숨긴 항목 {hiddenItems.length}개 {showHidden ? "▲" : "▼"}
                  </span>
                  {showHidden && (
                    <div style={{ ...card, marginTop: 8, textAlign: "left" }}>
                      {hiddenItems.map((it) => (
                        <div key={it.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
                          <span style={{ fontSize: 12, color: "#64748b" }}>
                            {it.name} <span style={{ fontSize: 10, color: "#cbd5e1" }}>{it.grp === "debt" ? "부채" : it.grp === "invest" ? "투자" : "예적금"}</span>
                          </span>
                          <button onClick={() => setItemHidden(it.name, false)} style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>다시 표시</button>
                        </div>
                      ))}
                    </div>
                  )}
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
