import { jiraLink, jiraState, type Task } from '../../shared/types.ts';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';

const day = (ts: string) => ts.slice(0, 10).split('-').reverse().join('/');

// Suivi du report d'une tâche, en toutes lettres : « à reporter » (contour),
// « reporté » (plein) suivi de l'identifiant du ticket. Avec une URL de base
// (réglages) ou un lien complet, le badge « reporté » ouvre le ticket.
export function ReportBadge({ task }: { task: Task }) {
  const { settings } = useActions();
  const state = jiraState(task);
  if (state === 'none') return null;

  const base = 'report flex-none rounded-full border px-1.5 text-[11px] leading-[18px] whitespace-nowrap';
  if (state === 'wanted') {
    return (
      <span className={cn(base, 'report-wanted border-dashed border-muted-foreground/60 text-muted-foreground')}>
        à reporter
      </span>
    );
  }

  const href = jiraLink(task, settings);
  const label = (
    <>
      reporté{task.jira_key && <span className="report-key font-mono"> · {task.jira_key}</span>}
    </>
  );
  const className = cn(base, 'report-done border-primary/30 bg-primary/10 text-primary');
  const title = `Reporté le ${day(task.jira_at!)}`;
  if (!href) return <span className={className} title={title}>{label}</span>;
  return (
    <a
      className={cn(className, 'report-link hover:underline')}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
      title={`${title} — ouvrir le ticket`}
    >
      {label}
    </a>
  );
}
