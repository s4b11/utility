import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Flag,
  MapPin,
  Tag,
  Repeat,
  Bell,
  Pencil,
  Trash2,
  ListTodo,
  StickyNote,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { api } from '../../lib/api';
import { fmtTime, fmtDate, dayKey } from '../../lib/datetime';
import { useToast } from '../../context/ToastContext';
import type { CalendarItem, Event, Task, Note, Recurrence } from '../../types';

interface ItemDetailModalProps {
  item: CalendarItem | null;
  onClose: () => void;
  onEditEvent?: (event: Event) => void;
  onDeleted?: () => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FREQ_UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const;

function describeRecurrence(r?: Recurrence | null): string | null {
  if (!r || r.freq === 'none') return null;
  const unit = FREQ_UNIT[r.freq];
  const n = r.interval > 1 ? r.interval : 1;
  let text = n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`;
  if (r.freq === 'weekly' && r.byday?.length) {
    text += ` on ${r.byday.map((d) => DAY_NAMES[d]).filter(Boolean).join(', ')}`;
  }
  if (r.until) text += `, until ${fmtDate(r.until)}`;
  else if (r.count) text += `, ${r.count} times`;
  return text;
}

function describeLead(min: number): string {
  if (min <= 0) return 'At start time';
  if (min % 1440 === 0) {
    const d = min / 1440;
    return `${d} ${d === 1 ? 'day' : 'days'} before`;
  }
  if (min % 60 === 0) {
    const h = min / 60;
    return `${h} ${h === 1 ? 'hour' : 'hours'} before`;
  }
  return `${min} min before`;
}

const PRIORITY: Record<Task['priority'], { tone: string; label: string }> = {
  high: { tone: 't-error', label: 'High' },
  med: { tone: 't-warning', label: 'Medium' },
  low: { tone: 't-neutral', label: 'Low' },
};

/** 4.9 `.when`: date on top, time (or range) below. */
function When({ date, time }: { date: string; time?: string }) {
  return (
    <div className="when">
      <span>{date}</span>
      {time && <small>{time}</small>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t} className="tag">
          <Tag className="i" />
          {t}
        </span>
      ))}
    </div>
  );
}

export function ItemDetailModal({
  item,
  onClose,
  onEditEvent,
  onDeleted,
}: ItemDetailModalProps) {
  const toast = useToast();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [taskData, setTaskData] = useState<Task | null>(null);
  const [noteData, setNoteData] = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!item) {
      setEventData(null);
      setTaskData(null);
      setNoteData(null);
      return;
    }

    async function fetchDetail() {
      if (!item) return;
      setLoading(true);
      try {
        if (item.type === 'event') {
          const ev = await api.events.get(item.id);
          setEventData(ev);
        } else if (item.type === 'task') {
          const tk = await api.tasks.get(item.id);
          setTaskData(tk);
        } else if (item.type === 'reminder') {
          const nt = await api.notes.get(item.id);
          setNoteData(nt);
        }
      } catch {
        toast.error('Failed to load item details');
      } finally {
        setLoading(false);
      }
    }

    fetchDetail();
  }, [item, toast]);

  if (!item) return null;

  const handleDeleteEvent = async () => {
    if (!eventData || deleting) return;
    setDeleting(true);
    try {
      await api.events.remove(eventData.id);
      toast.success('Event deleted');
      onDeleted?.();
      onClose();
    } catch {
      toast.error('Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const eventWhen = (ev: Event) => {
    if (ev.all_day) return <When date={fmtDate(ev.start_at)} time="All day" />;
    if (dayKey(ev.start_at) === dayKey(ev.end_at)) {
      return <When date={fmtDate(ev.start_at)} time={`${fmtTime(ev.start_at)} – ${fmtTime(ev.end_at)}`} />;
    }
    return (
      <When
        date={`${fmtDate(ev.start_at)} – ${fmtDate(ev.end_at)}`}
        time={`${fmtTime(ev.start_at)} – ${fmtTime(ev.end_at)}`}
      />
    );
  };

  const eventRepeat = eventData ? describeRecurrence(eventData.recurrence) : null;
  const eventReminder =
    eventData?.reminder && eventData.reminder.status !== 'cancelled' ? eventData.reminder : null;

  return (
    <Modal
      isOpen={item !== null}
      onClose={onClose}
      title={item.title}
      maxWidth="max-w-md"
      footer={
        item.type === 'event' && eventData ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDeleteEvent}
              aria-disabled={deleting || undefined}
              className={`btn danger-text ${deleting ? 'is-busy' : ''}`}
            >
              <span className="loading" aria-hidden="true" />
              {!deleting && <Trash2 className="i" />}
              <span>Delete event</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onEditEvent?.(eventData);
                onClose();
              }}
              className="btn filled"
            >
              <Pencil className="i" />
              <span>Edit event</span>
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="btn text">
              Close
            </button>
          </div>
        )
      }
    >
      {loading ? (
        <PageSkeleton kind="detail" />
      ) : item.type === 'event' && eventData ? (
        <dl className="kv p-0">
          <Row label="Type">
            <span className="status t-primary">
              <CalendarDays className="i" />
              Event
            </span>
          </Row>
          <Row label="When">{eventWhen(eventData)}</Row>
          {eventRepeat && (
            <Row label="Repeats">
              <span className="with-ico whitespace-normal">
                <Repeat className="i" />
                {eventRepeat}
              </span>
            </Row>
          )}
          {eventReminder && (
            <Row label="Reminder">
              <span className="with-ico whitespace-normal">
                <Bell className="i" />
                {describeLead(eventReminder.lead_minutes)}
              </span>
            </Row>
          )}
          {eventData.location && (
            <Row label="Location">
              <span className="with-ico whitespace-normal">
                <MapPin className="i shrink-0" />
                {eventData.location}
              </span>
            </Row>
          )}
          {(eventData.tags || []).length > 0 && (
            <Row label="Tags">
              <Tags tags={eventData.tags} />
            </Row>
          )}
          {eventData.description && (
            <Row label="Description">
              <p className="m-0 whitespace-pre-wrap leading-relaxed text-on-surface-variant">
                {eventData.description}
              </p>
            </Row>
          )}
        </dl>
      ) : item.type === 'task' && taskData ? (
        <dl className="kv p-0">
          <Row label="Type">
            <span className="status t-warning">
              <ListTodo className="i" />
              Task deadline
            </span>
          </Row>
          <Row label="Status">
            {taskData.done ? (
              <span className="status t-success">
                <CheckCircle2 className="i" />
                Completed
              </span>
            ) : (
              <span className="status t-primary">
                <Clock className="i" />
                Pending
              </span>
            )}
          </Row>
          {PRIORITY[taskData.priority] && (
            <Row label="Priority">
              <span className={`status ${PRIORITY[taskData.priority].tone}`}>
                <Flag className="i" />
                {PRIORITY[taskData.priority].label}
              </span>
            </Row>
          )}
          {taskData.due_at && (
            <Row label="Due">
              <When date={fmtDate(taskData.due_at)} time={fmtTime(taskData.due_at)} />
            </Row>
          )}
          {(taskData.tags || []).length > 0 && (
            <Row label="Tags">
              <Tags tags={taskData.tags} />
            </Row>
          )}
          {taskData.description && (
            <Row label="Description">
              <p className="m-0 whitespace-pre-wrap leading-relaxed text-on-surface-variant">
                {taskData.description}
              </p>
            </Row>
          )}
        </dl>
      ) : item.type === 'reminder' && noteData ? (
        <dl className="kv p-0">
          <Row label="Type">
            <span className="status t-violet">
              <StickyNote className="i" />
              Note reminder
            </span>
          </Row>
          <Row label="When">
            <When date={fmtDate(item.when)} time={item.all_day ? 'All day' : fmtTime(item.when)} />
          </Row>
          <Row label="Note">
            {noteData.body ? (
              <p className="m-0 whitespace-pre-wrap leading-relaxed text-on-surface-variant">{noteData.body}</p>
            ) : (
              <span className="text-on-surface-variant">Empty note</span>
            )}
          </Row>
        </dl>
      ) : null}
    </Modal>
  );
}
