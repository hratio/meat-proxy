import demoCatalog from '../../../site/catalog.json';
import { catalogSchema } from '$lib/config';
import { reportFindings, type ReportFinding } from '$lib/damage-report';

export const sampleCatalog = catalogSchema.parse(demoCatalog);
const catalog = sampleCatalog;
export { reportFindings, type ReportFinding };

const locations: [string, string, number, boolean?, string?][] = [
  ['src/api/orders.ts', 'V004', 58, false, 'A submitted order can be constructed without its payment details.'],
  ['src/api/orders.ts', 'V004', 96],
  ['src/api/orders.ts', 'V006', 24, false, 'The required cleanup callback can be omitted.'],
  ['src/api/orders.ts', 'V005', 112],
  ['src/api/orders.ts', 'V008', 18, true, 'The failure handler now accepts the existing error type.'],
  ['src/services/inventory.ts', 'V001', 43],
  ['src/services/inventory.ts', 'V001', 88],
  ['src/services/inventory.ts', 'V004', 126],
  ['src/services/inventory.ts', 'V005', 158, true],
  ['src/components/Checkout.svelte', 'V004', 72],
  ['src/components/Checkout.svelte', 'V006', 104],
  ['src/components/Checkout.svelte', 'V009', 38],
  ['src/components/Checkout.svelte', 'V002', 61, true],
  ['src/lib/session.ts', 'V007', 31],
  ['src/lib/session.ts', 'V008', 64, true],
  ['src/lib/session.ts', 'V001', 89],
  ['src/services/notifications.ts', 'V006', 52],
  ['src/services/notifications.ts', 'V002', 83, true],
  ['tests/orders.test.ts', 'V010', 142],
  ['tests/orders.test.ts', '', 189, false, 'Add a regression case for two orders arriving at once.']
];

export const sampleFindings: ReportFinding[] = reportFindings(locations.map(([path, code, line, resolved, note], index) => {
  const rule = catalog.groups.flatMap(group => group.codes).find(rule => rule.id === code);
  return {
    id: `demo-${index}`, path, code: code || undefined, rule,
    ranges: [{ side: 'additions' as const, start: line, end: line + index % 5 }],
    status: resolved ? 'resolved' as const : 'open' as const,
    createdAt: '2026-09-26T12:00:00Z',
    comment: resolved ? undefined : note,
    resolution: resolved ? note || 'Updated and checked in the latest revision.' : undefined
  };
}), catalog);
