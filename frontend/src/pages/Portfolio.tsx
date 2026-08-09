import { useState, useEffect, useCallback } from "react";
import { Plus, ShieldCheck, RefreshCw, Loader2, Trash2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { api, ApiError, type PortfolioData } from "@/lib/api";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30 * 60 * 1000; // 每半小时自动刷新
const pnlColor = (v: number) => (v > 0 ? "text-success" : v < 0 ? "font-bold text-danger" : "text-muted-foreground");
const fmt = (v: number) => v.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
// 单价类（现价/成本/清仓价）最多 4 位小数：ETF/基金常见 3-4 位，截断成 2 位会与市值/盈亏对不上账
const fmtPx = (v: number) => v.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
const CODE_HINT = "300760 (A股)；AAPL.US (美股)；00700.HK (港股)；005930.KR (韩股)";
const isPortfolioCode = (value: string) => /^\d{6}$|^[A-Z][A-Z0-9.-]{0,15}\.US$|^\d{1,5}\.HK$|^\d{6}\.KR$/i.test(value.trim());

export function Portfolio() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [adding, setAdding] = useState(false);
  // 清仓录入
  const [cCode, setCCode] = useState("");
  const [cDate, setCDate] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [cShares, setCShares] = useState("");
  const [cCost, setCCost] = useState("");
  const [closing, setClosing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setData(manual ? await api.refreshPortfolio() : await api.portfolio());
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "加载失败");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), REFRESH_MS); // 每半小时自动刷新
    return () => clearInterval(t);
  }, [load]);

  const add = async () => {
    if (!isPortfolioCode(code)) { setErr(`请输入有效代码：${CODE_HINT}`); return; }
    const s = parseFloat(shares), c = parseFloat(cost);
    if (!(s > 0) || !Number.isFinite(c)) { setErr("数量须大于 0，成本价请填数字（可为负）"); return; }
    setAdding(true); setErr(null);
    try {
      setData(await api.addHolding(code.trim(), s, c));
      setCode(""); setShares(""); setCost("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (c: string) => {
    try { setData(await api.removeHolding(c)); } catch { /* ignore */ }
  };

  const addClose = async () => {
    if (!isPortfolioCode(cCode)) { setErr(`清仓记录：请输入有效代码：${CODE_HINT}`); return; }
    const p = parseFloat(cPrice), s = parseFloat(cShares), c = parseFloat(cCost);
    if (!cDate) { setErr("请选清仓日期"); return; }
    if (!(p > 0) || !(s > 0) || !Number.isFinite(c)) { setErr("清仓价 / 股数须大于 0，成本请填数字（可为负）"); return; }
    setClosing(true); setErr(null);
    try {
      setData(await api.closePosition(cCode.trim(), cDate, p, s, c));
      setCCode(""); setCDate(""); setCPrice(""); setCShares(""); setCCost("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "添加清仓记录失败");
    } finally {
      setClosing(false);
    }
  };

  const removeClosed = async (i: number) => {
    try { setData(await api.removeClosed(i)); } catch { /* ignore */ }
  };

  const holdings = data?.holdings || [];
  const totals = data?.totals;
  const closed = data?.closed || [];

  const aiContext = totals
    ? `我的持仓（本地数据，金额均为原生币种）：\n` + holdings.map((h) => `${h.name}(${h.code}) ${h.shares}股 成本${h.cost} 现价${h.price} 浮盈${h.pnl} ${h.currency}(${h.pnl_pct}%)`).join("\n") +
      `\n分币种汇总：\n${Object.entries(totals).map(([currency, t]) => `${currency}：市值${t.market_value}，成本${t.cost}，浮盈${t.pnl}(${t.pnl_pct}%)`).join("\n")}`
    : "我的持仓：暂无记录。";

  return (
    <div>
      <PageHeader
        title="我的持仓"
        subtitle="自己录、存在本地，实时看浮动盈亏"
        actions={
          <div className="flex items-center gap-2">
            {holdings.length > 0 && (
              <AskAiButton context={aiContext} label="让 AI 看我的持仓"
                suggestions={["我的持仓集中在哪些方向", "结构上有什么风险", "帮我梳理一下"]} />
            )}
            <button onClick={() => load(true)} disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-success/25 bg-success/5 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span>持仓<b className="text-foreground">只存在你本地</b>，不上传、不进仓库。行情每半小时自动刷新，也可手动刷新。本产品不提供标的、不给建议，只帮你把自己的账理清楚。</span>
      </div>

      {/* 汇总 */}
      {totals && holdings.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "总市值", value: (t: (typeof totals)[string]) => fmt(t.market_value), color: () => "text-foreground" },
            { k: "总成本", value: (t: (typeof totals)[string]) => fmt(t.cost), color: () => "text-foreground" },
            { k: "浮动盈亏", value: (t: (typeof totals)[string]) => `${t.pnl > 0 ? "+" : ""}${fmt(t.pnl)}`, color: (t: (typeof totals)[string]) => pnlColor(t.pnl) },
            { k: "盈亏比例", value: (t: (typeof totals)[string]) => `${t.pnl_pct > 0 ? "+" : ""}${t.pnl_pct}%`, color: (t: (typeof totals)[string]) => pnlColor(t.pnl) },
          ].map((m) => (
            <GlassCard key={m.k} className="p-3">
              <p className="text-xs text-muted-foreground">{m.k}</p>
              <div className="mt-1 space-y-1">
                {Object.entries(totals).map(([currency, t]) => (
                  <p key={currency} className={cn("font-mono text-lg font-bold", m.color(t))}>
                    <span className="mr-1 font-sans text-xs font-normal text-muted-foreground">{currency}:</span>{m.value(t)}
                  </p>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* 录入 */}
      <GlassCard className="mb-4">
        <h3 className="mb-3 text-sm font-semibold">添加持仓</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">股票代码</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={CODE_HINT}
              className="w-[600px] max-w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">数量（股）</label>
            <input value={shares} onChange={(e) => setShares(e.target.value.replace(/[^\d.]/g, ""))} placeholder="如 100"
              className="w-28 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">成本价</label>
            <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, ""))} placeholder="如 12.5，可负"
              className="w-28 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <button onClick={add} disabled={adding}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} 添加
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/60">同一代码再次添加会按加权平均成本合并（加仓）。</p>
      </GlassCard>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}

      {/* 持仓表 */}
      <GlassCard glow>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">持仓明细</h3>
          {data?.updated && <span className="text-xs text-muted-foreground/60">更新于 {data.updated}</span>}
        </div>
        {holdings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground/60">还没有持仓记录，用上面的表单添加一笔。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  {["名称", "现价", "数量", "成本", "市值", "浮动盈亏", "盈亏%", "币种", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.code} className="border-b border-border/30">
                    <td className="px-2 py-2.5">
                      <span className="font-medium">{h.name}</span>
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground/60">{h.code}</span>
                    </td>
                    <td className="px-2 py-2.5 font-mono">{fmtPx(h.price)}</td>
                    <td className="px-2 py-2.5 font-mono text-muted-foreground">{fmt(h.shares)}</td>
                    <td className="px-2 py-2.5 font-mono text-muted-foreground">{fmtPx(h.cost)}</td>
                    <td className="px-2 py-2.5 font-mono">{fmt(h.market_value)}</td>
                    <td className={cn("px-2 py-2.5 font-mono", pnlColor(h.pnl))}>{h.pnl > 0 ? "+" : ""}{fmt(h.pnl)}</td>
                    <td className={cn("px-2 py-2.5 font-mono", pnlColor(h.pnl))}>{h.pnl_pct > 0 ? "+" : ""}{h.pnl_pct}%</td>
                    <td className="px-2 py-2.5 font-mono text-muted-foreground">{h.currency}</td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => remove(h.code)} className="text-muted-foreground/50 hover:text-destructive" title="删除">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* 清仓录入 */}
      <GlassCard className="mb-4 mt-6">
        <h3 className="mb-3 text-sm font-semibold">添加清仓记录</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">股票代码</label>
            <input value={cCode} onChange={(e) => setCCode(e.target.value.toUpperCase())} placeholder={CODE_HINT}
              className="w-[600px] max-w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">清仓日期</label>
            <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)}
              className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">清仓价</label>
            <input value={cPrice} onChange={(e) => setCPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="卖出价"
              className="w-24 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">股数</label>
            <input value={cShares} onChange={(e) => setCShares(e.target.value.replace(/[^\d.]/g, ""))} placeholder="如 100"
              className="w-24 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">买入成本</label>
            <input value={cCost} onChange={(e) => setCCost(e.target.value.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, ""))} placeholder="成本价，可负"
              className="w-24 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <button onClick={addClose} disabled={closing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50">
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} 记录
          </button>
        </div>
      </GlassCard>

      {/* 已清仓列表 */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">已清仓</h3>
        {closed.length > 0 && data && (
          <span className="text-sm text-right">
            <span className="mr-2">已实现盈亏合计</span>
            {Object.entries(data.realized_pnl).map(([currency, pnl]) => (
              <b key={currency} className={cn("mr-2 font-mono", pnlColor(pnl))}>
                <span className="mr-1 font-sans text-xs font-normal text-muted-foreground">{currency}:</span>{pnl > 0 ? "+" : ""}{fmt(pnl)}
              </b>
            ))}
          </span>
        )}
      </div>
      <GlassCard>
        {closed.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground/60">还没有清仓记录。卖出后在上面记一笔，作为已实现盈亏的历史。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  {["名称", "清仓日期", "清仓价", "股数", "成本", "已实现盈亏", "盈亏%", "币种", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.map((c, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="px-2 py-2.5">
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground/60">{c.code}</span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-muted-foreground">{c.date}</td>
                    <td className="px-2 py-2.5 font-mono">{fmtPx(c.price)}</td>
                    <td className="px-2 py-2.5 font-mono text-muted-foreground">{fmt(c.shares)}</td>
                    <td className="px-2 py-2.5 font-mono text-muted-foreground">{fmtPx(c.cost)}</td>
                    <td className={cn("px-2 py-2.5 font-mono", pnlColor(c.pnl))}>{c.pnl > 0 ? "+" : ""}{fmt(c.pnl)}</td>
                    <td className={cn("px-2 py-2.5 font-mono", pnlColor(c.pnl))}>{c.pnl_pct > 0 ? "+" : ""}{c.pnl_pct}%</td>
                    <td className="px-2 py-2.5 font-mono text-muted-foreground">{c.currency}</td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => removeClosed(i)} className="text-muted-foreground/50 hover:text-destructive" title="删除">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Disclaimer />
    </div>
  );
}
