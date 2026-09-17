import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

type Role = 'MEMBER' | 'STAFF';
type Tier = 'BRONZE' | 'SILVER' | 'GOLD';

type UserInfo = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  tier?: Tier;
  currentPoints?: number;
  lifetimeEarnedPoints?: number;
};

type AuthResponse = { token: string; user: UserInfo };

type MemberItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  tier: Tier;
  currentPoints: number;
  lifetimeEarnedPoints: number;
  createdAt: string;
  lastActivity: string;
};

type Reward = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  isActive: boolean;
};

const TOKEN_KEY = 'beanbalance-token';

type AuthContextValue = {
  user: UserInfo | null;
  token: string | null;
  signIn: (_response: AuthResponse) => void;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data as T;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  const refreshUser = async (currentToken: string) => {
    try {
      const me = await apiFetch<UserInfo>('/auth/me', {}, currentToken);
      setUser(me);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    void refreshUser(token);
  }, [token]);

  const signIn = (response: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: Role }) {
  const { user, token } = useAuth();
  const location = useLocation();

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function LandingPage() {
  return (
    <div className="page-shell landing-page">
      <header className="hero">
        <p className="eyebrow">BeanBalance</p>
        <h1>Turn every café visit into meaningful loyalty.</h1>
        <p className="lede">BeanBalance helps cafés reward regular visits with live points, tier progression, and fast staff workflows at the point of sale.</p>
        <div className="cta-row">
          <Link className="button primary" to="/register">Join now</Link>
          <Link className="button secondary" to="/login">Log in</Link>
        </div>
      </header>

      <section className="grid three">
        <article className="card">
          <h3>What it solves</h3>
          <p>It makes point tracking clear, keeps balances live, and removes the manual work that slows down café tills.</p>
        </article>
        <article className="card">
          <h3>Main features</h3>
          <p>Tiered points, reward redemption, transaction history, staff member search, and account summaries.</p>
        </article>
        <article className="card">
          <h3>Target audience</h3>
          <p>Independent cafés, coffee chains, and members who value simple, transparent, fast loyalty rewards.</p>
        </article>
      </section>

      <section className="split">
        <div className="card">
          <h3>For café staff</h3>
          <ul>
            <li>Find members quickly by phone number.</li>
            <li>Record purchases in seconds.</li>
            <li>Redeem rewards without balance errors.</li>
          </ul>
        </div>
        <div className="card">
          <h3>For members</h3>
          <ul>
            <li>View a real-time balance and tier.</li>
            <li>See purchase and redemption history.</li>
            <li>Earn faster as they move to Silver and Gold.</li>
          </ul>
        </div>
      </section>

      <section className="card">
        <h3>Tier rules</h3>
        <div className="tiers">
          <div><span className="bubble bronze">Bronze</span><p>0–499 lifetime points</p></div>
          <div><span className="bubble silver">Silver</span><p>500–1499 lifetime points</p></div>
          <div><span className="bubble gold">Gold</span><p>1500+ lifetime points</p></div>
        </div>
      </section>

      <section className="card">
        <h3>Next features</h3>
        <ol>
          <li>Gift-card top-ups and seasonal campaigns.</li>
          <li>QR-code redemption in mobile checkout.</li>
          <li>Personalized member offers and push reminders.</li>
        </ol>
      </section>
    </div>
  );
}

function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    identifier: '',
    phone: '',
    password: '',
    role: 'MEMBER',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const payload = mode === 'login'
        ? { identifier: form.identifier.trim(), password: form.password }
        : { name: form.name, email: form.email, phone: form.phone, password: form.password, role: form.role as Role };

      const response = await apiFetch<AuthResponse>(`/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      signIn(response);
      navigate(response.user.role === 'STAFF' ? '/staff' : '/member');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell auth-page">
      <div className="card form-card">
        <h2>{mode === 'login' ? 'Welcome back' : 'Create an account'}</h2>
        <form onSubmit={handleSubmit} className="stacked-form">
          {mode === 'register' && (
            <label>
              Full name
              <input name="name" value={form.name} onChange={handleChange} required />
            </label>
          )}
          {mode === 'register' && (
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={handleChange} required />
            </label>
          )}
          {mode === 'register' && (
            <label>
              Phone
              <input name="phone" value={form.phone} onChange={handleChange} required />
            </label>
          )}
          {mode === 'login' && (
            <label>
              Email or phone
              <input name="identifier" value={form.identifier} onChange={handleChange} placeholder="Email or phone" required />
            </label>
          )}
          <label>
            Password
            <input name="password" type="password" value={form.password} onChange={handleChange} required />
          </label>
          {mode === 'register' && (
            <label>
              Role
              <select name="role" value={form.role} onChange={handleChange}>
                <option value="MEMBER">Member</option>
                <option value="STAFF">Staff</option>
              </select>
            </label>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Working...' : mode === 'login' ? 'Log in' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StaffDashboard() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await apiFetch<{ data: MemberItem[]; total: number; page: number; pageSize: number; totalPages: number }>(`/members?search=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}&sortBy=${sortBy}&sortOrder=${sortOrder}`, { signal: controller.signal }, token);
        setMembers(result.data);
        setTotal(result.total);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [token, query, sortBy, sortOrder, page, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return (
    <div className="page-shell">
      <div className="topbar">
        <h2>Staff dashboard</h2>
      </div>
      <div className="card controls">
        <label>
          Search by phone, name, or email
          <input value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} placeholder="Try +91 90000 00002" />
        </label>
        <div className="inline-controls">
          <label>
            Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Name</option>
              <option value="phone">Phone</option>
              <option value="tier">Tier</option>
              <option value="currentPoints">Current points</option>
              <option value="lifetimeEarnedPoints">Lifetime points</option>
              <option value="createdAt">Created</option>
            </select>
          </label>
          <label>
            Order
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <label>
            Page size
            <select value={pageSize} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </label>
        </div>
      </div>

      {loading && <div className="status">Loading members…</div>}
      {error && <div className="error-text">{error}</div>}
      {!loading && !error && members.length === 0 && <div className="status">No members matched your search.</div>}

      {!loading && !error && members.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Tier</th>
                <th>Current balance</th>
                <th>Lifetime</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td><Link to={`/staff/member/${member.id}`}>{member.name}</Link></td>
                  <td>{member.phone}</td>
                  <td>{member.tier}</td>
                  <td>{member.currentPoints} pts</td>
                  <td>{member.lifetimeEarnedPoints} pts</td>
                  <td>{new Date(member.lastActivity).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button className="button secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button className="button secondary" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
      </div>
    </div>
  );
}

function MemberDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [member, setMember] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [rewardId, setRewardId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!token || !id) return;
    try {
      setLoading(true);
      const [memberData, summaryData, txData, rewardsData] = await Promise.all([
        apiFetch<any>(`/members/${id}`, {}, token),
        apiFetch<any>(`/members/${id}/summary`, {}, token),
        apiFetch<any>(`/members/${id}/transactions`, {}, token),
        apiFetch<{ data: Reward[] }>('/rewards', {}, token),
      ]);
      setMember(memberData);
      setSummary(summaryData);
      setTransactions(txData);
      setRewards(rewardsData.data);
      setRewardId(rewardsData.data[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load member');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [token, id]);

  const handlePurchase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !id) return;
    setMessage('');
    setError('');

    try {
      const result = await apiFetch<{ message: string; updatedBalance: number; tier: Tier; pointsEarned: number }>(`/members/${id}/purchases`, {
        method: 'POST',
        body: JSON.stringify({ amountPaise: Number(purchaseAmount) * 100, receiptNumber: receiptNumber || undefined }),
      }, token);
      setMessage(`${result.message}: earned ${result.pointsEarned} points and balance is now ${result.updatedBalance}.`);
      setPurchaseAmount('');
      setReceiptNumber('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    }
  };

  const handleRedemption = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !id) return;
    setMessage('');
    setError('');

    try {
      const result = await apiFetch<{ message: string; updatedBalance: number; pointsSpent: number }>(`/members/${id}/redemptions`, {
        method: 'POST',
        body: JSON.stringify({ rewardId }),
      }, token);
      setMessage(`${result.message}: spent ${result.pointsSpent} points and balance is now ${result.updatedBalance}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redemption failed');
    }
  };

  if (loading) return <div className="page-shell"><div className="status">Loading member…</div></div>;
  if (!member || !summary) return <div className="page-shell"><div className="error-text">Member not found.</div></div>;

  return (
    <div className="page-shell member-page">
      <div className="topbar">
        <div>
          <p className="eyebrow">Member record</p>
          <h2>{member.name}</h2>
        </div>
        <Link className="button secondary" to="/staff">Back to staff list</Link>
      </div>

      <div className="card summary-grid">
        <div>
          <div className="label">Current balance</div>
          <div className="balance">{summary.currentPoints}</div>
        </div>
        <div>
          <div className="label">Tier</div>
          <div className="tier-badge" data-tier={summary.tier}>{summary.tier}</div>
        </div>
        <div>
          <div className="label">Lifetime points</div>
          <div>{summary.lifetimeEarnedPoints}</div>
        </div>
      </div>

      {message && <div className="success-text">{message}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="split">
        <div className="card">
          <h3>Record purchase</h3>
          <form onSubmit={handlePurchase} className="stacked-form">
            <label>
              Amount in ₹
              <input type="number" min="1" step="0.01" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} required />
            </label>
            <label>
              Receipt / reference
              <input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} placeholder="Optional" />
            </label>
            <button className="button primary" type="submit">Record purchase</button>
          </form>
        </div>

        <div className="card">
          <h3>Redeem reward</h3>
          <form onSubmit={handleRedemption} className="stacked-form">
            <label>
              Reward
              <select value={rewardId} onChange={(e) => setRewardId(e.target.value)}>
                {rewards.map((reward) => (
                  <option key={reward.id} value={reward.id}>{reward.name} · {reward.pointsCost} pts</option>
                ))}
              </select>
            </label>
            <button className="button primary" type="submit">Redeem</button>
          </form>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h3>Purchase history</h3>
          <ul className="timeline">
            {(transactions?.purchases || []).map((purchase: any) => (
              <li key={purchase.id}>
                <strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(purchase.amountPaise / 100)}</strong>
                <span>{purchase.pointsEarned} pts earned</span>
                <small>{new Date(purchase.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Redemption history</h3>
          <ul className="timeline">
            {(transactions?.redemptions || []).map((redemption: any) => (
              <li key={redemption.id}>
                <strong>{redemption.reward.name}</strong>
                <span>{redemption.pointsSpent} pts spent</span>
                <small>{new Date(redemption.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MemberSelfDashboard() {
  const { user, token } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);

  useEffect(() => {
    if (!token || !user) return;
    const load = async () => {
      const [summaryData, txData, rewardsData] = await Promise.all([
        apiFetch<any>(`/members/${user.id}/summary`, {}, token),
        apiFetch<any>(`/members/${user.id}/transactions`, {}, token),
        apiFetch<{ data: Reward[] }>('/rewards', {}, token),
      ]);
      setSummary(summaryData);
      setTransactions(txData);
      setRewards(rewardsData.data);
    };

    void load();
  }, [user, token]);

  if (!summary) return <div className="page-shell"><div className="status">Loading your account…</div></div>;

  return (
    <div className="page-shell member-page">
      <div className="card summary-grid">
        <div>
          <div className="label">Current balance</div>
          <div className="balance">{summary.currentPoints}</div>
        </div>
        <div>
          <div className="label">Tier</div>
          <div className="tier-badge" data-tier={summary.tier}>{summary.tier}</div>
        </div>
        <div>
          <div className="label">Progress</div>
          <div>{summary.nextTier ? `${summary.progress.remaining} pts to ${summary.nextTier}` : 'Top tier reached'}</div>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h3>Available rewards</h3>
          <ul className="reward-list">
            {rewards.map((reward) => (
              <li key={reward.id}><strong>{reward.name}</strong> — {reward.pointsCost} pts</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Recent activity</h3>
          <ul className="timeline">
            {(transactions?.ledger || []).slice(0, 8).map((entry: any) => (
              <li key={entry.id}>
                <strong>{entry.type}</strong>
                <span>{entry.pointsDelta > 0 ? '+' : ''}{entry.pointsDelta} pts</span>
                <small>{new Date(entry.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const { user, token, logout } = useAuth();

  return (
    <div className="app-shell">
      <nav className="nav-bar">
        <Link to="/" className="brand">BeanBalance</Link>
        {token && user ? (
          <div className="nav-actions">
            <span>{user.name} · {user.role}</span>
            {user.role === 'STAFF' ? <Link to="/staff">Staff dashboard</Link> : <Link to="/member">My account</Link>}
            <button className="button secondary" onClick={logout}>Logout</button>
          </div>
        ) : (
          <div className="nav-actions">
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </div>
        )}
      </nav>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={token && user ? <Navigate to={user.role === 'STAFF' ? '/staff' : '/member'} replace /> : <AuthForm mode="login" />} />
        <Route path="/register" element={token && user ? <Navigate to={user.role === 'STAFF' ? '/staff' : '/member'} replace /> : <AuthForm mode="register" />} />
        <Route path="/staff" element={<ProtectedRoute requiredRole="STAFF"><StaffDashboard /></ProtectedRoute>} />
        <Route path="/staff/member/:id" element={<ProtectedRoute requiredRole="STAFF"><MemberDetailPage /></ProtectedRoute>} />
        <Route path="/member" element={<ProtectedRoute requiredRole="MEMBER"><MemberSelfDashboard /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
