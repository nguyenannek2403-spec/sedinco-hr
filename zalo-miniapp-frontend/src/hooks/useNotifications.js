import { useState, useCallback, useEffect, useRef } from "react";
import { safeGet, safePut } from "../utils/api";

export function useNotifications({ limit = 20, autoFetch = true, onError = null } = {}) {
  const [filter, setFilter] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readCount, setReadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const mountedRef = useRef(true);
  const notificationsRef = useRef([]);
  notificationsRef.current = notifications;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchNotifications = useCallback(
    async ({ filterOverride = null, offset = 0, append = false } = {}) => {
      const targetFilter = filterOverride || filterRef.current || "all";
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const res = await safeGet(
          "/notifications/my",
          { limit, offset, filter: targetFilter },
          { cancelPrevious: false }
        );
        if (!mountedRef.current) return null;
        if (res?.success && res.data) {
          const incoming = Array.isArray(res.data.notifications) ? res.data.notifications : [];
          setNotifications((prev) => {
            if (!append) return incoming;
            const seen = new Set(prev.map((x) => x.id));
            return [...prev, ...incoming.filter((x) => !seen.has(x.id))];
          });
          setUnreadCount(Number(res.data.unread_count) || 0);
          setReadCount(Number(res.data.read_count) || 0);
          setTotalCount(Number(res.data.total_count) || incoming.length);
          setHasMore(Boolean(res.data.has_more));
          return res.data;
        }
      } catch (err) {
        if (onError) onError(err);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
      return null;
    },
    [limit, onError]
  );

  useEffect(() => {
    if (autoFetch) {
      fetchNotifications({ filterOverride: filter, offset: 0, append: false });
    }
  }, [autoFetch, filter, fetchNotifications]);

  const changeFilter = useCallback((nextFilter) => {
    setFilter(nextFilter);
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchNotifications({
      filterOverride: filterRef.current,
      offset: notificationsRef.current.length,
      append: true
    });
  }, [fetchNotifications, hasMore, loadingMore]);

  const markRead = useCallback(async (notif) => {
    if (!notif || !notif.id) return false;
    const notifId = notif.id;
    const wasUnread = Number(notif.is_read || 0) === 0;
    const nowIso = new Date().toISOString();

    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setReadCount((c) => c + 1);
      setNotifications((prev) => {
        if (filterRef.current === "unread") {
          return prev.filter((item) => item.id !== notifId);
        }
        return prev.map((item) =>
          item.id === notifId ? { ...item, is_read: 1, read_at: item.read_at || nowIso } : item
        );
      });
    }

    try {
      const res = await safePut(`/notifications/${notifId}/read`, {});
      if (mountedRef.current && res?.success && res.data) {
        setUnreadCount(Number(res.data.unread_count) || 0);
        if (res.data.read_at) {
          setNotifications((prev) =>
            prev.map((item) =>
              item.id === notifId ? { ...item, is_read: 1, read_at: res.data.read_at } : item
            )
          );
        }
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const nowIso = new Date().toISOString();
    setUnreadCount(0);
    setReadCount((c) => Math.max(c, totalCount));
    setNotifications((prev) => {
      if (filterRef.current === "unread") return [];
      return prev.map((item) => ({
        ...item,
        is_read: 1,
        read_at: item.read_at || nowIso
      }));
    });

    try {
      const res = await safePut("/notifications/read-all", {});
      if (mountedRef.current && res?.success) {
        setUnreadCount(0);
      }
      return true;
    } catch (err) {
      await fetchNotifications({ filterOverride: filterRef.current, offset: 0, append: false });
      throw err;
    }
  }, [fetchNotifications, totalCount]);

  return {
    filter,
    changeFilter,
    notifications,
    unreadCount,
    readCount,
    totalCount,
    hasMore,
    loading,
    loadingMore,
    fetchNotifications,
    loadMore,
    markRead,
    markAllRead
  };
}
