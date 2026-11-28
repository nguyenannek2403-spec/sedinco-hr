import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safePost, setAuthToken, cancelInflightRequests } from "../utils/api";
import { ROLES } from "../constants/roles";

export const AUTH_TOKEN_KEY = "sedinco_auth_token";
export const AUTH_USER_KEY = "sedinco_miniapp_user";
export const RECENT_USERNAMES_KEY = "sedinco_recent_usernames";
const SKIP_PW_CHANGE_PREFIX = "sedinco_skip_pw_change_";
const LEGACY_SESSION_KEY = "sedinco_auth_session";
const MAX_RECENT_USERNAMES = 3;

function buildSkipPasswordKey(userKey) {
  const clean = String(userKey || "").trim().toUpperCase();
  return clean ? `${SKIP_PW_CHANGE_PREFIX}${clean}` : "";
}

export async function loadSkipPasswordChange(userKey) {
  const key = buildSkipPasswordKey(userKey);
  if (!key) return false;
  try {
    const val = await zmpAdapter.getStorage(key);
    return val === "1" || val === true || val === "true";
  } catch {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }
}

export async function saveSkipPasswordChange(userKey, skipped = true) {
  const key = buildSkipPasswordKey(userKey);
  if (!key) return;
  try {
    if (skipped) {
      await zmpAdapter.setStorage(key, "1");
    } else {
      await zmpAdapter.removeStorage(key);
    }
  } catch {}
}

function stripSensitiveFields(user) {
  if (!user || typeof user !== "object") return null;
  const clean = { ...user };
  delete clean.password;
  delete clean.rawPassword;
  delete clean.old_password;
  delete clean.new_password;
  return clean;
}

export function isUsableAuthToken(token) {
  if (!token || typeof token !== "string") return false;
  const trimmed = token.trim();
  if (!trimmed || trimmed === "mock_jwt_token" || trimmed.startsWith("local_token_")) {
    return false;
  }
  return trimmed.split(".").length === 3;
}

function parseJsonSafe(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function sanitizeRecentUsernames(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const clean = String(item || "").trim();
    if (!clean || clean.length > 100) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= MAX_RECENT_USERNAMES) break;
  }
  return result;
}

export function loadRecentUsernamesSync() {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = parseJsonSafe(localStorage.getItem(RECENT_USERNAMES_KEY));
    return sanitizeRecentUsernames(parsed);
  } catch {
    return [];
  }
}

export async function loadRecentUsernames() {
  try {
    const raw = await zmpAdapter.getStorage(RECENT_USERNAMES_KEY);
    const parsed = Array.isArray(raw) ? raw : parseJsonSafe(raw);
    const sanitized = sanitizeRecentUsernames(parsed);
    if (sanitized.length > 0 && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(RECENT_USERNAMES_KEY, JSON.stringify(sanitized));
      } catch {}
    }
    return sanitized;
  } catch {
    return loadRecentUsernamesSync();
  }
}

export async function pushRecentUsername(rawUsername) {
  const clean = String(rawUsername || "").trim();
  if (!clean || clean.length > 100) {
    return await loadRecentUsernames();
  }
  const existing = await loadRecentUsernames();
  const next = sanitizeRecentUsernames([clean, ...existing]);
  await zmpAdapter.setStorage(RECENT_USERNAMES_KEY, JSON.stringify(next));
  return next;
}

export async function removeRecentUsername(rawUsername) {
  const cleanLower = String(rawUsername || "").trim().toLowerCase();
  const existing = await loadRecentUsernames();
  const next = existing.filter((item) => item.toLowerCase() !== cleanLower);
  if (next.length === 0) {
    await zmpAdapter.removeStorage(RECENT_USERNAMES_KEY);
  } else {
    await zmpAdapter.setStorage(RECENT_USERNAMES_KEY, JSON.stringify(next));
  }
  return next;
}

