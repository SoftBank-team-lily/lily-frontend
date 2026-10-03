"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";

/**
 * 시간에 따른 지표 하나 (선 + 옅은 면). 제목이 계열 이름이라 범례는 두지 않는다.
 * 마우스를 올리면 세로선과 그 시각의 값을 보인다. 축과 격자는 옅게, 값 글자는 본문 색으로.
 */
export function MetricChart({
  title,
  unit,
  points,
  format,
}: {
  title: string;
  unit: string;
  points: { at: string; value: number }[];
  format: (value: number) => string;
}) {
  const { t, locale } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const width = 320;
  const height = 120;
  const pad = { top: 8, right: 8, bottom: 18, left: 8 };
  const max = Math.max(...points.map((point) => point.value), 0);
  const top = max > 0 ? max * 1.15 : 1;
  const x = (index: number) =>
    pad.left +
    (points.length > 1
      ? (index / (points.length - 1)) * (width - pad.left - pad.right)
      : 0);
  const y = (value: number) =>
    pad.top + (1 - value / top) * (height - pad.top - pad.bottom);
  const line = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`,
    )
    .join(" ");
  const area = points.length
    ? `${line} L${x(points.length - 1).toFixed(1)},${height - pad.bottom} L${x(0).toFixed(1)},${height - pad.bottom} Z`
    : "";
  const last = points.at(-1);
  const shown = hover !== null ? points[hover] : last;

  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setHover(
      Math.max(
        0,
        Math.min(points.length - 1, Math.round(ratio * (points.length - 1))),
      ),
    );
  }

  return (
    <figure className="rounded-xl border border-line p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-caption text-mute">{t(title)}</span>
        <span className="text-lead font-semibold text-ink tabular-nums">
          {shown ? format(shown.value) : "–"}
          <span className="ml-1 text-caption font-normal text-mute">
            {t(unit)}
          </span>
        </span>
      </figcaption>
      {points.length === 0 ? (
        <p className="mt-3 h-[120px] text-caption text-mute">
          {t("아직 수집된 값이 없어요.")}
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mt-2 h-[120px] w-full touch-none"
          preserveAspectRatio="none"
          onPointerMove={move}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={t(
            "{{value0}} 최근 {{value1}}개 값, 마지막 {{value2}}{{value3}}",
            {
              value0: title,
              value1: points.length,
              value2: last ? format(last.value) : "",
              value3: unit,
            },
          )}
        >
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={height - pad.bottom}
            y2={height - pad.bottom}
            className="stroke-line"
            strokeWidth={1}
          />
          <path d={area} className="fill-accent/15" />
          <path
            d={line}
            className="fill-none stroke-accent"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.top}
                y2={height - pad.bottom}
                className="stroke-mute"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(hover)}
                cy={y(points[hover].value)}
                r={4}
                className="fill-accent stroke-surface"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          <text x={pad.left} y={height - 4} className="fill-mute text-[10px]">
            {time(points[0].at, locale)}
          </text>
          <text
            x={width - pad.right}
            y={height - 4}
            textAnchor="end"
            className="fill-mute text-[10px]"
          >
            {hover !== null
              ? time(points[hover].at, locale)
              : time(points.at(-1)!.at, locale)}
          </text>
        </svg>
      )}
    </figure>
  );
}

function time(at: string, locale: string) {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
