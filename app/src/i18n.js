/* ---------- languages, strings and formatting ----------
   Everything the user reads lives here: one dictionary per language, plus the
   Intl-based formatters (numbers, dates, weekday names) that belong to it.
   The Persian UI keeps the Jalali calendar and Persian digits; the English UI
   switches to the Gregorian calendar and Latin digits automatically. */

import { fromCalendarParts, toCalendarParts } from './calendar.js';

export const LANG_KEY = 'taghvim-lang';
export const DEFAULT_LANG = 'fa';

export const languages = [
  { id: 'fa', label: 'فارسی', nativeLabel: 'فارسی', dir: 'rtl', locale: 'fa-IR', calendar: 'persian', numbering: 'arabext' },
  { id: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr', locale: 'en-GB', calendar: 'gregory', numbering: 'latn' },
];

const strings = {
  /* ------------------------------------------------------------------ فارسی */
  fa: {
    'brand.title': 'تقویم',
    'brand.tagline': 'برنامه‌ریزی ساده و آرام',
    'word.plan': 'برنامه',
    'word.exam': 'امتحان',
    'format.percent': '٪',

    'nav.week': 'هفته من',
    'nav.exams': 'امتحان‌ها',
    'nav.section': 'بخش‌های برنامه',
    'nav.addPlan': 'برنامه تازه',
    'nav.addExam': 'ثبت امتحان',

    'action.settings': 'تنظیمات',
    'action.close': 'بستن',
    'action.cancel': 'انصراف',
    'action.edit': 'ویرایش',
    'action.add': 'افزودن',
    'action.save': 'ذخیره تغییرات',
    'action.addToCalendar': 'افزودن به تقویم',
    'action.view': 'مشاهده',
    'action.details': 'دیدن جزئیات',
    'action.undo': 'برگردان',
    'action.moveUp': 'بالا بردن',
    'action.moveDown': 'پایین بردن',
    'action.duplicate': 'کپی',
    'action.delete': 'حذف',
    'action.today': 'امروز',

    'search.plans': 'جست‌وجو در برنامه‌ها…',
    'search.exams': 'جست‌وجو در امتحان‌ها…',
    'search.label': 'جست‌وجو',
    'search.clear': 'پاک کردن جست‌وجو',
    'search.empty': 'چیزی پیدا نشد',
    'search.emptyHint': 'عبارت دیگری را امتحان کن یا جست‌وجو را پاک کن.',
    'search.noResult': 'نتیجه‌ای نبود',

    'hero.kicker.critical': 'هشدار فوری — امتحان امروز',
    'hero.kicker.urgent': '{remaining} تا امتحان',
    'hero.kicker.soon': 'امتحان در همین نزدیکی',
    'hero.kicker.week': 'هفته‌ات را بساز',
    'hero.kicker.exams': 'آماده و بی‌استرس',
    'hero.title.examToday': 'امروز امتحان {name} داری!',
    'hero.title.examTomorrow': 'فردا امتحان {name} داری',
    'hero.title.examDays': '{count} روز به امتحان {name} مانده',
    'hero.title.week': 'برای یک هفته‌ی خوب آماده‌ای؟',
    'hero.title.exams': 'امتحان‌ها، مرتب و جلوی چشم',
    'hero.desc.examToday': 'امتحان همین امروز برگزار می‌شود. موفق باشی! کارت‌ها و جزوه‌های لازم را چک کن.',
    'hero.desc.examTomorrow': 'فقط یک روز فرصت باقی است. امروز یک مرور نهایی کن و استراحت خوبی داشته باش.',
    'hero.desc.examDays': 'وقت طلایی مرور و جمع‌بندی است. با قدم‌های کوچک، آماده شو.',
    'hero.desc.weekEmpty': 'برنامه‌هایت را سبک و روشن بچین؛ بقیه‌اش قدم‌به‌قدم جلو می‌رود.',
    'hero.desc.weekNoTasks': 'امروز {count} برنامه داری؛ برای هر کدام زیرتسک بساز.',
    'hero.desc.weekTasksLeft': 'امروز {count} برنامه داری و {left} زیرتسک هنوز مانده.',
    'hero.desc.weekTasksDone': 'امروز {count} برنامه داری و همه زیرتسک‌ها را انجام داده‌ای. عالی بود!',
    'hero.desc.exams': 'تاریخ‌ها و مباحث مهم را یک‌جا نگه دار و هیچ موعدی را از دست نده.',
    'hero.action.goExams': 'رفتن به امتحان‌ها',
    'hero.action.newPlan': 'برنامه تازه',
    'hero.action.newExam': 'ثبت امتحان',

    'summary.label': 'خلاصه برنامه',
    'summary.examToday': 'امتحان امروز',
    'summary.examTomorrow': 'امتحان فردا',
    'summary.nextExam': 'نزدیک‌ترین امتحان',
    'summary.timeLeft': 'زمان باقی‌مانده',
    'summary.noExam': 'فعلاً خبری نیست',
    'summary.noExamHint': 'زمان خوبی برای مرور درس‌هاست',
    'summary.weekPlans': 'برنامه این هفته',
    'summary.activeDays': 'روز فعال',
    'summary.activeDaysUnit': 'از ۷',
    'summary.doneTasks': 'زیرتسک انجام‌شده',
    'summary.upcomingCount': 'کل امتحان‌های پیش رو',

    'alert.tomorrowExam': 'فردا امتحان {name} داری',
    'alert.tomorrowHint': 'یک مرور کوتاه امروز، خیال فردا را راحت می‌کند.',

    'countdown.daysHours': '{days} روز و {hours} ساعت',
    'countdown.hoursMinutes': '{hours} ساعت و {minutes} دقیقه',
    'countdown.minutesLeft': '{minutes} دقیقه مانده',
    'countdown.now': 'همین الان',
    'countdown.passed': 'برگزار شده',
    'countdown.label': 'شمارش معکوس',

    'week.eyebrow': 'نمای هفتگی',
    'week.title': 'برنامه‌های این هفته',
    'week.progress': '{done} از {total} زیرتسک انجام شد',
    'week.noTasks': 'زیرتسکی ثبت نشده',
    'week.dayEmpty': 'روز خلوتی است',
    'week.addPlan': '+ افزودن برنامه',
    'week.addToDay': 'افزودن برنامه به {day}',
    'week.dayPicker': 'انتخاب روز',
    'week.today': 'امروز',

    'plan.options': 'گزینه‌های {name}',
    'plan.time': 'ساعت',
    'plan.taskCount': '{done} از {total}',
    'plan.drag': 'جابه‌جایی {name}',
    'plan.dragHint': 'برای جابه‌جایی بین روزها بکش',
    'plan.dragDisabled': 'برای جابه‌جایی، جست‌وجو را پاک کن',
    'plan.dragActive': 'برای رها کردن، انگشت یا موس را ول کن',

    'task.markDone': 'انجام شد: {title}',
    'task.markUndone': 'برگرداندن: {title}',
    'task.doneTitle': 'انجام شد',
    'task.undoTitle': 'انجام‌نشده کن',
    'task.stickerChange': 'تغییر استیکر زیرتسک {title}',
    'task.stickerChoose': 'انتخاب استیکر زیرتسک {title}',
    'task.stickerHint': 'برای تغییر استیکر کلیک کن',
    'task.remove': 'حذف {title}',
    'task.addTo': 'افزودن زیرتسک به {title}',
    'task.addPlaceholder': 'زیرتسک تازه…',
    'task.firstPlaceholder': 'اولین زیرتسک را بنویس…',
    'task.add': 'افزودن زیرتسک',

    'exams.eyebrow': 'زمان‌بندی آزمون‌ها',
    'exams.title': 'امتحان‌های پیش رو',
    'exams.new': 'امتحان جدید',
    'exams.past': 'امتحان‌های برگزارشده',
    'exams.empty': 'فعلاً امتحانی در پیش نیست',
    'exams.emptyHint': 'با خیال راحت برنامه‌ریزی کن؛ امتحان بعدی را هم می‌توانی ثبت کنی.',
    'exams.firstExam': 'ثبت اولین امتحان',
    'exams.today': 'امروز',
    'exams.tomorrow': 'فردا',
    'exams.daysLeft': '{count} روز مانده',
    'exam.options': 'گزینه‌های {name}',
    'exam.remove': 'حذف {name}',

    'topics.toggle': 'مباحث امتحان',
    'topics.add': 'افزودن مبحث',
    'topics.addPlaceholder': 'مبحث تازه…',
    'topics.firstPlaceholder': 'اولین مبحث را بنویس…',
    'topics.addTo': 'افزودن مبحث به {name}',
    'topics.remove': 'حذف مبحث {title}',
    'topics.markDone': 'انجام شد: {title}',
    'topics.markUndone': 'برگرداندن: {title}',
    'topics.doneTitle': 'خوانده شد',
    'topics.undoTitle': 'خوانده‌نشده کن',
    'topics.progress': '{done} از {total}',
    'topics.ready': 'آماده',

    'empty.day': 'این روز هنوز خلوت است',
    'empty.dayHint': 'یک برنامه کوتاه اضافه کن تا از روزت بهترین استفاده را ببری.',
    'empty.addPlan': 'افزودن برنامه',

    'modal.eyebrowExam': 'تقویم آزمون‌ها',
    'modal.eyebrowPlan': 'برنامه هفتگی',
    'modal.examName': 'نام امتحان',
    'modal.planTitle': 'عنوان برنامه',
    'modal.examNamePlaceholder': 'مثلاً امتحان ریاضی',
    'modal.planTitlePlaceholder': 'مثلاً مرور فصل سوم',
    'modal.examDate': 'تاریخ امتحان',
    'modal.dayOfWeek': 'روز هفته',
    'modal.time': 'ساعت',
    'modal.optional': 'اختیاری',
    'modal.description': 'توضیحات',
    'modal.examDescriptionPlaceholder': 'نکته‌ها یا جزئیات این امتحان را بنویس…',
    'modal.planDescriptionPlaceholder': 'نکته‌ها یا جزئیات این برنامه را بنویس…',
    'modal.planSticker': 'استیکر برنامه',
    'modal.planColor': 'رنگ برنامه',
    'modal.colorOption': 'انتخاب رنگ {color}',

    'datepicker.open': 'انتخاب تاریخ',
    'datepicker.title': 'تقویم',
    'datepicker.prevMonth': 'ماه قبل',
    'datepicker.nextMonth': 'ماه بعد',
    'datepicker.prevYear': 'سال قبل',
    'datepicker.nextYear': 'سال بعد',
    'datepicker.chooseMonth': 'انتخاب ماه و سال',
    'datepicker.today': 'امروز',
    'datepicker.weekHeader': 'روزهای هفته',
    'datepicker.equivalent': 'برابر با {date}',

    'sticker.preview': 'پیش‌نمایش',
    'sticker.optional': 'اختیاری',
    'sticker.options': 'استیکرهای پیشنهادی',
    'sticker.choose': 'انتخاب استیکر {sticker}',
    'sticker.custom': 'ایموجی دلخواه',
    'sticker.customPlaceholder': 'اینجا انتخاب یا جای‌گذاری کن',
    'sticker.customLabel': '{label} دلخواه',
    'sticker.clear': 'پاک کردن',
    'sticker.remove': 'حذف {label}',
    'sticker.hint': 'می‌توانی از استیکرهای بالا انتخاب کنی یا ایموجی دلخواهت را وارد کنی.',

    'settings.eyebrow': 'شخصی‌سازی',
    'settings.title': 'تنظیمات تقویم',
    'settings.language': 'زبان برنامه',
    'settings.languageHint': 'زبان نوشته‌ها و تقویم را انتخاب کن.',
    'settings.theme': 'ظاهر برنامه',
    'settings.themeHint': 'حالت مناسب چشم و دستگاهت را انتخاب کن.',
    'settings.theme.auto': 'خودکار',
    'settings.theme.light': 'روشن',
    'settings.theme.dark': 'تیره',
    'settings.font': 'اندازه‌ی نوشته‌ها',
    'settings.fontHint': 'اندازه‌ی فونت برنامه را کوچک‌تر یا بزرگ‌تر کن.',
    'settings.fontSmaller': 'کوچک‌تر کردن فونت',
    'settings.fontBigger': 'بزرگ‌تر کردن فونت',
    'settings.data': 'پشتیبان و انتقال اطلاعات',
    'settings.dataHint': '{plans} برنامه و {exams} امتحان روی همین دستگاه ذخیره شده.',
    'settings.export': 'گرفتن پشتیبان',
    'settings.import': 'بازگردانی پشتیبان',
    'settings.file': 'انتخاب فایل پشتیبان',
    'settings.ics': 'خروجی امتحان‌ها برای گوگل‌کلندر (ICS)',
    'settings.clear': 'پاک‌سازی کامل',
    'settings.clearHint': 'همه برنامه‌ها و امتحان‌های این دستگاه حذف می‌شود. قبلش پشتیبان بگیر.',
    'settings.clearStart': 'پاک کردن همه داده‌ها',
    'settings.clearConfirm': 'بله، همه را پاک کن',
    'settings.shortcuts': 'میان‌برهای صفحه‌کلید',
    'settings.shortcutsHint': 'روی کامپیوتر سریع‌تر کار کن.',
    'settings.shortcut.add': 'افزودن مورد تازه',
    'settings.shortcut.search': 'جست‌وجو',
    'settings.shortcut.tabs': 'جابه‌جایی بین هفته و امتحان‌ها',
    'settings.shortcut.close': 'بستن پنجره‌ها',
    'settings.shortcut.drag': 'کشیدن دستگیره برنامه برای جابه‌جایی',
    'settings.motion': 'انیمیشن‌ها',
    'settings.motionHint': 'رویه‌های حرکتی برنامه را خاموش می‌کند (مناسب برای گوشی‌های ضعیف‌تر)',
    'settings.motionOn': 'رویه‌های حرکتی',
    'settings.motionOff': 'کاهش حرکتی (بدون انیمیشن)',
    'settings.privacy': 'همه اطلاعات فقط روی دستگاه تو نگهداری می‌شود و به سروری ارسال نمی‌شود.',

    'toast.planSaved': 'تغییرات برنامه ذخیره شد',
    'toast.planAdded': 'برنامه به هفته‌ات اضافه شد',
    'toast.planMoved': 'برنامه جابه‌جا شد',
    'toast.examSaved': 'تغییرات امتحان ذخیره شد',
    'toast.examAdded': 'امتحان به تقویمت اضافه شد',
    'toast.planDuplicated': 'یک کپی از برنامه ساخته شد',
    'toast.planRemoved': 'برنامه حذف شد',
    'toast.examRemoved': 'امتحان حذف شد',
    'toast.cleared': 'همه داده‌ها پاک شد',
    'toast.backupReady': 'فایل پشتیبان آماده شد',
    'toast.backupFailed': 'دریافت فایل در این مرورگر ممکن نشد',
    'toast.icsReady': 'فایل تقویم امتحان‌ها آماده شد',
    'toast.icsFailed': 'ساخت فایل تقویم ممکن نشد',
    'toast.importEmpty': 'در این فایل برنامه یا امتحان معتبری پیدا نشد',
    'toast.importDuplicate': 'همه موارد این پشتیبان از قبل موجود بودند',
    'toast.imported': '{plans} برنامه و {exams} امتحان بازگردانی شد',
    'toast.importFailed': 'فایل پشتیبان خوانده نشد؛ یک فایل JSON معتبر انتخاب کن',

    'fatal.title': 'مشکلی پیش آمد',
    'fatal.desc': 'اطلاعاتت حذف نشده؛ یک‌بار صفحه را تازه کن. اگر مشکل ادامه داشت، داده‌های ناسازگار را پاک کن.',
    'fatal.retry': 'تلاش دوباره',
    'fatal.reset': 'پاک‌سازی داده‌ها',
  },

  /* ----------------------------------------------------------------- English */
  en: {
    'brand.title': 'Taghvim',
    'brand.tagline': 'Simple, calm planning',
    'word.plan': 'plan',
    'word.exam': 'exam',
    'format.percent': '%',

    'nav.week': 'My week',
    'nav.exams': 'Exams',
    'nav.section': 'App sections',
    'nav.addPlan': 'New plan',
    'nav.addExam': 'Add exam',

    'action.settings': 'Settings',
    'action.close': 'Close',
    'action.cancel': 'Cancel',
    'action.edit': 'Edit',
    'action.add': 'Add',
    'action.save': 'Save changes',
    'action.addToCalendar': 'Add to calendar',
    'action.view': 'View',
    'action.details': 'See details',
    'action.undo': 'Undo',
    'action.moveUp': 'Move up',
    'action.moveDown': 'Move down',
    'action.duplicate': 'Duplicate',
    'action.delete': 'Delete',
    'action.today': 'Today',

    'search.plans': 'Search plans…',
    'search.exams': 'Search exams…',
    'search.label': 'Search',
    'search.clear': 'Clear search',
    'search.empty': 'Nothing found',
    'search.emptyHint': 'Try another word or clear the search.',
    'search.noResult': 'No matches',

    'hero.kicker.critical': 'Urgent — exam today',
    'hero.kicker.urgent': '{remaining} until the exam',
    'hero.kicker.soon': 'An exam is getting close',
    'hero.kicker.week': 'Build your week',
    'hero.kicker.exams': 'Ready and stress-free',
    'hero.title.examToday': 'Your {name} exam is today!',
    'hero.title.examTomorrow': 'Your {name} exam is tomorrow',
    'hero.title.examDays': '{count} days until your {name} exam',
    'hero.title.week': 'Ready for a good week?',
    'hero.title.exams': 'Exams, tidy and in sight',
    'hero.desc.examToday': 'The exam is today. Good luck! Check your notes and everything you need.',
    'hero.desc.examTomorrow': 'Only one day left. Do a short final review today and rest well.',
    'hero.desc.examDays': 'This is the golden time to review and wrap up. Small steps are enough.',
    'hero.desc.weekEmpty': 'Lay out your plans lightly and clearly — the rest follows step by step.',
    'hero.desc.weekNoTasks': 'You have {count} plans today; add a sub-task to each one.',
    'hero.desc.weekTasksLeft': 'You have {count} plans today and {left} sub-tasks still open.',
    'hero.desc.weekTasksDone': 'You have {count} plans today and every sub-task is done. Well done!',
    'hero.desc.exams': 'Keep every date and topic in one place so no deadline slips away.',
    'hero.action.goExams': 'Go to exams',
    'hero.action.newPlan': 'New plan',
    'hero.action.newExam': 'Add exam',

    'summary.label': 'Plan summary',
    'summary.examToday': 'Exam today',
    'summary.examTomorrow': 'Exam tomorrow',
    'summary.nextExam': 'Next exam',
    'summary.timeLeft': 'Time remaining',
    'summary.noExam': 'Nothing scheduled',
    'summary.noExamHint': 'A good moment to review your notes',
    'summary.weekPlans': 'Plans this week',
    'summary.activeDays': 'Active days',
    'summary.activeDaysUnit': 'of 7',
    'summary.doneTasks': 'Sub-tasks done',
    'summary.upcomingCount': 'Upcoming exams',

    'alert.tomorrowExam': 'Your {name} exam is tomorrow',
    'alert.tomorrowHint': 'A short review today makes tomorrow easy.',

    'countdown.daysHours': '{days} d {hours} h',
    'countdown.hoursMinutes': '{hours} h {minutes} min',
    'countdown.minutesLeft': '{minutes} min left',
    'countdown.now': 'right now',
    'countdown.passed': 'Held',
    'countdown.label': 'Countdown',

    'week.eyebrow': 'Weekly view',
    'week.title': "This week's plans",
    'week.progress': '{done} of {total} sub-tasks done',
    'week.noTasks': 'No sub-tasks yet',
    'week.dayEmpty': 'This day is free',
    'week.addPlan': '+ Add plan',
    'week.addToDay': 'Add a plan to {day}',
    'week.dayPicker': 'Choose a day',
    'week.today': 'Today',

    'plan.options': 'Options for {name}',
    'plan.time': 'at',
    'plan.taskCount': '{done} of {total}',
    'plan.drag': 'Move {name}',
    'plan.dragHint': 'Drag to another day',
    'plan.dragDisabled': 'Clear the search to reorder',
    'plan.dragActive': 'Release to drop it here',

    'task.markDone': 'Mark done: {title}',
    'task.markUndone': 'Mark not done: {title}',
    'task.doneTitle': 'Mark as done',
    'task.undoTitle': 'Mark as not done',
    'task.stickerChange': 'Change the sticker of {title}',
    'task.stickerChoose': 'Pick a sticker for {title}',
    'task.stickerHint': 'Click to change the sticker',
    'task.remove': 'Delete {title}',
    'task.addTo': 'Add a sub-task to {title}',
    'task.addPlaceholder': 'New sub-task…',
    'task.firstPlaceholder': 'Write the first sub-task…',
    'task.add': 'Add sub-task',

    'exams.eyebrow': 'Exam schedule',
    'exams.title': 'Upcoming exams',
    'exams.new': 'New exam',
    'exams.past': 'Past exams',
    'exams.empty': 'No upcoming exams',
    'exams.emptyHint': 'Plan calmly — you can add the next exam any time.',
    'exams.firstExam': 'Add the first exam',
    'exams.today': 'Today',
    'exams.tomorrow': 'Tomorrow',
    'exams.daysLeft': '{count} days left',
    'exam.options': 'Options for {name}',
    'exam.remove': 'Delete {name}',

    'topics.toggle': 'Exam topics',
    'topics.add': 'Add topic',
    'topics.addPlaceholder': 'New topic…',
    'topics.firstPlaceholder': 'Write the first topic…',
    'topics.addTo': 'Add a topic to {name}',
    'topics.remove': 'Delete topic {title}',
    'topics.markDone': 'Mark done: {title}',
    'topics.markUndone': 'Mark not done: {title}',
    'topics.doneTitle': 'Mark as done',
    'topics.undoTitle': 'Mark as not done',
    'topics.progress': '{done} of {total}',
    'topics.ready': 'Ready',

    'empty.day': 'This day is still free',
    'empty.dayHint': 'Add a short plan to make the most of your day.',
    'empty.addPlan': 'Add plan',

    'modal.eyebrowExam': 'Exam calendar',
    'modal.eyebrowPlan': 'Weekly plan',
    'modal.examName': 'Exam name',
    'modal.planTitle': 'Plan title',
    'modal.examNamePlaceholder': 'e.g. Maths exam',
    'modal.planTitlePlaceholder': 'e.g. Review chapter three',
    'modal.examDate': 'Exam date',
    'modal.dayOfWeek': 'Day of week',
    'modal.time': 'Time',
    'modal.optional': 'optional',
    'modal.description': 'Notes',
    'modal.examDescriptionPlaceholder': 'Write the details of this exam…',
    'modal.planDescriptionPlaceholder': 'Write the details of this plan…',
    'modal.planSticker': 'Plan sticker',
    'modal.planColor': 'Plan colour',
    'modal.colorOption': 'Choose the colour {color}',

    'datepicker.open': 'Choose a date',
    'datepicker.title': 'Calendar',
    'datepicker.prevMonth': 'Previous month',
    'datepicker.nextMonth': 'Next month',
    'datepicker.prevYear': 'Previous year',
    'datepicker.nextYear': 'Next year',
    'datepicker.chooseMonth': 'Choose month and year',
    'datepicker.today': 'Today',
    'datepicker.weekHeader': 'Days of the week',
    'datepicker.equivalent': 'Same as {date}',

    'sticker.preview': 'Preview',
    'sticker.optional': 'optional',
    'sticker.options': 'Suggested stickers',
    'sticker.choose': 'Choose the sticker {sticker}',
    'sticker.custom': 'Custom emoji',
    'sticker.customPlaceholder': 'Pick or paste one here',
    'sticker.customLabel': 'Custom {label}',
    'sticker.clear': 'Clear',
    'sticker.remove': 'Remove {label}',
    'sticker.hint': 'Pick one of the stickers above or paste your own emoji.',

    'settings.eyebrow': 'Personalisation',
    'settings.title': 'Calendar settings',
    'settings.language': 'Language',
    'settings.languageHint': 'Choose the language of the interface and the calendar.',
    'settings.theme': 'Appearance',
    'settings.themeHint': 'Pick the look that suits your eyes and device.',
    'settings.theme.auto': 'Auto',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.font': 'Text size',
    'settings.fontHint': 'Make the app text smaller or larger.',
    'settings.fontSmaller': 'Make text smaller',
    'settings.fontBigger': 'Make text bigger',
    'settings.data': 'Backup & transfer',
    'settings.dataHint': '{plans} plans and {exams} exams are stored on this device.',
    'settings.export': 'Create backup',
    'settings.import': 'Restore backup',
    'settings.file': 'Choose a backup file',
    'settings.ics': 'Export exams to Google Calendar (ICS)',
    'settings.clear': 'Erase everything',
    'settings.clearHint': 'Every plan and exam on this device is deleted. Take a backup first.',
    'settings.clearStart': 'Erase all data',
    'settings.clearConfirm': 'Yes, erase everything',
    'settings.shortcuts': 'Keyboard shortcuts',
    'settings.shortcutsHint': 'Work faster on a computer.',
    'settings.shortcut.add': 'Add a new item',
    'settings.shortcut.search': 'Search',
    'settings.shortcut.tabs': 'Switch between week and exams',
    'settings.shortcut.close': 'Close dialogs',
    'settings.shortcut.drag': 'Drag a plan by its handle to move it',
    'settings.motion': 'Animations',
    'settings.motionHint': 'Turn off motion effects (helps on low-end phones)',
    'settings.motionOn': 'Motion effects',
    'settings.motionOff': 'Reduced motion',
    'settings.privacy': 'All data stays on your device and is never sent to a server.',

    'toast.planSaved': 'Plan changes saved',
    'toast.planAdded': 'Plan added to your week',
    'toast.planMoved': 'Plan moved',
    'toast.examSaved': 'Exam changes saved',
    'toast.examAdded': 'Exam added to your calendar',
    'toast.planDuplicated': 'A copy of the plan was created',
    'toast.planRemoved': 'Plan deleted',
    'toast.examRemoved': 'Exam deleted',
    'toast.cleared': 'All data was erased',
    'toast.backupReady': 'Backup file is ready',
    'toast.backupFailed': 'This browser could not save the file',
    'toast.icsReady': 'Calendar file for your exams is ready',
    'toast.icsFailed': 'The calendar file could not be created',
    'toast.importEmpty': 'No valid plan or exam was found in this file',
    'toast.importDuplicate': 'Everything in this backup already exists',
    'toast.imported': '{plans} plans and {exams} exams restored',
    'toast.importFailed': 'The backup could not be read — choose a valid JSON file',

    'fatal.title': 'Something went wrong',
    'fatal.desc': 'Your data is safe. Reload the page once. If it keeps happening, clear the incompatible data.',
    'fatal.retry': 'Try again',
    'fatal.reset': 'Erase data',
  },
};

export function getLanguage(id) {
  return languages.find((language) => language.id === id) || languages[0];
}

export function loadLanguage() {
  try {
    const value = localStorage.getItem(LANG_KEY);
    if (languages.some((language) => language.id === value)) return value;
  } catch { /* private mode */ }
  return DEFAULT_LANG;
}

export function saveLanguage(id) {
  try { localStorage.setItem(LANG_KEY, id); } catch { /* private mode */ }
}

/* t('key', { name: 'x' }) — falls back to Persian, then to the key itself. */
export function translator(lang) {
  const dictionary = strings[lang] || strings[DEFAULT_LANG];
  return (key, vars) => {
    let text = dictionary[key] ?? strings[DEFAULT_LANG][key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value ?? ''));
      }
    }
    return text;
  };
}

