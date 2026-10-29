"use client";

import { useEffect, useState } from "react";
import { USERNAME_STORAGE_KEY } from "@/server/username";

export function useUsername() {
  const [username, setUsername] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(USERNAME_STORAGE_KEY)?.trim();
    if (stored) setUsername(stored);
    setLoaded(true);
  }, []);
  function save(value: string) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 40) return false;
    localStorage.setItem(USERNAME_STORAGE_KEY, trimmed);
    setUsername(trimmed);
    return true;
  }
  return { username, loaded, save };
}

export function UsernameGate({
  onSave,
}: {
  onSave: (value: string) => boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="inline-dialog-backdrop username-gate">
      <form
        className="inline-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!onSave(value)) setError("请输入 1～40 个字符的用户名");
        }}
      >
        <h3>请输入用户名</h3>
        <p>同名用户会使用同一份自定义条件和自选记录。</p>
        <label>
          用户名
          <input
            autoFocus
            value={value}
            maxLength={40}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="inline-dialog-actions">
          <button className="primary" type="submit">
            确定
          </button>
        </div>
      </form>
    </div>
  );
}
