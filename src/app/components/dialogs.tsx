"use client";

export function NameDialog({
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="inline-dialog-backdrop">
      <section
        className="inline-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-name-title"
      >
        <h3 id="collection-name-title">收藏自定义条件</h3>
        <label>
          名称
          <input
            autoFocus
            value={value}
            maxLength={40}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onConfirm();
            }}
          />
        </label>
        <div className="inline-dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button
            className="primary"
            disabled={!value.trim()}
            onClick={onConfirm}
          >
            保存
          </button>
        </div>
      </section>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="inline-dialog-backdrop">
      <section
        className="inline-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        <p>{message}</p>
        <div className="inline-dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button
            className={danger ? "danger-primary" : "primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
