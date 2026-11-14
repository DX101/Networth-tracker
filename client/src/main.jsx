import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import html2pdf from 'html2pdf.js';
import './styles.css';

const getApiBase = () => {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('server_url') : null;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/$/, '') + '/api';
  }
  return '/api';
};

const API = '/api';
const COLORS = ['#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#10b981', '#f97316'];
const CURRENCIES = {
  INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', AED: '\u062F.\u0625'
};
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEFAULT_CATEGORIES = {
  asset: ['Cash', 'Bank Accounts', 'Trading / Brokerage Account', 'Real Estate', 'Vehicles', 'Crypto', 'Stocks', 'Mutual Funds', 'ETF', 'PF/PPF', 'Gold', 'Other'],
  liability: ['Home Loan', 'Car Loan', 'Personal Loan', 'Credit Card', 'Other Debt'],
  income: ['Salary', 'Freelance', 'Rental', 'Dividends', 'Interest', 'Business', 'Other'],
  expense: ['Housing', 'Food', 'Transport', 'EMI/Loan Payments', 'Subscriptions', 'Medical', 'Utilities', 'Entertainment', 'Shopping', 'Education', 'Insurance', 'Other'],
  investment: ['Stocks', 'Mutual Funds', 'Crypto', 'Fixed Deposit (FD)', 'Recurring Deposit (RD)', 'Bonds', 'Real Estate', 'Gold', 'SIP'],
  transfer: ['Transfer', 'Trading Account Fund', 'Stock Broker Deposit', 'Investment Deposit', 'ATM Cash Withdrawal', 'Wallet Top-up', 'Credit Card Payment', 'Savings Transfer', 'Other Transfer']
};

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const baseUrl = getApiBase();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

