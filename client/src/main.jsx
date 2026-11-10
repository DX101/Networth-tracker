import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import html2pdf from 'html2pdf.js';
import './styles.css';

const API = '/api';
const COLORS = ['#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#10b981', '#f97316'];
const CURRENCIES = {
  INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', AED: '\u062F.\u0625'
};
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEFAULT_CATEGORIES = {
  asset: ['Cash', 'Bank Accounts', 'Real Estate', 'Vehicles', 'Crypto', 'Stocks', 'Mutual Funds', 'PF/PPF', 'Gold', 'Other'],
  liability: ['Home Loan', 'Car Loan', 'Personal Loan', 'Credit Card', 'Other Debt'],
  income: ['Salary', 'Freelance', 'Rental', 'Dividends', 'Interest', 'Business', 'Other'],
  expense: ['Housing', 'Food', 'Transport', 'EMI/Loan Payments', 'Subscriptions', 'Medical', 'Utilities', 'Entertainment', 'Shopping', 'Education', 'Insurance', 'Other'],
  investment: ['Stocks', 'Mutual Funds', 'Crypto', 'FD/RD', 'Bonds', 'Real Estate', 'Gold', 'SIP']
};

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}${path}`, {
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

function convertValue(amount, fromCurrency, settings) {
  const num = Number(amount) || 0;
  if (!fromCurrency || fromCurrency === settings?.currency) return num;
  try {
    const rates = JSON.parse(settings?.exchange_rates || '{}');
    if (rates[fromCurrency]) return num * Number(rates[fromCurrency]);
  } catch (e) {}
  return num;
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

function RecentCashFlow({ rows, settings, compact = false }) {
  return <div className={compact ? 'recent-cashflow compact' : 'recent-cashflow'}><div className="section-title"><h3>Recent Cash Flow</h3>{!compact && <span>Latest income and expense entries</span>}</div><div className="cashflow-list">{rows.length === 0 ? <p className="muted">No recent cash flow entries yet.</p> : rows.map((row) => <div className="cashflow-item" key={row.id}><div className={`cash-icon ${row.type}`}>{row.type === 'income' ? '+' : '-'}</div><div><strong>{row.description || row.category}</strong><small>{row.category} {'\u2022'} {formatDate(row.date, settings)}</small></div><span className={row.type === 'income' ? 'good' : 'bad'}>{row.type === 'income' ? '+' : '-'}{money(row.amount, settings)}</span></div>)}</div></div>;
}

function money(value, settings) {
  return `${settings?.currency_symbol || '\u20B9'}${Number(value || 0).toLocaleString()}`;
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
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (err) { setError(err.message); }
  }
  return <div className="auth-shell"><form className="auth-card" onSubmit={submit}>
    <h1>NetWorth Tracker</h1><p>{mode === 'login' ? 'Sign in to continue' : 'Create an account'}</p>
    {error && <div className="error">{error}</div>}
    <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
    <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
    <button>{mode === 'login' ? 'Login' : 'Register'}</button>
    <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Register new account' : 'Back to login'}</button>
  </form></div>;
}

function Table({ columns, rows, onEdit, onDelete }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}<th>Actions</th></tr></thead><tbody>
    {rows.map((row) => <tr key={row.id}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}<td className="actions">{onEdit && <button type="button" className="secondary" onClick={() => onEdit(row)}>Edit</button>}{onDelete && <button type="button" className="danger" onClick={() => onDelete(row.id)}>Delete</button>}</td></tr>)}
  </tbody></table></div>;
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
  async function load() { setRows(await api(endpoint)); }
  useEffect(() => { load(); }, [endpoint]);
  async function save(form) {
    if (form.id) await api(`${endpoint}/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
    else await api(endpoint, { method: 'POST', body: JSON.stringify(form) });
    setEditing(null); await load(); setGraphRefresh((value) => value + 1);
  }
  async function remove(id) { if (confirm('Delete this item?')) { await api(`${endpoint}/${id}`, { method: 'DELETE' }); await load(); setGraphRefresh((value) => value + 1); } }
  return <section className="page"><div className="page-head"><h1>{title}</h1><div style={{display: 'flex', gap: '8px'}}>{customAction}<button onClick={() => setEditing({})}>Add {singular}</button></div></div>{error && <div className="error">{error}</div>}<CrudSummary title={title} rows={rows} settings={settings} /><PerformanceGraph config={performance} settings={settings} refreshKey={graphRefresh} liveRows={rows} /><Table columns={columns(settings)} rows={rows} onEdit={(row) => setEditing({ ...row })} onDelete={remove} />{editing && <Modal title={`${editing.id ? 'Edit' : 'Add'} ${singular}`} fields={fields} initial={editing} onCancel={() => setEditing(null)} onSave={save} />}</section>;
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

