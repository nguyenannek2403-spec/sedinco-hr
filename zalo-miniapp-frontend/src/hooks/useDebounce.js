import { useEffect, useState } from "react";

/**
 * Debounce giá trị tìm kiếm (mặc định 300ms) để chống giật lag và spam filter/API khi gõ nhanh trên Mobile.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default useDebouncedValue;
