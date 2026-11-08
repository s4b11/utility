import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Search,
  Plus,
  ExternalLink,
  MapPin,
  Award,
  Check,
  ChevronDown,
  RefreshCw,
  Trash2,
  Pencil,
  Filter,
  Layers,
  Code2,
  Terminal,
  Inbox,
  Send,
  MessagesSquare,
  Webhook,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronsUpDown,
} from 'lucide-react';
import { api, humanizeError } from '../../lib/api';
import type { Job, JobInput, WebhookConfig } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { openExternal } from '../../lib/openExternal';
import { CopyButton } from '../../components/ui/CopyButton';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { fmtTime } from '../../lib/datetime';

/* DESIGN.md 5.2: one tone per status, used by the status select, menu dots and KPI tiles. */
type Tone = 't-success' | 't-warning' | 't-primary' | 't-violet' | 't-teal' | 't-rose' | 't-error' | 't-neutral';

const STATUS_CONFIG: Record<Job['status'], { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 't-primary' },
  saved: { label: 'Saved', tone: 't-warning' },
  applied: { label: 'Applied', tone: 't-teal' },
  interviewing: { label: 'Interviewing', tone: 't-violet' },
  rejected: { label: 'Rejected', tone: 't-error' },
  archived: { label: 'Archived', tone: 't-neutral' },
};

const ALL_STATUSES: Job['status'][] = [
  'new',
  'saved',
  'applied',
  'interviewing',
  'rejected',
  'archived',
];

/* 4.10 avatar: initials of the first two words, tint chosen from the name. */
const TINTS = ['t-primary', 't-violet', 't-teal', 't-warning', 't-rose'];
const tintFor = (name: string) =>
  TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const initialsFor = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?';