function Modal({ title, fields, initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial || {});
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  useEffect(() => setForm(initial || {}), [initial]);
  async function submit(e) { e.preventDefault(); setSaving(true); setModalError(''); try { await onSave(form); } catch(err) { setModalError(err.message); } finally { setSaving(false); } }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><h2>{title}</h2>{modalError && <div className="error">{modalError}</div>}<div className="form-grid">{fields.map(f => { if (f.condition && !f.condition(form)) return null; const resolvedOptions = typeof f.options === 'function' ? f.options(form) : (f.options || []); return <label key={f.name} style={f.type === 'checkbox' ? {display: 'flex', alignItems: 'center', gap: '10px'} : {}}>{f.type === 'checkbox' && <input type="checkbox" checked={!!form[f.name]} onChange={e => setForm({ ...form, [f.name]: e.target.checked })} style={{ width: 'auto' }} />}{f.label}{f.type === 'select' ? <select value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })}><option value="">Select</option>{[...new Set([...resolvedOptions, ...(form[f.name] && !resolvedOptions.includes(form[f.name]) ? [form[f.name]] : [])])].map(o => <option key={o} value={o}>{o}</option>)}</select> : f.type !== 'checkbox' ? <input type={f.type || 'text'} value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} /> : null}</label>; })}</div><div className="modal-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></div></form></div>;
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
      api('/goals')
    ]);
    setData({
      assets: r[0],
      liabilities: r[1],
      investments: r[2],
      cashflow: r[3],
      snapshots: r[4] || [],
      weeklySnapshots: r[5] || [],
      summary: r[6] || null,
      goals: r[7] || []
    });
  }

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const dA = data.assets.reduce((s, x) => s + convertValue(x.current_value, x.currency, settings), 0);
    const liab = data.liabilities.reduce((s, x) => s + convertValue(x.current_value, x.currency, settings), 0);
    const inv = data.investments.reduce((s, x) => s + investmentCurrentValue(x, settings), 0);
    const invCost = data.investments.reduce((s, x) => s + investmentInvestedAmount(x, settings), 0);
    const ncf = data.cashflow.reduce((s, x) => s + convertValue(x.type === 'income' ? x.amount : -x.amount, x.currency, settings), 0);
    const assets = dA + inv;
    return {
      directAssets: dA,
      assets,
      liabilities: liab,
      investments: inv,
      invested: invCost,
      netCashflow: ncf,
      pnl: inv - invCost,
      networth: assets - liab + ncf
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
    { name: 'asset_name', label: 'Name' },
    { name: 'category', label: 'Category', type: 'select', options: getCategoryOptions(['investment']) },
    { name: 'platform', label: 'Platform' },
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'buy_price', label: 'Buy Price', type: 'number' },
    { name: 'current_price', label: 'Current Price', type: 'number' },
    { name: 'buy_date', label: 'Buy Date', type: 'date' },
    { name: 'is_sip', label: 'Is SIP?', type: 'checkbox' },
    { name: 'notes', label: 'Notes' },
    { name: 'interest_rate', label: 'Interest Rate (%)', type: 'number', condition: (form) => ['Bonds', 'FD/RD'].includes(form?.category) },
    { name: 'maturity_date', label: 'Maturity Date', type: 'date', condition: (form) => ['Bonds', 'FD/RD'].includes(form?.category) }
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
          <h1>Dashboard</h1>
          <p className="muted">Track net worth, assets, liabilities, cash flow, investments and budget health.</p>
        </div>
        <div className="quick-actions">
          <button onClick={() => setQuickType('asset')}>+ Asset</button>
          <button onClick={() => setQuickType('liability')}>+ Liability</button>
          <button onClick={() => setQuickType('cashflow')}>+ Cash Flow</button>
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
                <YAxis />
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
                <YAxis />
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
                <YAxis />
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
          recent_transactions: <RecentCashFlow rows={data.cashflow.slice(0, 8)} settings={settings} />
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
      {snapshotReport && <ReportModal title="Snapshot Report" reportText={snapshotReport} onCancel={() => setSnapshotReport(null)} />}
    </section>
  );
}

