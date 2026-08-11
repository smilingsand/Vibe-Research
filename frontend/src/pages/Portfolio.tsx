import { useState, useEffect, useCallback } from "react";
import { Plus, ShieldCheck, RefreshCw, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { api, ApiError, type PortfolioData } from "@/lib/api";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30 * 60 * 1000;
const pnlColor = (v: number) => (v > 0 ? "text-success" : v < 0 ? "font-bold text-danger" : "text-muted-foreground");
const fmt = (v: number) => v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPx = (v: number) => v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShares = (v: number) => v.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const fmtPct = (v: number) => v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CODE_HINT = "300760 (A股)；AAPL.US (美股)；00700.HK (港股)；005930.KR (韩股)";
const isPortfolioCode = (value: string) => /^\d{6}$|^[A-Z][A-Z0-9.-]{0,15}\.US$|^\d{1,5}\.HK$|^\d{6}\.KR$/i.test(value.trim());
const currencyForCode = (value: string) => {
  const code = value.trim().toUpperCase();
  if (/^\d{6}$/.test(code)) return "CNY";
  if (code.endsWith(".US")) return "USD";
  if (code.endsWith(".HK")) return "HKD";
  if (code.endsWith(".KR")) return "KRW";
  return "—";
};

function FilterBar({ value, onChange, onApply }: { value: string; onChange: (value: string) => void; onApply: () => void }) {
  return <div className="ml-16 flex items-center gap-2">
    <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onApply(); }} placeholder="名称关键词"
      className="w-36 rounded-lg border border-border bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-primary/50" />
    <button onClick={onApply} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">筛选</button>
  </div>;
}

