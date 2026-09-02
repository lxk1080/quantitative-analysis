"use client";

import { useState } from "react";

import { ConfirmDialog, Toast } from "./dialogs";
import type { RuleChoice } from "../lib/types";

export function RuleSelector({
  choices,
  selectedId,
  onClose,
  onChoose,
  onEdit,
  onDelete,
}: {
  choices: RuleChoice[];
  selectedId: string | null;
  onClose: () => void;
  onChoose: (choice: RuleChoice) => void;
  onEdit: (choice: RuleChoice) => void;
  onDelete: (choice: RuleChoice) => Promise<boolean>;
}) {
  const [pendingDelete, setPendingDelete] = useState<RuleChoice | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function confirmDelete() {
    if (!pendingDelete || !(await onDelete(pendingDelete))) return;
    setPendingDelete(null);
    setToast("自定义条件已删除");
    window.setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="rule-modal selector-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-selector-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="rule-panel-header">
          <h2 id="rule-selector-title">选择筛选条件</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <RuleGroup
          choices={choices}
          selectedId={selectedId}
          onChoose={onChoose}
          onEdit={onEdit}
          onDelete={setPendingDelete}
        />
        {pendingDelete && (
          <ConfirmDialog
            title="删除自定义条件"
            message={`删除自定义筛选条件“${pendingDelete.title}”？`}
            confirmLabel="删除"
            danger
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDelete}
          />
        )}
        {toast && <Toast message={toast} />}
      </section>
    </div>
  );
}

function RuleGroup({
  choices,
  selectedId,
  onChoose,
  onEdit,
  onDelete,
  empty,
}: {
  choices: RuleChoice[];
  selectedId: string | null;
  onChoose: (choice: RuleChoice) => void;
  onEdit: (choice: RuleChoice) => void;
  onDelete: (choice: RuleChoice) => void;
  empty?: string;
}) {
  return (
    <section className="rule-group">
      {choices.length ? (
        <div className="preset-list">
          {choices.map((choice) => (
            <article
              className={`rule-choice ${choice.id === selectedId ? "selected" : ""}`}
              key={choice.id}
            >
              <button
                className="rule-choice-main"
                onClick={() => onChoose(choice)}
              >
                <span className="rule-choice-heading">
                  <strong>{choice.title}</strong>
                  <span className={`category-tag ${choice.category}`}>
                    {choice.category === "preset" ? "预设" : "自定义"}
                  </span>
                </span>
                <span>{choice.description}</span>
              </button>
              {choice.category === "custom" && (
                <div className="rule-choice-actions">
                  <button onClick={() => onEdit(choice)}>编辑</button>
                  <button
                    className="danger-button"
                    onClick={() => onDelete(choice)}
                  >
                    删除
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : empty ? (
        <p className="muted rule-group-empty">{empty}</p>
      ) : null}
    </section>
  );
}
