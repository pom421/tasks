import { Settings as SettingsIcon } from 'lucide-react';
import { useActions } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { HelpDialog } from './HelpDialog';

interface ToolbarProps {
  helpOpen: boolean;
  onHelpOpen: (open: boolean) => void;
}

// En-tête : titre, aide et réglages. Les filtres des projets sont dans
// l'onglet Projets (ProjectFilters).
export function Toolbar({ helpOpen, onHelpOpen }: ToolbarProps) {
  const { navigate } = useActions();
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 pt-6 pb-2">
      <h1 className="text-2xl font-bold">Tâches</h1>
      <nav className="flex flex-wrap items-center gap-1.5">
        <Button title="Raccourcis (?)" onClick={() => onHelpOpen(true)}>
          ?
        </Button>
        <Button asChild>
          <a
            href="/admin"
            id="settings-link"
            title="Réglages, export et import"
            aria-label="Réglages"
            onClick={(e) => {
              e.preventDefault();
              navigate('/admin');
            }}
          >
            <SettingsIcon aria-hidden />
          </a>
        </Button>
      </nav>

      <HelpDialog open={helpOpen} onOpenChange={onHelpOpen} />
    </header>
  );
}