export function Portfolio() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [code, setCode] = useState("");
  const [buyDate, setBuyDate] = useState("");
  const [shares, setShares] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [adding, setAdding] = useState(false);
  const [cCode, setCCode] = useState("");
  const [cDate, setCDate] = useState("");
  const [cShares, setCShares] = useState("");
  const [cAmount, setCAmount] = useState("");
  const [closing, setClosing] = useState(false);
  const [addExpanded, setAddExpanded] = useState(false);
  const [closeExpanded, setCloseExpanded] = useState(false);
  const [purchasesExpanded, setPurchasesExpanded] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [holdingsInput, setHoldingsInput] = useState("");
  const [purchasesInput, setPurchasesInput] = useState("");
  const [closedInput, setClosedInput] = useState("");
  const [holdingsFilter, setHoldingsFilter] = useState("");
  const [purchasesFilter, setPurchasesFilter] = useState("");
  const [closedFilter, setClosedFilter] = useState("");

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setLoadingQuotes(true);
    try { setData(manual ? await api.refreshPortfolio() : await api.portfolio()); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "加载失败"); }
    finally { setLoadingQuotes(false); if (manual) setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const add = async () => {
    if (!isPortfolioCode(code)) { setErr(`请输入有效代码：${CODE_HINT}`); return; }
    const quantity = parseFloat(shares), amount = parseFloat(totalCost);
    if (!buyDate) { setErr("请选择买入日期"); return; }
    if (!(quantity > 0) || !(amount > 0)) { setErr("股数与成本总金额必须大于 0"); return; }
    setAdding(true); setErr(null);
    try {
      setData(await api.addHolding(code.trim(), buyDate, quantity, amount));
      setCode(""); setBuyDate(""); setShares(""); setTotalCost("");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "添加持仓记录失败"); }
    finally { setAdding(false); }
  };

  const addClose = async () => {
    if (!isPortfolioCode(cCode)) { setErr(`清仓记录：请输入有效代码：${CODE_HINT}`); return; }
    const quantity = parseFloat(cShares), amount = parseFloat(cAmount);
    if (!cDate) { setErr("请选择清仓日期"); return; }
    if (!(quantity > 0) || !(amount > 0)) { setErr("股数与成交总金额必须大于 0"); return; }
    setClosing(true); setErr(null);
    try {
      setData(await api.closePosition(cCode.trim(), cDate, quantity, amount));
      setCCode(""); setCDate(""); setCShares(""); setCAmount("");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "添加清仓记录失败"); }
    finally { setClosing(false); }
  };

  const holdings = data?.holdings || [];
  const purchases = data?.purchases || [];
  const closed = data?.closed || [];
  const totals = data?.totals || {};
  const realized = data?.realized_pnl || {};
  const matchSecurity = (name: string, code: string, keyword: string) => {
    const query = keyword.trim().toLocaleLowerCase();
    return !query || name.toLocaleLowerCase().includes(query) || code.toLocaleLowerCase().includes(query);
  };
  const filteredHoldings = holdings.filter((h) => matchSecurity(h.name, h.code, holdingsFilter)).sort((a, b) => b.market_value - a.market_value);
  const filteredPurchases = purchases.map((p, index) => ({ p, index })).filter(({ p }) => matchSecurity(p.name, p.code, purchasesFilter)).sort((a, b) => b.p.date.localeCompare(a.p.date) || b.index - a.index).map(({ p }) => p);
  const filteredClosed = closed.map((c, index) => ({ c, index })).filter(({ c }) => matchSecurity(c.name, c.code, closedFilter)).sort((a, b) => b.c.date.localeCompare(a.c.date) || b.index - a.index).map(({ c }) => c);
  const aiContext = data
    ? `我的持仓（本地数据，金额均为原生币种）：\n${holdings.map((h) => `${h.name}(${h.code}) ${h.shares}股 成本均价${h.cost} 总成本${h.total_cost} 现价${h.price} 浮盈${h.pnl} ${h.currency}(${h.pnl_pct}%)`).join("\n")}\n分币种汇总：\n${Object.entries(totals).map(([currency, t]) => `${currency}：市值${t.market_value}，成本${t.cost}，浮盈${t.pnl}(${t.pnl_pct}%)`).join("\n")}\n已实现盈亏：${Object.entries(realized).map(([currency, pnl]) => `${currency} ${pnl}`).join("；")}`
    : "我的持仓：暂无记录。";
  const showSummary = holdings.length > 0 || closed.length > 0;
  const summary = [
    { k: "总市值", values: Object.entries(totals).map(([currency, t]) => [currency, fmt(t.market_value), "text-foreground"] as const) },
    { k: "总成本", values: Object.entries(totals).map(([currency, t]) => [currency, fmt(t.cost), "text-foreground"] as const) },
    { k: "浮动盈亏", values: Object.entries(totals).map(([currency, t]) => [currency, `${t.pnl > 0 ? "+" : ""}${fmt(t.pnl)}`, pnlColor(t.pnl)] as const) },
    { k: "盈亏比例", values: Object.entries(totals).map(([currency, t]) => [currency, `${t.pnl_pct > 0 ? "+" : ""}${fmtPct(t.pnl_pct)}%`, pnlColor(t.pnl)] as const) },
    { k: "已实现盈亏", values: Object.entries(realized).map(([currency, pnl]) => [currency, `${pnl > 0 ? "+" : ""}${fmt(pnl)}`, pnlColor(pnl)] as const) },
  ];
  const securityName = (name: string, stockCode: string) => <><span className="font-medium">{name}</span><span className="ml-1.5 font-mono text-xs text-muted-foreground/60">{stockCode}</span></>;

  return <div>
    <PageHeader title="我的持仓" subtitle="自己录、存在本地，实时看浮动盈亏（仅为买卖交易盈亏，未计分红配股等公司行为）" actions={<div className="flex items-center gap-2">
      {loadingQuotes && <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> 行情数据访问中...</span>}
      {(holdings.length > 0 || closed.length > 0) && <AskAiButton context={aiContext} label="让 AI 看我的持仓" suggestions={["我的持仓集中在哪些方向", "结构上有什么风险", "帮我梳理一下"]} />}
      <button onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新</button>
    </div>} />

    <div className="mb-4 flex items-start gap-2 rounded-lg border border-success/25 bg-success/5 p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span>持仓<b className="text-foreground">只存在你本地</b>，不上传、不进仓库。行情每半小时自动刷新，也可手动刷新。本产品不提供标的、不给建议，只帮你把自己的账理清楚。</span></div>
    {err && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {err}</div>}

    {showSummary && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">{summary.map((m) => <GlassCard key={m.k} className="p-3"><p className="text-xs text-muted-foreground">{m.k}</p><div className="mt-1 space-y-1">{m.values.length ? m.values.map(([currency, value, color]) => <p key={currency} className={cn("font-mono text-lg font-bold", color)}><span className="mr-1 font-sans text-xs font-normal text-muted-foreground">{currency}:</span>{value}</p>) : <p className="font-mono text-lg text-muted-foreground">—</p>}</div></GlassCard>)}</div>}

    {holdings.length > 0 && <GlassCard glow>
      <div className="mb-2 flex items-center justify-between"><div className="flex items-center"><h3 className="font-semibold">持仓明细</h3><FilterBar value={holdingsInput} onChange={setHoldingsInput} onApply={() => setHoldingsFilter(holdingsInput)} /></div>{data?.updated && <span className="text-xs text-muted-foreground/60">更新于 {data.updated}</span>}</div>
      <div className="max-h-[850px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border/50 text-center text-xs text-muted-foreground">{["名称", "现价", "股数", "成本均价", "总成本", "当前市值", "浮动盈亏", "盈亏%", "币种"].map((h) => <th key={h} className={cn("whitespace-nowrap px-2 py-2 font-medium", h === "名称" ? "text-left" : "text-center")}>{h}</th>)}</tr></thead><tbody>{filteredHoldings.map((h) => <tr key={h.code} className="border-b border-border/30"><td className="px-2 py-2.5 text-left">{securityName(h.name, h.code)}</td><td className="px-2 py-2.5 text-right font-mono">{fmtPx(h.price)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{fmtShares(h.shares)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{fmtPx(h.cost)}</td><td className="px-2 py-2.5 text-right font-mono">{fmt(h.total_cost)}</td><td className="px-2 py-2.5 text-right font-mono">{fmt(h.market_value)}</td><td className={cn("px-2 py-2.5 text-right font-mono", pnlColor(h.pnl))}>{h.pnl > 0 ? "+" : ""}{fmt(h.pnl)}</td><td className={cn("px-2 py-2.5 text-right font-mono", pnlColor(h.pnl))}>{h.pnl_pct > 0 ? "+" : ""}{fmtPct(h.pnl_pct)}%</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{h.currency}</td></tr>)}</tbody></table></div>
    </GlassCard>}

    <GlassCard className="mb-4 mt-6"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">添加持仓记录</h3><button onClick={() => setAddExpanded((expanded) => !expanded)} className="rounded p-1 text-muted-foreground hover:text-foreground" title={addExpanded ? "收起" : "展开"}>{addExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
      {addExpanded && <div className="flex flex-wrap items-end gap-2"><div><label className="mb-1 block text-xs text-muted-foreground">股票代码</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={CODE_HINT} className="w-[600px] max-w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" /></div><div><label className="mb-1 block text-xs text-muted-foreground">买入日期</label><input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className={cn("rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50", buyDate ? "text-foreground" : "text-muted-foreground")} /></div><div><label className="mb-1 block text-xs text-muted-foreground">股数</label><input value={shares} onChange={(e) => setShares(e.target.value.replace(/[^\d.]/g, ""))} placeholder="如 100" className="w-28 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" /></div><div><label className="mb-1 block text-xs text-muted-foreground">成本总金额</label><input value={totalCost} onChange={(e) => setTotalCost(e.target.value.replace(/[^\d.]/g, ""))} placeholder="如 1250.00" className="w-32 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" /></div><div><label className="mb-1 block text-xs text-muted-foreground">币种</label><input value={currencyForCode(code)} readOnly className="w-20 rounded-lg border border-border bg-black/10 px-3 py-2 text-sm text-muted-foreground outline-none" /></div><button onClick={add} disabled={adding} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50">{adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} 添加</button></div>}
    </GlassCard>

    {purchases.length > 0 && <GlassCard className="mb-4"><div className="mb-2 flex items-center justify-between"><div className="flex items-center"><h3 className="font-semibold">持仓购买交易记录</h3><FilterBar value={purchasesInput} onChange={setPurchasesInput} onApply={() => setPurchasesFilter(purchasesInput)} /></div><button onClick={() => setPurchasesExpanded((expanded) => !expanded)} className="rounded p-1 text-muted-foreground hover:text-foreground" title={purchasesExpanded ? "收起" : "展开"}>{purchasesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
      {purchasesExpanded && <div className="max-h-[460px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border/50 text-center text-xs text-muted-foreground">{["名称", "买入日期", "成交单价", "股数", "成本总金额", "币种"].map((h) => <th key={h} className={cn("whitespace-nowrap px-2 py-2 font-medium", h === "名称" ? "text-left" : "text-center")}>{h}</th>)}</tr></thead><tbody>{filteredPurchases.map((p, i) => <tr key={`${p.code}-${p.date}-${i}`} className="border-b border-border/30"><td className="px-2 py-2.5 text-left">{securityName(p.name, p.code)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{p.date}</td><td className="px-2 py-2.5 text-right font-mono">{fmtPx(p.price)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{fmtShares(p.shares)}</td><td className="px-2 py-2.5 text-right font-mono">{fmt(p.total_cost)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{p.currency}</td></tr>)}</tbody></table></div>}
    </GlassCard>}

    <GlassCard className="mb-4 mt-6"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">添加清仓记录</h3><button onClick={() => setCloseExpanded((expanded) => !expanded)} className="rounded p-1 text-muted-foreground hover:text-foreground" title={closeExpanded ? "收起" : "展开"}>{closeExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
      {closeExpanded && <div className="flex flex-wrap items-end gap-2"><div><label className="mb-1 block text-xs text-muted-foreground">股票代码</label><input value={cCode} onChange={(e) => setCCode(e.target.value.toUpperCase())} placeholder={CODE_HINT} className="w-[600px] max-w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" /></div><div><label className="mb-1 block text-xs text-muted-foreground">清仓日期</label><input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} className={cn("rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50", cDate ? "text-foreground" : "text-muted-foreground")} /></div><div><label className="mb-1 block text-xs text-muted-foreground">股数</label><input value={cShares} onChange={(e) => setCShares(e.target.value.replace(/[^\d.]/g, ""))} placeholder="如 100" className="w-28 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" /></div><div><label className="mb-1 block text-xs text-muted-foreground">成交总金额</label><input value={cAmount} onChange={(e) => setCAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="如 1250.00" className="w-32 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" /></div><div><label className="mb-1 block text-xs text-muted-foreground">币种</label><input value={currencyForCode(cCode)} readOnly className="w-20 rounded-lg border border-border bg-black/10 px-3 py-2 text-sm text-muted-foreground outline-none" /></div><button onClick={addClose} disabled={closing} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50">{closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} 记录</button></div>}
    </GlassCard>

    {closed.length > 0 && <GlassCard><div className="mb-2 flex items-center justify-between"><div className="flex items-center"><h3 className="font-semibold">已清仓记录</h3><FilterBar value={closedInput} onChange={setClosedInput} onApply={() => setClosedFilter(closedInput)} /></div><button onClick={() => setClosedExpanded((expanded) => !expanded)} className="rounded p-1 text-muted-foreground hover:text-foreground" title={closedExpanded ? "收起" : "展开"}>{closedExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
      {closedExpanded && <div className="max-h-[460px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border/50 text-center text-xs text-muted-foreground">{["名称", "清仓日期", "成交单价", "股数", "成交总金额", "总成本", "已实现盈亏", "盈亏%", "币种"].map((h) => <th key={h} className={cn("whitespace-nowrap px-2 py-2 font-medium", h === "名称" ? "text-left" : "text-center")}>{h}</th>)}</tr></thead><tbody>{filteredClosed.map((c, i) => <tr key={`${c.code}-${c.date}-${i}`} className="border-b border-border/30"><td className="px-2 py-2.5 text-left">{securityName(c.name, c.code)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{c.date}</td><td className="px-2 py-2.5 text-right font-mono">{fmtPx(c.price)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{fmtShares(c.shares)}</td><td className="px-2 py-2.5 text-right font-mono">{fmt(c.amount)}</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{fmt(c.total_cost)}</td><td className={cn("px-2 py-2.5 text-right font-mono", pnlColor(c.pnl))}>{c.pnl > 0 ? "+" : ""}{fmt(c.pnl)}</td><td className={cn("px-2 py-2.5 text-right font-mono", pnlColor(c.pnl))}>{c.pnl_pct > 0 ? "+" : ""}{fmtPct(c.pnl_pct)}%</td><td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{c.currency}</td></tr>)}</tbody></table></div>}
    </GlassCard>}
    <Disclaimer />
  </div>;
}
