import {
  FerrisWheel,
  FlaskConical,
  HardHat,
  Footprints,
  ListOrdered,
  Mountain,
  MousePointer2,
  Shovel,
  Store,
  Ticket,
  Trees,
  Wallet,
  Waves,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { Tool } from '../game/tools';
import { RIDE_TYPES } from '../sim/catalog';
import styles from './Game.module.css';
import type { PanelId } from './Panels';

interface Props {
  tool: Tool;
  panel: PanelId | null;
  onTool: (tool: Tool) => void;
  onPanel: (panel: PanelId) => void;
}

function ToolButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.tool} aria-pressed={active} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** The tools along the bottom. Catalogues (rides, shops, scenery) open a panel to pick from. */
export function Toolbar({ tool, panel, onTool, onPanel }: Props) {
  // A tool shows as active only while no catalogue is open over it.
  const building = (kind: Tool['kind']) => !panel && tool.kind === kind;
  return (
    <nav className={styles.toolbar} aria-label="Tools">
      <ToolButton
        label="Inspect"
        icon={<MousePointer2 aria-hidden="true" />}
        active={tool.kind === 'inspect' && !panel}
        onClick={() => {
          onTool({ kind: 'inspect' });
        }}
      />
      <ToolButton
        label="Path"
        icon={<Footprints aria-hidden="true" />}
        active={building('path') && tool.kind === 'path' && !tool.queue}
        onClick={() => {
          onTool({ kind: 'path', queue: false });
        }}
      />
      <ToolButton
        label="Queue"
        icon={<ListOrdered aria-hidden="true" />}
        active={building('path') && tool.kind === 'path' && tool.queue}
        onClick={() => {
          onTool({ kind: 'path', queue: true });
        }}
      />
      <ToolButton
        label="Rides"
        icon={<FerrisWheel aria-hidden="true" />}
        active={
          panel === 'rides' ||
          (building('ride') && tool.kind === 'ride' && RIDE_TYPES[tool.type].kind === 'ride')
        }
        onClick={() => {
          onPanel('rides');
        }}
      />
      <ToolButton
        label="Shops"
        icon={<Store aria-hidden="true" />}
        active={
          panel === 'shops' ||
          (building('ride') && tool.kind === 'ride' && RIDE_TYPES[tool.type].kind === 'stall')
        }
        onClick={() => {
          onPanel('shops');
        }}
      />
      <ToolButton
        label="Scenery"
        icon={<Trees aria-hidden="true" />}
        active={panel === 'scenery' || building('scenery') || building('item')}
        onClick={() => {
          onPanel('scenery');
        }}
      />
      <ToolButton
        label="Land"
        icon={<Mountain aria-hidden="true" />}
        active={panel === 'land' || building('land') || building('paint')}
        onClick={() => {
          onPanel('land');
        }}
      />
      <ToolButton
        label="Water"
        icon={<Waves aria-hidden="true" />}
        active={panel === 'water' || building('water')}
        onClick={() => {
          onPanel('water');
        }}
      />
      <ToolButton
        label="Bulldoze"
        icon={<Shovel aria-hidden="true" />}
        active={building('bulldoze')}
        onClick={() => {
          onTool({ kind: 'bulldoze' });
        }}
      />
      <ToolButton
        label="Staff"
        icon={<HardHat aria-hidden="true" />}
        active={panel === 'staff'}
        onClick={() => {
          onPanel('staff');
        }}
      />
      <ToolButton
        label="Research"
        icon={<FlaskConical aria-hidden="true" />}
        active={panel === 'research'}
        onClick={() => {
          onPanel('research');
        }}
      />
      <ToolButton
        label="Park"
        icon={<Ticket aria-hidden="true" />}
        active={panel === 'park'}
        onClick={() => {
          onPanel('park');
        }}
      />
      <ToolButton
        label="Money"
        icon={<Wallet aria-hidden="true" />}
        active={panel === 'money'}
        onClick={() => {
          onPanel('money');
        }}
      />
    </nav>
  );
}