const fmtAddedDate = (epochSecs: number) =>
  new Date(epochSecs * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

const Dash = () => (
  <span className="muted" aria-label="Not added">
    —
  </span>
);

/* ------------------------------------------------------------------
   4.18 Menu: fixed floating panel next to its trigger, one at a time.
------------------------------------------------------------------ */
type MenuEntry =
  | { sep: true; id: string }
  | { sep?: false; id: string; label: string; tone?: Tone; checked?: boolean; meta?: React.ReactNode };

let closeActiveMenu: (() => void) | null = null;

interface FloatingMenuProps {
  anchor: HTMLElement | null;
  items: MenuEntry[];
  label: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  align?: 'start' | 'end';
}

function FloatingMenu({ anchor, items, label, onSelect, onClose, align = 'start' }: FloatingMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const place = useCallback(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'end' ? r.right - w : r.left;
    let top = r.bottom + 6;
    if (top + h > vh - 12 && r.top - 6 - h >= 12) top = r.top - 6 - h;
    left = Math.min(Math.max(12, left), vw - w - 12);
    top = Math.min(Math.max(12, top), vh - h - 12);
    setPos({ top, left });
  }, [anchor, align]);

  useLayoutEffect(() => {
    place();
  }, [place, items.length]);

  useEffect(() => {
    const close = () => closeRef.current();
    closeActiveMenu?.();
    closeActiveMenu = close;

    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      close();
    };
    const onScroll = () => place();
    const onResize = () => close();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    const target =
      ref.current?.querySelector<HTMLElement>('[aria-checked="true"]') ||
      ref.current?.querySelector<HTMLElement>('.menu-item');
    target?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      if (closeActiveMenu === close) closeActiveMenu = null;
    };
  }, [anchor, place]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLElement>('.menu-item') || []);
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      anchor?.focus({ preventScroll: true });
    } else if (e.key === 'Tab') {
      closeRef.current();
    }
  };

  return createPortal(
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
    >
      {items.map((it) =>
        it.sep ? (
          <div key={it.id} className="menu-sep" role="separator" />
        ) : (
          <button
            key={it.id}
            type="button"
            className="menu-item"
            role={it.checked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={it.checked !== undefined ? it.checked : undefined}
            tabIndex={-1}
            onClick={() => {
              triggerHaptic('light');
              onSelect(it.id);
              closeRef.current();
              anchor?.focus({ preventScroll: true });
            }}
          >
            {it.tone && <span className={`dot ${it.tone}`} />}
            <span>{it.label}</span>
            {it.meta}
            {it.checked && <Check className="i tick" aria-hidden="true" />}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------
   4.8 Status select: a badge that opens a menu to change status in place.
------------------------------------------------------------------ */
interface JobStatusDropdownProps {
  status: Job['status'];
  onChange: (newStatus: Job['status']) => void;
  disabled?: boolean;
}

export function JobStatusDropdown({ status, onChange, disabled }: JobStatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = STATUS_CONFIG[status] || STATUS_CONFIG.new;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic('light');
          setIsOpen((prev) => !prev);
        }}
        className={`status-select ${current.tone}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Status: ${current.label}. Change status`}
      >
        <span className="dot" />
        {current.label}
        <ChevronDown className="i" aria-hidden="true" />
      </button>

      {isOpen && (
        <FloatingMenu
          anchor={buttonRef.current}
          label="Change status"
          items={ALL_STATUSES.map((st) => ({
            id: st,
            label: STATUS_CONFIG[st].label,
            tone: STATUS_CONFIG[st].tone,
            checked: st === status,
          }))}
          onSelect={(id) => {
            if (id !== status) onChange(id as Job['status']);
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------
   One table row. Memoised so opening a menu, typing in the search or any
   other view state change does not re-render hundreds of rows.
------------------------------------------------------------------ */
interface JobRowProps {
  job: Job;
  onStatusChange: (job: Job, status: Job['status']) => void;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
}

const JobRow = React.memo(function JobRow({ job, onStatusChange, onEdit, onDelete }: JobRowProps) {
  const company = job.company || 'Confidential';
  const matchedLower = new Set(job.matched_skills.map((s) => s.trim().toLowerCase()));
  const otherSkills = job.skills_required.filter(
    (s) => !matchedLower.has(s.trim().toLowerCase())
  );
  const hasLink = /^https?:\/\//i.test(job.link_to_apply);
  const subText = `${company}${job.sl_no ? ` · #${job.sl_no}` : ''}`;

  return (
    <tr>
      <td className="c-main" data-label="Job">
        <div className="person">
          <span className={`avatar ${tintFor(company)}`} aria-hidden="true">
            {initialsFor(company)}
          </span>
          <div className="person-text max-w-[300px]">
            <span className="name line-clamp-2">{job.job_title}</span>
            <span className="sub" title={subText}>
              {subText}
            </span>
            {job.notes && (
              <span className="src max-w-[260px] truncate" title={job.notes}>
                {job.notes}
              </span>
            )}
          </div>
        </div>
      </td>

      <td data-label="Location">
        {job.location ? (
          <span className="with-ico max-w-[200px]">
            <MapPin className="i" aria-hidden="true" />
            <span className="min-w-0 truncate" title={job.location}>
              {job.location}
            </span>
          </span>
        ) : (
          <Dash />
        )}
      </td>

      <td data-label="Salary">
        {job.salary_package ? (
          <span className="strong whitespace-nowrap">{job.salary_package}</span>
        ) : (
          <Dash />
        )}
      </td>

      <td data-label="Type">
        {job.job_type || job.experience ? (
          <span className="inc">
            {job.job_type && <span className="mini">{job.job_type}</span>}
            {job.experience && (
              <span className="mini" title="Experience">
                <Award className="i" aria-hidden="true" />
                <span className="sr">Experience: </span>
                {job.experience}
              </span>
            )}
          </span>
        ) : (
          <Dash />
        )}
      </td>

      <td data-label="Skills" className="max-[720px]:col-span-2">
        {job.matched_skills.length > 0 || otherSkills.length > 0 ? (
          <div className="flex max-w-[300px] flex-wrap gap-1.5 max-[720px]:max-w-none">
            {job.matched_skills.map((s, idx) => (
              <span key={`m-${idx}`} className="tag t-success" title="Matched skill">
                <Check className="i" aria-hidden="true" />
                <span className="sr">Matched: </span>
                {s}
              </span>
            ))}
            {otherSkills.map((s, idx) => (
              <span key={`r-${idx}`} className="tag">
                {s}
              </span>
            ))}
          </div>
        ) : (
          <Dash />
        )}
      </td>

      <td data-label="Status">
        <JobStatusDropdown
          status={job.status}
          onChange={(newStatus) => onStatusChange(job, newStatus)}
        />
      </td>

      <td data-label="Added">
        {job.created_at ? (
          <div className="when">
            <span>{fmtAddedDate(job.created_at)}</span>
            <small>{fmtTime(job.created_at)}</small>
          </div>
        ) : (
          <Dash />
        )}
      </td>

      <td className="c-actions" data-label="Actions">
        <div className="actions">
          {hasLink ? (
            <a
              href={job.link_to_apply}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openExternal}
              className="btn tonal xs mr-1.5"
            >
              <span>Apply</span>
              <ExternalLink className="i" aria-hidden="true" />
            </a>
          ) : (
            <span className="mini mr-1.5">No link</span>
          )}
          <button
            type="button"
            onClick={() => onEdit(job)}
            className="icon-btn"
            aria-label={`Edit ${job.job_title}`}
            data-tip="Edit job"
          >
            <Pencil className="i" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(job)}
            className="icon-btn danger"
            aria-label={`Delete ${job.job_title}`}
            data-tip="Delete job"
          >
            <Trash2 className="i" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
});

/** Rows rendered at first and added each time the list end nears the viewport. */
const PAGE_SIZE = 40;

/* ------------------------------------------------------------------
   Table sorting (4.14): header buttons above 720, sort chip below.
------------------------------------------------------------------ */
type SortKey = 'title' | 'location' | 'salary' | 'type' | 'status' | 'added';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

const SORT_FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  title: 'asc',
  location: 'asc',
  salary: 'asc',
  type: 'asc',
  status: 'asc',
  added: 'desc',
};

const SORT_OPTIONS: { id: string; label: string; sort: SortState }[] = [
  { id: 'default', label: 'Newest first', sort: null },
  { id: 'added-asc', label: 'Oldest first', sort: { key: 'added', dir: 'asc' } },
  { id: 'title-asc', label: 'Title A to Z', sort: { key: 'title', dir: 'asc' } },
  { id: 'title-desc', label: 'Title Z to A', sort: { key: 'title', dir: 'desc' } },
  { id: 'status-asc', label: 'Status', sort: { key: 'status', dir: 'asc' } },
  { id: 'location-asc', label: 'Location A to Z', sort: { key: 'location', dir: 'asc' } },
  { id: 'salary-asc', label: 'Salary A to Z', sort: { key: 'salary', dir: 'asc' } },
  { id: 'type-asc', label: 'Type A to Z', sort: { key: 'type', dir: 'asc' } },
];

const SORT_KEY_LABEL: Record<SortKey, string> = {
  title: 'Title',
  location: 'Location',
  salary: 'Salary',
  type: 'Type',
  status: 'Status',
  added: 'Added',
};

const sortValue = (job: Job, key: SortKey): string | number | null => {
  switch (key) {
    case 'title':
      return job.job_title?.trim() || null;
    case 'location':
      return job.location?.trim() || null;
    case 'salary':
      return job.salary_package?.trim() || null;
    case 'type':
      return job.job_type?.trim() || null;
    case 'status':
      return ALL_STATUSES.indexOf(job.status);
    case 'added':
      return job.created_at || null;
  }
};

export function JobsView() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Presentation-only state: which filter menu is open, table sort, unfiltered KPI totals
  const [openMenu, setOpenMenu] = useState<null | 'status' | 'type' | 'sort'>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [listUnfiltered, setListUnfiltered] = useState<boolean | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const statusChipRef = useRef<HTMLButtonElement>(null);
  const typeChipRef = useRef<HTMLButtonElement>(null);
  const sortChipRef = useRef<HTMLButtonElement>(null);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [deletingJob, setDeletingJob] = useState<Job | null>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);

  // Webhook Modal
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Form State
  const [formSlNo, setFormSlNo] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formSkills, setFormSkills] = useState('');
  const [formMatchedSkills, setFormMatchedSkills] = useState('');
  const [formType, setFormType] = useState('Full-Time');
  const [formExperience, setFormExperience] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formStatus, setFormStatus] = useState<Job['status']>('new');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const res = await api.jobs.list({
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      });
      setJobs(res);
      setListUnfiltered(!search && statusFilter === 'all' && typeFilter === 'all');
    } catch (err: any) {
      toast.error(humanizeError(err.code));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [search, statusFilter, typeFilter]);

  // 4.4: "/" focuses the search unless typing in a field, a modifier is held, or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const openWebhookModal = async () => {
    triggerHaptic('light');
    setIsWebhookModalOpen(true);
    try {
      setLoadingConfig(true);
      const conf = await api.jobs.getWebhookConfig();
      setWebhookConfig(conf);
    } catch (err: any) {
      toast.error(humanizeError(err.code));
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleRegenerateSecret = async () => {
    triggerHaptic('warning');
    try {
      setRegeneratingSecret(true);
      const res = await api.jobs.updateWebhookConfig();
      if (webhookConfig) {
        setWebhookConfig({
          ...webhookConfig,
          webhook_secret: res.webhook_secret,
        });
      }
      toast.success('Webhook secret updated successfully');
    } catch (err: any) {
      toast.error(humanizeError(err.code));
    } finally {
      setRegeneratingSecret(false);
    }
  };

  const openAddModal = () => {
    triggerHaptic('light');
    setEditingJob(null);
    setFormSlNo('');
    setFormTitle('');
    setFormCompany('');
    setFormSalary('');
    setFormLocation('');
    setFormSkills('');
    setFormMatchedSkills('');
    setFormType('Full-Time');
    setFormExperience('');
    setFormLink('');
    setFormStatus('new');
    setFormNotes('');
    setIsFormOpen(true);
  };

  const openEditModal = (job: Job) => {
    triggerHaptic('light');
    setEditingJob(job);
    setFormSlNo(job.sl_no || '');
    setFormTitle(job.job_title);
    setFormCompany(job.company);
    setFormSalary(job.salary_package);
    setFormLocation(job.location);
    setFormSkills(job.skills_required.join(', '));
    setFormMatchedSkills(job.matched_skills.join(', '));
    setFormType(job.job_type || 'Full-Time');
    setFormExperience(job.experience);
    setFormLink(job.link_to_apply);
    setFormStatus(job.status as Job['status']);
    setFormNotes(job.notes);
    setIsFormOpen(true);
  };

  const handleStatusChange = async (job: Job, newStatus: Job['status']) => {
    triggerHaptic('light');
    try {
      await api.jobs.update(job.id, {
        sl_no: job.sl_no,
        job_title: job.job_title,
        company: job.company,
        salary_package: job.salary_package,
        location: job.location,
        skills_required: job.skills_required,
        matched_skills: job.matched_skills,
        job_type: job.job_type,
        experience: job.experience,
        link_to_apply: job.link_to_apply,
        status: newStatus,
        notes: job.notes,
      });
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j))
      );
      toast.success(`Marked as ${STATUS_CONFIG[newStatus].label}`);
    } catch (err: any) {
      toast.error(humanizeError(err.code));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formCompany.trim()) {
      toast.error('Job title and company are required');
      return;
    }

    setSubmitting(true);
    const body: JobInput = {
      sl_no: formSlNo.trim() || undefined,
      job_title: formTitle.trim(),
      company: formCompany.trim(),
      salary_package: formSalary.trim(),
      location: formLocation.trim(),
      skills_required: formSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      matched_skills: formMatchedSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      job_type: formType.trim(),
      experience: formExperience.trim(),
      link_to_apply: formLink.trim(),
      status: formStatus,
      notes: formNotes.trim(),
    };

    try {
      if (editingJob) {
        await api.jobs.update(editingJob.id, body);
        toast.success('Job updated');
      } else {
        await api.jobs.create(body);
        toast.success('Job added');
      }
      setIsFormOpen(false);
      fetchJobs();
    } catch (err: any) {
      toast.error(humanizeError(err.code));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingJob) return;
    try {
      await api.jobs.remove(deletingJob.id);
      setJobs((prev) => prev.filter((j) => j.id !== deletingJob.id));
      toast.success('Job removed');
      setDeletingJob(null);
    } catch (err: any) {
      toast.error(humanizeError(err.code));
    }
  };

  const handleClearAll = async () => {
    try {
      await api.jobs.clearAll();
      setJobs([]);
      toast.success('All jobs cleared');
      setIsClearAllOpen(false);
    } catch (err: any) {
      toast.error(humanizeError(err.code));
    }
  };

  // Distinct job types from current dataset
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.job_type?.trim()) set.add(j.job_type.trim());
    });
    return Array.from(set).sort();
  }, [jobs]);

  // Counts by status
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length };
    jobs.forEach((j) => {
      c[j.status] = (c[j.status] || 0) + 1;
    });
    return c;
  }, [jobs]);

  // 4.11: KPI cards show workspace totals; they keep the last unfiltered counts while filters are on.
  const totalsRef = useRef<Record<string, number>>({ all: 0 });
  if (listUnfiltered) totalsRef.current = counts;
  const totals = totalsRef.current;
  const totalsReady = listUnfiltered !== null;

  const filtersActive = Boolean(search) || statusFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => {
    triggerHaptic('light');
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
  };

  // Client-side display sort. null keeps the server order (newest first).
  const sortedJobs = useMemo(() => {
    if (!sort) return jobs;
    const order = new Map(jobs.map((j, i) => [j.id, i]));
    return [...jobs].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va === null && vb !== null) return 1;
      if (vb === null && va !== null) return -1;
      let cmp = 0;
      if (va !== null && vb !== null) {
        cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
        if (sort.dir === 'desc') cmp = -cmp;
      }
      return cmp || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.id - b.id;
    });
  }, [jobs, sort]);

  // Stable row callbacks so memoised rows skip re-rendering; they read the latest handlers.
  const rowHandlers = useRef({ handleStatusChange, openEditModal });
  rowHandlers.current = { handleStatusChange, openEditModal };
  const onRowStatus = useCallback(
    (job: Job, status: Job['status']) => rowHandlers.current.handleStatusChange(job, status),
    []
  );
  const onRowEdit = useCallback((job: Job) => rowHandlers.current.openEditModal(job), []);
  const onRowDelete = useCallback((job: Job) => {
    triggerHaptic('error');
    setDeletingJob(job);
  }, []);

  // Incremental rendering: a long list mounts PAGE_SIZE rows, then more as its end nears the
  // viewport, so layout, style and menu work stay small on phones.
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  useEffect(() => setShownCount(PAGE_SIZE), [search, statusFilter, typeFilter, sort]);
  const visibleJobs = useMemo(() => sortedJobs.slice(0, shownCount), [sortedJobs, shownCount]);
  const hasMore = sortedJobs.length > visibleJobs.length;
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShownCount((n) => n + PAGE_SIZE);
      },
      { root: el.closest('main'), rootMargin: '0px 0px 1200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
    // Re-observed after each batch, so a sentinel still in range loads the next one.
  }, [hasMore, visibleJobs.length, loading]);

  const cycleSort = (key: SortKey) => {
    triggerHaptic('light');
    const first = SORT_FIRST_DIR[key];
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: first };
      if (prev.dir === first) return { key, dir: first === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  };

  const currentSortOption = SORT_OPTIONS.find(
    (o) => (o.sort === null && sort === null) || (o.sort && sort && o.sort.key === sort.key && o.sort.dir === sort.dir)
  );
  const sortChipLabel = currentSortOption
    ? currentSortOption.label
    : sort
      ? `${SORT_KEY_LABEL[sort.key]}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`
      : 'Newest first';

  const sortHeader = (k: SortKey, label: string, className = '') => {
    const on = sort?.key === k;
    return (
      <th
        key={k}
        scope="col"
        className={className || undefined}
        aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        <button type="button" className={`th-sort${on ? ' on' : ''}`} onClick={() => cycleSort(k)}>
          <span>{label}</span>
          <span className="sort-ico">
            {on ? (
              sort!.dir === 'asc' ? (
                <ArrowUp className="i" aria-hidden="true" />
              ) : (
                <ArrowDown className="i" aria-hidden="true" />
              )
            ) : (
              <ChevronsUpDown className="i" aria-hidden="true" />
            )}
          </span>
        </button>
      </th>
    );
  };

  const statusLabel =
    statusFilter === 'all'
      ? 'All statuses'
      : STATUS_CONFIG[statusFilter as Job['status']]?.label || statusFilter;
  const typeLabel = typeFilter === 'all' ? 'All types' : typeFilter;
  const showTypeChip = availableTypes.length > 0 || typeFilter !== 'all';
  const typeOptions =
    typeFilter !== 'all' && !availableTypes.includes(typeFilter)
      ? [typeFilter, ...availableTypes]
      : availableTypes;

  const KPI_ITEMS: { key: string; label: string; tone: Tone; icon: React.ElementType }[] = [
    { key: 'all', label: 'Jobs', tone: 't-neutral', icon: Briefcase },
    { key: 'new', label: STATUS_CONFIG.new.label, tone: STATUS_CONFIG.new.tone, icon: Inbox },
    { key: 'applied', label: STATUS_CONFIG.applied.label, tone: STATUS_CONFIG.applied.tone, icon: Send },
    {
      key: 'interviewing',
      label: STATUS_CONFIG.interviewing.label,
      tone: STATUS_CONFIG.interviewing.tone,
      icon: MessagesSquare,
    },
  ];

  const webhookUrl = webhookConfig?.webhook_url || 'https://utility.fermyon.app/api/webhook';

  return (
    <div className="w-full">
      {/* View header: description, secondary and the single primary action */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="page-desc">
          Jobs sent from your Google Sheet webhook, plus the ones you add yourself.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openWebhookModal}
            className="btn outlined xs"
            aria-label="Webhook setup"
          >
            <Webhook className="i" aria-hidden="true" />
            <span className="max-sm:hidden">Webhook setup</span>
            <span className="sm:hidden">Webhook</span>
          </button>
          <button type="button" onClick={openAddModal} className="btn filled create-fab xs">
            <Plus className="i" aria-hidden="true" />
            <span>Add job</span>
          </button>
        </div>
      </div>

      {/* 4.11 KPI cards: workspace totals per status */}
      <section className="kpis mt-5" aria-label="Jobs summary">
        {KPI_ITEMS.map(({ key, label, tone, icon: Icon }) => (
          <div key={key} className={`kpi ${tone}`}>
            <div className="kpi-top">
              <span className="kpi-label">{label}</span>
              <span className="shape-icon">
                <Icon className="i" aria-hidden="true" />
              </span>
            </div>
            <span className="kpi-n">{totalsReady ? (totals[key] || 0).toLocaleString() : '—'}</span>
          </div>
        ))}
      </section>

      {/* Toolbar: search left, filter chips right */}
      <div className="filter-bar">
        <label className="search-bar">
          <Search className="i" aria-hidden="true" />
          <span className="sr">Search jobs</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, company, skills or location"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd aria-hidden="true">/</kbd>
          <button
            type="button"
            className="icon-btn search-clear"
            aria-label="Clear search"
            hidden={!search}
            onClick={() => {
              setSearch('');
              searchRef.current?.focus();
            }}
          >
            <X className="i" aria-hidden="true" />
          </button>
        </label>

        <div className="filter-chips">
          <button
            ref={statusChipRef}
            type="button"
            className={`chip${statusFilter !== 'all' ? ' on' : ''}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'status'}
            onClick={() => {
              triggerHaptic('light');
              setOpenMenu((m) => (m === 'status' ? null : 'status'));
            }}
          >
            <Filter className="i" aria-hidden="true" />
            <span className="chip-label">{statusLabel}</span>
            <ChevronDown className="i chev" aria-hidden="true" />
          </button>

          {showTypeChip && (
            <button
              ref={typeChipRef}
              type="button"
              className={`chip${typeFilter !== 'all' ? ' on' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'type'}
              onClick={() => {
                triggerHaptic('light');
                setOpenMenu((m) => (m === 'type' ? null : 'type'));
              }}
            >
              <Layers className="i" aria-hidden="true" />
              <span className="chip-label">{typeLabel}</span>
              <ChevronDown className="i chev" aria-hidden="true" />
            </button>
          )}

          <button
            ref={sortChipRef}
            type="button"
            className="chip sort-chip"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'sort'}
            aria-label={`Sort: ${sortChipLabel}`}
            onClick={() => {
              triggerHaptic('light');
              setOpenMenu((m) => (m === 'sort' ? null : 'sort'));
            }}
          >
            <ArrowUpDown className="i" aria-hidden="true" />
            <span className="chip-label">{sortChipLabel}</span>
            <ChevronDown className="i chev" aria-hidden="true" />
          </button>

          {filtersActive && (
            <button type="button" className="btn text xs" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {openMenu === 'status' && (
        <FloatingMenu
          anchor={statusChipRef.current}
          label="Filter by status"
          items={[
            { id: 'all', label: 'All statuses', checked: statusFilter === 'all' },
            { sep: true, id: 'sep' },
            ...ALL_STATUSES.map((st) => ({
              id: st,
              label: STATUS_CONFIG[st].label,
              tone: STATUS_CONFIG[st].tone,
              checked: statusFilter === st,
              meta: totalsReady ? (
                <small className="tabular body-small text-on-surface-variant">{totals[st] || 0}</small>
              ) : undefined,
            })),
          ]}
          onSelect={(id) => setStatusFilter(id)}
          onClose={() => setOpenMenu(null)}
        />
      )}

      {openMenu === 'type' && (
        <FloatingMenu
          anchor={typeChipRef.current}
          label="Filter by type"
          items={[
            { id: 'all', label: 'All types', checked: typeFilter === 'all' },
            { sep: true, id: 'sep' },
            ...typeOptions.map((t) => ({ id: t, label: t, checked: typeFilter === t })),
          ]}
          onSelect={(id) => setTypeFilter(id)}
          onClose={() => setOpenMenu(null)}
        />
      )}

      {openMenu === 'sort' && (
        <FloatingMenu
          anchor={sortChipRef.current}
          label="Sort jobs"
          items={SORT_OPTIONS.map((o) => ({
            id: o.id,
            label: o.label,
            checked: currentSortOption?.id === o.id,
          }))}
          onSelect={(id) => setSort(SORT_OPTIONS.find((o) => o.id === id)?.sort ?? null)}
          onClose={() => setOpenMenu(null)}
        />
      )}

      {/* 4.14 Panel with the jobs table */}
      {loading ? (
        <PageSkeleton kind="jobs" />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={filtersActive ? Search : Briefcase}
          title={filtersActive ? 'No jobs match these filters' : 'No jobs yet'}
          hint={
            filtersActive
              ? 'Try a different status, type or search.'
              : 'Send jobs from Google Sheets with your webhook, or add them yourself to track applications.'
          }
          actionLabel={filtersActive ? 'Clear filters' : 'Set up webhook'}
          onAction={filtersActive ? clearFilters : openWebhookModal}
          filtered={filtersActive}
        />
      ) : (
        <section className="panel" aria-label="Jobs">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {sortHeader('title', 'Job', 'c-main')}
                  {sortHeader('location', 'Location')}
                  {sortHeader('salary', 'Salary')}
                  {sortHeader('type', 'Type')}
                  <th scope="col">Skills</th>
                  {sortHeader('status', 'Status')}
                  {sortHeader('added', 'Added')}
                  <th scope="col" className="c-actions">
                    <span className="sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onStatusChange={onRowStatus}
                    onEdit={onRowEdit}
                    onDelete={onRowDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="load-more">
              <button type="button" className="btn text xs" onClick={() => setShownCount((n) => n + PAGE_SIZE)}>
                Show more
              </button>
            </div>
          )}

          {/* 4.16 Footer: visible range and the destructive "clear all" */}
          <footer className="panel-foot">
            <div className="foot-left">
              <span className="foot-range">
                1–{visibleJobs.length} of {jobs.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsClearAllOpen(true)}
              className="btn danger-text xs"
            >
              <Trash2 className="i" aria-hidden="true" />
              <span>Clear all</span>
            </button>
          </footer>
        </section>
      )}

      {/* Webhook Configuration Modal */}
      <Modal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
        title="Google Apps Script webhook"
        maxWidth="max-w-2xl"
      >
        {loadingConfig ? (
          <PageSkeleton kind="webhook" label="Loading webhook configuration…" />
        ) : !webhookConfig ? (
          <div className="empty bare">
            <div className="empty-shape" aria-hidden="true">
              <Webhook className="i" />
            </div>
            <h3>Webhook configuration is unavailable</h3>
            <p>Check your connection and try again.</p>
            <button type="button" onClick={openWebhookModal} className="btn tonal">
              Try again
            </button>
          </div>
        ) : (
          <div className="fields">
            <p className="m-0 text-on-surface-variant">
              Configure Google Apps Script to send job rows straight into your utility database whenever new
              openings appear.
            </p>

            {/* Webhook URL */}
            <div className="field">
              <span className="field-label">Webhook endpoint URL</span>
              <div className="linkbox">
                <span className="select-text font-mono" title={webhookUrl}>
                  {webhookUrl}
                </span>
                <CopyButton text={webhookUrl} ariaLabel="Copy webhook URL" />
              </div>
            </div>

            {/* Webhook Secret / Bearer Token */}
            <div className="field">
              <div className="flex items-center justify-between gap-3">
                <span className="field-label">Bearer secret token</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!regeneratingSecret) handleRegenerateSecret();
                  }}
                  aria-disabled={regeneratingSecret || undefined}
                  className={`btn text xs${regeneratingSecret ? ' is-busy' : ''}`}
                >
                  <span className="loading" aria-hidden="true" />
                  {!regeneratingSecret && <RefreshCw className="i" aria-hidden="true" />}
                  <span>Regenerate</span>
                </button>
              </div>
              <div className="linkbox">
                <span className="select-text font-mono" title={webhookConfig?.webhook_secret || undefined}>
                  {webhookConfig?.webhook_secret || 'Loading secret…'}
                </span>
                {webhookConfig?.webhook_secret && (
                  <CopyButton text={webhookConfig.webhook_secret} ariaLabel="Copy webhook secret" />
                )}
              </div>
              <p className="m-0 body-small text-on-surface-variant">
                Send it in the HTTP request header:{' '}
                <code className="select-text rounded-sm bg-surface-container-high px-1.5 py-0.5 font-mono text-on-surface">
                  Authorization: Bearer &lt;token&gt;
                </code>
              </p>
            </div>

            {/* Apps Script Ready Code */}
            <div className="field">
              <div className="flex items-center justify-between gap-3">
                <span className="field-label inline-flex items-center gap-2">
                  <Code2 className="i !h-4 !w-4 text-on-surface-variant" aria-hidden="true" />
                  <span>Google Apps Script code</span>
                </span>
                {webhookConfig?.gas_code_sample && (
                  <CopyButton text={webhookConfig.gas_code_sample} ariaLabel="Copy Google Apps Script code" />
                )}
              </div>
              <pre className="m-0 max-h-56 select-text overflow-auto rounded-sm border border-outline-variant bg-surface-container-high p-3.5 font-mono body-small text-on-surface">
                {webhookConfig?.gas_code_sample || '// Loading sample script...'}
              </pre>
            </div>

            {/* cURL Test Sample */}
            <div className="field">
              <div className="flex items-center justify-between gap-3">
                <span className="field-label inline-flex items-center gap-2">
                  <Terminal className="i !h-4 !w-4 text-on-surface-variant" aria-hidden="true" />
                  <span>cURL test command</span>
                </span>
                {webhookConfig?.curl_sample && (
                  <CopyButton text={webhookConfig.curl_sample} ariaLabel="Copy cURL command" />
                )}
              </div>
              <pre className="m-0 max-h-32 select-text overflow-auto rounded-sm border border-outline-variant bg-surface-container-high p-3.5 font-mono body-small text-on-surface">
                {webhookConfig?.curl_sample || '// Loading curl sample...'}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / Edit Job Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingJob ? 'Edit job' : 'Add job'}
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            if (submitting) {
              e.preventDefault();
              return;
            }
            handleFormSubmit(e);
          }}
          aria-busy={submitting || undefined}
          className="fields"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Job title</span>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Senior Rust Engineer"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">Company</span>
              <input
                type="text"
                required
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                placeholder="e.g. Fermyon Technologies"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="field">
              <span className="field-label">
                Salary<span className="opt"> (optional)</span>
              </span>
              <input
                type="text"
                value={formSalary}
                onChange={(e) => setFormSalary(e.target.value)}
                placeholder="e.g. ₹18 - 25 LPA"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">
                Location<span className="opt"> (optional)</span>
              </span>
              <input
                type="text"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="e.g. Remote / Bengaluru"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">
                Type<span className="opt"> (optional)</span>
              </span>
              <input
                type="text"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                placeholder="e.g. Full-Time / Remote"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">
                Experience<span className="opt"> (optional)</span>
              </span>
              <input
                type="text"
                value={formExperience}
                onChange={(e) => setFormExperience(e.target.value)}
                placeholder="e.g. 2 - 4 years"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">
                Sheet SL no.<span className="opt"> (optional)</span>
              </span>
              <input
                type="text"
                value={formSlNo}
                onChange={(e) => setFormSlNo(e.target.value)}
                placeholder="e.g. 1"
                autoComplete="off"
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">
              Link to apply<span className="opt"> (optional)</span>
            </span>
            <input
              type="url"
              value={formLink}
              onChange={(e) => setFormLink(e.target.value)}
              placeholder="https://..."
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span className="field-label">
              Skills required<span className="opt"> (comma-separated)</span>
            </span>
            <input
              type="text"
              value={formSkills}
              onChange={(e) => setFormSkills(e.target.value)}
              placeholder="e.g. Rust, TypeScript, Docker, SQLite"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">
              Matched skills<span className="opt"> (comma-separated)</span>
            </span>
            <input
              type="text"
              value={formMatchedSkills}
              onChange={(e) => setFormMatchedSkills(e.target.value)}
              placeholder="e.g. Rust, TypeScript"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Status</span>
            <span className="select-wrap">
              <select
                value={formStatus}
                onChange={(e) => {
                  triggerHaptic('light');
                  setFormStatus(e.target.value as Job['status']);
                }}
              >
                {ALL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_CONFIG[st].label}
                  </option>
                ))}
              </select>
              <ChevronDown className="i" aria-hidden="true" />
            </span>
          </label>

          <label className="field">
            <span className="field-label">
              Notes<span className="opt"> (optional)</span>
            </span>
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="e.g. Referred by Alice"
              autoComplete="off"
            />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="btn text">
              Cancel
            </button>
            <button
              type="submit"
              aria-disabled={submitting || undefined}
              className={`btn filled${submitting ? ' is-busy' : ''}`}
            >
              <span className="loading" aria-hidden="true" />
              {submitting ? 'Saving…' : editingJob ? 'Save changes' : 'Add job'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Single Job Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingJob)}
        onClose={() => setDeletingJob(null)}
        onConfirm={handleDelete}
        title="Delete this job?"
        message={`"${deletingJob?.job_title}" at ${deletingJob?.company} will be removed from your feed.`}
        confirmLabel="Delete job"
        danger
      />

      {/* Clear All Jobs Dialog */}
      <ConfirmDialog
        isOpen={isClearAllOpen}
        onClose={() => setIsClearAllOpen(false)}
        onConfirm={handleClearAll}
        title="Clear all jobs?"
        message="Every job in your feed will be deleted from your database. This can't be undone."
        confirmLabel="Clear all jobs"
        danger
      />
    </div>
  );
}
