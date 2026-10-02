import type { ReactNode } from 'react';
import { bugtrackerLink, bugtrackerState, type Project, type Task } from '../../shared/types.ts';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';

const day = (ts: string) => ts.slice(0, 10).split('-').reverse().join('/');

const BASE = 'report flex-none rounded-full border px-1.5 text-[11px] leading-[18px] whitespace-nowrap';
const DONE = 'report-done border-primary/30 bg-primary/10 text-primary';

// Pastille pleine d'un ticket : lien vers le ticket (URL de base des réglages
// ou lien complet), simple texte sans URL de base. color : fond et texte
// (bleu pour une tâche reportée par défaut).
function TicketPill({
  href,
  title,
  className,
  color = DONE,
  children,
}: {
  href: string | null;
  title: string;
  className?: string;
  color?: string;
  children: ReactNode;
}) {
  if (!href) return <span className={cn(BASE, color, className)} title={title}>{children}</span>;
  return (
    <a
      className={cn(BASE, color, 'report-link hover:underline', className)}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
      title={`${title} — ouvrir le ticket`}
    >
      {children}
    </a>
  );
}

// Suivi du report d'une tâche : « à reporter » (contour), puis, reportée,
// l'identifiant de son ticket (« ticket » pour un lien complet), qui l'ouvre ;
// « reporté » reste lu par les lecteurs d'écran et dans l'info-bulle.
export function ReportBadge({ task }: { task: Task }) {
  const { settings } = useActions();
  const state = bugtrackerState(task);
  if (state === 'none') return null;

  if (state === 'wanted') {
    return (
      <span className={cn(BASE, 'report-wanted border-dashed border-muted-foreground/60 text-muted-foreground')}>
        à reporter
      </span>
    );
  }

  return (
    <TicketPill href={bugtrackerLink(task, settings)} title={`Reporté le ${day(task.bugtracker_at!)}`}>
      <span className="sr-only">reporté · </span>
      {task.bugtracker_key ? <span className="report-key font-mono">{task.bugtracker_key}</span> : 'ticket'}
    </TicketPill>
  );
}

// Ticket d'un projet (epic…), même pastille qu'une tâche reportée mais rose
// (à distinguer des tickets des tâches) : la clé, ou « ticket » pour un lien complet.
export function ProjectTicket({ project, className }: { project: Project; className?: string }) {
  const { settings } = useActions();
  if (!project.bugtracker_key && !project.bugtracker_url) return null;
  return (
    <TicketPill
      href={bugtrackerLink(project, settings)}
      title="Ticket du projet"
      className={cn('project-ticket self-center', className)}
      color="border-pink-300 bg-pink-100 text-pink-800 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300"
    >
      {project.bugtracker_key ? (
        <>
          <span className="sr-only">ticket · </span>
          <span className="report-key font-mono">{project.bugtracker_key}</span>
        </>
      ) : (
        'ticket'
      )}
    </TicketPill>
  );
}
