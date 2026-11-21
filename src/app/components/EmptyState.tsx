// First screen: drop a save or pick a blueprint folder.
import { loadFiles } from '../loader';

const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = [...(e.target.files || [])]; e.target.value = ''; loadFiles(f); };
const path = 'font-mono text-xs text-faint [overflow-wrap:anywhere]';

export function EmptyState() {
  return (
    <section className="grid gap-[18px] justify-items-center pt-[6vh] pb-[2vh]">
      <label className="w-[min(640px,100%)] grid gap-2 justify-items-center text-center px-6 py-12 border-2 border-dashed border-line rounded-md bg-panel cursor-pointer hover:border-fg [.dragging_&]:border-fg focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-[3px]">
        <input type="file" accept=".sav" hidden onChange={pick} />
        <span className="font-head font-semibold text-2xl/[1.2]">Drop a Satisfactory save here</span>
        <span className="text-muted max-w-[46ch]">or click to choose a <code>.sav</code> file. It is read in your browser and never uploaded.</span>
        <span className={path}>%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\&lt;id&gt;\</span>
      </label>
      <div className="flex gap-x-3 gap-y-2 items-center flex-wrap justify-center text-muted w-[min(640px,100%)]">
        <span>Or check your blueprints:</span>
        <label className="btn">Load a blueprint folder…<input type="file" hidden multiple {...{ webkitdirectory: '' }} onChange={pick} /></label>
        <span className={path}>%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\blueprints\&lt;session&gt;\</span>
      </div>
      <ul className="w-[min(640px,100%)] m-0 pl-[18px] list-disc text-muted grid gap-1.5 [&_b]:text-fg [&_b]:font-semibold">
        <li><b>Somersloops</b> are split into those slotted in machines, those spent on Alien Power Augmenters (10 each) and those waiting in the dimensional depot.</li>
        <li><b>Power delta</b> on each switch: generation minus consumption of everything behind it (nested switches count only when on). Hover it for the numbers.</li>
        <li><b>Blueprints</b>: every machine connected by belts and pipes (same checks as the save), all on one power network, and what the blueprint needs and gives per minute with its power at full speed.</li>
        <li><b>Checks</b> run on the machines behind each switch: belt networks (supply = demand, every belt carries its load), pipe networks (flow, head lift, mixed fluids) and the coal plant rules (Mk.2 miners at 270/150, first belt Mk.3, 1:1 / 6:6 water at 37.5%, 12 m head lift, gens and extractors on the grid).</li>
      </ul>
    </section>
  );
}