/* Weekday names for a Saturday-first week, localised through Intl. */
function weekDays(config) {
  const base = Date.UTC(2024, 0, 6); // a Saturday
  const long = new Intl.DateTimeFormat(config.locale, { weekday: 'long', timeZone: 'UTC' });
  const short = new Intl.DateTimeFormat(config.locale, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base + (index * 86400000));
    const name = long.format(date);
    const abbreviation = short.format(date);
    return {
      name,
      short: abbreviation,
      chip: config.id === 'fa' ? name.slice(0, 1) : abbreviation.slice(0, 2),
      index,
    };
  });
}

/* Numbers, dates and calendar names in the active language. */
export function createFormat(lang) {
  const config = getLanguage(lang);
  const intlLocale = `${config.locale}-u-ca-${config.calendar}-nu-${config.numbering}`;
  const plainLocale = `${config.locale}-u-nu-${config.numbering}`;
  const numberFormat = new Intl.NumberFormat(plainLocale);
  const days = weekDays(config);

  const dateFormat = (options) => {
    try { return new Intl.DateTimeFormat(intlLocale, options); } catch {
      try { return new Intl.DateTimeFormat(config.locale, options); } catch { return null; }
    }
  };

  const formatDate = (date, options) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const formatter = dateFormat(options);
    if (!formatter) return date.toLocaleDateString();
    try { return formatter.format(date); } catch { return date.toLocaleDateString(); }
  };

  return {
    lang: config.id,
    dir: config.dir,
    calendar: config.calendar,
    locale: config.locale,
    days,
    num: (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return String(value ?? '');
      try { return numberFormat.format(numeric); } catch { return String(numeric); }
    },
    /* Persian digits for fa; unchanged for every other language. */
    digits: (value) => (config.id === 'fa'
      ? String(value ?? '').replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
      : String(value ?? '')),
    fullDate: (date) => formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' }),
    shortDate: (date) => formatDate(date, { month: 'short', day: 'numeric' }),
    longDate: (date) => formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }),
    dayNumber: (date) => formatDate(date, { day: 'numeric' }),
    monthName: (date) => formatDate(date, { month: 'long' }),
    /* Month names of the active calendar (1..12), used by the date picker. */
    monthNames: () => Array.from({ length: 12 }, (_, index) => {
      const parts = toCalendarParts(new Date(), config.calendar) || { year: 1400, month: 1, day: 1 };
      const date = fromCalendarParts(parts.year, index + 1, 1, config.calendar);
      return formatDate(date, { month: 'long' });
    }),
    /* "آبان ۱۴۰۵" / "October 2026" — month first, the way it reads in Persian. */
    monthTitle: (year, month) => {
      const date = fromCalendarParts(year, month, 1, config.calendar);
      const name = formatDate(date, { month: 'long' });
      const digits = (value) => (config.id === 'fa'
        ? String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
        : String(value));
      return `${name} ${digits(year)}`;
    },
    /* The same day written in the *other* calendar — handy next to the picker. */
    otherCalendarDate: (() => {
      const other = config.calendar === 'persian' ? 'gregory' : 'persian';
      let formatter = null;
      try {
        formatter = new Intl.DateTimeFormat(
          `${config.locale}-u-ca-${other}-nu-${config.numbering}`,
          { year: 'numeric', month: 'long', day: 'numeric' },
        );
      } catch { formatter = null; }
      return (date) => {
        if (!formatter || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        try { return formatter.format(date); } catch { return ''; }
      };
    })(),
  };
}
