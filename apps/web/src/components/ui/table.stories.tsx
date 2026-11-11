import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusChip } from './status-chip';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from './table';

const rows = [
  { id: 'RZ-1042', game: 'FIFA 25', stake: '₦2,000', state: 'In progress' },
  { id: 'RZ-1043', game: 'Call of Duty', stake: '₦5,000', state: 'Awaiting result' },
  { id: 'RZ-1044', game: 'Tekken 8', stake: '₦1,500', state: 'Confirmed' },
];

function AdminTable() {
  return (
    <Table>
      <TableHead>
        <TableHeaderCell>ID</TableHeaderCell>
        <TableHeaderCell>Game</TableHeaderCell>
        <TableHeaderCell numeric>Stake</TableHeaderCell>
        <TableHeaderCell>State</TableHeaderCell>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} selected={row.id === 'RZ-1042'}>
            <TableCell className="font-display text-accent">{row.id}</TableCell>
            <TableCell>{row.game}</TableCell>
            <TableCell numeric>{row.stake}</TableCell>
            <TableCell>
              <StatusChip label={row.state} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const meta = {
  title: 'Components/Table',
  component: AdminTable,
} satisfies Meta<typeof AdminTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
