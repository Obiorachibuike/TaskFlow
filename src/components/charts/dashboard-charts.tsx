"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { stroke: "var(--text-muted)", fontSize: 11 };

export function StatusBars({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).map(([k, v]) => ({
    name: k.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    value: v,
  }));
  const colors: Record<string, string> = {
    Backlog: "#64748B",
    Todo: "#94A3B8",
    "In progress": "#6366F1",
    "In review": "#8B5CF6",
    Done: "#22C55E",
  };
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} barSize={28}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--primary-soft)" }}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text)",
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {rows.map((r) => (
            <Cell key={r.name} fill={colors[r.name] ?? "#6366F1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PriorityBars({ data }: { data: Record<string, number> }) {
  const order = ["URGENT", "HIGH", "MEDIUM", "LOW"];
  const colors: Record<string, string> = {
    URGENT: "#EF4444",
    HIGH: "#F59E0B",
    MEDIUM: "#6366F1",
    LOW: "#94A3B8",
  };
  const rows = order
    .filter((k) => data[k] !== undefined)
    .map((k) => ({ name: k[0] + k.slice(1).toLowerCase(), value: data[k]!, fill: colors[k] }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} layout="vertical" barSize={16}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={70} />
        <Tooltip
          cursor={{ fill: "var(--primary-soft)" }}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text)",
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BurndownChart({
  data,
}: {
  data: Array<{ date: string; remaining: number; ideal: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text)",
          }}
        />
        <Line type="monotone" dataKey="remaining" stroke="#6366F1" strokeWidth={2} dot={{ r: 2 }} name="Remaining" />
        <Line
          type="monotone"
          dataKey="ideal"
          stroke="#94A3B8"
          strokeDasharray="5 5"
          strokeWidth={1.5}
          dot={false}
          name="Ideal"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function VelocityChart({
  data,
}: {
  data: Array<{ name: string; completedPoints: number; completedIssues: number; date: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={30}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--primary-soft)" }}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text)",
          }}
        />
        <Bar dataKey="completedPoints" fill="#6366F1" radius={[4, 4, 0, 0]} name="Points done" />
      </BarChart>
    </ResponsiveContainer>
  );
}
