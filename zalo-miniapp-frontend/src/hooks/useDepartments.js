import { useState, useEffect, useCallback } from "react";
import { safeGet } from "../utils/api";

const DEPARTMENTS_EVENT = "sedinco:departments-changed";
let cachedDepartments = [];

export function notifyDepartmentsChanged(nextList = null) {
  if (Array.isArray(nextList)) {
    cachedDepartments = nextList;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DEPARTMENTS_EVENT, {
        detail: Array.isArray(nextList) ? nextList : null
      })
    );
  }
}

export function useDepartments() {
  const [departments, setDepartments] = useState(() => cachedDepartments);
  const [loading, setLoading] = useState(() => cachedDepartments.length === 0);

  const refreshDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeGet("/departments", {}, { cancelPrevious: false });
      if (res?.success && Array.isArray(res.data)) {
        cachedDepartments = res.data;
        setDepartments(res.data);
      }
    } catch {
      // Giữ cache hiện tại nếu mất kết nối tạm thời
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDepartments();
  }, [refreshDepartments]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleSync = (e) => {
      if (Array.isArray(e?.detail)) {
        setDepartments(e.detail);
      } else {
        refreshDepartments();
      }
    };
    window.addEventListener(DEPARTMENTS_EVENT, handleSync);
    return () => window.removeEventListener(DEPARTMENTS_EVENT, handleSync);
  }, [refreshDepartments]);

  const defaultDepartment =
    departments.find((d) => Number(d.is_default) === 1) || departments[0] || null;
  const defaultDepartmentName = defaultDepartment?.name || "Khối Văn phòng";
  const departmentNames = departments.map((d) => d.name).filter(Boolean);

  return {
    departments,
    departmentNames,
    defaultDepartment,
    defaultDepartmentName,
    loading,
    refreshDepartments
  };
}

export default useDepartments;
