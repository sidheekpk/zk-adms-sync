import type { FC } from 'hono/jsx';

type Props = {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
};

export const StatsCard: FC<Props> = ({ label, value, color = 'blue', sub }) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  return (
    <div class={`rounded-lg border p-4 ${colorMap[color] || colorMap.blue}`}>
      <p class="text-sm font-medium opacity-80">{label}</p>
      <p class="text-3xl font-bold mt-1">{value}</p>
      {sub && <p class="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
};