function Settings({ settings, setSettings, categories, setCategories, onLogout }) {
  const [activeTab, setActiveTab] = useState('general');
  const [catType, setCatType] = useState('asset');
  const [newCat, setNewCat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fetchingRates, setFetchingRates] = useState(false);

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
            
            <div style={{ marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #334155', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              Version 2.2.1 • Built with ❤️
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
                    if (res.success) alert('Backup successful!');
                  }}>Backup Now</button>
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
            {['asset', 'liability', 'income', 'expense', 'investment'].map(t => (
              <button key={t} className={`pill ${catType === t ? 'active' : ''}`} onClick={() => setCatType(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
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
  const [editing, setEditing] = useState(null);
  const [updatingPrice, setUpdatingPrice] = useState(null);
  const [error, setError] = useState('');
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [expandedAsset, setExpandedAsset] = useState(null);
  const [syncing, setSyncing] = useState(false);

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
      const data = await api('/investments');
      setRows(data || []);
    } catch (err) {
      setError('Failed to load portfolio.');
    }
  }

  useEffect(() => { load(); }, []);

  async function save(form) {
    if (form.id) await api(`/investments/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
    else await api('/investments', { method: 'POST', body: JSON.stringify(form) });
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

  const fields = [
    { name: 'asset_name', label: 'Asset Name' },
    { name: 'category', label: 'Category', type: 'select', options: categories.investment },
    { name: 'platform', label: 'Platform' },
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'buy_price', label: 'Buy Price', type: 'number' },
    { name: 'current_price', label: 'Current Price', type: 'number' },
    { name: 'ticker', label: 'Ticker Symbol (Yahoo Finance)', placeholder: 'e.g. RELIANCE.NS, AAPL' },
    { name: 'currency', label: 'Currency', type: 'select', options: Object.keys(CURRENCIES) },
    { name: 'buy_date', label: 'Buy Date', type: 'date' },
    { name: 'is_sip', label: 'Is SIP?', type: 'checkbox' },
    { name: 'notes', label: 'Notes' },
    { name: 'interest_rate', label: 'Interest Rate (%)', type: 'number', condition: (form) => ['Bonds', 'FD/RD'].includes(form?.category) },
    { name: 'maturity_date', label: 'Maturity Date', type: 'date', condition: (form) => ['Bonds', 'FD/RD'].includes(form?.category) }
  ];

  const performanceConfig = {
    title: 'Portfolio Value',
    type: 'line',
    series: [{ key: 'investment_value', label: 'Total Value', color: '#6366f1', getValue: (r) => Number(r.current_value || (Number(r.current_price || 0) * Number(r.quantity || 0))) }],
    currentValues: (rws) => ({ investment_value: rws.reduce((sum, r) => sum + (Number(r.current_price || 0) * Number(r.quantity || 0)), 0) })
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
              {portfolio.map(p => (
                <React.Fragment key={p.asset_name + '_' + (p.currency || '')}>
                  <tr 
                    style={{ cursor: 'pointer', borderBottom: '1px solid #1e293b' }} 
                    onClick={() => setExpandedAsset(expandedAsset === p.asset_name + '_' + (p.currency || '') ? null : p.asset_name + '_' + (p.currency || ''))}
                  >
                    <td style={{ fontWeight: 500 }}>
                      <span style={{ display: 'inline-block', width: '20px', color: '#94a3b8' }}>
                        {expandedAsset === p.asset_name + '_' + (p.currency || '') ? '▼' : '▶'}
                      </span>
                      {p.asset_name} {p.currency && <small style={{ color: '#64748b' }}>({p.currency})</small>}
                    </td>
                    <td><span className="badge" style={{ background: '#334155', color: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{p.category}</span></td>
                    <td style={{ textAlign: 'right' }}>{p.total_quantity}</td>
                    <td style={{ textAlign: 'right' }}>{money(p.avg_buy_price, { ...settings, currency: p.currency || settings.currency })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{money(p.current_price, { ...settings, currency: p.currency || settings.currency })}</td>
                    <td style={{ textAlign: 'right' }}>{money(p.total_invested, { ...settings, currency: p.currency || settings.currency })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{money(p.current_value, { ...settings, currency: p.currency || settings.currency })}</td>
                    <td style={{ textAlign: 'right', color: p.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                      {p.pnl > 0 ? '+' : ''}{money(p.pnl, { ...settings, currency: p.currency || settings.currency })}
                      <small style={{ display: 'block' }}>{p.pnl_percent.toFixed(2)}%</small>
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <button className="icon-btn edit" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} onClick={(e) => {
                        e.stopPropagation();
                        setUpdatingPrice(p);
                      }}>Update Price</button>
                    </td>
                  </tr>
                  
                  {expandedAsset === p.asset_name + '_' + (p.currency || '') && p.lots.map(lot => (
                    <tr key={lot.id} style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderBottom: '1px solid #1e293b' }}>
                      <td colSpan="2" style={{ paddingLeft: '40px', color: '#94a3b8', fontSize: '13px' }}>
                        ↳ {formatDate(lot.buy_date, settings)} {lot.is_sip ? '(SIP)' : ''} {lot.platform ? `via ${lot.platform}` : ''}
                        {lot.interest_rate > 0 ? ` • ${lot.interest_rate}% Yield` : ''}
                        {lot.maturity_date ? ` • Mat: ${formatDate(lot.maturity_date, settings)}` : ''}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '13px' }}>{lot.quantity}</td>
                      <td style={{ textAlign: 'right', fontSize: '13px' }}>{money(lot.buy_price, { ...settings, currency: p.currency || settings.currency })}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontSize: '13px' }}>{money(lot.buy_price * lot.quantity, { ...settings, currency: p.currency || settings.currency })}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontSize: '13px' }}>{money((p.current_price - lot.buy_price) * lot.quantity, { ...settings, currency: p.currency || settings.currency })}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="icon-btn edit" onClick={() => setEditing(lot)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button className="icon-btn delete" onClick={() => remove(lot.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {portfolio.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No investments found in your portfolio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'Add'} Investment Lot`} fields={fields} initial={editing} onCancel={() => setEditing(null)} onSave={save} />
      )}
      {updatingPrice && (
        <Modal 
          title={`Update Price \u2022 ${updatingPrice.asset_name}`}
          fields={[{ name: 'newPrice', label: 'New Price', type: 'number', required: true }]}
          initial={{ newPrice: updatingPrice.current_price }}
          onCancel={() => setUpdatingPrice(null)}
          onSave={async (form) => {
            const parsedPrice = Number(String(form.newPrice).replace(/[^0-9.-]+/g, ''));
            if (isNaN(parsedPrice)) {
              throw new Error('Invalid price entered.');
            }
            await api(`/investments/${updatingPrice.lots[0].id}`, { method: 'PUT', body: JSON.stringify({ ...updatingPrice.lots[0], current_price: parsedPrice }) });
            setUpdatingPrice(null);
            await load();
            setGraphRefresh((value) => value + 1);
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

  async function load() {
    setSubs(await api('/subscriptions'));
  }
  useEffect(() => { load(); }, []);

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

      <div className="data-table">
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
            {subs.map(s => (
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
            {subs.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: 'center', opacity: 0.5 }}>No active subscriptions found.</td></tr>
            )}
          </tbody>
        </table>
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

function DebtPlanner({ settings }) {
  const [liabilities, setLiabilities] = useState([]);
  const [strategy, setStrategy] = useState('avalanche');
  const [extraPayment, setExtraPayment] = useState(100);

  useEffect(() => {
    api('/liabilities').then(data => setLiabilities(data.filter(l => Number(l.current_value) > 0)));
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

  return (
    <section className="page">
      <div className="overview-head">
        <div>
          <h1>Debt Payoff Planner</h1>
          <p>Find the fastest way out of debt using Snowball or Avalanche strategies.</p>
        </div>
      </div>
      
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
          
          <p className="muted" style={{ marginTop: '15px', fontSize: '13px' }}>
            Note: Update your Liabilities' interest rates and minimum payments in the 'Liabilities' tab for accurate calculations.
          </p>
        </div>
      </div>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  useEffect(() => {
    // Process due subscriptions automatically on startup
    api('/subscriptions/process', { method: 'POST' }).catch(console.error);
    
    if (!user) return;
    api('/settings').then(data => {
      if (data?.settings) setSettings(data.settings || { currency: 'INR', date_format: 'DD/MM/YYYY' });
      if (data?.categories) setCategories(data.categories || DEFAULT_CATEGORIES);
    }).catch(() => {});
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

  const s = { ...settings, currency_symbol: currencySymbol };

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
        { key: 'current_value', label: 'Current Value', render: (r) => money(r.current_value, { ...s, currency: r.currency || s.currency }) },
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
        { name: 'minimum_payment', label: 'Min Payment', type: 'number' },
        { name: 'date_added', label: 'Date', type: 'date' }, { name: 'notes', label: 'Notes' }
      ]}
      columns={(s) => [
        { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' },
        { key: 'current_value', label: 'Balance', render: (r) => money(r.current_value, { ...s, currency: r.currency || s.currency }) },
        { key: 'interest_rate', label: 'Rate', render: (r) => r.interest_rate ? `${r.interest_rate}%` : '-' },
        { key: 'minimum_payment', label: 'Min Pmt', render: (r) => money(r.minimum_payment || 0, s) },
      ]}
      performance={{ title: 'Liability Trend', type: 'line', series: [{ key: 'total_liabilities', label: 'Total Liabilities', color: '#ef4444', getValue: (r) => Number(r.current_value || 0) }] }}
    />,
    cashflow: <CrudPage title="Cashflow" endpoint="/cashflow" settings={s}
      customAction={<button onClick={() => setShowCsvImport(true)} className="secondary">Import CSV</button>}
      fields={[
        { name: 'type', label: 'Type', type: 'select', options: ['income', 'expense'] },
        { name: 'category', label: 'Category', type: 'select', options: (form) => form.type === 'income' ? (categories.income || []) : form.type === 'expense' ? (categories.expense || []) : [...(categories.income || []), ...(categories.expense || [])] },
        { name: 'description', label: 'Description' }, { name: 'amount', label: 'Amount', type: 'number' },
        { name: 'date', label: 'Date', type: 'date' }
      ]}
      columns={(s) => [
        { key: 'type', label: 'Type', render: (r) => <span className={r.type === 'income' ? 'good' : 'bad'}>{r.type}</span> },
        { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount', render: (r) => money(r.amount, s) },
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date, s) }
      ]}
      performance={{ 
        title: 'Income vs Expenses', 
        type: 'line', 
        series: [
          { key: 'income', label: 'Total Income', color: '#10b981', getValue: (r) => r.type === 'income' ? Number(r.amount || 0) : 0 },
          { key: 'expense', label: 'Total Expenses', color: '#f43f5e', getValue: (r) => r.type === 'expense' ? Number(r.amount || 0) : 0 }
        ] 
      }}
    />,
    investments: <PortfolioTracker settings={s} categories={categories} />,
    budgets: <BudgetPlanner settings={s} />,
    goals: <Goals settings={s} />,
    projections: <Projections settings={s} />,
    debtplanner: <DebtPlanner settings={s} />,
    subscriptions: <Subscriptions settings={s} categories={categories} />,
    history: <History settings={s} />,
    settings: <Settings settings={settings} setSettings={setSettings} categories={categories} setCategories={setCategories} onLogout={logout} />,
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
          <button className="collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle Sidebar">
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>
        {navItems.map(item => (
          <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
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
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
