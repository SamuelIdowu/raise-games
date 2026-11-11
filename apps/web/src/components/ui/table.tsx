import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export function Table({ className, children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-body-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 bg-raised">
      <tr className="border-b border-line-strong">{children}</tr>
    </thead>
  );
}

export function TableHeaderCell({
  className,
  numeric = false,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'label-caps px-3 py-2 text-fg-muted',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableRow({
  className,
  selected = false,
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        'h-10 border-b border-line hover:bg-overlay',
        selected && 'shadow-[inset_2px_0_0_0_var(--accent)]',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  className,
  numeric = false,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn('px-3 py-2 text-fg', numeric ? 'text-right tabular' : 'text-left', className)}
      {...props}
    >
      {children}
    </td>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}
