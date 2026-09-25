import { jiraLink, jiraState, type Task } from '../../shared/types.ts';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';

const LOGO =
  'M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z';

const day = (ts: string) => ts.slice(0, 10).split('-').reverse().join('/');

// Logo Jira (Simple Icons, CC0) : contour gris = à reporter, plein bleu = reportée.
// La forme distingue les deux états, pas seulement la couleur.
// Avec un ticket, sa clé s'affiche à côté ; avec un lien (clé + URL Jira
// d'entreprise, ou lien complet), l'ensemble ouvre le ticket dans un nouvel onglet.
export function JiraIcon({ task }: { task: Task }) {
  const { settings } = useActions();
  const state = jiraState(task);
  const href = jiraLink(task, settings);
  if (state === 'none') return null;
  const label =
    state === 'wanted' ? 'À reporter dans Jira' : `Reportée dans Jira le ${day(task.jira_at!)}${href ? ' — ouvrir le ticket' : ''}`;
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
  const key = task.jira_key && <span className="jira-key font-mono text-[11px] text-muted-foreground">{task.jira_key}</span>;
  if (!href) return key ? <span className="flex flex-none items-center gap-1">{icon}{key}</span> : icon;
  return (
    <a
      className="jira-link flex flex-none items-center gap-1 hover:underline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
    >
      {icon}
      {key}
    </a>
  );
}
