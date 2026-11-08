import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  List,
  Repeat,
} from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import {
  startOfDay,
  addDays,
  fmtMonth,
  fmtDate,
  fmtTime,
  sameDay,
  dayKey,
} from '../../lib/datetime';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationsContext';
import { EventFormModal } from './EventFormModal';
import { ItemDetailModal } from './ItemDetailModal';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import type { CalendarItem, Event } from '../../types';
import { ConnectedGroup } from '../../components/ui/ConnectedGroup';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Tone class per item kind (DESIGN.md 2.2): events info, tasks warn (ok when done), reminders violet. */
function toneOf(it: CalendarItem): string {
  if (it.type === 'event') return 't-primary';
  if (it.type === 'task') return it.done ? 't-success' : 't-warning';
  return 't-violet';
}

function labelOf(it: CalendarItem): string {
  if (it.type === 'event') return 'Event';
  if (it.type === 'task') return it.done ? 'Done' : 'Task';
  return 'Reminder';
}

/** One calendar item as a list row: time metadata (4.9 .when), title, kind badge. */
function ItemRow({
  it,
  onOpen,
  className = '',
}: {
  it: CalendarItem;
  onOpen: () => void;
  className?: string;
}) {
  const tone = toneOf(it);
  const label = labelOf(it);
  const endsSameDay =
    !it.all_day && it.end != null && it.end > it.when && dayKey(it.end) === dayKey(it.when);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full min-h-[56px] items-center gap-3 text-left transition-colors duration-150 ease-spatial-fast hover:bg-state-hover focus-visible:bg-state-hover ${className}`}
    >
      <div className="when w-[4.75rem] shrink-0 tabular">
        <span className="body-medium">{it.all_day ? 'All day' : fmtTime(it.when)}</span>
        {endsSameDay && <small>to {fmtTime(it.end as number)}</small>}
      </div>

      <span className={`dot ${tone} sm:hidden`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate title-small text-on-surface">
        {it.title}
      </span>
      <span className="sr-only sm:hidden">{label}</span>

      {it.recurring && (
        <Repeat className="i h-4 w-4 shrink-0 text-on-surface-variant" aria-label="Repeats" role="img" />
      )}
      <span className={`status ${tone} inline-flex shrink-0 max-sm:hidden`}>
        <span className="dot" />
        {label}
      </span>
    </button>
  );
}

export function CalendarView() {
  const toast = useToast();
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const { pendingOpen, consumeOpen } = useNotifications();

  // A tapped notification opens its event's details.
  useEffect(() => {
    if (pendingOpen?.kind !== 'event') return;
    const { id, title, at } = pendingOpen;
    consumeOpen();
    setSelectedItem({ type: 'event', id, title, when: at, end: null, all_day: false, recurring: false });
  }, [pendingOpen]);
  const [selectedDayInfo, setSelectedDayInfo] = useState<{ day: Date; items: CalendarItem[] } | null>(
    null
  );

  const loadCalendarItems = useCallback(async () => {
    setLoading(true);
    try {
      let from: number;
      let to: number;

      if (viewMode === 'month') {
        const first = startOfDay(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
        const offset = (first.getDay() + 6) % 7; // Monday-first
        const gridStart = addDays(first, -offset);
        const gridEnd = addDays(gridStart, 42);
        from = Math.floor(gridStart.getTime() / 1000);
        to = Math.floor(gridEnd.getTime() / 1000);
      } else {
        from = Math.floor(startOfDay(anchorDate).getTime() / 1000);
        to = Math.floor(addDays(startOfDay(anchorDate), 60).getTime() / 1000);
      }

      const data = await api.calendar.items(from, to);
      setItems(data);
    } catch (err: any) {
      toast.error(err instanceof ApiError ? humanizeError(err.code) : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [anchorDate, viewMode, toast]);

  useEffect(() => {
    loadCalendarItems();
  }, [loadCalendarItems]);

  const shiftDate = (delta: number) => {
    triggerHaptic('light');
    if (viewMode === 'month') {
      setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + delta, 1));
    } else {
      setAnchorDate(addDays(anchorDate, delta * 30));
    }
  };

  const jumpToToday = () => {
    triggerHaptic('light');
    setAnchorDate(startOfDay(new Date()));
  };

  const switchView = (mode: 'month' | 'agenda') => {
    if (mode === viewMode) return;
    triggerHaptic('light');
    setViewMode(mode);
  };

  // Group items by day for Month grid
  const itemsByDay = new Map<string, CalendarItem[]>();
  items.forEach((item) => {
    const k = dayKey(item.when);
    if (!itemsByDay.has(k)) itemsByDay.set(k, []);
    itemsByDay.get(k)!.push(item);
  });

  const getDayItems = (d: Date) => {
    return itemsByDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) || [];
  };

  // Agenda: the same items grouped by date (order within a day is kept)
  const agendaGroups = Array.from(itemsByDay.values())
    .map((dayItems) => ({ day: startOfDay(new Date(dayItems[0].when * 1000)), items: dayItems }))
    .sort((a, b) => a.day.getTime() - b.day.getTime());

  // Build 42 grid cells for month view
  const firstOfMonth = startOfDay(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
  const offset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -offset);
  const gridDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  const activeMonth = anchorDate.getMonth();

  const stepLabel = viewMode === 'month' ? 'month' : '30 days';

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {/* Period navigation */}
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="icon-btn "
            aria-label={`Previous ${stepLabel}`}
            data-tip={`Previous ${stepLabel}`}
          >
            <ChevronLeft className="i" />
          </button>
          <h2
            className="min-w-[8.5rem] px-1 text-center title-medium text-on-surface"
            aria-live="polite"
          >
            {fmtMonth(anchorDate)}
          </h2>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="icon-btn "
            aria-label={`Next ${stepLabel}`}
            data-tip={`Next ${stepLabel}`}
          >
            <ChevronRight className="i" />
          </button>

          <button
            type="button"
            onClick={jumpToToday}
            className="btn xs outlined ml-1.5 h-10 sm:h-[34px]"
          >
            Today
          </button>
        </div>

        {/* View switch and add event */}
        <div className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          <ConnectedGroup
            ariaLabel="Calendar view"
            size="xs"
            value={viewMode}
            onChange={(v) => switchView(v)}
            options={[{ value: 'month', label: 'Month', icon: CalendarDays }, { value: 'agenda', label: 'Agenda', icon: List }]}
          />

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setEditingEvent(null);
              setIsFormOpen(true);
            }}
            className="btn filled create-fab"
          >
            <Plus className="i" />
            <span className="inline max-sm:hidden">New event</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Main View Container */}
      {loading ? (
        <PageSkeleton kind={viewMode === 'month' ? 'calendar' : 'agenda'} />
      ) : viewMode === 'month' ? (
        <section className="panel" aria-label={`${fmtMonth(anchorDate)} calendar`}>
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-outline-variant" aria-hidden="true">
            {WEEKDAYS.map((w) => (
              <span
                key={w}
                className="py-2.5 text-center label-medium text-on-surface-variant"
              >
                {w}
              </span>
            ))}
          </div>

          {/* Month 42 day grid */}
          <div className="grid grid-cols-7">
            {gridDays.map((day, i) => {
              const inMonth = day.getMonth() === activeMonth;
              const isToday = sameDay(day, today);
              const dayItems = getDayItems(day);
              const hasItems = dayItems.length > 0;
              const isSelected = selectedDayInfo !== null && sameDay(selectedDayInfo.day, day);
              const dotItems = dayItems.length > 3 ? dayItems.slice(0, 2) : dayItems;

              const numberClass = `grid h-6 min-w-6 place-items-center rounded-full px-1 label-medium tabular ${
                isToday ? 'bg-primary text-on-primary' : inMonth ? 'text-on-surface' : 'text-on-surface-variant'
              }`;

              return (
                <div
                  key={i}
                  onClick={() => {
                    if (dayItems.length > 0) {
                      triggerHaptic('light');
                      setSelectedDayInfo({ day, items: dayItems });
                    }
                  }}
                  className={`flex min-h-[3.5rem] min-w-0 flex-col items-center gap-1.5 p-1 transition-colors duration-150 ease-spatial-fast sm:min-h-[6rem] sm:items-stretch sm:gap-1 sm:p-1.5 ${
                    i % 7 === 6 ? '' : 'border-r border-outline-variant'
                  } ${i >= 35 ? '' : 'border-b border-outline-variant'} ${
                    isSelected ? 'bg-secondary-container' : hasItems ? 'cursor-pointer hover:bg-state-hover' : ''
                  }`}
                >
                  <div className="flex justify-center sm:justify-start">
                    {hasItems ? (
                      <button
                        type="button"
                        className={numberClass}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={`${fmtDate(day)}, ${dayItems.length} ${
                          dayItems.length === 1 ? 'item' : 'items'
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    ) : (
                      <span className={numberClass} aria-current={isToday ? 'date' : undefined}>
                        {day.getDate()}
                      </span>
                    )}
                  </div>

                  {/* Phone: tone dots */}
                  {hasItems && (
                    <div className="flex items-center justify-center gap-[3px] sm:hidden" aria-hidden="true">
                      {dotItems.map((it) => (
                        <span key={`${it.type}-${it.id}-${it.when}`} className={`dot ${toneOf(it)}`} />
                      ))}
                      {dayItems.length > 3 && (
                        <span className="body-small text-on-surface-variant tabular">
                          +{dayItems.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Wider screens: tone pills */}
                  <div className="flex min-w-0 flex-col gap-1 max-sm:hidden">
                    {dayItems.slice(0, 2).map((it) => (
                      <button
                        key={`${it.type}-${it.id}-${it.when}`}
                        type="button"
                        title={it.title}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                          setSelectedItem(it);
                        }}
                        className={`${toneOf(it)} flex h-[22px] w-full min-w-0 items-center rounded-full border border-transparent bg-tone-container px-2 text-left label-medium text-tone transition-colors duration-150 ease-spatial-fast hover:border-tone`}
                      >
                        <span className="truncate">{it.title}</span>
                      </button>
                    ))}

                    {dayItems.length > 2 && (
                      <span className="px-2 label-medium text-on-surface-variant">
                        +{dayItems.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-outline-variant px-4 py-3 body-small text-on-surface-variant sm:px-5">
            <span className="inline-flex items-center gap-1.5">
              <span className="dot t-primary" aria-hidden="true" />
              Events
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="dot t-warning" aria-hidden="true" />
              Tasks
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="dot t-success" aria-hidden="true" />
              Done
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="dot t-violet" aria-hidden="true" />
              Reminders
            </span>
          </div>
        </section>
      ) : (
        /* Agenda View */
        <>
          {items.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title="Nothing scheduled"
              hint="Nothing scheduled in the next 60 days."
            />
          ) : (
            <section className="panel" aria-label="Agenda">
              {agendaGroups.map((group, gi) => (
                <div key={group.day.getTime()} className={gi === 0 ? '' : 'border-t border-outline-variant'}>
                  <h3 className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-high px-4 py-2 title-small text-on-surface-variant sm:px-5">
                    <span>{fmtDate(group.day)}</span>
                    {sameDay(group.day, today) && <span className="tag">Today</span>}
                  </h3>
                  <div className="divide-y divide-outline-variant">
                    {group.items.map((it) => (
                      <ItemRow
                        key={`${it.type}-${it.id}-${it.when}`}
                        it={it}
                        className="px-4 py-2.5 sm:px-5"
                        onOpen={() => {
                          triggerHaptic('light');
                          setSelectedItem(it);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* Day Items Modal (when clicked from Month view) */}
      <Modal
        isOpen={selectedDayInfo !== null}
        onClose={() => setSelectedDayInfo(null)}
        title={selectedDayInfo ? fmtDate(selectedDayInfo.day) : ''}
        maxWidth="max-w-md"
      >
        <div className="-mx-2 flex flex-col gap-0.5">
          {selectedDayInfo?.items.map((it) => (
            <ItemRow
              key={`${it.type}-${it.id}-${it.when}`}
              it={it}
              className="rounded-sm px-2 py-2"
              onOpen={() => {
                setSelectedDayInfo(null);
                setSelectedItem(it);
              }}
            />
          ))}
        </div>
      </Modal>

      {/* Event Create / Edit Modal */}
      <EventFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingEvent(null);
        }}
        event={editingEvent}
        onSaved={loadCalendarItems}
      />

      {/* Item Detail View Modal */}
      <ItemDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onEditEvent={(ev) => {
          setEditingEvent(ev);
          setIsFormOpen(true);
        }}
        onDeleted={loadCalendarItems}
      />
    </div>
  );
}