export async function saveStoredSession(token, user = null) {
  const cleanToken = isUsableAuthToken(token) ? token.trim() : "";
  if (!cleanToken) {
    return false;
  }
  setAuthToken(cleanToken);
  const safeUser = stripSensitiveFields(user);
  await Promise.all([
    zmpAdapter.setStorage(AUTH_TOKEN_KEY, cleanToken),
    safeUser
      ? zmpAdapter.setStorage(AUTH_USER_KEY, JSON.stringify({ ...safeUser, token: cleanToken }))
      : Promise.resolve()
  ]);
  return true;
}

export async function loadStoredSession() {
  try {
    const [rawToken, rawUser] = await Promise.all([
      zmpAdapter.getStorage(AUTH_TOKEN_KEY),
      zmpAdapter.getStorage(AUTH_USER_KEY)
    ]);

    const parsedUser =
      rawUser && typeof rawUser === "object"
        ? stripSensitiveFields(rawUser)
        : stripSensitiveFields(parseJsonSafe(rawUser));

    const candidateToken = isUsableAuthToken(rawToken)
      ? rawToken.trim()
      : isUsableAuthToken(parsedUser?.token)
        ? parsedUser.token.trim()
        : "";

    if (!candidateToken) {
      return {
        hasToken: false,
        token: "",
        user: null
      };
    }

    setAuthToken(candidateToken);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(AUTH_TOKEN_KEY, candidateToken);
        if (parsedUser) {
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify({ ...parsedUser, token: candidateToken }));
        }
      } catch {}
    }

    return {
      hasToken: true,
      token: candidateToken,
      user: parsedUser ? { ...parsedUser, token: candidateToken } : null
    };
  } catch {
    return {
      hasToken: false,
      token: "",
      user: null
    };
  }
}

export async function clearStoredSession({ preserveRecentUsernames = true } = {}) {
  cancelInflightRequests();
  setAuthToken("");
  await Promise.all([
    zmpAdapter.removeStorage(AUTH_TOKEN_KEY),
    zmpAdapter.removeStorage(AUTH_USER_KEY),
    zmpAdapter.removeStorage(LEGACY_SESSION_KEY),
    preserveRecentUsernames ? Promise.resolve() : zmpAdapter.removeStorage(RECENT_USERNAMES_KEY)
  ]).catch(() => {});
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("sedinco_manual_logout");
    }
  } catch {}
}

/**
 * Resolve persisted JWT session cleanly without invoking any Zalo account-link SDK APIs.
 */
export const resolveSession = async () => {
  try {
    const stored = await loadStoredSession();
    if (stored.hasToken && stored.token) {
      return {
        isDetermined: true,
        isLinked: true,
        role: stored.user?.role || ROLES.WORKER,
        user: stored.user,
        employee: stored.user,
        token: stored.token
      };
    }

    return {
      isDetermined: true,
      isLinked: false,
      requiresLogin: true
    };
  } catch (err) {
    return {
      isDetermined: false,
      error: err.message || "Lỗi xác định phiên đăng nhập."
    };
  }
};

export const loginWithCredentials = async (identifier, password) => {
  const cleanId = String(identifier || "").trim();
  const cleanPass = String(password || "").trim();

  const res = await safePost("/login", {
    identifier: cleanId,
    ma_nv: cleanId,
    username: cleanId,
    password: cleanPass
  });

  const payload = res?.data || res;
  const user = payload?.user || (payload?.ma_nv || payload?.username ? payload : null);
  if (user && isUsableAuthToken(payload?.token || user?.token)) {
    const tok = String(payload?.token || user?.token).trim();
    const role = user.role || ROLES.WORKER;
    const sessionData = { ...stripSensitiveFields(user), role, token: tok };
    await saveStoredSession(tok, sessionData);
    await pushRecentUsername(cleanId);
    return { success: true, user: sessionData, role };
  }

  throw new Error(res?.message || "Tài khoản hoặc mật khẩu không chính xác.");
};

export const logoutSession = () => {
  clearStoredSession({ preserveRecentUsernames: true });
};
