import type { FC, PropsWithChildren } from 'hono/jsx';

type Props = PropsWithChildren<{
  headers: string[];
}>;

export const DataTable: FC<Props> = ({ headers, children }) => {
  return (
    <div class="overflow-x-auto bg-white rounded-lg border">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            {headers.map(h => (
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          {children}
        </tbody>
      </table>
    </div>
  );
};
