"use client";

import { type ReactNode, useState } from "react";

import { NameDialog, Toast } from "./dialogs";
import type { CustomConfig } from "../lib/types";

export function CustomEditor({
  value,
  onChange,
  isEditing,
  onClose,
  onFavorite,
  onConfirm,
}: {
  value: CustomConfig;
  onChange: (next: CustomConfig) => void;
  isEditing: boolean;
  onClose: () => void;
  onFavorite: (title: string) => Promise<boolean>;
  onConfirm: () => Promise<boolean>;
}) {
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [favoriteName, setFavoriteName] = useState("自定义条件");
  const [toast, setToast] = useState<string | null>(null);

  async function favorite() {
    if (!(await onFavorite(favoriteName))) return;
    setFavoriteOpen(false);
    setToast("收藏已保存");
    window.setTimeout(() => setToast(null), 2600);
  }

  async function confirm() {
    if (!(await onConfirm())) return;
    setToast(isEditing ? "自定义条件已更新" : "自定义条件已应用");
    window.setTimeout(onClose, 900);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="rule-modal custom-rule-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="rule-panel-header">
          <h2 id="custom-editor-title">
            {isEditing ? "编辑自定义条件" : "自定义条件"}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="custom-modal-body">
          <CustomBuilder value={value} onChange={onChange} />
        </div>
        <footer className="custom-modal-footer">
          {!isEditing && (
            <button
              onClick={() => {
                setFavoriteName("自定义条件");
                setFavoriteOpen(true);
              }}
            >
              收藏
            </button>
          )}
          <button className="primary" onClick={confirm}>
            确定
          </button>
        </footer>
        {favoriteOpen && (
          <NameDialog
            value={favoriteName}
            onChange={setFavoriteName}
            onCancel={() => setFavoriteOpen(false)}
            onConfirm={favorite}
          />
        )}
        {toast && <Toast message={toast} />}
      </section>
    </div>
  );
}

function CustomBuilder({
  value,
  onChange,
}: {
  value: CustomConfig;
  onChange: (next: CustomConfig) => void;
}) {
  const toggle = (key: keyof CustomConfig) =>
    onChange({ ...value, [key]: !value[key] });
  const number = (key: keyof CustomConfig, next: string) =>
    onChange({ ...value, [key]: Number(next) });

  return (
    <div className="custom-builder">
      <div className="custom-row exclusion-row">
        <Check
          checked={value.excludeSt}
          onChange={() => toggle("excludeSt")}
          label="去除 ST"
        />
        <Check
          checked={value.excludeStar}
          onChange={() => toggle("excludeStar")}
          label="去除科创板"
        />
        <Check
          checked={value.excludeBj}
          onChange={() => toggle("excludeBj")}
          label="去除北交所"
        />
      </div>
      <Row enabled={value.limitUp} toggle={() => toggle("limitUp")}>
        <Num value={value.limitDays} change={(v) => number("limitDays", v)} />{" "}
        个交易日前涨停
      </Row>
      <Row enabled={value.klineMa} toggle={() => toggle("klineMa")}>
        <span>最近</span>
        <Num value={value.klineDays} change={(v) => number("klineDays", v)} />
        <span>个交易日的 K 线未破</span>
        <Num value={value.maDays} change={(v) => number("maDays", v)} />
        <span>日线</span>
      </Row>
      <Row enabled={value.closeDkx} toggle={() => toggle("closeDkx")}>
        <span>前</span>
        <Num
          value={value.closeDkxDays}
          change={(v) => number("closeDkxDays", v)}
        />
        <span>天每天的收盘价都在 DKX 之上</span>
      </Row>
      <Row enabled={value.rank} toggle={() => toggle("rank")}>
        <span>近两个月涨幅排名前</span>
        <Num value={value.rankTop} change={(v) => number("rankTop", v)} />
      </Row>
      <Row enabled={value.dailyRange} toggle={() => toggle("dailyRange")}>
        <span>连续</span>
        <Num
          value={value.dailyRangeDays}
          change={(v) => number("dailyRangeDays", v)}
        />
        <span>天的涨幅都在</span>
        <Num
          value={value.dailyRangeLower}
          change={(v) => number("dailyRangeLower", v)}
        />
        <span>% 到</span>
        <Num
          value={value.dailyRangeUpper}
          change={(v) => number("dailyRangeUpper", v)}
        />
        <span>% 之间</span>
      </Row>
      <Row enabled={value.interval} toggle={() => toggle("interval")}>
        <span>最近</span>
        <Num
          value={value.intervalDays}
          change={(v) => number("intervalDays", v)}
        />
        <span>个交易日的区间涨幅小于</span>
        <Num
          value={value.intervalMaximum}
          change={(v) => number("intervalMaximum", v)}
        />
        <span>%</span>
      </Row>
      <Row enabled={value.volumeRatio} toggle={() => toggle("volumeRatio")}>
        <Num
          value={value.volumeRatioDays}
          change={(v) => number("volumeRatioDays", v)}
        />
        <span>个交易日前的量比大于</span>
        <Num
          value={value.volumeRatioMinimum}
          change={(v) => number("volumeRatioMinimum", v)}
        />
      </Row>
      <Row enabled={value.deviation} toggle={() => toggle("deviation")}>
        <Num
          value={value.deviationLower}
          change={(v) => number("deviationLower", v)}
        />
        <span>% &lt; （</span>
        <Num
          value={value.deviationDaysAgo}
          change={(v) => number("deviationDaysAgo", v)}
        />
        <span>天前收盘价 - </span>
        <Num
          value={value.deviationDaysAgo}
          change={(v) => number("deviationDaysAgo", v)}
        />
        <span>天前 DKX）/ </span>
        <Num
          value={value.deviationDaysAgo}
          change={(v) => number("deviationDaysAgo", v)}
        />
        <span>天前 DKX &lt; </span>
        <Num
          value={value.deviationUpper}
          change={(v) => number("deviationUpper", v)}
        />
        <span>%</span>
      </Row>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="condition-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Row({
  enabled,
  toggle,
  children,
}: {
  enabled: boolean;
  toggle: () => void;
  children: ReactNode;
}) {
  return (
    <label className={`custom-row ${enabled ? "enabled" : ""}`}>
      <input type="checkbox" checked={enabled} onChange={toggle} />
      <span className="custom-row-content">{children}</span>
    </label>
  );
}

function Num({
  value,
  change,
}: {
  value: number;
  change: (value: string) => void;
}) {
  return (
    <input
      className="condition-number"
      type="number"
      value={value}
      onChange={(event) => change(event.target.value)}
    />
  );
}
