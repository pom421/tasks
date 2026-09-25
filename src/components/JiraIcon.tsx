import type { Task } from '../../shared/types.ts';
import { jiraState } from '../../shared/types.ts';
import { cn } from '@/lib/utils';

const LOGO =
  'M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z';

const day = (ts: string) => ts.slice(0, 10).split('-').reverse().join('/');

// Logo Jira (Simple Icons, CC0) : contour gris = à reporter, plein bleu = reportée.
// La forme distingue les deux états, pas seulement la couleur.
// Avec un lien, l'icône ouvre le ticket dans un nouvel onglet.
export function JiraIcon({ task }: { task: Task }) {
  const state = jiraState(task);
  if (state === 'none') return null;
  const label =
    state === 'wanted' ? 'À reporter dans Jira' : `Reportée dans Jira le ${day(task.jira_at!)}${task.jira_url ? ' — ouvrir le ticket' : ''}`;
  const icon = (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        'jira size-[13px] flex-none',
        state === 'wanted' ? 'jira-wanted fill-none stroke-muted-foreground stroke-[1.5]' : 'jira-done fill-[#2684ff]',
      )}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path d={LOGO} />
    </svg>
  );
  if (!task.jira_url) return icon;
  return (
    <a className="jira-link flex-none" href={task.jira_url} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
      {icon}
    </a>
  );
}