function Chart({ title, className = '', height = 260, controls, children }) {
  return (
    <div className={`chart-card ${className}`}>
      <div className="chart-head">
        {controls ? <><h3>{title}</h3><div className="chart-period-toggle">{controls}</div></> : <h3>{title}</h3>}
      </div>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
}

function EyeIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function isPrivacyActive(settings) {
  if (settings && typeof settings.privacy_mode === 'boolean') {
    return settings.privacy_mode;
  }
  return typeof window !== 'undefined' ? localStorage.getItem('networth_privacy_mode') === 'true' : false;
}

function PremiumTooltip({ active, payload, label, settings }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><div className="tooltip-label">{formatDate(label, settings)}</div>{payload.map((item) => <div className="tooltip-row" key={item.dataKey || item.name}><span style={{ background: item.color }} />{item.name || item.dataKey}<strong>{typeof item.value === 'number' ? money(item.value, settings) : item.value}</strong></div>)}</div>;
}

function StatCard({ id, label, value, hint, color, breakdown, setBreakdown, settings }) {
  const open = breakdown === id;
  return <button className={`card stat-card stat-${color} ${open ? 'selected' : ''}`} onClick={() => setBreakdown(open ? null : id)}>
    <span>{label}<b>{open ? '\u2303' : '\u2304'}</b></span>
    <strong>{money(value, settings)}</strong>
    <small>{hint}</small>
  </button>;
}

const FALLBACK_EXCHANGE_RATES = {
  INR: { USD: 93.95, EUR: 102.5, GBP: 121.0, AED: 25.5, CAD: 66.5, SGD: 70.0, JPY: 0.60 },
  USD: { INR: 0.01064, EUR: 1.09, GBP: 1.28, AED: 0.27, CAD: 0.71, SGD: 0.74, JPY: 0.0064 },
  EUR: { USD: 0.917, INR: 0.00975, GBP: 1.17, AED: 0.25 },
  GBP: { USD: 0.781, EUR: 0.854, INR: 0.00826 },
  AED: { USD: 0.272, INR: 0.0392, EUR: 0.297 }
};

function convertValue(amount, fromCurrency, settings) {
  const num = Number(amount) || 0;
  if (!fromCurrency || fromCurrency === settings?.currency) return num;
  try {
    const rates = JSON.parse(settings?.exchange_rates || '{}');
    if (rates[fromCurrency] && Number(rates[fromCurrency]) > 0) {
      return num * Number(rates[fromCurrency]);
    }
  } catch (e) {}
  
  // Smart fallback if live rates not yet loaded
  const base = settings?.currency || 'INR';
  if (FALLBACK_EXCHANGE_RATES[base] && FALLBACK_EXCHANGE_RATES[base][fromCurrency]) {
    return num * FALLBACK_EXCHANGE_RATES[base][fromCurrency];
  }
  return num;
}

function getRate(fromCur, toCur, settings) {
  if (!fromCur || !toCur || fromCur === toCur) return 1;
  const base = settings?.currency || 'INR';
  if (toCur === base) {
    return convertValue(1, fromCur, settings) || 1;
  }
  if (fromCur === base) {
    const r = convertValue(1, toCur, settings);
    return r > 0 ? (1 / r) : 1;
  }
  const toBaseA = convertValue(1, fromCur, settings) || 1;
  const toBaseB = convertValue(1, toCur, settings) || 1;
  return toBaseA / toBaseB;
}

function getDualCurrencyStats(item, settings) {
  const isForeign = item.currency && item.currency !== settings.currency;
  const isUsdStockTrackedInInr = !isForeign && item.ticker && !item.ticker.includes('.') && !item.ticker.includes(':');
  const usdRate = convertValue(1, 'USD', settings) || 94.0;

  if (isForeign) {
    return {
      hasDual: true,
      nativeCurrency: item.currency,
      inrAvgBuy: convertValue(item.avg_buy_price, item.currency, settings),
      nativeAvgBuy: item.avg_buy_price,
      inrCurrentPrice: convertValue(item.current_price, item.currency, settings),
      nativeCurrentPrice: item.current_price,
      inrInvested: convertValue(item.total_invested, item.currency, settings),
      nativeInvested: item.total_invested,
      inrValue: convertValue(item.current_value, item.currency, settings),
      nativeValue: item.current_value,
      inrPnl: convertValue(item.pnl, item.currency, settings),
      nativePnl: item.pnl,
    };
  } else if (isUsdStockTrackedInInr) {
    return {
      hasDual: true,
      nativeCurrency: 'USD',
      inrAvgBuy: item.avg_buy_price,
      nativeAvgBuy: item.avg_buy_price / usdRate,
      inrCurrentPrice: item.current_price,
      nativeCurrentPrice: item.current_price / usdRate,
      inrInvested: item.total_invested,
      nativeInvested: item.total_invested / usdRate,
      inrValue: item.current_value,
      nativeValue: item.current_value / usdRate,
      inrPnl: item.pnl,
      nativePnl: item.pnl / usdRate,
    };
  }

  return {
    hasDual: false,
    nativeCurrency: item.currency || settings.currency,
    inrAvgBuy: item.avg_buy_price,
    nativeAvgBuy: item.avg_buy_price,
    inrCurrentPrice: item.current_price,
    nativeCurrentPrice: item.current_price,
    inrInvested: item.total_invested,
    nativeInvested: item.total_invested,
    inrValue: item.current_value,
    nativeValue: item.current_value,
    inrPnl: item.pnl,
    nativePnl: item.pnl,
  };
}

function isFd(category) {
  if (!category) return false;
  const s = String(category).trim().toLowerCase();
  return (
    s === 'fixed deposit (fd)' ||
    s === 'fixed deposit' ||
    s === 'fd' ||
    s.includes('fixed deposit') ||
    s === 'term deposit' ||
    s === 'fd/rd'
  );
}

function isRd(category) {
  if (!category) return false;
  const s = String(category).trim().toLowerCase();
  return (
    s === 'recurring deposit (rd)' ||
    s === 'recurring deposit' ||
    s === 'rd' ||
    s.includes('recurring deposit')
  );
}

function isBond(category) {
  if (!category) return false;
  const s = String(category).trim().toLowerCase();
  return s === 'bonds' || s === 'bond' || s.includes('bond');
}

function isFdorRd(category) {
  return isFd(category) || isRd(category);
}

function isFixedIncome(category) {
  return isFd(category) || isRd(category) || isBond(category);
}

function hasPeriodicPayout(category, payout_frequency) {
  if (!isFixedIncome(category)) return false;
  const f = String(payout_frequency || '').trim().toLowerCase();
  if (!f || f === 'payment on maturity') return false;
  return (
    f.includes('monthly') ||
    f.includes('quarterly') ||
    f.includes('half') ||
    f.includes('semi') ||
    f.includes('annual') ||
    f.includes('yearly') ||
    f.includes('payout')
  );
}

function calculateTenure(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return '';
  const d1 = new Date(startDateStr);
  const d2 = new Date(endDateStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) return '';
  
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  
  if (diffDays >= 360 && diffDays <= 370) return '1 Year';
  if (diffDays >= 725 && diffDays <= 735) return '2 Years';
  if (diffDays >= 1090 && diffDays <= 1100) return '3 Years';
  if (diffDays >= 1820 && diffDays <= 1830) return '5 Years';
  if (months > 0 && Math.abs(diffDays - Math.round(months * 30.4375)) <= 5) {
    if (months % 12 === 0) return `${months / 12} ${months / 12 === 1 ? 'Year' : 'Years'}`;
    if (months > 12) {
      const yrs = Math.floor(months / 12);
      const rem = months % 12;
      return `${yrs} ${yrs === 1 ? 'Year' : 'Years'} ${rem} Months`;
    }
    return `${months} Months`;
  }
  return `${diffDays} Days`;
}

function calculateInsuranceTerm(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return '';
  const d1 = new Date(startDateStr);
  const d2 = new Date(endDateStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) return '';
  let years = d2.getFullYear() - d1.getFullYear();
  let months = d2.getMonth() - d1.getMonth();
  let days = d2.getDate() - d1.getDate();
  if (days < -25) { months -= 1; }
  else if (days >= 25) { months += 1; }
  if (months < 0) { years -= 1; months += 12; }
  else if (months >= 12) { years += Math.floor(months / 12); months = months % 12; }
  if (years > 0 && months === 0) return `${years} ${years === 1 ? 'Year' : 'Years'}`;
  if (years > 0 && months > 0) return `${years} ${years === 1 ? 'Year' : 'Years'} ${months} ${months === 1 ? 'Month' : 'Months'}`;
  if (months > 0) return `${months} ${months === 1 ? 'Month' : 'Months'}`;
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return `${diffDays} Days`;
}

function MiniRow({ label, value, settings, tone = '', suffix = '' }) {
  return <div className="mini-row"><span>{label}</span><strong className={tone}>{money(value, settings)}{suffix}</strong></div>;
}

function BreakdownPanel({ type, data, totals, settings }) {
  if (!type) return null;
  const income = data.cashflow.filter((x) => x.type === 'income').reduce((s, x) => s + Number(x.amount || 0), 0);
  const expenses = data.cashflow.filter((x) => x.type === 'expense').reduce((s, x) => s + Number(x.amount || 0), 0);
  const progress = totals.assets > 0 ? Math.min(100, Math.max(0, (totals.networth / totals.assets) * 100)) : 0;
  const title = type === 'pnl' ? 'Investment P&L' : type.charAt(0).toUpperCase() + type.slice(1);

  if (type === 'networth') {
    return <div className="breakdown-card elegant-dropdown"><div className="dropdown-head"><h3>Net Worth Breakdown</h3><span>{money(totals.networth, settings)}</span></div><div className="networth-meter"><div style={{ width: `${progress}%` }} /></div><div className="dropdown-grid three"><MiniRow label="Assets + Investments" value={totals.assets} settings={settings} tone="good" /><MiniRow label="Liabilities" value={totals.liabilities} settings={settings} tone="bad" /><MiniRow label="Monthly Net Cash Flow" value={totals.netCashflow} settings={settings} tone={totals.netCashflow >= 0 ? 'good' : 'bad'} /><MiniRow label="Net Worth" value={totals.networth} settings={settings} /></div></div>;
  }

  if (type === 'cashflow') {
    return <div className="breakdown-card elegant-dropdown"><div className="dropdown-head"><h3>Cash Flow Breakdown</h3><span>{money(income - expenses, settings)}</span></div><div className="dropdown-grid three"><MiniRow label="Income" value={income} settings={settings} tone="good" /><MiniRow label="Expenses" value={expenses} settings={settings} tone="bad" /><MiniRow label="Savings Rate" value={income ? ((income - expenses) / income) * 100 : 0} settings={{ currency_symbol: '' }} /></div><RecentCashFlow rows={data.cashflow.slice(0, 5)} settings={settings} compact /></div>;
  }

  const rows = type === 'assets' ? data.assets : type === 'liabilities' ? data.liabilities : data.investments;
  const breakdownLabel = type === 'pnl' ? 'Profit & Loss' : 'Category Breakdown';
  const chartData = type === 'investments' ? rows.map(r => ({ name: r.asset_name || r.name, value: investmentCurrentValue(r, settings) })) : type === 'pnl' ? rows.map(r => ({ name: r.asset_name || r.name, value: investmentCurrentValue(r, settings) - investmentInvestedAmount(r, settings) })) : byCategory(rows);
  const pieData = chartData.filter(d => d.value > 0);

  return (
    <div className="breakdown-card elegant-dropdown">
      <div className="dropdown-head">
        <h3>{title} Breakdown</h3>
        <span>{money(type === 'assets' ? totals.assets : type === 'liabilities' ? totals.liabilities : type === 'pnl' ? totals.pnl : totals.investments, settings)}</span>
      </div>
      <div className="dropdown-grid two" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
        <div className="dropdown-list">
          {rows.slice(0, 8).map((item) => (
            <div className="dropdown-item" key={`${type}-${item.id}`}>
              <div>
                <strong>{item.name || item.asset_name || item.category}</strong>
                <small>{item.category || item.platform || 'Uncategorized'}</small>
              </div>
              <span>{money(type === 'pnl' ? investmentCurrentValue(item, settings) - investmentInvestedAmount(item, settings) : type === 'investments' ? investmentCurrentValue(item, settings) : item.current_value, settings)}</span>
            </div>
          ))}
        </div>
        {pieData.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PieChart width={300} height={200}>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {pieData.map((entry, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<PremiumTooltip settings={settings} />} />
            </PieChart>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentCashFlow({ rows, settings, compact = false, onEdit, onDelete }) {
  const isPrivacy = isPrivacyActive(settings);
  return (
    <div className={compact ? 'recent-cashflow compact' : 'recent-cashflow'}>
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3>Recent Activity</h3>
          <button
            type="button"
            className={`privacy-eye-pill ${isPrivacy ? 'active' : ''}`}
            onClick={settings?.togglePrivacy}
            style={{
              background: isPrivacy ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.06)',
              border: isPrivacy ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(255, 255, 255, 0.1)',
              color: isPrivacy ? '#f87171' : '#94a3b8',
              borderRadius: '6px',
              padding: '2px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500
            }}
            title={isPrivacy ? "Click to show transaction amounts" : "Click to hide transaction amounts for privacy"}
          >
            {isPrivacy ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
            <span>{isPrivacy ? 'Hidden' : 'Hide'}</span>
          </button>
        </div>
        {!compact && <span className="muted" style={{ fontSize: '12px' }}>Latest income, expenses & transfers</span>}
      </div>
      <div className="cashflow-list">
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '16px 0', textAlign: 'center' }}>No cash flow entries yet.</p>
        ) : (
          rows.map((row) => (
            <div className="cashflow-item" key={row.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <div className={`cash-icon ${row.type}`} style={{
                  background: row.type === 'income' ? 'rgba(16,185,129,0.15)' : row.type === 'transfer' ? 'rgba(56,189,248,0.15)' : 'rgba(239,68,68,0.15)',
                  color: row.type === 'income' ? '#10b981' : row.type === 'transfer' ? '#38bdf8' : '#ef4444',
                  fontWeight: 'bold', fontSize: '13px'
                }}>
                  {row.type === 'income' ? '+' : row.type === 'transfer' ? '⇄' : '-'}
                </div>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.description || row.category}
                  </strong>
                  <small style={{ color: '#94a3b8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    {row.type === 'transfer' ? (
                      <span style={{ color: '#38bdf8' }}>
                        {row.account_name || 'Account'} ➔ {row.to_account_name || 'Account'}
                      </span>
                    ) : row.account_name ? (
                      <span>{row.type === 'expense' ? 'From: ' : 'To: '}<strong>{row.account_name}</strong></span>
                    ) : null}
                    <span>• {row.category}</span>
                    <span>• {formatDate(row.date, settings)}</span>
                  </small>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap',
                  color: row.type === 'income' ? '#10b981' : row.type === 'transfer' ? '#38bdf8' : '#ef4444'
                }}>
                  {row.type === 'income' ? '+' : row.type === 'transfer' ? '⇄ ' : '-'}{money(row.amount, settings)}
                </span>
                {onEdit && (
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                    onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="danger"
                    style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                    onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function money(value, settings) {
  const num = Number(value || 0);
  const isNeg = num < 0;
  const absNum = Math.abs(num);
  let sym = '\u20B9';
  if (settings) {
    if (settings.currency_symbol === '') {
      sym = '';
    } else if (settings.currency && CURRENCIES[settings.currency]) {
      sym = CURRENCIES[settings.currency];
    } else if (settings.currency_symbol) {
      sym = settings.currency_symbol;
    } else if (settings.currency) {
      sym = settings.currency + ' ';
    }
  }
  if (isPrivacyActive(settings)) {
    return `${isNeg ? '-' : ''}${sym}••••••`;
  }
  const formatted = absNum.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${isNeg ? '-' : ''}${sym}${formatted}`;
}

function formatDate(value, settings) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  if (settings?.date_format === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
  if (settings?.date_format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

function byCategory(rows, key = 'current_value') {
  const grouped = {};
  rows.forEach((row) => { grouped[row.category] = (grouped[row.category] || 0) + Number(row[key] || 0); });
  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
}

function investmentCurrentValue(item, settings) {
  const val = Number(item.current_value ?? (Number(item.current_price || 0) * Number(item.quantity || 0)));
  return settings ? convertValue(val, item.currency, settings) : val;
}

function investmentInvestedAmount(item, settings) {
  const val = Number(item.invested_amount ?? (Number(item.buy_price || 0) * Number(item.quantity || 0)));
  return settings ? convertValue(val, item.currency, settings) : val;
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('server_url') || '');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (err) {
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('Load failed'))) {
        setError('Cannot reach server. Please tap "⚙️ Server Settings" below to verify your server address.');
        setShowServerConfig(true);
      } else {
        setError(err.message);
      }
    }
  }

  function handleSaveServer(e) {
    e.preventDefault();
    const val = serverUrl.trim();
    if (val) {
      localStorage.setItem('server_url', val);
    } else {
      localStorage.removeItem('server_url');
    }
    setError('');
    alert('Server URL saved: ' + (val || 'Default (local)'));
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1>NetWorth Tracker</h1>
        <p>{mode === 'login' ? 'Sign in to continue' : 'Create an account'}</p>
        {error && <div className="error">{error}</div>}
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button>{mode === 'login' ? 'Login' : 'Register'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Register new account' : 'Back to login'}
        </button>

        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <button type="button" className="link" style={{ fontSize: '0.82rem', opacity: 0.8 }} onClick={() => setShowServerConfig(!showServerConfig)}>
            ⚙️ {showServerConfig ? 'Hide Server Settings' : 'Configure Server URL (Mobile / Remote)'}
          </button>
          {showServerConfig && (
            <div style={{ marginTop: '10px', textAlign: 'left', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Server / PC IP Address:
              </label>
              <input
                placeholder="e.g. http://192.168.1.15:3001"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                style={{ fontSize: '0.85rem', padding: '8px', marginBottom: '8px' }}
              />
              <button type="button" className="secondary" style={{ width: '100%', fontSize: '0.82rem', padding: '7px' }} onClick={handleSaveServer}>
                Save Server URL
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function generatePageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

function PaginationBar({ totalRecords, pageSize, currentPage, onPageChange, onPageSizeChange }) {
  if (!totalRecords || totalRecords <= 0) return null;
  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? totalRecords : Number(pageSize || 10);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalRecords / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = totalRecords === 0 ? 0 : (safeCurrentPage - 1) * effectivePageSize + 1;
  const endIdx = isAll ? totalRecords : Math.min(safeCurrentPage * effectivePageSize, totalRecords);

  const pages = generatePageNumbers(safeCurrentPage, totalPages);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 18px',
      borderTop: '1px solid #1e293b',
      background: '#090e1a',
      flexWrap: 'wrap',
      gap: '12px',
      fontSize: '13px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: '#94a3b8' }}>
        <span>
          Showing <strong style={{ color: '#f8fafc' }}>{startIdx}</strong> to <strong style={{ color: '#f8fafc' }}>{endIdx}</strong> of <strong style={{ color: '#f8fafc' }}>{totalRecords}</strong> records
        </span>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Per page:</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{
                background: '#020617',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="all">All</option>
            </select>
          </div>
        )}
      </div>

      {!isAll && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => onPageChange(1)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: '#0f172a',
              color: safeCurrentPage <= 1 ? '#475569' : '#94a3b8',
              cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
              opacity: safeCurrentPage <= 1 ? 0.5 : 1
            }}
            title="First Page"
          >
            « First
          </button>
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => onPageChange(safeCurrentPage - 1)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: '#0f172a',
              color: safeCurrentPage <= 1 ? '#475569' : '#94a3b8',
              cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
              opacity: safeCurrentPage <= 1 ? 0.5 : 1
            }}
            title="Previous Page"
          >
            ‹ Prev
          </button>

          {pages.map((p, idx) => (
            p === '...' ? (
              <span key={`dots-${idx}`} style={{ padding: '0 4px', color: '#64748b' }}>…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                style={{
                  minWidth: '32px',
                  height: '28px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: p === safeCurrentPage ? '1px solid #14b8a6' : '1px solid #334155',
                  background: p === safeCurrentPage ? 'linear-gradient(135deg, #14b8a6, #0d9488)' : '#0f172a',
                  color: p === safeCurrentPage ? '#ffffff' : '#94a3b8',
                  fontWeight: p === safeCurrentPage ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {p}
              </button>
            )
          ))}

          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => onPageChange(safeCurrentPage + 1)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: '#0f172a',
              color: safeCurrentPage >= totalPages ? '#475569' : '#94a3b8',
              cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
              opacity: safeCurrentPage >= totalPages ? 0.5 : 1
            }}
            title="Next Page"
          >
            Next ›
          </button>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: '#0f172a',
              color: safeCurrentPage >= totalPages ? '#475569' : '#94a3b8',
              cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
              opacity: safeCurrentPage >= totalPages ? 0.5 : 1
            }}
            title="Last Page"
          >
            Last »
          </button>
        </div>
      )}
    </div>
  );
}

function TableFilterBar({
  searchTerm,
  onSearchChange,
  searchPlaceholder = '🔍 Search records...',
  categoryFilter,
  onCategoryChange,
  categories = [],
  pageSize,
  onPageSizeChange,
  extraControls = null
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 16px',
      background: '#0b1120',
      borderBottom: '1px solid #1e293b',
      flexWrap: 'wrap',
      gap: '10px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', minWidth: '200px', flex: 1, maxWidth: '340px' }}>
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 28px 6px 12px',
              fontSize: '12px',
              background: '#020617',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc'
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '14px',
                padding: 0
              }}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {categories && categories.length > 0 && onCategoryChange && (
          <select
            value={categoryFilter}
            onChange={e => onCategoryChange(e.target.value)}
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              background: '#020617',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              cursor: 'pointer',
              minWidth: '140px'
            }}
          >
            <option value="all">📁 All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {extraControls}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Page View:</span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          style={{
            padding: '6px 10px',
            fontSize: '12px',
            background: '#020617',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#f8fafc',
            cursor: 'pointer'
          }}
        >
          <option value={10}>10 records</option>
          <option value={25}>25 records</option>
          <option value={50}>50 records</option>
          <option value={100}>100 records</option>
          <option value="all">All records</option>
        </select>
      </div>
    </div>
  );
}

function Table({ columns, rows, onEdit, onDelete, searchPlaceholder = '🔍 Search records...' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pageSize, setPageSize] = useState(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('table_page_size') || localStorage.getItem('preferred_page_size')) : null;
    return saved === 'all' ? 'all' : (saved ? Number(saved) : 10);
  });
  const [currentPage, setCurrentPage] = useState(1);

  const availableCategories = useMemo(() => {
    const cats = new Set();
    rows.forEach(r => {
      if (r.category) cats.add(r.category);
    });
    return Array.from(cats).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (categoryFilter !== 'all' && row.category && row.category !== categoryFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match = Object.values(row).some(val => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
        if (!match) return false;
      }
      return true;
    });
  }, [rows, categoryFilter, searchTerm]);

  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? filteredRows.length : Number(pageSize || 10);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(filteredRows.length / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRows = useMemo(() => {
    if (isAll) return filteredRows;
    const start = (safeCurrentPage - 1) * effectivePageSize;
    return filteredRows.slice(start, start + effectivePageSize);
  }, [filteredRows, isAll, safeCurrentPage, effectivePageSize]);

  return (
    <div className="table-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
      <TableFilterBar
        searchTerm={searchTerm}
        onSearchChange={val => { setSearchTerm(val); setCurrentPage(1); }}
        searchPlaceholder={searchPlaceholder}
        categoryFilter={categoryFilter}
        onCategoryChange={availableCategories.length > 0 ? (val => { setCategoryFilter(val); setCurrentPage(1); }) : null}
        categories={availableCategories}
        pageSize={pageSize}
        onPageSizeChange={val => {
          setPageSize(val);
          if (typeof window !== 'undefined') {
            localStorage.setItem('table_page_size', String(val));
            localStorage.setItem('preferred_page_size', String(val));
          }
          setCurrentPage(1);
        }}
      />
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key}>{c.label}</th>)}
              {(onEdit || onDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onEdit || onDelete ? 1 : 0)} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  No records found matching your filters.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}
                  {(onEdit || onDelete) && (
                    <td className="actions">
                      {onEdit && <button type="button" className="secondary" onClick={() => onEdit(row)}>Edit</button>}
                      {onDelete && <button type="button" className="danger" onClick={() => onDelete(row.id)}>Delete</button>}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PaginationBar
        totalRecords={filteredRows.length}
        pageSize={pageSize}
        currentPage={safeCurrentPage}
        onPageChange={setCurrentPage}
        onPageSizeChange={val => {
          setPageSize(val);
          if (typeof window !== 'undefined') {
            localStorage.setItem('table_page_size', String(val));
            localStorage.setItem('preferred_page_size', String(val));
          }
          setCurrentPage(1);
        }}
      />
    </div>
  );
}

function CrudSummary({ title, rows, settings }) {
  if (rows.length === 0) return null;
  if (title === 'Assets') {
    const total = rows.reduce((sum, row) => sum + convertValue(row.current_value, row.currency, settings), 0);
    return <div className="cards budget-cards"><div className="card stat-card stat-emerald"><span>Current Assets</span><strong>{money(total, settings)}</strong><small>{rows.length} asset records</small></div></div>;
  }
  if (title === 'Liabilities') {
    const total = rows.reduce((sum, row) => sum + convertValue(row.current_value, row.currency, settings), 0);
    return <div className="cards budget-cards"><div className="card stat-card stat-red"><span>Current Liabilities</span><strong>{money(total, settings)}</strong><small>{rows.length} liability records</small></div></div>;
  }
  if (title === 'Cashflow') {
    const income = rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenses = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return <div className="cards budget-cards"><div className="card stat-card stat-emerald"><span>Total Income</span><strong>{money(income, settings)}</strong></div><div className="card stat-card stat-red"><span>Total Expenses</span><strong>{money(expenses, settings)}</strong></div><div className="card stat-card stat-blue"><span>Net Cash Flow</span><strong>{money(income - expenses, settings)}</strong></div></div>;
  }
  if (title === 'Portfolio') {
    const invested = rows.reduce((sum, row) => sum + investmentInvestedAmount(row, settings), 0);
    const current = rows.reduce((sum, row) => sum + investmentCurrentValue(row, settings), 0);
    return <div className="cards budget-cards"><div className="card stat-card stat-purple"><span>Current Value</span><strong>{money(current, settings)}</strong></div><div className="card stat-card stat-yellow"><span>Invested Amount</span><strong>{money(invested, settings)}</strong></div><div className="card stat-card stat-blue"><span>Investment P&L</span><strong>{money(current - invested, settings)}</strong></div></div>;
  }
  return null;
}

function PerformanceGraph({ config, settings, refreshKey = 0, liveRows = [] }) {
  const rows = useMemo(() => {
    if (!liveRows || !liveRows.length || !config) return [];
    
    // Get the date key for each item
    const getDateKey = (item) => {
      const raw = item.date_added || item.buy_date || item.date || new Date().toISOString();
      return String(raw).slice(0, 10);
    };

    // Get unique sorted dates
    const dateSet = new Set(liveRows.map(getDateKey));
    const sortedDates = Array.from(dateSet).sort();
    if (sortedDates.length === 0) return [];

    // For each date, calculate the total of ALL items added up to and including that date
    return sortedDates.map(dateKey => {
      const point = { date: dateKey };
      const itemsUpToDate = liveRows.filter(item => getDateKey(item) <= dateKey);
      
      for (const series of config.series) {
        point[series.label] = itemsUpToDate.reduce((sum, item) => {
          return sum + (series.getValue ? series.getValue(item) : Number(item.current_value || item.amount || 0));
        }, 0);
      }
      return point;
    });
  }, [liveRows, config]);

  if (!config) return null;
  if (rows.length === 0) return <div className="chart-card"><h3>{config.title}</h3><p className="muted">No historical data yet. Add some records to track performance over time.</p></div>;
  
  return (
    <Chart title={config.title}>
      {config.type === 'bar' ? (
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tickFormatter={(val) => formatDate(val, settings)} />
          <YAxis />
          <Tooltip content={<PremiumTooltip settings={settings} />} cursor={{ fill: 'rgba(20, 184, 166, 0.08)' }} />
          {config.series.map((item, index) => (
            <Bar key={item.key} dataKey={item.label} fill={item.color || COLORS[index % COLORS.length]} radius={[8, 8, 0, 0]} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tickFormatter={(val) => formatDate(val, settings)} />
          <YAxis />
          <Tooltip content={<PremiumTooltip settings={settings} />} cursor={{ stroke: '#5eead4', strokeWidth: 1, strokeDasharray: '4 4' }} />
          {config.series.map((item, index) => (
            <Line key={item.key} type="monotone" dataKey={item.label} stroke={item.color || COLORS[index % COLORS.length]} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 7 }} />
          ))}
        </LineChart>
      )}
    </Chart>
  );
}

function CrudPage({ title, endpoint, fields, columns, settings, performance, customAction }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [graphRefresh, setGraphRefresh] = useState(0);
  const singular = title.endsWith('ies') ? title.slice(0, -3) + 'y' : title.replace(/s$/, '');
  async function load() {
    try {
      setError('');
      setRows(await api(endpoint));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load data');
    }
  }
  useEffect(() => { load(); }, [endpoint]);
  async function save(form) {
    try {
      setError('');
      if (form.id) await api(`${endpoint}/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await api(endpoint, { method: 'POST', body: JSON.stringify(form) });
      setEditing(null);
      await load();
      setGraphRefresh((value) => value + 1);
    } catch (err) {
      setError(err.message || 'Failed to save item');
      throw err;
    }
  }
  async function remove(id) {
    if (confirm('Delete this item?')) {
      try {
        await api(`${endpoint}/${id}`, { method: 'DELETE' });
        await load();
        setGraphRefresh((value) => value + 1);
      } catch (err) {
        setError(err.message || 'Failed to delete item');
      }
    }
  }
  return <section className="page"><div className="page-head"><h1>{title}</h1><div style={{display: 'flex', gap: '8px'}}>{customAction}<button onClick={() => setEditing({})}>Add {singular}</button></div></div>{error && <div className="error">{error}</div>}<CrudSummary title={title} rows={rows} settings={settings} /><PerformanceGraph config={performance} settings={settings} refreshKey={graphRefresh} liveRows={rows} /><Table columns={columns(settings)} rows={rows} onEdit={(row) => setEditing({ ...row })} onDelete={remove} />{editing && <Modal title={`${editing.id ? 'Edit' : 'Add'} ${singular}`} fields={fields} initial={editing} onCancel={() => setEditing(null)} onSave={save} settings={settings} />}</section>;
}

function BudgetPlanner({ settings }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [summary, setSummary] = useState({ categories: [], total_budget: 0, total_spent: 0, total_remaining: 0, percent_used: 0 });
  const [budgets, setBudgets] = useState([]);
  const [editing, setEditing] = useState(null);
  const [expenseBudget, setExpenseBudget] = useState(null);
  const [error, setError] = useState('');
  async function load() {
    const [summaryData, budgetRows] = await Promise.all([
      api(`/budgets/summary/${year}/${month}`),
      api(`/budgets?month=${month}&year=${year}`)
    ]);
    setSummary(summaryData);
    setBudgets(budgetRows);
  }
  useEffect(() => { load(); }, [month, year]);
  async function saveBudget(form) {
    const payload = { ...form, month, year };
    if (form.id) await api(`/budgets/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/budgets', { method: 'POST', body: JSON.stringify(payload) });
    setEditing(null);
    await load();
  }
  async function removeBudget(id) { if (!confirm('Delete this budget?')) return; await api(`/budgets/${id}`, { method: 'DELETE' }); await load(); }
  async function addExpense(form) { await api(`/budgets/${expenseBudget.id}/expenses`, { method: 'POST', body: JSON.stringify(form) }); setExpenseBudget(null); await load(); }
  async function removeExpense(budgetId, expenseId) { if (!confirm('Delete this budget expense?')) return; await api(`/budgets/${budgetId}/expenses/${expenseId}`, { method: 'DELETE' }); await load(); }
  function exportBudgetToPDF(budget) {
    const element = document.getElementById(`budget-card-${budget.id}`);
    if (!element) return;
    const opt = { 
      margin: 0.5, 
      filename: `${budget.category}-Budget.pdf`, 
      image: { type: 'jpeg', quality: 0.98 }, 
      html2canvas: { scale: 2, windowWidth: element.scrollWidth, width: element.scrollWidth }, 
      jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' } 
    };
    html2pdf().set(opt).from(element).save();
  }
  const yearOptions = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 2 + i);
  const chartRows = summary.categories.map(c => ({ name: c.category, Budget: Number(c.monthly_limit || 0), Spent: Number(c.spent || 0) }));
  const budgetFields = [{ name: 'category', label: 'Category' }, { name: 'monthly_limit', label: 'Budget Amount', type: 'number' }, { name: 'start_date', label: 'Start Date', type: 'date' }, { name: 'end_date', label: 'End Date', type: 'date' }, { name: 'notes', label: 'Notes' }];
  const expenseFields = [{ name: 'title', label: 'Expense Title' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'date', label: 'Date', type: 'date' }, { name: 'notes', label: 'Notes' }];
  return <section className="page budget-page"><div className="page-head"><div><h1>Budget Planner</h1><p className="muted">Independent budget planning with manual categories, date range, expense tracking.</p></div><button onClick={() => setEditing({ start_date: `${year}-${String(month).padStart(2, '0')}-01`, end_date: `${year}-${String(month).padStart(2, '0')}-28` })}>+ Add Budget</button></div><div className="budget-filters"><select value={month} onChange={e => setMonth(Number(e.target.value))}>{MONTHS.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}</select><select value={year} onChange={e => setYear(Number(e.target.value))}>{yearOptions.map(v => <option key={v} value={v}>{v}</option>)}</select></div>{error && <div className="error">{error}</div>}<div className="cards budget-cards"><div className="card stat-card stat-teal"><span>Total Budget</span><strong>{money(summary.total_budget, settings)}</strong></div><div className="card stat-card stat-yellow"><span>Total Spent</span><strong>{money(summary.total_spent, settings)}</strong></div><div className="card stat-card stat-emerald"><span>Remaining</span><strong>{money(summary.total_remaining, settings)}</strong></div><div className="card stat-card stat-blue"><span>Budget Used</span><strong>{Number(summary.percent_used || 0).toFixed(1)}%</strong></div></div><div className="budget-layout"><Chart title="Budget vs. Actual Spending"><BarChart data={chartRows}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="name" /><YAxis /><Tooltip content={<PremiumTooltip settings={settings} />} cursor={{ fill: 'rgba(20,184,166,0.08)' }} /><Bar dataKey="Budget" fill="#14b8a6" radius={[8,8,0,0]} /><Bar dataKey="Spent" fill="#f59e0b" radius={[8,8,0,0]} /></BarChart></Chart><div className="budget-breakdown card"><h3>Category Breakdown</h3>{summary.categories.length === 0 ? <p className="muted">No budgets yet.</p> : summary.categories.map(item => { const p = Number(item.percent_used || 0); return <div className="budget-progress" key={item.id}><div className="budget-progress-head"><strong>{item.category}</strong><span>{money(item.spent, settings)} / {money(item.monthly_limit, settings)} {'\u2022'} {p.toFixed(1)}%</span></div><div className="budget-track"><div style={{ width: `${Math.min(p, 100)}%` }} /></div></div>; })}</div></div><div className="budget-list">{budgets.map(b => <div className="budget-detail card" key={b.id} id={`budget-card-${b.id}`}><div className="budget-detail-head"><div><h3>{b.category}</h3><p className="muted">{formatDate(b.start_date, settings)}{b.end_date ? ` - ${formatDate(b.end_date, settings)}` : ''}</p></div><div className="actions" data-html2canvas-ignore="true"><button className="secondary" onClick={() => exportBudgetToPDF(b)}>Export PDF</button><button className="secondary" onClick={() => setEditing(b)}>Edit</button><button className="danger" onClick={() => removeBudget(b.id)}>Delete</button></div></div><div className="budget-metrics"><MiniRow label="Budget" value={b.monthly_limit} settings={settings} tone="good" /><MiniRow label="Spent" value={b.spent} settings={settings} tone="bad" /><MiniRow label="Remaining" value={b.remaining} settings={settings} tone={b.remaining >= 0 ? 'good' : 'bad'} /><MiniRow label="Used" value={Number(b.percent_used || 0).toFixed(1)} settings={{ currency_symbol: '' }} suffix="%" /></div><div className="budget-detail-grid"><div><div className="section-title"><h3>Expenses</h3><button data-html2canvas-ignore="true" onClick={() => setExpenseBudget(b)}>+ Add Expense</button></div><div className="budget-expenses">{b.expenses?.length ? b.expenses.map(e => <div className="budget-expense-row" key={e.id}><div><strong>{e.title}</strong><small>{formatDate(e.date, settings)}{e.notes ? ` \u2022 ${e.notes}` : ''}</small></div><div className="actions"><span>{money(e.amount, settings)}</span><button data-html2canvas-ignore="true" className="danger" onClick={() => removeExpense(b.id, e.id)}>Delete</button></div></div>) : <p className="muted">No expenses yet.</p>}</div></div>{(() => { const pieData = [...(b.expenses || []).map(e => ({ name: e.title, value: Number(e.amount || 0) }))]; const rem = Math.max(Number(b.remaining || 0), 0); if (rem > 0) pieData.push({ name: 'Remaining', value: rem }); if (pieData.length === 0) pieData.push({ name: 'Empty', value: 1 }); return <div className="chart-card"><div className="chart-head"><h3>{b.category} Expense Split</h3></div><div style={{ display: 'flex', justifyContent: 'center' }}><PieChart width={350} height={260}><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={88} paddingAngle={pieData.length > 1 ? 3 : 0}>{pieData.map((entry, i) => <Cell key={i} fill={entry.name === 'Remaining' ? '#334155' : entry.name === 'Empty' ? '#1e293b' : COLORS[i % COLORS.length]} />)}</Pie><Tooltip content={<PremiumTooltip settings={settings} />} /></PieChart></div></div>; })()}</div></div>)}</div>{editing && <Modal title={`${editing.id ? 'Edit' : 'Add'} Budget`} fields={budgetFields} initial={editing} onCancel={() => setEditing(null)} onSave={saveBudget} />}{expenseBudget && <Modal title={`Add Expense \u2022 ${expenseBudget.category}`} fields={expenseFields} initial={{ date: new Date().toISOString().slice(0, 10) }} onCancel={() => setExpenseBudget(null)} onSave={addExpense} />}</section>;
}

function Modal({ title, fields, initial, onCancel, onSave, settings }) {
  const [form, setForm] = useState(initial || {});
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const initialId = initial?.id;
  useEffect(() => {
    setForm(initial || {});
  }, [initialId]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      const payload = { ...form };
      if (isFdorRd(payload.category)) {
        payload.quantity = 1;
        payload.ticker = '';
        if (payload.payout_frequency === undefined || payload.payout_frequency === '') {
          payload.payout_frequency = 'Payment on Maturity';
        }
        if (!payload.current_price && payload.buy_price) {
          payload.current_price = payload.buy_price;
        }
      } else if (isBond(payload.category)) {
        payload.ticker = '';
        if (!payload.quantity || Number(payload.quantity) <= 0) {
          payload.quantity = 1;
        }
        if (payload.payout_frequency === undefined || payload.payout_frequency === '') {
          payload.payout_frequency = 'Payment on Maturity';
        }
        if (!payload.current_price && payload.buy_price) {
          payload.current_price = payload.buy_price;
        }
      }
      await onSave(payload);
    } catch(err) {
      setModalError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const handleCurrencyChange = (newCur) => {
    const oldCur = form.currency || initial?.currency || settings?.currency || 'INR';
    if (oldCur && newCur && oldCur !== newCur && settings) {
      const ratio = getRate(oldCur, newCur, settings);
      const next = { ...form, currency: newCur };
      ['buy_price', 'current_price', 'current_value', 'minimum_payment'].forEach(k => {
        if (form[k] !== undefined && form[k] !== '' && !isNaN(Number(form[k]))) {
          next[k] = Number((Number(form[k]) * ratio).toFixed(2));
        }
      });
      setForm(next);
    } else {
      setForm({ ...form, currency: newCur });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onSubmit={submit} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {modalError && <div className="error">{modalError}</div>}
        <div className="form-grid">
          {fields.map(f => {
            if (f.condition && !f.condition(form)) return null;
            const rawOptions = typeof f.options === 'function' ? f.options(form) : (f.options || []);
            const optionsList = Array.isArray(rawOptions) ? rawOptions : [];
            const currentVal = form[f.name];
            const hasCurrent = currentVal !== undefined && currentVal !== null && currentVal !== '' &&
              optionsList.some(o => {
                const v = typeof o === 'object' && o !== null ? o.value : o;
                return v === currentVal || String(v) === String(currentVal);
              });
            const resolvedOptions = (currentVal && !hasCurrent) ? [currentVal, ...optionsList] : optionsList;

            const isPriceField = ['buy_price', 'current_price', 'current_value'].includes(f.name);
            const activeCurrency = form.currency || initial?.currency || (settings?.currency || 'INR');
            const baseCurrency = settings?.currency || 'INR';
            const isForeignCurrency = activeCurrency !== baseCurrency;
            const fieldLabel = typeof f.label === 'function' ? f.label(form) : f.label;
            const fieldPlaceholder = typeof f.placeholder === 'function' ? f.placeholder(form) : (f.placeholder || '');

            return (
              <label key={f.name} style={f.type === 'checkbox' ? {display: 'flex', alignItems: 'center', gap: '10px'} : {}}>
                {f.type === 'checkbox' && (
                  <input
                    type="checkbox"
                    checked={!!form[f.name]}
                    onChange={e => setForm({ ...form, [f.name]: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{fieldLabel}</span>
                  {isPriceField && isForeignCurrency && (
                    <span style={{ fontSize: '11px', color: '#38bdf8' }}>
                      ({CURRENCIES[activeCurrency] || activeCurrency})
                    </span>
                  )}
                </div>
                {f.type === 'select' ? (
                  <select
                    value={form[f.name] ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (f.name === 'currency') handleCurrencyChange(val);
                      else {
                        const next = { ...form, [f.name]: val };
                        if (f.name === 'category') {
                          if (isFdorRd(val)) {
                            if (!next.payout_frequency) next.payout_frequency = 'Payment on Maturity';
                            if (!next.buy_date) next.buy_date = new Date().toISOString().split('T')[0];
                            next.quantity = 1;
                            next.ticker = '';
                          } else if (isBond(val)) {
                            if (!next.payout_frequency) next.payout_frequency = 'Payment on Maturity';
                            if (!next.buy_date) next.buy_date = new Date().toISOString().split('T')[0];
                            if (!next.quantity) next.quantity = 1;
                            next.ticker = '';
                          }
                        }
                        setForm(next);
                      }
                    }}
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <option value="">Select</option>
                    {resolvedOptions.map((o, idx) => {
                      const val = typeof o === 'object' && o !== null ? o.value : o;
                      const lbl = typeof o === 'object' && o !== null ? o.label : o;
                      return <option key={val ?? idx} value={val}>{lbl}</option>;
                    })}
                  </select>
                ) : f.type !== 'checkbox' ? (
                  <div>
                    <input
                      type={f.type || 'text'}
                      placeholder={fieldPlaceholder}
                      value={form[f.name] ?? ''}
                      onChange={e => {
                        const val = e.target.value;
                        const next = { ...form, [f.name]: val };
                        if (isFdorRd(next.category) || isBond(next.category)) {
                          if ((f.name === 'buy_date' || f.name === 'maturity_date') && !next.tenure) {
                            const autoT = calculateTenure(next.buy_date, next.maturity_date);
                            if (autoT) next.tenure = autoT;
                          }
                        }
                        setForm(next);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                    {isPriceField && isForeignCurrency && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11px', color: '#38bdf8' }}>
                        <span>
                          ≈ {money(convertValue(form[f.name] || 0, activeCurrency, settings), settings)}
                        </span>
                        <button
                          type="button"
                          style={{ background: 'transparent', border: 'none', color: '#5eead4', cursor: 'pointer', fontSize: '11px', padding: '0 4px', textDecoration: 'underline' }}
                          onClick={() => {
                            const curInr = convertValue(form[f.name] || 0, activeCurrency, settings);
                            const inputInr = prompt(`Enter ${fieldLabel} in ${baseCurrency} (${settings?.currency_symbol || '₹'}):`, curInr ? curInr.toFixed(2) : '');
                            if (inputInr !== null && !isNaN(Number(inputInr)) && Number(inputInr) >= 0) {
                              const rate = convertValue(1, activeCurrency, settings) || 1;
                              const convertedBack = Number((Number(inputInr) / rate).toFixed(4));
                              setForm(prev => ({ ...prev, [f.name]: convertedBack }));
                            }
                          }}
                        >
                          ✏️ Edit in {baseCurrency}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </label>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function UpdatePriceModal({ asset, settings, onCancel, onSave }) {
  const isForeign = asset.currency && asset.currency !== settings.currency;
  const rate = isForeign ? (convertValue(1, asset.currency, settings) || 94.0) : 1;
  const initialNative = Number(asset.current_price || 0);
  const initialInr = isForeign ? (initialNative * rate) : initialNative;

  const [nativePrice, setNativePrice] = useState(initialNative);
  const [inrPrice, setInrPrice] = useState(Number(initialInr.toFixed(2)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleNativeChange = (val) => {
    setNativePrice(val);
    const num = Number(val);
    if (!isNaN(num) && rate > 0) {
      setInrPrice(Number((num * rate).toFixed(2)));
    }
  };

  const handleInrChange = (val) => {
    setInrPrice(val);
    const num = Number(val);
    if (!isNaN(num) && rate > 0) {
      setNativePrice(Number((num / rate).toFixed(4)));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalPrice = Number(nativePrice);
    if (isNaN(finalPrice) || finalPrice <= 0) {
      setError('Please enter a valid price greater than 0.');
      return;
    }
    setSaving(true);
    try {
      await onSave(finalPrice);
    } catch (err) {
      setError(err.message || 'Failed to update price');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onSubmit={handleSubmit} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <h2>Update Price • {asset.asset_name}</h2>
        {error && <div className="error">{error}</div>}

        <div style={{ display: 'grid', gap: '14px' }}>
          <label>
            Price in {asset.currency || settings.currency} ({CURRENCIES[asset.currency] || settings.currency_symbol || '₹'})
            <input 
              type="number" 
              step="any" 
              required 
              value={nativePrice} 
              onChange={e => handleNativeChange(e.target.value)} 
            />
          </label>

          {isForeign && (
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid #0284c7', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                🇮🇳 Live INR Equivalent (1 {asset.currency} ≈ {money(rate, settings)})
              </div>
              <label style={{ fontSize: '13px' }}>
                Price in INR (₹)
                <input 
                  type="number" 
                  step="any" 
                  value={inrPrice} 
                  onChange={e => handleInrChange(e.target.value)} 
                  placeholder="Enter price in INR"
                />
              </label>
              <small style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                Editing either INR or {asset.currency} auto-calculates the other in real time.
              </small>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: '16px' }}>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button disabled={saving}>{saving ? 'Updating...' : 'Update Price'}</button>
        </div>
      </form>
    </div>
  );
}

function ReceiveInterestModal({ investment, bankAccounts, settings, onCancel, onSuccess }) {
  const isBondAsset = isBond(investment.category);
  const units = isBondAsset ? Number(investment.quantity || 1) : 1;
  const principal = isBondAsset
    ? Number(investment.buy_price || 0) * units
    : Number(investment.buy_price || 0);
  const rate = Number(investment.interest_rate || 0);
  const [payoutFreq, setPayoutFreq] = useState(investment.payout_frequency || 'Monthly Payout');

  // Compute standard periodic payouts
  const monthlyInterest = Number(((principal * (rate / 100)) / 12).toFixed(2));
  const quarterlyInterest = Number(((principal * (rate / 100)) / 4).toFixed(2));
  const halfYearlyInterest = Number(((principal * (rate / 100)) / 2).toFixed(2));
  const annualInterest = Number(((principal * (rate / 100))).toFixed(2));

  const getAmountForFreq = (f) => {
    if (f === 'Quarterly Payout') return quarterlyInterest;
    if (f === 'Half-Yearly Payout' || f === 'Semi-Annual Payout') return halfYearlyInterest;
    if (f === 'Annual Payout' || f === 'Yearly Payout') return annualInterest;
    return monthlyInterest;
  };

  const [interestAmount, setInterestAmount] = useState(() => {
    const defaultAmt = getAmountForFreq(investment.payout_frequency);
    return defaultAmt > 0 ? defaultAmt : '';
  });
  const [dateReceived, setDateReceived] = useState(() => new Date().toISOString().split('T')[0]);
  const [targetAccountId, setTargetAccountId] = useState(() => investment.receiving_account_id || (bankAccounts?.[0]?.id || ''));
  const [adjustBalance, setAdjustBalance] = useState(true);
  const [memo, setMemo] = useState(() => {
    const monthName = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
    const freqTag = (investment.payout_frequency || 'Monthly').replace(' Payout', '');
    return `${freqTag} interest received - ${investment.asset_name} (${monthName})`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSelectFrequency = (selectedFreq) => {
    setPayoutFreq(selectedFreq);
    const amt = getAmountForFreq(selectedFreq);
    if (amt > 0) setInterestAmount(amt);
    const monthName = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
    const freqTag = selectedFreq.replace(' Payout', '');
    setMemo(`${freqTag} interest received - ${investment.asset_name} (${monthName})`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!interestAmount || Number(interestAmount) <= 0) {
      setError('Please enter a valid interest amount.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await api(`/investments/${investment.id}/record-interest`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(interestAmount),
          date: dateReceived,
          account_id: targetAccountId ? Number(targetAccountId) : null,
          description: memo,
          adjust_balance: adjustBalance
        })
      });
      onSuccess(res.message || 'Interest payout recorded successfully!');
    } catch (err) {
      setError(err.message || 'Failed to record interest.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onSubmit={handleSubmit} onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💰</span> Record Interest Received
          </h2>
          <span className="badge" style={{ background: '#064e3b', color: '#6ee7b7', border: '1px solid #059669', fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
            {isRd(investment.category) ? 'Recurring Deposit (RD)' : isFd(investment.category) ? 'Fixed Deposit (FD)' : isBond(investment.category) ? 'Bond' : 'Investment'} • {payoutFreq}
          </span>
        </div>
        
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8' }}>
          Mark this period&apos;s interest as received and automatically credit your bank account balance.
        </p>

        {error && <div className="error" style={{ marginBottom: '14px' }}>{error}</div>}

        <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #334155', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '13px' }}>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>
                {isRd(investment.category) ? 'RECURRING DEPOSIT' : isFd(investment.category) ? 'FIXED DEPOSIT' : isBond(investment.category) ? 'BOND / DEBENTURE' : 'INVESTMENT'}
              </span>
              <strong style={{ color: '#f8fafc' }}>{investment.asset_name}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>
                {isBond(investment.category) ? `TOTAL INVESTED (${units} ${units === 1 ? 'Unit' : 'Units'})` : 'PRINCIPAL AMOUNT'}
              </span>
              <strong style={{ color: '#38bdf8' }}>{money(principal, settings)}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>INTEREST / COUPON RATE</span>
              <strong style={{ color: '#10b981' }}>{rate}% p.a.</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>LAST RECEIVED</span>
              <span style={{ color: investment.last_interest_date ? '#e2e8f0' : '#64748b' }}>
                {investment.last_interest_date ? formatDate(investment.last_interest_date, settings) : 'None recorded yet'}
              </span>
            </div>
          </div>
        </div>

        {/* Payout Options: Quick selection for same fixed amounts */}
        <div style={{ marginBottom: '16px', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 14px' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>
            Select Payout Frequency to auto-fill standard amount:
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleSelectFrequency('Monthly Payout')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: payoutFreq === 'Monthly Payout' ? '1px solid #10b981' : '1px solid #334155',
                background: payoutFreq === 'Monthly Payout' ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
                color: payoutFreq === 'Monthly Payout' ? '#10b981' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: payoutFreq === 'Monthly Payout' ? 600 : 400
              }}
            >
              📅 Monthly ({money(monthlyInterest, settings)})
            </button>
            <button
              type="button"
              onClick={() => handleSelectFrequency('Quarterly Payout')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: payoutFreq === 'Quarterly Payout' ? '1px solid #10b981' : '1px solid #334155',
                background: payoutFreq === 'Quarterly Payout' ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
                color: payoutFreq === 'Quarterly Payout' ? '#10b981' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: payoutFreq === 'Quarterly Payout' ? 600 : 400
              }}
            >
              📊 Quarterly ({money(quarterlyInterest, settings)})
            </button>
            <button
              type="button"
              onClick={() => handleSelectFrequency('Half-Yearly Payout')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: payoutFreq === 'Half-Yearly Payout' ? '1px solid #10b981' : '1px solid #334155',
                background: payoutFreq === 'Half-Yearly Payout' ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
                color: payoutFreq === 'Half-Yearly Payout' ? '#10b981' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: payoutFreq === 'Half-Yearly Payout' ? 600 : 400
              }}
            >
              🌓 Half-Yearly ({money(halfYearlyInterest, settings)})
            </button>
            <button
              type="button"
              onClick={() => handleSelectFrequency('Annual Payout')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: payoutFreq === 'Annual Payout' ? '1px solid #10b981' : '1px solid #334155',
                background: payoutFreq === 'Annual Payout' ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
                color: payoutFreq === 'Annual Payout' ? '#10b981' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: payoutFreq === 'Annual Payout' ? 600 : 400
              }}
            >
              🗓️ Annual ({money(annualInterest, settings)})
            </button>
          </div>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <label>
            <span>Interest Amount Received ({settings?.currency_symbol || '₹'})</span>
            <input
              type="number"
              step="any"
              required
              value={interestAmount}
              onChange={e => setInterestAmount(e.target.value)}
              placeholder="e.g. 1500"
              style={{ fontWeight: 600, color: '#10b981', fontSize: '15px' }}
            />
          </label>

          <label>
            <span>Date Received</span>
            <input
              type="date"
              required
              value={dateReceived}
              onChange={e => setDateReceived(e.target.value)}
            />
          </label>

          <label style={{ gridColumn: 'span 2' }}>
            <span>Receiving Bank Account</span>
            <select
              value={targetAccountId}
              onChange={e => setTargetAccountId(e.target.value)}
            >
              <option value="">-- Select Receiving Account --</option>
              {(bankAccounts || []).map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({money(b.current_value, settings)})
                </option>
              ))}
            </select>
          </label>

          <label style={{ gridColumn: 'span 2' }}>
            <span>Description / Transaction Note</span>
            <input
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="Transaction memo"
            />
          </label>

          <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
            <input
              type="checkbox"
              checked={adjustBalance}
              onChange={e => setAdjustBalance(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span style={{ fontSize: '13px', color: '#e2e8f0' }}>
              Automatically credit receiving bank account balance (+{settings?.currency_symbol || '₹'}{interestAmount || 0})
            </span>
          </label>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" style={{ background: '#059669', color: '#fff' }} disabled={submitting}>
            {submitting ? 'Recording...' : 'Confirm & Record Interest'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReportModal({ title, reportText, onCancel }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: '500px' }}><h2>{title}</h2><pre style={{ background: '#020617', padding: '16px', borderRadius: '12px', color: '#e5e7eb', overflowX: 'auto', whiteSpace: 'pre-wrap', border: '1px solid #1e293b', fontSize: '14px', lineHeight: '1.6', margin: '0' }}>{reportText}</pre><div className="modal-actions"><button type="button" className="secondary" onClick={onCancel}>Close</button><button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy to Clipboard'}</button></div></div></div>;
}

function Dashboard({ settings, categories }) {
  const [data, setData] = useState({ assets: [], liabilities: [], investments: [], cashflow: [], snapshots: [], weeklySnapshots: [], goals: [], summary: null });
  const [networthPeriod, setNetworthPeriod] = useState('month');
  const [networthDates, setNetworthDates] = useState({ start: '', end: '' });
  const [cashflowPeriod, setCashflowPeriod] = useState('month');
  const [cashflowDates, setCashflowDates] = useState({ start: '', end: '' });
  const [investmentPeriod, setInvestmentPeriod] = useState('all');
  const [investmentDates, setInvestmentDates] = useState({ start: '', end: '' });
  const [breakdown, setBreakdown] = useState(null);
  const [quickType, setQuickType] = useState('');
  const [quickForm, setQuickForm] = useState({});
  const [snapshotReport, setSnapshotReport] = useState(null);
  const [editingTx, setEditingTx] = useState(null);

  async function handleDeleteTx(id) {
    if (!confirm('Delete this transaction? Any bank account balance adjustments will be reverted.')) return;
    await api(`/cashflow/${id}`, { method: 'DELETE' });
    await load();
  }

  async function load() {
    const now = new Date();
    const r = await Promise.all([
      api('/assets'),
      api('/liabilities'),
      api('/investments'),
      api('/cashflow'),
      api('/snapshots?period=monthly'),
      api('/snapshots?period=weekly'),
      api(`/cashflow/summary/${now.getFullYear()}/${now.getMonth() + 1}`),
      api('/goals'),
      api('/insurance')
    ]);
    setData({
      assets: r[0],
      liabilities: r[1],
      investments: r[2],
      cashflow: r[3],
      snapshots: r[4] || [],
      weeklySnapshots: r[5] || [],
      summary: r[6] || null,
      goals: r[7] || [],
      insurance: r[8] || []
    });
  }

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const dA = data.assets.reduce((s, x) => s + convertValue(x.current_value, x.currency, settings), 0);
    const insCash = (data.insurance || []).reduce((s, x) => s + (x.status === 'active' ? Number(x.cash_value || 0) : 0), 0);
    const liab = data.liabilities.reduce((s, x) => s + convertValue(x.current_value, x.currency, settings), 0);
    const inv = data.investments.reduce((s, x) => s + investmentCurrentValue(x, settings), 0);
    const invCost = data.investments.reduce((s, x) => s + investmentInvestedAmount(x, settings), 0);
    const ncf = data.cashflow.reduce((s, x) => s + (x.type === 'transfer' ? 0 : convertValue(x.type === 'income' ? x.amount : -x.amount, x.currency, settings)), 0);
    const unadjustedNcf = data.cashflow.filter(x => !x.adjust_balance && x.type !== 'transfer')
      .reduce((s, x) => s + convertValue(x.type === 'income' ? x.amount : -x.amount, x.currency, settings), 0);
    const assets = dA + inv + insCash;
    return {
      directAssets: dA + insCash,
      assets,
      liabilities: liab,
      investments: inv,
      invested: invCost,
      netCashflow: ncf,
      pnl: inv - invCost,
      networth: assets - liab + unadjustedNcf
    };
  }, [data, settings]);

  const networthChart = useMemo(() => {
    const datesSet = new Set();
    data.assets.forEach(e => { if (e.date_added) datesSet.add(e.date_added.slice(0, 10)); });
    data.liabilities.forEach(e => { if (e.date_added) datesSet.add(e.date_added.slice(0, 10)); });
    data.investments.forEach(e => { if (e.buy_date) datesSet.add(e.buy_date.slice(0, 10)); });
    data.cashflow.forEach(e => { if (e.date) datesSet.add(e.date.slice(0, 10)); });
    
    let allDates = Array.from(datesSet).sort((a, b) => a.localeCompare(b));
    if (allDates.length === 0) return [];
    
    const dailyNetWorth = {};
    let runningAssets = 0, runningLiabilities = 0, runningInvestments = 0, runningCashflow = 0;
    const itemsByDate = {};
    for (const d of allDates) itemsByDate[d] = { a: [], l: [], i: [], cf: [] };
    
    data.assets.forEach(e => { if (e.date_added) itemsByDate[e.date_added.slice(0, 10)].a.push(e); });
    data.liabilities.forEach(e => { if (e.date_added) itemsByDate[e.date_added.slice(0, 10)].l.push(e); });
    data.investments.forEach(e => { if (e.buy_date) itemsByDate[e.buy_date.slice(0, 10)].i.push(e); });
    data.cashflow.forEach(e => { if (e.date) itemsByDate[e.date.slice(0, 10)].cf.push(e); });

    for (const d of allDates) {
      const items = itemsByDate[d];
      runningAssets += items.a.reduce((sum, item) => sum + convertValue(item.current_value, item.currency, settings), 0);
      runningLiabilities += items.l.reduce((sum, item) => sum + convertValue(item.current_value, item.currency, settings), 0);
      runningInvestments += items.i.reduce((sum, item) => sum + investmentCurrentValue(item, settings), 0);
      
      const dayIncome = items.cf.filter(e => e.type === 'income').reduce((sum, e) => sum + convertValue(e.amount, e.currency, settings), 0);
      const dayExpense = items.cf.filter(e => e.type === 'expense').reduce((sum, e) => sum + convertValue(e.amount, e.currency, settings), 0);
      runningCashflow += (dayIncome - dayExpense);

      dailyNetWorth[d] = runningAssets - runningLiabilities + runningInvestments + runningCashflow;
    }

    const now = new Date();
    const filteredDates = allDates.filter(d => {
      const dateObj = new Date(d);
      if (networthPeriod === 'week') {
        const limit = new Date(now); limit.setDate(now.getDate() - 7 * 12);
        return dateObj >= limit;
      } else if (networthPeriod === '10days') {
        const limit = new Date(now); limit.setDate(now.getDate() - 10);
        return dateObj >= limit;
      } else if (networthPeriod === '30days') {
        const limit = new Date(now); limit.setDate(now.getDate() - 30);
        return dateObj >= limit;
      } else if (networthPeriod === 'month') {
        const limit = new Date(now); limit.setMonth(now.getMonth() - 6);
        return dateObj >= limit;
      } else if (networthPeriod === 'custom') {
        if (networthDates.start && dateObj < new Date(networthDates.start)) return false;
        if (networthDates.end && dateObj > new Date(networthDates.end)) return false;
      }
      return true;
    });

    if (networthPeriod === 'all' || networthPeriod === 'month') {
      const byMonth = {};
      for (const d of filteredDates) {
        byMonth[d.slice(0, 7)] = dailyNetWorth[d];
      }
      return Object.entries(byMonth).map(([key, nw]) => {
        const [year, month] = key.split('-');
        const label = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
        return { date: label, netWorth: nw };
      });
    }

    if (networthPeriod === 'week') {
       const byWeek = {};
       for (const d of filteredDates) {
         const dObj = new Date(d);
         const day = dObj.getDay();
         const monday = new Date(dObj);
         monday.setDate(dObj.getDate() - (day === 0 ? 6 : day - 1));
         byWeek[monday.toISOString().slice(0, 10)] = dailyNetWorth[d];
       }
       return Object.entries(byWeek).map(([key, nw]) => ({ date: key, netWorth: nw }));
    }

    return filteredDates.map(d => ({ date: d, netWorth: dailyNetWorth[d] }));
  }, [networthPeriod, networthDates, data, settings]);

  const cashflowChart = useMemo(() => {
    const grouped = {};
    for (const cf of data.cashflow) {
      if (!cf.date) continue;
      const d = new Date(cf.date);
      let key = '';

      if (cashflowPeriod === 'week') {
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        key = monday.toISOString().slice(0, 10);
      } else if (cashflowPeriod === 'all' || cashflowPeriod === 'month') {
        key = cf.date.slice(0, 7); // YYYY-MM
      } else {
        // 10days, 30days, custom
        if (cashflowPeriod === 'custom') {
          if (cashflowDates.start && new Date(cf.date) < new Date(cashflowDates.start)) continue;
          if (cashflowDates.end && new Date(cf.date) > new Date(cashflowDates.end)) continue;
        }
        key = cf.date.slice(0, 10);
      }

      if (!grouped[key]) grouped[key] = { Income: 0, Expenses: 0 };
      if (cf.type === 'income') grouped[key].Income += convertValue(cf.amount, cf.currency, settings);
      if (cf.type === 'expense') grouped[key].Expenses += convertValue(cf.amount, cf.currency, settings);
    }

    let entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

    if (cashflowPeriod === '10days') entries = entries.slice(-10);
    else if (cashflowPeriod === '30days') entries = entries.slice(-30);
    else if (cashflowPeriod === 'week') entries = entries.slice(-12);
    else if (cashflowPeriod === 'month') entries = entries.slice(-6);

    return entries.map(([key, vals]) => {
      if (cashflowPeriod === 'all' || cashflowPeriod === 'month') {
        const [year, month] = key.split('-');
        const label = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
        return { date: label, ...vals };
      }
      return { date: key, ...vals };
    });
  }, [cashflowPeriod, cashflowDates, data.cashflow, settings]);

  const normalizeInvestmentCategory = (cat) => {
    const c = (cat || 'Other').trim().toLowerCase();
    if (/^stocks?$/.test(c)) return 'Stocks';
    if (/^bonds?$/.test(c)) return 'Bonds';
    if (/^mutual\s*funds?$/.test(c)) return 'Mutual Funds';
    if (/^etfs?$/.test(c)) return 'ETFs';
    if (/^(crypto|cryptocurrency|cryptocurrencies)$/.test(c)) return 'Crypto';
    if (/^(fd|fixed\s*deposits?)$/.test(c)) return 'Fixed Deposits';
    if (/^(real\s*estate|realty)$/.test(c)) return 'Real Estate';
    if (/^(gold|silver|commodit(y|ies))$/.test(c)) return 'Commodities';
    // Title-case anything else
    return cat.trim().charAt(0).toUpperCase() + cat.trim().slice(1);
  };

  const assetChartData = useMemo(() => {
    const baseData = [
      ...data.assets.map(e => ({ category: e.category || 'Other', current_value: e.current_value, currency: e.currency })),
      ...data.investments.map(e => ({ category: normalizeInvestmentCategory(e.category || 'Investments'), current_value: investmentCurrentValue(e, settings), currency: settings.currency }))
    ];
    return byCategory(baseData);
  }, [data.assets, data.investments, settings]);

  const investmentPerformanceChartData = useMemo(() => {
    const grouped = {};
    const now = new Date();
    
    for (const inv of data.investments) {
      if (investmentPeriod !== 'all') {
        if (!inv.buy_date) continue; // Exclude if we are filtering by date but no date is present
        const d = new Date(inv.buy_date);
        if (investmentPeriod === 'week') {
           const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
           if (d < weekAgo) continue;
        } else if (investmentPeriod === 'month') {
           const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
           if (d < monthAgo) continue;
        } else if (investmentPeriod === 'year') {
           const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);
           if (d < yearAgo) continue;
        } else if (investmentPeriod === 'custom') {
           if (investmentDates.start && new Date(inv.buy_date) < new Date(investmentDates.start)) continue;
           if (investmentDates.end && new Date(inv.buy_date) > new Date(investmentDates.end)) continue;
        }
      }
      
      const cat = normalizeInvestmentCategory(inv.category);
      if (!grouped[cat]) {
        grouped[cat] = { category: cat, invested_amount: 0, current_value: 0 };
      }
      grouped[cat].invested_amount += Number(inv.invested_amount || (Number(inv.buy_price || 0) * Number(inv.quantity || 0)));
      grouped[cat].current_value += Number(inv.current_value || (Number(inv.current_price || 0) * Number(inv.quantity || 0)));
    }
    return Object.values(grouped).sort((a, b) => b.current_value - a.current_value);
  }, [data.investments, investmentPeriod, investmentDates]);

  const liabilityChartData = byCategory(data.liabilities);

  const networthGradients = assetChartData.map((entry, i) => (
    <linearGradient key={`nw-grad-${i}`} id={`nw-assetGrad-${i}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.9} />
      <stop offset="100%" stopColor={COLORS[(i + 1) % COLORS.length]} stopOpacity={0.7} />
    </linearGradient>
  ));

  const liabilityGradients = liabilityChartData.map((entry, i) => (
    <linearGradient key={`nw-liab-grad-${i}`} id={`nw-liabGrad-${i}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={COLORS[(i + 2) % COLORS.length]} stopOpacity={0.9} />
      <stop offset="100%" stopColor={COLORS[(i + 3) % COLORS.length]} stopOpacity={0.7} />
    </linearGradient>
  ));

  const networthToggle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <div className="toggle-tabs">
        <button type="button" className={networthPeriod === 'all' ? 'active' : ''} onClick={() => setNetworthPeriod('all')}>All</button>
        <button type="button" className={networthPeriod === 'month' ? 'active' : ''} onClick={() => setNetworthPeriod('month')}>Month</button>
        <button type="button" className={networthPeriod === 'week' ? 'active' : ''} onClick={() => setNetworthPeriod('week')}>Week</button>
        <button type="button" className={networthPeriod === '10days' ? 'active' : ''} onClick={() => setNetworthPeriod('10days')}>10 Days</button>
        <button type="button" className={networthPeriod === '30days' ? 'active' : ''} onClick={() => setNetworthPeriod('30days')}>30 Days</button>
        <button type="button" className={networthPeriod === 'custom' ? 'active' : ''} onClick={() => setNetworthPeriod('custom')}>Custom</button>
      </div>
      {networthPeriod === 'custom' && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="date" value={networthDates.start} onChange={e => setNetworthDates(prev => ({ ...prev, start: e.target.value }))} style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '120px' }} />
          <span style={{ color: '#94a3b8' }}>-</span>
          <input type="date" value={networthDates.end} onChange={e => setNetworthDates(prev => ({ ...prev, end: e.target.value }))} style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '120px' }} />
        </div>
      )}
    </div>
  );

  const cashflowToggle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <div className="toggle-tabs">
        <button type="button" className={cashflowPeriod === 'all' ? 'active' : ''} onClick={() => setCashflowPeriod('all')}>All</button>
        <button type="button" className={cashflowPeriod === 'month' ? 'active' : ''} onClick={() => setCashflowPeriod('month')}>Month</button>
        <button type="button" className={cashflowPeriod === 'week' ? 'active' : ''} onClick={() => setCashflowPeriod('week')}>Week</button>
        <button type="button" className={cashflowPeriod === '10days' ? 'active' : ''} onClick={() => setCashflowPeriod('10days')}>10 Days</button>
        <button type="button" className={cashflowPeriod === '30days' ? 'active' : ''} onClick={() => setCashflowPeriod('30days')}>30 Days</button>
        <button type="button" className={cashflowPeriod === 'custom' ? 'active' : ''} onClick={() => setCashflowPeriod('custom')}>Custom</button>
      </div>
      {cashflowPeriod === 'custom' && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="date" value={cashflowDates.start} onChange={e => setCashflowDates(prev => ({ ...prev, start: e.target.value }))} style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '120px' }} />
          <span style={{ color: '#94a3b8' }}>-</span>
          <input type="date" value={cashflowDates.end} onChange={e => setCashflowDates(prev => ({ ...prev, end: e.target.value }))} style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '120px' }} />
        </div>
      )}
    </div>
  );

  const investmentToggle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <div className="toggle-tabs">
        <button type="button" className={investmentPeriod === 'all' ? 'active' : ''} onClick={() => setInvestmentPeriod('all')}>All</button>
        <button type="button" className={investmentPeriod === 'week' ? 'active' : ''} onClick={() => setInvestmentPeriod('week')}>Weekly</button>
        <button type="button" className={investmentPeriod === 'month' ? 'active' : ''} onClick={() => setInvestmentPeriod('month')}>Monthly</button>
        <button type="button" className={investmentPeriod === 'year' ? 'active' : ''} onClick={() => setInvestmentPeriod('year')}>Yearly</button>
        <button type="button" className={investmentPeriod === 'custom' ? 'active' : ''} onClick={() => setInvestmentPeriod('custom')}>Custom</button>
      </div>
      {investmentPeriod === 'custom' && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="date" value={investmentDates.start} onChange={e => setInvestmentDates(prev => ({ ...prev, start: e.target.value }))} style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '120px' }} />
          <span style={{ color: '#94a3b8' }}>-</span>
          <input type="date" value={investmentDates.end} onChange={e => setInvestmentDates(prev => ({ ...prev, end: e.target.value }))} style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '120px' }} />
        </div>
      )}
    </div>
  );

  const getCategoryOptions = (types) => {
    const list = [];
    types.forEach(t => {
      if (categories[t]) list.push(...categories[t]);
    });
    return [...new Set(list)];
  };

  const quickFields = quickType === 'asset' ? [
    { name: 'name', label: 'Name' },
    { name: 'category', label: 'Category', type: 'select', options: getCategoryOptions(['asset']) },
    { name: 'current_value', label: 'Current Value', type: 'number' },
    { name: 'date_added', label: 'Date', type: 'date' },
    { name: 'notes', label: 'Notes' }
  ] : quickType === 'liability' ? [
    { name: 'name', label: 'Name' },
    { name: 'category', label: 'Category', type: 'select', options: getCategoryOptions(['liability']) },
    { name: 'current_value', label: 'Current Value', type: 'number' },
    { name: 'date_added', label: 'Date', type: 'date' },
    { name: 'notes', label: 'Notes' }
  ] : quickType === 'cashflow' ? [
    { name: 'type', label: 'Type', type: 'select', options: ['income', 'expense'] },
    { name: 'amount', label: 'Amount', type: 'number' },
    { name: 'category', label: 'Category', type: 'select', options: (form) => form.type === 'income' ? getCategoryOptions(['income']) : form.type === 'expense' ? getCategoryOptions(['expense']) : getCategoryOptions(['income', 'expense']) },
    { name: 'date', label: 'Date', type: 'date' },
    { name: 'description', label: 'Description' }
  ] : quickType === 'investment' ? [
    { name: 'asset_name', label: (form) => isRd(form?.category) ? 'Recurring Deposit Name' : isFd(form?.category) ? 'Fixed Deposit Name' : isBond(form?.category) ? 'Bond / Debenture Name' : 'Name' },
    { name: 'category', label: 'Category', type: 'select', options: getCategoryOptions(['investment']) },
    { name: 'platform', label: (form) => isFdorRd(form?.category) ? 'Bank / Institution' : isBond(form?.category) ? 'Platform / Broker' : 'Platform' },
    { name: 'quantity', label: (form) => isBond(form?.category) ? 'Units' : 'Quantity', type: 'number', condition: (form) => !isFdorRd(form?.category) },
    { name: 'buy_price', label: (form) => isRd(form?.category) ? 'Monthly Deposit (₹)' : isFd(form?.category) ? 'Principal Amount (₹)' : isBond(form?.category) ? 'Price per Unit (₹)' : 'Buy Price', type: 'number' },
    { name: 'current_price', label: (form) => isFdorRd(form?.category) ? 'Current / Maturity Value' : isBond(form?.category) ? 'Current Price per Unit' : 'Current Price', type: 'number' },
    { name: 'buy_date', label: (form) => isRd(form?.category) ? 'Start Date' : isFd(form?.category) ? 'Deposit Date' : isBond(form?.category) ? 'Investment Date' : 'Buy Date', type: 'date' },
    { name: 'tenure', label: 'Tenure', placeholder: (form) => isRd(form?.category) ? 'e.g. 12 Months, 2 Years' : isBond(form?.category) ? 'e.g. 2 Years, 36 Months' : 'e.g. 1 Year, 18 Months', condition: (form) => isFdorRd(form?.category) || isBond(form?.category) },
    { name: 'interest_rate', label: (form) => isBond(form?.category) ? 'Interest / Coupon Rate (%)' : 'Interest Rate (%)', type: 'number', condition: (form) => isFdorRd(form?.category) || isBond(form?.category) },
    { name: 'maturity_date', label: 'Maturity Date', type: 'date', condition: (form) => isFdorRd(form?.category) || isBond(form?.category) },
    { name: 'payout_frequency', label: 'Interest Payout Option', type: 'select', options: ['Payment on Maturity', 'Monthly Payout', 'Quarterly Payout', 'Half-Yearly Payout', 'Annual Payout'], condition: (form) => isFdorRd(form?.category) || isBond(form?.category) },
    { name: 'is_sip', label: 'Is SIP / Recurring?', type: 'checkbox', condition: (form) => (isRd(form?.category) || !isFdorRd(form?.category)) && !isBond(form?.category) },
    { name: 'notes', label: 'Notes' }
  ] : [];

  async function quickAdd(form) {
    const today = new Date().toISOString().slice(0, 10);
    const endpoints = {
      asset: '/assets',
      liability: '/liabilities',
      cashflow: '/cashflow',
      investment: '/investments'
    };
    const defaultData = quickType === 'cashflow' ? { date: today } : quickType === 'investment' ? { buy_date: today } : {};
    await api(endpoints[quickType], { method: 'POST', body: JSON.stringify({ ...defaultData, ...form }) });
    setQuickType('');
    setQuickForm({});
    await load();
  }

  async function handleTakeSnapshot() {
    const snap = await api('/snapshots', { method: 'POST' });
    await load();
    const text = `Snapshot Report - ${new Date().toLocaleString()}
-----------------------------------
Net Worth:          ${money(snap.net_worth, settings)}
Total Assets:       ${money(snap.total_assets, settings)}
Total Liabilities:  ${money(snap.total_liabilities, settings)}
Monthly Cash Flow:  ${money(snap.monthly_income - snap.monthly_expenses, settings)}
Investments:        ${money(snap.investment_value, settings)}
Investment P&L:     ${money(snap.investment_pnl, settings)}
-----------------------------------`;
    setSnapshotReport(text);
  }

  return (
    <section className="page dashboard-page">
      <div className="overview-head">
        <div>
          <p className="eyebrow">Overview</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1>Dashboard</h1>
            <button
              type="button"
              className={`privacy-btn ${isPrivacyActive(settings) ? 'privacy-active' : ''}`}
              onClick={settings?.togglePrivacy}
              title={isPrivacyActive(settings) ? "Click to show amounts (Privacy Mode ON)" : "Click to hide amounts (Privacy Mode OFF)"}
            >
              {isPrivacyActive(settings) ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
              <span>{isPrivacyActive(settings) ? 'Hidden' : 'Hide'}</span>
            </button>
          </div>
          <p className="muted">Track net worth, assets, liabilities, cash flow, investments and budget health.</p>
        </div>
        <div className="quick-actions">
          <button onClick={() => setQuickType('asset')}>+ Asset</button>
          <button onClick={() => setQuickType('liability')}>+ Liability</button>
          <button onClick={() => setEditingTx({})}>+ Cash Flow</button>
          <button onClick={() => setQuickType('investment')}>+ Investment</button>
          <button className="secondary glow-btn" onClick={handleTakeSnapshot}>⏱ Snapshot</button>
        </div>
      </div>

      {(() => {
        const renders = {
          stats: (
            <div className="cards overview-cards">
              <StatCard id="networth" label="Net Worth" value={totals.networth} hint="Assets + investments - liabilities + cash flow" color="teal" breakdown={breakdown} setBreakdown={setBreakdown} settings={settings} />
              <StatCard id="assets" label="Total Assets" value={totals.assets} hint={`${data.assets.length} assets + ${data.investments.length} investments`} color="emerald" breakdown={breakdown} setBreakdown={setBreakdown} settings={settings} />
              <StatCard id="liabilities" label="Total Liabilities" value={totals.liabilities} hint={`${data.liabilities.length} records`} color="red" breakdown={breakdown} setBreakdown={setBreakdown} settings={settings} />
              <StatCard id="cashflow" label="Monthly Cash Flow" value={totals.netCashflow} hint="Income minus expenses" color="blue" breakdown={breakdown} setBreakdown={setBreakdown} settings={settings} />
              <StatCard id="investments" label="Investments" value={totals.investments} hint="Current market value" color="purple" breakdown={breakdown} setBreakdown={setBreakdown} settings={settings} />
              <StatCard id="pnl" label="Investment P&L" value={totals.pnl} hint="Current - invested" color="yellow" breakdown={breakdown} setBreakdown={setBreakdown} settings={settings} />
            </div>
          ),
          breakdown: <BreakdownPanel type={breakdown} data={data} totals={totals} settings={settings} />,
          goals: data.goals && data.goals.length > 0 ? (
            <div className="dashboard-goals-section">
              <h3>Active Goals</h3>
              <div className="dashboard-goals-grid">
                {data.goals.slice(0, 4).map(g => {
                  const pct = Math.min(100, Math.round(((g.current_amount || 0) / g.target_amount) * 100));
                  const radius = 24;
                  const circumference = 2 * Math.PI * radius;
                  const strokeDashoffset = circumference - (pct / 100) * circumference;
                  return (
                    <div key={g.id} className="dash-goal-card card">
                      <div className="dash-goal-ring">
                        <svg width="60" height="60">
                          <circle cx="30" cy="30" r={radius} className="ring-bg" />
                          <circle cx="30" cy="30" r={radius} className="ring-fill"
                            style={{ stroke: g.color, strokeDasharray: circumference, strokeDashoffset }} />
                        </svg>
                        <span className="ring-icon">{g.icon}</span>
                      </div>
                      <div className="dash-goal-info">
                        <strong>{g.name}</strong>
                        <small>{money(g.current_amount || 0, settings)} / {money(g.target_amount, settings)}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null,
          networth_chart: networthChart.length > 0 ? (
            <Chart title="Net Worth Over Time" controls={networthToggle}>
              <BarChart data={networthChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tickFormatter={(val) => formatDate(val, settings)} />
                <YAxis tickFormatter={(val) => isPrivacyActive(settings) ? '•••' : (val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}k` : val)} />
                <Tooltip content={<PremiumTooltip settings={settings} />} cursor={{ fill: 'rgba(20, 184, 166, 0.08)' }} />
                <Bar dataKey="netWorth" name="Net Worth" fill="#14b8a6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </Chart>
          ) : (
            <div className="chart-card">
              <div className="chart-head"><h3>Net Worth Over Time</h3><div className="chart-period-toggle">{networthToggle}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '260px', color: '#94a3b8' }}>
                No snapshot data yet. Use History &gt; Take Snapshot to start tracking performance.
              </div>
            </div>
          ),
          asset_chart: assetChartData.length > 0 ? (
            <Chart title="Asset Allocation" className="asset-allocation-chart" height={320}>
              <PieChart>
                <defs>
                  {COLORS.map((color, i) => (
                    <radialGradient key={`assetGrad-${i}`} id={`assetGrad-${i}`} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={color} stopOpacity={1} />
                      <stop offset="92%" stopColor={color} stopOpacity={0.72} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.45} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie
                  data={assetChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={100}
                  paddingAngle={assetChartData.length > 1 ? 4 : 0}
                  cornerRadius={6}
                  labelLine={false}
                  style={{ pointerEvents: 'none' }}
                  label={({ cx, cy, midAngle, outerRadius, name, value, percent }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = outerRadius + 20;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    const sx = cx + (outerRadius + 4) * Math.cos(-midAngle * RADIAN);
                    const sy = cy + (outerRadius + 4) * Math.sin(-midAngle * RADIAN);
                    const textAnchor = x > cx ? 'start' : 'end';
                    const p = (percent * 100).toFixed(1);
                    const colorIndex = assetChartData.findIndex(e => e.name === name) % COLORS.length;
                    const color = COLORS[colorIndex];
                    return (
                      <g className="pie-label-group">
                        <polyline className="pie-connector" points={`${sx},${sy} ${x},${y}`} stroke={color} />
                        <text className="pie-label-text" x={x + (x > cx ? 6 : -6)} y={y - 4} textAnchor={textAnchor}>
                          {name}
                        </text>
                        <text className="pie-label-value" x={x + (x > cx ? 6 : -6)} y={y + 14} textAnchor={textAnchor}>
                          {money(value, settings)} ({p}%)
                        </text>
                      </g>
                    );
                  }}
                >
                  {assetChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#assetGrad-${index % COLORS.length})`} stroke="transparent" />
                  ))}
                </Pie>
              </PieChart>
            </Chart>
          ) : (
            <div className="chart-card asset-allocation-chart">
              <div className="chart-head"><h3>Asset Allocation</h3></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '320px', color: '#94a3b8' }}>
                No assets or investments added yet.
              </div>
            </div>
          ),
          cashflow_chart: cashflowChart.length > 0 ? (
            <Chart title="Income vs. Expenses" controls={cashflowToggle}>
              <BarChart data={cashflowChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tickFormatter={(val) => formatDate(val, settings)} />
                <YAxis tickFormatter={(val) => isPrivacyActive(settings) ? '•••' : (val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}k` : val)} />
                <Tooltip content={<PremiumTooltip settings={settings} />} cursor={{ fill: 'rgba(20, 184, 166, 0.08)' }} />
                <Bar dataKey="Income" fill="#10b981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="Expenses" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </Chart>
          ) : (
            <div className="chart-card">
              <div className="chart-head"><h3>Income vs. Expenses</h3><div className="chart-period-toggle">{cashflowToggle}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '260px', color: '#94a3b8' }}>
                No cash flow snapshot data yet.
              </div>
            </div>
          ),
          investment_chart: investmentPerformanceChartData.length > 0 ? (
            <Chart title="Investment Performance" controls={investmentToggle}>
              <BarChart data={investmentPerformanceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="category" />
                <YAxis tickFormatter={(val) => isPrivacyActive(settings) ? '•••' : (val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}k` : val)} />
                <Tooltip content={<PremiumTooltip settings={settings} />} cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }} />
                <Bar dataKey="invested_amount" fill="#64748b" name="Invested" radius={[8, 8, 0, 0]} />
                <Bar dataKey="current_value" fill="#8b5cf6" name="Current Value" radius={[8, 8, 0, 0]} />
              </BarChart>
            </Chart>
          ) : (
            <div className="chart-card">
              <div className="chart-head"><h3>Investment Performance</h3><div className="chart-period-toggle">{investmentToggle}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '260px', color: '#94a3b8' }}>
                No investment data yet.
              </div>
            </div>
          ),
          recent_transactions: <RecentCashFlow rows={data.cashflow.slice(0, 8)} settings={settings} onEdit={setEditingTx} onDelete={handleDeleteTx} />
        };

        const defaultLayout = ['stats', 'breakdown', 'goals', 'networth_chart', 'asset_chart', 'cashflow_chart', 'investment_chart', 'recent_transactions'];
        let currentLayout = [...defaultLayout];
        try { if (settings.dashboard_layout) currentLayout = JSON.parse(settings.dashboard_layout); } catch(e) {}
        
        // Ensure breakdown is ALWAYS right after stats (visually it drops down from the cards)
        currentLayout = currentLayout.filter(k => k !== 'breakdown');
        const statsIdx = currentLayout.indexOf('stats');
        if (statsIdx !== -1) {
          currentLayout.splice(statsIdx + 1, 0, 'breakdown');
        } else {
          currentLayout.unshift('breakdown');
        }
        
        // Backfill any other missing widgets
        const activeSet = new Set(currentLayout);
        defaultLayout.forEach(k => { if (!activeSet.has(k)) currentLayout.push(k); });

        const result = [];
        let chartBuffer = [];
        
        const flushCharts = () => {
          if (chartBuffer.length > 0) {
            result.push(<div key={`charts-${result.length}`} className="charts">{chartBuffer}</div>);
            chartBuffer = [];
          }
        };

        currentLayout.forEach(item => {
          if (renders[item]) {
            if (item.endsWith('_chart')) {
              chartBuffer.push(<React.Fragment key={item}>{renders[item]}</React.Fragment>);
            } else {
              flushCharts();
              result.push(<React.Fragment key={item}>{renders[item]}</React.Fragment>);
            }
          }
        });
        flushCharts();
        
        return result;
      })()}

      {quickType && (
        <Modal
          title={`Quick Add ${quickType}`}
          fields={quickFields}
          initial={quickForm}
          onCancel={() => { setQuickType(''); setQuickForm({}); }}
          onSave={quickAdd}
        />
      )}
      {editingTx && (
        <TransactionModal
          initial={editingTx}
          assets={data.assets}
          categories={categories}
          settings={settings}
          onCancel={() => setEditingTx(null)}
          onSave={async (form) => {
            if (form.id) {
              await api(`/cashflow/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
            } else {
              await api('/cashflow', { method: 'POST', body: JSON.stringify(form) });
            }
            setEditingTx(null);
            await load();
          }}
        />
      )}
      {snapshotReport && <ReportModal title="Snapshot Report" reportText={snapshotReport} onCancel={() => setSnapshotReport(null)} />}
    </section>
  );
}

function Settings({ settings, setSettings, categories, setCategories, onLogout }) {
  const [activeTab, setActiveTab] = useState('general');
  const [catType, setCatType] = useState('asset');
  const [newCat, setNewCat] = useState('');
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('server_url') || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fetchingRates, setFetchingRates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.onUpdateStatus) {
      return window.electronAPI.onUpdateStatus((info) => {
        setUpdateStatus(info);
        setCheckingUpdate(false);
      });
    }
  }, []);

  async function fetchLiveRates() {
    setFetchingRates(true);
    try {
      const [assets, liabilities, investments] = await Promise.all([api('/assets'), api('/liabilities'), api('/investments')]);
      const currencies = new Set();
      assets.forEach(a => { if (a.currency && a.currency !== settings.currency) currencies.add(a.currency) });
      liabilities.forEach(l => { if (l.currency && l.currency !== settings.currency) currencies.add(l.currency) });
      investments.forEach(i => { if (i.currency && i.currency !== settings.currency) currencies.add(i.currency) });
      
      const symbols = Array.from(currencies).join(',');
      if (!symbols) {
        alert("No foreign currencies found in your assets, liabilities, or investments!");
        setFetchingRates(false);
        return;
      }
      
      const rates = await api(`/settings/live-rates?base=${settings.currency}&symbols=${symbols}`);
      
      let currentRates = {};
      try { currentRates = JSON.parse(settings.exchange_rates || '{}'); } catch(e) {}
      
      const newRates = { ...currentRates, ...rates };
      const newRatesJson = JSON.stringify(newRates, null, 2);
      setSettings({ ...settings, exchange_rates: newRatesJson });
      
    } catch (e) {
      alert("Failed to fetch live rates: " + e.message);
    }
    setFetchingRates(false);
  }

  async function saveSettings() {
    setError('');
    setSaving(true);
    setSaveSuccess(false);
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ ...settings, categories }) });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function addCategory() {
    if (!newCat.trim()) return;
    setCategories({ ...categories, [catType]: [...(categories[catType] || []), newCat.trim()] });
    setNewCat('');
  }

  function removeCategory(type, idx) {
    if (confirm(`Are you sure you want to delete this ${type} category?`)) {
      const updated = [...(categories[type] || [])];
      updated.splice(idx, 1);
      setCategories({ ...categories, [type]: updated });
    }
  }

  return (
    <section className="page settings-page">
      <div className="page-head">
        <h1>Settings</h1>
        <button 
          onClick={saveSettings} 
          disabled={saving}
          style={saveSuccess ? { backgroundColor: '#10b981', borderColor: '#10b981', color: '#fff', transform: 'scale(1.05)', transition: 'all 0.3s ease' } : { transition: 'all 0.3s ease' }}
        >
          {saving ? 'Saving...' : saveSuccess ? '✓ Saved Successfully' : 'Save Settings'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="settings-tabs">
        {['general', 'dashboard_layout', 'categories', 'exchange_rates', 'cloud_backups'].map(t => (
          <button key={t} className={`pill ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <>
          <div className="settings-grid">
            <div style={{ gridColumn: 'span 2', padding: '14px 18px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '10px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc', fontSize: '14px' }}>
                  {settings.privacy_mode ? <EyeOffIcon size={16} color="#f87171" /> : <EyeIcon size={16} color="#14b8a6" />}
                  Privacy Mode
                </strong>
                <span style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  Mask financial balances, net worth, and transaction amounts with ••••••
                </span>
              </div>
              <button
                type="button"
                className={`privacy-btn ${settings.privacy_mode ? 'privacy-active' : ''}`}
                onClick={settings.togglePrivacy}
              >
                {settings.privacy_mode ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                <span>{settings.privacy_mode ? 'Masked' : 'Visible'}</span>
              </button>
            </div>
            <label>Currency
              <select value={settings.currency || 'INR'} onChange={e => setSettings({ ...settings, currency: e.target.value })}>
                {Object.keys(CURRENCIES).map(c => <option key={c} value={c}>{c} ({CURRENCIES[c]})</option>)}
              </select>
            </label>
            <label>Date Format
              <select value={settings.date_format || DATE_FORMATS[0]} onChange={e => setSettings({ ...settings, date_format: e.target.value })}>
                {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>Server / API URL (For Android Mobile App & Remote Sync)
              <input
                type="text"
                placeholder="e.g. http://192.168.1.5:3001 or https://your-server.com (Leave blank for local desktop)"
                value={serverUrl}
                onChange={e => {
                  setServerUrl(e.target.value);
                  if (e.target.value.trim()) localStorage.setItem('server_url', e.target.value.trim());
                  else localStorage.removeItem('server_url');
                }}
              />
              <small style={{ color: '#64748b', marginTop: '4px', display: 'block' }}>
                On your Android phone, enter your PC's IP or cloud server URL here so your phone syncs with this system.
              </small>
            </label>
          </div>
          
          <div className="app-info-section" style={{ marginTop: '40px', padding: '25px', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              About NetWorth Tracker
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
              <div>
                <h4 style={{ color: '#94a3b8', marginBottom: '10px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Core Features</h4>
                <ul style={{ paddingLeft: '20px', margin: 0, color: '#e2e8f0', lineHeight: '1.6', fontSize: '15px' }}>
                  <li>Comprehensive Dashboard & Net Worth Tracking</li>
                  <li>Multi-Currency Asset & Liability Management</li>
                  <li>Monthly Cashflow & Budget Analysis</li>
                  <li>Investment Portfolio Tracking with Live Prices</li>
                  <li>Financial Independence (FIRE) & Debt Planners</li>
                  <li>Subscription Management & Reminders</li>
                  <li>Secure Local Database & Background Auto-Updates</li>
                </ul>
              </div>
              
              <div>
                <h4 style={{ color: '#94a3b8', marginBottom: '10px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Message from the Developer</h4>
                <div style={{ padding: '15px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', borderLeft: '4px solid #10b981', color: '#e2e8f0', fontStyle: 'italic', lineHeight: '1.6', fontSize: '15px' }}>
                  "Thank you for using NetWorth Tracker! This tool was built with privacy and financial empowerment in mind. Your financial data stays 100% locally on your machine. I hope this application helps you take full control of your financial journey and achieve your goals. Happy tracking!"
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
              <div style={{ color: '#64748b', fontSize: '13px' }}>
                Version 2.4.2 • Built with ❤️
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {updateStatus?.status === 'downloaded' && (
                  <button 
                    style={{ background: '#10b981', color: '#fff', fontSize: '13px', padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold' }}
                    onClick={() => window.electronAPI?.restartAndInstall()}
                  >
                    Update Ready! Restart Now
                  </button>
                )}
                {updateStatus?.status === 'downloading' && (
                  <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 'bold' }}>
                    Downloading update ({updateStatus.percent || 0}%)...
                  </span>
                )}
                {updateStatus?.status === 'available' && (
                  <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 'bold' }}>
                    New update found (v{updateStatus.version})! Downloading...
                  </span>
                )}
                {updateStatus?.status === 'latest' && (
                  <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 'bold' }}>
                    ✓ You are on the latest version
                  </span>
                )}
                {updateStatus?.status === 'error' && (
                  <span style={{ color: '#ef4444', fontSize: '13px' }}>
                    Check failed: {updateStatus.error || 'Server error'}
                  </span>
                )}
                <button 
                  className="secondary" 
                  style={{ fontSize: '13px', padding: '6px 12px' }}
                  disabled={checkingUpdate || updateStatus?.status === 'downloading'}
                  onClick={async () => {
                    if (!window.electronAPI?.checkForUpdates) {
                      alert('Manual update checks are only available inside the installed desktop application.');
                      return;
                    }
                    setCheckingUpdate(true);
                    setUpdateStatus({ status: 'checking' });
                    try {
                      await window.electronAPI.checkForUpdates();
                    } catch (e) {
                      setUpdateStatus({ status: 'error', error: e.message });
                    } finally {
                      setCheckingUpdate(false);
                    }
                  }}
                >
                  {checkingUpdate || updateStatus?.status === 'checking' ? 'Checking...' : 'Check for Updates'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'cloud_backups' && (
        <div className="settings-grid" style={{ gridTemplateColumns: '1fr', gap: '20px' }}>
          <h3>Cloud Integrations</h3>
          <p className="muted">Connect your Google Drive or Dropbox to safely backup your database.</p>
          
          <div className="card" style={{ padding: '20px' }}>
            <h4>Google Drive</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
              <label>Client ID
                <input type="text" value={settings.gdrive_client_id || ''} onChange={e => setSettings({ ...settings, gdrive_client_id: e.target.value })} placeholder="Enter Google Client ID" />
              </label>
              <label>Client Secret
                <input type="password" value={settings.gdrive_client_secret || ''} onChange={e => setSettings({ ...settings, gdrive_client_secret: e.target.value })} placeholder="Enter Google Client Secret" />
              </label>
            </div>
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="secondary" onClick={async () => {
                await saveSettings();
                const res = await api('/backup/auth/google');
                if (res.url) window.open(res.url, '_blank');
              }}>Connect Google Drive</button>
              {settings.gdrive_refresh_token && (
                <>
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Connected</span>
                  <button onClick={async () => {
                    const res = await api('/backup/upload/google', { method: 'POST' });
                    if (res.success) alert('Backup successful! Database backed up to Google Drive.');
                  }}>Backup Now</button>
                  <button className="secondary" onClick={async () => {
                    if (window.confirm('Restore latest backup from Google Drive? This will safely snapshot your current database and replace it with the latest cloud backup.')) {
                      try {
                        const res = await api('/backup/restore/google', { method: 'POST' });
                        if (res.success) {
                          alert(`Restored successfully from ${res.restoredFile}! Reloading...`);
                          window.location.reload();
                        }
                      } catch (err) {
                        alert(`Restore failed: ${err.message}`);
                      }
                    }
                  }}>Restore Latest</button>
                  <button className="danger" onClick={async () => {
                    await api('/backup/disconnect/google', { method: 'POST' });
                    setSettings({ ...settings, gdrive_refresh_token: null });
                  }}>Disconnect</button>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <h4>Dropbox</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
              <label>Client ID
                <input type="text" value={settings.dropbox_client_id || ''} onChange={e => setSettings({ ...settings, dropbox_client_id: e.target.value })} placeholder="Enter Dropbox Client ID" />
              </label>
              <label>Client Secret
                <input type="password" value={settings.dropbox_client_secret || ''} onChange={e => setSettings({ ...settings, dropbox_client_secret: e.target.value })} placeholder="Enter Dropbox Client Secret" />
              </label>
            </div>
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="secondary" onClick={async () => {
                await saveSettings();
                const res = await api('/backup/auth/dropbox');
                if (res.url) window.open(res.url, '_blank');
              }}>Connect Dropbox</button>
              {settings.dropbox_refresh_token && (
                <>
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Connected</span>
                  <button onClick={async () => {
                    const res = await api('/backup/upload/dropbox', { method: 'POST' });
                    if (res.success) alert('Backup successful! Path: ' + res.path);
                  }}>Backup Now</button>
                  <button className="secondary" onClick={async () => {
                    if (window.confirm('Restore latest backup from Dropbox? This will safely snapshot your current database and replace it with the latest cloud backup.')) {
                      try {
                        const res = await api('/backup/restore/dropbox', { method: 'POST' });
                        if (res.success) {
                          alert(`Restored successfully from ${res.restoredFile}! Reloading...`);
                          window.location.reload();
                        }
                      } catch (err) {
                        alert(`Restore failed: ${err.message}`);
                      }
                    }
                  }}>Restore Latest</button>
                  <button className="danger" onClick={async () => {
                    await api('/backup/disconnect/dropbox', { method: 'POST' });
                    setSettings({ ...settings, dropbox_refresh_token: null });
                  }}>Disconnect</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="categories-manager">
          <div className="cat-type-pills">
            {[
              { id: 'asset', label: 'Asset' },
              { id: 'liability', label: 'Liability' },
              { id: 'income', label: 'Income' },
              { id: 'expense', label: 'Expense' },
              { id: 'investment', label: 'Investment' },
              { id: 'transfer', label: 'Transfer (Cashflow)' }
            ].map(t => (
              <button key={t.id} className={`pill ${catType === t.id ? 'active' : ''}`} onClick={() => setCatType(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="cat-list">
            {(categories[catType] || []).map((cat, i) => (
              <div key={i} className="cat-row">
                <span>{cat}</span>
                <button className="danger" onClick={() => removeCategory(catType, i)}>Remove</button>
              </div>
            ))}
          </div>

          <div className="cat-add">
            <input placeholder={`New ${catType} category`} value={newCat} onChange={e => setNewCat(e.target.value)} />
            <button onClick={addCategory}>Add</button>
          </div>
        </div>
      )}

      {activeTab === 'dashboard_layout' && (
        <div className="dashboard-layout-manager">
          <p className="muted" style={{ marginBottom: '15px' }}>Arrange the order of widgets on your Dashboard. Use Up/Down arrows to reorder.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '400px' }}>
            {(() => {
              const defaultLayout = ['stats', 'breakdown', 'goals', 'networth_chart', 'asset_chart', 'cashflow_chart', 'investment_chart', 'recent_transactions'];
              let currentLayout = defaultLayout;
              try { if (settings.dashboard_layout) currentLayout = JSON.parse(settings.dashboard_layout); } catch(e) {}
              // ensure no missing keys
              const activeSet = new Set(currentLayout);
              defaultLayout.forEach(k => { if (!activeSet.has(k)) currentLayout.push(k); });
              
              const move = (idx, dir) => {
                const newLayout = [...currentLayout];
                const tmp = newLayout[idx];
                newLayout[idx] = newLayout[idx + dir];
                newLayout[idx + dir] = tmp;
                setSettings({ ...settings, dashboard_layout: JSON.stringify(newLayout) });
              };
              
              return currentLayout.map((key, idx) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                  <span style={{ textTransform: 'capitalize' }}>{key.replace('_', ' ')}</span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button className="secondary" disabled={idx === 0} onClick={() => move(idx, -1)} style={{ padding: '4px 8px' }}>↑</button>
                    <button className="secondary" disabled={idx === currentLayout.length - 1} onClick={() => move(idx, 1)} style={{ padding: '4px 8px' }}>↓</button>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {activeTab === 'exchange_rates' && (
        <div className="settings-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label>Exchange Rates (JSON)
            <p className="muted" style={{ marginBottom: '8px' }}>
              Define manual exchange rates against your Base Currency ({settings.currency}). 
              <br/>Example: if Base is USD and you own INR assets: <code>{`{"INR": 0.012}`}</code>
            </p>
            <textarea 
              rows={5}
              value={settings.exchange_rates || '{}'} 
              onChange={e => setSettings({ ...settings, exchange_rates: e.target.value })}
              style={{ fontFamily: 'monospace' }}
            />
            <button 
              type="button" 
              className="secondary" 
              style={{ marginTop: '10px' }}
              onClick={fetchLiveRates}
              disabled={fetchingRates}
            >
              {fetchingRates ? 'Fetching...' : 'Auto-Fetch Live Rates (Yahoo Finance)'}
            </button>
          </label>
        </div>
      )}

      <div className="logout-section">
        <button className="danger" onClick={onLogout}>Logout</button>
      </div>
    </section>
  );
}

function History({ settings }) {
  const [snapshots, setSnapshots] = useState([]);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState('');
  const [snapshotReport, setSnapshotReport] = useState(null);

  async function load() {
    const snaps = await api('/snapshots?period=monthly');
    setSnapshots(snaps || []);
  }

  useEffect(() => { load(); }, []);

  async function takeSnapshot() {
    setError('');
    setTaking(true);
    try {
      const snap = await api('/snapshots', { method: 'POST' });
      await load();
      const text = `Snapshot Report - ${new Date().toLocaleString()}
-----------------------------------
Net Worth:          ${money(snap.net_worth, settings)}
Total Assets:       ${money(snap.total_assets, settings)}
Total Liabilities:  ${money(snap.total_liabilities, settings)}
Monthly Cash Flow:  ${money(snap.monthly_income - snap.monthly_expenses, settings)}
Investments:        ${money(snap.investment_value, settings)}
Investment P&L:     ${money(snap.investment_pnl, settings)}
-----------------------------------`;
      setSnapshotReport(text);
    } catch (err) { setError(err.message); }
    finally { setTaking(false); }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h1>Snapshot History</h1>
        <button onClick={takeSnapshot} disabled={taking}>{taking ? 'Taking...' : 'Take Snapshot'}</button>
      </div>
      {error && <div className="error">{error}</div>}

      <Table
        columns={[
          { key: 'snapshot_date', label: 'Date', render: (r) => formatDate(r.snapshot_date, settings) },
          { key: 'net_worth', label: 'Net Worth', render: (r) => money(r.net_worth, settings) },
          { key: 'total_assets', label: 'Assets', render: (r) => money(r.total_assets, settings) },
          { key: 'total_liabilities', label: 'Liabilities', render: (r) => money(r.total_liabilities, settings) },
          { key: 'monthly_income', label: 'Monthly Income', render: (r) => money(r.monthly_income || 0, settings) },
          { key: 'monthly_expenses', label: 'Monthly Expenses', render: (r) => money(r.monthly_expenses || 0, settings) },
        ]}
        rows={snapshots}
        onDelete={async (id) => { if (confirm('Are you sure you want to delete this snapshot?')) { await api(`/snapshots/${id}`, { method: 'DELETE' }); await load(); } }}
      />
      {snapshotReport && <ReportModal title="Snapshot Report" reportText={snapshotReport} onCancel={() => setSnapshotReport(null)} />}
    </section>
  );
}

function PortfolioTracker({ settings, categories }) {
  const [rows, setRows] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [updatingPrice, setUpdatingPrice] = useState(null);
  const [receiveInterestModal, setReceiveInterestModal] = useState(null);
  const [error, setError] = useState('');
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [expandedAsset, setExpandedAsset] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [currencyView, setCurrencyView] = useState(() => localStorage.getItem('portfolio_currency_view') || 'inr');

  async function syncPrices() {
    setSyncing(true);
    try {
      const result = await api('/investments/sync-prices', { method: 'POST' });
      if (result.updated > 0) {
        await load();
      }
      alert(result.message + ` (${result.updated} assets updated)`);
    } catch (err) {
      alert('Failed to sync prices: ' + err.message);
    }
    setSyncing(false);
  }

  async function load() {
    try {
      const [data, assetList] = await Promise.all([
        api('/investments'),
        api('/assets').catch(() => [])
      ]);
      setRows(data || []);
      setBankAccounts(assetList || []);
    } catch (err) {
      setError('Failed to load portfolio.');
    }
  }

  useEffect(() => { load(); }, []);

  async function save(form) {
    const payload = { ...form };
    if (isFdorRd(payload.category)) {
      payload.quantity = 1;
      payload.ticker = '';
      if (!payload.current_price && payload.buy_price) {
        payload.current_price = payload.buy_price;
      }
      if (payload.receiving_account_id) {
        const match = bankAccounts.find(b => String(b.id) === String(payload.receiving_account_id));
        if (match) payload.receiving_account_name = match.name;
      }
    } else if (isBond(payload.category)) {
      payload.ticker = '';
      if (!payload.quantity || Number(payload.quantity) <= 0) {
        payload.quantity = 1;
      }
      if (!payload.current_price && payload.buy_price) {
        payload.current_price = payload.buy_price;
      }
      if (payload.receiving_account_id) {
        const match = bankAccounts.find(b => String(b.id) === String(payload.receiving_account_id));
        if (match) payload.receiving_account_name = match.name;
      }
    }
    if (form.id) await api(`/investments/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/investments', { method: 'POST', body: JSON.stringify(payload) });
    setEditing(null);
    await load();
    setGraphRefresh((value) => value + 1);
  }

  async function remove(id) {
    if (confirm('Delete this investment lot?')) {
      try {
        await api(`/investments/${id}`, { method: 'DELETE' });
        await load();
        setGraphRefresh((value) => value + 1);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  const grouped = {};
  for (const r of rows) {
    const key = r.asset_name + '_' + (r.currency || '');
    if (!grouped[key]) {
      grouped[key] = {
        asset_name: r.asset_name,
        category: r.category,
        currency: r.currency,
        total_quantity: 0,
        total_invested: 0,
        current_price: Number(r.current_price || 0),
        lots: []
      };
    }
    grouped[key].lots.push(r);
    grouped[key].total_quantity += Number(r.quantity || 1);
    grouped[key].total_invested += Number(r.buy_price || 0) * Number(r.quantity || 1);
  }

  const portfolio = Object.values(grouped).map(g => {
    g.avg_buy_price = g.total_quantity > 0 ? (g.total_invested / g.total_quantity) : 0;
    g.current_value = g.current_price * g.total_quantity;
    g.pnl = g.current_value - g.total_invested;
    g.pnl_percent = g.total_invested > 0 ? (g.pnl / g.total_invested) * 100 : 0;
    return g;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pageSize, setPageSize] = useState(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('portfolio_page_size') || localStorage.getItem('preferred_page_size')) : null;
    return saved === 'all' ? 'all' : (saved ? Number(saved) : 10);
  });
  const [currentPage, setCurrentPage] = useState(1);

  const availableCategories = useMemo(() => {
    const cats = new Set();
    portfolio.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [portfolio]);

  const filteredPortfolio = useMemo(() => {
    return portfolio.filter(p => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (p.asset_name || '').toLowerCase().includes(q);
        const matchCat = (p.category || '').toLowerCase().includes(q);
        const matchCurr = (p.currency || '').toLowerCase().includes(q);
        const matchLots = (p.lots || []).some(l =>
          (l.platform || '').toLowerCase().includes(q) ||
          (l.ticker || '').toLowerCase().includes(q) ||
          (l.notes || '').toLowerCase().includes(q) ||
          (l.tenure || '').toLowerCase().includes(q) ||
          (l.receiving_account_name || '').toLowerCase().includes(q)
        );
        if (!matchName && !matchCat && !matchCurr && !matchLots) return false;
      }
      return true;
    });
  }, [portfolio, categoryFilter, searchTerm]);

  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? filteredPortfolio.length : Number(pageSize || 10);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(filteredPortfolio.length / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedPortfolio = useMemo(() => {
    if (isAll) return filteredPortfolio;
    const start = (safeCurrentPage - 1) * effectivePageSize;
    return filteredPortfolio.slice(start, start + effectivePageSize);
  }, [filteredPortfolio, isAll, safeCurrentPage, effectivePageSize]);

  const bankAccountOptions = (bankAccounts || []).map(b => ({
    value: b.id,
    label: `${b.name} (${money(b.current_value, settings)})`
  }));

  const fields = [
    {
      name: 'asset_name',
      label: (form) => isRd(form?.category) ? 'Recurring Deposit Name' : isFd(form?.category) ? 'Fixed Deposit Name' : isBond(form?.category) ? 'Bond / Debenture Name' : 'Asset Name',
      placeholder: (form) => isRd(form?.category) ? 'e.g. SBI Monthly RD, ICICI RD' : isFd(form?.category) ? 'e.g. HDFC 1-Year FD, SBI FD' : isBond(form?.category) ? 'e.g. Sindhuja Microcredit, GOI Bond 7.18%, Tata Capital NCD' : 'e.g. Apple, Bitcoin, Reliance'
    },
    { name: 'category', label: 'Category', type: 'select', options: categories.investment },
    {
      name: 'platform',
      label: (form) => isFdorRd(form?.category) ? 'Bank / Institution' : isBond(form?.category) ? 'Platform / Broker' : 'Platform',
      placeholder: (form) => isFdorRd(form?.category) ? 'e.g. HDFC Bank, SBI, ICICI' : isBond(form?.category) ? 'e.g. Wint Wealth, Zerodha, Grip Invest' : 'e.g. Zerodha, Binance'
    },
    {
      name: 'quantity',
      label: (form) => isBond(form?.category) ? 'Units' : 'Quantity',
      placeholder: (form) => isBond(form?.category) ? 'e.g. 10' : 'e.g. 5',
      type: 'number',
      condition: (form) => !isFdorRd(form?.category)
    },
    {
      name: 'buy_price',
      label: (form) => isRd(form?.category)
        ? `Monthly Deposit / Installment (${settings?.currency_symbol || '₹'})`
        : isFd(form?.category)
          ? `Principal / Deposit Amount (${settings?.currency_symbol || '₹'})`
          : isBond(form?.category)
            ? `Price per Unit / Face Value (${settings?.currency_symbol || '₹'})`
            : 'Buy Price',
      type: 'number'
    },
    {
      name: 'current_price',
      label: (form) => isFdorRd(form?.category)
        ? `Current / Maturity Value (${settings?.currency_symbol || '₹'})`
        : isBond(form?.category)
          ? `Current Price per Unit (${settings?.currency_symbol || '₹'})`
          : 'Current Price',
      type: 'number'
    },
    {
      name: 'ticker',
      label: 'Ticker Symbol (Yahoo Finance)',
      placeholder: 'e.g. RELIANCE.NS, AAPL',
      condition: (form) => !isFdorRd(form?.category) && !isBond(form?.category)
    },
    {
      name: 'interest_rate',
      label: (form) => isBond(form?.category) ? 'Interest / Coupon Rate (%)' : 'Interest Rate (%)',
      type: 'number',
      placeholder: (form) => isBond(form?.category) ? 'e.g. 9.5' : 'e.g. 7.5',
      condition: (form) => isFdorRd(form?.category) || isBond(form?.category)
    },
    {
      name: 'buy_date',
      label: (form) => isRd(form?.category) ? 'Start / Deposit Date' : isFd(form?.category) ? 'Deposit Date' : isBond(form?.category) ? 'Investment / Purchase Date' : 'Buy Date',
      type: 'date'
    },
    {
      name: 'tenure',
      label: 'Tenure',
      placeholder: (form) => isRd(form?.category) ? 'e.g. 12 Months, 24 Months, 2 Years' : isBond(form?.category) ? 'e.g. 2 Years, 36 Months' : 'e.g. 1 Year, 18 Months, 555 Days',
      condition: (form) => isFdorRd(form?.category) || isBond(form?.category)
    },
    {
      name: 'maturity_date',
      label: 'Maturity Date',
      type: 'date',
      condition: (form) => isFdorRd(form?.category) || isBond(form?.category)
    },
    {
      name: 'payout_frequency',
      label: 'Interest Payout Option',
      type: 'select',
      options: ['Payment on Maturity', 'Monthly Payout', 'Quarterly Payout', 'Half-Yearly Payout', 'Annual Payout'],
      condition: (form) => isFdorRd(form?.category) || isBond(form?.category)
    },
    {
      name: 'receiving_account_id',
      label: 'Receiving Bank Account (Interest & Maturity)',
      type: 'select',
      options: bankAccountOptions,
      condition: (form) => isFdorRd(form?.category) || isBond(form?.category)
    },
    { name: 'currency', label: 'Currency', type: 'select', options: Object.keys(CURRENCIES) },
    {
      name: 'is_sip',
      label: (form) => isRd(form?.category) ? 'Monthly Recurring Installment (RD)' : 'Is SIP?',
      type: 'checkbox',
      condition: (form) => (isRd(form?.category) || !isFdorRd(form?.category)) && !isBond(form?.category)
    },
    { name: 'notes', label: 'Notes' }
  ];

  const performanceConfig = {
    title: 'Portfolio Value',
    type: 'line',
    series: [{ key: 'investment_value', label: 'Total Value', color: '#6366f1', getValue: (r) => convertValue(Number(r.current_value || (Number(r.current_price || 0) * Number(r.quantity || 0))), r.currency, settings) }],
    currentValues: (rws) => ({ investment_value: rws.reduce((sum, r) => sum + convertValue(Number(r.current_price || 0) * Number(r.quantity || 0), r.currency, settings), 0) })
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>Portfolio Manager</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="secondary" onClick={syncPrices} disabled={syncing}>{syncing ? 'Syncing...' : 'Auto-Fetch Prices'}</button>
          <button onClick={() => setEditing({})}>Add Investment</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      
      <CrudSummary title="Portfolio" rows={rows} settings={settings} />
      <PerformanceGraph config={performanceConfig} settings={settings} refreshKey={graphRefresh} liveRows={rows} />
      
      <div className="card" style={{ marginTop: '20px', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #1e293b', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Holdings</h3>
            <span className="badge" style={{ background: '#1e293b', color: '#94a3b8', fontSize: '12px', padding: '2px 8px', borderRadius: '12px' }}>
              {filteredPortfolio.length} {filteredPortfolio.length === 1 ? 'asset' : 'assets'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Display Currency:</span>
            <div style={{ display: 'inline-flex', background: '#020617', border: '1px solid #334155', borderRadius: '8px', padding: '2px', gap: '2px' }}>
              <button
                type="button"
                onClick={() => { setCurrencyView('inr'); localStorage.setItem('portfolio_currency_view', 'inr'); }}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: currencyView === 'inr' ? 'linear-gradient(135deg, #14b8a6, #0d9488)' : 'transparent',
                  color: currencyView === 'inr' ? '#fff' : '#94a3b8',
                  fontWeight: currencyView === 'inr' ? '700' : '400'
                }}
              >
                🇮🇳 Actual INR (Base)
              </button>
              <button
                type="button"
                onClick={() => { setCurrencyView('native'); localStorage.setItem('portfolio_currency_view', 'native'); }}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: currencyView === 'native' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'transparent',
                  color: currencyView === 'native' ? '#fff' : '#94a3b8',
                  fontWeight: currencyView === 'native' ? '700' : '400'
                }}
              >
                🌐 Native Currency
              </button>
            </div>
          </div>
        </div>
        <TableFilterBar
          searchTerm={searchTerm}
          onSearchChange={val => { setSearchTerm(val); setCurrentPage(1); }}
          searchPlaceholder="🔍 Search holdings, tickers, platforms..."
          categoryFilter={categoryFilter}
          onCategoryChange={val => { setCategoryFilter(val); setCurrentPage(1); }}
          categories={availableCategories}
          pageSize={pageSize}
          onPageSizeChange={val => {
            setPageSize(val);
            if (typeof window !== 'undefined') {
              localStorage.setItem('portfolio_page_size', String(val));
              localStorage.setItem('preferred_page_size', String(val));
            }
            setCurrentPage(1);
          }}
        />
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Asset Name</th>
                <th style={{ textAlign: 'left' }}>Category</th>
                <th style={{ textAlign: 'right' }}>Total Qty</th>
                <th style={{ textAlign: 'right' }}>Avg Buy Price</th>
                <th style={{ textAlign: 'right' }}>Current Price</th>
                <th style={{ textAlign: 'right' }}>Total Invested</th>
                <th style={{ textAlign: 'right' }}>Current Value</th>
                <th style={{ textAlign: 'right' }}>P&L</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPortfolio.map(p => {
                const stats = getDualCurrencyStats(p, settings);
                const showInrPrimary = currencyView === 'inr' || !stats.hasDual;

                return (
                  <React.Fragment key={p.asset_name + '_' + (p.currency || '')}>
                    <tr 
                      style={{ cursor: 'pointer', borderBottom: '1px solid #1e293b' }} 
                      onClick={() => setExpandedAsset(expandedAsset === p.asset_name + '_' + (p.currency || '') ? null : p.asset_name + '_' + (p.currency || ''))}
                    >
                      <td style={{ fontWeight: 500 }}>
                        <span style={{ display: 'inline-block', width: '20px', color: '#94a3b8' }}>
                          {expandedAsset === p.asset_name + '_' + (p.currency || '') ? '▼' : '▶'}
                        </span>
                        {p.asset_name} {stats.hasDual && <span className="badge" style={{ marginLeft: '6px', fontSize: '11px', background: stats.nativeCurrency === settings?.currency ? '#1e293b' : '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: '4px' }}>{stats.nativeCurrency}</span>}
                      </td>
                      <td><span className="badge" style={{ background: '#334155', color: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{p.category}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {isFdorRd(p.category) ? `${p.lots.length} Deposit${p.lots.length > 1 ? 's' : ''}` : isBond(p.category) ? `${p.total_quantity} Unit${p.total_quantity !== 1 ? 's' : ''}` : p.total_quantity}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div>{money(showInrPrimary ? stats.inrAvgBuy : stats.nativeAvgBuy, showInrPrimary ? settings : { currency: stats.nativeCurrency })}</div>
                        {stats.hasDual && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            {showInrPrimary ? `${money(stats.nativeAvgBuy, { currency: stats.nativeCurrency })} ${stats.nativeCurrency}` : `≈ ${money(stats.inrAvgBuy, settings)}`}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        <div>{money(showInrPrimary ? stats.inrCurrentPrice : stats.nativeCurrentPrice, showInrPrimary ? settings : { currency: stats.nativeCurrency })}</div>
                        {stats.hasDual && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            {showInrPrimary ? `${money(stats.nativeCurrentPrice, { currency: stats.nativeCurrency })} ${stats.nativeCurrency}` : `≈ ${money(stats.inrCurrentPrice, settings)}`}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div>{money(showInrPrimary ? stats.inrInvested : stats.nativeInvested, showInrPrimary ? settings : { currency: stats.nativeCurrency })}</div>
                        {stats.hasDual && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            {showInrPrimary ? `${money(stats.nativeInvested, { currency: stats.nativeCurrency })} ${stats.nativeCurrency}` : `≈ ${money(stats.inrInvested, settings)}`}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        <div style={{ color: showInrPrimary ? '#38bdf8' : '#f8fafc', fontWeight: 600 }}>
                          {money(showInrPrimary ? stats.inrValue : stats.nativeValue, showInrPrimary ? settings : { currency: stats.nativeCurrency })}
                        </div>
                        {stats.hasDual && (
                          <div style={{ fontSize: '11px', color: showInrPrimary ? '#94a3b8' : '#38bdf8', marginTop: '2px', fontWeight: showInrPrimary ? 400 : 600 }}>
                            {showInrPrimary ? `${money(stats.nativeValue, { currency: stats.nativeCurrency })} ${stats.nativeCurrency}` : `≈ ${money(stats.inrValue, settings)}`}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: (showInrPrimary ? stats.inrPnl : stats.nativePnl) >= 0 ? '#10b981' : '#ef4444' }}>
                        {showInrPrimary ? (stats.inrPnl > 0 ? '+' : '') + money(stats.inrPnl, settings) : (stats.nativePnl > 0 ? '+' : '') + money(stats.nativePnl, { currency: stats.nativeCurrency })}
                        {stats.hasDual && (
                          <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>
                            {showInrPrimary ? `${stats.nativePnl > 0 ? '+' : ''}${money(stats.nativePnl, { currency: stats.nativeCurrency })} ${stats.nativeCurrency}` : `≈ ${stats.inrPnl > 0 ? '+' : ''}${money(stats.inrPnl, settings)}`}
                          </div>
                        )}
                        <small style={{ display: 'block' }}>{p.pnl_percent.toFixed(2)}%</small>
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {p.lots.some(l => hasPeriodicPayout(p.category, l.payout_frequency)) && (
                            <button
                              className="icon-btn"
                              style={{
                                width: 'auto',
                                padding: '4px 10px',
                                fontSize: '12px',
                                background: 'linear-gradient(135deg, #059669, #047857)',
                                color: '#fff',
                                border: 'none',
                                fontWeight: 600,
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title="Record interest received"
                              onClick={(e) => {
                                e.stopPropagation();
                                const lotToReceive = p.lots.find(l => hasPeriodicPayout(p.category, l.payout_frequency)) || p.lots[0];
                                setReceiveInterestModal(lotToReceive);
                              }}
                            >
                              💰 Receive Interest
                            </button>
                          )}
                          <button className="icon-btn edit" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} onClick={(e) => {
                            e.stopPropagation();
                            setUpdatingPrice(p);
                          }}>Update Price</button>
                        </div>
                      </td>
                    </tr>
                    
                    {expandedAsset === p.asset_name + '_' + (p.currency || '') && p.lots.map(lot => {
                      const lotStats = getDualCurrencyStats({
                        asset_name: p.asset_name,
                        currency: p.currency,
                        ticker: p.lots[0]?.ticker,
                        avg_buy_price: Number(lot.buy_price || 0),
                        current_price: Number(p.current_price || 0),
                        total_invested: Number(lot.buy_price || 0) * Number(lot.quantity || 1),
                        current_value: Number(p.current_price || 0) * Number(lot.quantity || 1),
                        pnl: (Number(p.current_price || 0) - Number(lot.buy_price || 0)) * Number(lot.quantity || 1)
                      }, settings);

                      return (
                        <tr key={lot.id} style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderBottom: '1px solid #1e293b' }}>
                          <td colSpan="2" style={{ paddingLeft: '40px', color: '#94a3b8', fontSize: '13px' }}>
                            ↳ {formatDate(lot.buy_date, settings)} {lot.is_sip ? '(SIP)' : ''} {lot.platform ? `via ${lot.platform}` : ''}
                            {lot.interest_rate > 0 ? ` • ${lot.interest_rate}% p.a.` : ''}
                            {lot.tenure ? ` • Tenure: ${lot.tenure}` : ''}
                            {lot.maturity_date ? ` • Mat: ${formatDate(lot.maturity_date, settings)}` : ''}
                            {lot.payout_frequency ? ` • ${lot.payout_frequency}` : ''}
                            {lot.receiving_account_name ? ` • To: ${lot.receiving_account_name}` : ''}
                            {lot.last_interest_date ? ` • Last Recv: ${formatDate(lot.last_interest_date, settings)}` : ''}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '13px' }}>
                            {isFdorRd(p.category) ? '-' : isBond(p.category) ? `${lot.quantity} Unit${lot.quantity !== 1 ? 's' : ''}` : lot.quantity}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '13px' }}>
                            <div>{money(showInrPrimary ? lotStats.inrAvgBuy : lotStats.nativeAvgBuy, showInrPrimary ? settings : { currency: lotStats.nativeCurrency })}</div>
                            {lotStats.hasDual && (
                              <div style={{ fontSize: '10px', color: '#64748b' }}>
                                {showInrPrimary ? `${money(lotStats.nativeAvgBuy, { currency: lotStats.nativeCurrency })} ${lotStats.nativeCurrency}` : `≈ ${money(lotStats.inrAvgBuy, settings)}`}
                              </div>
                            )}
                          </td>
                          <td></td>
                          <td style={{ textAlign: 'right', fontSize: '13px' }}>
                            <div>{money(showInrPrimary ? lotStats.inrInvested : lotStats.nativeInvested, showInrPrimary ? settings : { currency: lotStats.nativeCurrency })}</div>
                            {lotStats.hasDual && (
                              <div style={{ fontSize: '10px', color: '#64748b' }}>
                                {showInrPrimary ? `${money(lotStats.nativeInvested, { currency: lotStats.nativeCurrency })} ${lotStats.nativeCurrency}` : `≈ ${money(lotStats.inrInvested, settings)}`}
                              </div>
                            )}
                          </td>
                          <td></td>
                          <td style={{ textAlign: 'right', fontSize: '13px' }}>
                            <div style={{ color: (showInrPrimary ? lotStats.inrPnl : lotStats.nativePnl) >= 0 ? '#10b981' : '#ef4444' }}>
                              {showInrPrimary ? (lotStats.inrPnl > 0 ? '+' : '') + money(lotStats.inrPnl, settings) : (lotStats.nativePnl > 0 ? '+' : '') + money(lotStats.nativePnl, { currency: lotStats.nativeCurrency })}
                            </div>
                            {lotStats.hasDual && (
                              <div style={{ fontSize: '10px', color: '#64748b' }}>
                                {showInrPrimary ? `${lotStats.nativePnl > 0 ? '+' : ''}${money(lotStats.nativePnl, { currency: lotStats.nativeCurrency })} ${lotStats.nativeCurrency}` : `≈ ${stats.inrPnl > 0 ? '+' : ''}${money(lotStats.inrPnl, settings)}`}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {hasPeriodicPayout(p.category, lot.payout_frequency) && (
                                <button
                                  className="icon-btn"
                                  style={{
                                    width: 'auto',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    background: '#059669',
                                    color: '#fff',
                                    border: 'none',
                                    fontWeight: 600,
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                  title="Record periodic interest received"
                                  onClick={() => setReceiveInterestModal(lot)}
                                >
                                  💰 Receive Interest
                                </button>
                              )}
                              <button className="icon-btn edit" onClick={() => setEditing(lot)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                              </button>
                              <button className="icon-btn delete" onClick={() => remove(lot.id)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {paginatedPortfolio.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    {portfolio.length === 0 ? 'No investments found in your portfolio.' : 'No holdings found matching your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          totalRecords={filteredPortfolio.length}
          pageSize={pageSize}
          currentPage={safeCurrentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={val => {
            setPageSize(val);
            if (typeof window !== 'undefined') {
              localStorage.setItem('portfolio_page_size', String(val));
              localStorage.setItem('preferred_page_size', String(val));
            }
            setCurrentPage(1);
          }}
        />
      </div>

      {editing && (
        <Modal 
          title={`${editing.id ? 'Edit' : 'Add'} ${isRd(editing.category) ? 'Recurring Deposit (RD)' : isFd(editing.category) ? 'Fixed Deposit (FD)' : isBond(editing.category) ? 'Bond / Debenture' : 'Investment Lot'}`} 
          fields={fields} 
          initial={editing} 
          onCancel={() => setEditing(null)} 
          onSave={save} 
          settings={settings} 
        />
      )}
      {updatingPrice && (
        <UpdatePriceModal 
          asset={updatingPrice}
          settings={settings}
          onCancel={() => setUpdatingPrice(null)}
          onSave={async (newPrice) => {
            await api(`/investments/${updatingPrice.lots[0].id}`, { method: 'PUT', body: JSON.stringify({ ...updatingPrice.lots[0], current_price: newPrice }) });
            setUpdatingPrice(null);
            await load();
            setGraphRefresh((value) => value + 1);
          }}
        />
      )}
      {receiveInterestModal && (
        <ReceiveInterestModal
          investment={receiveInterestModal}
          bankAccounts={bankAccounts}
          settings={settings}
          onCancel={() => setReceiveInterestModal(null)}
          onSuccess={async (msg) => {
            setReceiveInterestModal(null);
            await load();
            alert(msg);
          }}
        />
      )}
    </section>
  );
}

function Goals({ settings }) {
  const [goals, setGoals] = useState([]);
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState(null);
  const [contribForm, setContribForm] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setGoals(await api('/goals'));
    setAssets(await api('/assets'));
  }
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api(`/goals/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await api('/goals', { method: 'POST', body: JSON.stringify(form) });
      setForm(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function del(id) {
    if (confirm('Delete goal?')) {
      await api(`/goals/${id}`, { method: 'DELETE' });
      load();
    }
  }

  async function contribute(e) {
    e.preventDefault();
    await api(`/goals/${contribForm.goal_id}/contribute`, { method: 'POST', body: JSON.stringify(contribForm) });
    setContribForm(null);
    load();
  }

  return (
    <section className="page">
      <div className="overview-head">
        <div>
          <h1>Savings Goals</h1>
          <p className="muted">Track progress towards your specific financial targets.</p>
        </div>
        <button onClick={() => setForm({ name: '', target_amount: '', current_amount: 0, target_date: '', color: '#14b8a6', icon: '🎯' })}>+ New Goal</button>
      </div>

      <div className="goals-grid">
        {goals.length === 0 ? <p className="muted">No goals yet. Create one to start tracking!</p> : goals.map(g => {
          const pct = Math.min(100, Math.round(((g.current_amount || 0) / g.target_amount) * 100));
          return (
            <div key={g.id} className="goal-card card">
              <div className="goal-head">
                <span className="goal-icon" style={{ background: g.color + '20', color: g.color }}>{g.icon}</span>
                <div className="goal-titles">
                  <h3>{g.name}</h3>
                  <small className="muted">{g.target_date ? `Target: ${formatDate(g.target_date, settings)}` : 'No target date'}</small>
                </div>
                <div className="row-actions">
                  <button onClick={() => setForm(g)}>✏️</button>
                  <button onClick={() => del(g.id)}>🗑️</button>
                </div>
              </div>
              <div className="goal-progress-bar-container">
                <div className="goal-progress-bar-fill" style={{ width: `${pct}%`, background: g.color }} />
              </div>
              <div className="goal-stats">
                <strong>{money(g.current_amount || 0, settings)}</strong>
                <span className="muted">of {money(g.target_amount, settings)}</span>
                <span className="goal-pct" style={{ color: g.color }}>{pct}%</span>
              </div>
              {!g.linked_asset_id && (
                <button className="goal-add-btn" onClick={() => setContribForm({ goal_id: g.id, amount: '' })}>+ Add Funds</button>
              )}
              {g.linked_asset_id && (
                <small className="muted" style={{ display: 'block', marginTop: '10px' }}>Linked to Asset</small>
              )}
            </div>
          );
        })}
      </div>

      {form && (
        <div className="modal-backdrop" onClick={() => { setForm(null); setError(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{form.id ? 'Edit Goal' : 'New Goal'}</h2>
            {error && <div className="error">{error}</div>}
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '18px' }}>
              <label>Goal Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
              <label>Target Amount<input required type="number" step="0.01" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} /></label>
              {!form.linked_asset_id && (
                <label>Current Saved (Optional)<input type="number" step="0.01" value={form.current_amount} onChange={e => setForm({ ...form, current_amount: e.target.value })} /></label>
              )}
              <label>Target Date<input type="date" value={form.target_date || ''} onChange={e => setForm({ ...form, target_date: e.target.value })} /></label>
              <label>Theme Color<input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></label>
              <label>Icon (Emoji)
                <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}>
                  {['🎯', '🏠', '🚗', '💰', '✈️', '💍', '🎓', '🏥', '🎉', '💻', '📈', '🐶', '👶', '🌴', '💎', '🚀', '🏖️'].map(emoji => (
                    <option key={emoji} value={emoji}>{emoji}</option>
                  ))}
                </select>
              </label>
              <label>Link to Asset (Optional)
                <select value={form.linked_asset_id || ''} onChange={e => setForm({ ...form, linked_asset_id: e.target.value || null })}>
                  <option value="">None (Manual Tracking)</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({money(a.current_value || 0, settings)})</option>)}
                </select>
              </label>
              <div className="modal-actions" style={{ marginTop: '10px' }}>
                <button type="button" onClick={() => setForm(null)}>Cancel</button>
                <button type="submit" className="primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {contribForm && (
        <div className="modal-backdrop" onClick={() => setContribForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Funds to Goal</h2>
            <form onSubmit={contribute} style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '18px' }}>
              <label>Amount<input required type="number" step="0.01" value={contribForm.amount} onChange={e => setContribForm({ ...contribForm, amount: e.target.value })} /></label>
              <label>Date<input type="date" value={contribForm.date || ''} onChange={e => setContribForm({ ...contribForm, date: e.target.value })} /></label>
              <label>Notes<input value={contribForm.notes || ''} onChange={e => setContribForm({ ...contribForm, notes: e.target.value })} /></label>
              <div className="modal-actions" style={{ marginTop: '10px' }}>
                <button type="button" onClick={() => setContribForm(null)}>Cancel</button>
                <button type="submit" className="primary">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function Subscriptions({ settings, categories }) {
  const [subs, setSubs] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pageSize, setPageSize] = useState(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('subscriptions_page_size') || localStorage.getItem('preferred_page_size')) : null;
    return saved === 'all' ? 'all' : (saved ? Number(saved) : 10);
  });
  const [currentPage, setCurrentPage] = useState(1);

  async function load() {
    setSubs(await api('/subscriptions'));
  }
  useEffect(() => { load(); }, []);

  const availableCategories = useMemo(() => {
    const cats = new Set();
    subs.forEach(s => { if (s.category) cats.add(s.category); });
    return Array.from(cats).sort();
  }, [subs]);

  const filteredSubs = useMemo(() => {
    return subs.filter(s => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchCat = (s.category || '').toLowerCase().includes(q);
        const matchFreq = (s.frequency || '').toLowerCase().includes(q);
        const matchAmt = String(s.amount || '').includes(q);
        if (!matchName && !matchCat && !matchFreq && !matchAmt) return false;
      }
      return true;
    });
  }, [subs, categoryFilter, searchTerm]);

  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? filteredSubs.length : Number(pageSize || 10);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(filteredSubs.length / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedSubs = useMemo(() => {
    if (isAll) return filteredSubs;
    const start = (safeCurrentPage - 1) * effectivePageSize;
    return filteredSubs.slice(start, start + effectivePageSize);
  }, [filteredSubs, isAll, safeCurrentPage, effectivePageSize]);

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api(`/subscriptions/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await api('/subscriptions', { method: 'POST', body: JSON.stringify(form) });
      setForm(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function del(id) {
    if (confirm('Cancel subscription?')) {
      await api(`/subscriptions/${id}`, { method: 'DELETE' });
      load();
    }
  }

  const monthlyCost = subs.reduce((sum, s) => {
    const amt = Number(s.amount) || 0;
    return sum + (s.frequency === 'yearly' ? amt / 12 : (s.frequency === 'weekly' ? amt * (52 / 12) : amt));
  }, 0);

  return (
    <section className="page">
      <div className="overview-head">
        <div>
          <h1>Subscriptions</h1>
          <p>Total Monthly Fixed Costs: <span className="bad">{money(monthlyCost, settings)}</span></p>
        </div>
        <button onClick={() => setForm({ name: '', amount: '', category: categories.expense?.[0] || '', frequency: 'monthly', next_due_date: new Date().toISOString().split('T')[0] })}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Subscription
        </button>
      </div>

      <div className="table-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
        <TableFilterBar
          searchTerm={searchTerm}
          onSearchChange={val => { setSearchTerm(val); setCurrentPage(1); }}
          searchPlaceholder="🔍 Search subscriptions..."
          categoryFilter={categoryFilter}
          onCategoryChange={availableCategories.length > 0 ? (val => { setCategoryFilter(val); setCurrentPage(1); }) : null}
          categories={availableCategories}
          pageSize={pageSize}
          onPageSizeChange={val => {
            setPageSize(val);
            if (typeof window !== 'undefined') {
              localStorage.setItem('subscriptions_page_size', String(val));
              localStorage.setItem('preferred_page_size', String(val));
            }
            setCurrentPage(1);
          }}
        />
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Next Due Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSubs.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.category}</td>
                  <td className="bad">{money(s.amount, settings)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{s.frequency}</td>
                  <td>{formatDate(s.next_due_date, settings)}</td>
                  <td className="actions">
                    <button className="icon-btn" onClick={() => setForm(s)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button className="icon-btn" onClick={() => del(s.id)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedSubs.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: 'center', opacity: 0.5, padding: '30px' }}>{subs.length === 0 ? 'No active subscriptions found.' : 'No subscriptions match your filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          totalRecords={filteredSubs.length}
          pageSize={pageSize}
          currentPage={safeCurrentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={val => {
            setPageSize(val);
            if (typeof window !== 'undefined') {
              localStorage.setItem('subscriptions_page_size', String(val));
              localStorage.setItem('preferred_page_size', String(val));
            }
            setCurrentPage(1);
          }}
        />
      </div>

      {form && (
        <div className="modal-backdrop" onClick={() => { setForm(null); setError(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{form.id ? 'Edit' : 'New'} Subscription</h2>
            {error && <div className="error">{error}</div>}
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '18px' }}>
              <label>Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
              <label>Amount<input required type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
              <label>Category
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {categories.expense?.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>Frequency
                <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label>Next Due Date<input type="date" required value={form.next_due_date} onChange={e => setForm({ ...form, next_due_date: e.target.value })} /></label>
              
              <div className="modal-actions" style={{ marginTop: '10px' }}>
                <button type="button" onClick={() => setForm(null)}>Cancel</button>
                <button type="submit" className="primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function Projections({ settings }) {
  const [netWorth, setNetWorth] = useState(0);
  const [monthlySavings, setMonthlySavings] = useState(1000);
  const [monthlyExpenses, setMonthlyExpenses] = useState(4000);
  
  const [roi, setRoi] = useState(7);
  const [inflation, setInflation] = useState(2);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [currentAge, setCurrentAge] = useState(30);
  const [targetAge, setTargetAge] = useState(60);

  useEffect(() => {
    Promise.all([api('/assets'), api('/liabilities'), api('/cashflow')])
      .then(([assets, liabilities, cashflow]) => {
        const totalAssets = assets.reduce((sum, a) => sum + convertValue(a.current_value, a.currency, settings), 0);
        const totalLiabilities = liabilities.reduce((sum, l) => sum + convertValue(l.current_value, l.currency, settings), 0);
        setNetWorth(totalAssets - totalLiabilities);
        
        // Estimate average monthly expenses
        const expenses = cashflow.filter(c => c.type === 'expense').reduce((s, c) => s + Number(c.amount || 0), 0);
        if (expenses > 0) setMonthlyExpenses(Math.round(expenses / 12) || 4000);
      });
  }, []);

  const data = [];
  let currentBalance = netWorth;
  const realRoi = (roi - inflation) / 100;
  const monthlyRate = realRoi / 12;

  let fireAge = null;
  const fireTarget = (monthlyExpenses * 12) / (withdrawalRate / 100);

  for (let age = currentAge; age <= Math.max(targetAge, currentAge + 10); age++) {
    data.push({
      age,
      Balance: Math.round(currentBalance),
      Target: Math.round(fireTarget)
    });
    if (!fireAge && currentBalance >= fireTarget) {
      fireAge = age;
    }
    for (let m = 0; m < 12; m++) {
      currentBalance = currentBalance * (1 + monthlyRate) + Number(monthlySavings);
    }
  }

  return (
    <section className="page">
      <div className="overview-head">
        <div>
          <h1>FIRE Projections</h1>
          <p>Plan your Financial Independence and Early Retirement.</p>
        </div>
      </div>
      
      <div className="budget-layout">
        <Chart title="Wealth Growth Projection" height={400}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="age" tickFormatter={a => `Age ${a}`} />
            <YAxis tickFormatter={v => money(v, settings)} width={80} />
            <Tooltip content={<PremiumTooltip settings={settings} />} />
            <Area type="monotone" dataKey="Balance" stroke="#10b981" fillOpacity={1} fill="url(#colorBalance)" />
            <Line type="dashed" dataKey="Target" stroke="#f43f5e" strokeWidth={2} dot={false} strokeDasharray="5 5" />
          </AreaChart>
        </Chart>
        
        <div className="budget-breakdown card">
          <h3>FIRE Metrics</h3>
          <div className="budget-metrics" style={{ gridTemplateColumns: '1fr', marginTop: '14px' }}>
            <div className="mini-stat">
              <label>FIRE Target Number</label>
              <span className="good">{money(fireTarget, settings)}</span>
            </div>
            <div className="mini-stat">
              <label>Projected Net Worth at {targetAge}</label>
              <span>{money(data.find(d => d.age === targetAge)?.Balance || 0, settings)}</span>
            </div>
            <div className="mini-stat" style={{ background: fireAge ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)' }}>
              <label>You can retire at age</label>
              <span style={{ color: fireAge ? '#10b981' : '#f43f5e' }}>{fireAge ? fireAge : '80+'}</span>
            </div>
          </div>
          
          <h3 style={{ marginTop: '24px', marginBottom: '14px' }}>Assumptions</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid' }}>Current Age <input type="number" value={currentAge} onChange={e => setCurrentAge(Number(e.target.value))} /></label>
            <label style={{ display: 'grid' }}>Target Retirement Age <input type="number" value={targetAge} onChange={e => setTargetAge(Number(e.target.value))} /></label>
            <label style={{ display: 'grid' }}>Monthly Savings <input type="number" value={monthlySavings} onChange={e => setMonthlySavings(Number(e.target.value))} /></label>
            <label style={{ display: 'grid' }}>Monthly Expenses (in retirement) <input type="number" value={monthlyExpenses} onChange={e => setMonthlyExpenses(Number(e.target.value))} /></label>
            <label style={{ display: 'grid' }}>Expected Annual Return (%) <input type="number" step="0.1" value={roi} onChange={e => setRoi(Number(e.target.value))} /></label>
            <label style={{ display: 'grid' }}>Inflation Rate (%) <input type="number" step="0.1" value={inflation} onChange={e => setInflation(Number(e.target.value))} /></label>
            <label style={{ display: 'grid' }}>Safe Withdrawal Rate (%) <input type="number" step="0.1" value={withdrawalRate} onChange={e => setWithdrawalRate(Number(e.target.value))} /></label>
          </div>
        </div>
      </div>
    </section>
  );
}

function PayEmiModal({ liability, settings, onCancel, onConfirm }) {
  const [amount, setAmount] = useState(liability.minimum_payment || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncCashflow, setSyncCashflow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const balance = Number(liability.current_value) || 0;
  const rate = Number(liability.interest_rate) || 0;
  const emi = Number(amount) || 0;
  const monthlyInterest = Math.round((balance * (rate / 100 / 12)) * 100) / 100;
  const principal = Math.max(0, Math.round((emi - monthlyInterest) * 100) / 100);
  const newBalance = Math.max(0, Math.round((balance - principal) * 100) / 100);
  const remainingEmis = liability.remaining_emis !== null && liability.remaining_emis !== undefined 
    ? Math.max(0, Number(liability.remaining_emis) - 1) 
    : null;

  async function submit(e) {
    e.preventDefault();
    if (emi <= 0) {
      setError('Please enter a valid EMI amount.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm({ amount: emi, date, syncCashflow });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit} style={{ maxWidth: '520px' }}>
        <h2>Confirm Monthly EMI • {liability.name}</h2>
        {error && <div className="error">{error}</div>}

        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span style={{ color: '#94a3b8' }}>Current Outstanding Balance:</span>
            <strong>{money(balance, settings)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span style={{ color: '#f43f5e' }}>Interest Fee ({rate}% APR):</span>
            <span style={{ color: '#f43f5e' }}>- {money(monthlyInterest, settings)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span style={{ color: '#10b981' }}>Principal Reduced:</span>
            <span style={{ color: '#10b981', fontWeight: 'bold' }}>{money(principal, settings)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', marginTop: '6px', borderTop: '1px solid #334155', fontSize: '15px' }}>
            <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>New Balance After Payment:</span>
            <strong style={{ color: '#38bdf8', fontSize: '17px' }}>{money(newBalance, settings)}</strong>
          </div>
          {remainingEmis !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px', color: '#94a3b8' }}>
              <span>Remaining EMIs Countdown:</span>
              <strong style={{ color: '#10b981' }}>{remainingEmis} EMIs left</strong>
            </div>
          )}
        </div>

        <div className="form-grid">
          <label>Monthly EMI Amount
            <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} required />
          </label>
          <label>Payment Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={syncCashflow} 
              onChange={e => setSyncCashflow(e.target.checked)} 
              style={{ width: 'auto', margin: 0 }} 
            />
            <span style={{ fontSize: '14px', color: '#e2e8f0' }}>
              Also record in Cashflow as expense (Category: EMI/Loan Payments)
            </span>
          </label>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" style={{ background: '#10b981', borderColor: '#10b981', color: '#fff' }} disabled={saving}>
            {saving ? 'Processing...' : 'Confirm EMI Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ForecloseModal({ liability, settings, onCancel, onConfirm }) {
  const [amount, setAmount] = useState(liability.current_value || '');
  const [charges, setCharges] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncCashflow, setSyncCashflow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const balance = Number(liability.current_value) || 0;
  const payoff = Number(amount) || 0;
  const extraFee = Number(charges) || 0;
  const total = payoff + extraFee;

  async function submit(e) {
    e.preventDefault();
    if (payoff <= 0) {
      setError('Please enter a valid payoff amount.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm({ amount: payoff, charges: extraFee, date, syncCashflow });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit} style={{ maxWidth: '520px' }}>
        <h2>Foreclose / Settle Loan • {liability.name}</h2>
        {error && <div className="error">{error}</div>}

        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '18px' }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#94a3b8' }}>
            Foreclosing will settle the remaining balance and close this loan completely, marking the debt as fully paid.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px' }}>
            <span style={{ color: '#94a3b8' }}>Outstanding Balance:</span>
            <strong>{money(balance, settings)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px' }}>
            <span style={{ color: '#94a3b8' }}>Foreclosure Charges / Fees:</span>
            <span>{money(extraFee, settings)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', marginTop: '6px', borderTop: '1px solid #334155', fontSize: '15px' }}>
            <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>Total Settlement Outflow:</span>
            <strong style={{ color: '#38bdf8', fontSize: '17px' }}>{money(total, settings)}</strong>
          </div>
        </div>

        <div className="form-grid">
          <label>Settlement Principal Amount
            <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} required />
          </label>
          <label>Bank Foreclosure Charges (if any)
            <input type="number" step="any" value={charges} onChange={e => setCharges(e.target.value)} />
          </label>
          <label>Foreclosure Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={syncCashflow} 
              onChange={e => setSyncCashflow(e.target.checked)} 
              style={{ width: 'auto', margin: 0 }} 
            />
            <span style={{ fontSize: '14px', color: '#e2e8f0' }}>
              Also log as Expense in Cashflow (Category: EMI/Loan Payments)
            </span>
          </label>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="danger" disabled={saving}>
            {saving ? 'Processing...' : 'Confirm Loan Foreclosure'}
          </button>
        </div>
      </form>
    </div>
  );
}

function DebtPlanner({ settings, categories }) {
  const [liabilities, setLiabilities] = useState([]);
  const [strategy, setStrategy] = useState('avalanche');
  const [extraPayment, setExtraPayment] = useState(100);
  const [payingDebt, setPayingDebt] = useState(null);
  const [foreclosingDebt, setForeclosingDebt] = useState(null);
  const [editingDebt, setEditingDebt] = useState(null);
  const [addingDebt, setAddingDebt] = useState(false);
  const [notification, setNotification] = useState('');

  const loadDebts = async () => {
    try {
      const data = await api('/liabilities');
      setLiabilities(data.filter(l => Number(l.current_value) > 0));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadDebts();
  }, []);

  const calculatePayoff = () => {
    let debts = liabilities.map(l => ({ 
      id: l.id,
      name: l.name, 
      balance: Number(l.current_value) || 0, 
      rate: Number(l.interest_rate) || 0, 
      minPayment: Number(l.minimum_payment) || (Number(l.current_value) * 0.02) 
    }));

    if (strategy === 'snowball') debts.sort((a, b) => a.balance - b.balance);
    else debts.sort((a, b) => b.rate - a.rate);

    let months = 0;
    let totalInterest = 0;
    let payoffSchedule = [];
    let isDebtFree = false;
    let totalPaid = 0;
    const MAX_MONTHS = 600;

    while (!isDebtFree && months < MAX_MONTHS) {
      months++;
      let extraAvailable = extraPayment;
      let monthInterest = 0;
      let monthPrincipal = 0;

      for (let d of debts) {
        if (d.balance > 0) {
          const interest = d.balance * (d.rate / 100 / 12);
          monthInterest += interest;
          totalInterest += interest;
          d.balance += interest;

          let payment = Math.min(d.balance, d.minPayment);
          d.balance -= payment;
          monthPrincipal += (payment - interest);
          totalPaid += payment;
          if (payment < d.minPayment) extraAvailable += (d.minPayment - payment);
        }
      }

      for (let d of debts) {
        if (d.balance > 0 && extraAvailable > 0) {
          let payment = Math.min(d.balance, extraAvailable);
          d.balance -= payment;
          extraAvailable -= payment;
          monthPrincipal += payment;
          totalPaid += payment;
        }
      }

      isDebtFree = debts.every(d => d.balance <= 0);
      payoffSchedule.push({ 
        month: months, 
        Remaining: debts.reduce((s,d) => s + Math.max(0, d.balance), 0),
        'Interest Paid': totalInterest 
      });
    }

    return { months, totalInterest, payoffSchedule, isDebtFree };
  };

  const results = calculatePayoff();
  const totalDebt = liabilities.reduce((sum, l) => sum + convertValue(l.current_value, l.currency, settings), 0);

  const debtFields = [
    { name: 'name', label: 'Loan / Debt Name' },
    { name: 'category', label: 'Category', type: 'select', options: (categories?.liability || ['Personal Loan', 'Home Loan', 'Car Loan', 'Credit Card', 'Other Debt']) },
    { name: 'current_value', label: 'Principal Balance', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'select', options: Object.keys(CURRENCIES) },
    { name: 'interest_rate', label: 'Interest Rate (%)', type: 'number' },
    { name: 'minimum_payment', label: 'Monthly EMI Amount', type: 'number' },
    { name: 'emi_day', label: 'Monthly EMI Due Day (1-31)', type: 'number' },
    { name: 'remaining_emis', label: 'Total Remaining EMIs', type: 'number' },
    { name: 'maturity_date', label: 'Loan Ending / Maturity Date', type: 'date' },
    { name: 'notes', label: 'Notes' }
  ];

  return (
    <section className="page">
      <div className="overview-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1>Debt Payoff Planner</h1>
          <p>Manage your active loans, track EMI schedules, and project debt-free timelines.</p>
        </div>
        <button className="primary" onClick={() => setAddingDebt(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add New Debt / Loan
        </button>
      </div>

      {notification && (
        <div style={{ padding: '12px 18px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ {notification}</span>
          <button style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '18px', padding: 0 }} onClick={() => setNotification('')}>×</button>
        </div>
      )}

      {liabilities.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Active Loans & EMI Schedule</span>
            <span style={{ fontSize: '12px', background: '#334155', color: '#94a3b8', padding: '2px 8px', borderRadius: '12px' }}>{liabilities.length} active</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '18px' }}>
            {liabilities.map(debt => (
              <div key={debt.id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #334155' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>{debt.name}</h4>
                      <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{debt.category}</span>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                      {money(debt.current_value, { ...settings, currency: debt.currency || settings.currency })}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Monthly EMI</span>
                      <strong style={{ color: '#38bdf8', fontSize: '14px' }}>
                        {debt.minimum_payment ? money(debt.minimum_payment, { ...settings, currency: debt.currency || settings.currency }) : '-'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Interest Rate</span>
                      <strong style={{ color: '#f59e0b', fontSize: '14px' }}>
                        {debt.interest_rate ? `${debt.interest_rate}% p.a.` : '-'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>EMI Due Day</span>
                      <strong style={{ color: '#e2e8f0' }}>
                        {debt.emi_day ? `${debt.emi_day}th of month` : '-'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Remaining EMIs</span>
                      <strong style={{ color: '#10b981' }}>
                        {debt.remaining_emis !== null && debt.remaining_emis !== undefined ? `${debt.remaining_emis} EMIs left` : '-'}
                      </strong>
                    </div>
                    {debt.maturity_date && (
                      <div style={{ gridColumn: 'span 2', paddingTop: '6px', borderTop: '1px solid #1e293b' }}>
                        <span style={{ color: '#64748b', display: 'block' }}>Loan Ending / Maturity Date</span>
                        <strong style={{ color: '#e2e8f0' }}>{formatDate(debt.maturity_date, settings)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
                  <button 
                    style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', fontSize: '13px', padding: '6px 14px', flex: 1, fontWeight: 'bold' }}
                    onClick={() => setPayingDebt(debt)}
                  >
                    ✓ Pay EMI
                  </button>
                  <button 
                    className="secondary"
                    style={{ fontSize: '13px', padding: '6px 12px' }}
                    onClick={() => setForeclosingDebt(debt)}
                  >
                    Foreclose
                  </button>
                  <button 
                    className="secondary"
                    style={{ fontSize: '13px', padding: '6px 10px' }}
                    onClick={() => setEditingDebt(debt)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="budget-layout">
        <Chart title="Debt Payoff Timeline" height={400}>
          <AreaChart data={results.payoffSchedule}>
            <defs>
              <linearGradient id="colorRemaining" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tickFormatter={m => `Month ${m}`} />
            <YAxis tickFormatter={v => money(v, settings)} width={80} />
            <Tooltip content={<PremiumTooltip settings={settings} />} />
            <Area type="monotone" dataKey="Remaining" stroke="#ef4444" fillOpacity={1} fill="url(#colorRemaining)" />
            <Line type="monotone" dataKey="Interest Paid" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </AreaChart>
        </Chart>
        
        <div className="budget-breakdown card">
          <h3>Payoff Plan</h3>
          <div className="budget-metrics" style={{ gridTemplateColumns: '1fr', marginTop: '14px' }}>
            <div className="mini-stat">
              <label>Total Debt</label>
              <span className="bad">{money(totalDebt, settings)}</span>
            </div>
            <div className="mini-stat">
              <label>Time to Debt Free</label>
              <span>{results.isDebtFree ? `${Math.floor(results.months / 12)} yrs ${results.months % 12} mos` : 'Never (Increase Payments)'}</span>
            </div>
            <div className="mini-stat">
              <label>Total Interest Paid</label>
              <span className="bad">{money(results.totalInterest, settings)}</span>
            </div>
          </div>
          
          <h3 style={{ marginTop: '24px', marginBottom: '14px' }}>Strategy</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid' }}>Method
              <select value={strategy} onChange={e => setStrategy(e.target.value)}>
                <option value="avalanche">Avalanche (Highest Interest First)</option>
                <option value="snowball">Snowball (Lowest Balance First)</option>
              </select>
            </label>
            <label style={{ display: 'grid' }}>Extra Monthly Payment 
              <input type="number" value={extraPayment} onChange={e => setExtraPayment(Number(e.target.value))} />
            </label>
          </div>
        </div>
      </div>

      {payingDebt && (
        <PayEmiModal 
          liability={payingDebt}
          settings={settings}
          onCancel={() => setPayingDebt(null)}
          onConfirm={async (payload) => {
            const res = await api(`/liabilities/${payingDebt.id}/pay-emi`, {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            setPayingDebt(null);
            await loadDebts();
            setNotification(`EMI paid for ${payingDebt.name}! Principal reduced by ${money(res.breakdown.principalPaid, settings)}. New balance: ${money(res.breakdown.newBalance, settings)}.`);
            setTimeout(() => setNotification(''), 6000);
          }}
        />
      )}

      {foreclosingDebt && (
        <ForecloseModal
          liability={foreclosingDebt}
          settings={settings}
          onCancel={() => setForeclosingDebt(null)}
          onConfirm={async (payload) => {
            await api(`/liabilities/${foreclosingDebt.id}/foreclose`, {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            setForeclosingDebt(null);
            await loadDebts();
            setNotification(`Loan "${foreclosingDebt.name}" foreclosed and closed successfully! Total paid: ${money(payload.amount + (payload.charges || 0), settings)}.`);
            setTimeout(() => setNotification(''), 6000);
          }}
        />
      )}

      {addingDebt && (
        <Modal
          title="Add New Debt / Loan"
          fields={debtFields}
          initial={{ category: 'Personal Loan', currency: settings.currency || 'INR', emi_day: 5 }}
          onCancel={() => setAddingDebt(false)}
          onSave={async (form) => {
            await api('/liabilities', { method: 'POST', body: JSON.stringify(form) });
            setAddingDebt(false);
            await loadDebts();
            setNotification(`Added loan "${form.name}" successfully!`);
            setTimeout(() => setNotification(''), 4000);
          }}
        />
      )}

      {editingDebt && (
        <Modal
          title={`Edit ${editingDebt.name}`}
          fields={debtFields}
          initial={editingDebt}
          onCancel={() => setEditingDebt(null)}
          onSave={async (form) => {
            await api(`/liabilities/${editingDebt.id}`, { method: 'PUT', body: JSON.stringify(form) });
            setEditingDebt(null);
            await loadDebts();
            setNotification(`Updated "${form.name}" successfully!`);
            setTimeout(() => setNotification(''), 4000);
          }}
        />
      )}
    </section>
  );
}


// ─── ACCOUNT STATEMENT / PASSBOOK MODAL ───────────────────────────────────────
function AccountStatementModal({ asset, settings, onClose }) {
  const [statement, setStatement] = useState(null);
  const [allAssets, setAllAssets] = useState([]);
  const [editingTx, setEditingTx] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStatement = async () => {
    if (!asset) return;
    setLoading(true);
    try {
      const [res, assetsRes] = await Promise.all([
        api(`/cashflow/account/${asset.id}/statement`),
        api('/assets')
      ]);
      setStatement(res);
      setAllAssets(assetsRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatement();
  }, [asset]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction? Bank account balance adjustments will be reverted.')) return;
    await api(`/cashflow/${id}`, { method: 'DELETE' });
    await loadStatement();
  };

  if (!asset) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '92%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📖</span>
              <span>Account Passbook & Activity</span>
            </h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '14px' }}>
              <strong>{asset.name}</strong> • {asset.category} • Current Balance: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{money(asset.current_value, settings)}</span>
            </p>
          </div>
          <button className="secondary" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
        </div>

        {loading ? (
          <p className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>Loading account statement...</p>
        ) : statement ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div className="card" style={{ padding: '14px', background: '#0f172a', border: '1px solid #1e293b' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Total Inflows</span>
                <strong style={{ color: '#10b981', fontSize: '18px' }}>+{money(statement.total_inflow, settings)}</strong>
              </div>
              <div className="card" style={{ padding: '14px', background: '#0f172a', border: '1px solid #1e293b' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Total Outflows</span>
                <strong style={{ color: '#ef4444', fontSize: '18px' }}>-{money(statement.total_outflow, settings)}</strong>
              </div>
              <div className="card" style={{ padding: '14px', background: '#0f172a', border: '1px solid #1e293b' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Net Activity</span>
                <strong style={{ color: statement.net_change >= 0 ? '#10b981' : '#ef4444', fontSize: '18px' }}>
                  {statement.net_change >= 0 ? '+' : ''}{money(statement.net_change, settings)}
                </strong>
              </div>
            </div>

            <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 14px' }}>Date</th>
                    <th style={{ padding: '10px 14px' }}>Type</th>
                    <th style={{ padding: '10px 14px' }}>Description / Counterparty</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                        No transactions recorded for this account yet. When you log expenses, income, or transfers using this account, they will appear here!
                      </td>
                    </tr>
                  ) : (
                    statement.transactions.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{formatDate(t.date, settings)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: t.direction === 'inflow' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: t.direction === 'inflow' ? '#10b981' : '#ef4444'
                          }}>
                            {t.type === 'transfer' ? (t.direction === 'inflow' ? 'Transfer In ⇄' : 'Transfer Out ⇄') : (t.type === 'income' ? 'Income ↓' : 'Expense ↑')}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 500, color: '#f8fafc' }}>{t.display_label}</div>
                          {t.category && <small style={{ color: '#64748b' }}>{t.category}</small>}
                        </td>
                        <td style={{
                          padding: '10px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px',
                          color: t.direction === 'inflow' ? '#10b981' : '#ef4444'
                        }}>
                          {t.direction === 'inflow' ? '+' : '-'}{money(t.amount, settings)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="secondary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => setEditingTx(t)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="danger"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => handleDelete(t.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button className="primary" onClick={onClose}>Done</button>
        </div>

        {editingTx && (
          <TransactionModal
            initial={editingTx}
            assets={allAssets}
            settings={settings}
            onCancel={() => setEditingTx(null)}
            onSave={async (form) => {
              if (form.id) {
                await api(`/cashflow/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
              } else {
                await api('/cashflow', { method: 'POST', body: JSON.stringify(form) });
              }
              setEditingTx(null);
              await loadStatement();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── TRANSACTION MODAL (Income / Expense / Transfer) ─────────────────────────
function TransactionModal({ initial, assets = [], categories, settings, onCancel, onSave }) {
  const [assetList, setAssetList] = useState(assets || []);
  const [txType, setTxType] = useState(initial?.type || 'expense');
  const [form, setForm] = useState({
    amount: '',
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    account_id: '',
    to_account_id: '',
    adjust_balance: true,
    ...(initial || {})
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Inline account creation state
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceCategory, setNewSourceCategory] = useState('Bank Accounts');
  const [newDestName, setNewDestName] = useState('');
  const [newDestCategory, setNewDestCategory] = useState('Trading / Brokerage Account');

  // Custom category state
  const [isCustomCat, setIsCustomCat] = useState(false);
  const [customCatInput, setCustomCatInput] = useState('');

  useEffect(() => {
    if (!assets || assets.length === 0) {
      api('/assets').then(res => setAssetList(res || [])).catch(() => {});
    } else {
      setAssetList(assets);
    }
  }, [assets]);

  const initialId = initial?.id;
  useEffect(() => {
    if (initial && (initial.id || Object.keys(initial).length > 0)) {
      setTxType(initial.type || 'expense');
      setForm({
        amount: initial.amount ?? '',
        category: initial.category || '',
        description: initial.description || '',
        date: initial.date ? String(initial.date).slice(0, 10) : new Date().toISOString().split('T')[0],
        account_id: initial.account_id ?? '',
        to_account_id: initial.to_account_id ?? '',
        adjust_balance: initial.adjust_balance !== 0,
        id: initial.id
      });
    } else {
      setTxType('expense');
      setForm({
        amount: '',
        category: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        account_id: '',
        to_account_id: '',
        adjust_balance: true
      });
    }
  }, [initialId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    let sourceId = form.account_id;
    let destId = form.to_account_id;

    // Handle new source account creation
    if (sourceId === '__new__') {
      if (!newSourceName.trim()) {
        setError('Please enter a name for the new source account');
        return;
      }
      try {
        const created = await api('/assets', {
          method: 'POST',
          body: JSON.stringify({
            name: newSourceName.trim(),
            category: newSourceCategory || 'Bank Accounts',
            current_value: 0,
            currency: settings.currency || 'INR'
          })
        });
        sourceId = created?.id;
        if (!sourceId) {
          const fresh = await api('/assets');
          const found = (fresh || []).find(a => a.name === newSourceName.trim());
          if (found) sourceId = found.id;
        }
      } catch (err) {
        setError('Failed to create new source account: ' + err.message);
        return;
      }
    }

    // Handle new destination account creation (e.g. Stock Broker Account)
    if (destId === '__new__') {
      if (!newDestName.trim()) {
        setError('Please enter a name for the new destination account / broker');
        return;
      }
      try {
        const created = await api('/assets', {
          method: 'POST',
          body: JSON.stringify({
            name: newDestName.trim(),
            category: newDestCategory || 'Trading / Brokerage Account',
            current_value: 0,
            currency: settings.currency || 'INR'
          })
        });
        destId = created?.id;
        if (!destId) {
          const fresh = await api('/assets');
          const found = (fresh || []).find(a => a.name === newDestName.trim());
          if (found) destId = found.id;
        }
      } catch (err) {
        setError('Failed to create new destination account: ' + err.message);
        return;
      }
    }

    if (txType === 'transfer') {
      if (!sourceId || !destId) {
        setError('Please select both Source (From) and Destination (To) accounts');
        return;
      }
      if (Number(sourceId) === Number(destId)) {
        setError('Source and Destination accounts cannot be the same');
        return;
      }
    }

    const finalCategory = isCustomCat && customCatInput.trim()
      ? customCatInput.trim()
      : (form.category || (txType === 'transfer' ? 'Transfer' : (txType === 'income' ? 'Salary' : 'Other')));

    setSaving(true);
    try {
      await onSave({
        ...form,
        type: txType,
        amount: amt,
        category: finalCategory,
        account_id: sourceId ? Number(sourceId) : null,
        to_account_id: destId ? Number(destId) : null,
        adjust_balance: form.adjust_balance ? 1 : 0
      });
    } catch (err) {
      setError(err.message || 'Failed to save transaction');
      setSaving(false);
    }
  };

  const baseCategories = txType === 'income'
    ? (categories?.income || ['Salary', 'Freelance', 'Rental', 'Dividends', 'Interest', 'Business', 'Other'])
    : txType === 'expense'
    ? (categories?.expense || ['Housing', 'Food', 'Transport', 'EMI/Loan Payments', 'Subscriptions', 'Medical', 'Utilities', 'Entertainment', 'Shopping', 'Insurance', 'Other'])
    : (categories?.transfer || ['Transfer', 'Trading Account Fund', 'Stock Broker Deposit', 'Investment Deposit', 'ATM Cash Withdrawal', 'Wallet Top-up', 'Credit Card Payment', 'Savings Transfer', 'Other Transfer']);

  const currentCategories = form.category && !baseCategories.includes(form.category)
    ? [form.category, ...baseCategories]
    : baseCategories;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit} style={{ maxWidth: '540px', width: '92%' }}>
        <h2>{initial?.id ? 'Edit Transaction' : 'Record Transaction'}</h2>

        {error && <div className="error" style={{ marginBottom: '14px' }}>{error}</div>}

        {/* Toggle Pills: Expense / Income / Transfer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '18px' }}>
          <button
            type="button"
            className={`pill ${txType === 'expense' ? 'active' : ''}`}
            style={{
              padding: '8px', textAlign: 'center',
              borderColor: txType === 'expense' ? '#ef4444' : '#334155',
              color: txType === 'expense' ? '#fff' : '#94a3b8',
              background: txType === 'expense' ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'transparent'
            }}
            onClick={() => { setTxType('expense'); if (form.category === 'Transfer') setForm({ ...form, category: '' }); }}
          >
            💸 Expense
          </button>
          <button
            type="button"
            className={`pill ${txType === 'income' ? 'active' : ''}`}
            style={{
              padding: '8px', textAlign: 'center',
              borderColor: txType === 'income' ? '#10b981' : '#334155',
              color: txType === 'income' ? '#fff' : '#94a3b8',
              background: txType === 'income' ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent'
            }}
            onClick={() => { setTxType('income'); if (form.category === 'Transfer') setForm({ ...form, category: '' }); }}
          >
            💰 Income
          </button>
          <button
            type="button"
            className={`pill ${txType === 'transfer' ? 'active' : ''}`}
            style={{
              padding: '8px', textAlign: 'center',
              borderColor: txType === 'transfer' ? '#38bdf8' : '#334155',
              color: txType === 'transfer' ? '#fff' : '#94a3b8',
              background: txType === 'transfer' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'transparent'
            }}
            onClick={() => { setTxType('transfer'); setForm({ ...form, category: 'Transfer' }); }}
          >
            ⇄ Transfer
          </button>
        </div>

        <div className="form-grid">
          {/* Amount */}
          <label>
            Amount ({settings.currency_symbol || '₹'})
            <input
              type="number"
              step="any"
              required
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
            />
          </label>

          {/* Date */}
          <label>
            Date
            <input
              type="date"
              required
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </label>

          {/* Account Selectors */}
          {txType === 'transfer' ? (
            <>
              <label>
                From Account (Source)
                <select
                  required
                  value={form.account_id || ''}
                  onChange={e => setForm({ ...form, account_id: e.target.value })}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <option value="">-- Source Bank / Asset --</option>
                  {assetList.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({money(a.current_value, settings)})
                    </option>
                  ))}
                  <option value="__new__">➕ + Add New Account / Broker...</option>
                </select>
              </label>

              <label>
                To Account (Destination)
                <select
                  required
                  value={form.to_account_id || ''}
                  onChange={e => setForm({ ...form, to_account_id: e.target.value })}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <option value="">-- Destination Bank / Asset --</option>
                  {assetList.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({money(a.current_value, settings)})
                    </option>
                  ))}
                  <option value="__new__">➕ + Add New Account / Stock Broker...</option>
                </select>
              </label>

              {/* Inline Source Account Creator */}
              {form.account_id === '__new__' && (
                <div style={{ gridColumn: 'span 2', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid #0284c7', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '8px' }}>
                    ➕ Create New Source Account
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <label style={{ fontSize: '12px' }}>Account Name
                      <input 
                        type="text" 
                        required 
                        placeholder="e.g. Kotak Mahindra Bank" 
                        value={newSourceName} 
                        onChange={e => setNewSourceName(e.target.value)} 
                      />
                    </label>
                    <label style={{ fontSize: '12px' }}>Category
                      <select value={newSourceCategory} onChange={e => setNewSourceCategory(e.target.value)}>
                        <option value="Bank Accounts">Bank Accounts</option>
                        <option value="Trading / Brokerage Account">Trading / Brokerage Account</option>
                        <option value="Cash">Cash</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {/* Inline Destination Account Creator (e.g. Stock Broker) */}
              {form.to_account_id === '__new__' && (
                <div style={{ gridColumn: 'span 2', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid #0284c7', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '8px' }}>
                    ➕ Create New Destination Account / Stock Broker
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <label style={{ fontSize: '12px' }}>Broker / Account Name
                      <input 
                        type="text" 
                        required 
                        placeholder="e.g. Stock Broker Sahi or Dhan" 
                        value={newDestName} 
                        onChange={e => setNewDestName(e.target.value)} 
                      />
                    </label>
                    <label style={{ fontSize: '12px' }}>Category
                      <select value={newDestCategory} onChange={e => setNewDestCategory(e.target.value)}>
                        <option value="Trading / Brokerage Account">Trading / Brokerage Account</option>
                        <option value="Bank Accounts">Bank Accounts</option>
                        <option value="Cash">Cash</option>
                        <option value="Mutual Funds">Mutual Funds</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <label>
                {txType === 'expense' ? 'Paid From Account' : 'Deposited To Account'}
                <select
                  value={form.account_id || ''}
                  onChange={e => setForm({ ...form, account_id: e.target.value })}
                >
                  <option value="">-- Optional: Select Bank / Asset --</option>
                  {assetList.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({money(a.current_value, settings)})
                    </option>
                  ))}
                  <option value="__new__">➕ + Add New Account / Broker...</option>
                </select>
              </label>

              {form.account_id === '__new__' && (
                <div style={{ gridColumn: 'span 2', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid #0284c7', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '8px' }}>
                    ➕ Create New Account / Broker
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <label style={{ fontSize: '12px' }}>Account Name
                      <input 
                        type="text" 
                        required 
                        placeholder="e.g. Stock Broker Sahi" 
                        value={newSourceName} 
                        onChange={e => setNewSourceName(e.target.value)} 
                      />
                    </label>
                    <label style={{ fontSize: '12px' }}>Category
                      <select value={newSourceCategory} onChange={e => setNewSourceCategory(e.target.value)}>
                        <option value="Bank Accounts">Bank Accounts</option>
                        <option value="Trading / Brokerage Account">Trading / Brokerage Account</option>
                        <option value="Cash">Cash</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Category */}
          <label>
            Category
            <select
              value={isCustomCat ? '__custom__' : form.category}
              onChange={e => {
                if (e.target.value === '__custom__') {
                  setIsCustomCat(true);
                } else {
                  setIsCustomCat(false);
                  setForm({ ...form, category: e.target.value });
                }
              }}
            >
              <option value="">-- Select Category --</option>
              {currentCategories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">➕ + Add Custom Category...</option>
            </select>
          </label>

          {/* Custom Category Input */}
          {isCustomCat && (
            <label>
              New Custom Category Name
              <input
                type="text"
                placeholder="Type new category..."
                value={customCatInput}
                onChange={e => setCustomCatInput(e.target.value)}
                required
              />
            </label>
          )}

          {/* Description */}
          <label style={{ gridColumn: 'span 2' }}>
            Description / Memo
            <input
              type="text"
              placeholder={txType === 'transfer' ? 'e.g. Added ₹200k to Stock Broking Account from Kotak' : 'e.g. Grocery, Salary, Dividend'}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </label>

          {/* Balance adjustment checkbox */}
          <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#94a3b8' }}>
            <input
              type="checkbox"
              checked={!!form.adjust_balance}
              onChange={e => setForm({ ...form, adjust_balance: e.target.checked })}
              style={{ width: 'auto' }}
            />
            {txType === 'transfer'
              ? 'Automatically update both account balances (deduct source, credit destination)'
              : txType === 'expense'
              ? 'Automatically deduct amount from the selected bank account balance'
              : 'Automatically add amount to the selected bank account balance'}
          </label>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving...' : initial?.id ? 'Update' : 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── CASHFLOW MANAGER COMPONENT ──────────────────────────────────────────────
function CashflowManager({ settings, categories, onOpenCsvImport, onOpenStatement }) {
  const [items, setItems] = useState([]);
  const [assets, setAssets] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editingTx, setEditingTx] = useState(null);
  const [notification, setNotification] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('cashflow_page_size') || localStorage.getItem('preferred_page_size')) : null;
    return saved === 'all' ? 'all' : (saved ? Number(saved) : 10);
  });
  const [currentPage, setCurrentPage] = useState(1);

  const load = async () => {
    try {
      const [cfData, assetData] = await Promise.all([
        api('/cashflow'),
        api('/assets')
      ]);
      setItems(cfData || []);
      setAssets(assetData || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);

  const availableCategories = useMemo(() => {
    const cats = new Set();
    items.forEach(tx => { if (tx.category) cats.add(tx.category); });
    return Array.from(cats).sort();
  }, [items]);

  const filtered = items.filter(tx => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (accountFilter !== 'all') {
      const accId = Number(accountFilter);
      if (Number(tx.account_id) !== accId && Number(tx.to_account_id) !== accId) return false;
    }
    if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      const acc = (tx.account_name || '').toLowerCase();
      const toAcc = (tx.to_account_name || '').toLowerCase();
      if (!desc.includes(term) && !cat.includes(term) && !acc.includes(term) && !toAcc.includes(term)) return false;
    }
    return true;
  });

  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? filtered.length : Number(pageSize || 10);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTransactions = useMemo(() => {
    if (isAll) return filtered;
    const start = (safeCurrentPage - 1) * effectivePageSize;
    return filtered.slice(start, start + effectivePageSize);
  }, [filtered, isAll, safeCurrentPage, effectivePageSize]);

  const totalIncome = items.filter(x => x.type === 'income').reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalExpense = items.filter(x => x.type === 'expense').reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalTransfer = items.filter(x => x.type === 'transfer').reduce((s, x) => s + Number(x.amount || 0), 0);
  const netCashflow = totalIncome - totalExpense;

  const handleSave = async (form) => {
    if (form.id) {
      await api(`/cashflow/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      setNotification('Transaction updated successfully!');
    } else {
      await api('/cashflow', { method: 'POST', body: JSON.stringify(form) });
      setNotification(form.type === 'transfer' ? 'Fund transfer recorded and account balances updated!' : 'Transaction recorded successfully!');
    }
    setEditingTx(null);
    await load();
    setTimeout(() => setNotification(''), 4000);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction? Any bank account balance adjustments will be reverted.')) return;
    await api(`/cashflow/${id}`, { method: 'DELETE' });
    await load();
    setNotification('Transaction deleted and account balance restored.');
    setTimeout(() => setNotification(''), 4000);
  };

  return (
    <section className="page">
      <div className="overview-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1>Cashflow & Activity</h1>
          <p>Track income, expenses, and internal bank transfers with automatic balance sync.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className={`privacy-btn ${isPrivacyActive(settings) ? 'privacy-active' : ''}`}
            onClick={settings?.togglePrivacy}
            title={isPrivacyActive(settings) ? "Show Transaction Amounts" : "Hide Transaction Amounts for Privacy"}
          >
            {isPrivacyActive(settings) ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
            <span>{isPrivacyActive(settings) ? 'Hidden' : 'Hide'}</span>
          </button>
          <button className="secondary" onClick={onOpenCsvImport}>Import CSV</button>
          <button className="primary" onClick={() => setEditingTx({})} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>+</span> Record Transaction
          </button>
        </div>
      </div>

      {notification && (
        <div style={{ padding: '12px 18px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ {notification}</span>
          <button style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '18px', padding: 0 }} onClick={() => setNotification('')}>×</button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Total Income</span>
          <strong style={{ color: '#10b981', fontSize: '20px', marginTop: '4px', display: 'block' }}>+{money(totalIncome, settings)}</strong>
        </div>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Total Expenses</span>
          <strong style={{ color: '#ef4444', fontSize: '20px', marginTop: '4px', display: 'block' }}>-{money(totalExpense, settings)}</strong>
        </div>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Net Cash Flow</span>
          <strong style={{ color: netCashflow >= 0 ? '#10b981' : '#ef4444', fontSize: '20px', marginTop: '4px', display: 'block' }}>
            {netCashflow >= 0 ? '+' : ''}{money(netCashflow, settings)}
          </strong>
        </div>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#38bdf8', textTransform: 'uppercase' }}>Transfers ⇄</span>
          <strong style={{ color: '#38bdf8', fontSize: '20px', marginTop: '4px', display: 'block' }}>{money(totalTransfer, settings)}</strong>
          <small style={{ color: '#64748b', fontSize: '11px' }}>Internal movements (0 networth impact)</small>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px', background: '#0f172a', padding: '12px 16px', borderRadius: '10px', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className={`pill ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => { setTypeFilter('all'); setCurrentPage(1); }}>
            All ({items.length})
          </button>
          <button className={`pill ${typeFilter === 'expense' ? 'active' : ''}`} onClick={() => { setTypeFilter('expense'); setCurrentPage(1); }}>
            Expenses
          </button>
          <button className={`pill ${typeFilter === 'income' ? 'active' : ''}`} onClick={() => { setTypeFilter('income'); setCurrentPage(1); }}>
            Income
          </button>
          <button className={`pill ${typeFilter === 'transfer' ? 'active' : ''}`} onClick={() => { setTypeFilter('transfer'); setCurrentPage(1); }}>
            Transfers ⇄
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={accountFilter}
            onChange={e => { setAccountFilter(e.target.value); setCurrentPage(1); }}
            style={{ width: 'auto', minWidth: '170px', padding: '6px 12px', fontSize: '12px', background: '#020617', borderColor: '#334155', color: '#f8fafc', borderRadius: '6px' }}
          >
            <option value="all">🏦 All Accounts & Banks</option>
            {assets.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({money(a.current_value, settings)})
              </option>
            ))}
          </select>

          {availableCategories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              style={{ width: 'auto', minWidth: '140px', padding: '6px 10px', fontSize: '12px', background: '#020617', borderColor: '#334155', color: '#f8fafc', borderRadius: '6px', cursor: 'pointer' }}
            >
              <option value="all">📁 All Categories</option>
              {availableCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 Search description, category..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{ width: '200px', padding: '6px 24px 6px 10px', fontSize: '12px', background: '#020617', borderColor: '#334155', color: '#f8fafc', borderRadius: '6px' }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', padding: 0 }}
              >
                ×
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Page View:</span>
            <select
              value={pageSize}
              onChange={e => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                setPageSize(val);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('cashflow_page_size', String(val));
                  localStorage.setItem('preferred_page_size', String(val));
                }
                setCurrentPage(1);
              }}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                background: '#020617',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                cursor: 'pointer'
              }}
            >
              <option value={10}>10 records</option>
              <option value={25}>25 records</option>
              <option value={50}>50 records</option>
              <option value={100}>100 records</option>
              <option value="all">All records</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #1e293b' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', textAlign: 'left' }}>
              <th style={{ padding: '12px 14px' }}>Date</th>
              <th style={{ padding: '12px 14px' }}>Type</th>
              <th style={{ padding: '12px 14px' }}>Category</th>
              <th style={{ padding: '12px 14px' }}>Description / Account Flow</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  {items.length === 0 ? 'No transactions recorded yet.' : 'No transactions found matching your filters.'}
                </td>
              </tr>
            ) : (
              paginatedTransactions.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#94a3b8' }}>{formatDate(tx.date, settings)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                      background: tx.type === 'income' ? 'rgba(16, 185, 129, 0.15)' : tx.type === 'transfer' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: tx.type === 'income' ? '#10b981' : tx.type === 'transfer' ? '#38bdf8' : '#ef4444'
                    }}>
                      {tx.type === 'income' ? 'Income' : tx.type === 'transfer' ? 'Transfer ⇄' : 'Expense'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{tx.category}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ color: '#f8fafc', fontWeight: 500 }}>{tx.description || '-'}</div>
                    {tx.type === 'transfer' ? (
                      <div style={{ marginTop: '3px', fontSize: '11px', color: '#38bdf8' }}>
                        <span style={{ color: '#94a3b8' }}>From:</span> <strong>{tx.account_name || 'Account'}</strong> ➔ <span style={{ color: '#94a3b8' }}>To:</span> <strong>{tx.to_account_name || 'Account'}</strong>
                      </div>
                    ) : tx.account_name ? (
                      <div style={{ marginTop: '3px', fontSize: '11px', color: '#64748b' }}>
                        {tx.type === 'expense' ? 'Paid from: ' : 'Deposited to: '}
                        <strong style={{ color: '#94a3b8' }}>{tx.account_name}</strong>
                      </div>
                    ) : null}
                  </td>
                  <td style={{
                    padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px',
                    color: tx.type === 'income' ? '#10b981' : tx.type === 'transfer' ? '#38bdf8' : '#ef4444'
                  }}>
                    {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '⇄ ' : '-'}{money(tx.amount, settings)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        className="secondary"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => setEditingTx(tx)}
                      >
                        Edit
                      </button>
                      <button
                        className="danger"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => handleDelete(tx.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <PaginationBar
          totalRecords={filtered.length}
          pageSize={pageSize}
          currentPage={safeCurrentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={val => {
            setPageSize(val);
            if (typeof window !== 'undefined') {
              localStorage.setItem('cashflow_page_size', String(val));
              localStorage.setItem('preferred_page_size', String(val));
            }
            setCurrentPage(1);
          }}
        />
      </div>

      {editingTx && (
        <TransactionModal
          initial={editingTx}
          assets={assets}
          categories={categories}
          settings={settings}
          onCancel={() => setEditingTx(null)}
          onSave={handleSave}
        />
      )}
    </section>
  );
}

// ─── PAY INSURANCE PREMIUM MODAL ─────────────────────────────────────────────
function PayPremiumModal({ policy, assets, settings, onCancel, onConfirm }) {
  const [amount, setAmount] = useState(policy.premium_amount || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState(policy.account_id || '');
  const [syncCashflow, setSyncCashflow] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setPaying(true);
    setError('');
    try {
      await onConfirm({
        amount: Number(amount),
        date,
        account_id: accountId ? Number(accountId) : null,
        syncCashflow
      });
    } catch (err) {
      setError(err.message || 'Payment failed');
      setPaying(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit} style={{ maxWidth: '480px', width: '90%' }}>
        <h2>Pay Insurance Premium</h2>
        <p className="muted" style={{ margin: '4px 0 16px' }}>
          <strong>{policy.policy_name}</strong> ({policy.provider}) • Frequency: {policy.premium_frequency}
        </p>

        {error && <div className="error" style={{ marginBottom: '14px' }}>{error}</div>}

        <div className="form-grid">
          <label>
            Premium Amount ({settings.currency_symbol || '₹'})
            <input
              type="number"
              step="any"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </label>

          <label>
            Payment Date
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </label>

          <label style={{ gridColumn: 'span 2' }}>
            Paid From Bank Account
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
            >
              <option value="">-- Select Bank Account --</option>
              {assets.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({money(a.current_value, settings)})
                </option>
              ))}
            </select>
          </label>

          <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#94a3b8' }}>
            <input
              type="checkbox"
              checked={syncCashflow}
              onChange={e => setSyncCashflow(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Deduct from bank account balance and record expense under Cashflow
          </label>
        </div>

        <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', marginTop: '16px', fontSize: '13px', color: '#38bdf8' }}>
          ℹ️ Next due date will automatically advance by one {policy.premium_frequency} period upon payment confirmation.
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={paying}>
            {paying ? 'Processing...' : 'Confirm Premium Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── INSURANCE POLICY MODAL ──────────────────────────────────────────────────
function PolicyModal({ initial, assets, settings, onCancel, onSave }) {
  const [form, setForm] = useState(() => {
    const start_date = initial?.start_date || new Date().toISOString().split('T')[0];
    const maturity_date = initial?.maturity_date || '';
    const policy_term = initial?.policy_term || calculateInsuranceTerm(start_date, maturity_date) || '';
    return {
      policy_name: '',
      provider: '',
      policy_type: 'term_life',
      policy_number: '',
      sum_assured: '',
      cash_value: '',
      premium_amount: '',
      premium_frequency: 'annual',
      next_due_date: '',
      start_date,
      maturity_date,
      policy_term,
      maturity_payout_option: 'Payment on Maturity + Accrued Bonuses',
      maturity_amount: '',
      vested_bonus: '',
      loyalty_addition: '',
      account_id: '',
      nominee: '',
      status: 'active',
      notes: '',
      ...(initial || {})
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleDateChange = (field, val) => {
    setForm(prev => {
      const nextStart = field === 'start_date' ? val : prev.start_date;
      const nextMaturity = field === 'maturity_date' ? val : prev.maturity_date;
      const autoTerm = calculateInsuranceTerm(nextStart, nextMaturity);
      return {
        ...prev,
        [field]: val,
        policy_term: autoTerm || prev.policy_term
      };
    });
  };

  const autoSuggestedSum = (Number(form.sum_assured) || 0) + (Number(form.vested_bonus) || 0) + (Number(form.loyalty_addition) || 0);

  const calcSuggestedMaturity = () => {
    if (autoSuggestedSum > 0) {
      setForm(prev => ({ ...prev, maturity_amount: autoSuggestedSum }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.policy_name.trim()) { setError('Policy name is required'); return; }
    if (!form.provider.trim()) { setError('Provider is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        sum_assured: Number(form.sum_assured) || 0,
        cash_value: Number(form.cash_value) || 0,
        premium_amount: Number(form.premium_amount) || 0,
        maturity_amount: form.maturity_amount !== '' && form.maturity_amount !== null ? Number(form.maturity_amount) : 0,
        vested_bonus: form.vested_bonus !== '' && form.vested_bonus !== null ? Number(form.vested_bonus) : 0,
        loyalty_addition: form.loyalty_addition !== '' && form.loyalty_addition !== null ? Number(form.loyalty_addition) : 0,
        account_id: form.account_id ? Number(form.account_id) : null
      });
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit} style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>{initial?.id ? 'Edit Insurance Policy' : 'Add New Insurance Policy'}</h2>
        {error && <div className="error" style={{ marginBottom: '14px' }}>{error}</div>}

        <div className="form-grid">
          <label>
            Policy Name *
            <input
              type="text"
              required
              placeholder="e.g. LIC's Nivesh Plus, Jeevan Labh"
              value={form.policy_name}
              onChange={e => setForm({ ...form, policy_name: e.target.value })}
            />
          </label>

          <label>
            Provider / Insurer *
            <input
              type="text"
              required
              placeholder="e.g. LIC, HDFC Life, ICICI Pru, Star Health"
              value={form.provider}
              onChange={e => setForm({ ...form, provider: e.target.value })}
            />
          </label>

          <label>
            Policy Type
            <select
              value={form.policy_type}
              onChange={e => setForm({ ...form, policy_type: e.target.value })}
            >
              <option value="term_life">Term Life Insurance (Pure Cover)</option>
              <option value="endowment">Endowment / Money Back (Savings)</option>
              <option value="ulip">ULIP (Unit Linked Investment)</option>
              <option value="health">Health Insurance (Mediclaim)</option>
              <option value="vehicle">Vehicle / Motor Insurance</option>
              <option value="other">Other / General</option>
            </select>
          </label>

          <label>
            Policy Number
            <input
              type="text"
              placeholder="e.g. 507864590"
              value={form.policy_number}
              onChange={e => setForm({ ...form, policy_number: e.target.value })}
            />
          </label>

          <label>
            Policy Commencement Date (DOC)
            <input
              type="date"
              value={form.start_date || ''}
              onChange={e => handleDateChange('start_date', e.target.value)}
            />
          </label>

          <label>
            Policy Maturity / Expiry Date
            <input
              type="date"
              value={form.maturity_date || ''}
              onChange={e => handleDateChange('maturity_date', e.target.value)}
            />
          </label>

          <label>
            Policy Term (Auto-calculated)
            <input
              type="text"
              placeholder="e.g. 10 Years"
              value={form.policy_term}
              onChange={e => setForm({ ...form, policy_term: e.target.value })}
            />
          </label>

          <label>
            Sum Assured / Life Cover ({settings.currency_symbol || '₹'})
            <input
              type="number"
              step="any"
              placeholder="e.g. 125000"
              value={form.sum_assured}
              onChange={e => setForm({ ...form, sum_assured: e.target.value })}
            />
          </label>

          <label>
            Payment on Maturity Option
            <select
              value={form.maturity_payout_option || 'Payment on Maturity + Accrued Bonuses'}
              onChange={e => setForm({ ...form, maturity_payout_option: e.target.value })}
            >
              <option value="Payment on Maturity (Lump Sum)">Payment on Maturity (Lump Sum)</option>
              <option value="Payment on Maturity + Accrued Bonuses">Payment on Maturity + Accrued Bonuses</option>
              <option value="Periodic Survival / Money Back Payouts">Periodic Survival / Money Back Payouts</option>
              <option value="Annuity / Monthly Pension">Annuity / Monthly Pension</option>
              <option value="Settlement in Installments (5/10/15 Years)">Settlement in Installments (5/10/15 Years)</option>
              <option value="No Maturity Benefit (Pure Term Cover)">No Maturity Benefit (Pure Term Cover)</option>
            </select>
          </label>

          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Estimated Payment on Maturity ({settings.currency_symbol || '₹'})</span>
              {autoSuggestedSum > 0 && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  onClick={calcSuggestedMaturity}
                  title="Click to sum: Sum Assured + Vested Bonus + Loyalty Addition"
                >
                  ⚡ Auto-Sum ({money(autoSuggestedSum, settings)})
                </button>
              )}
            </div>
            <input
              type="number"
              step="any"
              placeholder="e.g. 250000"
              value={form.maturity_amount}
              onChange={e => setForm({ ...form, maturity_amount: e.target.value })}
            />
          </label>

          <label>
            Vested Bonus / Guaranteed Addition ({settings.currency_symbol || '₹'})
            <input
              type="number"
              step="any"
              placeholder="0.00"
              value={form.vested_bonus}
              onChange={e => setForm({ ...form, vested_bonus: e.target.value })}
            />
          </label>

          <label>
            Interim Bonus / Loyalty Addition ({settings.currency_symbol || '₹'})
            <input
              type="number"
              step="any"
              placeholder="0.00"
              value={form.loyalty_addition}
              onChange={e => setForm({ ...form, loyalty_addition: e.target.value })}
            />
          </label>

          <label>
            Current Cash / Surrender Value (Adds To Net Worth)
            <input
              type="number"
              step="any"
              placeholder="0.00"
              value={form.cash_value}
              onChange={e => setForm({ ...form, cash_value: e.target.value })}
            />
          </label>

          <label>
            Premium Amount ({settings.currency_symbol || '₹'})
            <input
              type="number"
              step="any"
              placeholder="0.00"
              value={form.premium_amount}
              onChange={e => setForm({ ...form, premium_amount: e.target.value })}
            />
          </label>

          <label>
            Payment Frequency
            <select
              value={form.premium_frequency}
              onChange={e => setForm({ ...form, premium_frequency: e.target.value })}
            >
              <option value="annual">Annual (Yearly)</option>
              <option value="semi_annual">Semi-Annual (Half-Yearly)</option>
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
              <option value="single_premium">Single Premium / One-Time</option>
            </select>
          </label>

          <label>
            Next Premium Due Date
            <input
              type="date"
              value={form.next_due_date || ''}
              onChange={e => setForm({ ...form, next_due_date: e.target.value })}
            />
          </label>

          <label>
            Payment Bank Account
            <select
              value={form.account_id || ''}
              onChange={e => setForm({ ...form, account_id: e.target.value })}
            >
              <option value="">-- Select Bank Account --</option>
              {assets.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({money(a.current_value, settings)})
                </option>
              ))}
            </select>
          </label>

          <label>
            Nominee Name
            <input
              type="text"
              placeholder="e.g. Spouse / Parent / Children"
              value={form.nominee}
              onChange={e => setForm({ ...form, nominee: e.target.value })}
            />
          </label>

          <label>
            Policy Status
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="lapsed">Lapsed</option>
              <option value="matured">Matured</option>
              <option value="surrendered">Surrendered</option>
            </select>
          </label>

          <label style={{ gridColumn: 'span 2' }}>
            Notes / Policy Details
            <input
              type="text"
              placeholder="e.g. Critical illness rider included, tax saving 80C"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving...' : initial?.id ? 'Update Policy' : 'Save Policy'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── INSURANCE PORTFOLIO COMPONENT ───────────────────────────────────────────
function InsurancePortfolio({ settings, categories }) {
  const [policies, setPolicies] = useState([]);
  const [assets, setAssets] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [payingPolicy, setPayingPolicy] = useState(null);
  const [notification, setNotification] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('insurance_page_size') || localStorage.getItem('preferred_page_size')) : null;
    return saved === 'all' ? 'all' : (saved ? Number(saved) : 10);
  });
  const [currentPage, setCurrentPage] = useState(1);

  const load = async () => {
    try {
      const [insData, assetData] = await Promise.all([
        api('/insurance'),
        api('/assets')
      ]);
      setPolicies(insData || []);
      setAssets(assetData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalLifeCover = policies
    .filter(p => ['term_life', 'endowment', 'ulip'].includes(p.policy_type) && p.status === 'active')
    .reduce((s, p) => s + Number(p.sum_assured || 0), 0);

  const totalHealthCover = policies
    .filter(p => p.policy_type === 'health' && p.status === 'active')
    .reduce((s, p) => s + Number(p.sum_assured || 0), 0);

  const totalCashValue = policies
    .filter(p => p.status === 'active')
    .reduce((s, p) => s + Number(p.cash_value || 0), 0);

  const totalAnnualPremiums = policies
    .filter(p => p.status === 'active')
    .reduce((s, p) => {
      const amt = Number(p.premium_amount || 0);
      const freq = (p.premium_frequency || 'annual').toLowerCase();
      if (freq === 'monthly') return s + (amt * 12);
      if (freq === 'quarterly') return s + (amt * 4);
      if (freq === 'semi_annual' || freq === 'half_yearly') return s + (amt * 2);
      return s + amt;
    }, 0);

  const filteredPolicies = policies.filter(p => {
    if (filterType !== 'all' && p.policy_type !== filterType) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const match = (p.policy_name || '').toLowerCase().includes(q) ||
        (p.provider || '').toLowerCase().includes(q) ||
        (p.policy_number || '').toLowerCase().includes(q) ||
        (p.nominee || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? filteredPolicies.length : Number(pageSize || 10);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(filteredPolicies.length / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedPolicies = useMemo(() => {
    if (isAll) return filteredPolicies;
    const start = (safeCurrentPage - 1) * effectivePageSize;
    return filteredPolicies.slice(start, start + effectivePageSize);
  }, [filteredPolicies, isAll, safeCurrentPage, effectivePageSize]);

  const handleSavePolicy = async (form) => {
    if (form.id) {
      await api(`/insurance/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      setNotification(`Updated policy "${form.policy_name}" successfully!`);
    } else {
      await api('/insurance', { method: 'POST', body: JSON.stringify(form) });
      setNotification(`Added policy "${form.policy_name}" successfully!`);
    }
    setEditingPolicy(null);
    await load();
    setTimeout(() => setNotification(''), 4000);
  };

  const handleDeletePolicy = async (id) => {
    if (!confirm('Are you sure you want to delete this insurance policy?')) return;
    await api(`/insurance/${id}`, { method: 'DELETE' });
    await load();
    setNotification('Policy deleted successfully.');
    setTimeout(() => setNotification(''), 4000);
  };

  const handlePayPremium = async (payload) => {
    await api(`/insurance/${payingPolicy.id}/pay-premium`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setPayingPolicy(null);
    await load();
    setNotification(`Premium payment recorded for "${payingPolicy.policy_name}"! Next due date advanced.`);
    setTimeout(() => setNotification(''), 5000);
  };

  const policyTypeLabels = {
    term_life: 'Term Life Insurance',
    endowment: 'Endowment / Money Back',
    ulip: 'ULIP / Investment Plan',
    health: 'Health Insurance',
    vehicle: 'Vehicle / Motor',
    other: 'General Insurance'
  };

  return (
    <section className="page">
      <div className="overview-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1>Insurance & Protection</h1>
          <p>Track your Term Life, ULIPs, health policies, coverage limits, and premium schedules.</p>
        </div>
        <button className="primary" onClick={() => setEditingPolicy({})} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>+</span> Add New Policy
        </button>
      </div>

      {notification && (
        <div style={{ padding: '12px 18px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ {notification}</span>
          <button style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '18px', padding: 0 }} onClick={() => setNotification('')}>×</button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Total Life Cover</span>
          <strong style={{ color: '#10b981', fontSize: '22px', marginTop: '4px', display: 'block' }}>
            {money(totalLifeCover, settings)}
          </strong>
          <small style={{ color: '#64748b', fontSize: '11px' }}>Family protection / Sum assured</small>
        </div>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Total Health Cover</span>
          <strong style={{ color: '#38bdf8', fontSize: '22px', marginTop: '4px', display: 'block' }}>
            {money(totalHealthCover, settings)}
          </strong>
          <small style={{ color: '#64748b', fontSize: '11px' }}>Medical / Hospitalization floater</small>
        </div>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Annual Premiums</span>
          <strong style={{ color: '#f59e0b', fontSize: '22px', marginTop: '4px', display: 'block' }}>
            {money(totalAnnualPremiums, settings)} / yr
          </strong>
          <small style={{ color: '#64748b', fontSize: '11px' }}>Total yearly renewal outflow</small>
        </div>
        <div className="card stat-card" style={{ padding: '16px', background: '#0f172a', border: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: '#a855f7', textTransform: 'uppercase' }}>Cash / Surrender Value</span>
          <strong style={{ color: '#a855f7', fontSize: '22px', marginTop: '4px', display: 'block' }}>
            {money(totalCashValue, settings)}
          </strong>
          <small style={{ color: '#64748b', fontSize: '11px' }}>ULIP & endowment fund value (in Net Worth)</small>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', background: '#0f172a', padding: '12px 16px', borderRadius: '10px', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`pill ${filterType === 'all' ? 'active' : ''}`} onClick={() => { setFilterType('all'); setCurrentPage(1); }}>
            All Policies ({policies.length})
          </button>
          <button className={`pill ${filterType === 'term_life' ? 'active' : ''}`} onClick={() => { setFilterType('term_life'); setCurrentPage(1); }}>
            Term Life
          </button>
          <button className={`pill ${filterType === 'endowment' ? 'active' : ''}`} onClick={() => { setFilterType('endowment'); setCurrentPage(1); }}>
            Endowment / Savings
          </button>
          <button className={`pill ${filterType === 'ulip' ? 'active' : ''}`} onClick={() => { setFilterType('ulip'); setCurrentPage(1); }}>
            ULIP
          </button>
          <button className={`pill ${filterType === 'health' ? 'active' : ''}`} onClick={() => { setFilterType('health'); setCurrentPage(1); }}>
            Health
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 Search policies, providers..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{ width: '210px', padding: '6px 24px 6px 10px', fontSize: '12px', background: '#020617', borderColor: '#334155', color: '#f8fafc', borderRadius: '6px' }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', padding: 0 }}
              >
                ×
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Page View:</span>
            <select
              value={pageSize}
              onChange={e => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                setPageSize(val);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('insurance_page_size', String(val));
                  localStorage.setItem('preferred_page_size', String(val));
                }
                setCurrentPage(1);
              }}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                background: '#020617',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                cursor: 'pointer'
              }}
            >
              <option value={10}>10 records</option>
              <option value={25}>25 records</option>
              <option value={50}>50 records</option>
              <option value="all">All records</option>
            </select>
          </div>
        </div>
      </div>

      {/* Policy Cards Grid */}
      {paginatedPolicies.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b', border: '1px solid #1e293b' }}>
          <p style={{ margin: 0, fontSize: '15px' }}>{policies.length === 0 ? 'No insurance policies found. Click "+ Add New Policy" to track your life, health, or investment policies!' : 'No insurance policies found matching your search or filters.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
          {paginatedPolicies.map(policy => {
            const isDueSoon = policy.next_due_date && (() => {
              const diff = new Date(policy.next_due_date).getTime() - new Date().getTime();
              return diff >= 0 && diff <= (30 * 24 * 60 * 60 * 1000);
            })();

            return (
              <div key={policy.id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #334155' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>{policy.policy_name}</h4>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{policy.provider} {policy.policy_number ? `• #${policy.policy_number}` : ''}</span>
                    </div>
                    <span style={{
                      padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                      background: policy.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                      color: policy.status === 'active' ? '#10b981' : '#94a3b8',
                      textTransform: 'uppercase'
                    }}>
                      {policyTypeLabels[policy.policy_type] || policy.policy_type}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
                    {(policy.policy_term || calculateInsuranceTerm(policy.start_date, policy.maturity_date)) && (
                      <span style={{ background: '#1e293b', padding: '2px 8px', borderRadius: '4px', color: '#38bdf8', fontWeight: 600 }}>
                        ⏱ Term: {policy.policy_term || calculateInsuranceTerm(policy.start_date, policy.maturity_date)}
                      </span>
                    )}
                    {policy.start_date && (
                      <span>Commenced: <strong style={{ color: '#e2e8f0' }}>{formatDate(policy.start_date, settings)}</strong></span>
                    )}
                    {policy.maturity_date && (
                      <span>• Maturity: <strong style={{ color: '#e2e8f0' }}>{formatDate(policy.maturity_date, settings)}</strong></span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Sum Assured (Cover)</span>
                      <strong style={{ color: '#10b981', fontSize: '15px' }}>
                        {policy.sum_assured ? money(policy.sum_assured, settings) : '-'}
                      </strong>
                    </div>
                    {policy.cash_value > 0 ? (
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>Cash Value</span>
                        <strong style={{ color: '#a855f7', fontSize: '15px' }}>
                          {money(policy.cash_value, settings)}
                        </strong>
                      </div>
                    ) : (
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>Nominee</span>
                        <strong style={{ color: '#e2e8f0' }}>{policy.nominee || '-'}</strong>
                      </div>
                    )}
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Premium</span>
                      <strong style={{ color: '#f59e0b' }}>
                        {policy.premium_amount ? `${money(policy.premium_amount, settings)} (${policy.premium_frequency})` : '-'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Next Due Date</span>
                      <strong style={{ color: isDueSoon ? '#ef4444' : '#e2e8f0' }}>
                        {policy.next_due_date ? formatDate(policy.next_due_date, settings) : '-'}
                        {isDueSoon && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#ef4444' }}>⚠️ Due Soon</span>}
                      </strong>
                    </div>
                  </div>

                  {(policy.maturity_payout_option || policy.maturity_amount > 0 || policy.vested_bonus > 0 || policy.loyalty_addition > 0) && (
                    <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: (policy.vested_bonus > 0 || policy.loyalty_addition > 0) ? '6px' : 0 }}>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>🎯 {policy.maturity_payout_option || 'Payment on Maturity'}</span>
                        {policy.maturity_amount > 0 && (
                          <span style={{ color: '#94a3b8' }}>
                            Est. Payout: <strong style={{ color: '#10b981', fontSize: '13px' }}>{money(policy.maturity_amount, settings)}</strong>
                          </span>
                        )}
                      </div>
                      {(policy.vested_bonus > 0 || policy.loyalty_addition > 0) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: '#94a3b8', paddingTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                          {policy.vested_bonus > 0 && (
                            <span>Vested Bonus: <strong style={{ color: '#f59e0b' }}>{money(policy.vested_bonus, settings)}</strong></span>
                          )}
                          {policy.loyalty_addition > 0 && (
                            <span>Loyalty Addition: <strong style={{ color: '#a855f7' }}>{money(policy.loyalty_addition, settings)}</strong></span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {policy.cash_value > 0 && policy.nominee && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                      Nominee: <strong style={{ color: '#cbd5e1' }}>{policy.nominee}</strong>
                    </div>
                  )}

                  {policy.account_name && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
                      Auto-payment account: <strong style={{ color: '#94a3b8' }}>{policy.account_name}</strong>
                    </div>
                  )}

                  {policy.notes && (
                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', marginBottom: '14px' }}>
                      "{policy.notes}"
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    className="primary"
                    style={{ flex: 1, padding: '7px 12px', fontSize: '13px' }}
                    onClick={() => setPayingPolicy(policy)}
                  >
                    ✓ Pay Premium
                  </button>
                  <button
                    className="secondary"
                    style={{ padding: '7px 12px', fontSize: '13px' }}
                    onClick={() => setEditingPolicy(policy)}
                  >
                    Edit
                  </button>
                  <button
                    className="danger"
                    style={{ padding: '7px 12px', fontSize: '13px' }}
                    onClick={() => handleDeletePolicy(policy.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredPolicies.length > 0 && (
        <div style={{ marginTop: '16px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #1e293b' }}>
          <PaginationBar
            totalRecords={filteredPolicies.length}
            pageSize={pageSize}
            currentPage={safeCurrentPage}
            onPageChange={setCurrentPage}
            onPageSizeChange={val => {
              setPageSize(val);
              if (typeof window !== 'undefined') {
                localStorage.setItem('insurance_page_size', String(val));
                localStorage.setItem('preferred_page_size', String(val));
              }
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {payingPolicy && (
        <PayPremiumModal
          policy={payingPolicy}
          assets={assets}
          settings={settings}
          onCancel={() => setPayingPolicy(null)}
          onConfirm={handlePayPremium}
        />
      )}

      {editingPolicy && (
        <PolicyModal
          initial={editingPolicy}
          assets={assets}
          settings={settings}
          onCancel={() => setEditingPolicy(null)}
          onSave={handleSavePolicy}
        />
      )}
    </section>
  );
}


function CsvImporter({ onCancel, onComplete }) {
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ date: '', description: '', amount: '' });
  const [importing, setImporting] = useState(false);
  
  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = text.split('\n').map(r => {
        // very basic CSV parse handling commas inside quotes
        let inQuotes = false;
        let val = '';
        const cols = [];
        for (let i = 0; i < r.length; i++) {
          let char = r[i];
          if (char === '"' && r[i+1] === '"') { val += '"'; i++; }
          else if (char === '"') { inQuotes = !inQuotes; }
          else if (char === ',' && !inQuotes) { cols.push(val.trim()); val = ''; }
          else { val += char; }
        }
        cols.push(val.trim());
        return cols;
      }).filter(r => r.length > 1);
      
      const hdrs = rows[0];
      setHeaders(hdrs);
      setData(rows.slice(1).filter(r => r.length === hdrs.length));
    };
    reader.readAsText(f);
  };

  const executeImport = async () => {
    if (!mapping.date || !mapping.amount) return alert('Date and Amount mappings are required.');
    setImporting(true);
    try {
      const transactions = data.map(row => {
        const rowObj = {};
        headers.forEach((h, i) => rowObj[h] = row[i]);
        
        let amount = Number((rowObj[mapping.amount] || '').replace(/[^0-9.-]+/g,""));
        let type = amount < 0 ? 'expense' : 'income';
        amount = Math.abs(amount);
        
        // Parse dates safely (assume YYYY-MM-DD or DD/MM/YYYY, fallback to today)
        let d = new Date(rowObj[mapping.date]);
        let dateStr = isNaN(d) ? new Date().toISOString().slice(0,10) : d.toISOString().slice(0,10);

        return {
          date: dateStr,
          description: mapping.description ? rowObj[mapping.description] : 'CSV Import',
          amount: amount,
          type: type,
          category: type === 'expense' ? 'Misc Expense' : 'Misc Income'
        };
      }).filter(t => t.amount > 0);
      
      const res = await api('/cashflow/bulk', {
        method: 'POST',
        body: JSON.stringify({ transactions })
      });
      if (res.error) throw new Error(res.error);
      alert(`Successfully imported ${res.count} transactions!`);
      onComplete();
    } catch (err) {
      alert(err.message);
      setImporting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '500px' }}>
        <h2>Import CSV</h2>
        {!file ? (
          <div style={{ padding: '20px 0' }}>
            <p style={{ marginBottom: '15px' }} className="muted">Upload your bank statement CSV to bulk import transactions.</p>
            <input type="file" accept=".csv" onChange={handleFile} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
            <p>Found {data.length} rows. Please map your columns:</p>
            
            <label>Date Column
              <select value={mapping.date} onChange={e => setMapping({...mapping, date: e.target.value})}>
                <option value="">-- Select --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            
            <label>Amount Column
              <select value={mapping.amount} onChange={e => setMapping({...mapping, amount: e.target.value})}>
                <option value="">-- Select --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            
            <label>Description Column (Optional)
              <select value={mapping.description} onChange={e => setMapping({...mapping, description: e.target.value})}>
                <option value="">-- Select --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            
            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button onClick={onCancel}>Cancel</button>
              <button onClick={executeImport} className="primary" disabled={importing}>{importing ? 'Importing...' : 'Import Data'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [view, setView] = useState('dashboard');
  const [settings, setSettings] = useState({ currency: 'INR', date_format: 'DD/MM/YYYY' });
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [statementAsset, setStatementAsset] = useState(null);
  const [privacyMode, setPrivacyMode] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('networth_privacy_mode') === 'true' : false;
  });

  const togglePrivacy = () => {
    setPrivacyMode(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('networth_privacy_mode', String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (!user) return;

    // 1. Load user settings and categories immediately
    api('/settings').then((data) => {
      if (data?.settings) setSettings(data.settings || { currency: 'INR', date_format: 'DD/MM/YYYY' });
      if (data?.categories) setCategories(data.categories || DEFAULT_CATEGORIES);
    }).catch(console.error);

    // 2. Defer heavy background processing (subscriptions & foreign exchange rates)
    // so initial view loading, modal opening, and dropdown menus are silky smooth and never get frozen
    const timer = setTimeout(async () => {
      try {
        await api('/subscriptions/process', { method: 'POST' });
      } catch (e) {
        console.warn('Startup subscriptions check:', e);
      }

      try {
        const [assets, liabilities, investments] = await Promise.all([
          api('/assets'),
          api('/liabilities'),
          api('/investments')
        ]);
        const base = settings?.currency || 'INR';
        const currencies = new Set();
        (assets || []).forEach(a => { if (a.currency && a.currency !== base) currencies.add(a.currency); });
        (liabilities || []).forEach(l => { if (l.currency && l.currency !== base) currencies.add(l.currency); });
        (investments || []).forEach(i => { if (i.currency && i.currency !== base) currencies.add(i.currency); });

        if (currencies.size > 0) {
          const symbols = Array.from(currencies).join(',');
          const freshRates = await api(`/settings/live-rates?base=${base}&symbols=${symbols}`);
          if (freshRates && Object.keys(freshRates).length > 0) {
            setSettings(prev => {
              let currentRates = {};
              try { currentRates = JSON.parse(prev?.exchange_rates || '{}'); } catch(e) {}
              const merged = { ...currentRates, ...freshRates };
              return { ...prev, exchange_rates: JSON.stringify(merged, null, 2) };
            });
          }
        }
      } catch (e) {
        console.warn('Startup live rates check:', e);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [user]);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setView('dashboard');
  }

  if (!user) return <Auth onLogin={(u) => { setUser(u); localStorage.setItem('user', JSON.stringify(u)); }} />;

  const currencySymbol = CURRENCIES[settings.currency] || '\u20B9';

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      )
    },
    {
      id: 'assets',
      label: 'Assets',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M19 21v-4" />
          <path d="M15 21v-4" />
          <path d="M9 21v-4" />
          <path d="M5 21v-4" />
          <path d="M3 17h18" />
          <path d="m12 3-10 6v2h20V9L12 3Z" />
        </svg>
      )
    },
    {
      id: 'liabilities',
      label: 'Liabilities',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      )
    },
    {
      id: 'cashflow',
      label: 'Cashflow',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20" />
          <path d="m17 5-5-5-5 5" />
          <path d="m7 19 5 5 5-5" />
        </svg>
      )
    },
    {
      id: 'investments',
      label: 'Investments',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3" />
        </svg>
      )
    },
    {
      id: 'budgets',
      label: 'Budget',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      )
    },
    {
      id: 'goals',
      label: 'Goals',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="6"></circle>
          <circle cx="12" cy="12" r="2"></circle>
        </svg>
      )
    },
    {
      id: 'projections',
      label: 'FIRE Planner',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
      )
    },
    {
      id: 'debtplanner',
      label: 'Debt Planner',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"></line>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
      )
    },
    {
      id: 'subscriptions',
      label: 'Subscriptions',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"></rect>
          <path d="M7 15h0M2 9.5h20"></path>
        </svg>
      )
    },
    {
      id: 'insurance',
      label: 'Insurance',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      )
    },
    {
      id: 'history',
      label: 'History',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.5 1z" />
        </svg>
      )
    },
  ];

  const s = { ...settings, currency_symbol: currencySymbol, privacy_mode: privacyMode, togglePrivacy };

  const pages = {
    dashboard: <Dashboard settings={s} categories={categories} />,
    assets: <CrudPage title="Assets" endpoint="/assets" settings={s}
      fields={[
        { name: 'name', label: 'Name' }, { name: 'category', label: 'Category', type: 'select', options: categories.asset },
        { name: 'current_value', label: 'Current Value', type: 'number' }, 
        { name: 'currency', label: 'Currency', type: 'select', options: Object.keys(CURRENCIES) },
        { name: 'date_added', label: 'Date', type: 'date' }, { name: 'notes', label: 'Notes' }
      ]}
      columns={(s) => [
        { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' },
        { key: 'current_value', label: 'Current Value', render: (r) => (
          <div>
            <div>{money(r.current_value, { currency: r.currency || s.currency })}</div>
            {r.currency && r.currency !== s.currency && (
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                ≈ {money(convertValue(r.current_value, r.currency, s), s)}
              </div>
            )}
          </div>
        )},
        { key: 'statement', label: 'Statement', render: (r) => (
          <button
            className="secondary"
            style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={(e) => { e.stopPropagation(); setStatementAsset(r); }}
          >
            📖 Passbook
          </button>
        )},
        { key: 'date_added', label: 'Date', render: (r) => formatDate(r.date_added, s) },
        { key: 'notes', label: 'Notes' }
      ]}
      performance={{ title: 'Asset Growth', type: 'line', series: [{ key: 'total_assets', label: 'Total Assets', color: '#14b8a6', getValue: (r) => Number(r.current_value || 0) }] }}
    />,
    liabilities: <CrudPage title="Liabilities" endpoint="/liabilities" settings={s}
      fields={[
        { name: 'name', label: 'Name' }, { name: 'category', label: 'Category', type: 'select', options: categories.liability },
        { name: 'current_value', label: 'Current Value', type: 'number' },
        { name: 'currency', label: 'Currency', type: 'select', options: Object.keys(CURRENCIES) },
        { name: 'interest_rate', label: 'Interest Rate (%)', type: 'number' },
        { name: 'minimum_payment', label: 'Monthly EMI Amount', type: 'number' },
        { name: 'emi_day', label: 'Monthly EMI Due Day (1-31)', type: 'number' },
        { name: 'remaining_emis', label: 'Total Remaining EMIs', type: 'number' },
        { name: 'maturity_date', label: 'Loan Ending / Maturity Date', type: 'date' },
        { name: 'date_added', label: 'Date Added', type: 'date' }, { name: 'notes', label: 'Notes' }
      ]}
      columns={(s) => [
        { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' },
        { key: 'current_value', label: 'Balance', render: (r) => (
          <div>
            <div>{money(r.current_value, { currency: r.currency || s.currency })}</div>
            {r.currency && r.currency !== s.currency && (
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                ≈ {money(convertValue(r.current_value, r.currency, s), s)}
              </div>
            )}
          </div>
        )},
        { key: 'interest_rate', label: 'Rate', render: (r) => r.interest_rate ? `${r.interest_rate}%` : '-' },
        { key: 'minimum_payment', label: 'EMI', render: (r) => money(r.minimum_payment || 0, s) },
        { key: 'emi_day', label: 'Due Day', render: (r) => r.emi_day ? `${r.emi_day}th` : '-' },
        { key: 'remaining_emis', label: 'Remaining', render: (r) => r.remaining_emis !== null && r.remaining_emis !== undefined ? `${r.remaining_emis} EMIs` : '-' },
        { key: 'maturity_date', label: 'Ending Date', render: (r) => r.maturity_date ? formatDate(r.maturity_date, s) : '-' },
      ]}
      performance={{ title: 'Liability Trend', type: 'line', series: [{ key: 'total_liabilities', label: 'Total Liabilities', color: '#ef4444', getValue: (r) => Number(r.current_value || 0) }] }}
    />,
    cashflow: <CashflowManager settings={s} categories={categories} onOpenCsvImport={() => setShowCsvImport(true)} onOpenStatement={(asset) => setStatementAsset(asset)} />,
    investments: <PortfolioTracker settings={s} categories={categories} />,
    budgets: <BudgetPlanner settings={s} />,
    goals: <Goals settings={s} />,
    projections: <Projections settings={s} />,
    debtplanner: <DebtPlanner settings={s} categories={categories} />,
    subscriptions: <Subscriptions settings={s} categories={categories} />,
    insurance: <InsurancePortfolio settings={s} categories={categories} />,
    history: <History settings={s} />,
    settings: <Settings settings={s} setSettings={setSettings} categories={categories} setCategories={setCategories} onLogout={logout} />,
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside>
        <div className="brand-row">
          {!sidebarCollapsed && (
            <div className="brand-title">
              <span className="brand-main">NetWorth</span>
              <div className="brand-sub">
                <span>Wealth</span>
                <span>Tracker</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              className="collapse-btn"
              onClick={togglePrivacy}
              title={privacyMode ? "Show Balances & Transactions (Privacy Mode Active)" : "Hide Balances & Transactions for Privacy"}
              style={{ color: privacyMode ? '#f87171' : '#94a3b8' }}
              aria-label="Toggle Privacy Mode"
            >
              {privacyMode ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
            <button className="collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle Sidebar">
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>
          </div>
        </div>
        {navItems.map(item => (
          <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); if (typeof window !== 'undefined' && window.innerWidth <= 768) setSidebarCollapsed(true); }}>
            <b>{item.icon}</b>
            {!sidebarCollapsed && item.label}
          </button>
        ))}
         <button className="logout" onClick={logout}>
          <b>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </b>
          {!sidebarCollapsed && 'Logout'}
        </button>
      </aside>
      <main>
        {pages[view]}
        {showCsvImport && <CsvImporter onCancel={() => setShowCsvImport(false)} onComplete={() => { setShowCsvImport(false); window.location.reload(); }} />}
        {statementAsset && <AccountStatementModal asset={statementAsset} settings={s} onClose={() => setStatementAsset(null)} />}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
