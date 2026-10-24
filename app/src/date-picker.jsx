/* A compact table calendar for picking an exam date.
   It renders the calendar that belongs to the active language: Jalali (Persian) for
   the Persian UI, Gregorian for the English one — same grid, same interaction. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addCalendarMonths, clampCalendarParts, dayIndex, daysInCalendarMonth,
  fromCalendarParts, parseLocalDate, toCalendarParts, toInput,
} from './calendar.js';

function CalendarGrid({ value, onChange, format, t, onClose }) {
  const calendar = format.calendar;
  const todayParts = useMemo(() => toCalendarParts(new Date(), calendar), [calendar]);
  const selectedParts = useMemo(() => toCalendarParts(parseLocalDate(value), calendar), [value, calendar]);
  const [view, setView] = useState(() => selectedParts || todayParts);
  const [mode, setMode] = useState('day'); // 'day' → the month grid, 'month' → month/year chooser
  const gridRef = useRef(null);

  /* Keep the visible month in sync when the exam date changes from the outside. */
  useEffect(() => {
    if (selectedParts) setView({ year: selectedParts.year, month: selectedParts.month, day: selectedParts.day });
  }, [selectedParts?.year, selectedParts?.month, selectedParts?.day]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthLength = daysInCalendarMonth(view.year, view.month, calendar);
  const firstOfMonth = fromCalendarParts(view.year, view.month, 1, calendar);
  const leading = dayIndex(firstOfMonth);
  const cells = useMemo(() => {
    const list = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= monthLength; day += 1) list.push(day);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [leading, monthLength]);

  const isToday = (day) => Boolean(todayParts && todayParts.year === view.year
    && todayParts.month === view.month && todayParts.day === day);
  const isSelected = (day) => Boolean(selectedParts && selectedParts.year === view.year
    && selectedParts.month === view.month && selectedParts.day === day);

  const pickDay = (day) => {
    onChange(toInput(fromCalendarParts(view.year, view.month, day, calendar)));
    onClose();
  };

  const shift = (delta, unit) => setView((current) => {
    if (unit === 'year') {
      return clampCalendarParts({ ...current, year: current.year + delta }, calendar);
    }
    return clampCalendarParts(addCalendarMonths(current, delta, calendar), calendar);
  });

  const otherDate = format.otherCalendarDate(parseLocalDate(value));

  return (
    <div
      className="datepicker"
      ref={gridRef}
      role="group"
      aria-label={t('datepicker.title')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation(); // only closes the calendar, not the whole dialog
        if (mode === 'month') setMode('day');
        else onClose();
      }}
    >
      <div className="datepicker-head">
        <button
          type="button"
          className="datepicker-nav"
          aria-label={mode === 'month' ? t('datepicker.prevYear') : t('datepicker.prevMonth')}
          onClick={() => shift(-1, mode === 'month' ? 'year' : 'month')}
        ><ChevronLeft size={16} /></button>

        <button
          type="button"
          className="datepicker-title"
          aria-expanded={mode === 'month'}
          onClick={() => setMode((current) => (current === 'month' ? 'day' : 'month'))}
          title={t('datepicker.chooseMonth')}
        >
          {mode === 'month'
            ? <b>{format.digits(view.year)}</b>
            : <b>{format.monthTitle(view.year, view.month)}</b>}
        </button>

        <button
          type="button"
          className="datepicker-nav"
          aria-label={mode === 'month' ? t('datepicker.nextYear') : t('datepicker.nextMonth')}
          onClick={() => shift(1, mode === 'month' ? 'year' : 'month')}
        ><ChevronRight size={16} /></button>
      </div>

      {mode === 'month' ? (
        <div className="datepicker-months">
          {format.monthNames().map((name, index) => (
            <button
              key={name}
              type="button"
              className={view.month === index + 1 ? 'selected' : ''}
              aria-pressed={view.month === index + 1}
              onClick={() => {
                setView(clampCalendarParts({ year: view.year, month: index + 1, day: view.day }, calendar));
                setMode('day');
              }}
            ><span>{name}</span></button>
          ))}
        </div>
      ) : (
        <>
          <div className="datepicker-weekdays" aria-hidden="true">
            {format.days.map((day) => <span key={day.index}>{day.chip}</span>)}
          </div>
          <div className="datepicker-grid">
            {cells.map((day, index) => (day === null
              ? <span className="datepicker-cell empty" key={`empty-${index}`} aria-hidden="true" />
              : (
                <button
                  type="button"
                  key={`day-${day}`}
                  className={`datepicker-cell ${isToday(day) ? 'is-today' : ''} ${isSelected(day) ? 'is-selected' : ''}`}
                  aria-current={isSelected(day) ? 'date' : undefined}
                  onClick={() => pickDay(day)}
                >{format.digits(day)}</button>
              )))}
          </div>
        </>
      )}

      <div className="datepicker-foot">
        <button
          type="button"
          className="datepicker-today"
          onClick={() => {
            const today = new Date();
            onChange(toInput(today));
            onClose();
          }}
        >{t('datepicker.today')}</button>
        {otherDate && <small>{t('datepicker.equivalent', { date: otherDate })}</small>}
      </div>
    </div>
  );
}

/* A field-styled button that opens the calendar right underneath it. */
export function DateField({ value, onChange, label, t, format }) {
  const [open, setOpen] = useState(false);
  const date = parseLocalDate(value);
  const labelText = Number.isNaN(date.getTime()) ? '' : format.fullDate(date);

  return (
    <div className="field date-field">
      <span>{label}</span>
      <button
        type="button"
        className={`date-trigger ${open ? 'open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={17} />
        <b>{labelText}</b>
        <span className="date-trigger-iso" dir="ltr">{value}</span>
        <ChevronDown size={15} className="date-trigger-chevron" />
      </button>
      {open && (
        <CalendarGrid
          value={value}
          onChange={onChange}
          format={format}
          t={t}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
