import { range } from '../format.js';

const KIND = { software: 'Software', part: 'Part', service: 'Service', labour: 'Labour' };

// Line-by-line breakdown of one stage. Items carried over from earlier stages are tagged.
export default function Breakdown({ stage }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
      <h3 className="font-semibold text-zinc-100">{stage.name}: full breakdown</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="py-2 pr-3 font-medium">Item</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Added in</th>
              <th className="py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {stage.items.map((item, i) => (
              <tr key={i} className="border-b border-zinc-800/60">
                <td className="py-2.5 pr-3 text-zinc-200">{item.label}</td>
                <td className="py-2.5 pr-3 text-zinc-400">{KIND[item.kind] ?? item.kind}</td>
                <td className="py-2.5 pr-3 text-zinc-500">Stage {item.stage}</td>
                <td className="py-2.5 text-right font-mono text-zinc-200">{range(item.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-zinc-300">
            <Row label="Subtotal" value={stage.subtotal} />
            {stage.contingency.max > 0 && <Row label="Contingency (10%, for surprises in big builds)" value={stage.contingency} />}
            <Row label="GST (18%)" value={stage.gst} />
            <tr>
              <td colSpan={3} className="pt-3 font-semibold text-zinc-50">Total</td>
              <td className="pt-3 text-right font-mono text-base font-semibold text-amber-300">{range(stage.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <tr>
      <td colSpan={3} className="pt-3 text-zinc-400">{label}</td>
      <td className="pt-3 text-right font-mono">{range(value)}</td>
    </tr>
  );
}
